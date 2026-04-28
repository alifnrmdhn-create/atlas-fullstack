<?php

namespace App\Auth;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;

/**
 * Resolve scope organisasi (unit-level) berdasarkan role user.
 *
 *   BOD / ADMIN / SUPERADMIN → portfolio-wide (executive: tidak difilter)
 *   KADIV                    → semua unit di direktorat user
 *   KASUBDIV                 → unit user sendiri
 *   default                  → unit user (untuk awareness)
 *
 * Berbeda dari ScopeResolver (yang berbasis ownerId/membership).
 * OrgScope dipakai untuk filter `ownerUnitId` di program-level dashboards
 * eksekutif (Home, Dashboard, Meeting suggestions).
 */
class OrgScope
{
    public function __construct(
        public readonly bool $isExecutive,
        /** @var array<int> Unit IDs in scope (kosong jika executive). */
        public readonly array $unitIds,
        public readonly ?string $name,
        public readonly string $level,
        public readonly string $role,
    ) {}

    public static function forUser(User $user): self
    {
        $role = strtoupper($user->roleType ?? '');
        $isExecutive = in_array($role, ['BOD', 'ADMIN', 'SUPERADMIN'], true);

        if ($isExecutive) {
            return new self(
                isExecutive: true,
                unitIds: [],
                name: null,
                level: 'portfolio',
                role: $role,
            );
        }

        if ($role === 'KASUBDIV' && $user->unitId) {
            $unit = OrganizationalUnit::find($user->unitId);
            return new self(
                isExecutive: false,
                unitIds: [(int) $user->unitId],
                name: $unit?->name,
                level: 'unit',
                role: $role,
            );
        }

        if ($user->directorateId) {
            $unitIds = OrganizationalUnit::query()
                ->where('directorateId', $user->directorateId)
                ->pluck('id')
                ->all();
            return new self(
                isExecutive: false,
                unitIds: $unitIds,
                name: Directorate::find($user->directorateId)?->name,
                level: 'directorate',
                role: $role,
            );
        }

        // Fallback: user without directorate — own unit only (or empty).
        return new self(
            isExecutive: false,
            unitIds: $user->unitId ? [(int) $user->unitId] : [],
            name: $user->unitId ? OrganizationalUnit::find($user->unitId)?->name : null,
            level: 'unit',
            role: $role,
        );
    }
}
