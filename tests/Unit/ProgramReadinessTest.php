<?php

namespace Tests\Unit;

use App\Models\Directorate;
use App\Models\KpiDefinition;
use App\Models\OrganizationalUnit;
use App\Models\Program;
use App\Models\ProgramKpiLink;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Program::readiness accessor — core fix bug #1 operational blocker.
 *
 * Sebelum fix: FE menerima `readiness: undefined` karena tidak ada accessor.
 * Setelah fix: readiness selalu present di response, dengan compute akurat
 * dari relasi workstreams.tasks + kpis.
 */
class ProgramReadinessTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private OrganizationalUnit $unit;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-RDY', 'name' => 'Direktorat Readiness']);
        $this->unit = OrganizationalUnit::create([
            'code' => 'UNIT-RDY', 'name' => 'Unit', 'directorateId' => $dir->id, 'unitType' => 'DIVISION',
        ]);
        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'owner-rdy@ptpn.test', 'userId' => 'owner-rdy',
            'passwordHash' => Hash::make('x'), 'roleType' => 'KASUBDIV',
            'isActive' => true, 'unitId' => $this->unit->id, 'directorateId' => $dir->id,
        ]);
    }

    private function newProgram(array $overrides = []): Program
    {
        return Program::create(array_merge([
            'code' => 'P-' . uniqid(),
            'name' => 'Test Program',
            'ownerId' => $this->owner->id,
            'ownerUnitId' => $this->unit->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'MEDIUM',
            'startDate' => '2026-01-01',
            'targetEndDate' => '2026-12-31',
            'approvalStatus' => 'DRAFT',
            'healthStatus' => 'GREEN',
        ], $overrides));
    }

    public function test_empty_program_returns_all_false(): void
    {
        $program = $this->newProgram();
        $r = $program->readiness;

        $this->assertFalse($r['hasWorkstream']);
        $this->assertFalse($r['hasTask']);
        $this->assertFalse($r['hasKpi']);
        $this->assertFalse($r['isReady']);
    }

    public function test_workstream_only_has_workstream_true_task_false(): void
    {
        $program = $this->newProgram();
        Workstream::create([
            'code' => 'WS-1', 'name' => 'WS 1', 'programId' => $program->id,
            'status' => 'IN_PROGRESS',
            'targetCompletion' => '2026-12-31',
        ]);

        $r = $program->fresh()->readiness;
        $this->assertTrue($r['hasWorkstream']);
        $this->assertFalse($r['hasTask']);
        $this->assertFalse($r['isReady']);
    }

    public function test_workstream_with_task_has_both_true(): void
    {
        $program = $this->newProgram();
        $ws = Workstream::create([
            'code' => 'WS-2', 'name' => 'WS 2', 'programId' => $program->id,
            'status' => 'IN_PROGRESS',
            'targetCompletion' => '2026-12-31',
        ]);
        Task::create([
            'code' => 'T-1', 'title' => 'Task 1', 'initiativeId' => $ws->id,
            'status' => 'BACKLOG', 'priority' => 'MEDIUM',
            'assignedTo' => $this->owner->id,
            'createdBy' => $this->owner->id,
            'targetCompletion' => '2026-12-31',
        ]);

        $r = $program->fresh()->readiness;
        $this->assertTrue($r['hasWorkstream']);
        $this->assertTrue($r['hasTask']);
    }

    public function test_isReady_true_only_when_all_three_pass(): void
    {
        $program = $this->newProgram();
        $ws = Workstream::create([
            'code' => 'WS-3', 'name' => 'WS 3', 'programId' => $program->id,
            'status' => 'IN_PROGRESS',
            'targetCompletion' => '2026-12-31',
        ]);
        Task::create([
            'code' => 'T-2', 'title' => 'Task', 'initiativeId' => $ws->id,
            'status' => 'BACKLOG', 'priority' => 'MEDIUM',
            'assignedTo' => $this->owner->id,
            'createdBy' => $this->owner->id,
            'targetCompletion' => '2026-12-31',
        ]);
        KpiDefinition::create([
            'code' => 'KPI-A', 'name' => 'KPI A', 'programId' => $program->id,
            'metricType' => 'PERCENTAGE', 'dataType' => 'PERCENTAGE',
            'targetValue' => 100, 'isActive' => true,
        ]);

        $r = $program->fresh()->readiness;
        $this->assertTrue($r['hasWorkstream']);
        $this->assertTrue($r['hasTask']);
        $this->assertTrue($r['hasKpi']);
        $this->assertTrue($r['isReady']);
    }

    public function test_inactive_kpi_does_not_count_for_hasKpi(): void
    {
        $program = $this->newProgram();
        KpiDefinition::create([
            'code' => 'KPI-INACTIVE', 'name' => 'Inactive', 'programId' => $program->id,
            'metricType' => 'COUNT', 'dataType' => 'INTEGER',
            'targetValue' => 10, 'isActive' => false,
        ]);

        $r = $program->fresh()->readiness;
        $this->assertFalse($r['hasKpi']);
    }

    public function test_program_kpi_link_alone_satisfies_hasKpi(): void
    {
        // Pilot DKMR pakai dua jalur input KPI: link ke APMS (ProgramKpiLink)
        // atau define internal (KpiDefinition). Checklist readiness harus
        // ter-satisfy oleh keduanya — kalau tidak, user yang sudah link APMS
        // tetap diblokir aktivasi padahal sudah cukup.
        $program = $this->newProgram();
        ProgramKpiLink::create([
            'programId' => $program->id,
            'apmsKpiCode' => 'KPI-APMS-001',
            'apmsKpiName' => 'Realisasi Capex',
            'apmsKpiBobot' => 5.0,
        ]);

        $r = $program->fresh()->readiness;
        $this->assertTrue($r['hasKpi']);
    }

    /**
     * Kontrak serialisasi BERUBAH (audit 2026-06-10): readiness TIDAK lagi di
     * $appends global — accessor-nya fallback ke 4 query exists() per program,
     * sehingga list 97 program = 388 query terukur. Sekarang: toArray() polos
     * TANPA readiness (jaga N+1 tidak balik), dan append('readiness') eksplisit
     * (pola ProgramController::show) tetap menghasilkan struktur lengkap.
     */
    public function test_readiness_not_in_bare_toArray_but_present_when_appended(): void
    {
        $program = $this->newProgram();

        $this->assertArrayNotHasKey('readiness', $program->toArray());

        $payload = $program->fresh()->append('readiness')->toArray();
        $this->assertIsArray($payload['readiness']);
        $this->assertArrayHasKey('hasWorkstream', $payload['readiness']);
        $this->assertArrayHasKey('isReady', $payload['readiness']);
    }
}
