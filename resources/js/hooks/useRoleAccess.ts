import { useWorkspace } from './useWorkspace'

/**
 * Role-access hook — single source of truth for what the current user is
 * allowed to do in the Programs and Execution modules.
 *
 * Role rules (plan-authoring diperketat 2026-06-26 — lihat RolePolicy.php):
 *   BOD       → pure monitoring: read-only everywhere, can comment only
 *   KADIV     → meng-author plan + full write dalam division scope
 *   KASUBDIV  → meng-author plan + full write dalam subdivision scope
 *   ASISTEN   → pelaksana: TIDAK meng-author plan; update progres/subtask task
 *               yang di-assign ke dirinya (jalur eksekusi)
 *   OFFICER   → pelaksana operasional: sama dgn ASISTEN, scoped self di board
 *   ADMIN/SUPERADMIN → unrestricted (operator)
 */
export function useRoleAccess() {
  const { currentUser } = useWorkspace()
  const role = currentUser?.roleType ?? ''

  const is = (r: string) => role === r
  const isAnyOf = (...roles: string[]) => roles.includes(role)

  return {
    role,

    // ── Program module ────────────────────────────────────────────────────
    /** Can initiate a new program — hanya Kadiv/Kasub (+admin), 2026-06-26 */
    canCreateProgram: isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV', 'KASUBDIV'),

    /** Can create a workstream within a program — sejajar dengan canCreateProgram */
    canCreateWorkstream: isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV', 'KASUBDIV'),

    /**
     * Can edit a program's plan — hanya KADIV/KASUBDIV (+admin), 2026-06-26.
     * (Scope unit/direktorat di-enforce di BE: gate `edit-program`.)
     * `isInRevision` = program baru ditolak & menunggu PIC memperbaiki —
     * selama state ini hanya owner & admin yang boleh edit (reviewer step back
     * agar tidak mem-bypass koreksi yang baru diminta sendiri).
     */
    canEditProgram: (isOwner: boolean, isInRevision: boolean = false) => {
      if (isAnyOf('SUPERADMIN', 'ADMIN')) return true
      if (isInRevision) return isOwner
      return isAnyOf('KADIV', 'KASUBDIV')
    },

    /**
     * Can assign/change a task's PIC (executor) — hanya KADIV/KASUBDIV (+admin),
     * cermin `assertCanAssignPic` di TaskController. Menunjuk penanggung jawab =
     * keputusan plan-author; pelaksana (ASISTEN/OFFICER) tak boleh mengoper PIC.
     */
    canAssignPic: isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV', 'KASUBDIV'),

    /** Can delete a program they own */
    canDeleteProgram: (isOwner: boolean) =>
      isAnyOf('SUPERADMIN', 'ADMIN') ||
      (isAnyOf('KADIV') && isOwner),

    /** Can archive a program (soft-delete) */
    canArchiveProgram: (isOwner: boolean) =>
      isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV') ||
      (isAnyOf('KASUBDIV') && isOwner),

    /** Can view archived programs and restore them */
    canViewArchive: isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV'),

    /** Can approve as KASUBDIV (PENDING_KASUB stage) */
    canApproveAsKasub: isAnyOf('KASUBDIV', 'SUPERADMIN', 'ADMIN'),

    /** Can approve as KADIV (PENDING_KADIV stage) */
    canApproveAsKadiv: isAnyOf('KADIV', 'SUPERADMIN', 'ADMIN'),

    // ── Execution board ───────────────────────────────────────────────────
    /** myItemsOnly filter is forced on and cannot be toggled */
    myItemsLocked: is('OFFICER'),

    /**
     * Default value for myItemsOnly when first opening the board.
     * Managers (KADIV, KASUBDIV) default to team view; individual contributors default to self.
     */
    defaultMyItemsOnly: isAnyOf('ASISTEN', 'OFFICER') || !isAnyOf('KADIV', 'KASUBDIV', 'SUPERADMIN', 'ADMIN', 'BOD'),

    // ── General ───────────────────────────────────────────────────────────
    /**
     * BOD is in "monitoring mode": all write actions are hidden/disabled,
     * and a "Monitoring" badge is shown in toolbars.
     */
    isMonitoringOnly: is('BOD'),

    isOfficer: is('OFFICER'),
    isBOD: is('BOD'),

    /**
     * Admin/superadmin — cermin `RolePolicy::canManageUsers` di backend
     * (isAdminOrAbove). Dipakai untuk gating fitur "pengelola user", mis.
     * leaderboard activity (data surveilans jam-aktif semua user).
     */
    isAdmin: isAnyOf('SUPERADMIN', 'ADMIN'),
  }
}
