<?php

namespace Tests\Concerns;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Fixture organisasi bersama untuk feature test (audit 2026-06-10 Task 2.6).
 *
 * Sebelumnya blok Directorate→Unit→User (+stack Program→Workstream→Task→
 * Phase→Blocker via HTTP) di-copy-paste nyaris identik di 6+ file test —
 * satu perubahan skema User/Position berarti edit massal. Helper di sini
 * adalah superset dari semua varian yang ada:
 *   - makeUser menerima managerUserId opsional (dipakai test rantai approval).
 *   - seedProgramStack menyertakan Phase (varian terlengkap).
 * File test lain yang masih punya helper lokal berbeda dimigrasi oportunistik
 * saat di-touch (konvensi proyek), jangan big-bang.
 */
trait BuildsOrgFixtures
{
    /** @return array{0: Directorate, 1: OrganizationalUnit} */
    private function makeDirectorate(string $dirCode, string $unitCode): array
    {
        $dir = Directorate::create(['code' => $dirCode, 'name' => "Direktorat {$dirCode}", 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => $unitCode, 'name' => "Divisi {$unitCode}", 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);

        return [$dir, $unit];
    }

    private function makeUser(string $slug, string $role, int $unitId, int $directorateId, ?int $managerUserId = null): User
    {
        return User::create([
            'name'          => $slug,
            'email'         => "{$slug}@ptpn.test",
            'userId'        => $slug,
            'passwordHash'  => Hash::make('password'),
            'roleType'      => $role,
            'isActive'      => true,
            'unitId'        => $unitId,
            'directorateId' => $directorateId,
            'managerUserId' => $managerUserId,
        ]);
    }

    /**
     * Buat Program→Workstream→Task→Phase→Blocker via HTTP sebagai admin —
     * jalur API riil supaya side-effect (entity_pics, scope) ikut terbentuk.
     *
     * @return array{program: int, workstream: int, task: int, phase: int, blocker: int}
     */
    private function seedProgramStack(User $admin, string $tag): array
    {
        $this->actingAs($admin);

        $programId = $this->postJson('/programs', [
            'code' => "PRG-{$tag}",
            'name' => "Program {$tag}",
            'description' => "Seed program {$tag}.",
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonth()->toDateString(),
            'ownerId' => $admin->id,
            'hasNoApmsKpi' => true,
        ])->assertCreated()->json('data.id');

        $workstreamId = $this->postJson('/workstreams', [
            'programId' => $programId,
            'name' => "Workstream {$tag}",
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $admin->id,
        ])->assertCreated()->json('data.id');

        $taskId = $this->postJson('/tasks', [
            'title' => "Task {$tag}",
            'workstreamId' => $workstreamId,
            'targetCompletion' => now()->addWeek()->toDateString(),
            'priority' => 'MEDIUM',
        ])->assertCreated()->json('data.id');

        $phaseId = $this->postJson("/workstreams/{$workstreamId}/phases", [
            'name' => "Phase {$tag}",
            'description' => "Seed phase {$tag}.",
            'status' => 'PLANNING',
        ])->assertCreated()->json('data.id');

        $blockerId = $this->postJson('/blockers', [
            'taskId' => $taskId,
            'title' => "Blocker {$tag}",
            'severity' => 'HIGH',
        ])->assertCreated()->json('data.id');

        return [
            'program' => $programId,
            'workstream' => $workstreamId,
            'task' => $taskId,
            'phase' => $phaseId,
            'blocker' => $blockerId,
        ];
    }
}
