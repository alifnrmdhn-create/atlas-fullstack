<?php

namespace Tests\Feature;

use App\Models\Blocker;
use App\Models\Channel;
use App\Models\ChannelMessage;
use App\Models\Directorate;
use App\Models\KpiDefinition;
use App\Models\MonthlyReport;
use App\Models\Notification;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\Program;
use App\Models\RiskMonthlyReport;
use App\Models\Task;
use App\Models\User;
use App\Models\UserStatus;
use App\Models\UserSession;
use App\Models\Workstream;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WorkspaceEndpointSmokeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $teammate;
    private Position $position;
    private Program $program;
    private Workstream $workstream;
    private Task $task;
    private MonthlyReport $monthlyReport;
    private RiskMonthlyReport $riskReport;

    protected function setUp(): void
    {
        parent::setUp();

        $directorate = Directorate::create([
            'code' => 'DIR-RUNTIME',
            'name' => 'Direktorat Runtime',
        ]);

        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-RUNTIME',
            'name' => 'Unit Runtime',
            'unitType' => 'DIVISI',
            'directorateId' => $directorate->id,
        ]);

        $this->position = Position::create([
            'code' => 'POS-RUNTIME',
            'name' => 'Runtime Lead',
            'levelCode' => 'L3',
            'roleType' => 'SUPERADMIN',
            'directorateId' => $directorate->id,
            'divisionId' => $unit->id,
            'isActive' => true,
        ]);

        $this->admin = User::create([
            'name' => 'Runtime Admin',
            'email' => 'runtime-admin@ptpn.test',
            'userId' => 'runtime-admin',
            'passwordHash' => Hash::make('old-password-123'),
            'roleType' => 'SUPERADMIN',
            'isActive' => true,
            'unitId' => $unit->id,
            'directorateId' => $directorate->id,
            'positionId' => $this->position->id,
            'positionTitle' => $this->position->name,
        ]);

        $this->teammate = User::create([
            'name' => 'Runtime Teammate',
            'email' => 'runtime-teammate@ptpn.test',
            'userId' => 'runtime-teammate',
            'passwordHash' => Hash::make('password-123'),
            'roleType' => 'ASISTEN',
            'isActive' => true,
            'unitId' => $unit->id,
            'directorateId' => $directorate->id,
        ]);

        $this->program = Program::create([
            'code' => 'PRG-RUNTIME',
            'name' => 'Runtime Program',
            'ownerId' => $this->admin->id,
            'ownerUnitId' => $unit->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'startDate' => now()->subWeek(),
            'targetEndDate' => now()->addMonth(),
            'progressPercent' => 42,
            'strategicAlignment' => 88,
            'healthStatus' => 'YELLOW',
            'approvalStatus' => 'ACTIVE',
        ]);

        $this->workstream = Workstream::create([
            'code' => 'WS-RUNTIME',
            'programId' => $this->program->id,
            'name' => 'Runtime Workstream',
            'ownerId' => $this->admin->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'startDate' => now()->subDays(3),
            'targetCompletion' => now()->addWeeks(2),
            'progressPercent' => 35,
            'healthStatus' => 'YELLOW',
        ]);

        $this->task = Task::create([
            'code' => 'WI-RUNTIME',
            'initiativeId' => $this->workstream->id,
            'title' => 'Runtime Task',
            'assignedTo' => $this->admin->id,
            'createdBy' => $this->admin->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'percentComplete' => 25,
            'targetCompletion' => now()->addWeek(),
            'healthStatus' => 'YELLOW',
            'isBlocked' => false,
        ]);

        $this->monthlyReport = MonthlyReport::create([
            'unitId' => $unit->id,
            'month' => 1,
            'year' => 2026,
            'status' => 'DRAFT',
            'submittedById' => $this->admin->id,
            'linkedProgramIds' => [$this->program->id],
        ]);

        $this->riskReport = RiskMonthlyReport::create([
            'unitId' => $unit->id,
            'month' => 2,
            'year' => 2026,
            'status' => 'DRAFT',
            'createdById' => $this->admin->id,
            'submittedById' => $this->admin->id,
        ]);

        Blocker::create([
            'code' => 'BLK-RUNTIME',
            'workItemId' => $this->task->id,
            'title' => 'Runtime Blocker',
            'severity' => 'CRITICAL',
            'createdBy' => $this->admin->id,
            'assignedTo' => $this->admin->id,
            'status' => 'OPEN',
            'priority' => 'HIGH',
        ]);

        KpiDefinition::create([
            'code' => 'KPI-RUNTIME',
            'programId' => $this->program->id,
            'name' => 'Runtime KPI',
            'metricType' => 'PERCENTAGE',
            'dataType' => 'PERCENTAGE',
            'targetValue' => 100,
            'actualValue' => 98,
            'isLeadingIndicator' => true,
            'isActive' => true,
        ]);

        $channel = Channel::create([
            'code' => 'CH-RUNTIME',
            'name' => 'Runtime Channel',
            'type' => 'PUBLIC',
            'createdBy' => $this->admin->id,
            'isArchived' => false,
        ]);

        DB::table('ChannelMember')->insert([
            'channelId' => $channel->id,
            'userId' => $this->admin->id,
            'joinedAt' => now(),
        ]);

        ChannelMessage::create([
            'channelId' => $channel->id,
            'userId' => $this->admin->id,
            'content' => 'Runtime message',
            'searchableText' => 'Runtime message',
        ]);

        UserSession::create([
            'userId' => $this->admin->id,
            'startedAt' => now()->subHour(),
            'endedAt' => now()->subMinutes(10),
            'durationMs' => 50 * 60 * 1000,
            'lastPingAt' => now()->subMinutes(10),
            'endReason' => 'logout',
        ]);

        Notification::create([
            'userId' => $this->admin->id,
            'type' => 'MENTION',
            'message' => 'Runtime mention',
            'source' => 'channel:' . $channel->id,
            'createdAt' => now(),
            'state' => 'UNREAD',
        ]);

        UserStatus::create([
            'userId' => $this->admin->id,
            'status' => 'ONLINE',
            'lastActivityAt' => now(),
        ]);

        DB::table('SavedSearch')->insert([
            'userId' => $this->admin->id,
            'name' => 'Runtime Search',
            'searchQuery' => 'runtime',
            'searchType' => 'ALL',
            'isShared' => false,
            'createdAt' => now(),
        ]);

        DB::table('role_configs')->insert([
            'role' => 'SUPERADMIN',
            'label' => 'Super Admin',
            'description' => 'Full access',
            'badgeColor' => 'bg-red-100 text-red-700',
            'updatedAt' => now(),
        ]);
    }

    public function test_workspace_overview_endpoints_return_expected_json_shapes(): void
    {
        $this->actingAs($this->admin);

        $this->getJson('/workspace/overview')
            ->assertOk()
            ->assertJsonStructure([
                'generatedAt',
                'summary' => ['totalPrograms', 'activePrograms', 'redPrograms', 'criticalBlockers', 'onlineUsers', 'unreadNotifications'],
                'dimensions' => ['strategic', 'programs', 'leadingIndicators', 'timeIntelligence', 'accountability', 'governance', 'performance', 'collaboration'],
                'recentActivity',
                'mentions',
                'onlineUsers',
            ]);

        $this->getJson('/my-work')
            ->assertOk()
            ->assertJsonStructure(['data' => ['role', 'tasks', 'blockers', 'programs']]);

        // `data` flat dihapus dari /tasks (duplikat groups — audit 2026-06-11).
        $this->getJson('/tasks')
            ->assertOk()
            ->assertJsonStructure(['groups', 'total'])
            ->assertJsonMissingPath('data');

        $this->getJson('/workstreams')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->getJson('/workstreams/' . $this->workstream->id)
            ->assertOk()
            ->assertJsonStructure(['data' => ['id', 'code', 'name', 'tasks', 'comments']]);
    }

    public function test_workspace_supporting_endpoints_return_expected_json_shapes(): void
    {
        $this->actingAs($this->admin);

        $this->getJson('/profile')
            ->assertOk()
            ->assertJsonStructure(['user', 'supervisorChain', 'subordinates', 'positionHistory']);

        $this->getJson('/users/directory')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->getJson('/users/presence')
            ->assertOk()
            ->assertJsonStructure(['users']);

        $this->getJson('/notifications?read=all')
            ->assertOk()
            ->assertJsonStructure(['notifications', 'unreadCount']);

        $this->getJson('/search/saved')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->getJson('/system/status')
            ->assertOk()
            ->assertJsonStructure(['service', 'timestamp', 'persistence'])
            ->assertJsonPath('persistence.provider', 'postgresql')
            ->assertJsonPath('persistence.mode', 'database')
            ->assertJsonPath('persistence.fallbackStore', null);

        $this->getJson('/apms/kpi')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['tahun', 'bulan', 'source', 'connected'], 'linkedPrograms']);

        $this->getJson('/role-configs')
            ->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_runtime_compatibility_endpoints_return_frontend_shapes(): void
    {
        $this->actingAs($this->admin);
        $message = ChannelMessage::query()->firstOrFail();

        // Assertion order-independent: hasil multi-tipe diurutkan by-timestamp,
        // dan fixture setUp dibuat nyaris bersamaan → posisi 0 bisa tie-break
        // nondeterministik (flaky di CI Linux yang cepat, ketahuan 2026-06-10).
        // Yang dijamin kontrak: program-nya KETEMU, bukan posisinya.
        $titles = $this->getJson('/search?q=Runtime&type=ALL&limit=10')
            ->assertOk()
            ->assertJsonStructure(['results', 'total'])
            ->json('results.*.title');
        $this->assertContains('Runtime Program', $titles);

        $this->getJson('/search?q=Runtime&type=TASKS&limit=10')
            ->assertOk()
            ->assertJsonPath('results.0.type', 'TASK');

        $this->getJson('/analytics/user-activity?range=7d')
            ->assertOk()
            ->assertJsonStructure(['data' => ['users', 'from', 'to']])
            ->assertJsonPath('data.users.0.userId', $this->admin->id);

        $this->getJson('/analytics/user-activity/' . $this->admin->id . '?range=7d')
            ->assertOk()
            ->assertJsonStructure(['data' => ['user', 'totalDurationMs', 'sessionCount', 'avgSessionDurationMs', 'lastActiveAt', 'sessions', 'dailyBreakdown', 'from', 'to']]);

        $this->getJson('/saved-messages')
            ->assertOk()
            ->assertJsonPath('data', []);

        $this->postJson('/saved-messages/' . $message->id)
            ->assertOk()
            ->assertJsonPath('data.id', $message->id);

        $this->getJson('/saved-messages')
            ->assertOk()
            ->assertJsonPath('data.0.id', $message->id);

        $this->deleteJson('/saved-messages/' . $message->id)
            ->assertOk()
            ->assertJson(['ok' => true]);

        $this->getJson('/unfurl?url=' . urlencode('https://example.com/path'))
            ->assertOk()
            ->assertJsonPath('data.siteName', 'example.com');
    }

    public function test_legacy_detail_aliases_resolve_to_inertia_pages(): void
    {
        $this->actingAs($this->admin);

        // 2026-05-21: /execution/tasks/{id} sekarang redirect ke
        // /execution?task={id} (modal mode di Workboard). URL deep link tetap
        // valid (share/bookmark), tapi visual surface single — modal expand
        // dari card. Lihat routes/web.php + WorkboardView.tsx auto-open modal.
        $this->get('/execution/tasks/' . $this->task->id)
            ->assertRedirect('/execution?task=' . $this->task->id);

        $this->get('/laporan-bulanan/' . $this->monthlyReport->id)
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('MonthlyReportDetailView'));

        // Alias '/laporan-risiko/{id}' dihapus dari routing (ATLAS bukan app
        // manajemen risiko); detail report kini di '/risk-reports/{id}'.
        $this->get('/risk-reports/' . $this->riskReport->id)
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('RiskReportDetailView'));
    }

    public function test_workspace_mutation_compatibility_endpoints_work(): void
    {
        $this->actingAs($this->admin);

        $this->putJson('/users/me/status', [
            'status' => 'AWAY',
            'statusEmoji' => ':coffee:',
            'statusMessage' => 'Focus mode',
        ])->assertOk()->assertJsonStructure(['data']);

        $this->putJson('/profile', [
            'name' => 'Runtime Admin Updated',
            'email' => 'runtime-admin-updated@ptpn.test',
        ])->assertOk()->assertJsonStructure(['user']);

        $this->postJson('/auth/change-password', [
            'currentPassword' => 'old-password-123',
            'newPassword' => 'new-password-123',
        ])->assertOk()->assertJson(['message' => 'Password updated successfully.']);

        $this->postJson('/focus-blocks', [
            'title' => 'Deep Work',
            'startAt' => now()->addHour()->toISOString(),
            'endAt' => now()->addHours(2)->toISOString(),
            'note' => 'Smoke test',
        ])->assertOk()->assertJsonStructure(['data']);

        $this->postJson('/dm/open', [
            'userId' => $this->teammate->id,
        ])->assertOk()->assertJsonStructure(['data' => ['id']]);

        $this->postJson('/users', [
            'name' => 'Runtime Created',
            'email' => 'runtime-created@ptpn.test',
            'roleType' => 'ASISTEN',
            'positionId' => $this->position->id,
        ])->assertCreated()->assertJsonStructure(['data' => ['id', 'name', 'email']]);
    }

    public function test_mutation_syncs_roletype_from_position_and_records_history(): void
    {
        $this->actingAs($this->admin);

        $kasubdivPos = Position::create([
            'code' => 'POS-KASUBDIV',
            'name' => 'Kepala Sub Divisi Uji',
            'levelCode' => 'BOD-2',
            'roleType' => 'KASUBDIV',
            'directorateId' => $this->position->directorateId,
            'divisionId' => $this->position->divisionId,
            'isActive' => true,
        ]);

        // teammate awalnya ASISTEN tanpa jabatan
        $this->assertSame('ASISTEN', $this->teammate->roleType);

        $this->patchJson("/users/{$this->teammate->id}", [
            'positionId' => $kasubdivPos->id,
            'mutationType' => 'mutation',
            'mutationReason' => 'Promosi uji',
            'skNumber' => 'SK-UJI-001',
        ])->assertOk();

        $this->teammate->refresh();
        // roleType ikut jabatan (akar bug yang diperbaiki) + jabatan tersinkron
        $this->assertSame('KASUBDIV', $this->teammate->roleType);
        $this->assertSame($kasubdivPos->id, $this->teammate->positionId);
        $this->assertSame('Kepala Sub Divisi Uji', $this->teammate->positionTitle);

        // jejak SK mutasi tercatat di position_history
        $this->assertDatabaseHas('position_history', [
            'userId' => $this->teammate->id,
            'positionId' => $kasubdivPos->id,
            'skNumber' => 'SK-UJI-001',
            'mutationType' => 'mutation',
        ]);
    }
}
