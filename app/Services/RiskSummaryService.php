<?php

namespace App\Services;

use App\Auth\OrgScope;
use App\Models\OrganizationalUnit;
use App\Models\RiskMonthlyReport;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Risk cockpit aggregation for the Home dashboard — scoped to the viewer's org.
 *
 * Mirrors ScorecardSummaryService: surfaces the rich risk data (BUMN 5×5 matrix,
 * KRI, loss events, mitigation, RMI) that already lives in the RiskMonthlyReport
 * subsystem but which Home previously ignored. Per unit we take the LATEST report
 * that actually has risk rows (skipping empty drafts) — same "latest-with-data"
 * fallback as the KPI period resolution.
 */
class RiskSummaryService
{
    /** BUMN 5×5 matrix (row = Kemungkinan 1..5, col = Dampak 1..5) → skor 1..25. */
    private const BUMN_MATRIX = [
        [1,  5, 10, 15, 20],
        [2,  6, 11, 16, 21],
        [3,  8, 13, 18, 23],
        [4,  9, 14, 19, 24],
        [7, 12, 17, 22, 25],
    ];

    private function levelOf(int $score): string
    {
        if ($score >= 20) return 'HIGH';
        if ($score >= 16) return 'MODERATE_TO_HIGH';
        if ($score >= 12) return 'MODERATE';
        if ($score >= 6)  return 'LOW_TO_MODERATE';
        return 'LOW';
    }

