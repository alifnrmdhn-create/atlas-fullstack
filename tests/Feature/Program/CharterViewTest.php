<?php

namespace Tests\Feature\Program;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\Program;
use App\Models\ProgramProgressLog;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Charter View Phase 2 — read-only mode at /programs/{id}/charter.
 *
 * Verifies:
 *   - route renders Inertia page with expected payload shape
 *   - guest user is redirected to login
 *   - non-scorecard program degrades gracefully (kpi block = null)
 */
class CharterViewTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Program $scorecardProgram;
    private Program $nonScorecardProgram;
    private OrganizationalUnit $unit;

    protected function setUp(): void
    {
        parent::setUp();

        $directorate = Directorate::create([
            'code' => 'DIR-CHTR',
            'name' => 'Direktorat Charter',
        ]);

        $this->unit = OrganizationalUnit::create([
            'code' => 'UNIT-CHTR',
            'name' => 'Divisi Charter',
            'unitType' => 'DIVISI',
            'directorateId' => $directorate->id,
        ]);

        $position = Position::create([
            'code' => 'POS-CHTR',
            'name' => 'Kepala Divisi Charter',
            'levelCode' => 'L3',
            'roleType' => 'SUPERADMIN',
            'directorateId' => $directorate->id,
            'divisionId' => $this->unit->id,
            'isActive' => true,
        ]);

        $this->admin = User::create([
            'name' => 'Admin Charter',
            'email' => 'admin-charter@ptpn.test',
            'userId' => 'admin-charter',
            'passwordHash' => Hash::make('password-123'),
            'roleType' => 'SUPERADMIN',
            'isActive' => true,
            'unitId' => $this->unit->id,
            'directorateId' => $directorate->id,
            'positionId' => $position->id,
            'positionTitle' => $position->name,
        ]);

        $this->scorecardProgram = Program::create([
            'code' => 'PRG-SCR',
            'name' => 'Program Scorecard Test',
            'ownerId' => $this->admin->id,
            'ownerUnitId' => $this->unit->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'startDate' => '2026-01-01',
            'targetEndDate' => '2026-12-31',
            'progressPercent' => 30,
            'strategicAlignment' => 90,
            'healthStatus' => 'GREEN',
            'approvalStatus' => 'ACTIVE',
            'kelompok' => 'SCORECARD',
            'pilarStrategis' => 'COLLECTING_MORE',
            'strategicObjective' => 'Efektivitas Pengawasan Pendanaan Pemerintah',
        ]);

        $this->nonScorecardProgram = Program::create([
            'code' => 'PRG-NSC',
            'name' => 'Program Non-Scorecard Test',
            'ownerId' => $this->admin->id,
            'ownerUnitId' => $this->unit->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'MEDIUM',
            'startDate' => '2026-02-01',
            'targetEndDate' => '2026-11-30',
            'progressPercent' => 50,
            'strategicAlignment' => 70,
            'healthStatus' => 'YELLOW',
            'approvalStatus' => 'ACTIVE',
            'kelompok' => 'NON_SCORECARD',
            'pilarStrategis' => 'ENABLER',
        ]);
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $response = $this->get("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertRedirect('/login');
    }

    public function test_authenticated_user_can_view_charter_page(): void
    {
        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->component('Programs/Charter')
            ->has('program')
            ->has('activities')
            ->has('status')
            ->has('latestProgressLog')
            ->has('kpiHistory')
        );
    }

    public function test_charter_program_block_carries_strategic_fields(): void
    {
        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertInertia(fn ($page) => $page
            ->where('program.code', 'PRG-SCR')
            ->where('program.name', 'Program Scorecard Test')
            ->where('program.strategicObjective', 'Efektivitas Pengawasan Pendanaan Pemerintah')
            ->where('program.pillar', 'COLLECTING_MORE')
            ->where('program.pillarLabel', 'Collecting More')
            ->where('program.divisionName', 'Divisi Charter')
            ->where('program.directorateName', 'Direktorat Charter')
        );
    }

    public function test_non_scorecard_program_returns_null_kpi(): void
    {
        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->nonScorecardProgram->id}/charter");

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->where('kpi', null)
            ->where('program.pillar', 'ENABLER')
            ->where('program.pillarLabel', 'Program Enabler')
        );
    }

    public function test_health_status_maps_to_charter_vocabulary(): void
    {
        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertInertia(fn ($page) => $page
            ->where('status.health', 'ON_TRACK') // GREEN → ON_TRACK
        );

        $this->nonScorecardProgram->update(['healthStatus' => 'RED']);
        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->nonScorecardProgram->id}/charter");
        $response->assertInertia(fn ($page) => $page
            ->where('status.health', 'TERLAMBAT') // RED → TERLAMBAT
        );
    }

    public function test_activities_derive_monthly_target_and_realized_from_weeks(): void
    {
        $workstream = Workstream::create([
            'code' => 'WS-CHTR-01',
            'programId' => $this->scorecardProgram->id,
            'name' => 'Audit Penerimaan',
            'ownerId' => $this->admin->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'progressPercent' => 0,
            'targetCompletion' => '2026-12-31',
        ]);

        Task::create([
            'code' => 'WI-CHTR-01',
            'initiativeId' => $workstream->id,
            'title' => 'Penyusunan kebijakan audit penerimaan',
            'output' => 'Dokumen kebijakan',
            'createdBy' => $this->admin->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'percentComplete' => 0,
            'targetCompletion' => '2026-06-30',
            'plannedWeeks' => [23, 24, 25], // June 2026
            'actualWeeks' => [23],          // realized in June
        ]);

        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertInertia(fn ($page) => $page
            ->has('activities', 1)
            ->where('activities.0.name', 'Penyusunan kebijakan audit penerimaan')
            ->where('activities.0.workstream', 'Audit Penerimaan')
            ->where('activities.0.deliverable', 'Dokumen kebijakan')
            ->where('activities.0.months.Jun.target', true)
            ->where('activities.0.months.Jun.realized', true)
            ->where('activities.0.months.Jul.target', false)
            ->where('activities.0.months.Jul.realized', false)
        );
    }

    public function test_latest_progress_log_surfaces_when_present(): void
    {
        ProgramProgressLog::create([
            'programId' => $this->scorecardProgram->id,
            'period' => '2026-W17',
            'healthAtTime' => 'on_track',
            'narrative' => 'Inisiasi audit penerimaan TW1 berjalan sesuai jadwal.',
            'kendala' => 'Data Q1 dari unit afdeling masih terlambat 2 minggu.',
            'correctiveAction' => 'Eskalasi ke kepala unit.',
            'nextStep' => 'Review konsolidasi data minggu depan.',
            'dukunganDibutuhkan' => 'Akses langsung ke sistem afdeling.',
            'createdById' => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertInertia(fn ($page) => $page
            ->where('latestProgressLog.updateNote', 'Inisiasi audit penerimaan TW1 berjalan sesuai jadwal.')
            ->where('latestProgressLog.problemIdentification', 'Data Q1 dari unit afdeling masih terlambat 2 minggu.')
            ->where('latestProgressLog.correctiveAction', 'Eskalasi ke kepala unit.')
            ->where('latestProgressLog.nextStep', 'Review konsolidasi data minggu depan.')
            ->where('latestProgressLog.supportNeeded', 'Akses langsung ke sistem afdeling.')
        );
    }
}
