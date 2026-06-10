<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Jaring pengaman /organization/program-summary (audit 2026-06-10 Task 2.4):
 * endpoint agregat terbesar (dulu buildProgramSummary 584 baris inline di
 * OrganizationController, kini OrgSummaryService) sebelumnya NOL coverage —
 * refactor apa pun di sana tak punya sinyal regresi. Test ini mengunci shape
 * kontrak FE (19 key payload) untuk dua persona scope berbeda.
 */
class OrgProgramSummaryTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private const PAYLOAD_SHAPE = [
        'scope' => ['role', 'level', 'name', 'unitCount'],
        'summary',
        'byDivisi',
        'taskLoad',
        'scorecardHealth',
        'deadlineClusters',
        'needsAction',
        'stagnation',
        'blockerSignal',
        'kpiHealth' => ['kpiTrend'],
        'momentum',
        'velocity',
        'trendSeries',
        'programsForChart',
        'controls',
        'topBlockerPrograms',
        'checkpoints',
        'recentActivity',
    ];

    public function test_program_summary_returns_full_shape_for_admin(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);
        $this->seedProgramStack($admin, 'A');

        $this->actingAs($admin)
            ->getJson('/organization/program-summary')
            ->assertOk()
            ->assertJsonStructure(self::PAYLOAD_SHAPE)
            ->assertJsonPath('scope.role', 'SUPERADMIN');
    }

    public function test_program_summary_returns_full_shape_for_kadiv_scope(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-B', 'DIV-B');
        $admin = $this->makeUser('admin-b', 'SUPERADMIN', $unit->id, $dir->id);
        $kadiv = $this->makeUser('kadiv-b', 'KADIV', $unit->id, $dir->id);
        $this->seedProgramStack($admin, 'B');

        $this->actingAs($kadiv)
            ->getJson('/organization/program-summary')
            ->assertOk()
            ->assertJsonStructure(self::PAYLOAD_SHAPE)
            ->assertJsonPath('scope.role', 'KADIV');
    }
}
