<?php

namespace Tests\Feature\Performance;

use App\Models\Directorate;
use App\Models\DirektoratScorecard;
use App\Models\User;
use App\Services\ScorecardSummaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Trend skor KPI N bulan terakhir — Gap #2 vs PDF DKMR slide 8.
 */
class ScorecardTrendTest extends TestCase
{
    use RefreshDatabase;

    private ScorecardSummaryService $service;
    private Directorate $dirA;
    private Directorate $dirB;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(ScorecardSummaryService::class);

        $this->dirA = Directorate::create(['code' => 'DIR-A', 'name' => 'Direktorat A']);
        $this->dirB = Directorate::create(['code' => 'DIR-B', 'name' => 'Direktorat B']);

        $this->admin = User::create([
            'name'         => 'Admin Trend',
            'email'        => 'admin-trend@ptpn.test',
            'userId'       => 'admin-trend',
            'passwordHash' => Hash::make('password-123'),
            'roleType'     => 'SUPERADMIN',
            'isActive'     => true,
        ]);
    }

    public function test_returns_n_periodes_in_chronological_order(): void
    {
        $trend = $this->service->trendDirektorat($this->admin, 6, '2026-05');

        $this->assertCount(6, $trend['periodes']);
        $this->assertSame('2025-12', $trend['periodes'][0]['key']);
        $this->assertSame('2026-05', $trend['periodes'][5]['key']);
    }

    public function test_aligns_values_to_periode_keys_with_null_for_missing(): void
    {
        DirektoratScorecard::create([
            'directorateId' => $this->dirA->id,
            'periode'       => '2026-03',
            'nilai'         => 102.7,
        ]);
        DirektoratScorecard::create([
            'directorateId' => $this->dirA->id,
            'periode'       => '2026-05',
            'nilai'         => 104.1,
        ]);

        $trend = $this->service->trendDirektorat($this->admin, 6, '2026-05');

        $this->assertCount(1, $trend['series']);
        $series = $trend['series'][0];
        $this->assertSame('DIR-A', $series['kode']);

        // Values aligned: [null, null, null, 102.7, null, 104.1]
        $values = $series['values'];
        $this->assertNull($values[0]);
        $this->assertNull($values[1]);
        $this->assertNull($values[2]);
        $this->assertSame(102.7, $values[3]);
        $this->assertNull($values[4]);
        $this->assertSame(104.1, $values[5]);
    }

    public function test_clamps_months_to_2_12_range(): void
    {
        $trendLow = $this->service->trendDirektorat($this->admin, 1, '2026-05');
        $this->assertCount(2, $trendLow['periodes']);

        $trendHigh = $this->service->trendDirektorat($this->admin, 20, '2026-05');
        $this->assertCount(12, $trendHigh['periodes']);
    }

    public function test_returns_empty_series_when_no_scorecard_data(): void
    {
        $trend = $this->service->trendDirektorat($this->admin, 6, '2026-05');

        $this->assertCount(6, $trend['periodes']);
        $this->assertSame([], $trend['series']);
    }

    public function test_includes_multiple_direktorat_sorted_by_code(): void
    {
        DirektoratScorecard::create(['directorateId' => $this->dirB->id, 'periode' => '2026-05', 'nilai' => 99.0]);
        DirektoratScorecard::create(['directorateId' => $this->dirA->id, 'periode' => '2026-05', 'nilai' => 101.5]);

        $trend = $this->service->trendDirektorat($this->admin, 3, '2026-05');

        $this->assertCount(2, $trend['series']);
        $this->assertSame('DIR-A', $trend['series'][0]['kode']);
        $this->assertSame('DIR-B', $trend['series'][1]['kode']);
    }
}
