<?php

namespace App\Services;

use App\Models\Directorate;
use App\Models\User;

/**
 * Sprint 4 — Feature flag gating dengan dukungan scope per direktorat.
 *
 * Nilai flag bisa:
 *   'enabled'     → semua user
 *   'disabled'    → no one
 *   'DKM' / 'DBS' → hanya user di direktorat dengan kode tsb (pilot)
 *
 * Cara dipakai:
 *   FeatureFlagService::isEnabled('clear-the-path', $user)   → bool
 *   FeatureFlagService::resolveAllForUser($user)              → array<flag,bool>
 *
 * Frontend dapat array via Inertia shared props (lihat HandleInertiaRequests).
 */
class FeatureFlagService
{
    public static function isEnabled(string $flag, ?User $user = null): bool
    {
        $value = config("features.{$flag}");
        if (!$value || $value === 'disabled') return false;
        if ($value === 'enabled') return true;

        // Direktorat scope (e.g. 'DKM')
        if (!$user) return false;
        $directoratKode = self::getUserDirektoratKode($user);
        return $directoratKode === strtoupper($value);
    }

    public static function resolveAllForUser(?User $user): array
    {
        $flags = config('features', []);
        $resolved = [];
        foreach ($flags as $key => $_value) {
            $resolved[$key] = self::isEnabled($key, $user);
        }
        return $resolved;
    }

    private static function getUserDirektoratKode(User $user): ?string
    {
        if (!$user->directorateId) return null;
        $dir = Directorate::find($user->directorateId);
        return $dir?->code ? strtoupper($dir->code) : null;
    }
}
