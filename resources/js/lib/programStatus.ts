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
  program: { status?: string | null; approvalStatus?: string | null },
): ProgramDisplayStatus {
  const a = program.approvalStatus ?? ''
  const s = program.status ?? ''

  if (a === 'DRAFT' || a === 'PLANNING') return { label: 'Perencanaan',      tone: 'planning',  slug: 'backlog' }
  if (a === 'PENDING_KASUB')             return { label: 'Menunggu KASUBDIV', tone: 'pending',   slug: 'in-review' }
  if (a === 'PENDING_KADIV')             return { label: 'Menunggu KADIV',    tone: 'pending',   slug: 'in-review' }
  if (a === 'REJECTED')                  return { label: 'Perlu revisi',      tone: 'rejected',  slug: 'blocked' }

  // ACTIVE (Eksekusi) or COMPLETED phase — fall back to operational status
  if (s === 'COMPLETED')                 return { label: 'Selesai',           tone: 'done',      slug: 'completed' }
  if (s === 'CANCELLED')                 return { label: 'Dibatalkan',        tone: 'cancelled', slug: 'blocked' }
  if (s === 'ON_HOLD')                   return { label: 'Ditahan',           tone: 'hold',      slug: 'in-review' }
  return { label: 'Berjalan',            tone: 'running',                      slug: 'in-progress' }
}
