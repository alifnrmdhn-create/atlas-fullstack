<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Mengunci kesiapan scheduler multi-replica (scale-readiness S1.1/S1.3).
 *
 * Regresi paling mungkin: seseorang menghapus ->onOneServer() (notifikasi
 * dobel di N-replica balik) atau tabel cache_locks (lock atomik shared mati,
 * onOneServer jatuh ke no-op senyap). Kedua-duanya dijaga di sini.
 */
class ScheduleMultiReplicaTest extends TestCase
{
    use RefreshDatabase;

    public function test_cache_lock_table_exists_for_shared_locks(): void
    {
        $this->assertTrue(Schema::hasTable('cache'), 'Tabel cache wajib (CACHE_STORE=database).');
        $this->assertTrue(Schema::hasTable('cache_locks'), 'Tabel cache_locks wajib (onOneServer lock atomik).');
    }

    public function test_database_cache_store_provides_atomic_lock(): void
    {
        // Lock atomik tersedia (jaminan onOneServer lintas-replica). Mutual
        // exclusion penuh (replica B terblokir saat A pegang) TAK bisa diuji di
        // sini: RefreshDatabase membungkus test dalam transaksi, dan unique-
        // violation lock meng-abort transaksi (SQLSTATE 25P02). Bukti mutual
        // exclusion = scripts/validate-multi-replica.mjs (di luar transaksi).
        $lock = Cache::store('database')->lock('multi_replica_probe', 10);
        $this->assertTrue($lock->get(), 'Database cache store harus menyediakan lock atomik.');
        $lock->release();
    }

    public function test_all_atlas_scheduled_commands_run_on_one_server(): void
    {
        $schedule = app(Schedule::class);

        $atlasEvents = collect($schedule->events())
            ->filter(fn ($e) => str_contains((string) $e->command, 'atlas:'));

        $this->assertGreaterThanOrEqual(5, $atlasEvents->count(), 'Kelima scheduled command ATLAS harus terdaftar.');

        foreach ($atlasEvents as $event) {
            $this->assertTrue(
                $event->onOneServer,
                "Scheduled command [{$event->command}] WAJIB ->onOneServer() — tanpa itu jalan ganda di multi-replica.",
            );
        }
    }
}
