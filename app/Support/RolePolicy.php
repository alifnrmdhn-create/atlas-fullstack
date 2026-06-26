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
        // Penyusunan "plan" (program + struktur Workstream/Phase/Task) adalah hak
        // manajerial: hanya KADIV (Kepala Divisi) & KASUBDIV (Kepala Sub Divisi)
        // — plus admin/superadmin — yang boleh meng-author plan (keputusan PIC
        // 2026-06-26). ASISTEN/OFFICER tetap pelaksana (update progres/subtask via
        // jalur eksekusi), bukan penyusun. BOD tetap read-only.
        return in_array(self::norm($role), ['superadmin', 'admin', 'kadiv', 'kasubdiv'], true);
    }

    /**
     * Edit izin untuk program.
     *
     * `$isInRevision` = program baru ditolak & sedang menunggu PIC memperbaiki
     * (approvalStatus === 'DRAFT' && rejectionNote !== null). Selama state ini
     * hanya owner & admin yang boleh edit — KADIV/KASUBDIV reviewer "step back"
     * agar tidak mem-bypass koreksi yang baru saja mereka minta sendiri. (Owner
     * kini selalu KADIV/KASUBDIV per invariant assertCanAssignOwner.)
     *
     * Edit "plan" = hak KADIV/KASUBDIV (+admin) saja (2026-06-26). ASISTEN/OFFICER
     * tidak lagi mengedit plan. CATATAN: lepasnya syarat owner untuk KASUBDIV harus
     * dipasangkan dengan scope-check di gate `edit-program` (AuthServiceProvider) —
     * tanpa itu KASUBDIV bisa PUT program lintas-unit via API.
     */
    public static function canEditProgram(?string $role, bool $isOwner, bool $isInRevision = false): bool
    {
        $r = self::norm($role);
        if (self::isAdminOrAbove($r)) return true;
        if ($isInRevision) return $isOwner;
        return $r === 'kadiv' || $r === 'kasubdiv';
    }

    public static function canDeleteProgram(?string $role, bool $isOwner): bool
    {
        // Cabang ASISTEN dihapus 2026-06-26: ASISTEN tak bisa lagi jadi owner program
        // (invariant assertCanAssignOwner), sehingga klausa lama jadi dead code.
        $r = self::norm($role);
        if (self::isAdminOrAbove($r)) return true;
        if ($r === 'kadiv' && $isOwner) return true;
        return false;
    }

    public static function canArchiveProgram(?string $role, bool $isOwner): bool
    {
        // Cabang ASISTEN dihapus 2026-06-26 (owner kini selalu kadiv/kasubdiv).
        $r = self::norm($role);
        if (self::isAdminOrAbove($r) || $r === 'kadiv') return true;
        if ($r === 'kasubdiv' && $isOwner) return true;
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
