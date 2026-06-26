<?php

namespace Tests\Feature\Meeting;

use App\Models\Blocker;
use App\Models\Directorate;
use App\Models\Meeting;
use App\Models\MeetingActionItem;
use App\Models\MeetingAttendee;
use App\Models\OrganizationalUnit;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Act → Do bridge: push action item ke Workboard + Meeting Briefing (prep).
 *
 * Sebelumnya kedua route tidak ada → tombol "→ WB" 404 dan briefing selalu
 * "unavailable", dan close-loop (action item COMPLETED → task COMPLETED) tak
 * pernah bisa menyala karena tak ada jalur yang mengisi linkedWorkItemId.
 */
class MeetingPushPrepTest extends TestCase
{
    use RefreshDatabase;

    private User $organizer;
    private User $assignee;
    private Meeting $meeting;
    private Workstream $workstream;
    private Program $program;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-PP', 'name' => 'Direktorat PP']);
        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-PP', 'name' => 'Unit PP',
            'unitType' => 'DIVISI', 'directorateId' => $dir->id,
        ]);

        $this->organizer = User::create([
            'name' => 'Organizer PP', 'email' => 'org-pp@ptpn.test',
            'userId' => 'org-pp', 'passwordHash' => Hash::make('password-123'),
            'roleType' => 'SUPERADMIN', 'isActive' => true,
            'unitId' => $unit->id, 'directorateId' => $dir->id,
        ]);
        $this->assignee = User::create([
            'name' => 'Assignee PP', 'email' => 'asg-pp@ptpn.test',
            'userId' => 'asg-pp', 'passwordHash' => Hash::make('password-123'),
            'roleType' => 'ASISTEN', 'isActive' => true,
            'unitId' => $unit->id, 'directorateId' => $dir->id,
        ]);

        $this->program = Program::create([
            'code' => 'PRG-PP', 'name' => 'Program Push Prep',
            'ownerId' => $this->organizer->id, 'ownerUnitId' => $unit->id,
            'status' => 'IN_PROGRESS', 'priority' => 'HIGH',
            'startDate' => now()->subWeek(), 'targetEndDate' => now()->addMonth(),
            'progressPercent' => 40, 'strategicAlignment' => 80,
            'healthStatus' => 'RED', 'approvalStatus' => 'ACTIVE',
        ]);
        $this->workstream = Workstream::create([
            'code' => 'WS-PP', 'programId' => $this->program->id,
            'name' => 'Workstream PP',
            'status' => 'IN_PROGRESS', 'priority' => 'HIGH',
            'progressPercent' => 0, 'targetCompletion' => '2026-12-31',
        ]);
        $this->meeting = Meeting::create([
            'title' => 'Rapat Koordinasi PP',
            'organizerId' => $this->organizer->id,
            'linkedProgramId' => $this->program->id,
            'status' => 'SCHEDULED',
            'startAt' => now()->addDay(),
            'endAt' => now()->addDay()->addHour(),
            'meetingType' => 'RAPAT_KOORDINASI',
        ]);
    }

    private function actionItem(?int $linked = null): MeetingActionItem
    {
        return MeetingActionItem::create([
            'meetingId' => $this->meeting->id,
            'title' => 'Tindak lanjut hasil rapat',
            'description' => 'Detail tindak lanjut.',
            'assignedToId' => $this->assignee->id,
            'dueDate' => now()->addWeek(),
            'status' => 'OPEN',
            'linkedWorkItemId' => $linked,
        ]);
    }

    private function pushUrl(int $itemId): string
    {
        return "/meetings/{$this->meeting->id}/action-items/{$itemId}/push";
    }

    public function test_push_creates_task_and_links_action_item(): void
    {
        $item = $this->actionItem();

        $res = $this->actingAs($this->organizer)
            ->postJson($this->pushUrl($item->id), ['workstreamId' => $this->workstream->id]);

        $res->assertCreated()->assertJsonStructure(['data' => ['taskId', 'taskCode']]);

        $taskId = $res->json('data.taskId');
        $item->refresh();
        $this->assertSame($taskId, $item->linkedWorkItemId);

        $task = Task::find($taskId);
        $this->assertSame($this->workstream->id, $task->initiativeId);
        $this->assertSame($item->title, $task->title);
        $this->assertSame($this->assignee->id, (int) $task->assignedTo);
    }

    public function test_pushed_action_item_completion_closes_the_task(): void
    {
        $item = $this->actionItem();
        $taskId = $this->actingAs($this->organizer)
            ->postJson($this->pushUrl($item->id), ['workstreamId' => $this->workstream->id])
            ->json('data.taskId');

        // Sekarang close-loop punya tautan untuk dijalankan.
        $this->actingAs($this->organizer)
            ->patchJson("/meetings/{$this->meeting->id}/action-items/{$item->id}", ['status' => 'COMPLETED'])
            ->assertOk();

        $task = Task::find($taskId);
        $this->assertSame('COMPLETED', $task->status);
        $this->assertSame(100, $task->percentComplete);
        $this->assertNotNull($task->actualCompletion);
    }

    public function test_push_rejects_already_linked_item(): void
    {
        $item = $this->actionItem();
        $this->actingAs($this->organizer)
            ->postJson($this->pushUrl($item->id), ['workstreamId' => $this->workstream->id])
            ->assertCreated();

        // Push kedua untuk item yang sama harus ditolak (idempotensi tautan).
        $this->actingAs($this->organizer)
            ->postJson($this->pushUrl($item->id), ['workstreamId' => $this->workstream->id])
            ->assertStatus(422);

        $this->assertSame(1, Task::query()->where('initiativeId', $this->workstream->id)->count());
    }

    public function test_non_organizer_cannot_push(): void
    {
        $item = $this->actionItem();

        $this->actingAs($this->assignee)
            ->postJson($this->pushUrl($item->id), ['workstreamId' => $this->workstream->id])
            ->assertForbidden();

        $item->refresh();
        $this->assertNull($item->linkedWorkItemId);
    }

    public function test_prep_returns_rsvp_program_and_continuity_shape(): void
    {
        MeetingAttendee::create(['meetingId' => $this->meeting->id, 'userId' => $this->organizer->id, 'attendeeRole' => 'ORGANIZER', 'rsvpStatus' => 'PENDING']);
        MeetingAttendee::create(['meetingId' => $this->meeting->id, 'userId' => $this->assignee->id, 'attendeeRole' => 'REQUIRED', 'rsvpStatus' => 'HADIR']);
        $third = User::create([
            'name' => 'Third PP', 'email' => 'third-pp@ptpn.test', 'userId' => 'third-pp',
            'passwordHash' => Hash::make('password-123'), 'roleType' => 'ASISTEN', 'isActive' => true,
            'unitId' => $this->organizer->unitId, 'directorateId' => $this->organizer->directorateId,
        ]);
        MeetingAttendee::create(['meetingId' => $this->meeting->id, 'userId' => $third->id, 'attendeeRole' => 'REQUIRED', 'rsvpStatus' => 'PENDING']);

        // Blocker aktif pada task di program → harus muncul di programContext.
        $task = Task::create([
            'code' => 'WI-PP1', 'initiativeId' => $this->workstream->id,
            'title' => 'Task PP', 'createdBy' => $this->organizer->id,
            'status' => 'IN_PROGRESS', 'priority' => 'HIGH', 'percentComplete' => 10,
            'targetCompletion' => '2026-09-30',
        ]);
        Blocker::create([
            'code' => 'BLK-PP1', 'workItemId' => $task->id, 'title' => 'Blocker PP',
            'severity' => 'CRITICAL', 'status' => 'OPEN', 'priority' => 'HIGH',
            'createdBy' => $this->organizer->id,
        ]);

        $res = $this->actingAs($this->organizer)->getJson("/meetings/{$this->meeting->id}/prep");

        $res->assertOk()->assertJsonStructure(['data' => [
            'meetingId',
            'rsvpSummary' => ['hadir', 'tidakHadir', 'delegasi', 'pending', 'total'],
            'programContext' => ['id', 'name', 'code', 'healthStatus', 'progressPercent', 'activeBlockers', 'kpis'],
            'continuity',
        ]]);

        // Organizer dihitung hadir + 1 attendee HADIR = 2; 1 attendee PENDING.
        $res->assertJsonPath('data.rsvpSummary.hadir', 2);
        $res->assertJsonPath('data.rsvpSummary.pending', 1);
        $res->assertJsonPath('data.rsvpSummary.total', 3);
        $res->assertJsonPath('data.programContext.id', $this->program->id);
        $this->assertCount(1, $res->json('data.programContext.activeBlockers'));
    }

    public function test_prep_without_linked_program_has_null_context(): void
    {
        $solo = Meeting::create([
            'title' => 'Rapat tanpa program', 'organizerId' => $this->organizer->id,
            'status' => 'SCHEDULED', 'startAt' => now()->addDay(), 'endAt' => now()->addDay()->addHour(),
            'meetingType' => 'RAPAT_KOORDINASI',
        ]);

        $this->actingAs($this->organizer)->getJson("/meetings/{$solo->id}/prep")
            ->assertOk()
            ->assertJsonPath('data.programContext', null);
    }
}
