import { useWorkspace } from './useWorkspace'

/**
 * Role-access hook — single source of truth for what the current user is
 * allowed to do in the Programs and Execution modules.
 *
 * Role rules:
 *   BOD       → pure monitoring: read-only everywhere, can comment only
 *   KADIV     → full write access within their division scope
 *   KASUBDIV  → full write within their subdivision scope
 *   ASISTEN   → primary program initiator, full write for their own programs
 *   OFFICER   → PIC operasional: write-enabled untuk create/update, masih
 *               scoped self-only di Execution board (myItemsLocked)
 *   ADMIN/SUPERADMIN → unrestricted
 */
export function useRoleAccess() {
  const { currentUser } = useWorkspace()
  const role = currentUser?.roleType ?? ''

  const is = (r: string) => role === r
  const isAnyOf = (...roles: string[]) => roles.includes(role)

  return {
    role,

    // ── Program module ────────────────────────────────────────────────────
    /** Can initiate a new program — semua role kecuali BOD */
    canCreateProgram: role !== '' && !is('BOD'),

    /** Can create a workstream within a program — sejajar dengan canCreateProgram */
    canCreateWorkstream: role !== '' && !is('BOD'),

    /**
     * Can edit a program they own; KADIV can edit any in their division.
     * `isInRevision` = program baru ditolak & menunggu PIC memperbaiki —
     * selama state ini hanya owner & admin yang boleh edit (KADIV reviewer
     * step back agar tidak mem-bypass koreksi yang baru diminta sendiri).
     */
    canEditProgram: (isOwner: boolean, isInRevision: boolean = false) => {
      if (isAnyOf('SUPERADMIN', 'ADMIN')) return true
      if (isInRevision) return isOwner
      return isAnyOf('KADIV') || (isAnyOf('KASUBDIV', 'ASISTEN') && isOwner)
    },

    /** Can delete a program they own */
    canDeleteProgram: (isOwner: boolean) =>
      isAnyOf('SUPERADMIN', 'ADMIN') ||
      (isAnyOf('KADIV', 'ASISTEN') && isOwner),

    /** Can archive a program (soft-delete) */
    canArchiveProgram: (isOwner: boolean) =>
      isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV') ||
      (isAnyOf('KASUBDIV', 'ASISTEN') && isOwner),

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
  }
}
