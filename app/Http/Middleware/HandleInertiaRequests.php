<?php

namespace App\Http\Middleware;

use App\Enums\PilarStrategis;
use App\Models\Directorate;
use App\Models\User;
use App\Services\FeatureFlagService;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $user ? [
                    'id' => $user->id,
                    'email' => $user->email,
                    'name' => $user->name,
                    'roleType' => $user->roleType,
                    'positionTitle' => $user->positionTitle,
                    'avatarUrl' => $user->avatarUrl,
                    'unitId' => $user->unitId,
                    'unit' => $user->unit?->only(['id', 'code', 'name']),
                    'directorateId' => $user->directorateId,
                    'managerUserId' => $user->managerUserId,
                    'toursCompleted' => $user->toursCompleted ?? [],
                    // Sidebar gate for the Performance module (role-scoped 2026-05-29).
                    'canAccessPerformance' => EnsurePerformanceAccess::allows($user),
                ] : null,
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],
            // Sprint 4 — feature flags resolved per user (DKM scoping etc.)
            'features' => FeatureFlagService::resolveAllForUser($user),
            // Pilar strategis yang berlaku untuk direktorat user (value => label).
            // Kosong = direktorat tidak memakai pilar → FE menyembunyikan dropdown
            // "Pilar Strategis" di form Program. Lihat config pillar_directorates.
            'strategicPillars' => $this->resolveStrategicPillars($user),
            // Sprint 6 — threshold values yang dibaca FE (autosave debounce, dll).
            // Hindari hardcoded angka di TS — semua tunable lewat .env.
            'thresholds' => [
                'autosave' => [
                    'debounceMs'   => (int) config('atlas-thresholds.autosave.debounce_ms', 1500),
                    'ttlDays'      => (int) config('atlas-thresholds.autosave.ttl_days', 7),
                    'maxPayloadKb' => (int) config('atlas-thresholds.autosave.max_payload_kb', 256),
                ],
                // Audit 2026-06-11 (temuan A5): dulu dead config — bisa diedit
                // admin via /admin/thresholds tapi nol konsumen, warna aging
                // hardcoded di AgingIndicator. WAJIB setting() (bukan config())
                // supaya override admin di SystemSetting benar-benar efektif.
                'escalationAging' => [
                    'yellow' => (int) setting('escalation_aging.yellow_after_days'),
                    'orange' => (int) setting('escalation_aging.orange_after_days'),
                    'red'    => (int) setting('escalation_aging.red_after_days'),
                ],
            ],
        ];
    }

    /**
     * Resolve opsi pilar strategis untuk direktorat user. Basis = direktorat
     * user (sejalan dengan pola DKM-scoping FeatureFlagService); program baru
     * default dimiliki unit user, jadi direktorat user = direktorat program.
     * Kosong jika user tak punya direktorat atau direktoratnya tidak memakai
     * pilar (lihat config('atlas-thresholds.pillar_directorates')).
     *
     * @return array<string, string>
     */
    private function resolveStrategicPillars(?User $user): array
    {
        if (! $user || ! $user->directorateId) {
            return [];
        }

        $code = Directorate::find($user->directorateId)?->code;

        return PilarStrategis::optionsForDirectorate($code);
    }
}
