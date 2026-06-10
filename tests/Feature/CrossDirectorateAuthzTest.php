<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Mengunci perbaikan celah otorisasi lintas-direktorat (audit 2026-06-10) yang
 * sebelumnya membiarkan user mana pun mengubah "realitas" program divisi lain:
 *   - Workstream store/update/destroy        (sebelumnya 0 cek)
 *   - SubTask store/destroy/toggle           (sebelumnya 0 cek)
 *   - KpiValue storeValue                     (hanya cek ACTIVE, tanpa akses)
 *   - Task destroy                            (allowlist tanpa OrgScope)
 *   - Blocker update/resolution               (allowlist tanpa OrgScope)
 *   - Program activate                        (hanya cek role, tanpa direktorat)
 *   - Program ownerId reassign                (bebas ke siapa pun)
 *   - Meeting linkedProgramId                 (link ke program tanpa akses)
 *
 * Pola (sama dgn WorkboardAuthScopeTest): dua direktorat A & B, masing-masing
 * admin (executive, untuk seed) + KADIV (scoped). KADIV-A tidak boleh menyentuh
 * milik direktorat B; tetap penuh akses di direktorat A sendiri.
 */
class CrossDirectorateAuthzTest extends TestCase
{
    use RefreshDatabase;

    private User $adminA;
    private User $adminB;
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
        $this->adminB = $this->makeUser('admin-b', 'SUPERADMIN', $unitB->id, $dirB->id);
        $this->kadivB = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);

        $this->a = $this->seedProgramStack($this->adminA, 'A');
        $this->b = $this->seedProgramStack($this->adminB, 'B');
    }

    // ── Workstream mutations ──────────────────────────────────────────────────

    public function test_workstream_store_blocks_cross_directorate(): void
    {
        $payload = fn (int $programId) => [
            'programId' => $programId,
            'name' => 'Injected workstream',
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
        ];

        $this->actingAs($this->kadivA)->postJson('/workstreams', $payload($this->b['program']))->assertForbidden();
        $this->actingAs($this->kadivA)->postJson('/workstreams', $payload($this->a['program']))->assertCreated();
    }

    public function test_workstream_update_and_destroy_block_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)->putJson("/workstreams/{$this->b['workstream']}", ['name' => 'Hijacked'])->assertForbidden();
        $this->actingAs($this->kadivA)->deleteJson("/workstreams/{$this->b['workstream']}")->assertForbidden();

        // Positive control — workstream direktorat sendiri tetap bisa diubah.
        $this->actingAs($this->kadivA)->putJson("/workstreams/{$this->a['workstream']}", ['name' => 'Renamed in A'])->assertOk();
    }

    // ── SubTask mutations ─────────────────────────────────────────────────────

    public function test_subtask_mutations_block_cross_directorate(): void
    {
        // Subtask milik direktorat B, dibuat oleh admin B.
        $subTaskB = $this->actingAs($this->adminB)
            ->postJson("/tasks/{$this->b['task']}/subtasks", ['title' => 'B subtask'])
            ->assertCreated()->json('data.id');

        $this->actingAs($this->kadivA)->postJson("/tasks/{$this->b['task']}/subtasks", ['title' => 'Injected'])->assertForbidden();
        $this->actingAs($this->kadivA)->deleteJson("/tasks/{$this->b['task']}/subtasks/{$subTaskB}")->assertForbidden();
        $this->actingAs($this->kadivA)->patchJson("/tasks/{$this->b['task']}/subtasks/{$subTaskB}/toggle")->assertForbidden();

        // Positive control — subtask di task direktorat sendiri.
        $this->actingAs($this->kadivA)->postJson("/tasks/{$this->a['task']}/subtasks", ['title' => 'Own subtask'])->assertCreated();
    }

    // ── Task destroy ──────────────────────────────────────────────────────────

    public function test_task_destroy_blocks_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)->deleteJson("/tasks/{$this->b['task']}")->assertForbidden();
        $this->actingAs($this->kadivA)->deleteJson("/tasks/{$this->a['task']}")->assertOk();
    }

    // ── Blocker update / resolution ───────────────────────────────────────────

    public function test_blocker_update_and_resolution_block_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)->patchJson("/blockers/{$this->b['blocker']}", ['title' => 'Hijacked blocker'])->assertForbidden();
        $this->actingAs($this->kadivA)->patchJson("/blockers/{$this->b['blocker']}/resolution", ['resolution' => 'Fake countermeasure'])->assertForbidden();

        // Positive control — blocker di direktorat sendiri tetap bisa diedit.
        $this->actingAs($this->kadivA)->patchJson("/blockers/{$this->a['blocker']}", ['title' => 'Edited in A'])->assertOk();
    }

    // ── KPI value (data realisasi) ────────────────────────────────────────────

    public function test_kpi_value_write_blocks_cross_directorate(): void
    {
        $kpiB = $this->makeProgramKpi($this->adminB, $this->b['program'], 'KPI-VAL-B');
        $kpiA = $this->makeProgramKpi($this->adminA, $this->a['program'], 'KPI-VAL-A');

        // Program A diaktifkan supaya nilai KPI bisa direkam (positive path).
        $this->actingAs($this->adminA)->postJson("/programs/{$this->a['program']}/activate")->assertOk();

        $value = fn () => ['measurementDate' => now()->toDateString(), 'actualValue' => 42];

        // Cross-directorate → 403 (cek akses terjadi sebelum cek status ACTIVE).
        $this->actingAs($this->kadivA)->postJson("/kpis/{$kpiB}/values", $value())->assertForbidden();

        // Scoped user di direktorat sendiri boleh merekam realisasi.
        $this->actingAs($this->kadivA)->postJson("/kpis/{$kpiA}/values", $value())->assertCreated();
    }

    // ── Program activate ──────────────────────────────────────────────────────

    public function test_activate_blocks_cross_directorate(): void
    {
        $this->actingAs($this->kadivA)->postJson("/programs/{$this->b['program']}/activate")->assertForbidden();
        $this->actingAs($this->kadivA)->postJson("/programs/{$this->a['program']}/activate")->assertOk();
    }

    // ── Program ownerId reassign ──────────────────────────────────────────────

    public function test_owner_reassign_blocks_out_of_scope_target(): void
    {
        // Lempar kepemilikan ke KADIV direktorat lain → ditolak.
        $this->actingAs($this->kadivA)
            ->putJson("/programs/{$this->a['program']}", ['ownerId' => $this->kadivB->id])
            ->assertForbidden();

        // Reassign ke diri sendiri (dalam scope) → diizinkan.
        $this->actingAs($this->kadivA)
            ->putJson("/programs/{$this->a['program']}", ['ownerId' => $this->kadivA->id])
            ->assertOk();
    }

    // ── Meeting linkedProgramId ───────────────────────────────────────────────

    public function test_meeting_link_blocks_cross_directorate_program(): void
    {
        $payload = fn (int $programId) => [
            'title' => 'Rapat Koordinasi',
            'meetingType' => 'RAPAT_KOORDINASI',
            'startAt' => now()->addDay()->toDateTimeString(),
            'endAt' => now()->addDay()->addHour()->toDateTimeString(),
            'linkedProgramId' => $programId,
        ];

        $this->actingAs($this->kadivA)->postJson('/meetings', $payload($this->b['program']))->assertForbidden();
        $this->actingAs($this->kadivA)->postJson('/meetings', $payload($this->a['program']))->assertSuccessful();
    }

    // ── Program archive / restore ─────────────────────────────────────────────

    public function test_archive_and_restore_block_cross_directorate(): void
    {
        // Archive: cross-directorate ditolak, direktorat sendiri diizinkan.
        $this->actingAs($this->kadivA)->patchJson("/programs/{$this->b['program']}/archive")->assertForbidden();
        $this->actingAs($this->kadivA)->patchJson("/programs/{$this->a['program']}/archive")->assertOk();

        // Restore: KADIV direktorat lain tetap tak boleh mengembalikan; pemilik
        // direktorat boleh.
        $this->actingAs($this->kadivB)->patchJson("/programs/{$this->a['program']}/restore")->assertForbidden();
        $this->actingAs($this->kadivA)->patchJson("/programs/{$this->a['program']}/restore")->assertOk();
    }

    // ── KPI read-path scoping ──────────────────────────────────────────────────

    public function test_kpi_index_is_scoped_to_own_directorate(): void
    {
        $kpiA = $this->makeProgramKpi($this->adminA, $this->a['program'], 'KPI-IDX-A');
        $kpiB = $this->makeProgramKpi($this->adminB, $this->b['program'], 'KPI-IDX-B');
        $kpiGlobal = $this->makeGlobalKpi($this->adminA, 'KPI-IDX-GLOBAL');

        $ids = $this->actingAs($this->kadivA)->getJson('/kpis')->assertOk()->json('data.*.id');

        $this->assertContains($kpiA, $ids, 'KADIV harus lihat KPI program direktoratnya.');
        $this->assertContains($kpiGlobal, $ids, 'KPI global (tanpa program) tetap terlihat.');
        $this->assertNotContains($kpiB, $ids, 'KADIV TIDAK boleh lihat KPI direktorat lain.');

        // Executive tetap melihat semua.
        $adminIds = $this->actingAs($this->adminA)->getJson('/kpis')->assertOk()->json('data.*.id');
        $this->assertContains($kpiB, $adminIds);
    }

    public function test_kpi_show_blocks_cross_directorate(): void
    {
        $kpiA = $this->makeProgramKpi($this->adminA, $this->a['program'], 'KPI-SHOW-A');
        $kpiB = $this->makeProgramKpi($this->adminB, $this->b['program'], 'KPI-SHOW-B');

        $this->actingAs($this->kadivA)->getJson("/kpis/{$kpiB}")->assertForbidden();
        $this->actingAs($this->kadivA)->getJson("/kpis/{$kpiA}")->assertOk();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

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

    /** Buat KpiDefinition tertaut program lewat HTTP sebagai admin. */
    private function makeProgramKpi(User $admin, int $programId, string $code): int
    {
        return $this->actingAs($admin)->postJson('/kpis', [
            'code' => $code,
            'name' => "KPI {$code}",
            'targetValue' => 100,
            'unitOfMeasure' => '%',
            'reviewFrequency' => 'MONTHLY',
            'metricType' => 'INTERNAL',
            'programId' => $programId,
        ])->assertCreated()->json('data.id');
    }

    /** Buat KpiDefinition global (tanpa program) lewat HTTP sebagai admin. */
    private function makeGlobalKpi(User $admin, string $code): int
    {
        return $this->actingAs($admin)->postJson('/kpis', [
            'code' => $code,
            'name' => "KPI {$code}",
            'targetValue' => 100,
            'unitOfMeasure' => '%',
            'reviewFrequency' => 'MONTHLY',
            'metricType' => 'LAGGING',
        ])->assertCreated()->json('data.id');
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
