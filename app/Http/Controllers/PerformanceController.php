<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Services\ScorecardSummaryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PerformanceController extends Controller
{
    public function __construct(
        private readonly ScorecardSummaryService $scorecard,
    ) {}

    // ── Direktur list for lookup ───────────────────────────────────────────
    private array $direkturList = [
        'DIRUT' => ['kode' => 'DIRUT', 'nama' => 'Denaldy Mulino Mauna',     'jabatan' => 'Direktur Utama',                           'slug' => 'dirut'],
        'DBS'   => ['kode' => 'DBS',   'nama' => 'Ryanto Wisnuardhy',         'jabatan' => 'Direktur Bisnis',                          'slug' => 'dbs'],
        'DAS'   => ['kode' => 'DAS',   'nama' => 'Agung Setya Imam Effendi',  'jabatan' => 'Direktur Aset',                            'slug' => 'das'],
        'DPP'   => ['kode' => 'DPP',   'nama' => 'Rizal H. Damanik',          'jabatan' => 'Direktur Produksi & Pengembangan',         'slug' => 'dpp'],
        'DSU'   => ['kode' => 'DSU',   'nama' => 'Endang Suraningsih',        'jabatan' => 'Direktur SDM & Umum',                      'slug' => 'dsu'],
        'DKM'   => ['kode' => 'DKM',   'nama' => 'M. Iswahyudi',              'jabatan' => 'Direktur Keuangan & Manajemen Risiko',     'slug' => 'dkm'],
    ];

    // ── KPI Kolegial Overview ─────────────────────────────────────────────
    public function kolegial(Request $request): Response|RedirectResponse
    {
        $periode = $request->query('periode') ?? now()->format('Y-m');
        $user = $request->user();
        $scope = $user ? OrgScope::forUser($user) : null;

        // BOD-fungsional → scope mereka cuma 1 direktorat sendiri, jadi landing
        // overview tidak masuk akal (single card kosong). Langsung redirect ke
        // detail KPI direktorat mereka (19 KPI breakdown per perspektif).
        if ($scope && strtoupper($user->roleType ?? '') === 'BOD' && !$scope->isExecutive && $user->directorateId) {
            $directorate = $user->directorate;
            if ($directorate) {
                $codeAlias = ['DIR-KMR' => 'DKM'];
                $aliased = $codeAlias[$directorate->code] ?? $directorate->code;
                $slug = strtolower($aliased);
                return redirect()->route('performance.kolegial.detail', array_filter([
                    'slug' => $slug,
                    'periode' => $request->query('periode'),
                ]));
            }
        }

        $grid = $this->scorecard->direktoratGrid($user, $periode);

        // Normalize DB code → direkturList key. DB has 'DIR-KMR' as the
        // canonical Directorate.code, but direkturList uses 'DKM' (short
        // form used in URLs/slugs). This map bridges that for lookups.
        $codeAlias = ['DIR-KMR' => 'DKM'];
        foreach ($grid as &$g) {
            $g['kode'] = $codeAlias[$g['kode']] ?? $g['kode'];
        }
        unset($g);

        // total_kpi & perspektif extended metadata kept static — these are
        // organizational facts not currently in the scorecard table; can be
        // promoted to a separate table when KPI catalog UI lands (Phase 3).
        // DKM = 19 KPI (PDF Direktorat Keuangan & MR, page 9).
        $totalKpiByCode = ['DIRUT' => 12, 'DBS' => 10, 'DAS' => 10, 'DPP' => 18, 'DSU' => 10, 'DKM' => 19];
        $perspektifByCode = [
            'DIRUT' => ['Ekonomi & Sosial', 'IMB', 'Teknologi', 'Investasi', 'Talenta'],
            'DKM'   => ['Kinerja Keuangan', 'Tata Kelola & Risiko', 'Kepatuhan & Pajak'],
        ];

        // Compute summary stats from the (scoped) grid
        $totalKpi = array_sum(array_intersect_key($totalKpiByCode, array_flip(array_column($grid, 'kode'))));
        $avgCapaian = count($grid) > 0
            ? round(array_sum(array_column($grid, 'nilai')) / count($grid), 1)
            : 0;
        $memenuhi = count(array_filter($grid, fn ($d) => $d['nilai'] >= 100));
        $belowTarget = array_values(array_filter($grid, fn ($d) => $d['nilai'] < 80));

        $stats = [
            ['label' => 'Total KPI Kolegial', 'value' => (string) $totalKpi,                    'color' => 'muted'],
            ['label' => 'Rata-rata Capaian',  'value' => $avgCapaian . '%',                     'color' => $avgCapaian >= 90 ? 'green' : ($avgCapaian >= 80 ? 'amber' : 'red')],
            ['label' => 'Memenuhi Target',    'value' => (string) $memenuhi,
                'sub'   => 'dari ' . count($grid) . ' direktur',
                'color' => $memenuhi === count($grid) ? 'green' : ($memenuhi >= count($grid) / 2 ? 'amber' : 'red'),
            ],
            ['label' => 'Di Bawah Target',    'value' => (string) count($belowTarget),
                'sub'   => $belowTarget ? 'Dir. ' . explode(' ', $belowTarget[0]['nama'])[1] . ' ' . round($belowTarget[0]['nilai'], 1) . '%' : '—',
                'color' => $belowTarget ? 'red' : 'green',
            ],
        ];

        // Build dirut + direktur arrays from grid (scoped). DIRUT first if present,
        // others as the rest. KADIV/KASUBDIV scope returns just their own row.
        $dirutRow = collect($grid)->firstWhere('kode', 'DIRUT');
        $dirut = $dirutRow ? [
            ...($this->direkturList[$dirutRow['kode']] ?? []),
            'nilai'      => $dirutRow['nilai'],
            'total_kpi'  => $totalKpiByCode[$dirutRow['kode']] ?? 0,
            'perspektif' => $perspektifByCode[$dirutRow['kode']] ?? [],
        ] : null;

        $direktur = collect($grid)
            ->filter(fn ($d) => $d['kode'] !== 'DIRUT')
            ->map(fn ($d) => [
                ...($this->direkturList[$d['kode']] ?? ['kode' => $d['kode'], 'nama' => $d['nama'], 'jabatan' => $d['nama'], 'slug' => strtolower($d['kode'])]),
                'nilai'     => $d['nilai'],
                'total_kpi' => $totalKpiByCode[$d['kode']] ?? 0,
            ])
            ->values()
            ->all();

        return Inertia::render('Performance/KolegialView', compact('stats', 'dirut', 'direktur', 'periode'));
    }

    // ── KPI Kolegial Detail (per direktur) ────────────────────────────────
    public function kolegialDetail(Request $request, string $slug): Response
    {
        $direkturMap = collect($this->direkturList)->keyBy('slug');
        $direktur = $direkturMap[$slug] ?? $this->direkturList['DIRUT'];
        $periode = $request->query('periode', '2026-03');

        $kpiGroups = $this->getDummyKolegialKpi($direktur['kode']);

        return Inertia::render('Performance/KolegialDetailView', compact('direktur', 'kpiGroups', 'periode'));
    }

    // ── Scorecard Direktorat & Divisi ─────────────────────────────────────
    public function scorecard(Request $request): Response
    {
        $periode = $request->query('periode') ?? now()->format('Y-m');
        $user = $request->user();

        $direktoratGrid = $this->scorecard->direktoratGrid($user, $periode);
        $topDirektorat = $this->scorecard->topDirektorat($user, 3, $periode);

        // topDivisi computed from grid — flatten all divisi rows in scope,
        // sort by nilai desc, take top 3. Includes "sub" full name for display.
        $allDivisi = collect($direktoratGrid)
            ->flatMap(fn ($dir) => collect($dir['divisi'])->map(fn ($div) => [
                'kode' => $div['kode'],
                'sub'  => 'Divisi ' . $div['nama'],
                'nilai' => $div['nilai'],
            ]))
            ->sortByDesc('nilai')
            ->values();

        $topDivisi = $allDivisi->take(3)->map(fn ($d, $i) => [
            'rank' => $i + 1,
            'nama' => $d['kode'],
            'sub'  => $d['sub'],
            'nilai' => $d['nilai'],
        ])->values()->all();

        return Inertia::render('Performance/ScorecardView', compact(
            'topDirektorat', 'topDivisi', 'direktoratGrid', 'periode'
        ));
    }

    // ── KPI Divisi (Sprint 2) ──────────────────────────────────────────────
    /**
     * Halaman KPI per-divisi. Dua mode render berbasis role + $kode:
     *
     *   - BOD-fungsional (Direktur Keuangan/Bisnis/Aset/SDM/Produksi) + no $kode
     *     → comparison mode: tampil semua divisi di direktoratnya side-by-side.
     *   - Else (KADIV/KASUBDIV/Officer atau BOD dengan $kode eksplisit)
     *     → single mode: detail satu divisi (existing behavior).
     *
     * DIRUT (portfolio-level) tanpa $kode redirect ke scorecard karena dia
     * tidak punya "satu direktorat" — scorecard sudah punya full grid.
     *
     * Note: data dummy. Integrasi data riil di Sprint 6.
     */
    public function divisi(Request $request, ?string $kode = null): Response|RedirectResponse
    {
        $periode = $request->query('periode', '2026-03');
        $user = $request->user();
        $scope = $user ? OrgScope::forUser($user) : null;

        if ($kode === null && $scope && strtoupper($user->roleType ?? '') === 'BOD') {
            // DIRUT (portfolio) → scorecard. BOD-fungsional → comparison.
            if ($scope->isExecutive) {
                return redirect()->route('performance.scorecard', ['periode' => $periode]);
            }
            return $this->divisiComparison($user, $periode);
        }

        // Single divisi mode (existing)
        $resolvedKode = $kode ?? $this->resolveUserDivisi($user);
        $divisiInfo = $this->lookupDivisi($resolvedKode);
        $direktorat = $divisiInfo['direktorat'];
        $divisi     = $divisiInfo['divisi'];
        $peers      = $divisiInfo['peers'];

        $kpiItems       = $this->getDummyDivisiKpi($divisi['kode']);
        $topPerformers  = $this->getDummyDivisiTopPerformers($divisi['kode']);
        $mode = 'single';

        return Inertia::render('Performance/DivisiView', compact(
            'mode', 'divisi', 'direktorat', 'peers', 'kpiItems', 'topPerformers', 'periode'
        ));
    }

    /**
     * Comparison view: 3-up grid divisi di direktorat user (BOD-fungsional).
     * Pull divisi list dari getDirektoratGrid() dummy, top KPIs per divisi
     * dari getDummyDivisiKpi(). Akan switch ke ScorecardSummaryService di Sprint 6.
     */
    private function divisiComparison(\App\Models\User $user, string $periode): Response
    {
        // DB Directorate.code → grid kode alias (sama dengan kolegial() codeAlias)
        $codeAlias = ['DIR-KMR' => 'DKM'];
        $directorate = $user->directorate;
        $dirCode = $directorate ? ($codeAlias[$directorate->code] ?? $directorate->code) : null;

        $gridDir = null;
        if ($dirCode) {
            foreach ($this->getDirektoratGrid() as $row) {
                if ($row['kode'] === $dirCode) { $gridDir = $row; break; }
            }
        }

        if (!$gridDir) {
            // Fallback: direktorat user tidak ada di grid dummy → empty state.
            return Inertia::render('Performance/DivisiView', [
                'mode' => 'comparison',
                'direktorat' => $directorate
                    ? ['kode' => $directorate->code, 'nama' => $directorate->name, 'nilai' => 0.0]
                    : ['kode' => '—', 'nama' => 'Direktorat tidak terdeteksi', 'nilai' => 0.0],
                'divisiList' => [],
                'periode' => $periode,
            ]);
        }

        $divisiList = [];
        foreach ($gridDir['divisi'] as $idx => $div) {
            $kpiItems = $this->getDummyDivisiKpi($div['kode']);
            // Top 5 KPI by bobot — yang paling berkontribusi ke skor divisi
            usort($kpiItems, fn ($a, $b) => ($b['bobot'] ?? 0) <=> ($a['bobot'] ?? 0));
            $keyKpis = array_map(fn ($k) => [
                'kode'      => $k['kode'],
                'nama'      => $k['nama'],
                'bobot'     => $k['bobot'],
                'satuan'    => $k['satuan'],
                'polaritas' => $k['polaritas'],
                'sasaran'   => $k['sasaran'],
                'realisasi' => $k['realisasi'],
                'skor'      => $k['skor'],
            ], array_slice($kpiItems, 0, 5));

            // Summary: on-target vs at-risk count (skor/bobot >= 100% = on target)
            $onTarget = 0; $atRisk = 0;
            foreach ($kpiItems as $k) {
                $bobot = (float) ($k['bobot'] ?? 0);
                $skor  = (float) ($k['skor'] ?? 0);
                $pct   = $bobot > 0 ? ($skor / $bobot) * 100 : 0;
                if ($pct >= 95) $onTarget++; else $atRisk++;
            }

            $divisiList[] = [
                'kode'        => $div['kode'],
                'nama'        => $div['nama'],
                'nilai'       => $div['nilai'],
                'rank'        => $idx + 1,
                'totalDivisi' => count($gridDir['divisi']),
                'kpiCount'    => count($kpiItems),
                'onTarget'    => $onTarget,
                'atRisk'      => $atRisk,
                'keyKpis'     => $keyKpis,
            ];
        }

        return Inertia::render('Performance/DivisiView', [
            'mode' => 'comparison',
            'direktorat' => [
                'kode'  => $gridDir['kode'],
                'nama'  => $gridDir['nama'],
                'nilai' => $gridDir['nilai'],
            ],
            'divisiList' => $divisiList,
            'periode' => $periode,
        ]);
    }

    /** Resolve kode divisi dari user. Default DKSA kalau tidak ketemu. */
    private function resolveUserDivisi(?\App\Models\User $user): string
    {
        if (!$user || !$user->unitId) return 'DKSA';
        $unit = \App\Models\OrganizationalUnit::find($user->unitId);
        return $unit?->code ?? 'DKSA';
    }

    /** Lookup divisi info + peer divisi di direktorat yang sama. */
    private function lookupDivisi(string $kode): array
    {
        // Source of truth: direktoratGrid struktur (sama dengan scorecard)
        // Untuk MVP, hardcode mapping. Sprint 6: tarik dari OrganizationalUnit + KPI riil.
        // Normalize input — URL params are typically lowercase, grid uses uppercase.
        $kode = strtoupper($kode);
        foreach ($this->getDirektoratGrid() as $direktorat) {
            foreach ($direktorat['divisi'] as $idx => $divisi) {
                if ($divisi['kode'] === $kode) {
                    $divisiData = array_merge($divisi, [
                        'rank' => $idx + 1,
                        'totalDivisi' => count($direktorat['divisi']),
                    ]);
                    $peers = collect($direktorat['divisi'])
                        ->reject(fn ($d) => $d['kode'] === $kode)
                        ->values()
                        ->all();
                    return [
                        'divisi' => $divisiData,
                        'direktorat' => ['kode' => $direktorat['kode'], 'nama' => $direktorat['nama'], 'nilai' => $direktorat['nilai']],
                        'peers' => $peers,
                    ];
                }
            }
        }
        // Fallback ke DKSA jika kode tidak ditemukan
        return $this->lookupDivisi('DKSA');
    }

    private function getDirektoratGrid(): array
    {
        return [
            ['kode' => 'DIRUT', 'nama' => 'Direktur Utama', 'nilai' => 102.92, 'divisi' => [
                ['kode' => 'DSPI', 'nama' => 'Satuan Pengawasan Intern', 'nilai' => 100.00],
                ['kode' => 'DSPN', 'nama' => 'Sekretariat Perusahaan',   'nilai' => 99.72],
            ]],
            ['kode' => 'DBS', 'nama' => 'Direktur Bisnis', 'nilai' => 99.13, 'divisi' => [
                ['kode' => 'DSMK', 'nama' => 'Strategi & Manajemen Kinerja Korporasi', 'nilai' => 101.95],
                ['kode' => 'DPPN', 'nama' => 'Pemasaran dan Penjualan',                'nilai' => 97.84],
                ['kode' => 'DTDI', 'nama' => 'Transformasi Digital',                   'nilai' => 102.19],
            ]],
            ['kode' => 'DAS', 'nama' => 'Direktur Aset', 'nilai' => 99.66, 'divisi' => [
                ['kode' => 'DHKM', 'nama' => 'Hubungan Kelembagaan & Hukum', 'nilai' => 97.27],
                ['kode' => 'DMAS', 'nama' => 'Manajemen Aset',               'nilai' => 104.40],
            ]],
            ['kode' => 'DPP', 'nama' => 'Direktur Produksi & Pengembangan', 'nilai' => 65.58, 'divisi' => [
                ['kode' => 'DKSR', 'nama' => 'Kelapa Sawit dan Karet',                 'nilai' => 99.74],
                ['kode' => 'DATN', 'nama' => 'Aneka Tanaman',                          'nilai' => 64.19],
                ['kode' => 'PMKH', 'nama' => 'PMO Pengembangan Komoditi & Hilirisasi', 'nilai' => 101.00],
                ['kode' => 'PTPP', 'nama' => 'PMO Tanaman Pangan dan Peternakan',      'nilai' => 102.00],
            ]],
            ['kode' => 'DSU', 'nama' => 'Direktur SDM & Umum', 'nilai' => 101.86, 'divisi' => [
                ['kode' => 'DSPS', 'nama' => 'Strategi dan Pengembangan SDM', 'nilai' => 102.24],
                ['kode' => 'DOPS', 'nama' => 'Operasional SDM',               'nilai' => 101.24],
                ['kode' => 'DPDU', 'nama' => 'Pengadaan dan Umum',            'nilai' => 100.94],
            ]],
            // DKM: synced with PDF reference (15 Mei 2026) — page 9-12
            ['kode' => 'DKM', 'nama' => 'Direktur Keuangan & MR', 'nilai' => 102.7, 'divisi' => [
                ['kode' => 'DKSA', 'nama' => 'Keuangan Strategis & Anggaran', 'nilai' => 103.4],
                ['kode' => 'DAPN', 'nama' => 'Akuntansi dan Perpajakan',       'nilai' => 100.8],
                ['kode' => 'DIMR', 'nama' => 'Manajemen Risiko',               'nilai' => 101.9],
            ]],
        ];
    }

    /** KPI items per divisi.
     *  Source: 15052026_Monitoring Program Kerja DKMR.pdf pages 10-12.
     *  Divisi DKMR (DKSA, DAPN, DIMR) populated with actual PDF data.
     *  Other divisi fall back to generic 5-item template.
     */
    private function getDummyDivisiKpi(string $kode): array
    {
        // PDF data: each KPI has Bobot %, Satuan, Target FY, Target Mar, Realisasi Mar, Nilai %.
        // Skor = bobot × nilai/100. We use nilai % as realisasi where Mar values are not stated.
        $kpiByDivisi = [
            // ── DKSA: 16 KPI · Score 103.4% (PDF page 10) ──
            'DKSA' => [
                ['kode' => 'DKSA-001', 'nama' => 'EBITDA',                                                 'bobot' => 6,  'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'sasaran' => '1.483',   'realisasi' => '3.257,8', 'skor' => 6.6,  'definisi' => 'Earnings before interest, tax, depreciation, amortization.'],
                ['kode' => 'DKSA-002', 'nama' => 'Rasio % Penyelesaian Program vs % Penyerapan Anggaran', 'bobot' => 5,  'satuan' => 'Rasio',     'polaritas' => 'maximize', 'sasaran' => '1',       'realisasi' => '1,1',     'skor' => 5.5,  'definisi' => 'Efektivitas anggaran terhadap penyelesaian program.'],
                ['kode' => 'DKSA-003', 'nama' => 'ROI',                                                    'bobot' => 5,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '-0,34',   'realisasi' => '0,48',    'skor' => 5.5,  'definisi' => 'Return on Investment.'],
                ['kode' => 'DKSA-004', 'nama' => '% Debt To Equity Rasio',                                 'bobot' => 8,  'satuan' => '%',         'polaritas' => 'minimize', 'sasaran' => '60',      'realisasi' => '44,39',   'skor' => 8.66, 'definisi' => 'Rasio utang terhadap ekuitas.'],
                ['kode' => 'DKSA-005', 'nama' => '% On Time Pembayaran Utang Pihak Ketiga JT',             'bobot' => 8,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 8.0,  'definisi' => 'Ketepatan waktu pembayaran utang pihak ketiga jatuh tempo.'],
                ['kode' => 'DKSA-006', 'nama' => '% On Time Pembayaran Utang Pendanaan Internal JT',       'bobot' => 5,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 5.0,  'definisi' => 'Ketepatan waktu pembayaran utang internal jatuh tempo.'],
                ['kode' => 'DKSA-007', 'nama' => '% On Time Pembayaran Utang IP PEN JT',                   'bobot' => 10, 'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 10.0, 'definisi' => 'Ketepatan waktu pembayaran utang IP PEN jatuh tempo.'],
                ['kode' => 'DKSA-008', 'nama' => '% Nilai Penyetoran Sinking Fund (TW)',                   'bobot' => 8,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 8.0,  'definisi' => 'Persentase nilai penyetoran sinking fund per triwulan.'],
                ['kode' => 'DKSA-009', 'nama' => '% On Time Pendanaan Operasional Tepat Waktu',            'bobot' => 10, 'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 10.0, 'definisi' => 'Ketepatan waktu penyediaan pendanaan operasional.'],
                ['kode' => 'DKSA-010', 'nama' => '% Pemenuhan HPS sesuai SLA',                             'bobot' => 5,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 5.0,  'definisi' => 'Pemenuhan HPS sesuai Service Level Agreement.'],
                ['kode' => 'DKSA-011', 'nama' => '% Pengalihan Anggaran',                                  'bobot' => 5,  'satuan' => '%',         'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Persentase pengalihan anggaran (lower is better).'],
                ['kode' => 'DKSA-012', 'nama' => 'NOCF',                                                   'bobot' => 5,  'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'sasaran' => '1.534',   'realisasi' => '3.305',   'skor' => 5.0,  'definisi' => 'Net Operating Cash Flow.'],
                ['kode' => 'DKSA-013', 'nama' => 'Minimum Cash Balance',                                   'bobot' => 5,  'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'sasaran' => '256',     'realisasi' => '345',     'skor' => 5.0,  'definisi' => 'Saldo kas minimum yang dipertahankan.'],
                ['kode' => 'DKSA-014', 'nama' => '% On Time Penyusunan Anggaran',                          'bobot' => 10, 'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 10.0, 'definisi' => 'Ketepatan waktu penyusunan anggaran tahunan.'],
                ['kode' => 'DKSA-015', 'nama' => 'Jumlah Fraud',                                           'bobot' => 3,  'satuan' => 'Jumlah',    'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 3.0,  'definisi' => 'Jumlah kejadian fraud di divisi.'],
                ['kode' => 'DKSA-016', 'nama' => '% Mitigasi Plan Terlaksana',                             'bobot' => 2,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 2.0,  'definisi' => 'Persentase rencana mitigasi risiko yang terlaksana.'],
            ],

            // ── DAPN: 18 KPI · Score 100.8% (PDF page 11) ──
            'DAPN' => [
                ['kode' => 'DAPN-001', 'nama' => 'EBITDA Sub Holding',                       'bobot' => 3,  'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'sasaran' => '1.447,2', 'realisasi' => '2.905,9', 'skor' => 3.3,  'definisi' => 'EBITDA Sub Holding PTPN.'],
                ['kode' => 'DAPN-002', 'nama' => 'EBITDA Anper non PTPN',                    'bobot' => 3,  'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'sasaran' => '-7,19',   'realisasi' => '10,8',    'skor' => 3.3,  'definisi' => 'EBITDA Anak Perusahaan non-PTPN.'],
                ['kode' => 'DAPN-003', 'nama' => 'Rasio % Penyelesaian Program vs % Penyerapan Anggaran', 'bobot' => 5, 'satuan' => '%', 'polaritas' => 'maximize', 'sasaran' => '95',  'realisasi' => '100', 'skor' => 5.26, 'definisi' => 'Efektivitas anggaran terhadap penyelesaian program.'],
                ['kode' => 'DAPN-004', 'nama' => 'Opini Audit',                              'bobot' => 15, 'satuan' => '-',         'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 15.0, 'definisi' => 'Jumlah opini audit qualified.'],
                ['kode' => 'DAPN-005', 'nama' => 'Jumlah Teguran',                           'bobot' => 5,  'satuan' => 'Jumlah',    'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Jumlah teguran dari regulator.'],
                ['kode' => 'DAPN-006', 'nama' => 'Denda Pajak',                              'bobot' => 5,  'satuan' => 'Rp',        'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Nilai denda pajak.'],
                ['kode' => 'DAPN-007', 'nama' => 'Lebih Bayar',                              'bobot' => 5,  'satuan' => 'Rp',        'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Nilai lebih bayar pajak.'],
                ['kode' => 'DAPN-008', 'nama' => 'Kurang Bayar',                             'bobot' => 5,  'satuan' => 'Rp',        'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Nilai kurang bayar pajak.'],
                ['kode' => 'DAPN-009', 'nama' => '% Akurasi Transaksi Kas dan Bank',         'bobot' => 6,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '95',      'realisasi' => '95',      'skor' => 6.0,  'definisi' => 'Akurasi pencatatan transaksi kas dan bank.'],
                ['kode' => 'DAPN-010', 'nama' => 'Denda Pajak Anper',                        'bobot' => 5,  'satuan' => '%',         'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Denda pajak Anak Perusahaan.'],
                ['kode' => 'DAPN-011', 'nama' => 'Lebih Bayar Anper',                        'bobot' => 5,  'satuan' => '%',         'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Lebih bayar pajak Anak Perusahaan.'],
                ['kode' => 'DAPN-012', 'nama' => 'Kurang Bayar Anper',                       'bobot' => 5,  'satuan' => '%',         'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 5.0,  'definisi' => 'Kurang bayar pajak Anak Perusahaan.'],
                ['kode' => 'DAPN-013', 'nama' => 'Jumlah Temuan Signifikan Audit Keuangan', 'bobot' => 12, 'satuan' => 'Jumlah',    'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 12.0, 'definisi' => 'Jumlah temuan signifikan dari audit keuangan.'],
                ['kode' => 'DAPN-014', 'nama' => '% Kelengkapan Dokumen Verifikasi',         'bobot' => 6,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '0,9',     'realisasi' => '0',       'skor' => 6.0,  'definisi' => 'Kelengkapan dokumen verifikasi keuangan.'],
                ['kode' => 'DAPN-015', 'nama' => '% Koreksi LK & LM',                        'bobot' => 6,  'satuan' => '%',         'polaritas' => 'minimize', 'sasaran' => '0,25',    'realisasi' => '0',       'skor' => 6.0,  'definisi' => 'Persentase koreksi Laporan Keuangan & Manajemen.'],
                ['kode' => 'DAPN-016', 'nama' => 'Jumlah Temuan Audit ICOFR',                'bobot' => 4,  'satuan' => 'Jumlah',    'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 4.0,  'definisi' => 'Jumlah temuan audit ICOFR.'],
                ['kode' => 'DAPN-017', 'nama' => 'Jumlah Fraud',                             'bobot' => 3,  'satuan' => 'Jumlah',    'polaritas' => 'minimize', 'sasaran' => '0',       'realisasi' => '0',       'skor' => 3.0,  'definisi' => 'Jumlah kejadian fraud di divisi.'],
                ['kode' => 'DAPN-018', 'nama' => '% Mitigasi Plan Terlaksana',               'bobot' => 2,  'satuan' => '%',         'polaritas' => 'maximize', 'sasaran' => '100',     'realisasi' => '100',     'skor' => 2.0,  'definisi' => 'Persentase rencana mitigasi risiko yang terlaksana.'],
            ],

            // ── DIMR: 14 KPI · Score 101.9% (PDF page 12) ──
            'DIMR' => [
                ['kode' => 'DIMR-001', 'nama' => 'Rasio % Penyelesaian Program vs % Penyerapan Anggaran', 'bobot' => 5,  'satuan' => '%',     'polaritas' => 'maximize', 'sasaran' => '0',   'realisasi' => '100', 'skor' => 5.5,  'definisi' => 'Efektivitas anggaran terhadap penyelesaian program.'],
                ['kode' => 'DIMR-002', 'nama' => 'Risk Maturity Index',                                   'bobot' => 10, 'satuan' => 'Skor',  'polaritas' => 'maximize', 'sasaran' => '0',   'realisasi' => '0',   'skor' => 10.0, 'definisi' => 'Indeks kematangan manajemen risiko.'],
                ['kode' => 'DIMR-003', 'nama' => 'Skor Aspek Kinerja',                                    'bobot' => 5,  'satuan' => 'Skor',  'polaritas' => 'maximize', 'sasaran' => '81',  'realisasi' => '77',  'skor' => 4.75, 'definisi' => 'Skor aspek kinerja MR (Moderate: 95.1%).'],
                ['kode' => 'DIMR-004', 'nama' => 'GCG Index',                                             'bobot' => 10, 'satuan' => 'Skor',  'polaritas' => 'maximize', 'sasaran' => '0',   'realisasi' => '0',   'skor' => 10.0, 'definisi' => 'Indeks Good Corporate Governance.'],
                ['kode' => 'DIMR-005', 'nama' => '% On Time Implementasi Inisiatif MR',                   'bobot' => 10, 'satuan' => '%',     'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '100', 'skor' => 10.0, 'definisi' => 'Ketepatan waktu implementasi inisiatif MR.'],
                ['kode' => 'DIMR-006', 'nama' => '% Mitigasi Plan Terealisasi (Semua Divisi)',           'bobot' => 10, 'satuan' => '%',     'polaritas' => 'maximize', 'sasaran' => '10',  'realisasi' => '10',  'skor' => 10.0, 'definisi' => 'Realisasi mitigasi plan di semua divisi.'],
                ['kode' => 'DIMR-007', 'nama' => '% Kelengkapan Dokumen Contingency Plan, BCP & Stress Test', 'bobot' => 5, 'satuan' => '%', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '100', 'skor' => 5.0,  'definisi' => 'Kelengkapan dokumen contingency, BCP & stress test.'],
                ['kode' => 'DIMR-008', 'nama' => 'Skor Aspek Kualitas Penerapan MR',                      'bobot' => 10, 'satuan' => 'Skor',  'polaritas' => 'maximize', 'sasaran' => '81',  'realisasi' => '78',  'skor' => 9.63, 'definisi' => 'Skor kualitas penerapan MR (Moderate: 96.3%).'],
                ['kode' => 'DIMR-009', 'nama' => 'Indeks Survei Budaya Risiko',                           'bobot' => 10, 'satuan' => 'Skor',  'polaritas' => 'maximize', 'sasaran' => '66,67','realisasi' => '66,67','skor' => 10.0, 'definisi' => 'Indeks survei budaya risiko.'],
                ['kode' => 'DIMR-010', 'nama' => '% On Time Risk Oversight & Evaluation',                 'bobot' => 5,  'satuan' => '%',     'polaritas' => 'maximize', 'sasaran' => '96',  'realisasi' => '100', 'skor' => 5.21, 'definisi' => 'Ketepatan waktu risk oversight & evaluation.'],
                ['kode' => 'DIMR-011', 'nama' => 'Jumlah Temuan belum Terinternalisasi Peraturan',        'bobot' => 5,  'satuan' => 'Jumlah','polaritas' => 'minimize', 'sasaran' => '1',   'realisasi' => '0',   'skor' => 5.5,  'definisi' => 'Jumlah temuan peraturan belum terinternalisasi.'],
                ['kode' => 'DIMR-012', 'nama' => '% Kelengkapan SOP Kepatuhan',                           'bobot' => 10, 'satuan' => '%',     'polaritas' => 'maximize', 'sasaran' => '50',  'realisasi' => '50',  'skor' => 10.0, 'definisi' => 'Persentase kelengkapan SOP kepatuhan.'],
                ['kode' => 'DIMR-013', 'nama' => 'Jumlah Fraud',                                          'bobot' => 3,  'satuan' => 'Jumlah','polaritas' => 'minimize', 'sasaran' => '0',   'realisasi' => '0',   'skor' => 3.0,  'definisi' => 'Jumlah kejadian fraud di divisi.'],
                ['kode' => 'DIMR-014', 'nama' => '% Mitigasi Plan Terealisasi',                           'bobot' => 2,  'satuan' => '%',     'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '100', 'skor' => 2.0,  'definisi' => 'Persentase rencana mitigasi terealisasi.'],
            ],
        ];

        // Return divisi-specific KPI list, fallback to generic 5-item template
        if (isset($kpiByDivisi[$kode])) {
            return collect($kpiByDivisi[$kode])
                ->map(fn ($k, $i) => array_merge(['no' => $i + 1], $k))
                ->all();
        }

        // Generic fallback for divisi outside DKMR
        return [
            ['no' => 1, 'kode' => 'DIV-001', 'nama' => 'Pencapaian KPI Direktorat',     'bobot' => 30, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '102.27', 'skor' => 30.68, 'definisi' => 'Kontribusi divisi ke KPI direktorat induk.'],
            ['no' => 2, 'kode' => 'DIV-002', 'nama' => '% On-Time Penyelesaian Program', 'bobot' => 25, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '95',     'skor' => 23.75, 'definisi' => 'Persentase program kerja divisi selesai sesuai target waktu.'],
            ['no' => 3, 'kode' => 'DIV-003', 'nama' => '% Penyerapan Anggaran',          'bobot' => 20, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '95',  'realisasi' => '92',     'skor' => 19.37, 'definisi' => 'Realisasi penyerapan anggaran divisi.'],
            ['no' => 4, 'kode' => 'DIV-004', 'nama' => 'Jumlah Fraud',                   'bobot' => 5,  'satuan' => 'Jumlah','polaritas' => 'minimize','sasaran' => '0',   'realisasi' => '0',      'skor' => 5.00,  'definisi' => 'Komitmen anti-fraud divisi.'],
            ['no' => 5, 'kode' => 'DIV-005', 'nama' => 'Index Kepuasan Stakeholder',     'bobot' => 20, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '85',  'realisasi' => '88',     'skor' => 20.71, 'definisi' => 'Survey kepuasan internal/eksternal stakeholder.'],
        ];
    }

    /** Top performer per divisi. Uses real Kasub data from DB users.
     *  DKMR divisi (DKSA/DAPN/DIMR) have correct Kasub names from PTPN III seed.
     *  Other divisi fall back to generic top-3.
     */
    private function getDummyDivisiTopPerformers(string $kode): array
    {
        $kode = strtoupper($kode);
        $performersByDivisi = [
            'DKSA' => [
                ['rank' => 1, 'nama' => 'Dimas Aryo Wibisono',                  'jabatan' => 'Kepala Sub Divisi Anggaran',                                       'nilai' => 105.00],
                ['rank' => 2, 'nama' => 'Audi Muhammad Rafie',                  'jabatan' => 'Kepala Sub Divisi Perbendaharaan dan HPS',                         'nilai' => 104.50],
                ['rank' => 3, 'nama' => 'Raja Agustino M. Sembiring',           'jabatan' => 'Kepala Sub Divisi Keuangan Strategis dan Perencanaan Finansial',   'nilai' => 104.83],
            ],
            'DAPN' => [
                ['rank' => 1, 'nama' => 'Jonri Sitorus',                        'jabatan' => 'Kepala Sub Divisi Manajemen Keuangan, Pajak dan Akuntansi',        'nilai' => 102.50],
                ['rank' => 2, 'nama' => 'Arief Harwanto',                       'jabatan' => 'Kepala Sub Divisi Akuntansi dan Verifikasi',                       'nilai' => 101.20],
            ],
            'DIMR' => [
                ['rank' => 1, 'nama' => 'Alif Nugraha Ramadhan',                'jabatan' => 'Kepala Sub Divisi Strategi Manajemen Risiko Terintegrasi',         'nilai' => 102.80],
                ['rank' => 2, 'nama' => 'Aan Fadlianto',                        'jabatan' => 'Kepala Sub Divisi Kajian dan Pengawasan Risiko',                   'nilai' => 101.00],
            ],
        ];

        return $performersByDivisi[$kode] ?? [
            ['rank' => 1, 'nama' => 'Top Performer 1', 'jabatan' => 'Kepala Sub Divisi', 'nilai' => 105.00],
            ['rank' => 2, 'nama' => 'Top Performer 2', 'jabatan' => 'Kepala Sub Divisi', 'nilai' => 104.00],
            ['rank' => 3, 'nama' => 'Top Performer 3', 'jabatan' => 'Kepala Sub Divisi', 'nilai' => 103.00],
        ];
    }

    // ── KPI Saya (shortcut ke individu detail user sendiri) ─────────────────
    public function me(Request $request): RedirectResponse
    {
        $userId = $request->user()->id;
        return redirect()->route('performance.individu.detail', ['id' => $userId]);
    }

    // ── KPI Individual Karyawan ───────────────────────────────────────────
    public function individu(Request $request): Response
    {
        $periode = $request->query('periode', '2026-03');

        $topPerformers = [
            'BOD-1' => [
                ['rank' => 1, 'nama' => 'Muhammad Muslim Utomo',      'jabatan' => 'Kepala Divisi Keuangan Strategis dan Anggaran', 'unit' => 'DKSA', 'nilai' => 104.83],
                ['rank' => 2, 'nama' => 'Riza Pahlevi',               'jabatan' => 'Kepala Divisi Pengadaan dan Umum',              'unit' => 'DPDU', 'nilai' => 102.60],
                ['rank' => 3, 'nama' => 'Prasetyo Mimboro',           'jabatan' => 'Kepala Divisi Transformasi Digital',            'unit' => 'DTDI', 'nilai' => 102.19],
            ],
            'BOD-2' => [
                ['rank' => 1, 'nama' => 'Dimas Aryo Wibisono',        'jabatan' => 'Kepala Sub Divisi Anggaran',                    'unit' => 'DKSA', 'nilai' => 105.00],
                ['rank' => 2, 'nama' => 'Deny Ariyanto Prabowo',      'jabatan' => 'Kepala Sub Divisi HPS dan Informasi Harga',     'unit' => 'DKSA', 'nilai' => 105.00],
                ['rank' => 3, 'nama' => 'Raja Agustino M. Sembiring', 'jabatan' => 'Kepala Sub Divisi Keuangan Strategis & Perencanaan Finansial', 'unit' => 'DKSA', 'nilai' => 104.83],
            ],
            'BOD-3' => [
                ['rank' => 1, 'nama' => 'Daniel Hendri Saputra Siagian', 'jabatan' => 'Asisten Financial Market',               'unit' => 'DPPN', 'nilai' => 105.76],
                ['rank' => 2, 'nama' => 'Yudi Santosa Suntara',          'jabatan' => 'Asisten PSR & Plasma Tanaman',           'unit' => 'DKSR', 'nilai' => 105.06],
                ['rank' => 3, 'nama' => 'Irfan Herwindo Rachmawan',      'jabatan' => 'Team Dedicated Office Komite Investasi', 'unit' => 'DKSA', 'nilai' => 105.00],
            ],
        ];

        $orgNav = [
            ['kode' => 'DIRUT', 'nama' => 'Direktorat Utama', 'divisi' => [
                ['kode' => 'DSPI', 'nama' => 'Divisi Satuan Pengawasan Intern'],
                ['kode' => 'DSPN', 'nama' => 'Divisi Sekretariat Perusahaan'],
            ]],
            ['kode' => 'DBS', 'nama' => 'Direktorat Bisnis', 'divisi' => [
                ['kode' => 'DSMK', 'nama' => 'Divisi Strategi dan Manajemen Kinerja Korporasi'],
                ['kode' => 'DPPN', 'nama' => 'Divisi Pemasaran dan Penjualan'],
                ['kode' => 'DTDI', 'nama' => 'Divisi Transformasi Digital'],
            ]],
            ['kode' => 'DAS', 'nama' => 'Direktorat Aset', 'divisi' => [
                ['kode' => 'DHKM', 'nama' => 'Divisi Hubungan Kelembagaan dan Hukum'],
                ['kode' => 'DMAS', 'nama' => 'Divisi Manajemen Aset'],
            ]],
            ['kode' => 'DPP', 'nama' => 'Direktorat Produksi & Pengembangan', 'divisi' => [
                ['kode' => 'DKSR', 'nama' => 'Divisi Kelapa Sawit dan Karet'],
                ['kode' => 'DATN', 'nama' => 'Divisi Aneka Tanaman'],
                ['kode' => 'PMKH', 'nama' => 'PMO Pengembangan Komoditi dan Hilirisasi'],
                ['kode' => 'PTPP', 'nama' => 'PMO Tanaman Pangan dan Peternakan'],
            ]],
            ['kode' => 'DSU', 'nama' => 'Direktorat SDM & Umum', 'divisi' => [
                ['kode' => 'DSPS', 'nama' => 'Divisi Strategi dan Pengembangan SDM'],
                ['kode' => 'DOPS', 'nama' => 'Divisi Operasional SDM'],
                ['kode' => 'DPDU', 'nama' => 'Divisi Pengadaan dan Umum'],
            ]],
            ['kode' => 'DKM', 'nama' => 'Direktorat Keuangan & Manajemen Risiko', 'divisi' => [
                ['kode' => 'DKSA', 'nama' => 'Divisi Keuangan Strategis dan Anggaran'],
                ['kode' => 'DAPN', 'nama' => 'Divisi Akuntansi dan Perpajakan'],
                ['kode' => 'DIMR', 'nama' => 'Divisi Manajemen Risiko'],
            ]],
        ];

        return Inertia::render('Performance/IndividuView', compact('topPerformers', 'orgNav', 'periode'));
    }

    // ── Commitment Ledger (Sprint 4) ───────────────────────────────────────
    /**
     * Hit rate weekly + streak dari 3 sumber:
     *   - Task (assignedTo, targetCompletion vs actualCompletion)
     *   - MeetingActionItem (assignedTo, dueDate, status)
     *   - Assignment (assigneeId, dueDate, status)
     *
     * Visibility:
     *   - User sendiri: full detail
     *   - Atasan langsung: full detail
     *   - Lain: 403
     */
    public function commitmentLedger(Request $request, int $userId): \Illuminate\Http\JsonResponse
    {
        $viewer = $request->user();
        $target = \App\Models\User::findOrFail($userId);

        // Visibility check
        $isSelf = $viewer->id === $target->id;
        $isSupervisor = app(\App\Services\OrgChainService::class)->isSupervisorOf($viewer, $target);
        $isAdmin = in_array(strtoupper($viewer->roleType), ['BOD', 'ADMIN', 'SUPERADMIN'], true);
        if (!$isSelf && !$isSupervisor && !$isAdmin) {
            abort(403, 'Anda tidak punya akses ke commitment ledger user ini.');
        }

        $lookbackWeeks = (int) setting('commitment_ledger.lookback_weeks', 12);
        $streakMin = (int) setting('commitment_ledger.streak_min_hit_rate_pct', 80);

        $startDate = now()->startOfWeek()->subWeeks($lookbackWeeks);

        // Source 1: Tasks (assigned, dengan target completion dalam window)
        $tasks = \App\Models\Task::query()
            ->where('assignedTo', $userId)
            ->whereNotNull('targetCompletion')
            ->where('targetCompletion', '>=', $startDate)
            ->get(['id', 'targetCompletion', 'actualCompletion', 'status']);

        // Source 2: MeetingActionItem
        $actionItems = \App\Models\MeetingActionItem::query()
            ->where('assignedToId', $userId)
            ->whereNotNull('dueDate')
            ->where('dueDate', '>=', $startDate)
            ->get(['id', 'dueDate', 'status', 'completedAt']);

        // Source 3: Assignment
        $assignments = \App\Models\Assignment::query()
            ->where('assigneeId', $userId)
            ->whereNotNull('dueDate')
            ->where('dueDate', '>=', $startDate)
            ->get(['id', 'dueDate', 'status']);

        // Aggregate per week (ISO week)
        $weeks = [];
        for ($i = $lookbackWeeks - 1; $i >= 0; $i--) {
            $weekStart = now()->startOfWeek()->subWeeks($i);
            $weekEnd = $weekStart->copy()->endOfWeek();
            $weekKey = $weekStart->format('o-\WW');

            $weekItems = collect();

            foreach ($tasks as $t) {
                if ($t->targetCompletion->between($weekStart, $weekEnd)) {
                    $hit = $t->status === 'COMPLETED' || $t->status === 'DONE';
                    $weekItems->push(['kind' => 'task', 'hit' => $hit]);
                }
            }
            foreach ($actionItems as $a) {
                if ($a->dueDate && \Carbon\Carbon::parse($a->dueDate)->between($weekStart, $weekEnd)) {
                    $hit = $a->status === 'COMPLETED';
                    $weekItems->push(['kind' => 'action_item', 'hit' => $hit]);
                }
            }
            foreach ($assignments as $a) {
                if ($a->dueDate && \Carbon\Carbon::parse($a->dueDate)->between($weekStart, $weekEnd)) {
                    $hit = in_array($a->status, ['SELESAI', 'COMPLETED'], true);
                    $weekItems->push(['kind' => 'assignment', 'hit' => $hit]);
                }
            }

            $total = $weekItems->count();
            $hits = $weekItems->where('hit', true)->count();
            $hitRate = $total > 0 ? round($hits / $total * 100, 1) : null;

            $weeks[] = [
                'weekKey'  => $weekKey,
                'weekStart' => $weekStart->toDateString(),
                'total'    => $total,
                'hits'     => $hits,
                'misses'   => $total - $hits,
                'hitRate'  => $hitRate,
            ];
        }

        // Compute aggregate
        $totalAll = collect($weeks)->sum('total');
        $hitsAll = collect($weeks)->sum('hits');
        $hitRateAggregate = $totalAll > 0 ? round($hitsAll / $totalAll * 100, 1) : null;

        // Streak: consecutive weeks dari paling akhir dengan hitRate >= streakMin
        $streak = 0;
        foreach (array_reverse($weeks) as $w) {
            if ($w['hitRate'] !== null && $w['hitRate'] >= $streakMin) {
                $streak++;
            } else {
                break;
            }
        }

        return response()->json([
            'data' => [
                'userId' => $userId,
                'lookbackWeeks' => $lookbackWeeks,
                'weeks' => $weeks,
                'hitRateAggregate' => $hitRateAggregate,
                'streak' => $streak,
                'streakMinPct' => $streakMin,
            ],
        ]);
    }

    // ── KPI Individual Detail (per karyawan) ─────────────────────────────
    public function individuDetail(Request $request, string $id): Response
    {
        $periode = $request->query('periode', '2026-03');

        // Dummy data - will be replaced with DB/API query
        $karyawan = [
            'id'      => $id,
            'nama'    => 'Dimas Aryo Wibisono',
            'jabatan' => 'Kepala Sub Divisi Anggaran',
            'unit'    => 'DKSA',
            'nilai'   => 105.00,
            'jumlah_kpi' => 7,
        ];

        $kpiItems = [
            [
                'no' => 1, 'kode' => 'N0030267', 'nama' => 'EBITDA', 'bobot' => 15,
                'satuan' => 'Rp', 'polaritas' => 'maximize', 'periode' => 'Maret 2026',
                'sasaran' => '1.483', 'realisasi' => '3.258', 'skor' => 16.50,
                'definisi' => null,
            ],
            [
                'no' => 2, 'kode' => 'N0030268', 'nama' => 'ROI', 'bobot' => 10,
                'satuan' => '%', 'polaritas' => 'maximize', 'periode' => 'Maret 2026',
                'sasaran' => '-0,34', 'realisasi' => '0,31', 'skor' => 11.00,
                'definisi' => null,
            ],
            [
                'no' => 3, 'kode' => 'N0030276', 'nama' => '% Pengalihan Anggaran', 'bobot' => 25,
                'satuan' => '%', 'polaritas' => 'minimize', 'periode' => 'Maret 2026',
                'sasaran' => '0', 'realisasi' => '0', 'skor' => 25.00,
                'definisi' => null,
            ],
            [
                'no' => 4, 'kode' => 'N0030279', 'nama' => '% On Time Penyusunan Anggaran', 'bobot' => 20,
                'satuan' => '%', 'polaritas' => 'maximize', 'periode' => 'Maret 2026',
                'sasaran' => '100', 'realisasi' => '100', 'skor' => 20.00,
                'definisi' => null,
            ],
            [
                'no' => 5, 'kode' => 'N003I001', 'nama' => 'Ratio (% Penyelesaian Program vs % Penyerapan Anggaran) (DKSA)', 'bobot' => 25,
                'satuan' => 'Ratio', 'polaritas' => 'maximize', 'periode' => 'Maret 2026',
                'sasaran' => '1', 'realisasi' => '1,10', 'skor' => 27.50,
                'definisi' => 'Indikator yang mengukur efektivitas anggaran untuk penyelesaian program kerja dalam pencapaian objective masing-masing unit kerja.',
            ],
            [
                'no' => 6, 'kode' => 'N003I002', 'nama' => 'Jumlah Fraud', 'bobot' => 3,
                'satuan' => 'Jumlah', 'polaritas' => 'minimize', 'periode' => 'Maret 2026',
                'sasaran' => '0', 'realisasi' => '0', 'skor' => 3.00,
                'definisi' => 'Indikator yang mendukung komitmen dari setiap divisi agar fraud tidak terjadi melalui jumlah kejadian kecurangan di PTPN III (Persero).',
            ],
            [
                'no' => 7, 'kode' => 'N003I003', 'nama' => '% Mitigasi Plan Terlaksana', 'bobot' => 2,
                'satuan' => '%', 'polaritas' => 'maximize', 'periode' => 'Maret 2026',
                'sasaran' => '100', 'realisasi' => '100', 'skor' => 2.00,
                'definisi' => 'Indikator yang mengukur efektivitas pengelolaan risiko perusahaan yang bersifat preventif.',
            ],
        ];

        return Inertia::render('Performance/IndividuDetailView', compact('karyawan', 'kpiItems', 'periode'));
    }

    // ── Private: dummy KPI kolegial per direktur ──────────────────────────
    private function getDummyKolegialKpi(string $kode): array
    {
        // DKM (Direktur Keuangan & MR): use 19-KPI Direktorat data from PDF
        // (Monitoring Program Kerja DKMR 15 Mei 2026, page 9) — Score 102.7%.
        // Other Direktur fall back to generic 12-KPI Kolegial BOD template.
        if ($kode === 'DKM') {
            return $this->getDkmrDirektoratKpi();
        }

        $base = [
            [
                'perspektif' => 'Ekonomi & Sosial',
                'perspektif_key' => 'ekonomi_sosial',
                'color' => 'green',
                'pct' => 18.6,
                'items' => [
                    ['kode' => 'KK-001', 'nama' => 'Capaian Finansial (ROIC ≥ WACC)', 'satuan' => '%', 'polaritas' => 'maximize', 'bobot' => 15, 'target' => 100, 'realisasi' => 18.6, 'skor' => 18.6],
                    ['kode' => 'KK-002', 'nama' => 'Net Income', 'satuan' => 'Rp M', 'polaritas' => 'maximize', 'bobot' => 10, 'target' => 1483, 'realisasi' => 3258, 'skor' => 16.5],
                    ['kode' => 'KK-003', 'nama' => 'Pencapaian Produksi Gula', 'satuan' => 'Ton', 'polaritas' => 'maximize', 'bobot' => 8, 'target' => 1073955, 'realisasi' => 573955, 'skor' => 4.3],
                ],
            ],
            [
                'perspektif' => 'Inovasi Model Bisnis',
                'perspektif_key' => 'imb',
                'color' => 'yellow',
                'pct' => 10.0,
                'items' => [
                    ['kode' => 'KK-004', 'nama' => 'Implementasi Program Strategis', 'satuan' => '%', 'polaritas' => 'maximize', 'bobot' => 10, 'target' => 100, 'realisasi' => 80, 'skor' => 8.0],
                    ['kode' => 'KK-005', 'nama' => 'Sertifikasi RSPO', 'satuan' => 'Unit', 'polaritas' => 'maximize', 'bobot' => 5, 'target' => 5, 'realisasi' => 0, 'skor' => 0],
                ],
            ],
            [
                'perspektif' => 'Kepemimpinan Teknologi',
                'perspektif_key' => 'teknologi',
                'color' => 'yellow',
                'pct' => 8.7,
                'items' => [
                    ['kode' => 'KK-006', 'nama' => 'Implementasi Use Case dalam RSTI 2025–2029', 'satuan' => '%', 'polaritas' => 'maximize', 'bobot' => 10, 'target' => 100, 'realisasi' => 87, 'skor' => 8.7],
                    ['kode' => 'KK-007', 'nama' => 'Implementasi Data Warehouse', 'satuan' => '%', 'polaritas' => 'maximize', 'bobot' => 5, 'target' => 100, 'realisasi' => 0, 'skor' => 0],
                ],
            ],
            [
                'perspektif' => 'Peningkatan Investasi',
                'perspektif_key' => 'investasi',
                'color' => 'yellow',
                'pct' => 6.6,
                'items' => [
                    ['kode' => 'KK-008', 'nama' => 'Replanting & Konversi', 'satuan' => 'Ha', 'polaritas' => 'maximize', 'bobot' => 8, 'target' => 44244, 'realisasi' => 826, 'skor' => 0.15],
                    ['kode' => 'KK-009', 'nama' => 'Realisasi PMN', 'satuan' => '%', 'polaritas' => 'maximize', 'bobot' => 8, 'target' => 100, 'realisasi' => 88.77, 'skor' => 7.1],
                    ['kode' => 'KK-010', 'nama' => 'Peremajaan Sawit Rakyat (PSN)', 'satuan' => 'Ha', 'polaritas' => 'maximize', 'bobot' => 5, 'target' => 22568, 'realisasi' => 17568, 'skor' => 3.9],
                ],
            ],
            [
                'perspektif' => 'Pengembangan Talenta',
                'perspektif_key' => 'talenta',
                'color' => 'green',
                'pct' => 9.2,
                'items' => [
                    ['kode' => 'KK-011', 'nama' => 'Human Capital Transformation', 'satuan' => '%', 'polaritas' => 'maximize', 'bobot' => 10, 'target' => 100, 'realisasi' => 92, 'skor' => 9.2],
                    ['kode' => 'KK-012', 'nama' => 'Produktivitas CPO', 'satuan' => 'Ton', 'polaritas' => 'maximize', 'bobot' => 5, 'target' => 5.3, 'realisasi' => 2.3, 'skor' => 2.2],
                ],
            ],
        ];

        return $base;
    }

    /**
     * KPI Direktorat Keuangan & MR — 19 KPI dari PDF page 9.
     * Score: 102.7% (Periode Maret 2026).
     * Grouped by 3 perspektif keuangan: Kinerja Keuangan, Tata Kelola & Risiko,
     * Manajemen Kepatuhan & Pajak. Bobot total 100%.
     */
    private function getDkmrDirektoratKpi(): array
    {
        return [
            [
                'perspektif' => 'Kinerja Keuangan',
                'perspektif_key' => 'kinerja_keuangan',
                'color' => 'green',
                'pct' => 33.0,
                'items' => [
                    ['kode' => 'DKMR-001', 'nama' => 'EBITDA',                                                   'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'bobot' => 4,  'target' => 1483,  'realisasi' => 3257.8, 'skor' => 4.4],
                    ['kode' => 'DKMR-002', 'nama' => 'Ratio % Penyelesaian Proker vs % Penyerapan Anggaran',     'satuan' => '%',         'polaritas' => 'maximize', 'bobot' => 4,  'target' => 1,     'realisasi' => 1.1,    'skor' => 4.4],
                    ['kode' => 'DKMR-003', 'nama' => 'ROI',                                                       'satuan' => '%',         'polaritas' => 'maximize', 'bobot' => 3,  'target' => -0.34, 'realisasi' => 0.48,   'skor' => 3.3],
                    ['kode' => 'DKMR-004', 'nama' => '% Debt To Equity Ratio',                                    'satuan' => '%',         'polaritas' => 'minimize', 'bobot' => 5,  'target' => 60,    'realisasi' => 44.39,  'skor' => 5.5],
                    ['kode' => 'DKMR-005', 'nama' => 'Net Operating Cash Flow (NOCF)',                            'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'bobot' => 4,  'target' => 1534,  'realisasi' => 3305,   'skor' => 4.4],
                    ['kode' => 'DKMR-006', 'nama' => 'Minimum Cash Balance',                                      'satuan' => 'Rp Miliar', 'polaritas' => 'maximize', 'bobot' => 4,  'target' => 256,   'realisasi' => 345,    'skor' => 4.4],
                    ['kode' => 'DKMR-007', 'nama' => '% Akurasi Perencanaan Keuangan',                            'satuan' => '%',         'polaritas' => 'maximize', 'bobot' => 4,  'target' => 90,    'realisasi' => 335.6,  'skor' => 4.4],
                    ['kode' => 'DKMR-008', 'nama' => '% On Time Pembayaran Bunga',                                'satuan' => '%',         'polaritas' => 'maximize', 'bobot' => 10, 'target' => 100,   'realisasi' => 100,    'skor' => 10.0],
                    ['kode' => 'DKMR-009', 'nama' => '% Nilai Penyetoran Sinking Fund (TW)',                      'satuan' => '%',         'polaritas' => 'maximize', 'bobot' => 6,  'target' => 100,   'realisasi' => 100,    'skor' => 6.0],
                ],
            ],
            [
                'perspektif' => 'Tata Kelola & Risiko',
                'perspektif_key' => 'tata_kelola_risiko',
                'color' => 'green',
                'pct' => 26.0,
                'items' => [
                    ['kode' => 'DKMR-010', 'nama' => 'Opini Audit',                                              'satuan' => '-',         'polaritas' => 'minimize', 'bobot' => 10, 'target' => 0,  'realisasi' => 0,  'skor' => 10.0],
                    ['kode' => 'DKMR-011', 'nama' => 'Maturity Level',                                            'satuan' => 'Skor',     'polaritas' => 'maximize', 'bobot' => 10, 'target' => 0,  'realisasi' => 0,  'skor' => 10.0],
                    ['kode' => 'DKMR-012', 'nama' => 'Jumlah Temuan Audit Keuangan Signifikan',                  'satuan' => 'Jumlah',    'polaritas' => 'minimize', 'bobot' => 5,  'target' => 0,  'realisasi' => 0,  'skor' => 5.0],
                    ['kode' => 'DKMR-013', 'nama' => 'Skor Aspek Kualitas MR',                                    'satuan' => 'Skor',     'polaritas' => 'maximize', 'bobot' => 4,  'target' => 81, 'realisasi' => 90, 'skor' => 4.4],
                    ['kode' => 'DKMR-014', 'nama' => 'Skor Survei Budaya Risiko',                                 'satuan' => 'Skor',     'polaritas' => 'maximize', 'bobot' => 7,  'target' => 67, 'realisasi' => 67, 'skor' => 7.0],
                ],
            ],
            [
                'perspektif' => 'Kepatuhan & Pajak',
                'perspektif_key' => 'kepatuhan_pajak',
                'color' => 'green',
                'pct' => 20.0,
                'items' => [
                    ['kode' => 'DKMR-015', 'nama' => 'Denda Pajak',                       'satuan' => 'Rp',     'polaritas' => 'minimize', 'bobot' => 4, 'target' => 0,   'realisasi' => 0,   'skor' => 4.0],
                    ['kode' => 'DKMR-016', 'nama' => 'Lebih Bayar',                       'satuan' => 'Rp',     'polaritas' => 'minimize', 'bobot' => 4, 'target' => 0,   'realisasi' => 0,   'skor' => 4.0],
                    ['kode' => 'DKMR-017', 'nama' => 'Kurang Bayar',                      'satuan' => 'Rp',     'polaritas' => 'minimize', 'bobot' => 4, 'target' => 0,   'realisasi' => 0,   'skor' => 4.0],
                    ['kode' => 'DKMR-018', 'nama' => 'Jumlah Fraud',                      'satuan' => 'Jumlah', 'polaritas' => 'minimize', 'bobot' => 3, 'target' => 0,   'realisasi' => 0,   'skor' => 3.0],
                    ['kode' => 'DKMR-019', 'nama' => '% Mitigasi Plan Terealisasi',       'satuan' => '%',      'polaritas' => 'maximize', 'bobot' => 5, 'target' => 100, 'realisasi' => 100, 'skor' => 5.0],
                ],
            ],
        ];
    }
}
