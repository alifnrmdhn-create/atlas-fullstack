<?php

namespace App\Services;

use App\Models\Blocker;
use App\Models\KpiDefinition;
use App\Models\Program;
use App\Models\ProgramApprovalLog;
use App\Models\Task;
use App\Models\Workstream;

/**
 * Port dari backend/src/domain/programHealth.ts → recomputeProgramHealth().
 *
 * Sprint 5 update — sekarang composite dari 4 signal:
 *   1. Workstream worst healthStatus
 *   2. KPI deviation vs threshold
 *   3. Task overdue ratio (NEW)        — threshold di config/atlas-thresholds
 *   4. Open blocker count (NEW)        — threshold di config/atlas-thresholds
 *
 * Tetap update Program.healthStatus + autoHealthComputedAt timestamp.
 */
class ProgramHealthService
{
    const CRITICAL_MULTIPLIER = 0.8;
    const WARNING_MULTIPLIER  = 0.95;

    public function recompute(int $programId): string
    {
        // Grace period: program yang baru aktif tidak boleh langsung kena
        // At Risk / Terlambat. UI banner "Program baru aktif · siap dieksekusi"
        // jadi kontradiktif kalau status di header sudah At Risk. Skip
        // computation selama N hari sejak ACTIVATED.
        if ($this->isWithinGracePeriod($programId)) {
            Program::query()->where('id', $programId)->update([
                'healthStatus' => 'GREEN',
                'autoHealthComputedAt' => now(),
            ]);
            return 'GREEN';
        }

        [$workstreams, $kpis] = [
            Workstream::query()
                ->where('programId', $programId)
                ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
                ->get(['healthStatus', 'status']),

            KpiDefinition::query()
                ->where('programId', $programId)
                ->whereNotNull('actualValue')
                ->get(['actualValue', 'targetValue', 'warningThreshold', 'criticalThreshold']),
        ];

        // Workstream signal
        $wsHealth = 'GREEN';
        if ($workstreams->contains('healthStatus', 'RED')) $wsHealth = 'RED';
        elseif ($workstreams->contains('healthStatus', 'YELLOW')) $wsHealth = 'YELLOW';

        // KPI signal
        $kpiHealth = 'GREEN';
        if ($kpis->isNotEmpty()) {
            $redCount = $yellowCount = 0;
            foreach ($kpis as $kpi) {
                $status = $this->kpiStatus(
                    (float) $kpi->actualValue,
                    (float) $kpi->targetValue,
                    $kpi->criticalThreshold !== null ? (float) $kpi->criticalThreshold : null,
                    $kpi->warningThreshold  !== null ? (float) $kpi->warningThreshold  : null,
                );
                if ($status === 'RED')    $redCount++;
                elseif ($status === 'YELLOW') $yellowCount++;
            }
            if ($redCount >= 2)         $kpiHealth = 'RED';
            elseif ($redCount >= 1)     $kpiHealth = 'YELLOW';
            elseif ($yellowCount >= 1)  $kpiHealth = 'YELLOW';
        }

        $taskHealth = $this->computeTaskOverdueHealth($programId);
        $blockerHealth = $this->computeBlockerHealth($programId);

        $health = $this->worst($this->worst($wsHealth, $kpiHealth), $this->worst($taskHealth, $blockerHealth));

        Program::query()->where('id', $programId)->update([
            'healthStatus' => $health,
            'autoHealthComputedAt' => now(),
        ]);

        return $health;
    }

    /**
     * Cek apakah program masih dalam grace period sejak terakhir kali ACTIVATED.
     * Return false untuk program yang belum pernah aktif (tidak ada log).
     * Pakai approval log, bukan timestamp di Program, supaya re-activation
     * (mis. setelah COMPLETED → ACTIVE lagi) juga reset grace.
     */
    private function isWithinGracePeriod(int $programId): bool
    {
        $days = (int) config('atlas-thresholds.auto_health.grace_period_days', 7);
        if ($days <= 0) return false;

        $lastActivated = ProgramApprovalLog::query()
            ->where('programId', $programId)
            ->where('toStatus', 'ACTIVE')
            ->orderByDesc('createdAt')
            ->value('createdAt');

        if (! $lastActivated) return false;
        // Pakai isFuture() — Carbon 3 diffInDays returns signed float, abs lebih jelas.
        return $lastActivated->copy()->addDays($days)->isFuture();
    }

    /** Sprint 5 — task overdue ratio signal. */
    private function computeTaskOverdueHealth(int $programId): string
    {
        $tasks = Task::query()
            ->whereHas('workstream', fn ($q) => $q->where('programId', $programId))
            ->whereNotIn('status', ['COMPLETED', 'DONE', 'CANCELLED'])
            ->whereNotNull('targetCompletion')
            ->get(['targetCompletion', 'actualCompletion']);

        if ($tasks->isEmpty()) return 'GREEN';

        $now = now();
        $overdueCount = $tasks->filter(fn ($t) => $t->targetCompletion < $now)->count();
        $ratio = $overdueCount / $tasks->count();

        $redThreshold = (float) setting('auto_health.red_overdue_ratio', 0.30);
        $yellowThreshold = (float) setting('auto_health.yellow_overdue_ratio', 0.10);

        if ($ratio >= $redThreshold) return 'RED';
        if ($ratio >= $yellowThreshold) return 'YELLOW';
        return 'GREEN';
    }

    /** Sprint 5 — open blocker count signal. */
    private function computeBlockerHealth(int $programId): string
    {
        $count = Blocker::query()
            ->whereHas('task.workstream', fn ($q) => $q->where('programId', $programId))
            ->whereNotIn('status', ['RESOLVED'])
            ->count();

        $redThreshold = (int) setting('auto_health.red_blocker_count', 3);
        $yellowThreshold = (int) setting('auto_health.yellow_blocker_count', 1);

        if ($count >= $redThreshold) return 'RED';
        if ($count >= $yellowThreshold) return 'YELLOW';
        return 'GREEN';
    }

    public static function kpiStatus(float $actual, float $target, ?float $critical, ?float $warning): string
    {
        $c = $critical ?? $target * self::CRITICAL_MULTIPLIER;
        $w = $warning  ?? $target * self::WARNING_MULTIPLIER;
        if ($actual <= $c) return 'RED';
        if ($actual <= $w) return 'YELLOW';
        return 'GREEN';
    }

    private function worst(string $a, string $b): string
    {
        if ($a === 'RED'    || $b === 'RED')    return 'RED';
        if ($a === 'YELLOW' || $b === 'YELLOW') return 'YELLOW';
        return 'GREEN';
    }
}
