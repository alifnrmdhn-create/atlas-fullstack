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

    /**
     * True jika scope ini mencakup unit tertentu. Executive (DIRUT/ADMIN/
     * SUPERADMIN) selalu true. Primitive otorisasi unit-level yang dipakai
     * bersama (TaskController, PhaseController, BlockerController) supaya jalur
     * BACA, CREATE, dan MODIFY task konsisten dengan satu definisi scope.
     */
    public function coversUnit(?int $unitId): bool
    {
        if ($this->isExecutive) {
            return true;
        }

        return $unitId !== null && in_array($unitId, $this->unitIds, true);
    }

    public static function forUser(User $user): self
    {
        $role = strtoupper($user->roleType ?? '');

        // ADMIN / SUPERADMIN — cross-cutting roles, always portfolio-wide.
        if (in_array($role, ['ADMIN', 'SUPERADMIN'], true)) {
            return new self(
                isExecutive: true,
                unitIds: [],
                name: null,
                level: 'portfolio',
                role: $role,
            );
        }

        // BOD — distinguish Direktur Utama (portfolio-wide oversight) from
        // other Direktur (functional heads scoped to their own direktorat).
        // All Direktur are BOD members but only DIRUT has cross-direktorat
        // accountability; others are responsible for one direktorat only.
        if ($role === 'BOD' && $user->directorateId) {
            $directorate = Directorate::find($user->directorateId);
            $isDirektorUtama = $directorate && strtoupper($directorate->code) === 'DIRUT';

            if ($isDirektorUtama) {
                return new self(
                    isExecutive: true,
                    unitIds: [],
                    name: $directorate?->name,
                    level: 'portfolio',
                    role: $role,
                );
            }

            // Direktur fungsional (Keuangan, Produksi, SDM, dll) — scope to
            // all units under their direktorat, sama dengan KADIV behavior.
            $unitIds = OrganizationalUnit::query()
                ->where('directorateId', $user->directorateId)
                ->pluck('id')
                ->all();
            return new self(
                isExecutive: false,
                unitIds: $unitIds,
                name: $directorate?->name,
                level: 'directorate',
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
