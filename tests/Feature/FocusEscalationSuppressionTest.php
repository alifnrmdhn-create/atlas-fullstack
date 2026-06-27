<?php

namespace Tests\Feature;

use App\Models\EscalationRequest;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci alur "needs escalation" di Focus (keluhan user Jun 2026: sistem menyuruh
 * meng-eskalasi blocker yang SUDAH dieskalasi — loop melingkar, plus blocker yang
 * sama berteriak di banyak surface).
 *
 * Invariant yang dijaga:
 *   1. Item needsAction tag=blocker membawa `blockerId` + flag `isOwner`.
 *   2. Begitu ada escalation AKTIF atas blocker/program itu, item HILANG dari
 *      needsAction (rumahnya pindah ke tracker "Escalations I Raised").
 *   3. Escalation terminal (CLEARED/DECLINED) TIDAK menekan — item muncul lagi.
 *   4. Feed Focus "NOW" (myWork.blockers) ikut menekan blocker yang sudah dieskalasi
 *      → tidak ada duplikasi satu-masalah-dua-teriakan.
 *   5. "Give support to the PIC" ditolak (422) saat user ADALAH owner program
 *      (dulu silent no-op: note nguap tanpa terkirim ke siapa pun).
 */
class FocusEscalationSuppressionTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $admin;     // owner program (seeder)
    private User $kadiv;     // atasan se-unit, BUKAN owner
    private User $kadivB;    // target escalation (unit lain)
    private int $programId;
    private int $blockerId;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $this->admin  = $this->makeUser('admin-a', 'SUPERADMIN', $unitA->id, $dirA->id);
        $this->kadiv  = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->kadivB = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);

        $stack = $this->seedProgramStack($this->admin, 'A');
        $this->programId = $stack['program'];
        $this->blockerId = $stack['blocker'];

        // ownerUnitId wajib agar scope unit (coversUnit) resolvable untuk KADIV.
        Program::whereKey($this->programId)->update(['ownerUnitId' => $unitA->id]);
    }

    /** needsAction segar (bust cache 3-menit dulu) untuk $user. */
    private function needsAction(User $user): Collection
    {
        Cache::forget("program_summary:user:{$user->id}");
        return collect($this->actingAs($user)->getJson('/organization/program-summary')->json('needsAction'));
    }

    private function nowBlockerIds(User $user): array
    {
        return collect($this->actingAs($user)->getJson('/my-work')->json('data.blockers'))
            ->pluck('id')->all();
    }

    private function makeEscalation(string $sourceType, ?int $sourceId, ?int $linkedProgramId, string $status): EscalationRequest
    {
        return EscalationRequest::create([
            'code'            => EscalationRequest::generateCode(),
            'sourceType'      => $sourceType,
            'sourceId'        => $sourceId,
            'title'           => 'Percepatan reviu legal',
            'linkedProgramId' => $linkedProgramId,
            'requestedById'   => $this->kadiv->id,
            'requestedAt'     => now(),
            'escalatedToId'   => $this->kadivB->id,
            'status'          => $status,
        ]);
    }

    private function blockerItem(Collection $needsAction): ?array
    {
        return $needsAction->firstWhere(fn ($i) => $i['id'] === $this->programId && $i['tag'] === 'blocker');
    }

    public function test_blocker_item_carries_blocker_id_and_owner_flag(): void
    {
        $item = $this->blockerItem($this->needsAction($this->kadiv));

        $this->assertNotNull($item, 'Critical blocker should surface as a needsAction item.');
        $this->assertSame($this->blockerId, $item['blockerId']);
        $this->assertFalse($item['isOwner'], 'kadiv is not the program owner.');

        // Owner (admin) melihat item yang sama dengan isOwner=true.
        $ownerItem = $this->blockerItem($this->needsAction($this->admin));
        $this->assertNotNull($ownerItem);
        $this->assertTrue($ownerItem['isOwner']);
    }

    public function test_active_blocker_sourced_escalation_suppresses_item(): void
    {
        $this->makeEscalation('BLOCKER', $this->blockerId, $this->programId, 'REQUESTED');

        $this->assertNull(
            $this->blockerItem($this->needsAction($this->kadiv)),
            'An open escalation on the blocker must remove the "needs escalation" nag.'
        );
    }

    public function test_program_linked_adhoc_escalation_suppresses_item(): void
    {
        // Jalur AD_HOC lama (sourceId blocker tak tersimpan) — kompat data demo.
        $this->makeEscalation('AD_HOC', null, $this->programId, 'REQUESTED');

        $this->assertNull(
            $this->blockerItem($this->needsAction($this->kadiv)),
            'An open AD_HOC escalation linked to the program also suppresses.'
        );
    }

    public function test_cleared_escalation_does_not_suppress(): void
    {
        $esc = $this->makeEscalation('BLOCKER', $this->blockerId, $this->programId, 'REQUESTED');
        $this->assertNull($this->blockerItem($this->needsAction($this->kadiv)));

        $esc->update(['status' => 'CLEARED']);

        $this->assertNotNull(
            $this->blockerItem($this->needsAction($this->kadiv)),
            'A cleared escalation must let the item resurface if the blocker is still open.'
        );
    }

    public function test_now_feed_suppresses_escalated_blocker(): void
    {
        // Blocker seed dibuat oleh admin → muncul di NOW feed admin (createdBy).
        $this->assertContains($this->blockerId, $this->nowBlockerIds($this->admin));

        $this->makeEscalation('BLOCKER', $this->blockerId, $this->programId, 'REQUESTED');

        $this->assertNotContains(
            $this->blockerId,
            $this->nowBlockerIds($this->admin),
            'NOW feed must not re-scream a blocker already in the escalation pipeline.'
        );
    }

    /**
     * Konsolidasi FocusSignalService: aturan "live" (program tak diarsipkan) kini
     * dipegang satu tempat & dipakai KEDUA feed. Dulu needsAction lupa filter
     * archived (NOW menerapkannya) → blocker program ter-arsip muncul di satu feed
     * tapi tidak di feed lain. Lock: archived → hilang dari KEDUANYA.
     */
    public function test_archived_program_blocker_hidden_from_both_feeds(): void
    {
        $this->assertNotNull($this->blockerItem($this->needsAction($this->kadiv)));
        $this->assertContains($this->blockerId, $this->nowBlockerIds($this->admin));

        Program::whereKey($this->programId)->update(['archivedAt' => now()]);

        $this->assertNull(
            $this->blockerItem($this->needsAction($this->kadiv)),
            'Archived program blocker must not surface in needsAction.'
        );
        $this->assertNotContains(
            $this->blockerId,
            $this->nowBlockerIds($this->admin),
            'Archived program blocker must not surface in NOW feed.'
        );
    }

    public function test_support_disposition_rejected_when_user_is_owner(): void
    {
        // admin = owner program → "Give support to the PIC" tak berlaku (kirim ke
        // diri sendiri). Dulu silent no-op; kini ditolak eksplisit.
        $this->actingAs($this->admin)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programId,
                'tag'       => 'blocker',
                'action'    => 'SUPPORTED',
                'note'      => 'Arahan untuk diri sendiri (seharusnya ditolak).',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('action');

        $this->assertDatabaseCount('FocusDisposition', 0);
    }

    public function test_support_still_works_for_non_owner_supervisor(): void
    {
        // kadiv (bukan owner) tetap bisa kirim dukungan ke owner (admin).
        $this->actingAs($this->kadiv)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programId,
                'tag'       => 'blocker',
                'action'    => 'SUPPORTED',
                'note'      => 'Koordinasikan dengan biro hukum minggu ini.',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('Notification', [
            'type'   => 'FOCUS_SUPPORT',
            'userId' => $this->admin->id,
            'source' => "program:{$this->programId}",
        ]);
    }
}
