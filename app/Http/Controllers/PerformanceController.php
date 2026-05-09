<?php

namespace App\Http\Controllers;

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
    public function kolegial(Request $request): Response
    {
        $periode = $request->query('periode') ?? now()->format('Y-m');
        $grid = $this->scorecard->direktoratGrid($request->user(), $periode);

        // total_kpi & perspektif extended metadata kept static — these are
        // organizational facts not currently in the scorecard table; can be
        // promoted to a separate table when KPI catalog UI lands (Phase 3).
        $totalKpiByCode = ['DIRUT' => 12, 'DBS' => 10, 'DAS' => 10, 'DPP' => 18, 'DSU' => 10, 'DKM' => 10];
        $perspektifByCode = ['DIRUT' => ['Ekonomi & Sosial', 'IMB', 'Teknologi', 'Investasi', 'Talenta']];

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
     * Halaman KPI per-divisi. Resolve $kode dari user.unitId kalau null.
     * Render Performance/DivisiView dengan KPI strip + peer divisi + top performer.
     *
     * Note: data dummy. Integrasi data riil di Sprint 6.
     */
    public function divisi(Request $request, ?string $kode = null): Response
    {
        $periode = $request->query('periode', '2026-03');

        // Resolve default kode dari unit user kalau tidak diberikan
        $resolvedKode = $kode ?? $this->resolveUserDivisi($request->user());

        $divisiInfo = $this->lookupDivisi($resolvedKode);
        $direktorat = $divisiInfo['direktorat'];
        $divisi     = $divisiInfo['divisi'];
        $peers      = $divisiInfo['peers'];

        $kpiItems       = $this->getDummyDivisiKpi($divisi['kode']);
        $topPerformers  = $this->getDummyDivisiTopPerformers($divisi['kode']);

        return Inertia::render('Performance/DivisiView', compact(
            'divisi', 'direktorat', 'peers', 'kpiItems', 'topPerformers', 'periode'
        ));
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
            ['kode' => 'DKM', 'nama' => 'Direktur Keuangan & MR', 'nilai' => 101.85, 'divisi' => [
                ['kode' => 'DKSA', 'nama' => 'Keuangan Strategis & Anggaran', 'nilai' => 102.27],
                ['kode' => 'DAPN', 'nama' => 'Akuntansi dan Perpajakan',       'nilai' => 100.86],
                ['kode' => 'DIMR', 'nama' => 'Manajemen Risiko',               'nilai' => 101.96],
            ]],
        ];
    }

    /** Dummy KPI items per divisi. Format konsisten dengan IndividuDetail. */
    private function getDummyDivisiKpi(string $kode): array
    {
        // Untuk MVP, return template generik yang bisa di-customize per divisi.
        // Sprint 6: tarik dari KpiDefinition table.
        return [
            ['no' => 1, 'kode' => 'DIV-001', 'nama' => 'Pencapaian KPI Direktorat',     'bobot' => 30, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '102.27', 'skor' => 30.68, 'definisi' => 'Kontribusi divisi ke KPI direktorat induk.'],
            ['no' => 2, 'kode' => 'DIV-002', 'nama' => '% On-Time Penyelesaian Program', 'bobot' => 25, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '95',     'skor' => 23.75, 'definisi' => 'Persentase program kerja divisi selesai sesuai target waktu.'],
            ['no' => 3, 'kode' => 'DIV-003', 'nama' => '% Penyerapan Anggaran',          'bobot' => 20, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '95',  'realisasi' => '92',     'skor' => 19.37, 'definisi' => 'Realisasi penyerapan anggaran divisi.'],
            ['no' => 4, 'kode' => 'DIV-004', 'nama' => 'Jumlah Fraud',                   'bobot' => 5,  'satuan' => 'Jumlah','polaritas' => 'minimize','sasaran' => '0',   'realisasi' => '0',      'skor' => 5.00,  'definisi' => 'Komitmen anti-fraud divisi.'],
            ['no' => 5, 'kode' => 'DIV-005', 'nama' => 'Index Kepuasan Stakeholder',     'bobot' => 20, 'satuan' => '%',  'polaritas' => 'maximize', 'sasaran' => '85',  'realisasi' => '88',     'skor' => 20.71, 'definisi' => 'Survey kepuasan internal/eksternal stakeholder.'],
        ];
    }

    /** Dummy top performer di divisi. */
    private function getDummyDivisiTopPerformers(string $kode): array
    {
        return [
            ['rank' => 1, 'nama' => 'Dimas Aryo Wibisono',          'jabatan' => 'Kepala Sub Divisi Anggaran',                          'nilai' => 105.00],
            ['rank' => 2, 'nama' => 'Deny Ariyanto Prabowo',        'jabatan' => 'Kepala Sub Divisi HPS dan Informasi Harga',           'nilai' => 105.00],
            ['rank' => 3, 'nama' => 'Raja Agustino M. Sembiring',   'jabatan' => 'Kepala Sub Divisi Keuangan Strategis & Perencanaan',  'nilai' => 104.83],
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
}
