<?php

namespace Tests\Feature;

use App\Models\Blocker;
use App\Models\Program;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci command blockers:backfill-unit — merapikan Blocker lama yang
 * createdByUnitId-nya NULL (jalur store dulu tak mengisinya) supaya sinyal
 * blocker kembali terlihat oleh KADIV/KASUBDIV (OrgSummaryService scope unit).
 */
class BackfillBlockerUnitTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_backfills_null_unit_from_program_owner(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $admin = $this->makeUser('admin-a', 'SUPERADMIN', $unit->id, $dir->id);
        $stack = $this->seedProgramStack($admin, 'A');
        Program::whereKey($stack['program'])->update(['ownerUnitId' => $unit->id]);

        // Simulasikan data lama: createdByUnitId NULL (jalur store lama).
        DB::table('Blocker')->where('id', $stack['blocker'])->update(['createdByUnitId' => null]);

        $this->artisan('blockers:backfill-unit')->assertSuccessful();
        $this->assertSame($unit->id, (int) Blocker::find($stack['blocker'])->createdByUnitId);

        // Idempotent: jalan ulang — kini tak ada NULL tersisa, jadi no-op.
        $this->artisan('blockers:backfill-unit')
            ->expectsOutputToContain('Tidak ada Blocker dengan createdByUnitId NULL')
            ->assertSuccessful();
    }

    public function test_skips_blocker_without_resolvable_unit(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-B', 'DIV-B');
        $admin = $this->makeUser('admin-b', 'SUPERADMIN', $unit->id, $dir->id);
        $stack = $this->seedProgramStack($admin, 'B');

        // Program tanpa ownerUnitId → blocker tak ter-resolve, harus dilewati.
        Program::whereKey($stack['program'])->update(['ownerUnitId' => null]);
        DB::table('Blocker')->where('id', $stack['blocker'])->update(['createdByUnitId' => null]);

        $this->artisan('blockers:backfill-unit')->assertSuccessful();
        $this->assertNull(Blocker::find($stack['blocker'])->createdByUnitId);

        // Jalan ulang tetap aman — orphan dibiarkan NULL, tak crash.
        $this->artisan('blockers:backfill-unit')->assertSuccessful();
        $this->assertNull(Blocker::find($stack['blocker'])->createdByUnitId);
    }
}
