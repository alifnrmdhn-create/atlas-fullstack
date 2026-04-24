<?php

namespace App\Http\Controllers;

use App\Models\RiskMonthlyReport;
use App\Models\RiskReportApproval;
use App\Models\RiskReportGovernance;
use App\Models\RiskReportKRI;
use App\Models\RiskReportLossEvent;
use App\Models\RiskReportMitigation;
use App\Models\RiskReportNarrative;
use App\Models\RiskReportRiskSnapshot;
use App\Models\RiskReportStrategy;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class RiskReportController extends Controller
{
    /** BUMN 5×5 risk matrix (row=Kemungkinan, col=Dampak). */
    private const BUMN_MATRIX = [
        [1,  5, 10, 15, 20],
        [2,  6, 11, 16, 21],
        [3,  8, 13, 18, 23],
        [4,  9, 14, 19, 24],
        [7, 12, 17, 22, 25],
    ];

    private function bumnScore(int $k, int $d): int
    {
        $ki = max(0, min(4, $k - 1));
        $di = max(0, min(4, $d - 1));
        return self::BUMN_MATRIX[$ki][$di];
    }

    private function computeRiskLevel(int $score): string
    {
        if ($score >= 20) return 'HIGH';
        if ($score >= 16) return 'MODERATE_TO_HIGH';
        if ($score >= 12) return 'MODERATE';
        if ($score >= 6)  return 'LOW_TO_MODERATE';
        return 'LOW';
    }

    private function computeKriStatus(float $actual, float $warning, float $critical, bool $higherIsBetter): string
    {
        if ($higherIsBetter) {
            if ($actual <= $critical) return 'CRITICAL';
            if ($actual <= $warning)  return 'WARNING';
        } else {
            if ($actual >= $critical) return 'CRITICAL';
            if ($actual >= $warning)  return 'WARNING';
        }
        return 'NORMAL';
    }

    private function baseWith(): array
    {
        return [
            'unit:id,code,name',
            'createdBy:id,name',
            'submittedBy:id,name',
            'strategy',
            'governance',
            'narratives',
            'lossEvents',
            'approvals.approver:id,name,roleType',
            'riskSnapshots.kris',
            'riskSnapshots.mitigation',
        ];
    }

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $query = RiskMonthlyReport::query()
            ->with([
                'unit:id,code,name',
                'submittedBy:id,name',
                'approvals.approver:id,name,roleType',
            ])
            ->withCount(['riskSnapshots', 'lossEvents'])
            ->orderByDesc('year')->orderByDesc('month');

        if ($request->year)   $query->where('year', $request->year);
        if ($request->month)  $query->where('month', $request->month);
        if ($request->unitId) $query->where('unitId', $request->unitId);
        if ($request->status) $query->where('status', $request->status);

        return Inertia::render('RiskReportView', [
            'reports' => $query->get(),
            'filters' => $request->only(['year', 'month', 'unitId', 'status']),
        ]);
    }

    public function show(int $id): Response
    {
        $report = RiskMonthlyReport::with($this->baseWith())->findOrFail($id);
        return Inertia::render('RiskReportDetailView', ['report' => $report]);
    }

    // ── JSON endpoints ────────────────────────────────────────────────────────

    public function ytd(int $id)
    {
        $report = RiskMonthlyReport::select('year', 'unitId')->findOrFail($id);

        $yearReports = RiskMonthlyReport::where('unitId', $report->unitId)
            ->where('year', $report->year)
            ->orderBy('month')
            ->get(['id', 'month']);

        $reportIds = $yearReports->pluck('id');
        $monthMap = $yearReports->keyBy('id')->map(fn ($r) => $r->month);

        $kris = RiskReportKRI::whereIn('reportId', $reportIds)
            ->select('reportId', 'kriCode', 'actualValue')
            ->orderBy('reportId')
            ->get();

        // Group: kriCode → [{month, value}]
        $series = [];
        foreach ($kris as $k) {
            $series[$k->kriCode][] = [
                'month' => $monthMap[$k->reportId] ?? 0,
                'value' => (float) $k->actualValue,
            ];
        }

        return response()->json(['data' => $series]);
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020|max:2100',
            'unitId' => 'required|integer',
        ]);

        $existing = RiskMonthlyReport::where('unitId', $data['unitId'])
            ->where('month', $data['month'])
            ->where('year', $data['year'])
            ->first();

        if ($existing) return back()->withErrors(['Laporan risiko untuk periode ini sudah ada.']);

        $report = RiskMonthlyReport::create([
            ...$data,
            'createdById' => $request->user()->id,
            'status' => 'DRAFT',
        ]);

        return redirect()->route('risk-reports.show', $report->id)->with('success', 'Laporan risiko dibuat.');
    }

    /**
     * Full upsert: strategy, governance, narratives, lossEvents,
     * riskSnapshots + KRI + mitigation (dengan BUMN matrix + KRI status calculation).
     */
    public function update(Request $request, int $id): RedirectResponse
    {
        $existing = RiskMonthlyReport::findOrFail($id);
        if ($existing->status === 'APPROVED') {
            return back()->withErrors(['Laporan yang sudah disetujui tidak dapat diubah.']);
        }

        $body = $request->only([
            'strategy', 'riskSnapshots', 'lossEvents', 'governance', 'narratives',
            'compositeRating', 'rmiScore',
        ]);

        DB::transaction(function () use ($existing, $body, $id) {
            // Top-level fields
            $topLevel = [];
            if (isset($body['compositeRating'])) $topLevel['compositeRating'] = $body['compositeRating'];
            if (isset($body['rmiScore']))         $topLevel['rmiScore'] = (float) $body['rmiScore'];
            if (!empty($topLevel)) $existing->update($topLevel);

            // Strategy (upsert)
            if (isset($body['strategy'])) {
                RiskReportStrategy::updateOrCreate(
                    ['reportId' => $id],
                    $body['strategy'],
                );
            }

            // Governance (upsert)
            if (isset($body['governance'])) {
                RiskReportGovernance::updateOrCreate(
                    ['reportId' => $id],
                    $body['governance'],
                );
            }

            // Narratives (replace)
            if (isset($body['narratives'])) {
                RiskReportNarrative::where('reportId', $id)->delete();
                if (!empty($body['narratives'])) {
                    RiskReportNarrative::insert(array_map(fn ($n, $i) => [
                        'reportId' => $id,
                        'section'  => $n['section'],
                        'content'  => $n['content'],
                        'order'    => $n['order'] ?? $i,
                    ], $body['narratives'], array_keys($body['narratives'])));
                }
            }

            // Loss events (replace)
            if (isset($body['lossEvents'])) {
                RiskReportLossEvent::where('reportId', $id)->delete();
                if (!empty($body['lossEvents'])) {
                    RiskReportLossEvent::insert(array_map(fn ($e) => [
                        'reportId' => $id, ...$e,
                    ], $body['lossEvents']));
                }
            }

            // Risk snapshots — full replace + compute BUMN score
            if (isset($body['riskSnapshots'])) {
                // Cascade delete via DB (snapshot → KRI + mitigation)
                RiskReportRiskSnapshot::where('reportId', $id)->delete();

                // Find prev month report for KRI trend
                $prevReport = RiskMonthlyReport::where('unitId', $existing->unitId)
                    ->where('year', $existing->year)
                    ->where('month', '<', $existing->month)
                    ->orderBy('month', 'desc')
                    ->first(['id']);

                foreach ($body['riskSnapshots'] as $i => $snap) {
                    $riskScore = $this->bumnScore(
                        (int) ($snap['probabilitas'] ?? 1),
                        (int) ($snap['dampak'] ?? 1),
                    );
                    $riskLevel = $this->computeRiskLevel($riskScore);

                    $scoreChange = null;
                    if (!is_null($snap['prevMonthScore'] ?? null)) {
                        $prev = (int) $snap['prevMonthScore'];
                        $scoreChange = $riskScore < $prev ? 'IMPROVED' : ($riskScore > $prev ? 'WORSENED' : 'STABLE');
                    }

                    $snapshot = RiskReportRiskSnapshot::create([
                        'reportId'      => $id,
                        'riskCode'      => $snap['riskCode'],
                        'riskName'      => $snap['riskName'],
                        'category'      => $snap['category'],
                        'probabilitas'  => (int) $snap['probabilitas'],
                        'dampak'        => (int) $snap['dampak'],
                        'riskScore'     => $riskScore,
                        'riskLevel'     => $riskLevel,
                        'status'        => $snap['status'] ?? 'OPEN',
                        'prevMonthScore' => $snap['prevMonthScore'] ?? null,
                        'scoreChange'   => $scoreChange,
                        'ownerName'     => $snap['ownerName'],
                        'notes'         => $snap['notes'] ?? null,
                        'order'         => $i,
                    ]);

                    // KRI rows
                    if (!empty($snap['kris'])) {
                        foreach ($snap['kris'] as $j => $kri) {
                            $prevMonthValue = null;
                            if ($prevReport) {
                                $prevKri = RiskReportKRI::where('reportId', $prevReport->id)
                                    ->where('kriCode', $kri['kriCode'])
                                    ->value('actualValue');
                                $prevMonthValue = $prevKri !== null ? (float) $prevKri : null;
                            }

                            $kriStatus = $this->computeKriStatus(
                                (float) $kri['actualValue'],
                                (float) $kri['thresholdWarning'],
                                (float) $kri['thresholdCritical'],
                                (bool) ($kri['higherIsBetter'] ?? true),
                            );

                            $trend = 'STABLE';
                            if ($prevMonthValue !== null) {
                                $delta = (float) $kri['actualValue'] - $prevMonthValue;
                                $hib = (bool) ($kri['higherIsBetter'] ?? true);
                                $trend = ($hib ? $delta > 0 : $delta < 0) ? 'IMPROVING'
                                    : (($hib ? $delta < 0 : $delta > 0) ? 'WORSENING' : 'STABLE');
                            }

                            RiskReportKRI::create([
                                'reportId'          => $id,
                                'riskSnapshotId'    => $snapshot->id,
                                'kriCode'           => $kri['kriCode'],
                                'kriName'           => $kri['kriName'],
                                'unit'              => $kri['unit'],
                                'targetValue'       => (float) $kri['targetValue'],
                                'actualValue'       => (float) $kri['actualValue'],
                                'thresholdWarning'  => (float) $kri['thresholdWarning'],
                                'thresholdCritical' => (float) $kri['thresholdCritical'],
                                'status'            => $kriStatus,
                                'trend'             => $trend,
                                'prevMonthValue'    => $prevMonthValue,
                                'higherIsBetter'    => (bool) ($kri['higherIsBetter'] ?? true),
                                'notes'             => $kri['notes'] ?? null,
                                'order'             => $j,
                            ]);
                        }
                    }

                    // Mitigation row
                    if (!empty($snap['mitigation'])) {
                        $m = $snap['mitigation'];
                        $planned   = max(1, (int) ($m['plannedActions'] ?? 1));
                        $completed = (int) ($m['completedActions'] ?? 0);
                        $alloc     = isset($m['budgetAllocated'])  ? (float) $m['budgetAllocated']  : null;
                        $realized  = isset($m['budgetRealized'])   ? (float) $m['budgetRealized']   : null;
                        $absorption = ($alloc && $realized) ? ($realized / $alloc) : null;

                        RiskReportMitigation::create([
                            'reportId'        => $id,
                            'riskSnapshotId'  => $snapshot->id,
                            'plannedActions'  => $planned,
                            'completedActions' => $completed,
                            'completionRate'  => $completed / $planned,
                            'budgetAllocated' => $alloc,
                            'budgetRealized'  => $realized,
                            'budgetAbsorption' => $absorption,
                            'isOverdue'       => (bool) ($m['isOverdue'] ?? false),
                            'overdueDays'     => $m['overdueDays'] ?? null,
                            'notes'           => $m['notes'] ?? null,
                        ]);
                    }
                }
            }
        });

        return back()->with('success', 'Laporan risiko disimpan.');
    }

    public function submit(Request $request, int $id): RedirectResponse
    {
        $report = RiskMonthlyReport::findOrFail($id);
        if ($report->status !== 'DRAFT') return back()->withErrors(['Hanya laporan DRAFT yang dapat disubmit.']);

        $userId = $request->user()->id;

        DB::transaction(function () use ($report, $userId, $id) {
            $report->update([
                'status' => 'PENDING_KASUB',
                'submittedById' => $userId,
                'submittedAt' => now(),
            ]);
            RiskReportApproval::create([
                'reportId' => $id,
                'approverId' => $userId,
                'approverRole' => 'SUBMITTER',
                'action' => 'SUBMIT',
            ]);
        });

        return back()->with('success', 'Laporan risiko disubmit.');
    }

    public function approve(Request $request, int $id): RedirectResponse
    {
        $data = $request->validate([
            'action' => 'required|in:APPROVE,REJECT',
            'note' => 'nullable|string|max:500',
        ]);

        $report = RiskMonthlyReport::findOrFail($id);
        $user = $request->user();

        $nextStatus = $data['action'] === 'REJECT'
            ? 'REJECTED'
            : ($report->status === 'PENDING_KASUB' ? 'PENDING_KADIV' : 'APPROVED');

        DB::transaction(function () use ($report, $user, $data, $nextStatus, $id) {
            RiskReportApproval::create([
                'reportId' => $id,
                'approverId' => $user->id,
                'approverRole' => strtoupper($user->roleType),
                'action' => $data['action'],
                'note' => $data['note'] ?? null,
            ]);
            $report->update([
                'status' => $nextStatus,
                ...($nextStatus === 'APPROVED' ? ['approvedAt' => now()] : []),
            ]);
        });

        return back()->with('success', "Laporan risiko {$data['action']}D.");
    }
}
