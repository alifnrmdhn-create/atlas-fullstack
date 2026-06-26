<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\Task;
use App\Models\Workstream;
use App\Services\ProgramHealthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci perbaikan audit lifecycle program 2026-06-17:
 *   #1  — update() menyimpan `code` & `status` (dulu di-drop diam-diam validator)
 *   #2  — endpoint KPI program di-gate edit-program (BOD read-only & non-owner tak bisa tulis)
 *   #3  — health workstream di-derive LIVE dari overdue task (dulu snapshot beku)
 *   #5  — anti-deadlock: approve KASUBDIV→KADIV ditolak bila tak ada KADIV di chain
 *   #6a — CRUD struktur (workstream/task) terkunci saat program PENDING, admin bypass
 */
class ProgramLifecycleHardeningTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    // ── #1 — code & status tersimpan saat edit ────────────────────────────────

    public function test_update_persists_code_and_status(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);

        $id = (int) $this->actingAs($admin)->postJson('/programs', [
            'code' => 'PRG-ORIG',
            'name' => 'Program Edit',
            'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonths(2)->toDateString(),
            'ownerId' => $admin->id,
            'hasNoApmsKpi' => true,
        ])->assertCreated()->json('data.id');

        $this->actingAs($admin)->putJson("/programs/{$id}", [
            'code' => 'PRG-UPDATED',
            'status' => 'ON_HOLD',
        ])->assertSuccessful();

        // Sebelum fix: kedua field di-buang validator → no-op senyap.
        $this->assertDatabaseHas('Program', [
            'id' => $id,
            'code' => 'PRG-UPDATED',
            'status' => 'ON_HOLD',
        ]);
    }

    public function test_update_rejects_invalid_status_enum(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);
        $id = $this->createProgram($admin);

        $this->actingAs($admin)->putJson("/programs/{$id}", ['status' => 'BUKAN_STATUS'])
            ->assertStatus(422);
    }

    // ── #2 — KPI endpoints di-gate edit-program ───────────────────────────────

    public function test_bod_cannot_mutate_kpi_links_or_internal_owner_can(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $owner = $this->makeUser('owner-kasubdiv', 'KASUBDIV', $unit->id, $dir->id);
        $bod = $this->makeUser('bod', 'BOD', $unit->id, $dir->id);

        $id = $this->createProgram($owner);

        // BOD (read-only) — dulu lolos karena cuma assertAccess (cek BACA).
        $this->actingAs($bod)->postJson("/programs/{$id}/kpi-links", ['apmsKpiCode' => 'KPI-X'])
            ->assertForbidden();
        $this->actingAs($bod)->postJson("/programs/{$id}/kpi-internal", [
            'code' => 'INT-1', 'name' => 'Internal KPI', 'targetValue' => 100,
        ])->assertForbidden();

        // Owner (stakeholder KASUBDIV) tetap boleh — fix tidak over-restrict.
        $this->actingAs($owner)->postJson("/programs/{$id}/kpi-links", ['apmsKpiCode' => 'KPI-A'])
            ->assertCreated();
        $this->assertDatabaseHas('ProgramKpiLink', ['programId' => $id, 'apmsKpiCode' => 'KPI-A']);
    }

    // ── #5 — anti-deadlock di approve (escalation ke KADIV) ───────────────────

    public function test_approve_blocked_when_no_kadiv_in_chain(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');

        // KASUBDIV tanpa atasan KADIV (managerUserId null), ASISTEN di bawahnya.
        $kasubdiv = $this->makeUser('kasubdiv-orphan', 'KASUBDIV', $unit->id, $dir->id);
        $asisten = $this->makeUser('asisten-a', 'ASISTEN', $unit->id, $dir->id, $kasubdiv->id);

        // State PENDING_KASUB + submitter ASISTEN di-set langsung: sejak ASISTEN tak
        // lagi menginisiasi program (2026-06-26), state ini tak tercapai via flow
        // normal — tapi guard eskalasi approve() KASUBDIV→KADIV tetap diuji defensif.
        $id = $this->createProgram($kasubdiv);
        Program::where('id', $id)->update([
            'approvalStatus' => 'PENDING_KASUB',
            'submittedById'  => $asisten->id,
        ]);

        // KASUBDIV approve → eskalasi ke KADIV, tak ada KADIV di rantai → 422,
        // status TETAP PENDING_KASUB (sebelum fix: nyangkut di PENDING_KADIV).
        $this->actingAs($kasubdiv)->postJson("/programs/{$id}/approve")->assertStatus(422);
        $this->assertSame('PENDING_KASUB', Program::find($id)->approvalStatus);
    }

    // ── #6a — struktur terkunci saat PENDING ──────────────────────────────────

    public function test_structure_locked_while_pending_admin_bypasses(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $kadiv = $this->makeUser('kadiv-a', 'KADIV', $unit->id, $dir->id);
        $kasubdiv = $this->makeUser('kasubdiv-a', 'KASUBDIV', $unit->id, $dir->id, $kadiv->id);
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);

        $id = $this->createProgram($kasubdiv);

        // DRAFT: owner bebas menambah struktur.
        $wsId = (int) $this->actingAs($kasubdiv)->postJson('/workstreams', [
            'programId' => $id,
            'name' => 'WS-1',
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $kasubdiv->id,
        ])->assertCreated()->json('data.id');

        // Submit (KASUBDIV) → PENDING_KADIV.
        $this->actingAs($kasubdiv)->postJson("/programs/{$id}/submit")->assertSuccessful();
        $this->assertSame('PENDING_KADIV', Program::find($id)->approvalStatus);

        // Non-admin: tambah task / workstream saat PENDING → 422.
        $this->actingAs($kasubdiv)->postJson('/tasks', [
            'title' => 'Task saat pending',
            'workstreamId' => $wsId,
            'targetCompletion' => now()->addWeek()->toDateString(),
            'priority' => 'MEDIUM',
        ])->assertStatus(422);

        $this->actingAs($kasubdiv)->postJson('/workstreams', [
            'programId' => $id,
            'name' => 'WS-2 saat pending',
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $kasubdiv->id,
        ])->assertStatus(422);

        // Admin tetap bisa (bypass) — mis. koreksi struktural darurat.
        $this->actingAs($admin)->postJson('/tasks', [
            'title' => 'Task admin bypass',
            'workstreamId' => $wsId,
            'targetCompletion' => now()->addWeek()->toDateString(),
            'priority' => 'MEDIUM',
        ])->assertCreated();
    }

    // ── #3 — health workstream di-derive live dari overdue ─────────────────────

    public function test_workstream_health_derived_from_overdue_tasks(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);

        $id = $this->createProgram($admin);
        $wsId = (int) $this->actingAs($admin)->postJson('/workstreams', [
            'programId' => $id,
            'name' => 'WS-1',
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $admin->id,
        ])->assertCreated()->json('data.id');

        $taskId = (int) $this->actingAs($admin)->postJson('/tasks', [
            'title' => 'Task overdue',
            'workstreamId' => $wsId,
            'targetCompletion' => now()->addWeek()->toDateString(),
            'priority' => 'MEDIUM',
        ])->assertCreated()->json('data.id');

        // Task masih on-time → health workstream di-derive GREEN (menimpa YELLOW seed
        // default). Ini sendiri sudah bukti health TIDAK lagi beku: pembuatan task
        // memicu recompute yang men-derive dari state task, bukan menahan nilai seed.
        $this->assertSame('GREEN', Workstream::find($wsId)->healthStatus);

        // Jadikan task overdue & open; program ACTIVE tanpa approval-log → lewati grace.
        Task::where('id', $taskId)->update([
            'targetCompletion' => now()->subDays(3),
            'status' => 'IN_PROGRESS',
            'percentComplete' => 10,
        ]);
        Program::where('id', $id)->update(['approvalStatus' => 'ACTIVE']);

        $health = app(ProgramHealthService::class)->recompute($id);

        // Workstream kini di-derive RED (overdue ratio 100% ≥ 30%) — bukan lagi YELLOW beku.
        $this->assertSame('RED', Workstream::find($wsId)->healthStatus);
        $this->assertSame('RED', $health);
        $this->assertSame('RED', Program::find($id)->healthStatus);
    }

    // ── status Workstream/Phase = turunan dari task (2026-06-26) ──────────────

    public function test_structure_status_derived_from_child_tasks(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);

        $id = $this->createProgram($admin);
        $wsId = (int) $this->actingAs($admin)->postJson('/workstreams', [
            'programId' => $id, 'name' => 'WS', 'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(4)->toDateString(),
        ])->assertCreated()->json('data.id');
        $phaseId = (int) $this->actingAs($admin)
            ->postJson("/workstreams/{$wsId}/phases", ['name' => 'Phase 1'])
            ->assertCreated()->json('data.id');

        $t1 = (int) $this->actingAs($admin)->postJson('/tasks', [
            'title' => 'T1', 'workstreamId' => $wsId, 'phaseId' => $phaseId,
            'targetCompletion' => now()->addWeek()->toDateString(), 'priority' => 'MEDIUM',
        ])->assertCreated()->json('data.id');
        $t2 = (int) $this->actingAs($admin)->postJson('/tasks', [
            'title' => 'T2', 'workstreamId' => $wsId, 'phaseId' => $phaseId,
            'targetCompletion' => now()->addWeek()->toDateString(), 'priority' => 'MEDIUM',
        ])->assertCreated()->json('data.id');

        $svc = app(\App\Services\TaskService::class);

        // Belum ada yang dimulai (BACKLOG) → default planning di kedua level.
        $svc->recomputeStructureStatus($wsId);
        $this->assertSame('BACKLOG', Workstream::find($wsId)->status);
        $this->assertSame('PLANNING', \App\Models\Phase::find($phaseId)->status);

        // Satu task berjalan → IN_PROGRESS.
        Task::where('id', $t1)->update(['status' => 'IN_PROGRESS', 'percentComplete' => 40]);
        $svc->recomputeStructureStatus($wsId);
        $this->assertSame('IN_PROGRESS', Workstream::find($wsId)->status);
        $this->assertSame('IN_PROGRESS', \App\Models\Phase::find($phaseId)->status);

        // Semua task selesai → COMPLETED.
        Task::whereIn('id', [$t1, $t2])->update(['status' => 'COMPLETED', 'percentComplete' => 100]);
        $svc->recomputeStructureStatus($wsId);
        $this->assertSame('COMPLETED', Workstream::find($wsId)->status);
        $this->assertSame('COMPLETED', \App\Models\Phase::find($phaseId)->status);

        // Status TIDAK bisa di-set manual lewat API — request `status` diabaikan,
        // nilai turunan (COMPLETED) bertahan.
        $this->actingAs($admin)->putJson("/phases/{$phaseId}", ['status' => 'PLANNING'])
            ->assertOk()->assertJsonPath('data.status', 'COMPLETED');
        $this->actingAs($admin)->putJson("/workstreams/{$wsId}", ['status' => 'BACKLOG'])
            ->assertOk()->assertJsonPath('data.status', 'COMPLETED');
    }

    // ── plannedWeeks editable (timeline Plan) ─────────────────────────────────

    public function test_planned_weeks_editable_and_clearable(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);
        $id = $this->createProgram($admin);
        $wsId = (int) $this->actingAs($admin)->postJson('/workstreams', [
            'programId' => $id, 'name' => 'WS', 'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(), 'ownerId' => $admin->id,
        ])->assertCreated()->json('data.id');
        $taskId = (int) $this->actingAs($admin)->postJson('/tasks', [
            'title' => 'Task', 'workstreamId' => $wsId,
            'targetCompletion' => now()->addWeek()->toDateString(), 'priority' => 'MEDIUM',
        ])->assertCreated()->json('data.id');

        // Editor "Weekly Plan" (PATCH plannedWeeks) — dulu di-drop senyap, kini tersimpan.
        $this->actingAs($admin)->patchJson("/tasks/{$taskId}", ['plannedWeeks' => ['2026-W10', '2026-W11']])
            ->assertSuccessful();
        $this->assertSame(['2026-W10', '2026-W11'], Task::find($taskId)->plannedWeeks);

        // Bisa dikosongkan.
        $this->actingAs($admin)->patchJson("/tasks/{$taskId}", ['plannedWeeks' => []])->assertSuccessful();
        $this->assertSame([], Task::find($taskId)->plannedWeeks);
    }

    // ── apmsKpiCodes ter-link saat create ─────────────────────────────────────

    public function test_create_program_links_selected_apms_kpi(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);

        $id = (int) $this->actingAs($admin)->postJson('/programs', [
            'name' => 'Program KPI', 'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonths(2)->toDateString(), 'ownerId' => $admin->id,
            'apmsKpiCodes' => ['KPI-1', 'KPI-2'],
        ])->assertCreated()->json('data.id');

        // Dulu apmsKpiCodes di-drop senyap (validator + create) → tak ada link. Kini ter-link.
        $this->assertSame(
            ['KPI-1', 'KPI-2'],
            \App\Models\ProgramKpiLink::where('programId', $id)->orderBy('apmsKpiCode')->pluck('apmsKpiCode')->all(),
        );
    }

    // ── helper ────────────────────────────────────────────────────────────────

    private function createProgram(\App\Models\User $owner): int
    {
        return (int) $this->actingAs($owner)->postJson('/programs', [
            'name' => "Program {$owner->userId}",
            'description' => 'Program uji.',
            'priority' => 'HIGH',
            'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonths(2)->toDateString(),
            'ownerId' => $owner->id,
            'hasNoApmsKpi' => true,
        ])->assertCreated()->json('data.id');
    }
}
