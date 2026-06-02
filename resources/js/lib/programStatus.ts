/**
 * Single source of truth for "what status label should we show the user
 * for a program?" It reconciles program.approvalStatus (lifecycle phase)
 * with program.status (operational) into one coherent label.
 *
 * Rule: during Perencanaan the lifecycle phase wins (shows "Perencanaan",
 * "Menunggu KASUB", etc.). Only once ACTIVE does the operational status
 * (In Progress / On Hold) become the user-facing label.
 */

export type ProgramDisplayTone = 'planning' | 'pending' | 'running' | 'hold' | 'done' | 'cancelled' | 'rejected'

export type ProgramDisplayStatus = {
  label: string
  tone: ProgramDisplayTone
  /** CSS class suffix matching existing wid-status-tag variants */
  slug: string
}

export function getProgramDisplayStatus(
  program: { status?: string | null; approvalStatus?: string | null; rejectionNote?: string | null },
): ProgramDisplayStatus {
  const a = program.approvalStatus ?? ''
  const s = program.status ?? ''
  // Rejected programs revert to approvalStatus='DRAFT' with rejectionNote set.
  // The literal 'REJECTED' value never persists, so detection MUST use the
  // (DRAFT + rejectionNote) compound — historic check on === 'REJECTED' was
  // dead code that made rejected programs look like fresh drafts.
  const isRejected = a === 'DRAFT' && !!program.rejectionNote

  if (isRejected)                        return { label: 'Needs revision',    tone: 'rejected',  slug: 'blocked' }
  if (a === 'DRAFT' || a === 'PLANNING') return { label: 'Planning',          tone: 'planning',  slug: 'backlog' }
  if (a === 'PENDING_KASUB')             return { label: 'Awaiting KASUBDIV', tone: 'pending',   slug: 'in-review' }
  if (a === 'PENDING_KADIV')             return { label: 'Awaiting KADIV',    tone: 'pending',   slug: 'in-review' }

  // ACTIVE (Eksekusi) or COMPLETED phase — fall back to operational status
  if (s === 'COMPLETED')                 return { label: 'Completed',         tone: 'done',      slug: 'completed' }
  if (s === 'CANCELLED')                 return { label: 'Cancelled',         tone: 'cancelled', slug: 'blocked' }
  if (s === 'ON_HOLD')                   return { label: 'On Hold',           tone: 'hold',      slug: 'in-review' }
  return { label: 'Active',              tone: 'running',                      slug: 'in-progress' }
}

// ── Program Health Display ────────────────────────────────────────────────────
// Maps the computed healthStatus (GREEN/YELLOW/RED) to vocabulary that aligns
// with the monitoring document terminology used by Direktorat KMR.
// Storage stays GREEN/YELLOW/RED; only the display label changes.

export type ProgramHealthTone = 'on-track' | 'at-risk' | 'terlambat' | 'overdue' | 'selesai'

export type ProgramHealthDisplay = {
  label: string
  tone: ProgramHealthTone
  /** CSS class suffix for health-pill */
  slug: string
  isOverdue: boolean
}

export function getProgramHealthDisplay(program: {
  healthStatus?: string | null
  status?: string | null
  targetEndDate?: string | null
}): ProgramHealthDisplay {
  const isCompleted = program.status === 'COMPLETED'
  if (isCompleted) {
    return { label: 'Completed', tone: 'selesai', slug: 'completed', isOverdue: false }
  }

  const isOverdue =
    !!program.targetEndDate && new Date(program.targetEndDate) < new Date() && !isCompleted

  if (isOverdue) {
    return { label: 'Overdue', tone: 'overdue', slug: 'overdue', isOverdue: true }
  }

  const h = program.healthStatus?.toUpperCase()
  if (h === 'GREEN')  return { label: 'On Track',   tone: 'on-track',  slug: 'green',  isOverdue: false }
  if (h === 'RED')    return { label: 'Delayed',    tone: 'terlambat', slug: 'red',    isOverdue: false }
  return               { label: 'At Risk',    tone: 'at-risk',   slug: 'yellow', isOverdue: false }
}
