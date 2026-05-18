<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\DirektoratScorecard;
use App\Models\OrganizationalUnit;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Executive Summary route (Gap #1) — /executive renders Inertia page
 * dengan payload composite: KPI grid, status program, perhatian khusus,
 * insight, leaderboard, trend.
 */
class ExecutiveSummaryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Directorate $directorate;

    protected function setUp(): void
    {
        parent::setUp();

        $this->directorate = Directorate::create([
            'code' => 'DIR-EXE',
            'name' => 'Direktorat Executive Test',
        ]);

        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-EXE',
            'name' => 'Unit Executive',
            'directorateId' => $this->directorate->id,
            'unitType' => 'DIVISION',
        ]);

        $this->admin = User::create([
            'name'         => 'Admin Exec',
            'email'        => 'admin-exec@ptpn.test',
            'userId'       => 'admin-exec',
            'passwordHash' => Hash::make('password-123'),
            'roleType'     => 'SUPERADMIN',
            'isActive'     => true,
            'unitId'       => $unit->id,
            'directorateId' => $this->directorate->id,
        ]);
    }

    public function test_guest_redirected_to_login(): void
    {
        $this->get('/executive')->assertRedirect('/login');
    }

    public function test_authenticated_user_can_view_executive_summary(): void
    {
        DirektoratScorecard::create([
            'directorateId' => $this->directorate->id,
            'periode'       => now()->format('Y-m'),
            'nilai'         => 102.7,
        ]);

        $this->actingAs($this->admin)
            ->get('/executive')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('ExecutiveSummaryView')
                ->has('direktoratGrid')
                ->has('trend.periodes', 6)
                ->has('programStatusBreakdown', fn ($snap) => $snap
                    ->has('total')->has('onTrack')->has('atRisk')
                    ->has('terlambat')->has('completed')
                    ->has('pctOnTrack')->has('pctAtRisk')
                    ->has('pctTerlambat')->has('pctCompleted')
                )
                ->has('insight.positif')
                ->has('insight.perhatian')
                ->has('leaderboard.BOD-1')
                ->has('leaderboard.BOD-2')
                ->has('leaderboard.BOD-3')
                ->has('perhatianKhusus')
                ->has('periode')
            );
    }

    public function test_program_status_breakdown_counts_correctly(): void
    {
        $this->seedProgram(['code' => 'P-OT', 'name' => 'OnTrack Prog', 'approvalStatus' => 'ACTIVE', 'healthStatus' => 'GREEN']);
        $this->seedProgram(['code' => 'P-AR', 'name' => 'AtRisk Prog', 'approvalStatus' => 'ACTIVE', 'healthStatus' => 'YELLOW']);
        $this->seedProgram(['code' => 'P-TL', 'name' => 'Terlambat Prog', 'approvalStatus' => 'ACTIVE', 'healthStatus' => 'RED']);
        $this->seedProgram(['code' => 'P-CP', 'name' => 'Completed Prog', 'approvalStatus' => 'COMPLETED', 'healthStatus' => 'GREEN']);

        $this->actingAs($this->admin)
            ->get('/executive')
            ->assertInertia(fn ($page) => $page
                ->where('programStatusBreakdown.total', 4)
                ->where('programStatusBreakdown.onTrack', 1)
                ->where('programStatusBreakdown.atRisk', 1)
                ->where('programStatusBreakdown.terlambat', 1)
                ->where('programStatusBreakdown.completed', 1)
                ->where('programStatusBreakdown.pctOnTrack', 25)
            );
    }

    /** Helper untuk seed program dengan field minimum yang required. */
    private function seedProgram(array $overrides): Program
    {
        return Program::create(array_merge([
            'ownerId'      => $this->admin->id,
            'ownerUnitId'  => $this->admin->unitId,
            'status'       => 'IN_PROGRESS',
            'priority'     => 'MEDIUM',
            'startDate'    => '2026-01-01',
            'targetEndDate' => '2026-12-31',
        ], $overrides));
    }

    public function test_perhatian_khusus_surfaces_yellow_and_red_only(): void
    {
        $this->seedProgram(['code' => 'P-GR', 'name' => 'Green Prog', 'approvalStatus' => 'ACTIVE', 'healthStatus' => 'GREEN']);
        $this->seedProgram([
            'code' => 'P-RD', 'name' => 'Red Prog',
            'approvalStatus' => 'ACTIVE', 'healthStatus' => 'RED',
            'targetEndDate' => now()->addDays(15)->toDateString(),
            'dukunganDibutuhkan' => 'Persetujuan Direksi',
        ]);

        $this->actingAs($this->admin)
            ->get('/executive')
            ->assertInertia(fn ($page) => $page
                ->has('perhatianKhusus', 1)
                ->where('perhatianKhusus.0.status', 'Terlambat')
                ->where('perhatianKhusus.0.name', 'Red Prog')
                ->where('perhatianKhusus.0.dukungan', 'Persetujuan Direksi')
            );
    }
}
