<?php

namespace App\Services;

/**
 * Scorecard data — currently mocked (Phase 1).
 *
 * Single source of truth shared by PerformanceController (full scorecard page)
 * and the Home dashboard (compact KPI column). When real data lands, only
 * this class needs to change.
 */
class ScorecardSummaryService
{
    /** @return array{kode: string, nama: string, nilai: float, divisi: array<int, array{kode: string, nama: string, nilai: float}>}[] */
    public function direktoratGrid(): array
    {
        return [
            [
                'kode' => 'DIRUT', 'nama' => 'Direktur Utama', 'nilai' => 102.92,
                'divisi' => [
                    ['kode' => 'DSPI', 'nama' => 'Satuan Pengawasan Intern', 'nilai' => 100.00],
                    ['kode' => 'DSPN', 'nama' => 'Sekretariat Perusahaan',   'nilai' => 99.72],
                ],
            ],
            [
                'kode' => 'DBS', 'nama' => 'Direktur Bisnis', 'nilai' => 99.13,
                'divisi' => [
                    ['kode' => 'DSMK', 'nama' => 'Strategi & Manajemen Kinerja Korporasi', 'nilai' => 101.95],
                    ['kode' => 'DPPN', 'nama' => 'Pemasaran dan Penjualan',                'nilai' => 97.84],
                    ['kode' => 'DTDI', 'nama' => 'Transformasi Digital',                   'nilai' => 102.19],
                ],
            ],
            [
                'kode' => 'DAS', 'nama' => 'Direktur Aset', 'nilai' => 99.66,
                'divisi' => [
                    ['kode' => 'DHKM', 'nama' => 'Hubungan Kelembagaan & Hukum', 'nilai' => 97.27],
                    ['kode' => 'DMAS', 'nama' => 'Manajemen Aset',               'nilai' => 104.40],
                ],
            ],
            [
                'kode' => 'DPP', 'nama' => 'Direktur Produksi & Pengembangan', 'nilai' => 65.58,
                'divisi' => [
                    ['kode' => 'DKSR', 'nama' => 'Kelapa Sawit dan Karet',                 'nilai' => 99.74],
                    ['kode' => 'DATN', 'nama' => 'Aneka Tanaman',                          'nilai' => 64.19],
                    ['kode' => 'PMKH', 'nama' => 'PMO Pengembangan Komoditi & Hilirisasi', 'nilai' => 101.00],
                    ['kode' => 'PTPP', 'nama' => 'PMO Tanaman Pangan dan Peternakan',      'nilai' => 102.00],
                ],
            ],
            [
                'kode' => 'DSU', 'nama' => 'Direktur SDM & Umum', 'nilai' => 101.86,
                'divisi' => [
                    ['kode' => 'DSPS', 'nama' => 'Strategi dan Pengembangan SDM', 'nilai' => 102.24],
                    ['kode' => 'DOPS', 'nama' => 'Operasional SDM',               'nilai' => 101.24],
                    ['kode' => 'DPDU', 'nama' => 'Pengadaan dan Umum',            'nilai' => 100.94],
                ],
            ],
            [
                'kode' => 'DKM', 'nama' => 'Direktur Keuangan & MR', 'nilai' => 101.85,
                'divisi' => [
                    ['kode' => 'DKSA', 'nama' => 'Keuangan Strategis & Anggaran', 'nilai' => 102.27],
                    ['kode' => 'DAPN', 'nama' => 'Akuntansi dan Perpajakan',      'nilai' => 100.86],
                    ['kode' => 'DIMR', 'nama' => 'Manajemen Risiko',              'nilai' => 101.96],
                ],
            ],
        ];
    }

    /** @return array<int, array{rank: int, nama: string, kode: string, nilai: float}> */
    public function topDirektorat(int $limit = 3): array
    {
        $grid = $this->direktoratGrid();
        usort($grid, fn ($a, $b) => $b['nilai'] <=> $a['nilai']);
        return array_map(fn ($d, $i) => [
            'rank' => $i + 1,
            'nama' => $d['nama'],
            'kode' => $d['kode'],
            'nilai' => $d['nilai'],
        ], array_slice($grid, 0, $limit), array_keys(array_slice($grid, 0, $limit)));
    }

    /** @return array<int, array{nama: string, kode: string, nilai: float}> */
    public function belowTarget(float $threshold = 80.0): array
    {
        $grid = $this->direktoratGrid();
        return array_values(array_map(
            fn ($d) => ['nama' => $d['nama'], 'kode' => $d['kode'], 'nilai' => $d['nilai']],
            array_filter($grid, fn ($d) => $d['nilai'] < $threshold)
        ));
    }

    /**
     * Compact summary for Home dashboard KPI column.
     * @return array{
     *   avgDirektorat: float,
     *   totalDirektorat: int,
     *   topDirektorat: array<int, array{rank: int, nama: string, kode: string, nilai: float}>,
     *   belowTarget: array<int, array{nama: string, kode: string, nilai: float}>,
     *   periode: string,
     * }
     */
    public function homeSnapshot(?string $periode = null): array
    {
        $periode = $periode ?? now()->format('Y-m');
        $grid = $this->direktoratGrid();
        $avg = count($grid) > 0
            ? round(array_sum(array_column($grid, 'nilai')) / count($grid), 2)
            : 0.0;

        return [
            'avgDirektorat' => $avg,
            'totalDirektorat' => count($grid),
            'topDirektorat' => $this->topDirektorat(3),
            'belowTarget' => $this->belowTarget(80.0),
            'periode' => $periode,
        ];
    }
}
