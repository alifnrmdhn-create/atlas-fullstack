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
        // Semua role boleh inisiasi program kecuali BOD (Direksi monitoring).
        // OFFICER ikut dimasukkan agar PIC operasional di luar struktur ASISTEN/
        // KASUBDIV tidak terblok saat input program di lapangan.
        return self::norm($role) !== 'bod';
    }

    /**
     * Edit izin untuk program.
     *
     * `$isInRevision` = program baru ditolak & sedang menunggu PIC memperbaiki
     * (approvalStatus === 'DRAFT' && rejectionNote !== null). Selama state ini
     * hanya owner & admin yang boleh edit — KADIV/KASUBDIV reviewer "step back"
     * agar tidak mem-bypass koreksi yang baru saja mereka minta sendiri.
     */
    public static function canEditProgram(?string $role, bool $isOwner, bool $isInRevision = false): bool
    {
        $r = self::norm($role);
        if (self::isAdminOrAbove($r)) return true;
        if ($isInRevision) return $isOwner;
        if ($r === 'kadiv') return true;
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
     * BOD satu-satunya role read-only (Direksi monitoring).
     *
     * Semua role lain — ADMIN, SUPERADMIN, KADIV, KASUBDIV, ASISTEN, OFFICER —
     * write-enabled. OFFICER sebelumnya read-only tapi PIC operasional di
     * lapangan butuh akses inisiasi/update operasional, jadi dimasukkan ke
     * write-enabled (per keputusan 2026-05-19).
     */
    public static function isReadOnly(?string $role): bool
    {
        return self::norm($role) === 'bod';
    }
}
