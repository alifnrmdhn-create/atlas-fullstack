<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use App\Services\SettingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Post-MVP — Admin UI untuk threshold values dinamis.
 *
 * Permission: superadmin only (admin biasa tidak — angka-angka ini critical
 * untuk perilaku sistem; Tujuannya per-direktorat tunable di pasca-pilot).
 */
class AdminThresholdsController extends Controller
{
    public function __construct(private SettingService $svc) {}

    private function ensureSuperAdmin(Request $request): void
    {
        $role = strtoupper($request->user()->roleType ?? '');
        if ($role !== 'SUPERADMIN') {
            abort(403, 'Hanya superadmin yang dapat mengubah threshold sistem.');
        }
    }

    public function index(Request $request): Response
    {
        $this->ensureSuperAdmin($request);

        // Defaults dari config untuk fallback display
        $defaults = config('atlas-thresholds');

        // Override dari DB
        $overrides = SystemSetting::all(['key', 'value', 'category', 'description', 'updatedAt'])
            ->keyBy('key')
            ->toArray();

        return Inertia::render('AdminThresholdsView', [
            'schema' => $this->getSchema(),
            'defaults' => $defaults,
            'overrides' => $overrides,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validate([
            'key' => 'required|string|max:150',
            'value' => 'required',
            'category' => 'required|string|max:60',
            'description' => 'nullable|string|max:500',
        ]);

        // Validate key is in known schema (security: prevent arbitrary key write)
        $schema = $this->getSchema();
        $validKeys = collect($schema)->flatMap(fn ($cat) => array_keys($cat['fields']))->all();
        if (!in_array($data['key'], $validKeys, true)) {
            return response()->json(['message' => 'Key tidak dikenal: ' . $data['key']], 422);
        }

        $row = $this->svc->set(
            $data['key'],
            $data['value'],
            $data['category'],
            $request->user()->id,
            $data['description'] ?? null,
        );

        return response()->json(['data' => $row]);
    }

    public function reset(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);
        $data = $request->validate(['key' => 'required|string|max:150']);
        $this->svc->reset($data['key']);
        return response()->json(['ok' => true]);
    }

    /**
     * Schema definition untuk UI form. Single source of truth: label, helper,
     * type, default, dan category ada di sini.
     */
    private function getSchema(): array
    {
        return [
            [
                'category' => 'escalation_aging',
                'title' => 'Escalation Aging',
                'helper' => 'Berapa hari menunggu sebelum indicator visual berubah warna. Bukan deadline disposition — hanya signal aging.',
                'fields' => [
                    'escalation_aging.yellow_after_days' => ['label' => 'Berubah kuning setelah', 'type' => 'int', 'unit' => 'hari'],
                    'escalation_aging.orange_after_days' => ['label' => 'Berubah oranye setelah', 'type' => 'int', 'unit' => 'hari'],
                    'escalation_aging.red_after_days' => ['label' => 'Berubah merah setelah', 'type' => 'int', 'unit' => 'hari'],
                ],
            ],
            [
                'category' => 'carryover',
                'title' => 'Action Item Carryover',
                'helper' => 'Berapa kali action item rapat boleh "carry over" sebelum sistem nudge atau auto-eskalasi.',
                'fields' => [
                    'carryover.nudge_threshold' => ['label' => 'Soft nudge (prompt: apa yang stuck?)', 'type' => 'int', 'unit' => 'kali'],
                    'carryover.auto_clearpath_threshold' => ['label' => 'Auto-suggest Clear the Path', 'type' => 'int', 'unit' => 'kali'],
                    'carryover.force_disposition_threshold' => ['label' => 'Force atasan disposition', 'type' => 'int', 'unit' => 'kali'],
                ],
            ],
            [
                'category' => 'progress_log',
                'title' => 'Progress Log Freshness',
                'helper' => 'Cadence pelaporan progres program.',
                'fields' => [
                    'progress_log.stale_after_days' => ['label' => 'Stale setelah', 'type' => 'int', 'unit' => 'hari'],
                ],
            ],
            [
                'category' => 'auto_health',
                'title' => 'Auto-Health Derivation',
                'helper' => 'Threshold untuk derive program health (RED/YELLOW) dari signal aktual.',
                'fields' => [
                    'auto_health.red_overdue_ratio' => ['label' => '% task overdue → RED', 'type' => 'float', 'unit' => '0–1'],
                    'auto_health.yellow_overdue_ratio' => ['label' => '% task overdue → YELLOW', 'type' => 'float', 'unit' => '0–1'],
                    'auto_health.red_blocker_count' => ['label' => 'Open blocker count → RED', 'type' => 'int', 'unit' => 'jumlah'],
                    'auto_health.yellow_blocker_count' => ['label' => 'Open blocker count → YELLOW', 'type' => 'int', 'unit' => 'jumlah'],
                    'auto_health.red_kpi_deviation' => ['label' => '% KPI deviation → RED', 'type' => 'int', 'unit' => '%'],
                    'auto_health.yellow_kpi_deviation' => ['label' => '% KPI deviation → YELLOW', 'type' => 'int', 'unit' => '%'],
                    'auto_health.discrepancy_level_threshold' => ['label' => 'Discrepancy level threshold', 'type' => 'int', 'unit' => 'level'],
                ],
            ],
            [
                'category' => 'commitment_ledger',
                'title' => 'Commitment Ledger',
                'helper' => 'Setting untuk halaman "Komitmen Saya".',
                'fields' => [
                    'commitment_ledger.lookback_weeks' => ['label' => 'Lookback periode', 'type' => 'int', 'unit' => 'minggu'],
                    'commitment_ledger.streak_min_hit_rate_pct' => ['label' => 'Min hit rate untuk streak', 'type' => 'int', 'unit' => '%'],
                    'commitment_ledger.low_consistency_alert_pct' => ['label' => 'Alert atasan kalau hit rate ≤', 'type' => 'int', 'unit' => '%'],
                    'commitment_ledger.low_consistency_alert_weeks' => ['label' => 'Selama berapa minggu', 'type' => 'int', 'unit' => 'minggu'],
                ],
            ],
            [
                'category' => 'pilot_dkm_success_criteria',
                'title' => 'Pilot DKM Success Criteria',
                'helper' => 'Target metric untuk evaluasi pilot Sprint 4 di direktorat DKM.',
                'fields' => [
                    'pilot_dkm_success_criteria.avg_time_to_disposition_days' => ['label' => 'Avg waktu disposition', 'type' => 'int', 'unit' => 'hari'],
                    'pilot_dkm_success_criteria.min_hit_rate_aggregate_pct' => ['label' => 'Min hit rate aggregate', 'type' => 'int', 'unit' => '%'],
                    'pilot_dkm_success_criteria.min_user_satisfaction_score' => ['label' => 'Min user satisfaction', 'type' => 'int', 'unit' => '1–10'],
                    'pilot_dkm_success_criteria.min_active_users_pct' => ['label' => 'Min active users', 'type' => 'int', 'unit' => '%'],
                    'pilot_dkm_success_criteria.evaluation_period_weeks' => ['label' => 'Periode evaluasi', 'type' => 'int', 'unit' => 'minggu'],
                ],
            ],
            [
                'category' => 'monthly_report',
                'title' => 'Monthly Report',
                'helper' => 'Anti-ABS signal untuk reviewer.',
                'fields' => [
                    'monthly_report.suspicious_clean_min_kendala' => ['label' => 'Min kendala untuk dianggap normal', 'type' => 'int', 'unit' => 'jumlah'],
                    'monthly_report.suspicious_lookback_periods' => ['label' => 'Lookback historis', 'type' => 'int', 'unit' => 'bulan'],
                ],
            ],
            [
                'category' => 'inbox_today',
                'title' => 'Inbox Today',
                'helper' => 'Cache TTL untuk endpoint /inbox/today.',
                'fields' => [
                    'inbox_today.cache_ttl_seconds' => ['label' => 'Cache TTL', 'type' => 'int', 'unit' => 'detik'],
                ],
            ],
        ];
    }
}
