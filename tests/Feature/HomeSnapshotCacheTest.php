<?php

namespace Tests\Feature;

use App\Services\ScorecardSummaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci cache home snapshot (scale-readiness S3.3): hasil di-cache per-user
 * 5 menit (Home = halaman terpadat, dulu recompute tiap hit). Verifikasi key
 * ter-populate + panggilan kedua dilayani dari cache (nol query DB tambahan).
 */
class HomeSnapshotCacheTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_snapshot_is_cached_per_user(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-H', 'DIV-H');
        $user = $this->makeUser('home-user', 'SUPERADMIN', $unit->id, $dir->id);

        $service = app(ScorecardSummaryService::class);

        $first = $service->homeSnapshot($user);

        // Key ter-populate
        $this->assertTrue(Cache::has("home-snapshot:{$user->id}:auto"), 'Snapshot harus ter-cache per-user.');

        // Panggilan kedua: nol query (dilayani cache)
        \DB::enableQueryLog();
        $second = $service->homeSnapshot($user);
        $queries = \DB::getQueryLog();
        \DB::disableQueryLog();

        $this->assertSame($first, $second, 'Hasil cache harus identik.');
        $this->assertCount(0, $queries, 'Panggilan kedua tak boleh query DB (dilayani cache).');
    }
}
