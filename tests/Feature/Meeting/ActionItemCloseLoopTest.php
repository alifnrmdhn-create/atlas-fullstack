<?php

namespace Tests\Feature\Meeting;

use App\Models\Directorate;
use App\Models\Meeting;
use App\Models\MeetingActionItem;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Isu #11 — Act→Do close-loop. When a meeting action item that's linked
 * to a WorkItem (task) is marked COMPLETED, the task auto-transitions to
 * COMPLETED / percentComplete=100 / actualCompletion=now.
 *
 * One-way: reopening the action item does NOT revert the task (to avoid
 * clobbering any manual progress the user might have made downstream).
 */
class ActionItemCloseLoopTest extends TestCase
{
    use RefreshDatabase;

    private User $organizer;
    private User $assignee;
    private Meeting $meeting;
    private Task $task;
    private Workstream $workstream;
    private Program $program;

    protected function setUp(): void
    {
        parent::setUp();

        $directorate = Directorate::create(['code' => 'DIR-LOOP', 'name' => 'Direktorat Loop']);
        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-LOOP', 'name' => 'Unit Loop',
            'unitType' => 'DIVISI', 'directorateId' => $directorate->id,
        ]);
        $position = Position::create([
            'code' => 'POS-LOOP', 'name' => 'Lead Loop', 'levelCode' => 'L3',
            'roleType' => 'SUPERADMIN',
            'directorateId' => $directorate->id, 'divisionId' => $unit->id, 'isActive' => true,
        ]);

        $this->organizer = User::create([
            'name' => 'Organizer Loop', 'email' => 'org-loop@ptpn.test',
            'userId' => 'org-loop', 'passwordHash' => Hash::make('password-123'),
            'roleType' => 'SUPERADMIN', 'isActive' => true,
            'unitId' => $unit->id, 'directorateId' => $directorate->id,
            'positionId' => $position->id, 'positionTitle' => $position->name,
        ]);
        $this->assignee = User::create([
            'name' => 'Assignee Loop', 'email' => 'asg-loop@ptpn.test',
            'userId' => 'asg-loop', 'passwordHash' => Hash::make('password-123'),
            'roleType' => 'ASISTEN', 'isActive' => true,
            'unitId' => $unit->id, 'directorateId' => $directorate->id,
        ]);

        $this->program = Program::create([
            'code' => 'PRG-LOOP', 'name' => 'Program Close Loop',
            'ownerId' => $this->organizer->id, 'ownerUnitId' => $unit->id,
            'status' => 'IN_PROGRESS', 'priority' => 'HIGH',
            'startDate' => now()->subWeek(), 'targetEndDate' => now()->addMonth(),
            'progressPercent' => 30, 'strategicAlignment' => 80,
            'healthStatus' => 'GREEN', 'approvalStatus' => 'ACTIVE',
        ]);
        $this->workstream = Workstream::create([
            'code' => 'WS-LOOP', 'programId' => $this->program->id,
            'name' => 'Workstream Loop',
            'status' => 'IN_PROGRESS', 'priority' => 'HIGH',
            'progressPercent' => 0, 'targetCompletion' => '2026-12-31',
        ]);
        $this->task = Task::create([
            'code' => 'WI-LOOP', 'initiativeId' => $this->workstream->id,
            'title' => 'Task linked to action item',
            'createdBy' => $this->organizer->id,
            'assignedTo' => $this->assignee->id,
            'status' => 'IN_PROGRESS', 'priority' => 'HIGH',
            'percentComplete' => 40,
            'targetCompletion' => '2026-06-30',
        ]);
        $this->meeting = Meeting::create([
            'title' => 'Meeting Close Loop',
            'organizerId' => $this->organizer->id,
            'status' => 'COMPLETED',
            'startAt' => now()->subDay(),
            'endAt' => now()->subDay()->addHour(),
            'meetingType' => 'RAPAT_KOORDINASI',
        ]);
    }

    private function makeActionItem(?int $linkedTaskId = null, string $status = 'OPEN'): MeetingActionItem
    {
        return MeetingActionItem::create([
            'meetingId' => $this->meeting->id,
            'title' => 'Selesaikan task X minggu ini',
            'description' => null,
            'assignedToId' => $this->assignee->id,
            'dueDate' => now()->addWeek(),
            'status' => $status,
            'linkedWorkItemId' => $linkedTaskId,
        ]);
    }

    public function test_completing_action_item_propagates_to_linked_task(): void
    {
        $item = $this->makeActionItem($this->task->id);

        $response = $this->actingAs($this->organizer)
            ->patchJson("/meetings/{$this->meeting->id}/action-items/{$item->id}", [
                'status' => 'COMPLETED',
            ]);

        $response->assertOk();
        $this->task->refresh();
        $this->assertSame('COMPLETED', $this->task->status);
        $this->assertSame(100, $this->task->percentComplete);
        $this->assertNotNull($this->task->actualCompletion);
    }

    public function test_no_propagation_when_action_item_has_no_linked_task(): void
    {
        $item = $this->makeActionItem(null);

        $response = $this->actingAs($this->organizer)
            ->patchJson("/meetings/{$this->meeting->id}/action-items/{$item->id}", [
                'status' => 'COMPLETED',
            ]);

        $response->assertOk();
        $this->task->refresh();
        $this->assertSame('IN_PROGRESS', $this->task->status);
        $this->assertSame(40, $this->task->percentComplete);
    }

    public function test_no_propagation_when_task_already_cancelled(): void
    {
        $this->task->update(['status' => 'CANCELLED']);
        $item = $this->makeActionItem($this->task->id);

        $response = $this->actingAs($this->organizer)
            ->patchJson("/meetings/{$this->meeting->id}/action-items/{$item->id}", [
                'status' => 'COMPLETED',
            ]);

        $response->assertOk();
        $this->task->refresh();
        $this->assertSame('CANCELLED', $this->task->status);
        $this->assertSame(40, $this->task->percentComplete);
    }

    public function test_no_propagation_when_task_already_completed(): void
    {
        $this->task->update(['status' => 'COMPLETED', 'percentComplete' => 100]);
        $earlyCompletion = $this->task->actualCompletion;
        $item = $this->makeActionItem($this->task->id);

        $response = $this->actingAs($this->organizer)
            ->patchJson("/meetings/{$this->meeting->id}/action-items/{$item->id}", [
                'status' => 'COMPLETED',
            ]);

        $response->assertOk();
        $this->task->refresh();
        $this->assertSame('COMPLETED', $this->task->status);
        // actualCompletion should NOT be overwritten if it was already set
        if ($earlyCompletion !== null) {
            $this->assertEquals($earlyCompletion, $this->task->actualCompletion);
        }
    }

    public function test_reopening_action_item_does_not_revert_task(): void
    {
        $item = $this->makeActionItem($this->task->id, 'COMPLETED');
        // Pre-set task as COMPLETED (simulating propagation already happened)
        $this->task->update([
            'status' => 'COMPLETED',
            'percentComplete' => 100,
            'actualCompletion' => now()->subHour(),
        ]);

        $response = $this->actingAs($this->organizer)
            ->patchJson("/meetings/{$this->meeting->id}/action-items/{$item->id}", [
                'status' => 'IN_PROGRESS',
            ]);

        $response->assertOk();
        $this->task->refresh();
        // One-way: task tetap COMPLETED meskipun action item reopen.
        $this->assertSame('COMPLETED', $this->task->status);
        $this->assertSame(100, $this->task->percentComplete);
    }

    public function test_status_unchanged_actionitem_does_not_trigger_propagation(): void
    {
        // Update title only (no status change), task should not be touched.
        $item = $this->makeActionItem($this->task->id);

        $response = $this->actingAs($this->organizer)
            ->patchJson("/meetings/{$this->meeting->id}/action-items/{$item->id}", [
                'title' => 'Judul baru (no status change)',
            ]);

        $response->assertOk();
        $this->task->refresh();
        $this->assertSame('IN_PROGRESS', $this->task->status);
        $this->assertSame(40, $this->task->percentComplete);
    }
}
