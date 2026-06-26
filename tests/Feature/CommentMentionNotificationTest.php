<?php

namespace Tests\Feature;

use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Regresi (2026-06-26): @mention di komentar task dulu kosmetik total —
 * FE tak pernah mengirim ID mention DAN CommentController::store tak pernah
 * membuat Notification (hanya Channels yang notify). Test ini mengunci:
 *   - mention me-fan-out Notification MENTION dengan source deep-link task:{id};
 *   - author yang me-mention dirinya sendiri tidak dapat notifikasi;
 *   - guard scope: user di luar unit pemilik entity tidak menerima fan-out
 *     (anti-spam ke sembarang userId).
 * Plus: blocker store meng-generate code otomatis (mengabaikan code dari client)
 * dan menyimpan assignedTo (dulu di-drop senyap).
 */
class CommentMentionNotificationTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_comment_mention_notifies_in_scope_users_only(): void
    {
        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $owner = $this->makeUser('owner-mention', 'KASUBDIV', $unitA->id, $dirA->id);
        $teammate = $this->makeUser('teammate-mention', 'OFFICER', $unitA->id, $dirA->id);
        $outsider = $this->makeUser('outsider-mention', 'KASUBDIV', $unitB->id, $dirB->id);

        $stack = $this->seedProgramStack($owner, 'MEN');
        $taskId = $stack['task'];

        $this->actingAs($owner)
            ->postJson("/tasks/{$taskId}/comments", [
                'commentText' => "@{$teammate->name} @{$outsider->name} @{$owner->name} tolong cek",
                'mentions' => [$teammate->id, $outsider->id, $owner->id],
            ])
            ->assertSuccessful();

        // Teammate (se-unit dgn pemilik program) dapat notifikasi MENTION.
        $teammateNotif = Notification::where('userId', $teammate->id)->where('type', 'MENTION')->first();
        $this->assertNotNull($teammateNotif, 'Teammate se-unit harus menerima notifikasi mention.');
        $this->assertStringContainsString("task:{$taskId}", (string) $teammateNotif->source);
        $this->assertStringContainsString($owner->name, (string) $teammateNotif->message);

        // Author tak boleh men-notifikasi diri sendiri.
        $this->assertSame(0, Notification::where('userId', $owner->id)->where('type', 'MENTION')->count());

        // Guard scope: outsider lintas-direktorat TIDAK menerima fan-out.
        $this->assertSame(0, Notification::where('userId', $outsider->id)->where('type', 'MENTION')->count());
    }

    public function test_blocker_store_autogenerates_code_and_persists_assignee(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-C', 'DIV-C');
        $owner = $this->makeUser('owner-blk', 'KASUBDIV', $unit->id, $dir->id);
        $assignee = $this->makeUser('assignee-blk', 'OFFICER', $unit->id, $dir->id);

        $stack = $this->seedProgramStack($owner, 'BLK2');
        $taskId = $stack['task'];

        $res = $this->actingAs($owner)
            ->postJson('/blockers', [
                'taskId' => $taskId,
                'title' => 'Menunggu data dari unit lain',
                'severity' => 'HIGH',
                // Client mengirim code manual — HARUS diabaikan & di-generate ulang.
                'code' => 'BLK-CLIENTFAKE',
                'assignedTo' => $assignee->id,
            ])
            ->assertCreated();

        $code = $res->json('data.code');
        $this->assertStringStartsWith('BLK-', (string) $code);
        $this->assertNotSame('BLK-CLIENTFAKE', $code, 'Code dari client tidak boleh dipakai.');
        $this->assertSame($assignee->id, $res->json('data.assignedTo'), 'assignedTo dari form create harus tersimpan.');
    }
}
