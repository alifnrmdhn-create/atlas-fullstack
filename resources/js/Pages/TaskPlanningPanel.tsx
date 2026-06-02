import { useState, useEffect, useRef } from 'react'
import { useEscKey } from '../hooks/useEscKey'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { api, extractErrorMessage } from '../lib/api'
import { useRoleAccess } from '../hooks/useRoleAccess'
import type { TaskDetail } from '../types'

// ── Week helpers ──────────────────────────────────────────────────────────────
function isoWeekToDate(isoWeek: string): Date {
  const [yearStr, weekStr] = isoWeek.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)
  const jan4 = new Date(year, 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7)
  return monday
}
function dateToIsoWeek(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
function weeksInRange(startWeek: string, endWeek: string): string[] {
  const result: string[] = []
  const cur = new Date(isoWeekToDate(startWeek))
  const end = isoWeekToDate(endWeek)
  let guard = 0
  while (cur <= end && guard < 200) {
    result.push(dateToIsoWeek(cur))
    cur.setDate(cur.getDate() + 7)
    guard++
  }
  return result
}
// Always use Monday of ISO week as reference — matches Execution Grid column headers
function formatWeekLabel(isoWeek: string): string {
  try {
    const monday     = isoWeekToDate(isoWeek)
    const weekOfMonth = Math.ceil(monday.getDate() / 7)
    const month = monday.toLocaleDateString('id-ID', { month: 'short' })
    const year  = String(monday.getFullYear()).slice(-2)
    return `W${weekOfMonth} ${month} ${year}`
  } catch { return isoWeek }
}
// Compact summary: "W4 Apr → W1 Mei 26" or "W1–W2 Mei 26" if same month
function summariseWeeks(weeks: string[]): string {
  if (weeks.length === 0) return ''
  const first  = formatWeekLabel(weeks[0])
  const last   = formatWeekLabel(weeks[weeks.length - 1])
  if (weeks.length === 1 || first === last) return first
  const mFirst = isoWeekToDate(weeks[0]).toLocaleDateString('id-ID', { month: 'short' })
  const mLast  = isoWeekToDate(weeks[weeks.length - 1]).toLocaleDateString('id-ID', { month: 'short' })
  const yLast  = String(isoWeekToDate(weeks[weeks.length - 1]).getFullYear()).slice(-2)
  if (mFirst === mLast) {
    const w1 = Math.ceil(isoWeekToDate(weeks[0]).getDate() / 7)
    const w2 = Math.ceil(isoWeekToDate(weeks[weeks.length - 1]).getDate() / 7)
    return `W${w1}–W${w2} ${mLast} ${yLast}`
  }
  return `${first} → ${last}`
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
}

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog', READY: 'Ready', IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'Review', BLOCKED: 'Blocked', COMPLETED: 'Completed',
}

type StatusLogEntry = {
  id:         number
  fromStatus: string | null
  toStatus:   string
  byUserId:   number
  byUserName: string | null
  note:       string | null
  createdAt:  string
}

function formatLogTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

type DirectoryUser = { id: number; name: string; positionTitle: string | null }
type Draft         = { title: string; description: string; startDate: string; targetCompletion: string }

type Props = {
  taskId:     number
  closing?:   boolean
  onClose:    () => void
  onRefresh?: () => void
  mode?:      'overlay' | 'push'
}

