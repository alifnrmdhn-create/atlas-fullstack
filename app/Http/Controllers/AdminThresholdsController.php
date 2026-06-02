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
            abort(403, 'Only a superadmin can change system thresholds.');
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
            return response()->json(['message' => 'Unknown key: ' . $data['key']], 422);
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
                'helper' => 'How many days of waiting before the visual indicator changes color. Not a disposition deadline — only an aging signal.',
                'fields' => [
                    'escalation_aging.yellow_after_days' => ['label' => 'Turns yellow after', 'type' => 'int', 'unit' => 'days'],
                    'escalation_aging.orange_after_days' => ['label' => 'Turns orange after', 'type' => 'int', 'unit' => 'days'],
                    'escalation_aging.red_after_days' => ['label' => 'Turns red after', 'type' => 'int', 'unit' => 'days'],
                ],
            ],
            [
                'category' => 'carryover',
                'title' => 'Action Item Carryover',
                'helper' => 'How many times a meeting action item may "carry over" before the system nudges or auto-escalates.',
                'fields' => [
                    'carryover.nudge_threshold' => ['label' => 'Soft nudge (prompt: what is stuck?)', 'type' => 'int', 'unit' => 'times'],
                    'carryover.auto_clearpath_threshold' => ['label' => 'Auto-suggest Clear the Path', 'type' => 'int', 'unit' => 'times'],
                    'carryover.force_disposition_threshold' => ['label' => 'Force supervisor disposition', 'type' => 'int', 'unit' => 'times'],
                ],
            ],
            [
                'category' => 'progress_log',
                'title' => 'Progress Log Freshness',
                'helper' => 'Cadence for program progress reporting.',
                'fields' => [
                    'progress_log.stale_after_days' => ['label' => 'Stale after', 'type' => 'int', 'unit' => 'days'],
                ],
            ],
            [
                'category' => 'auto_health',
                'title' => 'Auto-Health Derivation',
                'helper' => 'Thresholds for deriving program health (RED/YELLOW) from actual signals.',
                'fields' => [
                    'auto_health.red_overdue_ratio' => ['label' => '% tasks overdue → RED', 'type' => 'float', 'unit' => '0–1'],
                    'auto_health.yellow_overdue_ratio' => ['label' => '% tasks overdue → YELLOW', 'type' => 'float', 'unit' => '0–1'],
                    'auto_health.red_blocker_count' => ['label' => 'Open blocker count → RED', 'type' => 'int', 'unit' => 'count'],
                    'auto_health.yellow_blocker_count' => ['label' => 'Open blocker count → YELLOW', 'type' => 'int', 'unit' => 'count'],
                    'auto_health.red_kpi_deviation' => ['label' => '% KPI deviation → RED', 'type' => 'int', 'unit' => '%'],
                    'auto_health.yellow_kpi_deviation' => ['label' => '% KPI deviation → YELLOW', 'type' => 'int', 'unit' => '%'],
                    'auto_health.discrepancy_level_threshold' => ['label' => 'Discrepancy level threshold', 'type' => 'int', 'unit' => 'levels'],
                ],
            ],
            [
                'category' => 'commitment_ledger',
                'title' => 'Commitment Ledger',
                'helper' => 'Settings for the "My Commitments" page.',
                'fields' => [
                    'commitment_ledger.lookback_weeks' => ['label' => 'Lookback period', 'type' => 'int', 'unit' => 'weeks'],
                    'commitment_ledger.streak_min_hit_rate_pct' => ['label' => 'Min hit rate for a streak', 'type' => 'int', 'unit' => '%'],
                    'commitment_ledger.low_consistency_alert_pct' => ['label' => 'Alert supervisor if hit rate ≤', 'type' => 'int', 'unit' => '%'],
                    'commitment_ledger.low_consistency_alert_weeks' => ['label' => 'For how many weeks', 'type' => 'int', 'unit' => 'weeks'],
                ],
            ],
            [
                'category' => 'pilot_dkm_success_criteria',
                'title' => 'Pilot DKM Success Criteria',
                'helper' => 'Target metrics for evaluating the Sprint 4 pilot in the DKM directorate.',
                'fields' => [
                    'pilot_dkm_success_criteria.avg_time_to_disposition_days' => ['label' => 'Avg time to disposition', 'type' => 'int', 'unit' => 'days'],
                    'pilot_dkm_success_criteria.min_hit_rate_aggregate_pct' => ['label' => 'Min hit rate aggregate', 'type' => 'int', 'unit' => '%'],
                    'pilot_dkm_success_criteria.min_user_satisfaction_score' => ['label' => 'Min user satisfaction', 'type' => 'int', 'unit' => '1–10'],
                    'pilot_dkm_success_criteria.min_active_users_pct' => ['label' => 'Min active users', 'type' => 'int', 'unit' => '%'],
                    'pilot_dkm_success_criteria.evaluation_period_weeks' => ['label' => 'Evaluation period', 'type' => 'int', 'unit' => 'weeks'],
                ],
            ],
            [
                'category' => 'monthly_report',
                'title' => 'Monthly Report',
                'helper' => 'Anti-ABS signal for reviewers.',
                'fields' => [
                    'monthly_report.suspicious_clean_min_kendala' => ['label' => 'Min blockers to be considered normal', 'type' => 'int', 'unit' => 'count'],
                    'monthly_report.suspicious_lookback_periods' => ['label' => 'Historical lookback', 'type' => 'int', 'unit' => 'months'],
                ],
            ],
            [
                'category' => 'inbox_today',
                'title' => 'Inbox Today',
                'helper' => 'Cache TTL untuk endpoint /inbox/today.',
                'fields' => [
                    'inbox_today.cache_ttl_seconds' => ['label' => 'Cache TTL', 'type' => 'int', 'unit' => 'seconds'],
                ],
            ],
        ];
    }
}
