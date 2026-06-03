<?php

namespace Tests\Feature\Program;

use App\Models\Directorate;
use App\Models\KpiDefinition;
use App\Models\KpiValue;
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

    public function test_charter_returns_json_for_xhr_requests(): void
    {
        // Multi-program PPTX exporter relies on getting raw payload (not
        // an Inertia HTML page) — this path is gated by Accept header.
        $response = $this->actingAs($this->admin)
            ->getJson("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => ['program', 'activities', 'status', 'kpi', 'latestProgressLog', 'kpiHistory'],
        ]);
        $response->assertJsonPath('data.program.code', 'PRG-SCR');
        $response->assertJsonPath('data.program.pillar', 'COLLECTING_MORE');
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

    public function test_program_without_kpi_definition_returns_null_kpi(): void
    {
        // kpi=null karena belum ada KpiDefinition — BUKAN karena kelompok
        // non-scorecard (gate kelompok sudah dibuka, lihat buildKpiBlock).
        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->nonScorecardProgram->id}/charter");

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->where('kpi', null)
            ->where('program.pillar', 'ENABLER')
            ->where('program.pillarLabel', 'Program Enabler')
        );
    }

    public function test_non_scorecard_program_with_internal_kpi_shows_kpi_block(): void
    {
        // KPI non-APMS/internal yang didefinisikan owner pada program
        // non-scorecard HARUS tampil di Charter (regresi gate kelompok).
        KpiDefinition::create([
            'code' => 'KPI-INTERNAL-NSC',
            'programId' => $this->nonScorecardProgram->id,
            'name' => 'Ketepatan Penerbitan Surat Arahan',
            'metricType' => 'PERCENTAGE',
            'dataType' => 'DECIMAL',
            'targetValue' => 100,
            'unitOfMeasure' => '%',
            'isActive' => true,
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson("/programs/{$this->nonScorecardProgram->id}/charter");

        $response->assertOk();
        $response->assertJsonPath('data.kpi.name', 'Ketepatan Penerbitan Surat Arahan');
        $response->assertJsonPath('data.kpi.target', 100);
        $response->assertJsonPath('data.kpi.unit', '%');
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

    public function test_status_block_counts_completed_tasks(): void
    {
        $workstream = Workstream::create([
            'code' => 'WS-CHTR-02',
            'programId' => $this->scorecardProgram->id,
            'name' => 'Workstream Counter',
            'ownerId' => $this->admin->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'progressPercent' => 0,
            'targetCompletion' => '2026-12-31',
        ]);
        // 2 done, 1 in-progress
        foreach (['DONE', 'DONE', 'IN_PROGRESS'] as $i => $status) {
            Task::create([
                'code' => "WI-COUNT-$i",
                'initiativeId' => $workstream->id,
                'title' => "Task counter $i",
                'createdBy' => $this->admin->id,
                'status' => $status,
                'priority' => 'MEDIUM',
                'percentComplete' => $status === 'DONE' ? 100 : 50,
                'targetCompletion' => '2026-06-30',
                'plannedWeeks' => [10, 11],
                'actualWeeks' => $status === 'DONE' ? [10, 11] : [10],
            ]);
        }

        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->scorecardProgram->id}/charter");

        $response->assertInertia(fn ($page) => $page
            ->where('status.totalCount', 3)
            ->where('status.completedCount', 2)
        );
    }

    public function test_kpi_history_returns_monthly_rows_for_active_kpis(): void
    {
        $kpi = KpiDefinition::create([
            'code' => 'KPI-CHTR-EBITDA',
            'programId' => $this->scorecardProgram->id,
            'name' => 'EBITDA',
            'metricType' => 'OUTCOME',
            'dataType' => 'CURRENCY',
            'targetValue' => 100.0,
            'reviewFrequency' => 'MONTHLY',
            'unitOfMeasure' => 'Rp Triliun',
            'isActive' => true,
        ]);

        // Two months of data — Jan and Feb 2026
        KpiValue::create([
            'kpiDefinitionId' => $kpi->id,
            'measurementDate' => '2026-01-31',
            'targetValue' => 8.0,
            'actualValue' => 8.5, // above
        ]);
        KpiValue::create([
            'kpiDefinitionId' => $kpi->id,
            'measurementDate' => '2026-02-28',
            'targetValue' => 16.0,
            'actualValue' => 12.0, // below
        ]);

        $response = $this->actingAs($this->admin)
            ->get("/programs/{$this->scorecardProgram->id}/charter");

        // PHP's json_encode collapses 8.0 → "8" so int comparisons are
        // safer than float literals across the wire.
        $response->assertInertia(fn ($page) => $page
            ->has('kpiHistory.rows', 1)
            ->where('kpiHistory.rows.0.label', 'EBITDA (Rp Triliun)')
            ->where('kpiHistory.rows.0.months.Jan.target', 8)
            ->where('kpiHistory.rows.0.months.Jan.real', 8.5)
            ->where('kpiHistory.rows.0.months.Jan.aboveTarget', true)
            ->where('kpiHistory.rows.0.months.Feb.target', 16)
            ->where('kpiHistory.rows.0.months.Feb.real', 12)
            ->where('kpiHistory.rows.0.months.Feb.aboveTarget', false)
            ->where('kpiHistory.rows.0.months.Mar.target', null)
            ->where('kpiHistory.rows.0.months.Mar.real', null)
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
