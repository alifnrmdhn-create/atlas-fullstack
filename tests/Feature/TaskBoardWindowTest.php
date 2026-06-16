<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci window completed Workboard (scale-readiness S2.2): GET /tasks default
 * tidak memuat COMPLETED/CANCELLED yang selesai lebih lama dari window (cap
 * pertumbuhan endpoint terpanas), TAPI kerja aktif & capaian terkini selalu
 * dimuat, dan ?scope=all mengembalikan histori penuh (nol data hilang permanen).
 */
class TaskBoardWindowTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_old_completed_hidden_by_default_visible_with_scope_all(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-W', 'DIV-W');
        $admin = $this->makeUser('board-admin', 'SUPERADMIN', $unit->id, $dir->id);
        $stack = $this->seedProgramStack($admin, 'W');
        $wsId = $stack['workstream'];

        $activeId = $this->makeTask($wsId, $admin->id, 'WI-ACTIVE', 'IN_PROGRESS', null);
        $recentDoneId = $this->makeTask($wsId, $admin->id, 'WI-RECENT', 'COMPLETED', now()->subDays(10));
        $oldDoneId = $this->makeTask($wsId, $admin->id, 'WI-OLD', 'COMPLETED', now()->subDays(200));

        // Default: aktif + recent-completed ADA, old-completed TIDAK
        $default = $this->idsFrom($this->actingAs($admin)->getJson('/tasks'));
        $this->assertContains($activeId, $default, 'Task aktif harus selalu ada.');
        $this->assertContains($recentDoneId, $default, 'Completed terkini (<window) harus ada.');
        $this->assertNotContains($oldDoneId, $default, 'Completed lama (>window) tidak dimuat default.');

        // scope=all: SEMUA termasuk old-completed
        $all = $this->idsFrom($this->actingAs($admin)->getJson('/tasks?scope=all'));
        $this->assertContains($oldDoneId, $all, 'scope=all harus memuat histori penuh.');
        $this->assertContains($activeId, $all);
    }

    /** @return array<int,int> id task dari respons groups */
    private function idsFrom($response): array
    {
        return collect($response->assertOk()->json('groups.*.items.*.id'))->flatten()->all();
    }

    private function makeTask(int $wsId, int $userId, string $code, string $status, ?\Illuminate\Support\Carbon $completedAt): int
    {
        return (int) DB::table('WorkItem')->insertGetId([
            'code' => $code,
            'initiativeId' => $wsId,
            'title' => "Task {$code}",
            'status' => $status,
            'priority' => 'MEDIUM',
            'percentComplete' => $status === 'COMPLETED' ? 100 : 30,
            'assignedTo' => $userId,
            'createdBy' => $userId,
            'targetCompletion' => now()->subDays(5),
            'actualCompletion' => $completedAt,
            'healthStatus' => 'GREEN',
            'isBlocked' => false,
            'createdAt' => now()->subDays(210),
            'updatedAt' => now(),
        ]);
    }
}
