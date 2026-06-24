<?php

namespace Tests\Feature\Performance;

use App\Models\Directorate;
use App\Models\DirektoratScorecard;
use App\Models\DivisiScorecard;
use App\Models\OrganizationalUnit;
use App\Models\User;
use App\Services\ScorecardSummaryService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Home KPI hero scope (keputusan 2026-06-24).
 *
 * Viewer yang terikat ke sebuah divisi ber-skor harus melihat skor DIVISINYA
 * sendiri sebagai angka hero "KPI Achievement" — bukan skor direktorat induk.
 * Sebelumnya semua user non-executive (termasuk KASUBDIV divisi) melihat skor
 * direktorat, yang membuat angka tampak lebih tinggi dari realisasi divisi.
 */
class HomeSnapshotDivisionScopeTest extends TestCase
{
    use RefreshDatabase;

    private ScorecardSummaryService $service;
    private Directorate $dir;
    private OrganizationalUnit $unit;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(ScorecardSummaryService::class);
        Carbon::setTestNow(Carbon::parse('2026-06-15'));

        $this->dir = Directorate::create(['code' => 'DIR-KMR', 'name' => 'Direktorat KMR']);
        $this->unit = OrganizationalUnit::create([
            'code'          => 'DIMR-HLD',
            'name'          => 'Divisi Manajemen Risiko',
            'unitType'      => 'DIVISI',
            'directorateId' => $this->dir->id,
        ]);

        // Direktorat dan divisi sengaja PUNYA nilai berbeda agar terbukti
        // hero memakai divisi, bukan direktorat.
        DirektoratScorecard::create(['directorateId' => $this->dir->id, 'periode' => '2026-04', 'nilai' => 103.55]);
        DirektoratScorecard::create(['directorateId' => $this->dir->id, 'periode' => '2026-05', 'nilai' => 103.75]);
        DivisiScorecard::create(['unitId' => $this->unit->id, 'directorateId' => $this->dir->id, 'periode' => '2026-04', 'nilai' => 100.6]);
        DivisiScorecard::create(['unitId' => $this->unit->id, 'directorateId' => $this->dir->id, 'periode' => '2026-05', 'nilai' => 99.58]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function divisionUser(): User
    {
        return User::create([
            'name'         => 'Kasubdiv MR',
            'email'        => 'kasubdiv-mr@ptpn.test',
            'userId'       => 'kasubdiv-mr',
            'passwordHash' => Hash::make('password-123'),
            'roleType'     => 'KASUBDIV',
            'directorateId' => $this->dir->id,
            'unitId'       => $this->unit->id,
            'isActive'     => true,
        ]);
    }

    public function test_division_user_sees_own_division_score_not_directorate(): void
    {
        $snap = $this->service->homeSnapshot($this->divisionUser());

        // Hero (ownItem) = skor DIVISI, bukan direktorat.
        $this->assertSame('DIMR-HLD', $snap['ownItem']['kode']);
        $this->assertEqualsWithDelta(99.58, $snap['ownItem']['nilai'], 0.001);
        $this->assertNotEqualsWithDelta(103.75, $snap['ownItem']['nilai'], 0.001);

        // Periode di-resolve dari data divisi.
        $this->assertSame('2026-05', $snap['periode']);

        // Trend + delta mengikuti series divisi (titik akhir == hero).
        $avgByLabel = collect($snap['kpiTrend'])->pluck('avg', 'label');
        $this->assertEqualsWithDelta(100.6, $avgByLabel['Apr'], 0.001);
        $this->assertEqualsWithDelta(99.58, $avgByLabel['May'], 0.001);
        $this->assertEqualsWithDelta(-1.02, $snap['avgDelta'], 0.001);
    }

    public function test_directorate_user_without_division_falls_back_to_directorate(): void
    {
        // Direktur fungsional: punya direktorat, TANPA unit divisi ber-skor.
        $direktur = User::create([
            'name'         => 'Direktur KMR',
            'email'        => 'direktur-kmr@ptpn.test',
            'userId'       => 'direktur-kmr',
            'passwordHash' => Hash::make('password-123'),
            'roleType'     => 'BOD',
            'directorateId' => $this->dir->id,
            'unitId'       => null,
            'isActive'     => true,
        ]);

        $snap = $this->service->homeSnapshot($direktur);

        $this->assertSame('DIR-KMR', $snap['ownItem']['kode']);
        $this->assertEqualsWithDelta(103.75, $snap['ownItem']['nilai'], 0.001);
    }
}
