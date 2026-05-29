<?php

namespace Tests\Feature\Performance;

use App\Models\Directorate;
use App\Models\DirektoratScorecard;
use App\Models\User;
use App\Services\ScorecardSummaryService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Home dashboard period fallback (2026-05-29 cockpit redesign).
 *
 * Scorecard data lands monthly and lags the calendar, so the current month is
 * usually still empty. homeSnapshot() must resolve to the latest period WITH
 * data — otherwise the KPI panel renders blank even when recent data exists,
 * which reads as "broken" on the make-or-break Home screen.
 */
class HomeSnapshotPeriodTest extends TestCase
{
    use RefreshDatabase;

    private ScorecardSummaryService $service;
    private User $admin;
    private Directorate $dir;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(ScorecardSummaryService::class);
        $this->dir = Directorate::create(['code' => 'DIR-A', 'name' => 'Direktorat A']);
        $this->admin = User::create([
            'name'         => 'Admin Home',
            'email'        => 'admin-home@ptpn.test',
            'userId'       => 'admin-home',
            'passwordHash' => Hash::make('password-123'),
            'roleType'     => 'SUPERADMIN',
            'isActive'     => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_falls_back_to_latest_period_with_data_when_current_month_empty(): void
    {
        // "Now" is May; scorecard data exists only for March + April.
        Carbon::setTestNow(Carbon::parse('2026-05-15'));
        DirektoratScorecard::create(['directorateId' => $this->dir->id, 'periode' => '2026-03', 'nilai' => 103.2]);
        DirektoratScorecard::create(['directorateId' => $this->dir->id, 'periode' => '2026-04', 'nilai' => 102.7]);

        $snap = $this->service->homeSnapshot($this->admin);

        $this->assertSame('2026-04', $snap['periode'], 'should resolve to the latest period with data, not the empty current month');
        $this->assertNotEmpty($snap['topItems']);
        $this->assertEqualsWithDelta(102.7, $snap['avgItem'], 0.001);
        // Delta vs the previous period with data (April − March = −0.5).
        $this->assertEqualsWithDelta(-0.5, $snap['avgDelta'], 0.001);
        $this->assertStringContainsString('2026', $snap['periodeLabel']);

        // kpiTrend carries the months that have data (gap-null elsewhere).
        $avgByLabel = collect($snap['kpiTrend'])->pluck('avg', 'label');
        $this->assertEqualsWithDelta(103.2, $avgByLabel['Mar'], 0.001);
        $this->assertEqualsWithDelta(102.7, $avgByLabel['Apr'], 0.001);
    }

    public function test_explicit_periode_overrides_fallback(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-15'));
        DirektoratScorecard::create(['directorateId' => $this->dir->id, 'periode' => '2026-03', 'nilai' => 103.2]);
        DirektoratScorecard::create(['directorateId' => $this->dir->id, 'periode' => '2026-04', 'nilai' => 102.7]);

        $snap = $this->service->homeSnapshot($this->admin, '2026-03');

        $this->assertSame('2026-03', $snap['periode']);
        $this->assertEqualsWithDelta(103.2, $snap['avgItem'], 0.001);
    }

    public function test_uses_current_month_when_no_data_exists(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-15'));

        $snap = $this->service->homeSnapshot($this->admin);

        $this->assertSame('2026-05', $snap['periode']);
        $this->assertSame(0, $snap['totalItem']);
        $this->assertSame([], $snap['topItems']);
    }
}
