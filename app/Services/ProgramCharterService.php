<?php

namespace App\Services;

use App\Models\Directorate;
use App\Models\KpiDefinition;
use App\Models\KpiValue;
use App\Models\OrganizationalUnit;
use App\Models\Program;
use App\Models\ProgramProgressLog;
use App\Models\Task;
use App\Models\User;
use App\Services\Helpers\WeekToMonthMapper;

/**
 * Charter View data assembler.
 *
 * Compose a single read-only payload for the Charter mode page
 * (mirrors slide 20–24 of the DKMR May 2026 PPT deck). All data
 * comes from existing tables — no new aggregations beyond the
 * month-from-week derivation handled in WeekToMonthMapper.
 *
 * Contract is documented in docs/CHARTER_VIEW_PLAN.md section 5.5
 * and mirrored in resources/js/types/charter.ts.
 */
class ProgramCharterService
{
    private const MONTH_LABELS = [
        1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr',
        5 => 'Mei', 6 => 'Jun', 7 => 'Jul', 8 => 'Agu',
        9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
    ];

    public function assemble(Program $program): array
    {
        $program->loadMissing(['owner', 'workstreams']);
        $tasks = $this->loadTasks($program);

        return [
            'program'           => $this->buildProgramBlock($program),
            'activities'        => $this->buildActivities($program, $tasks),
            'status'            => $this->buildStatusBlock($program, $tasks),
            'kpi'               => $this->buildKpiBlock($program),
            'latestProgressLog' => $this->buildLatestProgressLog($program),
            'kpiHistory'        => $this->buildKpiHistory($program),
        ];
    }

    /** Load all tasks for the program once — reused by activities + status. */
    private function loadTasks(Program $program): \Illuminate\Support\Collection
    {
        return Task::query()
            ->select(['id', 'title', 'output', 'status', 'plannedWeeks', 'actualWeeks', 'initiativeId'])
            ->whereIn('initiativeId', $program->workstreams->pluck('id'))
            ->with(['workstream:id,name,programId'])
            ->orderBy('initiativeId')
            ->orderBy('id')
            ->get();
    }

    /**
     * Activity rows for the timeline table.
     *
     * One row per Task across all workstreams of the program. Months
     * derived from plannedWeeks/actualWeeks via WeekToMonthMapper:
     *   - target: month overlaps a planned ISO week
     *   - realized: month overlaps an actual ISO week
     *   - below: month was targeted but no actual delivery, and the
     *     month has fully passed (we no longer have time to catch up)
     */
    private function buildActivities(Program $program, \Illuminate\Support\Collection $tasks): array
    {
        $year = (int) ($program->startDate?->format('Y') ?? now()->format('Y'));
        $currentMonth = (int) now()->format('n');
        $currentYear = (int) now()->format('Y');

        return $tasks->map(function (Task $task) use ($year, $currentMonth, $currentYear) {
            $planned = is_array($task->plannedWeeks) ? $task->plannedWeeks : [];
            $actual = is_array($task->actualWeeks) ? $task->actualWeeks : [];

            $months = [];
            foreach (self::MONTH_LABELS as $monthNum => $label) {
                $targeted = WeekToMonthMapper::isMonthTargeted($planned, $year, $monthNum);
                $realized = WeekToMonthMapper::isMonthRealized($actual, $year, $monthNum);
                $monthHasPassed = $year < $currentYear
                    || ($year === $currentYear && $monthNum < $currentMonth);
                $months[$label] = [
                    'target'   => $targeted,
                    'realized' => $realized,
                    'below'    => $targeted && !$realized && $monthHasPassed,
                ];
            }

            return [
                'id'           => $task->id,
                'name'         => $task->title,
                'workstream'   => $task->workstream?->name ?? '',
                'deliverable'  => $task->output,
                'periodicity'  => null,
                'months'       => $months,
            ];
        })->all();
    }

