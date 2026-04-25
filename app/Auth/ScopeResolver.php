<?php

namespace App\Auth;

use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Port dari backend/src/lib/scope.ts → resolveUserScope().
 *
 * Aturan:
 *   SUPERADMIN / ADMIN → semua (null = tidak ada filter)
 *   BOD                → semua user di direktoratnya
 *   KADIV / KASUBDIV   → user di unit + anak-unit (BFS sampai 4 level)
 *   ASISTEN            → diri sendiri + direct reports (managerUserId)
 *   OFFICER            → semua user di unit yang sama
 *   default/fallback   → self-scope (diri sendiri saja)
 *
 * Caching: 30 detik TTL via Laravel Cache.
 */
class ScopeResolver
{
    private const TTL_SECONDS = 30;
    private const MAX_BFS_DEPTH = 4;

    public function resolveUserScope(User $user): UserScope
    {
        $cacheKey = "scope:user:{$user->id}";

        $cached = Cache::get($cacheKey);
        if ($cached instanceof UserScope) {
            return $cached;
        }
        if (is_array($cached) && array_key_exists('userIds', $cached) && array_key_exists('unitIds', $cached)) {
            return new UserScope(
                userIds: $cached['userIds'],
                unitIds: $cached['unitIds'],
            );
        }

        if ($cached !== null) {
            Cache::forget($cacheKey);
        }

        $scope = $this->computeScope($user);
        Cache::put($cacheKey, [
            'userIds' => $scope->userIds,
            'unitIds' => $scope->unitIds,
        ], self::TTL_SECONDS);

        return $scope;
    }

    public function invalidate(int $userId): void
    {
        Cache::forget("scope:user:{$userId}");
    }

    private function computeScope(User $user): UserScope
    {
        $role = strtoupper($user->roleType ?? '');

        if ($role === 'SUPERADMIN' || $role === 'ADMIN') {
            return new UserScope(userIds: null, unitIds: null);
        }

        if ($role === 'BOD') {
            if (!$user->directorateId) {
                return $this->selfScope($user);
            }
            $users = User::query()
                ->where('directorateId', $user->directorateId)
                ->where('isActive', true)
                ->get(['id', 'unitId']);

            $unitIds = $users->pluck('unitId')->filter()->unique()->values()->all();
            return new UserScope(
                userIds: $users->pluck('id')->all(),
                unitIds: $unitIds,
            );
        }

        if ($role === 'KADIV' || $role === 'KASUBDIV') {
            if (!$user->unitId) {
                return $this->selfScope($user);
            }
            $unitIds = $this->getUnitSubtree((int) $user->unitId);
            $userIds = User::query()
                ->whereIn('unitId', $unitIds)
                ->where('isActive', true)
                ->pluck('id')
                ->all();
            return new UserScope(userIds: $userIds, unitIds: $unitIds);
        }

        if ($role === 'ASISTEN') {
            $reportIds = User::query()
                ->where('managerUserId', $user->id)
                ->where('isActive', true)
                ->pluck('id')
                ->all();
            return new UserScope(
                userIds: array_merge([$user->id], $reportIds),
                unitIds: $user->unitId ? [(int) $user->unitId] : [],
            );
        }

        if ($role === 'OFFICER') {
            if (!$user->unitId) {
                return $this->selfScope($user);
            }
            $userIds = User::query()
                ->where('unitId', $user->unitId)
                ->where('isActive', true)
                ->pluck('id')
                ->all();
            return new UserScope(userIds: $userIds, unitIds: [(int) $user->unitId]);
        }

        return $this->selfScope($user);
    }

    private function selfScope(User $user): UserScope
    {
        return new UserScope(
            userIds: [$user->id],
            unitIds: $user->unitId ? [(int) $user->unitId] : [],
        );
    }

    /**
     * BFS iteratif — root unit + semua anak unit sampai 4 level.
     * @return array<int>
     */
    private function getUnitSubtree(int $rootUnitId): array
    {
        $visited = [$rootUnitId => true];
        $frontier = [$rootUnitId];

        for ($depth = 0; $depth < self::MAX_BFS_DEPTH && count($frontier) > 0; $depth++) {
            $children = OrganizationalUnit::query()
                ->whereIn('parentId', $frontier)
                ->pluck('id')
                ->all();

            $newFrontier = [];
            foreach ($children as $childId) {
                if (!isset($visited[$childId])) {
                    $visited[$childId] = true;
                    $newFrontier[] = $childId;
                }
            }
            $frontier = $newFrontier;
        }

        return array_keys($visited);
    }
}
