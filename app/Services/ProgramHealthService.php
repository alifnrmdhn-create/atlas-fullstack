<?php

namespace App\Services;

use App\Models\KpiDefinition;
use App\Models\Program;
use App\Models\Workstream;

/**
 * Port dari backend/src/domain/programHealth.ts → recomputeProgramHealth().
 *
 * Logika:
 *   1. Ambil workstream aktif (bukan COMPLETED/CANCELLED) → worst healthStatus
 *   2. Ambil KPI yang punya actualValue → hitung status per-KPI vs threshold
 *   3. Composite = worst(workstreamHealth, kpiHealth)
 *   4. Update Program.healthStatus
 */
class ProgramHealthService
{
    const CRITICAL_MULTIPLIER = 0.8;
    const WARNING_MULTIPLIER  = 0.95;

    public function recompute(int $programId): string
    {
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

        $health = $this->worst($wsHealth, $kpiHealth);

        Program::query()->where('id', $programId)->update(['healthStatus' => $health]);

        return $health;
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
