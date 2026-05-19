<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Services\KpiInsightService;
use App\Services\ScorecardSummaryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PerformanceController extends Controller
{
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

        // Trend skor 6 bulan terakhir untuk bar chart (Gap #2 vs PDF slide 8)
        $trend = $this->scorecard->trendDirektorat($user, 6, $periode);

        return Inertia::render('Performance/ScorecardView', compact(
            'topDirektorat', 'topDivisi', 'direktoratGrid', 'trend', 'periode'
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
        $insight = $this->insight->deriveFromKpiItems($kpiItems);

        return Inertia::render('Performance/DivisiView', compact(
            'mode', 'divisi', 'direktorat', 'peers', 'kpiItems', 'topPerformers', 'insight', 'periode'
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
            'divisi'     => ['kode' => $kode, 'nama' => 'Divisi tidak tersedia', 'nilai' => 0.0, 'rank' => 0, 'totalDivisi' => 0],
            'direktorat' => ['kode' => '—', 'nama' => 'Belum ada data scorecard', 'nilai' => 0.0],
            'peers'      => [],
        ];
    }

    /**
     * DULU: hardcoded mock grid (102.92, 99.13, 65.58, dst.) yang ikut diseed
     * ke DirektoratScorecard. Sekarang kosong — divisi/comparison view jatuh
     * ke empty state. Saat data KPI riil tersedia, replace dengan query ke
     * ScorecardSummaryService::direktoratGrid() atau KpiDefinition/KpiValue.
     */
    private function getDirektoratGrid(): array
    {
        return [];
    }

    /**
     * DULU: KPI items per divisi (DKSA 16-KPI, DAPN 18-KPI, DIMR 14-KPI dari
     * PDF DKMR 15 Mei 2026 + generic 5-item template untuk lain). Sekarang
     * kosong — divisi view tampil empty state. Replace saat KpiDefinition/
     * KpiValue terisi.
     */
    private function getDummyDivisiKpi(string $kode): array
    {
        return [];
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

        // Karyawan: derive dari User model (identitas riil). Sebelumnya
        // hardcoded "Dimas Aryo Wibisono" untuk semua id — sekarang lookup
        // by id; fallback ke placeholder kalau user tidak ada.
        $user = is_numeric($id) ? \App\Models\User::with(['unit:id,code', 'position:id,title'])->find((int) $id) : null;
        $karyawan = $user ? [
            'id'         => (string) $user->id,
            'nama'       => $user->name,
            'jabatan'    => $user->position?->title ?? '—',
            'unit'       => $user->unit?->code ?? '—',
            'nilai'      => 0.0,
            'jumlah_kpi' => 0,
        ] : [
            'id'         => $id,
            'nama'       => 'Karyawan tidak ditemukan',
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

    /**
     * DULU: hardcoded KPI groups per direktur (Kolegial BOD template + 19-KPI
     * DKMR detail dari PDF 15 Mei 2026). Sekarang kosong — kolegial detail
     * view tampil empty state. Replace saat KpiDefinition + KpiValue terisi.
     */
    private function getDummyKolegialKpi(string $kode): array
    {
        return [];
    }

}
