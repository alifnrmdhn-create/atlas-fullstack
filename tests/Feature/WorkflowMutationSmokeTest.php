<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WorkflowMutationSmokeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $teammate;
    private OrganizationalUnit $unit;

    protected function setUp(): void
    {
        parent::setUp();

        $directorate = Directorate::create([
            'code' => 'DIR-MUTATION',
            'name' => 'Direktorat Mutation',
        ]);

        $this->unit = OrganizationalUnit::create([
            'code' => 'UNIT-MUTATION',
            'name' => 'Unit Mutation',
            'unitType' => 'DIVISI',
            'directorateId' => $directorate->id,
        ]);

        $position = Position::create([
            'code' => 'POS-MUTATION',
            'name' => 'Mutation Lead',
            'levelCode' => 'L3',
            'roleType' => 'SUPERADMIN',
            'directorateId' => $directorate->id,
            'divisionId' => $this->unit->id,
            'isActive' => true,
        ]);

        $this->admin = User::create([
            'name' => 'Mutation Admin',
            'email' => 'mutation-admin@ptpn.test',
            'userId' => 'mutation-admin',
            'passwordHash' => Hash::make('password-123'),
            'roleType' => 'SUPERADMIN',
            'isActive' => true,
            'unitId' => $this->unit->id,
            'directorateId' => $directorate->id,
            'positionId' => $position->id,
            'positionTitle' => $position->name,
        ]);

        $this->teammate = User::create([
            'name' => 'Mutation Teammate',
            'email' => 'mutation-teammate@ptpn.test',
            'userId' => 'mutation-teammate',
            'passwordHash' => Hash::make('password-123'),
            'roleType' => 'ASISTEN',
            'isActive' => true,
            'unitId' => $this->unit->id,
            'directorateId' => $directorate->id,
        ]);
    }

    public function test_program_workboard_and_blocker_mutations_return_json(): void
    {
        $this->actingAs($this->admin);

        $programId = $this->postJson('/programs', [
            'code' => 'PRG-MUTATION',
            'name' => 'Mutation Program',
            'description' => 'Program created by mutation smoke test.',
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonth()->toDateString(),
            'ownerId' => $this->teammate->id,
            'picPersonIds' => [$this->admin->id],
            'hasNoApmsKpi' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.code', 'PRG-MUTATION')
            ->json('data.id');

        $this->assertDatabaseHas('Program', [
            'id' => $programId,
            'ownerId' => $this->teammate->id,
            'status' => 'IN_PROGRESS',
        ]);

        $this->assertDatabaseHas('entity_pics', [
            'entityType' => 'Program',
            'entityId' => $programId,
            'userId' => $this->admin->id,
            'isPrimary' => true,
        ]);

        $this->putJson("/programs/{$programId}", [
            'picPersonIds' => [$this->teammate->id],
        ])
            ->assertOk()
            ->assertJsonPath('data.picPersonIds.0', $this->teammate->id);

        $this->assertDatabaseMissing('entity_pics', [
            'entityType' => 'Program',
            'entityId' => $programId,
            'userId' => $this->admin->id,
        ]);

        $this->assertDatabaseHas('entity_pics', [
            'entityType' => 'Program',
            'entityId' => $programId,
            'userId' => $this->teammate->id,
            'isPrimary' => true,
        ]);

        $workstreamId = $this->postJson('/workstreams', [
            'programId' => $programId,
            'name' => 'Mutation Workstream',
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $this->admin->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Mutation Workstream')
            ->json('data.id');

        $phaseId = $this->postJson("/workstreams/{$workstreamId}/phases", [
            'name' => 'Mutation Phase',
            'description' => 'Phase created by mutation smoke test.',
            'status' => 'PLANNING',
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Mutation Phase')
            ->json('data.id');

        $this->putJson("/phases/{$phaseId}", ['status' => 'IN_PROGRESS'])
            ->assertOk()
            ->assertJsonPath('data.status', 'IN_PROGRESS');

        $taskId = $this->postJson('/tasks', [
            'workstreamId' => $workstreamId,
            'title' => 'Mutation Work Item',
            'priority' => 'HIGH',
            'status' => 'IN_PROGRESS',
            'targetCompletion' => now()->addWeek()->toDateString(),
            'assignedTo' => $this->teammate->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'IN_PROGRESS')
            ->json('data.id');

        $this->assertDatabaseHas('WorkItem', [
            'id' => $taskId,
            'initiativeId' => $workstreamId,
            'assignedTo' => $this->teammate->id,
        ]);

        $blockerId = $this->postJson('/blockers', [
            'taskId' => $taskId,
            'title' => 'Mutation Blocker',
            'description' => 'Blocking issue from mutation smoke test.',
            'severity' => 'HIGH',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'OPEN')
            ->json('data.id');

        $this->assertTrue(Task::findOrFail($taskId)->isBlocked);

        $this->putJson("/blockers/{$blockerId}/status", [
            'status' => 'RESOLVED',
            'resolution' => 'Resolved in mutation smoke test.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'RESOLVED');

        $this->assertFalse(Task::findOrFail($taskId)->isBlocked);

        $this->deleteJson("/phases/{$phaseId}")
            ->assertOk()
            ->assertJsonPath('ok', true);
    }

    public function test_calendar_and_channel_mutations_return_json(): void
    {
        $this->actingAs($this->admin);

        $meetingId = $this->postJson('/meetings', [
            'title' => 'Mutation Meeting',
            'description' => 'Meeting created by mutation smoke test.',
            'meetingType' => 'RAPAT_TIM',
            'startAt' => now()->addHour()->toIso8601String(),
            'endAt' => now()->addHours(2)->toIso8601String(),
            'attendees' => [
                ['userId' => $this->teammate->id, 'attendeeRole' => 'REQUIRED'],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Mutation Meeting')
            ->json('data.id');

        $this->patchJson("/meetings/{$meetingId}", ['notes' => 'Updated meeting notes.'])
            ->assertOk()
            ->assertJsonPath('data.notes', 'Updated meeting notes.');

        $decisionId = $this->postJson("/meetings/{$meetingId}/decisions", [
            'decision' => 'Proceed with mutation smoke coverage.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.decision', 'Proceed with mutation smoke coverage.')
            ->json('data.id');

        $actionItemId = $this->postJson("/meetings/{$meetingId}/action-items", [
            'title' => 'Follow up mutation smoke',
            'assignedToId' => $this->teammate->id,
            'dueDate' => now()->addDay()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'OPEN')
            ->json('data.id');

        $this->actingAs($this->teammate)
            ->postJson("/meetings/{$meetingId}/rsvp", ['rsvpStatus' => 'HADIR'])
            ->assertOk()
            ->assertJsonPath('data.rsvpStatus', 'HADIR');

        $this->actingAs($this->admin)
            ->patchJson("/meetings/{$meetingId}/action-items/{$actionItemId}", ['status' => 'COMPLETED'])
            ->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED');

        $this->deleteJson("/meetings/{$meetingId}/decisions/{$decisionId}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->deleteJson("/meetings/{$meetingId}/action-items/{$actionItemId}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $channelId = $this->postJson('/channels', [
            'name' => 'Mutation Channel',
            'description' => 'Channel created by mutation smoke test.',
            'type' => 'PUBLIC',
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Mutation Channel')
            ->json('data.id');

        $messageId = $this->postJson("/channels/{$channelId}/messages", [
            'content' => 'Mutation smoke message',
        ])
            ->assertCreated()
            ->assertJsonPath('data.content', 'Mutation smoke message')
            ->json('data.id');

        $this->putJson("/channels/{$channelId}/messages/{$messageId}", [
            'content' => 'Edited mutation smoke message',
        ])
            ->assertOk()
            ->assertJsonPath('data.content', 'Edited mutation smoke message');

        $this->deleteJson("/channels/{$channelId}/messages/{$messageId}", ['scope' => 'EVERYONE'])
            ->assertOk()
            ->assertJsonPath('ok', true);
    }

    public function test_monthly_and_risk_report_mutations_return_json(): void
    {
        $this->actingAs($this->admin);

        $monthlyReportId = $this->postJson('/monthly-reports', [
            'month' => 11,
            'year' => 2030,
            'narrativeSummary' => 'Initial monthly narrative.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.month', 11)
            ->json('data.id');

        $this->putJson("/monthly-reports/{$monthlyReportId}", [
            'narrativeSummary' => 'Updated monthly narrative.',
            'highlights' => 'Updated monthly highlights.',
        ])
            ->assertOk()
            ->assertJsonPath('data.narrativeSummary', 'Updated monthly narrative.');

        $riskReportId = $this->postJson('/risk-reports', [
            'month' => 12,
            'year' => 2030,
            'unitId' => $this->unit->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.month', 12)
            ->json('data.id');

        $this->putJson("/risk-reports/{$riskReportId}", [
            'compositeRating' => 'LOW',
            'rmiScore' => 3.5,
        ])
            ->assertOk()
            ->assertJsonPath('data.compositeRating', 'LOW');

        $this->assertDatabaseHas('RiskMonthlyReport', [
            'id' => $riskReportId,
            'compositeRating' => 'LOW',
        ]);
    }

    public function test_admin_kpi_assignment_task_and_comment_mutations_return_json(): void
    {
        $this->actingAs($this->admin);

        $directorateId = $this->postJson('/organization/directorates', [
            'code' => 'DIR-MUT-JSON',
            'name' => 'Direktorat Mutation JSON',
            'isActive' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.code', 'DIR-MUT-JSON')
            ->json('data.id');

        $this->patchJson("/organization/directorates/{$directorateId}", [
            'name' => 'Direktorat Mutation JSON Updated',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Direktorat Mutation JSON Updated');

        $kpiId = $this->postJson('/kpis', [
            'code' => 'KPI-MUT-JSON',
            'name' => 'Mutation JSON KPI',
            'metricType' => 'PERCENTAGE',
            'targetValue' => 100,
            'unitOfMeasure' => '%',
            'reviewFrequency' => 'MONTHLY',
            'isLeadingIndicator' => true,
            'isActive' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.code', 'KPI-MUT-JSON')
            ->json('data.id');

        // Model casts targetValue/actualValue ke 'float' (lihat KpiDefinition
        // $casts) — JSON serialize-nya number `95`, BUKAN string `'95.000000'`.
        // assertJsonPath strict ===, jadi expected harus integer.
        $this->patchJson("/kpis/{$kpiId}", ['targetValue' => 95])
            ->assertOk()
            ->assertJsonPath('data.targetValue', 95);

        $this->postJson("/kpis/{$kpiId}/values", [
            'measurementDate' => now()->toDateString(),
            'actualValue' => 96,
        ])
            ->assertCreated()
            ->assertJsonPath('data.actualValue', 96);

        $assignmentId = $this->postJson('/assignments', [
            'title' => 'Mutation JSON Assignment',
            'description' => 'Assignment created by mutation smoke test.',
            'priority' => 'HIGH',
            'assigneeId' => $this->teammate->id,
            'watcherIds' => [],
            'evidenceRequired' => false,
            'isPrivate' => false,
            // dueDate jadi required di AssignmentController (lihat line 71).
            // +7 hari supaya satisfy `after:today` rule.
            'dueDate' => now()->addDays(7)->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Mutation JSON Assignment')
            ->json('data.id');

        $this->patchJson("/assignments/{$assignmentId}", [
            'title' => 'Mutation JSON Assignment Updated',
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Mutation JSON Assignment Updated');

        $this->postJson("/assignments/{$assignmentId}/transition", ['action' => 'ACKNOWLEDGE'])
            ->assertOk()
            ->assertJsonPath('data.status', 'DIKERJAKAN');

        $attachmentId = $this->postJson("/assignments/{$assignmentId}/attachments", [
            'type' => 'NOTE',
            'description' => 'Mutation JSON evidence note.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.type', 'NOTE')
            ->json('data.id');

        $this->deleteJson("/assignments/{$assignmentId}/attachments/{$attachmentId}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $programId = $this->postJson('/programs', [
            'code' => 'PRG-MUT-JSON',
            'name' => 'Mutation JSON Program',
            'priority' => 'HIGH',
            'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonth()->toDateString(),
            'ownerId' => $this->admin->id,
            'hasNoApmsKpi' => true,
        ])
            ->assertCreated()
            ->json('data.id');

        $workstreamId = $this->postJson('/workstreams', [
            'programId' => $programId,
            'name' => 'Mutation JSON Workstream',
            'priority' => 'MEDIUM',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
        ])
            ->assertCreated()
            ->json('data.id');

        $taskId = $this->postJson('/tasks', [
            'workstreamId' => $workstreamId,
            'title' => 'Mutation JSON Task',
            'priority' => 'MEDIUM',
            'status' => 'IN_PROGRESS',
            'targetCompletion' => now()->addWeek()->toDateString(),
        ])
            ->assertCreated()
            ->json('data.id');

        $this->patchJson("/tasks/{$taskId}", ['description' => 'Updated task description.'])
            ->assertOk()
            ->assertJsonPath('data.description', 'Updated task description.');

        $subTaskId = $this->postJson("/tasks/{$taskId}/subtasks", ['title' => 'Mutation JSON Subtask'])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Mutation JSON Subtask')
            ->json('data.id');

        $this->patchJson("/tasks/{$taskId}/subtasks/{$subTaskId}/toggle", [])
            ->assertOk()
            ->assertJsonPath('data.isCompleted', true);

        $commentId = $this->postJson("/tasks/{$taskId}/comments", [
            'commentText' => 'Mutation JSON comment',
        ])
            ->assertCreated()
            ->assertJsonPath('data.commentText', 'Mutation JSON comment')
            ->json('data.id');

        $this->putJson("/comments/{$commentId}", ['commentText' => 'Edited mutation JSON comment'])
            ->assertOk()
            ->assertJsonPath('data.commentText', 'Edited mutation JSON comment');

        $this->postJson("/comments/{$commentId}/reactions", ['emoji' => ':thumbsup:'])
            ->assertOk()
            ->assertJsonPath('data.reactions.:thumbsup:.0', $this->admin->id);

        $this->deleteJson("/comments/{$commentId}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->deleteJson("/tasks/{$taskId}/subtasks/{$subTaskId}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->deleteJson("/organization/directorates/{$directorateId}")
            ->assertOk()
            ->assertJsonPath('ok', true);
    }

    public function test_program_detail_includes_workstream_phases_and_entity_pics(): void
    {
        $this->actingAs($this->admin);

        // Buat program dengan PIC
        $programId = $this->postJson('/programs', [
            'code'        => 'PRG-DETAIL',
            'name'        => 'Detail Test Program',
            'priority'    => 'HIGH',
            'startDate'   => now()->toDateString(),
            'targetEndDate' => now()->addMonth()->toDateString(),
            'picPersonIds' => [$this->teammate->id],
            'hasNoApmsKpi' => true,
        ])
            ->assertCreated()
            ->json('data.id');

        // Buat workstream dengan PIC
        $wsId = $this->postJson('/workstreams', [
            'programId'        => $programId,
            'name'             => 'Detail WS',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'picPersonIds'     => [$this->admin->id],
        ])
            ->assertCreated()
            ->json('data.id');

        // Buat phase dengan PIC
        $this->postJson("/workstreams/{$wsId}/phases", [
            'name'         => 'Detail Phase',
            'picPersonIds' => [$this->teammate->id],
        ])->assertCreated();

        // entity_pics tersync untuk workstream
        $this->assertDatabaseHas('entity_pics', [
            'entityType' => 'Initiative',
            'entityId'   => $wsId,
            'userId'     => $this->admin->id,
        ]);

        // GET /programs/:id harus berhasil (bukan 500) dan mengandung workstreams + phases
        $detail = $this->getJson("/programs/{$programId}")
            ->assertOk()
            ->json('data');

        $this->assertNotEmpty($detail['workstreams'], 'Workstreams harus ada');
        $ws = collect($detail['workstreams'])->firstWhere('id', $wsId);
        $this->assertNotNull($ws, 'Workstream yang dibuat harus ada di detail');
        $this->assertNotEmpty($ws['phases'], 'Phases harus ter-load di workstream');

        // picPersonIds dari entity_pics (accessor)
        $this->assertEquals([$this->teammate->id], $detail['picPersonIds']);
        $this->assertEquals([$this->admin->id], $ws['picPersonIds']);

        // readiness WAJIB ada di payload DETAIL (di-append eksplisit di
        // ProgramController::show sejak dikeluarkan dari $appends global —
        // fix N+1 388-query di list, audit 2026-06-10). PDV memakai ini
        // untuk checklist aktivasi.
        $this->assertArrayHasKey('readiness', $detail);
        $this->assertArrayHasKey('isReady', $detail['readiness']);
    }
}
