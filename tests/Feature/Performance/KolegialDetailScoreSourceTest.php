<?php

namespace Tests\Feature\Performance;

use App\Models\Directorate;
use App\Models\DirektoratScorecard;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

/**
 * Single source of truth skor total direktorat.
 *
 * Halaman detail KPI Kolegial harus menampilkan skor total yang IDENTIK dengan
 * halaman list (nilai kanonik DirektoratScorecard.nilai), BUKAN hasil penjumlahan
 * ulang skor item di FE (rumus berbeda → angka beda antar halaman). Regresi dari
 * laporan user 2026-06-26: detail tampil 102,8 padahal list 103,75.
 */
class KolegialDetailScoreSourceTest extends TestCase
{
    use RefreshDatabase;

    public function test_directorate_total_uses_canonical_scorecard_not_item_sum(): void
    {
        $dir = Directorate::create(['code' => 'DIR-KMR', 'name' => 'Direktorat Keuangan dan Manajemen Risiko']);

        // Nilai kanonik tersimpan (mis. total dari workbook) = 103.75.
        DirektoratScorecard::create([
            'directorateId' => $dir->id,
            'periode'       => '2026-05',
            'nilai'         => 103.75,
        ]);

        // Item KPI yang, kalau dijumlah-bobot di FE, menghasilkan angka BERBEDA (90.0).
        $period = DB::table('performance_periods')->insertGetId([
            'tahun' => 2026, 'bulan' => 5, 'label' => 'May 2026', 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $itemId = DB::table('kpi_direktur_items')->insertGetId([
            'kode' => 'DIR-KMR-01', 'nama' => 'EBITDA', 'directorate_code' => 'DIR-KMR',
            'perspektif' => 'Financial', 'satuan' => 'Rp', 'polaritas' => 'maximize',
            'bobot' => 1.0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('kpi_direktur_values')->insert([
            'kpi_direktur_item_id' => $itemId, 'period_id' => $period,
            'target' => 100, 'realisasi' => 90, 'skor' => 90.0,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $admin = User::create([
            'name' => 'Admin Perf', 'email' => 'admin-perf@ptpn.test', 'userId' => 'admin-perf',
            'passwordHash' => Hash::make('password-123'), 'roleType' => 'SUPERADMIN', 'isActive' => true,
        ]);

        $this->actingAs($admin)
            ->get('/performance/kolegial/dkm?periode=2026-05')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Performance/KolegialDetailView')
                ->where('direktur.nilai', 103.75));
    }
}