    private function buildProgramBlock(Program $program): array
    {
        $owner = $program->owner;
        $unitId = $program->ownerUnitId ?? $owner?->unitId;
        $unit = $unitId ? OrganizationalUnit::find($unitId) : null;
        $directorate = $unit?->directorateId ? Directorate::find($unit->directorateId) : null;

        $pillars = config('atlas-thresholds.pillars', []);
        $pillarValue = $program->pilarStrategis?->value;

        return [
            'id'                  => $program->id,
            'name'                => $program->name,
            'code'                => $program->code,
            'strategicObjective'  => $program->strategicObjective,
            'pillar'              => $pillarValue,
            'pillarLabel'         => $pillarValue ? ($pillars[$pillarValue] ?? $pillarValue) : null,
            'divisionName'        => $unit?->name ?? '—',
            'directorateName'     => $directorate?->name ?? '—',
            'pic'                 => [
                'name'     => $owner?->name ?? '—',
                'position' => $owner?->positionTitle ?? '—',
            ],
            'period'              => [
                'from' => $program->startDate?->format('Y-m') ?? now()->format('Y-m'),
                'to'   => $program->targetEndDate?->format('Y-m') ?? now()->format('Y-m'),
            ],
            'currentMonth'        => now()->format('Y-m'),
        ];
    }

    private function buildStatusBlock(Program $program, \Illuminate\Support\Collection $tasks): array
    {
        $health = $this->mapHealth($program);
        $totalCount = $tasks->count();
        $completedCount = $tasks->where('status', 'DONE')->count();
        $achievementPct = $this->computeAchievementPct($program, $tasks);

        return [
            'health'         => $health['key'],
            'achievementPct' => $achievementPct,
            'badgeColor'     => $health['color'],
            'completedCount' => $completedCount,
            'totalCount'     => $totalCount,
        ];
    }

    /**
     * Realized weeks ÷ planned weeks counted only up through the current
     * calendar month, summed across all program tasks. Null when there
     * are no planned weeks in the period to date.
     */
    private function computeAchievementPct(Program $program, \Illuminate\Support\Collection $tasks): ?float
    {
        $year = (int) ($program->startDate?->format('Y') ?? now()->format('Y'));
        $currentYear = (int) now()->format('Y');
        $currentMonth = (int) now()->format('n');

        if ($year > $currentYear) {
            return null;
        }

        $cutoffWeek = $year < $currentYear
            ? 53
            : max(WeekToMonthMapper::getWeeksInMonth($year, $currentMonth));

        $plannedToDate = 0;
        $realizedToDate = 0;

        foreach ($tasks as $task) {
            $planned = is_array($task->plannedWeeks) ? $task->plannedWeeks : [];
            $actual = is_array($task->actualWeeks) ? $task->actualWeeks : [];

            $plannedToDate += count(array_filter($planned, fn ($w) => (int) $w <= $cutoffWeek));
            $realizedToDate += count(array_filter($actual, fn ($w) => (int) $w <= $cutoffWeek));
        }

        if ($plannedToDate === 0) {
            return null;
        }

        return round($realizedToDate / $plannedToDate * 100, 1);
    }

    private function buildKpiBlock(Program $program): ?array
    {
        // kelompok di-cast ke Kelompok enum di Program model. Comparison
        // langsung enum !== 'SCORECARD' ALWAYS true (PHP strict type mismatch
        // antara backed enum object vs string) → fungsi ini SEBELUMNYA selalu
        // return null untuk SEMUA program. Silent bug — KPI block di Charter
        // tidak pernah render. Fix: compare via ->value.
        if ($program->kelompok?->value !== 'SCORECARD') {
            return null;
        }
        $kpi = KpiDefinition::query()
            ->where('programId', $program->id)
            ->where('isActive', true)
            ->orderBy('createdAt')
            ->first();

        if (!$kpi) {
            return null;
        }

        return [
            'name'     => $kpi->name,
            'target'   => (float) $kpi->targetValue,
            'unit'     => $kpi->unitOfMeasure ?? '',
            'glossary' => $kpi->description,
        ];
    }

    private function buildLatestProgressLog(Program $program): array
    {
        $log = ProgramProgressLog::query()
            ->where('programId', $program->id)
            ->orderByDesc('createdAt')
            ->first();

        if (!$log) {
            return [
                'asOfMonth'             => null,
                'updateNote'            => null,
                'problemIdentification' => null,
                'correctiveAction'      => null,
                'nextStep'              => null,
                'supportNeeded'         => null,
            ];
        }

        return [
            'asOfMonth'             => $this->formatPeriodLabel($log->period),
            'updateNote'            => $log->narrative,
            'problemIdentification' => $log->kendala,
            'correctiveAction'      => $log->correctiveAction,
            'nextStep'              => $log->nextStep,
            'supportNeeded'         => $log->dukunganDibutuhkan,
        ];
    }

