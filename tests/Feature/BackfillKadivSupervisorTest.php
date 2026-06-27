<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci command org:backfill-kadiv-supervisor — melengkapi rantai jabatan yang
 * putus di atas Kadiv (managerUserId NULL) supaya eskalasi per-jenjang bisa
 * mencapai Direktur (BOD) direktoratnya. Idempotent + tak menebak saat ambigu.
 */
class BackfillKadivSupervisorTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_backfills_kadiv_to_directorate_bod(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-K', 'DIV-K');
        $bod   = $this->makeUser('bod-k', 'BOD', $unit->id, $dir->id);
        $kadiv = $this->makeUser('kadiv-k', 'KADIV', $unit->id, $dir->id); // managerUserId NULL
        $this->assertNull($kadiv->managerUserId);

        $this->artisan('org:backfill-kadiv-supervisor')->assertSuccessful();
        $this->assertSame($bod->id, (int) $kadiv->fresh()->managerUserId);

        // Idempotent: jalan ulang — tak ada NULL tersisa → no-op.
        $this->artisan('org:backfill-kadiv-supervisor')
            ->expectsOutputToContain('Tidak ada KADIV aktif dengan managerUserId NULL')
            ->assertSuccessful();
    }

    public function test_skips_when_no_bod_or_ambiguous(): void
    {
        // Direktorat tanpa BOD → Kadiv dilewati (tetap NULL).
        [$dirA, $unitA] = $this->makeDirectorate('DIR-NB', 'DIV-NB');
        $kadivNoBod = $this->makeUser('kadiv-nobod', 'KADIV', $unitA->id, $dirA->id);

        // Direktorat dengan 2 BOD → ambigu, Kadiv dilewati (tak ditebak).
        [$dirB, $unitB] = $this->makeDirectorate('DIR-AMB', 'DIV-AMB');
        $this->makeUser('bod-x', 'BOD', $unitB->id, $dirB->id);
        $this->makeUser('bod-y', 'BOD', $unitB->id, $dirB->id);
        $kadivAmbig = $this->makeUser('kadiv-ambig', 'KADIV', $unitB->id, $dirB->id);

        $this->artisan('org:backfill-kadiv-supervisor')->assertSuccessful();

        $this->assertNull($kadivNoBod->fresh()->managerUserId, 'Tanpa BOD harus dilewati.');
        $this->assertNull($kadivAmbig->fresh()->managerUserId, 'Ambigu (>1 BOD) harus dilewati.');
    }

    public function test_dry_run_writes_nothing(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-DR', 'DIV-DR');
        $this->makeUser('bod-dr', 'BOD', $unit->id, $dir->id);
        $kadiv = $this->makeUser('kadiv-dr', 'KADIV', $unit->id, $dir->id);

        $this->artisan('org:backfill-kadiv-supervisor', ['--dry-run' => true])->assertSuccessful();
        $this->assertNull($kadiv->fresh()->managerUserId, 'dry-run tak boleh menulis.');
    }
}
