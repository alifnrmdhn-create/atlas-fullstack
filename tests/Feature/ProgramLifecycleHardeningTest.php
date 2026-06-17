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
        $owner = $this->makeUser('owner-asisten', 'ASISTEN', $unit->id, $dir->id);
        $bod = $this->makeUser('bod', 'BOD', $unit->id, $dir->id);

        $id = $this->createProgram($owner);

        // BOD (read-only) — dulu lolos karena cuma assertAccess (cek BACA).
        $this->actingAs($bod)->postJson("/programs/{$id}/kpi-links", ['apmsKpiCode' => 'KPI-X'])
            ->assertForbidden();
        $this->actingAs($bod)->postJson("/programs/{$id}/kpi-internal", [
            'code' => 'INT-1', 'name' => 'Internal KPI', 'targetValue' => 100,
        ])->assertForbidden();

        // Owner (stakeholder ASISTEN) tetap boleh — fix tidak over-restrict.
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

        $id = $this->createProgram($asisten);
        $this->actingAs($asisten)->postJson("/programs/{$id}/submit")->assertSuccessful();
        $this->assertSame('PENDING_KASUB', Program::find($id)->approvalStatus);

        // KASUBDIV approve → tak ada KADIV di rantai → 422, status TETAP PENDING_KASUB.
        // Sebelum fix: naik ke PENDING_KADIV lalu nyangkut (tak ada yang bisa approve).
        $this->actingAs($kasubdiv)->postJson("/programs/{$id}/approve")->assertStatus(422);
        $this->assertSame('PENDING_KASUB', Program::find($id)->approvalStatus);
    }

    // ── #6a — struktur terkunci saat PENDING ──────────────────────────────────

    public function test_structure_locked_while_pending_admin_bypasses(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $kadiv = $this->makeUser('kadiv-a', 'KADIV', $unit->id, $dir->id);
        $kasubdiv = $this->makeUser('kasubdiv-a', 'KASUBDIV', $unit->id, $dir->id, $kadiv->id);
        $asisten = $this->makeUser('asisten-a', 'ASISTEN', $unit->id, $dir->id, $kasubdiv->id);
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);

        $id = $this->createProgram($asisten);

        // DRAFT: owner bebas menambah struktur.
        $wsId = (int) $this->actingAs($asisten)->postJson('/workstreams', [
            'programId' => $id,
            'name' => 'WS-1',
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $asisten->id,
        ])->assertCreated()->json('data.id');

        // Submit → PENDING_KASUB.
        $this->actingAs($asisten)->postJson("/programs/{$id}/submit")->assertSuccessful();
        $this->assertSame('PENDING_KASUB', Program::find($id)->approvalStatus);

        // Non-admin: tambah task / workstream saat PENDING → 422.
        $this->actingAs($asisten)->postJson('/tasks', [
            'title' => 'Task saat pending',
            'workstreamId' => $wsId,
            'targetCompletion' => now()->addWeek()->toDateString(),
            'priority' => 'MEDIUM',
        ])->assertStatus(422);

        $this->actingAs($asisten)->postJson('/workstreams', [
            'programId' => $id,
            'name' => 'WS-2 saat pending',
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $asisten->id,
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
