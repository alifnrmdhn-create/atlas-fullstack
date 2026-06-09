<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Mengunci perbaikan klaster otorisasi/scope Workboard (audit 2026-06-09):
 *   C1 — GET /tasks ter-scope per direktorat (tidak bocor lintas-direktorat)
 *   H1 — POST/DELETE /programs/{id}/kpi-links di-gate assertAccess
 *   H2 — POST /tasks tidak bisa membuat task di program direktorat lain
 *   H3 — mutasi Phase (store/update/destroy) ter-scope
 *   H4 — GET /tasks/{id} & /status-log tidak bisa baca task direktorat lain
 *   H5 — mutasi Blocker (store/updateStatus/destroy) ter-scope
 *
 * Pola: dua direktorat terpisah (A & B), masing-masing punya admin (executive,
 * untuk seed) + KADIV (scoped ke direktoratnya). KADIV-A tidak boleh menyentuh
 * apa pun milik direktorat B; tetapi tetap penuh akses di direktorat A sendiri.
 */
class WorkboardAuthScopeTest extends TestCase
{
    use RefreshDatabase;

    private User $adminA;
    private User $kadivA;
    private User $kadivB;

    /** @var array<string,int> */
    private array $a;
    /** @var array<string,int> */
    private array $b;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $this->adminA = $this->makeUser('admin-a', 'SUPERADMIN', $unitA->id, $dirA->id);
        $this->kadivA = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->kadivB = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);

        $adminB = $this->makeUser('admin-b', 'SUPERADMIN', $unitB->id, $dirB->id);

        $this->a = $this->seedProgramStack($this->adminA, 'A');
        $this->b = $this->seedProgramStack($adminB, 'B');
    }

    // ── C1 — Workboard index scope ──────────────────────────────────────────

    public function test_workboard_index_is_scoped_to_own_directorate(): void
    {
        $ids = $this->actingAs($this->kadivA)->getJson('/tasks')->assertOk()->json('data.*.id');

        $this->assertContains($this->a['task'], $ids, 'KADIV harus melihat task direktoratnya sendiri.');
        $this->assertNotContains($this->b['task'], $ids, 'KADIV TIDAK boleh melihat task direktorat lain.');
    }

    public function test_workboard_index_executive_sees_all_directorates(): void
    {
        $ids = $this->actingAs($this->adminA)->getJson('/tasks')->assertOk()->json('data.*.id');

        $this->assertContains($this->a['task'], $ids);
        $this->assertContains($this->b['task'], $ids, 'Executive (SUPERADMIN) harus tetap melihat lintas-direktorat.');
    }

    // ── H4 — show / status-log ──────────────────────────────────────────────

    public function test_task_show_blocks_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)->getJson("/tasks/{$this->b['task']}")->assertForbidden();
        $this->actingAs($this->kadivB)->getJson("/tasks/{$this->b['task']}")->assertOk();
        $this->actingAs($this->kadivA)->getJson("/tasks/{$this->a['task']}")->assertOk();
    }

    public function test_task_status_log_blocks_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)->getJson("/tasks/{$this->b['task']}/status-log")->assertForbidden();
        $this->actingAs($this->kadivA)->getJson("/tasks/{$this->a['task']}/status-log")->assertOk();
    }

    // ── H2 — task store ─────────────────────────────────────────────────────

    public function test_task_store_blocks_cross_directorate(): void
    {
        $payload = fn (int $wsId) => [
            'title' => 'Injected task',
            'workstreamId' => $wsId,
            'targetCompletion' => now()->addWeek()->toDateString(),
            'priority' => 'MEDIUM',
        ];

        $this->actingAs($this->kadivA)->postJson('/tasks', $payload($this->b['workstream']))->assertForbidden();
        $this->actingAs($this->kadivA)->postJson('/tasks', $payload($this->a['workstream']))->assertCreated();
    }

    // ── H3 — phase mutations ────────────────────────────────────────────────

    public function test_phase_mutations_block_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson("/workstreams/{$this->b['workstream']}/phases", ['name' => 'X'])
            ->assertForbidden();

        $this->actingAs($this->kadivA)
            ->putJson("/phases/{$this->b['phase']}", ['name' => 'Renamed'])
            ->assertForbidden();

        $this->actingAs($this->kadivA)
            ->deleteJson("/phases/{$this->b['phase']}")
            ->assertForbidden();

        // Positive control — fase di direktorat sendiri tetap bisa di-edit.
        $this->actingAs($this->kadivA)
            ->putJson("/phases/{$this->a['phase']}", ['name' => 'Renamed in A'])
            ->assertOk();
    }

    // ── H5 — blocker mutations ──────────────────────────────────────────────

    public function test_blocker_mutations_block_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson('/blockers', ['taskId' => $this->b['task'], 'title' => 'Cross block', 'severity' => 'HIGH'])
            ->assertForbidden();

        $this->actingAs($this->kadivA)
            ->putJson("/blockers/{$this->b['blocker']}/status", ['status' => 'RESOLVED'])
            ->assertForbidden();

        $this->actingAs($this->kadivA)
            ->deleteJson("/blockers/{$this->b['blocker']}")
            ->assertForbidden();

        // Positive control — blocker di direktorat sendiri tetap bisa dibuat.
        $this->actingAs($this->kadivA)
            ->postJson('/blockers', ['taskId' => $this->a['task'], 'title' => 'Own block', 'severity' => 'HIGH'])
            ->assertCreated();
    }

    // ── H1 — kpi-links ──────────────────────────────────────────────────────

    public function test_kpi_link_mutations_block_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson("/programs/{$this->b['program']}/kpi-links", ['apmsKpiCode' => 'KPI-X'])
            ->assertForbidden();

        $this->actingAs($this->kadivA)
            ->deleteJson("/programs/{$this->b['program']}/kpi-links/KPI-X")
            ->assertForbidden();

        // Positive control — link KPI ke program direktorat sendiri.
        $this->actingAs($this->kadivA)
            ->postJson("/programs/{$this->a['program']}/kpi-links", ['apmsKpiCode' => 'KPI-A'])
            ->assertCreated();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** @return array{0:Directorate,1:OrganizationalUnit} */
    private function makeDirectorate(string $dirCode, string $unitCode): array
    {
        $dir = Directorate::create(['code' => $dirCode, 'name' => "Direktorat {$dirCode}", 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => $unitCode, 'name' => "Divisi {$unitCode}", 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);

        return [$dir, $unit];
    }

    private function makeUser(string $slug, string $role, int $unitId, int $directorateId): User
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
        ]);
    }

    /**
     * Seed satu rantai Program → Workstream → Task → Phase → Blocker lewat HTTP
     * sebagai admin (executive), sehingga ownerUnitId program = unit admin.
     *
     * @return array<string,int>
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
