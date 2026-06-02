<?php

namespace App\Http\Controllers;

use App\Models\Directorate;
use App\Models\EscalationRequest;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Post-MVP — Pilot Metrics Dashboard (admin-only).
 *
 * Surface metrik Sprint 4 pilot DKM untuk evaluasi mid-pilot dan decision gate.
 * Compare aktual vs target dari config/atlas-thresholds.pilot_dkm_success_criteria.
 *
 * Visibility: hanya admin/superadmin/BOD.
 *
 * Metrik:
 *   1. avg_time_to_disposition_days — rata-rata hari REQUESTED → COMMITTED/DECLINED
 *   2. hit_rate_aggregate_pct        — % action items selesai vs total commitments DKM
 *   3. active_users_pct              — % DKM users yang pernah create/disposition
 *   4. total_escalations             — count untuk konteks volume
 */
class PilotMetricsController extends Controller
{
    private function ensureAdmin(Request $request): void
    {
        $role = strtoupper($request->user()->roleType ?? '');
        if (!in_array($role, ['BOD', 'ADMIN', 'SUPERADMIN'], true)) {
            abort(403, 'This page is only for admin/BOD.');
        }
    }

    public function index(Request $request): Response
    {
        $this->ensureAdmin($request);
        $metrics = $this->computeMetrics();
        $criteria = setting('pilot_dkm_success_criteria', config('atlas-thresholds.pilot_dkm_success_criteria', []));

        return Inertia::render('AdminPilotMetricsView', compact('metrics', 'criteria'));
    }

    public function api(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);
        return response()->json([
            'data' => $this->computeMetrics(),
            'criteria' => setting('pilot_dkm_success_criteria', config('atlas-thresholds.pilot_dkm_success_criteria', [])),
        ]);
    }

    private function computeMetrics(): array
    {
        // Resolve DKM users
        $dkmDirektorat = Directorate::where('code', 'DKM')->first();
        if (!$dkmDirektorat) {
            return $this->emptyMetrics('The DKM directorate was not found.');
        }

        $dkmUserIds = User::where('directorateId', $dkmDirektorat->id)
            ->where('isActive', true)
            ->pluck('id');

        if ($dkmUserIds->isEmpty()) {
            return $this->emptyMetrics('No active users in the DKM directorate.');
        }

        // 1. Avg time-to-disposition (committed/declined items only).
        // Bug-fix: bungkus committedAt/resolvedAt OR di nested where supaya
        // tidak pecahin AND chain.
        $disposed = EscalationRequest::query()
            ->whereIn('requestedById', $dkmUserIds)
            ->whereIn('status', ['COMMITTED', 'IN_PROGRESS', 'CLEARED', 'DECLINED'])
            ->where(function ($q) {
                $q->whereNotNull('committedAt')->orWhereNotNull('resolvedAt');
            })
            ->get(['requestedAt', 'committedAt', 'resolvedAt', 'status']);

        $dispositionDays = $disposed
            ->map(function ($r) {
                $end = $r->committedAt ?? $r->resolvedAt;
                return $end ? $r->requestedAt->diffInDays($end) : null;
            })
            ->filter()
            ->values();

        $avgDispositionDays = $dispositionDays->isNotEmpty()
            ? round($dispositionDays->avg(), 1)
            : null;

        // 2. Hit rate aggregate (semua escalation DKM, % yang CLEARED)
        $totalEscalations = EscalationRequest::whereIn('requestedById', $dkmUserIds)->count();
        $clearedCount = EscalationRequest::whereIn('requestedById', $dkmUserIds)
            ->where('status', 'CLEARED')
            ->count();
        $hitRate = $totalEscalations > 0
            ? round($clearedCount / $totalEscalations * 100, 1)
            : null;

        // 3. Active users (DKM users yang pernah create OR disposition)
        $activeRequesters = EscalationRequest::whereIn('requestedById', $dkmUserIds)
            ->distinct('requestedById')->pluck('requestedById');
        $activeDispositioners = EscalationRequest::whereIn('escalatedToId', $dkmUserIds)
            ->whereIn('status', ['COMMITTED', 'IN_PROGRESS', 'CLEARED', 'DECLINED'])
            ->distinct('escalatedToId')->pluck('escalatedToId');
        $activeUserIds = $activeRequesters->merge($activeDispositioners)->unique();
        $activeUsersPct = $dkmUserIds->isNotEmpty()
            ? round($activeUserIds->count() / $dkmUserIds->count() * 100, 1)
            : null;

        // 4. Status breakdown untuk visualisasi
        $statusBreakdown = EscalationRequest::whereIn('requestedById', $dkmUserIds)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status')
            ->toArray();

        return [
            'directorate' => ['code' => 'DKM', 'name' => $dkmDirektorat->name],
            'totalUsers' => $dkmUserIds->count(),
            'totalEscalations' => $totalEscalations,
            'avgDispositionDays' => $avgDispositionDays,
            'hitRatePct' => $hitRate,
            'activeUsersPct' => $activeUsersPct,
            'statusBreakdown' => $statusBreakdown,
            'computedAt' => now()->toIso8601String(),
        ];
    }

    private function emptyMetrics(string $note): array
    {
        return [
            'directorate' => null,
            'totalUsers' => 0,
            'totalEscalations' => 0,
            'avgDispositionDays' => null,
            'hitRatePct' => null,
            'activeUsersPct' => null,
            'statusBreakdown' => [],
            'computedAt' => now()->toIso8601String(),
            'note' => $note,
        ];
    }
}
