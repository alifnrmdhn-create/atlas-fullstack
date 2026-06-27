<?php

namespace Tests\Feature;

use App\Models\EntityPic;
use App\Models\Phase;
use App\Models\Program;
use App\Models\ProgramKpiLink;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * "Copy from existing" (aspirasi user 2026-06-27): Program/Workstream/Phase
 * deep-clone. Aturan: pertahankan struktur + PIC/assignee, RESET progres/status.
 * Test meng-assert efek TERAMATI (row baru + progres ter-reset), bukan cuma 2xx
 * — konvensi anti silent-drop #8.
 */
class DuplicationTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $kadiv;
    private int $programId;

    protected function setUp(): void
    {
        parent::setUp();

        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $this->kadiv = $this->makeUser('kadiv-a', 'KADIV', $unit->id, $dir->id);

        // Bangun program berstruktur: 1 workstream → 1 phase → 2 task, dengan
        // progres NON-NOL supaya reset bisa dibuktikan.
        $program = Program::create([
            'code' => 'PRG-SRC01', 'name' => 'Program Sumber', 'priority' => 'HIGH',
            'startDate' => now(), 'targetEndDate' => now()->addMonths(2),
            'status' => 'IN_PROGRESS', 'approvalStatus' => 'ACTIVE',
            'progressPercent' => 60, 'ownerId' => $this->kadiv->id,
            'ownerUnitId' => $unit->id, 'submittedById' => $this->kadiv->id,
            // Kondisi yang HARUS ter-reset di salinan (lifecycle cruft sumber).
            'healthStatus' => 'RED', 'rejectionNote' => 'Pernah ditolak — perbaiki KPI.',
            'progresTerkini' => 'Sudah 60% per minggu lalu.',
            'dukunganDibutuhkan' => 'Butuh approval anggaran dari Keuangan.',
        ]);
        $this->programId = $program->id;
        EntityPic::syncForEntity('Program', $program->id, [$this->kadiv->id]);
        ProgramKpiLink::create(['programId' => $program->id, 'apmsKpiCode' => 'APMS-1']);

        $ws = Workstream::create([
            'code' => 'WS-SRC01', 'programId' => $program->id, 'name' => 'WS Sumber',
            'status' => 'IN_PROGRESS', 'priority' => 'HIGH', 'progressPercent' => 50,
            'healthStatus' => 'GREEN', 'ownerUnitId' => $unit->id,
            'targetCompletion' => now()->addMonths(1),
        ]);
        $phase = Phase::create([
            'code' => 'PH-SRC01', 'initiativeId' => $ws->id, 'name' => 'Fase Sumber',
            'order' => 1, 'status' => 'IN_PROGRESS', 'healthStatus' => 'GREEN',
        ]);
        $taskA = Task::create([
            'code' => 'WI-SRC01', 'initiativeId' => $ws->id, 'phaseId' => $phase->id,
            'title' => 'Task A', 'status' => 'COMPLETED', 'priority' => 'HIGH',
            'percentComplete' => 100, 'actualCompletion' => now(), 'isBlocked' => true,
            'assignedTo' => $this->kadiv->id, 'createdBy' => $this->kadiv->id,
            'targetCompletion' => now()->addWeeks(2),
            'plannedWeeks' => ['2026-W10', '2026-W11'], 'actualWeeks' => ['2026-W10'],
            // Keadaan-kini yang HARUS ter-reset di salinan.
            'actualHours' => 40, 'healthStatus' => 'RED', 'linkedThreadId' => 999,
        ]);
        EntityPic::syncForEntity('WorkItem', $taskA->id, [$this->kadiv->id]);
        // Checklist (SubTask) yang sudah selesai — harus ikut tersalin tapi reset.
        \App\Models\SubTask::create([
            'workItemId' => $taskA->id, 'title' => 'Langkah 1',
            'status' => 'DONE', 'isCompleted' => true, 'completedAt' => now(),
        ]);
        Task::create([
            'code' => 'WI-SRC02', 'initiativeId' => $ws->id, 'phaseId' => $phase->id,
            'title' => 'Task B', 'status' => 'IN_PROGRESS', 'priority' => 'MEDIUM',
            'percentComplete' => 40, 'assignedTo' => $this->kadiv->id,
            'createdBy' => $this->kadiv->id, 'targetCompletion' => now()->addWeeks(3),
        ]);
    }

    public function test_duplicate_program_deep_clones_and_resets_progress(): void
    {
        $res = $this->actingAs($this->kadiv)
            ->postJson("/programs/{$this->programId}/duplicate")
            ->assertCreated();

        $newId = (int) $res->json('data.id');
        $this->assertNotSame($this->programId, $newId);

        $clone = Program::findOrFail($newId);
        // Reset: DRAFT, progres nol, status planning, milik penyalin.
        $this->assertSame('DRAFT', $clone->approvalStatus);
        $this->assertSame(0, (int) $clone->getRawOriginal('progressPercent'));
        $this->assertStringStartsWith('(Salinan)', $clone->name);
        $this->assertNotSame('PRG-SRC01', $clone->code);

        // Struktur tersalin: 1 ws → 1 phase → 2 task.
        $ws = Workstream::where('programId', $newId)->firstOrFail();
        $this->assertSame('BACKLOG', $ws->status);
        $this->assertSame(0, (int) $ws->progressPercent);
        $this->assertSame(1, Phase::where('initiativeId', $ws->id)->count());
        $tasks = Task::where('initiativeId', $ws->id)->get();
        $this->assertCount(2, $tasks);

        // Task ter-reset: status BACKLOG, progres 0, actual dibuang, blocker off —
        // TAPI assignee + plannedWeeks dipertahankan.
        $clonedA = $tasks->firstWhere('title', 'Task A');
        $this->assertSame('BACKLOG', $clonedA->status);
        $this->assertSame(0, (int) $clonedA->percentComplete);
        $this->assertNull($clonedA->actualCompletion);
        $this->assertNull($clonedA->actualWeeks);
        $this->assertFalse((bool) $clonedA->isBlocked);
        $this->assertSame($this->kadiv->id, (int) $clonedA->assignedTo);
        $this->assertSame(['2026-W10', '2026-W11'], $clonedA->plannedWeeks);
        // Keadaan-kini task TER-RESET (jam aktual, health, tautan thread).
        $this->assertNull($clonedA->actualHours);
        $this->assertNull($clonedA->healthStatus);
        $this->assertNull($clonedA->linkedThreadId);
        // PIC task mirror ke EntityPic (invariant assignedTo === picPersonIds[0]).
        $this->assertSame([$this->kadiv->id], $clonedA->fresh('entityPics')->picPersonIds);

        // Checklist (SubTask) ikut tersalin TAPI di-reset (belum selesai).
        $subs = \App\Models\SubTask::where('workItemId', $clonedA->id)->get();
        $this->assertCount(1, $subs);
        $this->assertSame('Langkah 1', $subs->first()->title);
        $this->assertFalse((bool) $subs->first()->isCompleted);
        $this->assertNull($subs->first()->completedAt);

        // PIC program + link KPI ikut tersalin.
        $this->assertDatabaseHas('entity_pics', [
            'entityType' => 'Program', 'entityId' => $newId, 'userId' => $this->kadiv->id,
        ]);
        $this->assertDatabaseHas('ProgramKpiLink', [
            'programId' => $newId, 'apmsKpiCode' => 'APMS-1',
        ]);

        // Lifecycle cruft sumber TER-RESET (kalau tidak, alur approve/activate
        // salinan terblokir).
        $this->assertNull($clone->rejectionNote);
        // healthStatus di-recompute fresh dari struktur salinan (0% BACKLOG, tanpa
        // blocker) — yang penting BUKAN 'RED' basi warisan sumber.
        $this->assertNotSame('RED', $clone->healthStatus);
        $this->assertNull($clone->progresTerkini);
        $this->assertNull($clone->dukunganDibutuhkan);

        // Sumber TIDAK berubah.
        $this->assertSame('ACTIVE', Program::find($this->programId)->approvalStatus);
    }

    /**
     * Bukti TIDAK ADA blocker alur: program hasil duplikat (DRAFT) bisa diproses
     * KADIV langsung ke ACTIVE — meski sumbernya pernah ditolak (punya
     * rejectionNote). Sebelum fix, rejectionNote ikut tersalin → activate ditolak.
     */
    public function test_duplicated_program_is_processable_to_active(): void
    {
        $newId = (int) $this->actingAs($this->kadiv)
            ->postJson("/programs/{$this->programId}/duplicate")
            ->assertCreated()->json('data.id');

        // Readiness terpenuhi (workstream + task + KPI link ikut tersalin) →
        // KADIV "Mulai Eksekusi" langsung dari DRAFT.
        $this->actingAs($this->kadiv)
            ->postJson("/programs/{$newId}/activate")
            ->assertSuccessful();

        $this->assertSame('ACTIVE', Program::find($newId)->approvalStatus);
    }

    public function test_duplicate_workstream_clones_within_same_program(): void
    {
        $ws = Workstream::where('programId', $this->programId)->firstOrFail();

        $this->actingAs($this->kadiv)
            ->postJson("/workstreams/{$ws->id}/duplicate")
            ->assertCreated();

        // Program asal kini punya 2 workstream; salinan ber-2 task, progres nol.
        $all = Workstream::where('programId', $this->programId)->get();
        $this->assertCount(2, $all);
        $clone = $all->where('id', '!=', $ws->id)->first();
        $this->assertSame(0, (int) $clone->progressPercent);
        $this->assertSame(2, Task::where('initiativeId', $clone->id)->count());
        $this->assertSame(0, Task::where('initiativeId', $clone->id)->where('percentComplete', '>', 0)->count());
    }

    public function test_duplicate_phase_clones_tasks_within_workstream(): void
    {
        $phase = Phase::where('code', 'PH-SRC01')->firstOrFail();

        $this->actingAs($this->kadiv)
            ->postJson("/phases/{$phase->id}/duplicate")
            ->assertCreated();

        $phases = Phase::where('initiativeId', $phase->initiativeId)->get();
        $this->assertCount(2, $phases);
        $clone = $phases->where('id', '!=', $phase->id)->first();
        $this->assertSame('PLANNING', $clone->status);
        // 2 task asli ter-attach ke phase ini → ikut tersalin.
        $this->assertSame(2, Task::where('phaseId', $clone->id)->count());
    }
}
