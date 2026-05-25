<?php

namespace Tests\Unit;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use App\Services\TaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TaskService::updateProgress derivasi status (refactor hapus drag 2026-05-25).
 *
 * Progress jadi penggerak posisi kartu: 0→READY/BACKLOG, 1-99→IN_PROGRESS,
 * 100→COMPLETED. IN_REVIEW & BLOCKED sticky. Regresi yang memundurkan status
 * wajib alasan. Fase perencanaan meng-clamp derive maksimal READY.
 */
class TaskProgressDerivationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private OrganizationalUnit $unit;
    private TaskService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-PRG', 'name' => 'Direktorat Progress']);
        $this->unit = OrganizationalUnit::create([
            'code' => 'UNIT-PRG', 'name' => 'Unit', 'directorateId' => $dir->id, 'unitType' => 'DIVISION',
        ]);
        $this->user = User::create([
            'name' => 'PIC', 'email' => 'pic-prg@ptpn.test', 'userId' => 'pic-prg',
            'passwordHash' => Hash::make('x'), 'roleType' => 'KASUBDIV',
            'isActive' => true, 'unitId' => $this->unit->id, 'directorateId' => $dir->id,
        ]);
        $this->service = app(TaskService::class);
    }

    /** Buat task lengkap (PIC + target + tanggal mulai) di program dengan approvalStatus tertentu. */
    private function makeTask(string $approvalStatus, string $status, int $percent = 0, bool $withStartDate = true): Task
    {
        $program = Program::create([
            'code' => 'P-' . uniqid(), 'name' => 'Prog', 'ownerId' => $this->user->id,
            'ownerUnitId' => $this->unit->id, 'status' => 'IN_PROGRESS', 'priority' => 'MEDIUM',
            'startDate' => '2026-01-01', 'targetEndDate' => '2026-12-31',
            'approvalStatus' => $approvalStatus, 'healthStatus' => 'GREEN',
        ]);
        $ws = Workstream::create([
            'code' => 'WS-' . uniqid(), 'name' => 'WS', 'programId' => $program->id,
            'status' => 'IN_PROGRESS', 'ownerId' => $this->user->id, 'targetCompletion' => '2026-12-31',
        ]);

        return Task::create([
            'code' => 'T-' . uniqid(), 'title' => 'Task', 'initiativeId' => $ws->id,
            'status' => $status, 'priority' => 'MEDIUM',
            'assignedTo' => $this->user->id, 'createdBy' => $this->user->id,
            'targetCompletion' => '2026-12-31',
            'startDate' => $withStartDate ? '2026-02-01' : null,
            'percentComplete' => $percent,
        ]);
    }

    public function test_progress_1_to_99_derives_in_progress(): void
    {
        $task = $this->makeTask('ACTIVE', 'BACKLOG', 0);
        $fresh = $this->service->updateProgress($task->id, 50, $this->user->id);
        $this->assertSame('IN_PROGRESS', $fresh->status);
        $this->assertSame(50, $fresh->percentComplete);
    }

    public function test_progress_100_derives_completed_and_sets_actual_completion(): void
    {
        $task = $this->makeTask('ACTIVE', 'IN_PROGRESS', 40);
        $fresh = $this->service->updateProgress($task->id, 100, $this->user->id);
        $this->assertSame('COMPLETED', $fresh->status);
        $this->assertNotNull($fresh->actualCompletion);
    }

    public function test_progress_zero_with_prereqs_derives_ready(): void
    {
        $task = $this->makeTask('ACTIVE', 'BACKLOG', 0);
        $fresh = $this->service->updateProgress($task->id, 0, $this->user->id);
        $this->assertSame('READY', $fresh->status);
    }

    public function test_progress_zero_without_start_date_derives_backlog(): void
    {
        $task = $this->makeTask('ACTIVE', 'BACKLOG', 0, withStartDate: false);
        $fresh = $this->service->updateProgress($task->id, 0, $this->user->id);
        $this->assertSame('BACKLOG', $fresh->status);
    }

    public function test_progress_above_zero_without_pic_is_rejected(): void
    {
        // Memulai task (progres > 0) butuh PIC — konsisten dgn transitionStatus.
        $task = $this->makeTask('ACTIVE', 'BACKLOG', 0);
        $task->update(['assignedTo' => null]);
        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Tetapkan PIC');
        $this->service->updateProgress($task->id, 50, $this->user->id);
    }

    public function test_regression_without_note_is_rejected(): void
    {
        $task = $this->makeTask('ACTIVE', 'IN_PROGRESS', 60);
        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('memerlukan alasan');
        // 60% → 0% mengembalikan status IN_PROGRESS → READY (mundur) tanpa note.
        $this->service->updateProgress($task->id, 0, $this->user->id);
    }

    public function test_regression_with_note_is_allowed_and_logged(): void
    {
        $task = $this->makeTask('ACTIVE', 'IN_PROGRESS', 60);
        $fresh = $this->service->updateProgress($task->id, 0, $this->user->id, 'Revisi scope');
        $this->assertSame('READY', $fresh->status);
        $this->assertDatabaseHas('WorkItemStatusLog', [
            'workItemId' => $task->id,
            'toStatus'   => 'READY',
            'note'       => 'Revisi scope',
        ]);
    }

    public function test_planning_phase_clamps_to_ready(): void
    {
        // Program masih DRAFT (perencanaan) — progress 70 tidak boleh jadi IN_PROGRESS.
        $task = $this->makeTask('DRAFT', 'BACKLOG', 0);
        $fresh = $this->service->updateProgress($task->id, 70, $this->user->id);
        $this->assertSame('READY', $fresh->status);
        $this->assertSame(70, $fresh->percentComplete);
    }

    public function test_legacy_in_review_is_normalized_by_progress(): void
    {
        // Execution tidak punya jalur review — status legacy IN_REVIEW ikut
        // di-derive dari progres (tidak sticky). 100% → COMPLETED.
        $task = $this->makeTask('ACTIVE', 'IN_REVIEW', 90);
        $fresh = $this->service->updateProgress($task->id, 100, $this->user->id);
        $this->assertSame('COMPLETED', $fresh->status);
    }

    public function test_blocked_is_sticky_to_progress(): void
    {
        // BLOCKED sticky — di-clear via Blockers, bukan slider.
        $task = $this->makeTask('ACTIVE', 'BLOCKED', 50);
        $fresh = $this->service->updateProgress($task->id, 80, $this->user->id);
        $this->assertSame('BLOCKED', $fresh->status);
        $this->assertSame(80, $fresh->percentComplete);
    }
}
