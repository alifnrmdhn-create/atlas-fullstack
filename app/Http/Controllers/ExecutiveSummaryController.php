<?php

namespace App\Http\Controllers;

use App\Models\Program;
use App\Services\KpiInsightService;
use App\Services\ScorecardSummaryService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Executive Summary — 1-halaman snapshot eksekutif (Gap #1).
 *
 * Mirror slide 2 PDF DKMR ("Executive Summary - Monitoring Program Kerja"):
 *   - 4 angka capaian KPI direktorat & divisi
 *   - Status program (On Track / Completed / At Risk / Terlambat)
 *   - Highlight capaian positif (auto-derived KPI bullets)
 *   - Perhatian khusus (program at-risk / terlambat dekat deadline)
 *   - Tren KPI 6 bulan
 *   - Leaderboard BOD-1/-2/-3
 *
 * Composes existing services — no new business logic. Frontend export
 * to PPTX via pptxgenjs (mirror Charter export pattern).
 */
class ExecutiveSummaryController extends Controller
{
    public function __construct(
        private readonly ScorecardSummaryService $scorecard,
        private readonly KpiInsightService $insight,
    ) {}

    public function show(Request $request): Response
    {
        $user = $request->user();
        $periode = $request->query('periode') ?? now()->format('Y-m');

        // Grid direktorat (4 angka utama untuk hero strip)
        $direktoratGrid = $this->scorecard->direktoratGrid($user, $periode);

        // Tren 6 bulan untuk chart
        $trend = $this->scorecard->trendDirektorat($user, 6, $periode);

        // Status program — On Track / At Risk / Terlambat / Completed
        // Scope: kalau bukan eksekutif, hanya program di unit user
        $programStatusBreakdown = $this->computeProgramStatusBreakdown($user);

        // Perhatian khusus: program healthStatus YELLOW/RED + target end dekat
        $perhatianKhusus = $this->computePerhatianKhusus($user);

        // Insight utama dari portfolio KPI — pakai hardcoded DKMR sebagai
        // representative (sumber data riil pending integrasi APMS).
        $insightSeed = $this->seedDkmrKpiItemsForInsight();
        $insight = $this->insight->deriveFromKpiItems($insightSeed);

        // Leaderboard BOD — copy dari PerformanceController seed
        $leaderboard = $this->seedLeaderboard();

        return Inertia::render('ExecutiveSummaryView', compact(
            'direktoratGrid',
            'trend',
            'programStatusBreakdown',
            'perhatianKhusus',
            'insight',
            'leaderboard',
            'periode',
        ));
    }

    /**
     * Hitung breakdown status program di scope user.
     *
     * Map healthStatus + approvalStatus → vokabulari charter:
     *   - approvalStatus=COMPLETED              → Completed
     *   - healthStatus=GREEN                    → On Track
     *   - healthStatus=YELLOW                   → At Risk
     *   - healthStatus=RED                      → Terlambat
     */
    private function computeProgramStatusBreakdown($user): array
    {
        $orgScope = \App\Auth\OrgScope::forUser($user);
        $query = Program::query()->whereNull('archivedAt');
        if (!$orgScope->isExecutive && !empty($orgScope->unitIds)) {
            $query->whereIn('ownerUnitId', $orgScope->unitIds);
        }
        $programs = $query->get(['id', 'healthStatus', 'approvalStatus']);

        $onTrack = 0;
        $atRisk = 0;
        $terlambat = 0;
        $completed = 0;

        foreach ($programs as $p) {
            if ($p->approvalStatus === 'COMPLETED') {
                $completed++;
                continue;
            }
            $status = $p->healthStatus ?? 'GREEN';
            if ($status === 'GREEN') $onTrack++;
            elseif ($status === 'YELLOW') $atRisk++;
            elseif ($status === 'RED') $terlambat++;
            else $onTrack++;
        }

        $total = $onTrack + $atRisk + $terlambat + $completed;

        return [
            'total'     => $total,
            'onTrack'   => $onTrack,
            'atRisk'    => $atRisk,
            'terlambat' => $terlambat,
            'completed' => $completed,
            'pctOnTrack'   => $total > 0 ? round($onTrack / $total * 100) : 0,
            'pctAtRisk'    => $total > 0 ? round($atRisk / $total * 100) : 0,
            'pctTerlambat' => $total > 0 ? round($terlambat / $total * 100) : 0,
            'pctCompleted' => $total > 0 ? round($completed / $total * 100) : 0,
        ];
    }

    /**
     * Top program perhatian khusus — kombinasi healthStatus YELLOW/RED
     * + target end ≤ 60 hari (mirror "Top 10 Program Target Ketat" PDF slide 18).
     */
    private function computePerhatianKhusus($user, int $limit = 5): array
    {
        $orgScope = \App\Auth\OrgScope::forUser($user);
        $now = now();

        $query = Program::query()
            ->whereNull('archivedAt')
            ->where('approvalStatus', 'ACTIVE')
            ->whereIn('healthStatus', ['YELLOW', 'RED']);

        if (!$orgScope->isExecutive && !empty($orgScope->unitIds)) {
            $query->whereIn('ownerUnitId', $orgScope->unitIds);
        }

        return $query
            ->orderByRaw('CASE "healthStatus" WHEN \'RED\' THEN 1 WHEN \'YELLOW\' THEN 2 ELSE 3 END')
            ->orderBy('targetEndDate')
            ->limit($limit)
            ->get(['id', 'code', 'name', 'healthStatus', 'targetEndDate', 'dukunganDibutuhkan', 'progresTerkini'])
            ->map(function (Program $p) use ($now) {
                $days = $p->targetEndDate ? $now->diffInDays($p->targetEndDate, false) : null;
                $status = $p->healthStatus === 'RED' ? 'Terlambat' : 'At Risk';
                return [
                    'id'         => $p->id,
                    'code'       => $p->code,
                    'name'       => $p->name,
                    'status'     => $status,
                    'deadline'   => $p->targetEndDate?->format('Y-m-d'),
                    'daysLeft'   => $days,
                    'dukungan'   => $p->dukunganDibutuhkan,
                    'progress'   => $p->progresTerkini,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Seed KPI items dari PDF DKMR — sumber narrative "Insight Utama".
     * Pre-existing pattern di PerformanceController; di-extract supaya
     * Executive view bisa share data tanpa duplikasi controller-to-controller.
     */
    private function seedDkmrKpiItemsForInsight(): array
    {
        return [
            ['nama' => 'EBITDA',                                    'polaritas' => 'maximize', 'sasaran' => '1.483',  'realisasi' => '3.257,8', 'satuan' => 'Rp Miliar'],
            ['nama' => 'Net Operating Cash Flow (NOCF)',            'polaritas' => 'maximize', 'sasaran' => '1.534',  'realisasi' => '3.305',   'satuan' => 'Rp Miliar'],
            ['nama' => '% Debt To Equity Ratio',                    'polaritas' => 'minimize', 'sasaran' => '60',     'realisasi' => '44,39',   'satuan' => '%'],
            ['nama' => 'Skor Aspek Kualitas MR',                    'polaritas' => 'maximize', 'sasaran' => '81',     'realisasi' => '90',      'satuan' => 'Skor'],
            ['nama' => 'Minimum Cash Balance',                      'polaritas' => 'maximize', 'sasaran' => '256',    'realisasi' => '345',     'satuan' => 'Rp Miliar'],
            ['nama' => '% On Time Risk Oversight & Evaluation',     'polaritas' => 'maximize', 'sasaran' => '96',     'realisasi' => '100',     'satuan' => '%'],
            ['nama' => 'Skor Aspek Kinerja',                        'polaritas' => 'maximize', 'sasaran' => '80',     'realisasi' => '77',      'satuan' => 'Skor'],
            ['nama' => 'Skor Aspek Kualitas Penerapan MR',          'polaritas' => 'maximize', 'sasaran' => '81',     'realisasi' => '78',      'satuan' => 'Skor'],
            ['nama' => 'Denda Pajak',                               'polaritas' => 'minimize', 'sasaran' => '0,7',    'realisasi' => '0',       'satuan' => 'Rp'],
            ['nama' => 'Jumlah Temuan Audit Keuangan Signifikan',   'polaritas' => 'minimize', 'sasaran' => '15',     'realisasi' => '0',       'satuan' => 'Jumlah'],
        ];
    }

    private function seedLeaderboard(): array
    {
        return [
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
    }
}
