import { useWorkspace } from '../context/workspace'

/**
 * Role-access hook — single source of truth for what the current user is
 * allowed to do in the Programs and Execution modules.
 *
 * Role rules:
 *   BOD       → pure monitoring: read-only everywhere, can comment only
 *   KADIV     → full write access within their division scope
 *   KASUBDIV  → full write within their subdivision scope
 *   ASISTEN   → primary program initiator, full write for their own programs
 *   OFFICER   → support/admin only: cannot create/delete programs, board is read-only
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
    /** Can initiate a new program */
    canCreateProgram: isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV', 'KASUBDIV', 'ASISTEN'),

    /** Can create an workstream within a program */
    canCreateWorkstream: isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV', 'KASUBDIV', 'ASISTEN'),

    /** Can edit a program they own; KADIV can edit any in their division */
    canEditProgram: (isOwner: boolean) =>
      isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV') ||
      (isAnyOf('KASUBDIV', 'ASISTEN') && isOwner),

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
    /** Can drag cards on the Execution board (BOD = monitoring only) */
    canDragCards: !is('BOD'),

    /**
     * Can drag cards that belong to other users.
     * OFFICER can only move their own cards; others can move their team's cards.
     */
    canDragOthersCards: isAnyOf('SUPERADMIN', 'ADMIN', 'KADIV', 'KASUBDIV', 'ASISTEN'),

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
