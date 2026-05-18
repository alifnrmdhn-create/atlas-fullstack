<?php

namespace App\Support;

/**
 * Port dari backend/src/lib/permissions.ts.
 * Pure functions untuk pengecekan role → bisa dipanggil langsung atau lewat
 * Gate (lihat AuthServiceProvider).
 */
class RolePolicy
{
    public static function norm(?string $role): string
    {
        return strtolower($role ?? '');
    }

    public static function isAdminOrAbove(?string $role): bool
    {
        $r = self::norm($role);
        return $r === 'superadmin' || $r === 'admin';
    }

    public static function isSuperadmin(?string $role): bool
    {
        return self::norm($role) === 'superadmin';
    }

    public static function canManageUsers(?string $role): bool
    {
        return self::isAdminOrAbove($role);
    }

    public static function canManageParameters(?string $role): bool
    {
        return self::isAdminOrAbove($role);
    }

    public static function canViewAllEntities(?string $role): bool
    {
        return in_array(self::norm($role), ['superadmin', 'admin', 'bod'], true);
    }

    public static function canCreateProgram(?string $role): bool
    {
        $r = self::norm($role);
        // ASISTEN = primary initiator; KASUBDIV & KADIV juga boleh
        return self::isAdminOrAbove($r) || in_array($r, ['kadiv', 'kasubdiv', 'asisten'], true);
    }

    public static function canEditProgram(?string $role, bool $isOwner): bool
    {
        $r = self::norm($role);
        if (self::isAdminOrAbove($r) || $r === 'kadiv') return true;
        if (($r === 'kasubdiv' || $r === 'asisten') && $isOwner) return true;
        return false;
    }

    public static function canDeleteProgram(?string $role, bool $isOwner): bool
    {
        $r = self::norm($role);
        if (self::isAdminOrAbove($r)) return true;
        if (($r === 'kadiv' || $r === 'asisten') && $isOwner) return true;
        return false;
    }

    public static function canArchiveProgram(?string $role, bool $isOwner): bool
    {
        $r = self::norm($role);
        if (self::isAdminOrAbove($r) || $r === 'kadiv') return true;
        if (($r === 'kasubdiv' || $r === 'asisten') && $isOwner) return true;
        return false;
    }

    public static function canViewArchive(?string $role): bool
    {
        $r = self::norm($role);
        return self::isAdminOrAbove($r) || $r === 'kadiv';
    }

    /**
     * BOD & OFFICER read-only — BOD monitoring, OFFICER support.
     *
     * Catatan eksplisit role yang BUKAN read-only (write-enabled):
     *   - ADMIN, SUPERADMIN: full access
     *   - KADIV: approval + cross-divisi
     *   - KASUBDIV: penanggung jawab divisi
     *   - ASISTEN: PIC operasional, primary initiator program kerja
     *     (lihat ATLAS_PDCA_IMPLEMENTATION_PLAN section "Sprint 0" — ASISTEN
     *     mendaftarkan program & task harian). Sengaja TIDAK termasuk read-only.
     */
    public static function isReadOnly(?string $role): bool
    {
        $r = self::norm($role);
        return $r === 'bod' || $r === 'officer';
    }
}