export function TaskPlanningPanel({ taskId, closing, onClose, onRefresh, mode = 'overlay' }: Props) {
  const navigate   = useInertiaNavigate()
  const roleAccess = useRoleAccess()

  // ── Remote data ───────────────────────────────────────────────────────────
  const [detail,  setDetail]  = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusLog, setStatusLog] = useState<StatusLogEntry[]>([])

  const loadDetail = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [detailRes, logRes] = await Promise.all([
        api.get<{ data: TaskDetail }>(`/tasks/${taskId}`),
        api.get<{ data: StatusLogEntry[] }>(`/tasks/${taskId}/status-log`),
      ])
      setDetail(detailRes.data)
      setStatusLog(logRes.data ?? [])
    } catch { /* non-fatal */ }
    finally { if (!silent) setLoading(false) }
  }
  useEffect(() => { void loadDetail() }, [taskId])

  // ── Directory — load on mount so assignee search works immediately ──────
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([])
  useEffect(() => {
    api.get<{ data: DirectoryUser[] }>('/users/directory')
      .then(r => setDirectoryUsers(r.data ?? []))
      .catch((err) => console.error('[Atlas] Silent failure in TaskPlanningPanel.tsx:', err))
  }, [])

  // ── Draft state ───────────────────────────────────────────────────────────
  const [draft,  setDraft]  = useState<Draft>({ title: '', description: '', startDate: '', targetCompletion: '' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const draftInitialized = useRef(false)
  useEffect(() => {
    draftInitialized.current = false
  }, [taskId])
  useEffect(() => {
    if (detail && !draftInitialized.current) {
      draftInitialized.current = true
      setDraft({
        title:            detail.title,
        description:      detail.description ?? '',
        startDate:        detail.startDate?.slice(0, 10) ?? '',
        targetCompletion: detail.targetCompletion?.slice(0, 10) ?? '',
      })
    }
  }, [detail])

  const isDirty = detail
    ? draft.title !== detail.title
      || draft.description !== (detail.description ?? '')
      || draft.startDate !== (detail.startDate?.slice(0, 10) ?? '')
      || draft.targetCompletion !== (detail.targetCompletion?.slice(0, 10) ?? '')
    : false

  // Live plan preview from draft dates
  const previewWeeks: string[] =
    draft.startDate && draft.targetCompletion && draft.startDate <= draft.targetCompletion
      ? weeksInRange(dateToIsoWeek(new Date(draft.startDate)), dateToIsoWeek(new Date(draft.targetCompletion)))
      : (detail?.plannedWeeks ?? [])

  // ── Delete ────────────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  const deleteTask = async () => {
    if (!detail || deleting) return
    setDeleting(true); setDeleteErr(null)
    try {
      await api.delete(`/tasks/${taskId}`)
      onRefresh?.()
      onClose()
    } catch (err) {
      setDeleteErr(extractErrorMessage(err, 'Failed to delete task.'))
      setDeleting(false)
    }
  }

  const save = async () => {
    if (!detail || saving) return
    setSaving(true); setSaveErr(null)
    try {
      const patch: Record<string, unknown> = {}
      if (draft.title.trim() !== detail.title)
        patch.title = draft.title.trim()
      if (draft.description.trim() !== (detail.description ?? '').trim())
        patch.description = draft.description.trim() || null
      const startChanged = draft.startDate !== (detail.startDate?.slice(0, 10) ?? '')
      const endChanged   = draft.targetCompletion !== (detail.targetCompletion?.slice(0, 10) ?? '')
      if (startChanged)
        patch.startDate = draft.startDate ? new Date(draft.startDate).toISOString() : null
      if (endChanged)
        patch.targetCompletion = draft.targetCompletion ? new Date(draft.targetCompletion).toISOString() : null
      // Do NOT send plannedWeeks — backend derives it from (startDate, targetCompletion).
      if (Object.keys(patch).length > 0)
        await api.patch(`/tasks/${taskId}`, patch)
      draftInitialized.current = false
      await loadDetail(true); onRefresh?.()
      setSaved(true); setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setSaveErr(extractErrorMessage(err, 'Failed to save.'))
    } finally { setSaving(false) }
  }

  // ── Title edit ────────────────────────────────────────────────────────────
  const [titleEditing, setTitleEditing] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)

  // ── Description edit ──────────────────────────────────────────────────────
  const [descEditing, setDescEditing] = useState(false)
  const descRef = useRef<HTMLTextAreaElement | null>(null)

  // ── Date edit ─────────────────────────────────────────────────────────────
  const [startEditing,   setStartEditing]   = useState(false)
  const [tenggatEditing, setTenggatEditing] = useState(false)

  // ── Person (picPersonIds[0]) — same field shown in task row ─────────────
  const [personSearch, setPersonSearch] = useState('')
  const [personSaving, setPersonSaving] = useState(false)

  const savePerson = async (userId: number | null) => {
    setPersonSaving(true)
    try {
      await api.patch(`/tasks/${taskId}`, { picPersonIds: userId ? [userId] : [] })
      await loadDetail(true); onRefresh?.()
    } catch { /* non-fatal */ } finally { setPersonSaving(false) }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  // safeClose: block saat saving, dan confirm jika ada draft yang belum di-save.
  // Dipakai bareng Escape, backdrop click, dan tombol Tutup di header.
  const safeClose = () => {
    if (saving) return
    if (isDirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }
  useEscKey(() => {
    if (titleEditing)   { setTitleEditing(false);   return }
    if (descEditing)    { setDescEditing(false);     return }
    if (startEditing)   { setStartEditing(false);    return }
    if (tenggatEditing) { setTenggatEditing(false);  return }
    safeClose()
  }, true)

  const planSummary = summariseWeeks(previewWeeks)

  return (
    <>
      {mode === 'overlay' && (
        <div aria-hidden="true"
          className={`tpp-backdrop${closing ? ' tpp-backdrop--closing' : ''}`}
          onClick={safeClose}
        />
      )}

      <div
        aria-label="Task Detail — Planning"
        className={`tpp-panel${mode === 'overlay' && closing ? ' tpp-panel--closing' : ''}`}
        role="dialog"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="panel-header">
          <div>
            <p className="panel-header__title" style={{ margin: 0 }}>Task Planning</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {detail && detail.workstream?.program?.approvalStatus === 'ACTIVE' && (
              <button className="tpp-exec-link" onClick={() => navigate(`/execution/tasks/${taskId}`)} type="button">
                Execution
                <svg fill="none" height="9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="9"><path d="m6 3 5 5-5 5"/></svg>
              </button>
            )}
            <button className="panel-close-btn tpp-close-btn" onClick={safeClose} title="Close (Esc)" type="button">
              <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 14 14" width="11"><path d="M1 1l12 12M13 1L1 13"/></svg>
            </button>
          </div>
        </div>

        {/* ── Skeleton ─────────────────────────────────────────────────── */}
        {loading && (
          <div className="tpp-loading">
            <div className="tpp-sk-line tpp-sk-line--code" />
            <div className="tpp-sk-line tpp-sk-line--title" />
            <div className="tpp-sk-line tpp-sk-line--med" />
            <div className="tpp-sk-line" style={{ width: '70%' }} />
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────────────── */}
        {!loading && detail && (
          <>
            <div className="tpp-body">

              {/* Code + Priority — MEDIUM default disembunyikan, tampil hanya
                  saat non-default (HIGH/CRITICAL/LOW = signal deliberate) supaya
                  panel tidak ribut dengan info yang sebenarnya default state. */}
              <div className="tpp-chips">
                <span className="tpp-code-chip">{detail.code}</span>
                {detail.priority && detail.priority.toUpperCase() !== 'MEDIUM' && (
                  <span className="tpp-priority-chip" data-priority={detail.priority.toLowerCase()}>
                    <span className="tpp-priority-chip__dot" />
                    {PRIORITY_LABELS[detail.priority.toUpperCase()] ?? detail.priority}
                  </span>
                )}
              </div>

              {/* Title */}
              {titleEditing ? (
                <input
                  className="tpp-title-input"
                  maxLength={200}
                  onBlur={() => setTitleEditing(false)}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); setTitleEditing(false) }
                    if (e.key === 'Escape') { setDraft(d => ({ ...d, title: detail.title })); setTitleEditing(false) }
                  }}
                  ref={titleRef}
                  value={draft.title}
                />
              ) : (
                <h2
                  className={`tpp-title${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
                  onClick={() => { if (!roleAccess.isMonitoringOnly) { setTitleEditing(true); setTimeout(() => titleRef.current?.focus(), 10) } }}
                  title={roleAccess.isMonitoringOnly ? undefined : 'Click to edit'}
                >
                  {draft.title || detail.title}
                  {isDirty && draft.title !== detail.title && <span className="tpp-dirty-dot" />}
                </h2>
              )}

              {/* ── Jadwal ───────────────────────────────────────────────── */}
              <div className="tpp-section">
                <p className="tpp-section-label">Schedule</p>
                <div className="tpp-date-row">
                  {/* Mulai */}
                  <div className="tpp-date-field">
                    <span className="tpp-date-field__label">Start</span>
                    {startEditing && !roleAccess.isMonitoringOnly ? (
                      <input
                        autoFocus
                        className="tpp-date-input"
                        onBlur={() => setStartEditing(false)}
                        onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setStartEditing(false) }}
                        type="date"
                        value={draft.startDate}
                      />
                    ) : (
                      <button
                        className={`tpp-date-btn${!draft.startDate ? ' tpp-date-btn--empty' : ''}${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
                        disabled={roleAccess.isMonitoringOnly}
                        onClick={() => !roleAccess.isMonitoringOnly && setStartEditing(true)}
                        type="button"
                      >
                        {draft.startDate
                          ? new Date(draft.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '+ Set start date'}
                        {isDirty && draft.startDate !== (detail.startDate?.slice(0, 10) ?? '') && <span className="tpp-dirty-dot" />}
                      </button>
                    )}
                  </div>

                  <span className="tpp-date-arrow">→</span>

                  {/* Selesai */}
                  <div className="tpp-date-field">
                    <span className="tpp-date-field__label">End</span>
                    {tenggatEditing && !roleAccess.isMonitoringOnly ? (
                      <input
                        autoFocus
                        className="tpp-date-input"
                        min={draft.startDate || undefined}
                        onBlur={() => setTenggatEditing(false)}
                        onChange={e => setDraft(d => ({ ...d, targetCompletion: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setTenggatEditing(false) }}
                        type="date"
                        value={draft.targetCompletion}
                      />
                    ) : (
                      <button
                        className={`tpp-date-btn${!draft.targetCompletion ? ' tpp-date-btn--empty' : ''}${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
                        disabled={roleAccess.isMonitoringOnly}
                        onClick={() => !roleAccess.isMonitoringOnly && setTenggatEditing(true)}
                        type="button"
                      >
                        {draft.targetCompletion
                          ? new Date(draft.targetCompletion).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '+ Set target end'}
                        {isDirty && draft.targetCompletion !== (detail.targetCompletion?.slice(0, 10) ?? '') && <span className="tpp-dirty-dot" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Plan summary — single line, not individual chips */}
                {planSummary && (
                  <div className="tpp-plan-row">
                    <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="10"><rect height="10" rx="1.5" width="10" x="2" y="2"/><path d="M2 5.5h10M5 2v3.5M9 2v3.5"/></svg>
                    <span className="tpp-plan-row__label">{planSummary}</span>
                    <span className="tpp-plan-row__hint">· Weekly Schedule</span>
                  </div>
                )}
              </div>

              {/* ── Penanggung Jawab — sync dengan task row (picPersonIds[0]) ── */}
              <div className="tpp-section">
                <p className="tpp-section-label">Person in Charge</p>
                <div className="wid-team-row__chips" style={{ paddingTop: 2 }}>
                  {(() => {
                    const currentId = (detail.picPersonIds ?? [])[0] ?? null
                    const person    = currentId ? directoryUsers.find(u => u.id === currentId) : null
                    const label     = person?.name ?? (currentId ? `#${currentId}` : null)
                    return label ? (
                      <span className="wid-pic-chip">
                        {label}
                        {!roleAccess.isMonitoringOnly && (
                          <button aria-label={`Remove ${label}`} className="wid-pic-chip__remove"
                            disabled={personSaving} onClick={() => savePerson(null)} type="button">×</button>
                        )}
                      </span>
                    ) : roleAccess.isMonitoringOnly ? (
                      <span className="tpp-empty-val">Not assigned</span>
                    ) : null
                  })()}
                  {!roleAccess.isMonitoringOnly && (
                    <div className="wid-pic-adder">
                      <input
                        className="wid-pic-search"
                        disabled={personSaving}
                        onChange={e => setPersonSearch(e.target.value)}
                        placeholder={(detail.picPersonIds ?? []).length > 0 ? 'Change…' : '+ Assign…'}
                        value={personSearch}
                      />
                      {personSearch.length > 0 && (() => {
                        const currentId = (detail.picPersonIds ?? [])[0]
                        const filtered  = directoryUsers
                          .filter(u => u.id !== currentId && u.name.toLowerCase().includes(personSearch.toLowerCase()))
                          .slice(0, 6)
                        return filtered.length > 0 ? (
                          <div className="wid-pic-dropdown">
                            {filtered.map(u => (
                              <button className="wid-pic-dropdown__item" key={u.id}
                                onMouseDown={() => { void savePerson(u.id); setPersonSearch('') }} type="button">
                                <span className="wid-pic-dropdown__name">{u.name}</span>
                                {u.positionTitle && <span className="wid-pic-dropdown__role">{u.positionTitle}</span>}
                              </button>
                            ))}
                          </div>
                        ) : null
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Deskripsi ─────────────────────────────────────────────── */}
              <div className="tpp-section">
                <p className="tpp-section-label">Description</p>
                {descEditing ? (
                  <div className="tpp-desc-edit">
                    <textarea
                      className="tpp-desc-textarea"
                      maxLength={2000}
                      onBlur={() => setDescEditing(false)}
                      onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Escape') setDescEditing(false) }}
                      placeholder="Context, references, or completion criteria…"
                      ref={descRef}
                      rows={3}
                      value={draft.description}
                    />
                    <p className="tpp-desc-hint">Click <strong>Save</strong> below to save</p>
                  </div>
                ) : draft.description ? (
                  <p
                    className={`tpp-desc${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
                    onClick={() => { if (!roleAccess.isMonitoringOnly) { setDescEditing(true); setTimeout(() => descRef.current?.focus(), 10) } }}
                  >
                    {draft.description}
                    {isDirty && draft.description !== (detail.description ?? '') && <span className="tpp-dirty-dot" />}
                  </p>
                ) : !roleAccess.isMonitoringOnly ? (
                  <button className="tpp-add-placeholder"
                    onClick={() => { setDescEditing(true); setTimeout(() => descRef.current?.focus(), 10) }}
                    type="button">
                    + Add description
                  </button>
                ) : (
                  <span className="tpp-empty-val">—</span>
                )}
              </div>

              {/* ── Riwayat Status ────────────────────────────────────────── */}
              {statusLog.length > 0 && (
                <div className="tpp-section">
                  <p className="tpp-section-label">Status History</p>
                  <ul className="tpp-status-log">
                    {statusLog.map((log) => {
                      const fromLabel = log.fromStatus
                        ? (STATUS_LABELS[log.fromStatus] ?? log.fromStatus)
                        : null
                      const toLabel = STATUS_LABELS[log.toStatus] ?? log.toStatus
                      return (
                        <li key={log.id} className="tpp-status-log__item">
                          <div className="tpp-status-log__line">
                            <span className="tpp-status-log__transition">
                              {fromLabel && <><span className="tpp-status-log__from">{fromLabel}</span>{' → '}</>}
                              <strong>{toLabel}</strong>
                            </span>
                            <span className="tpp-status-log__meta">
                              {log.byUserName ?? 'System'} · {formatLogTimestamp(log.createdAt)}
                            </span>
                          </div>
                          {log.note && <p className="tpp-status-log__note">{log.note}</p>}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

            </div>

            {/* ── Footer ────────────────────────────────────────────────── */}
            {!roleAccess.isMonitoringOnly && (
              <div className="tpp-footer">
                {confirmDelete ? (
                  <>
                    <span className="tpp-footer__delete-prompt">
                      {deleteErr ? deleteErr : 'Delete this task?'}
                    </span>
                    <button
                      className="tpp-footer__delete-cancel"
                      disabled={deleting}
                      onClick={() => { setConfirmDelete(false); setDeleteErr(null) }}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="tpp-footer__delete-confirm"
                      disabled={deleting}
                      onClick={() => void deleteTask()}
                      type="button"
                    >
                      {deleting ? '…' : 'Delete'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      aria-label="Delete task"
                      className="tpp-footer__delete-btn"
                      disabled={saving}
                      onClick={() => setConfirmDelete(true)}
                      title="Delete task"
                      type="button"
                    >
                      <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12"><path d="M2 3.5h10M5.5 3.5V2.5c0-.3.2-.5.5-.5h2c.3 0 .5.2.5.5v1M3.5 3.5l.5 8c0 .3.2.5.5.5h5c.3 0 .5-.2.5-.5l.5-8"/></svg>
                    </button>
                    {saved ? (
                      <span className="tpp-footer__saved">
                        <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 14 14" width="11"><path d="m2 7 4 4 6-7"/></svg>
                        Saved
                      </span>
                    ) : saveErr ? (
                      <span className="tpp-footer__err">{saveErr}</span>
                    ) : (
                      <span className="tpp-footer__hint">{isDirty ? 'Unsaved changes' : ''}</span>
                    )}
                    <button
                      className={`tpp-footer__save${isDirty ? ' tpp-footer__save--active' : ''}`}
                      disabled={!isDirty || saving}
                      onClick={() => void save()}
                      type="button"
                    >
                      {saving ? '…' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
