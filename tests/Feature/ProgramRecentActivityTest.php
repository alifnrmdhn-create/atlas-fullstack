<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci perbaikan "AKTIVITAS TERBARU belum real" (2026-06-27).
 *
 * SEBELUMNYA feed dikarang dari Program.updatedAt ("X updated", semua bertimestamp
 * seed yang identik, tanpa aktor). Sekarang di-agregasi dari log audit nyata
 * (ProgramApprovalLog/WorkItemStatusLog/ProgramProgressLog/Blocker/EscalationRequest)
 * sehingga tiap item membawa SIAPA (actorName) - APA (action+subject) - KAPAN.
 *
 * Test menjamin: (a) feed berasal dari event riil (blocker yang dibuat muncul
 * dengan aktor), dan (b) TIDAK ADA lagi item sintetik "… updated" tanpa aktor.
 */
class ProgramRecentActivityTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_recent_activity_is_real_event_with_actor_not_synthetic(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-ACT', 'DIV-ACT');
        $admin = $this->makeUser('admin-act', 'SUPERADMIN', $unit->id, $dir->id);
        // seedProgramStack membuat Blocker riil (oleh admin) → event sungguhan.
        $this->seedProgramStack($admin, 'ACT');

        $activity = collect($this->actingAs($admin)
            ->getJson('/organization/program-summary')
            ->assertOk()
            ->json('recentActivity'));

        $this->assertNotEmpty($activity, 'Feed harus berisi event riil (blocker yang dibuat).');

        // (a) Event blocker nyata hadir, dengan aktor dan tertaut entityType PROGRAM.
        $blocker = $activity->firstWhere('action', 'BLOCKER_ADDED');
        $this->assertNotNull($blocker, 'Blocker yang baru dibuat harus muncul di feed.');
        $this->assertSame('admin-act', $blocker['actorName'], 'Item harus membawa aktor sungguhan.');
        $this->assertSame('PROGRAM', $blocker['entityType']);
        $this->assertArrayHasKey('subject', $blocker);

        // (b) Tak ada lagi item sintetik lama "… updated" (penanda feed palsu).
        foreach ($activity as $item) {
            $desc = $item['description'] ?? '';
            $this->assertStringNotContainsString(' updated', $desc,
                'Feed tak boleh lagi memuat deskripsi sintetik "… updated".');
            // Item baru memakai action+actorName+subject, bukan description bebas.
            $this->assertArrayHasKey('action', $item);
            $this->assertArrayHasKey('changeTimestamp', $item);
        }
    }
}
