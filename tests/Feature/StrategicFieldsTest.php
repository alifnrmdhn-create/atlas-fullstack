<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Charter View Phase 1 — Field Strategis & Pilar.
 *
 * Verifies the 5-value pilarStrategis enum (COLLECTING_MORE +
 * NON_SCORECARD added to existing 3) and strategicObjective free-text
 * field both round-trip through PUT /programs/{id}.
 */
class StrategicFieldsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Program $program;

    protected function setUp(): void
    {
        parent::setUp();

        $directorate = Directorate::create([
            'code' => 'DIR-STRAT',
            'name' => 'Direktorat Strategis',
        ]);

        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-STRAT',
            'name' => 'Unit Strategis',
            'unitType' => 'DIVISI',
            'directorateId' => $directorate->id,
        ]);

        $position = Position::create([
            'code' => 'POS-STRAT',
            'name' => 'Strategic Lead',
            'levelCode' => 'L3',
            'roleType' => 'SUPERADMIN',
            'directorateId' => $directorate->id,
            'divisionId' => $unit->id,
            'isActive' => true,
        ]);

        $this->admin = User::create([
            'name' => 'Strategic Admin',
            'email' => 'strategic-admin@ptpn.test',
            'userId' => 'strategic-admin',
            'passwordHash' => Hash::make('password-123'),
            'roleType' => 'SUPERADMIN',
            'isActive' => true,
            'unitId' => $unit->id,
            'directorateId' => $directorate->id,
            'positionId' => $position->id,
            'positionTitle' => $position->name,
        ]);

        $this->program = Program::create([
            'code' => 'PRG-STRAT',
            'name' => 'Program Strategis',
            'ownerId' => $this->admin->id,
            'ownerUnitId' => $unit->id,
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'startDate' => now()->subWeek(),
            'targetEndDate' => now()->addMonth(),
            'progressPercent' => 10,
            'strategicAlignment' => 80,
            'healthStatus' => 'GREEN',
            'approvalStatus' => 'ACTIVE',
        ]);
    }

    public function test_config_pillars_has_five_canonical_values(): void
    {
        $pillars = config('atlas-thresholds.pillars');

        $this->assertIsArray($pillars);
        $this->assertSame([
            'COLLECTING_MORE',
            'SPENDING_BETTER',
            'INNOVATIVE_FINANCING',
            'ENABLER',
            'NON_SCORECARD',
        ], array_keys($pillars));
    }

    public function test_can_set_new_pillar_collecting_more(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson("/programs/{$this->program->id}", [
                'pilarStrategis' => 'COLLECTING_MORE',
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('Program', [
            'id' => $this->program->id,
            'pilarStrategis' => 'COLLECTING_MORE',
        ]);
    }

    public function test_can_set_new_pillar_non_scorecard(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson("/programs/{$this->program->id}", [
                'pilarStrategis' => 'NON_SCORECARD',
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('Program', [
            'id' => $this->program->id,
            'pilarStrategis' => 'NON_SCORECARD',
        ]);
    }

    public function test_existing_pillar_values_still_accepted(): void
    {
        foreach (['ENABLER', 'SPENDING_BETTER', 'INNOVATIVE_FINANCING'] as $value) {
            $response = $this->actingAs($this->admin)
                ->putJson("/programs/{$this->program->id}", [
                    'pilarStrategis' => $value,
                ]);

            $response->assertOk();
            $this->assertDatabaseHas('Program', [
                'id' => $this->program->id,
                'pilarStrategis' => $value,
            ]);
        }
    }

    public function test_strategic_objective_persists(): void
    {
        $objective = 'Efektivitas Pengawasan Pendanaan Pemerintah';

        $response = $this->actingAs($this->admin)
            ->putJson("/programs/{$this->program->id}", [
                'strategicObjective' => $objective,
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('Program', [
            'id' => $this->program->id,
            'strategicObjective' => $objective,
        ]);
    }

    public function test_invalid_pillar_rejected(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson("/programs/{$this->program->id}", [
                'pilarStrategis' => 'NOT_A_REAL_PILLAR',
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['pilarStrategis']);

        $this->program->refresh();
        $this->assertNull($this->program->pilarStrategis);
    }

    public function test_null_pillar_allowed(): void
    {
        // First set a value
        $this->program->update(['pilarStrategis' => 'ENABLER']);

        // Now clear it
        $response = $this->actingAs($this->admin)
            ->putJson("/programs/{$this->program->id}", [
                'pilarStrategis' => null,
            ]);

        $response->assertOk();
        $this->program->refresh();
        $this->assertNull($this->program->pilarStrategis);
    }

    public function test_pillar_and_objective_persist_together(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson("/programs/{$this->program->id}", [
                'pilarStrategis' => 'COLLECTING_MORE',
                'strategicObjective' => 'Mengoptimalkan penerimaan negara dari ekspor sawit.',
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('Program', [
            'id' => $this->program->id,
            'pilarStrategis' => 'COLLECTING_MORE',
            'strategicObjective' => 'Mengoptimalkan penerimaan negara dari ekspor sawit.',
        ]);
    }
}
