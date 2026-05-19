<?php

namespace App\Http\Middleware;

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
                ] : null,
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],
            // Sprint 4 — feature flags resolved per user (DKM scoping etc.)
            'features' => FeatureFlagService::resolveAllForUser($user),
            // Sprint 6 — threshold values yang dibaca FE (autosave debounce, dll).
            // Hindari hardcoded angka di TS — semua tunable lewat .env.
            'thresholds' => [
                'autosave' => [
                    'debounceMs'   => (int) config('atlas-thresholds.autosave.debounce_ms', 1500),
                    'ttlDays'      => (int) config('atlas-thresholds.autosave.ttl_days', 7),
                    'maxPayloadKb' => (int) config('atlas-thresholds.autosave.max_payload_kb', 256),
                ],
            ],
        ];
    }
}
