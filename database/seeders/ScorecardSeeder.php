<?php

namespace Database\Seeders;

use App\Models\Directorate;
use App\Models\DirektoratScorecard;
use App\Models\DivisiScorecard;
use App\Models\OrganizationalUnit;
use Carbon\Carbon;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * Seed direktorat & divisi scorecard values.
 *
 * Source data mirrors what ScorecardSummaryService::direktoratGrid() used
 * to return as static mock — preserved here so the demo numbers stay
 * recognizable after Phase 2 migration to DB-backed reads.
 *
 * Seeds 3 periodes (current month + 2 prior) with slight variations
 * to power the trend display. Resilient to missing directorate/unit
 * rows: looks up by code, creates a stub if absent so the seeder can
 * run on an empty schema for demo bootstrapping.
 */
class ScorecardSeeder extends Seeder
{
    use WithoutModelEvents;

    /** Mirror of ScorecardSummaryService mock — current period values. */
    private const GRID = [
        ['kode' => 'DIRUT', 'nama' => 'Direktur Utama',                  'nilai' => 102.92, 'divisi' => [
            ['kode' => 'DSPI', 'nama' => 'Satuan Pengawasan Intern', 'nilai' => 100.00],
            ['kode' => 'DSPN', 'nama' => 'Sekretariat Perusahaan',   'nilai' => 99.72],
        ]],
        ['kode' => 'DBS',   'nama' => 'Direktur Bisnis',                 'nilai' => 99.13,  'divisi' => [
            ['kode' => 'DSMK', 'nama' => 'Strategi & Manajemen Kinerja Korporasi', 'nilai' => 101.95],
            ['kode' => 'DPPN', 'nama' => 'Pemasaran dan Penjualan',                'nilai' => 97.84],
            ['kode' => 'DTDI', 'nama' => 'Transformasi Digital',                   'nilai' => 102.19],
        ]],
        ['kode' => 'DAS',   'nama' => 'Direktur Aset',                   'nilai' => 99.66,  'divisi' => [
            ['kode' => 'DHKM', 'nama' => 'Hubungan Kelembagaan & Hukum', 'nilai' => 97.27],
            ['kode' => 'DMAS', 'nama' => 'Manajemen Aset',               'nilai' => 104.40],
        ]],
        ['kode' => 'DPP',   'nama' => 'Direktur Produksi & Pengembangan','nilai' => 65.58,  'divisi' => [
            ['kode' => 'DKSR', 'nama' => 'Kelapa Sawit dan Karet',                 'nilai' => 99.74],
            ['kode' => 'DATN', 'nama' => 'Aneka Tanaman',                          'nilai' => 64.19],
            ['kode' => 'PMKH', 'nama' => 'PMO Pengembangan Komoditi & Hilirisasi', 'nilai' => 101.00],
            ['kode' => 'PTPP', 'nama' => 'PMO Tanaman Pangan dan Peternakan',      'nilai' => 102.00],
        ]],
        ['kode' => 'DSU',   'nama' => 'Direktur SDM & Umum',             'nilai' => 101.86, 'divisi' => [
            ['kode' => 'DSPS', 'nama' => 'Strategi dan Pengembangan SDM', 'nilai' => 102.24],
            ['kode' => 'DOPS', 'nama' => 'Operasional SDM',               'nilai' => 101.24],
            ['kode' => 'DPDU', 'nama' => 'Pengadaan dan Umum',            'nilai' => 100.94],
        ]],
        // DIR-KMR: synced with PDF reference (15 Mei 2026) — Monitoring Program Kerja DKMR
        ['kode' => 'DIR-KMR', 'nama' => 'Direktorat Keuangan dan Manajemen Risiko', 'nilai' => 102.7, 'divisi' => [
            ['kode' => 'DKSA-HLD', 'nama' => 'Divisi Keuangan Strategis dan Anggaran', 'nilai' => 103.4],
            ['kode' => 'DAPN-HLD', 'nama' => 'Divisi Akuntansi dan Perpajakan',        'nilai' => 100.8],
            ['kode' => 'DIMR-HLD', 'nama' => 'Divisi Manajemen Risiko',                'nilai' => 101.9],
        ]],
    ];

    public function run(): void
    {
        $now = Carbon::now();
        /* Seed 4 periods: 2026-01..2026-03 + current month.
         * 2026-03 = PDF reference values (Monitoring DKMR 15 Mei 2026, s.d. Maret).
         * Earlier periods use mild deterministic step-down so trend shows
         * movement without diverging from the PDF reference point.
         * Current month = same as 2026-03 (live data caught up). */
        $periodes = [
            '2026-01' => -2.5,  // 2 step-downs from reference
            '2026-02' => -1.0,  // 1 step-down
            '2026-03' => 0,     // PDF reference (anchor)
            '2026-04' => 0.4,   // slight bump (April keeps momentum from March)
            '2026-05' => 0,     // current month — back to anchor
        ];

        foreach ($periodes as $periode => $delta) {
            foreach (self::GRID as $direktorat) {
                $dir = $this->findOrCreateDirectorate($direktorat['kode'], $direktorat['nama']);

                $nilai = max(0, min(150, $direktorat['nilai'] + $delta));

                DirektoratScorecard::updateOrCreate(
                    ['directorateId' => $dir->id, 'periode' => $periode],
                    ['nilai' => round($nilai, 2)],
                );

                foreach ($direktorat['divisi'] as $divisi) {
                    $unit = $this->findOrCreateUnit($divisi['kode'], $divisi['nama'], $dir->id);

                    $divisiNilai = max(0, min(150, $divisi['nilai'] + $delta));

                    DivisiScorecard::updateOrCreate(
                        ['unitId' => $unit->id, 'periode' => $periode],
                        ['directorateId' => $dir->id, 'nilai' => round($divisiNilai, 2)],
                    );
                }
            }
        }
    }

    /** Slight variation for prior periods — index 0 = oldest, smaller drift. */
    private function priorPeriodValue(float $current, int $idx): float
    {
        // Earlier periods drift up to ±3% from current — mock historical movement
        $drift = (mt_rand(-30, 30) / 10) * (1 - $idx * 0.3);
        return max(0, min(150, $current + $drift));
    }

    private function findOrCreateDirectorate(string $code, string $name): Directorate
    {
        return Directorate::firstOrCreate(
            ['code' => $code],
            ['name' => $name, 'isActive' => true],
        );
    }

    private function findOrCreateUnit(string $code, string $name, int $directorateId): OrganizationalUnit
    {
        return OrganizationalUnit::firstOrCreate(
            ['code' => $code],
            [
                'name' => $name,
                'unitType' => 'DIVISI',
                'directorateId' => $directorateId,
                'isActive' => true,
            ],
        );
    }
}
