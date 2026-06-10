<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Services\KpiInsightService;
use App\Services\ScorecardSummaryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class PerformanceController extends Controller
{
    private const DIR_KMR_ID = 5;

    public function __construct(
        private readonly ScorecardSummaryService $scorecard,
        private readonly KpiInsightService $insight,
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

        // Non-executive members (BOD-fungsional + KADIV/OFFICER) hanya punya 1
        // direktorat, jadi landing overview tidak berguna (single card). Langsung
        // ke detail KPI direktorat mereka (breakdown per perspektif). Gate sudah
        // membatasi akses ke direktorat ber-data (DIR-KMR), jadi detail pasti ada.
        if ($scope && !$scope->isExecutive && $user && $user->directorateId) {
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
        $periode = $request->query('periode') ?? $this->defaultPeriode();

        $kpiGroups = $this->getDirekturKpiGroups($direktur['kode'], $periode);

        // Flatten kpi groups for insight derive (treat 'target' as 'sasaran').
        $flatItems = collect($kpiGroups)
            ->flatMap(fn ($g) => $g['items'] ?? [])
            ->map(fn ($it) => array_merge($it, [
                'sasaran'   => $it['target']    ?? null,
                'realisasi' => $it['realisasi'] ?? null,
            ]))
            ->all();
        $insight = $this->insight->deriveFromKpiItems($flatItems);

        return Inertia::render('Performance/KolegialDetailView', compact('direktur', 'kpiGroups', 'insight', 'periode'));
    }

    // ── Scorecard Direktorat & Divisi ─────────────────────────────────────
    public function scorecard(Request $request): Response
    {
        $periode = $request->query('periode') ?? $this->defaultPeriode();
        $user = $request->user();

        $direktoratGrid = $this->scorecard->direktoratGrid($user, $periode);
        $topDirektorat = $this->scorecard->topDirektorat($user, 3, $periode);

        // topDivisi computed from grid — flatten all divisi rows in scope,
        // sort by nilai desc, take top 3. Includes "sub" full name for display.
        $allDivisi = collect($direktoratGrid)
            ->flatMap(fn ($dir) => collect($dir['divisi'])->map(fn ($div) => [
                'kode' => $div['kode'],
                // Jangan double-prefix: nama di DB sudah berawalan "Divisi ..."
                // (dulu "Divisi Divisi Keuangan ..." tampil di Top 3).
                'sub'  => preg_match('/^divisi\s/i', $div['nama']) ? $div['nama'] : 'Divisi ' . $div['nama'],
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

        // Trend skor 6 bulan terakhir untuk bar chart (Gap #2 vs PDF slide 8)
        $trend = $this->scorecard->trendDirektorat($user, 6, $periode);

        // ── Cockpit payload (redesain 2026-06-10) ──────────────────────────
        // Bentuk lama (ranking + bar 0-110) nyaris tanpa informasi saat semua
        // skor ~100%. Bentuk baru: matriks divisi×perspektif BSC (locate the
        // weakness) + daftar pengecualian KPI lintas-divisi (eksekutif tidak
        // perlu masuk per-divisi untuk menemukan yang menyimpang).
        $matrix = [];
        $exceptions = [];
        $kpiTotals = ['total' => 0, 'onTarget' => 0];
        foreach ($direktoratGrid as $dir) {
            foreach ($dir['divisi'] as $div) {
                $items = $this->getDivisiKpi($div['kode'], $periode);
                $perAgg = [];
                $divOnTarget = 0;
                foreach ($items as $k) {
                    $b = (float) $k['bobot'];
                    $s = (float) $k['skor'];
                    $pct = $b > 0 ? ($s / $b) * 100 : 0.0;
                    $kpiTotals['total']++;
                    if ($pct >= 100) {
                        $kpiTotals['onTarget']++;
                        $divOnTarget++;
                    } else {
                        $exceptions[] = [
                            'divisi'    => $div['kode'],
                            'kpi'       => $k['nama'],
                            'pct'       => round($pct, 1),
                            'sasaran'   => $k['sasaran'],
                            'realisasi' => $k['realisasi'],
                            'satuan'    => $k['satuan'],
                            'bobot'     => $b,
                        ];
                    }
                    $p = $k['perspektif'];
                    $perAgg[$p]['b'] = ($perAgg[$p]['b'] ?? 0) + $b;
                    $perAgg[$p]['s'] = ($perAgg[$p]['s'] ?? 0) + $s;
                }
                $cells = [];
                foreach ($perAgg as $p => $agg) {
                    $cells[$p] = $agg['b'] > 0 ? round(($agg['s'] / $agg['b']) * 100, 1) : null;
                }
                $matrix[] = [
                    'kode' => $div['kode'],
                    'nama' => $div['nama'],
                    'nilai' => $div['nilai'],
                    'direktorat' => $dir['kode'],
                    'perspektif' => $cells,
                    'onTarget' => $divOnTarget,
                    'kpiTotal' => count($items),
                ];
            }
        }
        usort($exceptions, fn ($a, $b) => $a['pct'] <=> $b['pct']);

        return Inertia::render('Performance/ScorecardView', compact(
            'topDirektorat', 'topDivisi', 'direktoratGrid', 'trend', 'periode',
            'matrix', 'exceptions', 'kpiTotals'
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
        $periode = $request->query('periode') ?? $this->defaultPeriode();
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
        // Data scoping: a unit-level user is locked to their own division; a
        // directorate-level user may view any division within their directorate.
        // SUPERADMIN / executive (portfolio) are unrestricted.
        if ($scope && ! $scope->isExecutive) {
            if ($scope->level === 'unit') {
                $resolvedKode = $this->resolveUserDivisi($user);
            } elseif ($scope->level === 'directorate') {
                $unit = $this->unitForKode($resolvedKode);
                if (! $unit || ! in_array((int) $unit->id, $scope->unitIds, true)) {
                    $resolvedKode = $this->resolveUserDivisi($user);
                }
            }
        }
        $divisiInfo = $this->lookupDivisi($resolvedKode);
        $direktorat = $divisiInfo['direktorat'];
        $divisi     = $divisiInfo['divisi'];
        $peers      = $divisiInfo['peers'];

        $kpiItems       = $this->getDivisiKpi($resolvedKode, $periode);
        $topPerformers  = $this->getDummyDivisiTopPerformers($divisi['kode']);
        $mode = 'single';
        $insight = $this->insight->deriveFromKpiItems($kpiItems);

        return Inertia::render('Performance/DivisiView', compact(
            'mode', 'divisi', 'direktorat', 'peers', 'kpiItems', 'topPerformers', 'insight', 'periode'
        ));
    }

    /**
     * Comparison view: 3-up grid divisi di direktorat user (BOD-fungsional).
     * Divisi list dari getDirektoratGrid() (rollup riil), top KPIs per divisi
     * dari getDivisiKpi() (kpi_divisi_* riil).
     */
    private function divisiComparison(\App\Models\User $user, string $periode): Response
    {
        // Grid now uses the real Directorate.code (DIR-KMR), so match directly.
        $directorate = $user->directorate;
        $dirCode = $directorate?->code;

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
                    : ['kode' => '—', 'nama' => 'Directorate not detected', 'nilai' => 0.0],
                'divisiList' => [],
                'exceptions' => [],
                'periode' => $periode,
            ]);
        }

        $divisiList = [];
        $exceptions = [];
        foreach ($gridDir['divisi'] as $idx => $div) {
            $kpiItems = $this->getDivisiKpi($div['kode'], $periode);

            // Achievement per perspektif BSC (redesain 2026-06-10) — menggantikan
            // "top KPI by bobot" yang bar-nya meng-encode bobot (selalu mirip),
            // bukan kinerja. Kartu kini mini-scorecard: 4 baris perspektif + pct.
            $perAgg = [];
            $onTarget = 0; $atRisk = 0;
            foreach ($kpiItems as $k) {
                $bobot = (float) ($k['bobot'] ?? 0);
                $skor  = (float) ($k['skor'] ?? 0);
                $pct   = $bobot > 0 ? ($skor / $bobot) * 100 : 0;
                // Ambang disamakan dgn Scorecard/matriks: on target = ≥100%
                // (dulu ≥95 → kartu bilang 13/14, matriks 12/14).
                if ($pct >= 100) $onTarget++; else $atRisk++;
                // Pengecualian lintas-divisi (density pass: isi ruang bawah
                // halaman comparison dengan daftar yang actionable).
                if ($pct < 100) {
                    $exceptions[] = [
                        'divisi'    => $div['kode'],
                        'kpi'       => $k['nama'],
                        'pct'       => round($pct, 1),
                        'sasaran'   => $k['sasaran'],
                        'realisasi' => $k['realisasi'],
                        'satuan'    => $k['satuan'],
                        'bobot'     => $bobot,
                    ];
                }
                $p = $k['perspektif'];
                $perAgg[$p]['b'] = ($perAgg[$p]['b'] ?? 0) + $bobot;
                $perAgg[$p]['s'] = ($perAgg[$p]['s'] ?? 0) + $skor;
            }
            $order = ['Financial', 'Customer', 'Internal Business Process', 'L&G'];
            uksort($perAgg, function ($a, $b) use ($order) {
                $ia = array_search($a, $order); $ib = array_search($b, $order);
                return (($ia === false) ? 99 : $ia) <=> (($ib === false) ? 99 : $ib);
            });
            $perspektif = [];
            foreach ($perAgg as $p => $agg) {
                $perspektif[] = [
                    'nama'  => $p,
                    'bobot' => round($agg['b'], 1),
                    'pct'   => $agg['b'] > 0 ? round(($agg['s'] / $agg['b']) * 100, 1) : null,
                ];
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
                'perspektif'  => $perspektif,
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
            'exceptions' => collect($exceptions)->sortBy('pct')->values()->all(),
            'periode' => $periode,
        ]);
    }

    /** Resolve kode divisi dari user. Default DKSA kalau tidak ketemu. */
    private function resolveUserDivisi(?\App\Models\User $user): string
    {
        if (!$user || !$user->unitId) return 'DKSA';
        $unit = OrganizationalUnit::find($user->unitId);
        return str_replace('-HLD', '', $unit?->code ?? 'DKSA');
    }

    /** Lookup divisi info + peer divisi di direktorat yang sama. */
    private function lookupDivisi(string $kode): array
    {
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
        // Grid kosong / kode tidak match → safe placeholder (mencegah infinite
        // recursion ke lookupDivisi('DKSA') ketika source data sudah dibersihkan).
        return [
            'divisi'     => ['kode' => $kode, 'nama' => 'Division not available', 'nilai' => 0.0, 'rank' => 0, 'totalDivisi' => 0],
            'direktorat' => ['kode' => '—', 'nama' => 'No scorecard data yet', 'nilai' => 0.0],
            'peers'      => [],
        ];
    }

    /** Latest periode (YYYY-MM) that has rollup data; falls back to current month. */
    private function defaultPeriode(): string
    {
        return DB::table('DirektoratScorecard')->max('periode')
            ?? DB::table('DivisiScorecard')->max('periode')
            ?? now()->format('Y-m');
    }

    /** Resolve a (possibly bare) division code to its OrganizationalUnit. */
    private function unitForKode(string $kode): ?OrganizationalUnit
    {
        $kode = strtoupper(trim($kode));
        return OrganizationalUnit::where('directorateId', self::DIR_KMR_ID)
            ->where(fn ($q) => $q->where('code', $kode)->orWhere('code', $kode . '-HLD'))
            ->first();
    }

    /**
     * Real directorate→divisi grid from the scorecard rollup tables (replaces
     * the former hardcoded mock). Only directorates with data for the period
     * appear; today that is DIR-KMR. Divisi codes are bare (DKSA, not DKSA-HLD)
     * for clean display + routing.
     */
    private function getDirektoratGrid(): array
    {
        $periode = $this->defaultPeriode();
        $grid = [];
        foreach (DB::table('DirektoratScorecard')->where('periode', $periode)->get() as $row) {
            $dir = Directorate::find($row->directorateId);
            $divisi = DB::table('DivisiScorecard as d')
                ->join('OrganizationalUnit as u', 'u.id', '=', 'd.unitId')
                ->where('d.directorateId', $row->directorateId)
                ->where('d.periode', $periode)
                ->orderByDesc('d.nilai')
                ->get(['u.code', 'u.name', 'd.nilai']);
            $grid[] = [
                'kode' => $dir->code ?? (string) $row->directorateId,
                'nama' => $dir->name ?? '—',
                'nilai' => (float) $row->nilai,
                'divisi' => $divisi->map(fn ($x) => [
                    'kode' => str_replace('-HLD', '', $x->code),
                    'nama' => $x->name,
                    'nilai' => (float) $x->nilai,
                ])->all(),
            ];
        }
        return $grid;
    }

    /**
     * Per-KPI line items for a division, shaped for DivisiView. bobot is emitted
     * as a percentage (6, not 0.06) and skor as the bobot-weighted contribution
     * (bobot × Nilai) so the view's skor/bobot×100 recovers the achievement %.
     * A blank realisasi renders "—" with skor 0 (not measured this period).
     */
    private function getDivisiKpi(string $kode, ?string $periode = null): array
    {
        $periode = $periode ?? $this->defaultPeriode();
        $unit = $this->unitForKode($kode);
        if (! $unit) return [];
        [$y, $m] = array_map('intval', explode('-', $periode));
        $periodId = DB::table('performance_periods')->where('tahun', $y)->where('bulan', $m)->value('id');

        $rows = DB::table('kpi_divisi_items as i')
            ->leftJoin('kpi_divisi_values as v', function ($j) use ($periodId) {
                $j->on('v.kpi_divisi_item_id', '=', 'i.id')->where('v.period_id', '=', $periodId);
            })
            ->where('i.unit_id', $unit->id)
            ->where('i.tahun', $y)
            ->orderBy('i.urutan')
            ->get(['i.urutan', 'i.kode', 'i.nama', 'i.perspektif', 'i.satuan', 'i.polaritas',
                'i.bobot', 'i.strategic_objective', 'v.target', 'v.realisasi', 'v.skor']);

        return $rows->map(fn ($r) => [
            'no' => (int) $r->urutan,
            'kode' => $r->kode,
            'nama' => $r->nama,
            'perspektif' => $this->normPerspektif($r->perspektif),
            'bobot' => round((float) $r->bobot * 100, 2),
            'satuan' => $r->satuan ?: '',
            'polaritas' => $r->polaritas === 'minimize' ? 'minimize' : 'maximize',
            'sasaran' => $this->fmtNum($r->target),
            'realisasi' => $r->realisasi === null ? '—' : $this->fmtNum($r->realisasi),
            'skor' => $r->skor === null ? 0.0 : round((float) $r->bobot * (float) $r->skor, 4),
            'definisi' => $r->strategic_objective,
        ])->all();
    }

    /** Plain, parseable number string (no thousand separators) for FE display. */
    private function fmtNum($v): string
    {
        if ($v === null) return '—';
        return rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.');
    }

    /**
     * Canonicalize BSC perspektif labels — the source files are inconsistent
     * (DIMR writes "IBP", DKSA "Internal Business Process") which would otherwise
     * split into separate groups with wrong order/color in the FE.
     */
    private function normPerspektif(?string $p): string
    {
        return match (strtolower(trim((string) $p))) {
            'financial', 'finansial' => 'Financial',
            'customer' => 'Customer',
            'ibp', 'internal business process' => 'Internal Business Process',
            'l&g', 'lng', 'learning & growth', 'learning and growth' => 'L&G',
            default => trim((string) $p) ?: 'Lainnya',
        };
    }

    /**
     * Directorate-level KPI grouped by BSC perspektif for KolegialDetailView.
     * Reads kpi_direktur_* (the directorate scorecard line items). Director code
     * (e.g. DKM) maps to the real Directorate.code (DIR-KMR). bobot → percentage,
     * skor → bobot-weighted contribution (Σ skor = nilai direktorat); pct per group.
     */
    private function getDirekturKpiGroups(string $directorCode, ?string $periode = null): array
    {
        $periode = $periode ?? $this->defaultPeriode();
        $dirCode = ['DKM' => 'DIR-KMR'][strtoupper($directorCode)] ?? strtoupper($directorCode);
        [$y, $m] = array_map('intval', explode('-', $periode));
        $periodId = DB::table('performance_periods')->where('tahun', $y)->where('bulan', $m)->value('id');

        $rows = DB::table('kpi_direktur_items as i')
            ->leftJoin('kpi_direktur_values as v', function ($j) use ($periodId) {
                $j->on('v.kpi_direktur_item_id', '=', 'i.id')->where('v.period_id', '=', $periodId);
            })
            ->where('i.directorate_code', $dirCode)
            ->orderBy('i.id')
            ->get(['i.kode', 'i.nama', 'i.perspektif', 'i.satuan', 'i.polaritas', 'i.bobot', 'v.target', 'v.realisasi', 'v.skor']);
        if ($rows->isEmpty()) return [];

        $keyOf = fn ($p) => match ($p) {
            'Financial' => 'financial',
            'Customer' => 'customer',
            'Internal Business Process' => 'ibp',
            'L&G' => 'lng',
            default => 'lainnya',
        };
        $order = ['financial', 'customer', 'ibp', 'lng', 'lainnya'];

        $groups = [];
        foreach ($rows as $r) {
            $perspektif = $this->normPerspektif($r->perspektif);
            $key = $keyOf($perspektif);
            $groups[$key] ??= ['perspektif' => $perspektif, 'perspektif_key' => $key, 'items' => []];
            $groups[$key]['items'][] = [
                'kode' => $r->kode,
                'nama' => $r->nama,
                'satuan' => $r->satuan ?: '',
                'polaritas' => $r->polaritas === 'minimize' ? 'minimize' : 'maximize',
                'bobot' => round((float) $r->bobot * 100, 2),
                'target' => $r->target !== null ? (float) $r->target : 0,
                'realisasi' => $r->realisasi !== null ? (float) $r->realisasi : 0,
                'skor' => $r->skor !== null ? round((float) $r->bobot * (float) $r->skor, 4) : 0,
            ];
        }

        $result = array_map(function ($g) {
            $bobot = array_sum(array_column($g['items'], 'bobot'));
            $skor = array_sum(array_column($g['items'], 'skor'));
            $pct = $bobot > 0 ? $skor * 100 / $bobot : 0;
            return [
                'perspektif' => $g['perspektif'],
                'perspektif_key' => $g['perspektif_key'],
                'color' => $pct >= 100 ? 'green' : ($pct >= 80 ? 'yellow' : 'red'),
                'pct' => round($pct, 2),
                'items' => $g['items'],
            ];
        }, $groups);

        usort($result, fn ($a, $b) => array_search($a['perspektif_key'], $order, true) <=> array_search($b['perspektif_key'], $order, true));
        return array_values($result);
    }

    /**
     * DULU: hardcoded top performer per divisi (Dimas, Jonri, Alif, dst.
     * dengan nilai 105.00, 104.50, dll.). Sekarang kosong — divisi view
     * tampil empty state untuk leaderboard. Replace saat KPI individual
     * benar-benar tersedia (mungkin via PerformancePeriod + KpiKaryawanValue).
     */
    private function getDummyDivisiTopPerformers(string $kode): array
    {
        return [];
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

        // Leaderboard dulu hardcoded (Muhammad Muslim Utomo dkk + nilai 104.83
        // dst). Sekarang kosong sampai sumber data KPI individual tersedia.
        $topPerformers = (object) [];

        // Org navigation: derive dari Directorate + OrganizationalUnit (real org
        // facts, bukan dummy KPI). Hanya direktorat aktif yang punya divisi aktif.
        $orgNav = \App\Models\Directorate::query()
            ->where('isActive', true)
            ->orderBy('code')
            ->get(['id', 'code', 'name'])
            ->map(fn ($dir) => [
                'kode'   => $dir->code,
                'nama'   => $dir->name,
                'divisi' => \App\Models\OrganizationalUnit::query()
                    ->where('directorateId', $dir->id)
                    ->where('unitType', 'DIVISI')
                    ->where('isActive', true)
                    ->orderBy('code')
                    ->get(['code', 'name'])
                    ->map(fn ($u) => ['kode' => $u->code, 'nama' => $u->name])
                    ->all(),
            ])
            ->filter(fn ($d) => count($d['divisi']) > 0)
            ->values()
            ->all();

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
            abort(403, "You do not have access to this user's commitment ledger.");
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

        // Karyawan: derive dari User model (identitas riil). Sebelumnya
        // hardcoded "Dimas Aryo Wibisono" untuk semua id — sekarang lookup
        // by id; fallback ke placeholder kalau user tidak ada.
        $user = is_numeric($id) ? \App\Models\User::with(['unit:id,code', 'position:id,name'])->find((int) $id) : null;
        $karyawan = $user ? [
            'id'         => (string) $user->id,
            'nama'       => $user->name,
            'jabatan'    => $user->position?->name ?? '—',
            'unit'       => $user->unit?->code ?? '—',
            'nilai'      => 0.0,
            'jumlah_kpi' => 0,
        ] : [
            'id'         => $id,
            'nama'       => 'Employee not found',
            'jabatan'    => '—',
            'unit'       => '—',
            'nilai'      => 0.0,
            'jumlah_kpi' => 0,
        ];

        // KPI items: kosong sampai modul KPI individual aktif (sebelumnya
        // hardcoded EBITDA/ROI/dst untuk DKSA dengan nilai mock).
        $kpiItems = [];

        return Inertia::render('Performance/IndividuDetailView', compact('karyawan', 'kpiItems', 'periode'));
    }

}
