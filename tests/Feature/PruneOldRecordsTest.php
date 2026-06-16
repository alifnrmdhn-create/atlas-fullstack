<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci prune retensi (scale-readiness S3.1): record lewat retensi dihapus,
 * record relevan/recent TETAP. Retensi default: notif 90h (read/dismiss/expired),
 * sesi 60h (ditutup), status-log 365h. Assertion berbasis marker (message/note)
 * supaya tahan terhadap record sampingan yang dibuat fixture.
 */
class PruneOldRecordsTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_prunes_old_keeps_recent(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-P', 'DIV-P');
        $admin = $this->makeUser('prune-admin', 'SUPERADMIN', $unit->id, $dir->id);
        $uid = $admin->id;
        $taskId = $this->seedProgramStack($admin, 'P')['task'];

        // ── Notification ── (kolom seragam — Postgres bulk insert wajib lebar sama)
        $notif = fn (array $o) => array_merge(
            ['userId' => $uid, 'type' => 'X', 'source' => 's', 'expiresAt' => null],
            $o,
        );
        DB::table('Notification')->insert([
            $notif(['message' => 'pruneT-old-read', 'state' => 'READ', 'createdAt' => now()->subDays(120)]),     // HAPUS
            $notif(['message' => 'pruneT-old-unread', 'state' => 'UNREAD', 'createdAt' => now()->subDays(120)]), // SIMPAN (belum dibaca)
            $notif(['message' => 'pruneT-recent-read', 'state' => 'READ', 'createdAt' => now()->subDays(5)]),    // SIMPAN
            $notif(['message' => 'pruneT-expired', 'state' => 'UNREAD', 'expiresAt' => now()->subDay(), 'createdAt' => now()->subDays(2)]), // HAPUS
        ]);

        // ── UserSession ──
        DB::table('UserSession')->insert([
            ['userId' => $uid, 'startedAt' => now()->subDays(90), 'endedAt' => now()->subDays(80)], // HAPUS
            ['userId' => $uid, 'startedAt' => now()->subDays(5), 'endedAt' => now()->subDays(5)],    // SIMPAN
            ['userId' => $uid, 'startedAt' => now()->subDays(90), 'endedAt' => null],                // SIMPAN (terbuka)
        ]);

        // ── WorkItemStatusLog ── (workItemId nyata utk FK)
        DB::table('WorkItemStatusLog')->insert([
            ['workItemId' => $taskId, 'fromStatus' => 'A', 'toStatus' => 'B', 'byUserId' => $uid, 'note' => 'pruneT-old', 'createdAt' => now()->subDays(400)],  // HAPUS
            ['workItemId' => $taskId, 'fromStatus' => 'A', 'toStatus' => 'B', 'byUserId' => $uid, 'note' => 'pruneT-keep', 'createdAt' => now()->subDays(10)],   // SIMPAN
        ]);

        $this->artisan('atlas:prune-old-records')->assertSuccessful();

        // Notification (marker-based)
        $this->assertSame(0, DB::table('Notification')->where('message', 'pruneT-old-read')->count());
        $this->assertSame(0, DB::table('Notification')->where('message', 'pruneT-expired')->count());
        $this->assertSame(1, DB::table('Notification')->where('message', 'pruneT-old-unread')->count());
        $this->assertSame(1, DB::table('Notification')->where('message', 'pruneT-recent-read')->count());

        // UserSession: yang ditutup-tua hilang, sisanya tetap
        $this->assertSame(2, DB::table('UserSession')->where('userId', $uid)->count());
        $this->assertSame(1, DB::table('UserSession')->where('userId', $uid)->whereNull('endedAt')->count());

        // WorkItemStatusLog (marker-based)
        $this->assertSame(0, DB::table('WorkItemStatusLog')->where('note', 'pruneT-old')->count());
        $this->assertSame(1, DB::table('WorkItemStatusLog')->where('note', 'pruneT-keep')->count());
    }

    public function test_dry_run_deletes_nothing(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-Q', 'DIV-Q');
        $user = $this->makeUser('dry-user', 'OFFICER', $unit->id, $dir->id);

        DB::table('Notification')->insert([
            'userId' => $user->id, 'type' => 'X', 'message' => 'dryT-old', 'source' => 's',
            'state' => 'READ', 'createdAt' => now()->subDays(200),
        ]);

        $this->artisan('atlas:prune-old-records --dry-run')->assertSuccessful();
        $this->assertSame(1, DB::table('Notification')->where('message', 'dryT-old')->count(), 'Dry-run tak boleh menghapus.');
    }
}
