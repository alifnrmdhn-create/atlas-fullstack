<?php

namespace Tests\Feature;

use App\Models\Blocker;
use App\Models\FocusDisposition;
use App\Models\Notification;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci endpoint disposition Focus (POST /focus/dispositions) — penutup loop
 * tindak lanjut item "Needs Action" di Focus.
 *
 *   - SUPPORTED butuh note (dikirim sebagai notifikasi ke PIC/owner program)
 *   - HANDLED merekam dismissal tanpa note
 *   - Hanya pemegang scope unit program (atau eksekutif) yang boleh men-disposition
 *   - Disposition aktif menyembunyikan item dari needsAction (per program+tag)
 */
class FocusDispositionTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $adminA;
    private User $kadivA;
    private User $kadivB;
    private int $programA;
    private int $unitAId;
    /** @var array{program:int,workstream:int,task:int,phase:int,blocker:int} */
    private array $stackA;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $this->adminA = $this->makeUser('admin-a', 'SUPERADMIN', $unitA->id, $dirA->id);
        $this->kadivA = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->kadivB = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);
        $this->unitAId = $unitA->id;

        $this->stackA = $this->seedProgramStack($this->adminA, 'A');
        $this->programA = $this->stackA['program'];

        // Program harus ber-ownerUnitId agar scope unit (coversUnit) resolvable
        // untuk KADIV-A; admin seed tak selalu mengisinya.
        Program::whereKey($this->programA)->update(['ownerUnitId' => $unitA->id]);
    }

    /**
     * Jadikan programA item "approval" di needsAction milik kadivA: PENDING_KADIV,
     * di-submit/di-own admin (bukan kadivA). Blocker seed di-resolve supaya item
     * approval berdiri sendiri tanpa noise tag blocker.
     */
    private function makeApprovalNeedsActionItem(): void
    {
        Program::whereKey($this->programA)->update([
            'approvalStatus' => 'PENDING_KADIV',
            'submittedById'  => $this->adminA->id,
            'ownerId'        => $this->adminA->id,
        ]);
        Blocker::whereKey($this->stackA['blocker'])->update(['status' => 'RESOLVED', 'resolvedAt' => now()]);
    }

    /** @return list<int> id program di needsAction untuk $user (summary di-fetch ULANG). */
    private function needsActionProgramIds(User $user): array
    {
        return collect(
            $this->actingAs($user)->getJson('/organization/program-summary')->json('needsAction')
        )->pluck('id')->all();
    }

    private function disposeApproval(): void
    {
        $this->actingAs($this->kadivA)->postJson('/focus/dispositions', [
            'programId' => $this->programA, 'tag' => 'approval', 'action' => 'HANDLED',
        ])->assertCreated();
    }

    public function test_support_requires_a_note(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'blocker',
                'action' => 'SUPPORTED',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('note');

        $this->assertDatabaseCount('FocusDisposition', 0);
    }

    public function test_support_records_disposition_and_notifies_owner(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'blocker',
                'action' => 'SUPPORTED',
                'note' => 'Koordinasikan dengan tim teknis minggu ini.',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('FocusDisposition', [
            'userId' => $this->kadivA->id,
            'programId' => $this->programA,
            'tag' => 'blocker',
            'action' => 'SUPPORTED',
        ]);

        // Owner program (admin seed) menerima notifikasi arahan.
        $this->assertDatabaseHas('Notification', [
            'type' => 'FOCUS_SUPPORT',
            'source' => "program:{$this->programA}",
        ]);
    }

    public function test_handled_records_dismissal_without_note(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'support',
                'action' => 'HANDLED',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('FocusDisposition', [
            'programId' => $this->programA,
            'tag' => 'support',
            'action' => 'HANDLED',
        ]);
        $this->assertSame(0, Notification::where('type', 'FOCUS_SUPPORT')->count());
    }

    public function test_repeated_disposition_upserts_not_duplicates(): void
    {
        $payload = ['programId' => $this->programA, 'tag' => 'blocker', 'action' => 'HANDLED'];

        $this->actingAs($this->kadivA)->postJson('/focus/dispositions', $payload)->assertCreated();
        $this->actingAs($this->kadivA)->postJson('/focus/dispositions', [...$payload, 'note' => 'updated'])->assertCreated();

        $this->assertSame(1, FocusDisposition::where('userId', $this->kadivA->id)
            ->where('programId', $this->programA)->where('tag', 'blocker')->count());
    }

    public function test_out_of_scope_program_is_forbidden(): void
    {
        $this->actingAs($this->kadivB)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'blocker',
                'action' => 'HANDLED',
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('FocusDisposition', 0);
    }

    /**
     * Bug yang dilaporkan ("sudah dikirim dukungan, item tetap muncul"): payload
     * program-summary di-cache per-user 3 menit. Tanpa bust cache di controller
     * disposition, fetch ulang sesudah aksi mengembalikan payload basi yang MASIH
     * memuat item. Test ini mengunci: fetch ulang langsung mengeluarkan item.
     */
    public function test_disposition_hides_item_from_a_freshly_fetched_summary(): void
    {
        $this->makeApprovalNeedsActionItem();

        // Cache terisi oleh fetch pertama, lalu item harus tampil.
        $this->assertContains($this->programA, $this->needsActionProgramIds($this->kadivA));

        $this->disposeApproval();

        // Fetch ULANG (store array di test persist antar-request) — tanpa bust
        // cache, baris ini akan gagal karena payload basi.
        $this->assertNotContains($this->programA, $this->needsActionProgramIds($this->kadivA));
    }

    /**
     * Re-nudge: lewat mute window item muncul lagi (disengaja). Saat itu
     * di-disposition LAGI, window harus mulai ulang. Filter lama pakai `createdAt`
     * (beku di updateOrCreate) → aksi kedua tak pernah diakui → atasan re-handle
     * tanpa henti. Fix: filter `updatedAt` + touch() tiap disposition.
     */
    public function test_re_disposition_after_mute_window_hides_item_again(): void
    {
        $this->makeApprovalNeedsActionItem();

        Carbon::setTestNow('2026-06-01 09:00:00');
        $this->disposeApproval();
        $this->assertNotContains($this->programA, $this->needsActionProgramIds($this->kadivA));

        // Lewat 7 hari → item re-nudge.
        Carbon::setTestNow('2026-06-10 09:00:00');
        $this->assertContains($this->programA, $this->needsActionProgramIds($this->kadivA));

        // Disposition lagi → harus mute ulang (regresi createdAt-vs-updatedAt).
        $this->disposeApproval();
        $this->assertNotContains($this->programA, $this->needsActionProgramIds($this->kadivA));

        Carbon::setTestNow();
    }

    /**
     * needsAction dedup per-program (`unique('id')`), tapi disposition di-record
     * per (program, tag) pada tag yang TAMPIL. Jika sebuah program punya >1 sinyal
     * (approval + blocker), men-disposition tag yang tampil TIDAK boleh memunculkan
     * program di bawah tag sibling. Regresi: `unique` harus jalan sebelum `reject`.
     */
    public function test_dispositioning_visible_tag_does_not_resurface_under_sibling_tag(): void
    {
        $this->makeApprovalNeedsActionItem();

        // Tambah blocker kritis di unit yang sama → program punya sinyal approval
        // (tampil) DAN blocker (tersembunyi oleh dedup).
        Blocker::create([
            'code'            => 'BLK-SIB01',
            'workItemId'      => $this->stackA['task'],
            'title'           => 'Critical sibling signal',
            'severity'        => 'CRITICAL',
            'status'          => 'OPEN',
            'priority'        => 'HIGH',
            'createdBy'       => $this->adminA->id,
            'createdByUnitId' => $this->unitAId,
        ]);

        $this->assertContains($this->programA, $this->needsActionProgramIds($this->kadivA));

        // Disposition tag yang tampil (approval) → program hilang sepenuhnya,
        // tidak boleh muncul lagi di bawah tag blocker.
        $this->disposeApproval();

        $this->assertNotContains($this->programA, $this->needsActionProgramIds($this->kadivA));
    }
}