    public function homeSnapshot(?User $user = null): array
    {
        $unitIds = $this->resolveScopedUnitIds($user);
        $now = now();

        $query = RiskMonthlyReport::query()
            ->whereHas('riskSnapshots') // only reports that actually carry risk rows
            ->where(fn ($q) => $q->where('year', '<', $now->year)
                ->orWhere(fn ($q2) => $q2->where('year', $now->year)->where('month', '<=', $now->month)))
            ->with(['riskSnapshots.kris', 'riskSnapshots.mitigation', 'lossEvents', 'unit:id,code,name']);
        if ($unitIds !== null) {
            $query->whereIn('unitId', $unitIds);
        }
        $reports = $query->get();

        // Latest (year, month) report per unit.
        $latest = $reports
            ->groupBy('unitId')
            ->map(fn (Collection $g) => $g->sortByDesc(fn ($r) => $r->year * 100 + $r->month)->first())
            ->values();

        $unitsInScope = $unitIds === null
            ? OrganizationalUnit::count()
            : count($unitIds);

        if ($latest->isEmpty()) {
            return [
                'hasData'      => false,
                'unitsInScope' => $unitsInScope,
                'unitsCovered' => 0,
                'periodeLabel' => null,
                'totalRisks'   => 0,
                'levelDist'    => [],
                'matrix'       => $this->emptyMatrix(),
                'topRisks'     => [],
                'kri'          => ['total' => 0, 'critical' => 0, 'warning' => 0, 'normal' => 0, 'items' => []],
                'loss'         => ['count' => 0, 'totalImpact' => 0.0],
                'mitigation'   => ['planned' => 0, 'completed' => 0, 'rate' => 0.0, 'overdue' => 0],
                'rmiScore'     => null,
                'compositeRating' => null,
            ];
        }

        // Flatten snapshots (carry unit code), KRIs, loss events.
        $snapshots = collect();
        $kris = collect();
        $loss = collect();
        foreach ($latest as $report) {
            $unitCode = $report->unit->code ?? '—';
            foreach ($report->riskSnapshots as $s) {
                $s->setAttribute('unitCode', $unitCode);
                $snapshots->push($s);
                foreach ($s->kris as $k) {
                    $k->setAttribute('unitCode', $unitCode);
                    $kris->push($k);
                }
            }
            foreach ($report->lossEvents as $e) {
                $loss->push($e);
            }
        }

        // 5×5 matrix: count snapshots per (probabilitas, dampak).
        $cellCount = [];
        foreach ($snapshots as $s) {
            $key = $s->probabilitas . '-' . $s->dampak;
            $cellCount[$key] = ($cellCount[$key] ?? 0) + 1;
        }
        $matrix = [];
        for ($k = 5; $k >= 1; $k--) {
            $cells = [];
            for ($d = 1; $d <= 5; $d++) {
                $score = self::BUMN_MATRIX[$k - 1][$d - 1];
                $cells[] = [
                    'k'     => $k,
                    'd'     => $d,
                    'score' => $score,
                    'level' => $this->levelOf($score),
                    'count' => $cellCount[$k . '-' . $d] ?? 0,
                ];
            }
            $matrix[] = ['k' => $k, 'cells' => $cells];
        }

        // Level distribution.
        $levelDist = $snapshots->groupBy('riskLevel')->map->count()->toArray();

        // Top risks — worst score first.
        $topRisks = $snapshots
            ->sortByDesc('riskScore')
            ->take(6)
            ->map(fn ($s) => [
                'riskCode'    => $s->riskCode,
                'riskName'    => $s->riskName,
                'category'    => $s->category,
                'probabilitas' => (int) $s->probabilitas,
                'dampak'      => (int) $s->dampak,
                'riskScore'   => (int) $s->riskScore,
                'riskLevel'   => $s->riskLevel,
                'scoreChange' => $s->scoreChange,
                'ownerName'   => $s->ownerName,
                'unitCode'    => $s->getAttribute('unitCode'),
                'mitigationRate' => $s->mitigation
                    ? round((float) $s->mitigation->completionRate * 100)
                    : null,
            ])
            ->values()
            ->all();

        // KRI summary — surface breaches first.
        $kriOrder = ['CRITICAL' => 0, 'WARNING' => 1, 'NORMAL' => 2];
        $kriItems = $kris
            ->sortBy(fn ($k) => $kriOrder[$k->status] ?? 3)
            ->take(8)
            ->map(fn ($k) => [
                'kriName'           => $k->kriName,
                'unit'              => $k->unit,
                'unitCode'          => $k->getAttribute('unitCode'),
                'actualValue'       => (float) $k->actualValue,
                'targetValue'       => (float) $k->targetValue,
                'thresholdWarning'  => (float) $k->thresholdWarning,
                'thresholdCritical' => (float) $k->thresholdCritical,
                'status'            => $k->status,
                'trend'             => $k->trend,
                'higherIsBetter'    => (bool) $k->higherIsBetter,
            ])
            ->values()
            ->all();

        // Mitigation rollup.
        $mitig = $snapshots->map->mitigation->filter();
        $planned = $mitig->sum('plannedActions');
        $completed = $mitig->sum('completedActions');
        $overdue = $mitig->where('isOverdue', true)->count();

        // Period label — single month if all aligned, else "terkini".
        $periods = $latest->map(fn ($r) => $r->year * 100 + $r->month)->unique();
        $top = $latest->sortByDesc(fn ($r) => $r->year * 100 + $r->month)->first();
        $periodeLabel = $periods->count() === 1
            ? Carbon::create($top->year, $top->month, 1)->isoFormat('MMMM YYYY')
            : Carbon::create($top->year, $top->month, 1)->isoFormat('MMMM YYYY') . ' (terkini)';

        return [
            'hasData'      => true,
            'unitsInScope' => $unitsInScope,
            'unitsCovered' => $latest->count(),
            'periodeLabel' => $periodeLabel,
            'totalRisks'   => $snapshots->count(),
            'levelDist'    => $levelDist,
            'matrix'       => $matrix,
            'topRisks'     => $topRisks,
            'kri'          => [
                'total'    => $kris->count(),
                'critical' => $kris->where('status', 'CRITICAL')->count(),
                'warning'  => $kris->where('status', 'WARNING')->count(),
                'normal'   => $kris->where('status', 'NORMAL')->count(),
                'items'    => $kriItems,
            ],
            'loss'         => [
                'count'       => $loss->count(),
                'totalImpact' => round((float) $loss->sum('impactAmount'), 2),
            ],
            'mitigation'   => [
                'planned'   => (int) $planned,
                'completed' => (int) $completed,
                'rate'      => $planned > 0 ? round($completed / $planned * 100) : 0,
                'overdue'   => $overdue,
            ],
            'rmiScore'        => $latest->whereNotNull('rmiScore')->avg('rmiScore'),
            'compositeRating' => $latest->count() === 1 ? $top->compositeRating : null,
        ];
    }

    /** @return array<int, array{k:int, cells: array}> empty 5×5 grid (zero counts). */
    private function emptyMatrix(): array
    {
        $matrix = [];
        for ($k = 5; $k >= 1; $k--) {
            $cells = [];
            for ($d = 1; $d <= 5; $d++) {
                $score = self::BUMN_MATRIX[$k - 1][$d - 1];
                $cells[] = ['k' => $k, 'd' => $d, 'score' => $score, 'level' => $this->levelOf($score), 'count' => 0];
            }
            $matrix[] = ['k' => $k, 'cells' => $cells];
        }
        return $matrix;
    }

    /**
     * Units visible to the viewer. null = all (executive). Directorate-level
     * users see every unit under their directorate (consistent with the
     * scorecard scoping).
     *
     * @return array<int>|null
     */
    private function resolveScopedUnitIds(?User $user): ?array
    {
        if ($user === null) return null;

        $scope = OrgScope::forUser($user);
        if ($scope->isExecutive) return null;

        if ($user->directorateId) {
            return OrganizationalUnit::where('directorateId', $user->directorateId)->pluck('id')->all();
        }

        return $scope->unitIds ?: [];
    }
}