    /**
     * KPI history rows for the bottom progress table — one row per KPI
     * with monthly target and actual numbers. A month cell carries the
     * latest KpiValue measurementDate that falls in that month.
     */
    private function buildKpiHistory(Program $program): array
    {
        $kpis = KpiDefinition::query()
            ->where('programId', $program->id)
            ->where('isActive', true)
            ->orderBy('createdAt')
            ->get(['id', 'name', 'unitOfMeasure']);

        if ($kpis->isEmpty()) {
            return ['rows' => []];
        }

        $year = (int) ($program->startDate?->format('Y') ?? now()->format('Y'));

        $values = KpiValue::query()
            ->whereIn('kpiDefinitionId', $kpis->pluck('id'))
            ->whereYear('measurementDate', $year)
            ->orderBy('measurementDate')
            ->get(['kpiDefinitionId', 'measurementDate', 'targetValue', 'actualValue']);

        $rows = $kpis->map(function (KpiDefinition $kpi) use ($values) {
            $kpiValues = $values->where('kpiDefinitionId', $kpi->id);

            $months = [];
            foreach (self::MONTH_LABELS as $monthNum => $label) {
                $monthValues = $kpiValues->filter(fn ($v) => (int) $v->measurementDate->format('n') === $monthNum);
                $latest = $monthValues->last();

                $target = $latest?->targetValue !== null ? (float) $latest->targetValue : null;
                $real = $latest ? (float) $latest->actualValue : null;
                $status = $this->cellStatus($target, $real);

                $months[$label] = [
                    'target'      => $target,
                    'real'        => $real,
                    'aboveTarget' => $status === 'above', // backward-compat
                    'status'      => $status,
                ];
            }

            $unit = $kpi->unitOfMeasure ? " ({$kpi->unitOfMeasure})" : '';
            return [
                'label'  => $kpi->name . $unit,
                'months' => $months,
            ];
        })->all();

        return ['rows' => $rows];
    }

    /**
     * Status capaian per cell KPI bulanan — mirror PDF DKMR ikon
     * (Above / On / Below / N/A).
     *
     * Toleransi ±5% di sekitar target dianggap "On". Asumsikan polaritas
     * maximize (mayoritas KPI scorecard). KPI minimize jarang dipakai
     * di kontek scorecard direktorat dan bisa di-handle nanti via
     * KpiDefinition.polarity field.
     */
    private function cellStatus(?float $target, ?float $real): string
    {
        if ($target === null || $real === null) return 'na';
        if ($target == 0.0) {
            return $real == 0.0 ? 'on' : 'above';
        }
        $ratio = $real / $target;
        if ($ratio >= 1.05) return 'above';
        if ($ratio >= 0.95) return 'on';
        return 'below';
    }

    /** Map healthStatus + approvalStatus to charter vocabulary. */
    private function mapHealth(Program $program): array
    {
        if ($program->approvalStatus === 'COMPLETED') {
            return ['key' => 'COMPLETED', 'color' => '#2563eb'];
        }
        return match ($program->healthStatus) {
            'GREEN'   => ['key' => 'ON_TRACK',  'color' => '#16a34a'],
            'YELLOW'  => ['key' => 'AT_RISK',   'color' => '#d97706'],
            'RED'     => ['key' => 'TERLAMBAT', 'color' => '#dc2626'],
            default   => ['key' => 'ON_TRACK',  'color' => '#64748b'],
        };
    }

    /** "2026-W17" → "Minggu ke 17 April" (approx — picks the month of the ISO week midpoint). */
    private function formatPeriodLabel(?string $period): ?string
    {
        if (!$period) return null;
        if (preg_match('/^(\d{4})-W(\d{1,2})$/', $period, $m)) {
            $year = (int) $m[1];
            $week = (int) $m[2];
            $midpoint = (new \DateTime())->setISODate($year, $week, 4);
            $monthLabel = self::MONTH_LABELS[(int) $midpoint->format('n')] ?? $midpoint->format('M');
            return "Minggu ke {$week} {$monthLabel}";
        }
        return $period;
    }
}
