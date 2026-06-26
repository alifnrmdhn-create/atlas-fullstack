import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import { useWorkspace } from '../hooks/useWorkspace'
import { api, extractErrorMessage } from '../lib/api'
import { useEscKey } from '../hooks/useEscKey'
import { useAnimatedClose } from '../hooks/useAnimatedClose'
import { Avatar } from '../components/ui'
import { UserPicker } from '../components/UserPicker'
import { TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import { PageHeader, Button } from '../design-system'
import { Plus } from 'lucide-react'
import './AssignmentsView.css'

// ── Types ──────────────────────────────────────────────────────────────────
type Role = 'BOD' | 'KADIV' | 'KASUBDIV' | 'ASISTEN' | 'OFFICER' | 'ADMIN' | 'SUPERADMIN'
type Status = 'DITUGASKAN' | 'DIKERJAKAN' | 'IN_REVIEW' | 'SELESAI' | 'REJECTED' | 'DIBATALKAN'
type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
type ScopePreset = 'mine' | 'given' | 'team' | 'all' | 'review'
type Action = 'ACKNOWLEDGE' | 'CLARIFY' | 'SUBMIT' | 'APPROVE' | 'RETURN' | 'REJECT' | 'CANCEL' | 'REOPEN'

type PersonRef = { id: number; name: string; positionTitle: string | null; roleType?: string; avatarUrl?: string | null }
type ProgramRef = { id: number; code: string; name: string }

type ChainEntry = {
  userId: number
  role: string
  name: string
  positionTitle: string | null
  avatarUrl?: string | null
  order: number
  status: 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED'
  actedAt?: string | null
  note?: string | null
}

type Assignment = {
  id: number; code: string; title: string; description: string | null
  priority: Priority; status: Status; dueDate: string | null
  assignerId: number; assigneeId: number
  relatedProgramId: number | null
  needsClarification: boolean; clarificationNote: string | null
  acknowledgedAt: string | null; startedAt: string | null
  completedAt: string | null; cancelledAt: string | null; cancelReason: string | null
  // V1 additions
  evidenceRequired: boolean
  isPrivate: boolean
  approvalChain: ChainEntry[] | null
  currentReviewerIdx: number | null
  revisionCount: number
  rejectedAt: string | null
  rejectionReason: string | null
  createdAt: string; updatedAt: string
  assigner: PersonRef; assignee: PersonRef
  relatedProgram: ProgramRef | null
  _count?: { evidenceItems: number }
}

type EvidenceType = 'FILE' | 'LINK' | 'NOTE'
type Evidence = {
  id: number
  assignmentId: number
  uploadedBy: number
  type: EvidenceType
  filename: string | null
  originalName: string | null
  filepath: string | null
  filesize: number | null
  url: string | null
  description: string | null
  createdAt: string
  uploader: { id: number; name: string; positionTitle: string | null }
}

type DirectoryUser = {
  id: number
  name: string
  positionTitle: string | null
  roleType?: string
  unit?: { code?: string | null; name?: string | null } | null
  directorate?: { code?: string | null; name?: string | null } | null
}

const ASSIGNER_ROLES = new Set<Role>(['BOD', 'KADIV', 'KASUBDIV', 'ADMIN', 'SUPERADMIN'])

// Status → slug untuk kanban-col__header--{slug} yang sudah di-CSS di workboard.css
const STATUS_TO_SLUG: Record<Status, string> = {
  DITUGASKAN: 'backlog',
  DIKERJAKAN: 'in_progress',
  IN_REVIEW: 'in_review',
  SELESAI: 'completed',
  REJECTED: 'blocked',
  DIBATALKAN: 'blocked',
}

// Label kolom mengikuti vocabulary workflow Task (Workboard) supaya istilah seragam
// lintas modul. Penugasan tidak punya tahap "Belum Direncanakan" (atasan sudah
// menjabarkan tugas saat memberikan), jadi mulai dari "Siap Dikerjakan".
const STATUS_COLUMNS = (): Array<{ status: Status; label: string; hint: string }> => [
  { status: 'DITUGASKAN', label: i18n.t('Ready'),       hint: i18n.t('Assignment received, awaiting PIC to start') },
  { status: 'DIKERJAKAN', label: i18n.t('In Progress'), hint: i18n.t('Being worked on') },
  { status: 'IN_REVIEW',  label: i18n.t('In Review'),   hint: i18n.t('Awaiting reviewer approval') },
  { status: 'SELESAI',    label: i18n.t('Completed'),   hint: i18n.t('Done') },
]

const STATUS_LABEL = (s: Status): string => ({
  DITUGASKAN: i18n.t('Ready'), DIKERJAKAN: i18n.t('In Progress'), IN_REVIEW: i18n.t('In Review'),
  SELESAI: i18n.t('Completed'), REJECTED: i18n.t('Rejected'), DIBATALKAN: i18n.t('Cancelled'),
}[s])
const PRIORITY_LABEL = (p: Priority): string => ({ CRITICAL: i18n.t('Critical'), HIGH: i18n.t('High'), MEDIUM: i18n.t('Medium'), LOW: i18n.t('Low') }[p])
const PRIORITY_ORDER: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

function formatDueDate(iso: string | null): { label: string; tone: 'overdue' | 'soon' | 'normal' | 'none' } {
  if (!iso) return { label: i18n.t('No deadline'), tone: 'none' }
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  const locale = new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  if (diff < 0) return { label: i18n.t('{{count}}d overdue', { count: Math.abs(diff) }), tone: 'overdue' }
  if (diff === 0) return { label: i18n.t('Today'), tone: 'soon' }
  if (diff === 1) return { label: i18n.t('Tomorrow'), tone: 'soon' }
  if (diff <= 3) return { label: i18n.t('{{count}}d left', { count: diff }), tone: 'soon' }
  return { label: locale, tone: 'normal' }
}

/** Progress bar time-based: elapsed / total waktu hidup task. */
function dueProgress(createdAt: string, dueDate: string | null, status: Status): { pct: number; tone: 'on-track' | 'at-risk' | 'off-track' } | null {
  if (!dueDate) return null
  if (status === 'SELESAI') return { pct: 100, tone: 'on-track' }
  if (status === 'DIBATALKAN') return null
  const start = new Date(createdAt).getTime()
  const end = new Date(dueDate).getTime()
  const now = Date.now()
  if (end <= start) return { pct: 100, tone: 'off-track' }
  const pct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
  const tone: 'on-track' | 'at-risk' | 'off-track' = pct >= 100 ? 'off-track' : pct >= 75 ? 'at-risk' : 'on-track'
  return { pct, tone }
}

const isActive = (s: Status) => s !== 'SELESAI' && s !== 'DIBATALKAN'
const firstName = (full: string) => full.split(' ')[0]

// ── Main ───────────────────────────────────────────────────────────────────
export function AssignmentsView() {
  const { t } = useTranslation()
  const { currentUser, assignmentRefreshTick } = useWorkspace()
  const role = (currentUser?.roleType?.toUpperCase() ?? '') as Role
  const canAssign = ASSIGNER_ROLES.has(role)

  const [items, setItems] = useState<Assignment[]>([])
  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [scope, setScope] = useState<ScopePreset>('team')
  const [boardMode, setBoardMode] = useState<'board' | 'list'>('board')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [collapsedCols, setCollapsedCols] = useState<Set<Status>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get<{ data: Assignment[] }>(`/assignments?scope=${scope}`)
      .then(({ data }) => { if (!cancelled) { setItems(data); setError(null) } })
      .catch((e) => { if (!cancelled) setError(extractErrorMessage(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [scope, assignmentRefreshTick])

  useEffect(() => {
    api.get<{ data: DirectoryUser[] }>('/users/directory').then(({ data }) => setDirectory(data)).catch((err) => console.error('[Atlas] Silent failure in AssignmentsView.tsx:', err))
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; page: string }>).detail
      if (detail?.id === 'assignment.new' && canAssign) setShowCreate(true)
    }
    window.addEventListener(TOPBAR_ACTION_EVENT, handler)
    return () => window.removeEventListener(TOPBAR_ACTION_EVENT, handler)
  }, [canAssign])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const selected = useMemo(() => items.find((r) => r.id === selectedId) ?? null, [items, selectedId])

  const stats = useMemo(() => {
    const me = currentUser?.id ?? 0
    const now = Date.now()
    let total = 0, active = 0, needResp = 0, overdue = 0, done = 0
    for (const r of items) {
      total++
      if (isActive(r.status)) active++
      if (r.assigneeId === me && r.status === 'DITUGASKAN') needResp++
      if (isActive(r.status) && r.dueDate && new Date(r.dueDate).getTime() < now) overdue++
      if (r.status === 'SELESAI') done++
    }
    return { total, active, needResp, overdue, done }
  }, [items, currentUser])

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      DITUGASKAN: 0,
      DIKERJAKAN: 0,
      IN_REVIEW: 0,
      SELESAI: 0,
      REJECTED: 0,
      DIBATALKAN: 0,
    }
    items.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1 })
    return c
  }, [items])

  const toggleCollapsedCol = (s: Status) => setCollapsedCols((prev) => {
    const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next
  })


  return (
    <div className="ds assignments-v2 view-penugasan">
      <style>{PENUGASAN_CSS}</style>

      {/* `ds-stagger`: Phase 5 motion standardization. Modal subkomponen
          (CreateModal) sudah di-portal-mount ke document.body (Phase 5B). */}
      <div className="assignments-v2__inner ds-stagger">
      {/* ── Page header (design-system PageHeader) ──
          CTA "New Assignment" hidup DI HALAMAN (page owns its CTA), selaras
          ProgramsView/WorkboardView; /penugasan dikeluarkan dari TOPBAR_ACTIONS. */}
      <PageHeader
        title={t('Assignment')}
        subtitle={t('Ad-hoc assignments outside Programs — short requests, no workstream.')}
        actions={canAssign ? (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={15} aria-hidden="true" />}
            onClick={() => setShowCreate(true)}
          >
            {t('New Assignment')}
          </Button>
        ) : undefined}
      />

      {/* ── Controls row: mode + scope toggles + stats ── */}
      <div className="view-toolbar">
        <div className="view-toggle" style={{ marginLeft: 0 }}>
          {(['board', 'list'] as const).map((m) => (
            <button key={m} className={`view-toggle-btn${boardMode === m ? ' active' : ''}`} onClick={() => setBoardMode(m)}>
              {m === 'board' ? `⬜ ${t('Board')}` : `≡ ${t('List')}`}
            </button>
          ))}
        </div>

        <div className="view-toggle" style={{ marginLeft: 8 }}>
          {([
            { key: 'team',  label: t('My Team') },
            { key: 'mine',  label: t('For Me') },
            { key: 'given', label: t('I Assigned') },
            { key: 'all',   label: t('All') },
          ] as const).map((t) => (
            <button key={t.key} className={`view-toggle-btn${scope === t.key ? ' active' : ''}`} onClick={() => setScope(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="view-toolbar__right">
          <div className="view-toolbar__stats wb-stats">
            <span>{stats.total} <em>{t('items')}</em></span>
            <span>{stats.active} <em>{t('active')}</em></span>
            {stats.needResp > 0 && <span className="text-yellow">{stats.needResp} <em>{t('needs response')}</em></span>}
            {stats.overdue > 0 && <span className="text-red">{stats.overdue} <em>{t('overdue')}</em></span>}
            {stats.done > 0 && <span className="text-green">{stats.done} <em>{t('done')}</em></span>}
          </div>
          {/* "+ Penugasan Baru" content button dihapus 2026-05-24 — duplikat
              dengan topbar action "+ Penugasan Baru" (topbar-config.ts) yang
              sudah accessible dari semua halaman. Single CTA per page. */}
        </div>
      </div>

      {/* ── Board workspace ── */}
      <div className="workboard-workspace">
        <div className="workboard-main">
          {error && <div className="board-rollback-banner" role="alert"><span className="board-rollback-banner__icon">⚠</span><span className="board-rollback-banner__msg">{error}</span></div>}

          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 13 }}>{t('Loading…')}</div>
          ) : items.length === 0 ? (
            <EmptyState canAssign={canAssign} onCreate={() => setShowCreate(true)} />
          ) : boardMode === 'board' ? (
            <div className="kanban-board">
              {STATUS_COLUMNS().map((col) => {
                const colItems = items.filter((r) => r.status === col.status)
                colItems.sort((a, b) => {
                  const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
                  const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
                  if (aDue !== bDue) return aDue - bDue
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                })
                const isCollapsed = collapsedCols.has(col.status)
                return (
                  <div key={col.status} className={`kanban-col${isCollapsed ? ' kanban-col--collapsed' : ''}`}>
                    <button
                      type="button"
                      className={`kanban-col__header kanban-col__header--toggle kanban-col__header--${STATUS_TO_SLUG[col.status]}`}
                      onClick={() => toggleCollapsedCol(col.status)}
                      aria-expanded={!isCollapsed}
                    >
                      <div className="kanban-col__label-row">
                        <span className="kanban-col__caret" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                        <span className="kanban-col__label">{col.label}</span>
                      </div>
                      <span className="section-badge">{counts[col.status]}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="kanban-col__body">
                        {colItems.length === 0 ? (
                          <div className="kanban-col__empty kanban-col__empty--dashed">{col.hint}</div>
                        ) : colItems.map((item) => (
                          <AssignmentCard key={item.id} item={item} onClick={() => setSelectedId(item.id)} currentUserId={currentUser?.id ?? 0} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <ListView items={items} onSelect={setSelectedId} />
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="wid-toast wid-toast--warn" role="status" aria-live="polite">
          <span className="wid-toast__icon" aria-hidden="true">
            <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="14"><circle cx="8" cy="8" r="7"/><path d="M8 5v3M8 11h.01"/></svg>
          </span>
          <span>{toast}</span>
        </div>
      )}

      </div>

      <DetailPanel
        assignment={selected}
        isOpen={selectedId !== null}
        currentUserId={currentUser?.id ?? 0}
        isAdmin={['ADMIN', 'SUPERADMIN'].includes(role)}
        onClose={() => setSelectedId(null)}
      />

      <CreateModal
        directory={directory}
        currentUserId={currentUser?.id ?? 0}
        currentRole={role}
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  )
}

export default AssignmentsView

// ── Clickable card (no drag — aksi via panel detail) ──────────────────────
function AssignmentCard({ item, onClick, currentUserId }: { item: Assignment; onClick: () => void; currentUserId: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="work-card-shell work-card-shell--clickable"
    >
      <CardFace item={item} currentUserId={currentUserId} />
    </button>
  )
}

function CardFace({ item, currentUserId, className }: { item: Assignment; currentUserId: number; className?: string }) {
  const { t } = useTranslation()
  const due = formatDueDate(item.dueDate)
  const isMine = item.assigneeId === currentUserId
  const needsAck = item.status === 'DITUGASKAN' && isMine
  const progress = dueProgress(item.createdAt, item.dueDate, item.status)
  const isOverdue = due.tone === 'overdue' && isActive(item.status)
  const chain = item.approvalChain ?? []
  const currentReviewer = item.status === 'IN_REVIEW' && item.currentReviewerIdx !== null
    ? chain[item.currentReviewerIdx] ?? null
    : null
  const iAmCurrentReviewer = currentReviewer !== null && currentReviewer.userId === currentUserId
  return (
    <div className={['work-card', isOverdue ? 'work-card--blocked' : '', className ?? ''].filter(Boolean).join(' ')}>
      <div className="work-card__head">
        <span className={`work-card__dot work-card__dot--${item.priority.toLowerCase()}`} />
        <h4 className="work-card__title">{item.title}</h4>
      </div>
      {/* Label tipe — bedakan dari card Task di Workboard (selalu tampil) */}
      <div className="work-card__type">
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M6 1.2 10.5 3.6v4.8L6 10.8 1.5 8.4V3.6z"/></svg>
        {t('Assignment')}
      </div>
      <div className="work-card__context">
        {item.relatedProgram ? (
          <>
            <span className="work-card__context-prog">{item.relatedProgram.code}</span>
            <span className="work-card__context-sep">›</span>
            <span className="work-card__context-ini">{item.relatedProgram.name}</span>
          </>
        ) : (
          <span className="work-card__context-ini" style={{ fontStyle: 'italic', opacity: 0.7 }}>{t('Ad-hoc · from {{name}}', { name: firstName(item.assigner.name) })}</span>
        )}
      </div>
      {/* Review badge — muncul di kolom IN_REVIEW */}
      {currentReviewer && (
        <div className="pg-card-review-badge" data-me={iAmCurrentReviewer}>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="5" cy="5" r="3.5"/><path d="M3.5 5l1 1 2-2"/></svg>
          {t('Review: {{name}}', { name: firstName(currentReviewer.name) })}
          {iAmCurrentReviewer && <span className="pg-card-review-badge__me">{t('your turn')}</span>}
        </div>
      )}
      {progress && (
        <div className="progress-bar-track work-card__progress-track">
          <div className={`progress-bar-fill ${progress.tone}`} style={{ width: `${progress.pct}%` }} />
        </div>
      )}
      <div className="work-card__footer">
        <span className="code-badge">{item.code}</span>
        {isOverdue ? <span className="work-card__blocked">{t('Overdue')}</span> : null}
        {needsAck ? <span className="pg-card__flag" title={t('Awaiting your acceptance')}>{t('NEEDS RESPONSE')}</span> : null}
        {item.needsClarification ? <span className="pg-card__flag pg-card__flag--clarify">{t('CLARIFICATION')}</span> : null}
        {item.revisionCount > 0 ? <span className="pg-card__flag pg-card__flag--revision" title={t('{{count}} revision(s) so far', { count: item.revisionCount })}>{t('REV·{{count}}', { count: item.revisionCount })}</span> : null}
        {item.isPrivate ? <span className="pg-card__flag pg-card__flag--private" title={t('Private')}>🔒</span> : null}
        {(item._count?.evidenceItems ?? 0) > 0 ? <span className="pg-card__evidence-badge" title={t('{{count}} evidence attachment(s)', { count: item._count?.evidenceItems ?? 0 })}><svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M9 4.5L5 8.5a2 2 0 0 1-3-3l4.5-4.5a1.4 1.4 0 0 1 2 2L4 7.5"/></svg>{item._count?.evidenceItems}</span> : null}
        <span className="work-card__footer-meta">
          <span className={`pg-due-inline pg-due-inline--${due.tone}`}>{due.label}</span> · {firstName(item.assignee.name)}
        </span>
      </div>
    </div>
  )
}

// ── List view ──────────────────────────────────────────────────────────────
function ListView({ items, onSelect }: { items: Assignment[]; onSelect: (id: number) => void }) {
  const { t } = useTranslation()
  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">{t('All Assignments')}</h3>
        <span className="badge">{items.length}</span>
      </div>
      <div className="wi-list">
        {items.map((r) => {
          const due = formatDueDate(r.dueDate)
          return (
            <button className="wi-list-row" key={r.id} onClick={() => onSelect(r.id)}>
              <div className="wi-list-row__left">
                <span className="code-badge">{r.code}</span>
                <div>
                  <strong>{r.title}</strong>
                  <span className="text-muted text-sm">{r.assignee.name} · {STATUS_LABEL(r.status)}</span>
                </div>
              </div>
              <div className="wi-list-row__right">
                <span className={`priority-badge priority-badge--${r.priority}`}>{PRIORITY_LABEL(r.priority)}</span>
                <span className={`pg-due-inline pg-due-inline--${due.tone}`}>{due.label}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ canAssign, onCreate }: { canAssign: boolean; onCreate: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ opacity: 0.35, marginBottom: 12 }}>
        <svg width="38" height="38" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="5" width="22" height="26" rx="2"/><path d="M12 11h12M12 16h12M12 21h8"/>
          <path d="m23 26 1.5 1.5L28 24" stroke="var(--green)" strokeWidth="1.6"/>
        </svg>
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 6px' }}>{t('No assignments yet')}</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 auto 18px', maxWidth: 340, lineHeight: 1.5 }}>{t("Assignments that aren't part of a Program will show up here.")}</p>
      {canAssign && <button className="toolbar-action-btn" onClick={onCreate} type="button">{t('+ Create your first one')}</button>}
    </div>
  )
}

// ── Evidence section ──────────────────────────────────────────────────────
function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(size >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function fileIcon(_mime: string | null, name: string | null): string {
  const ext = (name?.split('.').pop() ?? '').toLowerCase()
  if (['pdf'].includes(ext)) return '📄'
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['xls', 'xlsx'].includes(ext)) return '📊'
  if (['ppt', 'pptx'].includes(ext)) return '📽️'
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(ext)) return '🖼️'
  return '📎'
}

function EvidenceSection({ assignmentId, items, loading, canUpload, canDelete, evidenceRequired, onChanged }: {
  assignmentId: number
  items: Evidence[]
  loading: boolean
  canUpload: boolean
  canDelete: (item: Evidence) => boolean
  evidenceRequired: boolean
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [uploadMode, setUploadMode] = useState<'idle' | 'file' | 'link' | 'note'>('idle')
  const [linkUrl, setLinkUrl] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setUploadMode('idle'); setLinkUrl(''); setDescription(''); setErr(null)
    setPendingFile(null); setDragging(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadFile(file: File) {
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (description.trim()) fd.append('description', description.trim())
      await api.upload(`/assignments/${assignmentId}/attachments/file`, fd)
      reset()
      onChanged()
    } catch (er) {
      setErr(extractErrorMessage(er))
    } finally { setBusy(false) }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setPendingFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setPendingFile(file)
  }

  async function handleLinkSubmit() {
    if (!linkUrl.trim() || !description.trim()) return
    setBusy(true); setErr(null)
    try {
      await api.post(`/assignments/${assignmentId}/attachments`, {
        type: 'LINK', url: linkUrl.trim(), description: description.trim(),
      })
      reset()
      onChanged()
    } catch (er) { setErr(extractErrorMessage(er)) } finally { setBusy(false) }
  }

  async function handleNoteSubmit() {
    if (!description.trim()) return
    setBusy(true); setErr(null)
    try {
      await api.post(`/assignments/${assignmentId}/attachments`, {
        type: 'NOTE', description: description.trim(),
      })
      reset()
      onChanged()
    } catch (er) { setErr(extractErrorMessage(er)) } finally { setBusy(false) }
  }

  async function handleDelete(id: number) {
    if (!window.confirm(t('Delete this attachment?'))) return
    try {
      await api.delete(`/assignments/${assignmentId}/attachments/${id}`)
      onChanged()
    } catch (er) {
      alert(extractErrorMessage(er))
    }
  }

  const count = items.length
  const needsEvidence = evidenceRequired && count === 0

  return (
    <section className="pg-section">
      <h4 className="pg-section__title">
        {t('Evidence')} {count > 0 && <span className="pg-evidence__count">{count}</span>}
        {evidenceRequired && <span className="pg-evidence__req" title={t('Required before submit')}>{t('REQUIRED')}</span>}
      </h4>

      {loading && <div className="pg-evidence__empty">{t('Loading…')}</div>}

      {!loading && items.length === 0 && !canUpload && (
        <div className="pg-evidence__empty">{t('No evidence yet.')}</div>
      )}

      {!loading && items.length === 0 && canUpload && needsEvidence && (
        <div className="alert alert--warn" style={{ marginBottom: 10 }}>
          <strong>{t('Evidence required')}</strong>
          <p>{t('This assignment requires at least 1 attachment (file / link / note) before it can be submitted.')}</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="pg-evidence__list">
          {items.map((it) => (
            <li key={it.id} className={`pg-evidence__item pg-evidence__item--${it.type.toLowerCase()}`}>
              {it.type === 'FILE' && (
                <>
                  <span className="pg-evidence__icon">{fileIcon(null, it.originalName)}</span>
                  <div className="pg-evidence__body">
                    <a
                      className="pg-evidence__title"
                      href={`/assignments/${assignmentId}/attachments/${it.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >{it.originalName ?? it.filename ?? t('file')}</a>
                    {it.description && <span className="pg-evidence__desc">{it.description}</span>}
                    <span className="pg-evidence__meta">{formatFileSize(it.filesize)} · {it.uploader.name} · {new Date(it.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </>
              )}
              {it.type === 'LINK' && (
                <>
                  <span className="pg-evidence__icon">🔗</span>
                  <div className="pg-evidence__body">
                    <a className="pg-evidence__title" href={it.url ?? '#'} target="_blank" rel="noreferrer">{it.description ?? it.url}</a>
                    {it.url && <span className="pg-evidence__desc" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5 }}>{it.url}</span>}
                    <span className="pg-evidence__meta">{it.uploader.name} · {new Date(it.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </>
              )}
              {it.type === 'NOTE' && (
                <>
                  <span className="pg-evidence__icon">📝</span>
                  <div className="pg-evidence__body">
                    <p className="pg-evidence__note-text">{it.description}</p>
                    <span className="pg-evidence__meta">{it.uploader.name} · {new Date(it.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </>
              )}
              {canDelete(it) && (
                <button className="pg-evidence__del" onClick={() => void handleDelete(it.id)} type="button" title={t('Delete')} aria-label={t('Delete')}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m1 1 10 10M11 1 1 11"/></svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <div className="pg-evidence__upload">
          {uploadMode === 'idle' && (
            <div className="pg-evidence__upload-actions">
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setUploadMode('file')}>📎 {t('Upload File')}</button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setUploadMode('link')}>🔗 {t('Add Link')}</button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setUploadMode('note')}>📝 {t('Note')}</button>
            </div>
          )}
          {uploadMode === 'file' && (
            <div className="pg-evidence__form">
              <input ref={fileInputRef} type="file" hidden onChange={handleFilePick} disabled={busy} />
              {!pendingFile ? (
                <button
                  type="button"
                  className={`pg-dropzone${dragging ? ' is-dragging' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  disabled={busy}
                >
                  <svg className="pg-dropzone__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>
                  <span className="pg-dropzone__title">{t('Click to choose a file')}</span>
                  <span className="pg-dropzone__hint">{t('or drag & drop here')}</span>
                  <span className="pg-dropzone__meta">{t('Max 20 MB — PDF / Office / image / ZIP')}</span>
                </button>
              ) : (
                <div className="pg-filecard">
                  <span className="pg-filecard__icon">{fileIcon(pendingFile.type, pendingFile.name)}</span>
                  <div className="pg-filecard__body">
                    <span className="pg-filecard__name" title={pendingFile.name}>{pendingFile.name}</span>
                    <span className="pg-filecard__size">{formatFileSize(pendingFile.size)}</span>
                  </div>
                  <button className="pg-filecard__clear" type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} disabled={busy} title={t('Remove')} aria-label={t('Remove')}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m1 1 10 10M11 1 1 11"/></svg>
                  </button>
                </div>
              )}
              <label>{t('Caption')} <small>{t('(optional)')}</small></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t('e.g. draft v1, before manager review')} disabled={busy} />
              <div className="pg-evidence__form-actions">
                <button className="btn btn--ghost btn--sm" type="button" onClick={reset} disabled={busy}>{t('Cancel')}</button>
                <button className="btn btn--primary btn--sm" type="button" onClick={() => pendingFile && void uploadFile(pendingFile)} disabled={busy || !pendingFile}>{busy ? t('Uploading…') : t('Upload')}</button>
              </div>
            </div>
          )}
          {uploadMode === 'link' && (
            <div className="pg-evidence__form">
              <label>{t('URL')} <small>{t('(Google Drive / SharePoint / external link)')}</small></label>
              <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/…" disabled={busy} />
              <label>{t('Description')} <small>{t('(required — describe the link)')}</small></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t('e.g. Folder of Danantara draft materials with assumptions')} />
              <div className="pg-evidence__form-actions">
                <button className="btn btn--ghost btn--sm" type="button" onClick={reset} disabled={busy}>{t('Cancel')}</button>
                <button className="btn btn--primary btn--sm" type="button" onClick={() => void handleLinkSubmit()} disabled={busy || !linkUrl.trim() || !description.trim()}>{t('Save')}</button>
              </div>
            </div>
          )}
          {uploadMode === 'note' && (
            <div className="pg-evidence__form">
              <label>{t('Short note')}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t('e.g. Coordinated with the BUMN holding on 23 April via Zoom, conclusion: …')} disabled={busy} autoFocus />
              <div className="pg-evidence__form-actions">
                <button className="btn btn--ghost btn--sm" type="button" onClick={reset} disabled={busy}>{t('Cancel')}</button>
                <button className="btn btn--primary btn--sm" type="button" onClick={() => void handleNoteSubmit()} disabled={busy || !description.trim()}>{t('Save')}</button>
              </div>
            </div>
          )}
          {err && <div className="alert alert--error" style={{ marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </section>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────
function DetailPanel({ assignment, isOpen, currentUserId, isAdmin, onClose }: {
  assignment: Assignment | null; isOpen: boolean
  currentUserId: number; isAdmin: boolean; onClose: () => void
}) {
  const { t } = useTranslation()
  const { assignmentRefreshTick } = useWorkspace()
  const [snapshot, setSnapshot] = useState<Assignment | null>(assignment)
  useEffect(() => { if (assignment) setSnapshot(assignment) }, [assignment])
  const { rendered, closing } = useAnimatedClose(isOpen, 180)
  useEscKey(onClose, isOpen)

  // Evidence state (fetched terpisah dari list API)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const assignmentId = assignment?.id
  const loadEvidence = useCallback(async () => {
    if (!assignmentId) return
    setEvidenceLoading(true)
    try {
      const { data } = await api.get<{ data: Evidence[] }>(`/assignments/${assignmentId}/attachments`)
      setEvidence(data)
    } catch {
      setEvidence([])
    } finally {
      setEvidenceLoading(false)
    }
  }, [assignmentId])
  useEffect(() => {
    if (!isOpen || !assignmentId) return
    void loadEvidence()
  }, [isOpen, assignmentId, assignmentRefreshTick, loadEvidence])

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'none' | 'clarify' | 'cancel' | 'return' | 'reject'>('none')

  useEffect(() => { setErr(null); setMode('none'); setNote('') }, [assignment?.id])

  if (!rendered || !snapshot) return null
  const a = snapshot
  const isAssigner = a.assignerId === currentUserId
  const isAssignee = a.assigneeId === currentUserId
  const isSelfAssign = a.assignerId === a.assigneeId
  const due = formatDueDate(a.dueDate)
  const chain = a.approvalChain ?? []
  const curReviewer = a.status === 'IN_REVIEW' && a.currentReviewerIdx !== null ? chain[a.currentReviewerIdx] ?? null : null
  const iAmCurrentReviewer = curReviewer !== null && curReviewer.userId === currentUserId
  // Catatan return terakhir (kalau PIC perlu lihat alasan balik ke DIKERJAKAN)
  const lastReturn = [...chain].reverse().find((c) => c.status === 'RETURNED') ?? null

  async function runAction(action: Action, actionNote?: string) {
    setBusy(true); setErr(null)
    try {
      await api.post(`/assignments/${a.id}/transition`, { action, note: actionNote })
      setMode('none'); setNote('')
    } catch (e) { setErr(extractErrorMessage(e)) } finally { setBusy(false) }
  }

  const statusBadgeClass = a.status === 'SELESAI' ? 'badge--green'
    : a.status === 'IN_REVIEW' ? 'badge--yellow'
    : a.status === 'DIKERJAKAN' ? 'badge--blue'
    : a.status === 'REJECTED' ? 'badge--red'
    : a.status === 'DIBATALKAN' ? 'badge--cancelled'
    : 'badge--planning'

  return (
    <>
      <div className={`pg-overlay${closing ? ' is-closing' : ''}`} onClick={onClose} />
      <aside className={`pg-panel${closing ? ' is-closing' : ''}`} aria-modal="true" role="dialog">
        <header className="pg-panel__head">
          <div className="pg-panel__kicker">
            <span className="code-badge">{a.code}</span>
            <span className={`badge ${statusBadgeClass}`}>{STATUS_LABEL(a.status)}</span>
            <span className={`priority-badge priority-badge--${a.priority}`}>{PRIORITY_LABEL(a.priority)}</span>
            {a.isPrivate && <span className="badge badge--purple" title={t('Private')}>🔒 {t('Private')}</span>}
            {a.needsClarification && <span className="badge badge--yellow">{t('Needs clarification')}</span>}
            {a.revisionCount > 0 && <span className="badge badge--yellow">{t('Revision #{{count}}', { count: a.revisionCount })}</span>}
          </div>
          <button className="pg-panel__close" onClick={onClose} type="button" aria-label={t('Close')}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m1 1 10 10M11 1 1 11"/></svg>
          </button>
        </header>

        <div className="pg-panel__body">
          <h2 className="pg-panel__title">{a.title}</h2>
          {a.description && <p className="pg-panel__desc">{a.description}</p>}

          {/* Banner: tugas dikembalikan oleh reviewer, PIC perlu revisi */}
          {a.status === 'DIKERJAKAN' && lastReturn && a.revisionCount > 0 && (
            <div className="alert alert--warn">
              <strong>{t('Returned for revision')}</strong>
              <p>{t('By {{name}} on {{date}}', { name: lastReturn.name, date: lastReturn.actedAt ? new Date(lastReturn.actedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-' })}{lastReturn.note ? ` — "${lastReturn.note}"` : ''}. {t('Fix & resubmit.')}</p>
            </div>
          )}
          {/* Banner: tugas ditolak */}
          {a.status === 'REJECTED' && a.rejectionReason && (
            <div className="alert alert--error">
              <strong>{t('Assignment rejected')}</strong>
              <p>{a.rejectionReason}</p>
            </div>
          )}
          {a.needsClarification && a.clarificationNote && (
            <div className="alert alert--warn">
              <strong>{t('Clarification question')}</strong>
              <p>{a.clarificationNote}</p>
            </div>
          )}
          {a.status === 'DIBATALKAN' && a.cancelReason && (
            <div className="alert alert--muted">
              <strong>{t('Cancellation reason')}</strong>
              <p>{a.cancelReason}</p>
            </div>
          )}

          {/* Rantai Approval — hanya muncul kalau ada chain (non self-assign) */}
          {chain.length > 0 && (
            <section className="pg-section">
              <h4 className="pg-section__title">{t('Approval Chain')}</h4>
              <ol className="pg-approval-chain">
                {chain.map((c, i) => {
                  const isCurrent = a.status === 'IN_REVIEW' && i === a.currentReviewerIdx
                  const dotClass = c.status === 'APPROVED' ? 'is-approved'
                    : c.status === 'RETURNED' ? 'is-returned'
                    : c.status === 'REJECTED' ? 'is-rejected'
                    : isCurrent ? 'is-current'
                    : 'is-pending'
                  return (
                    <li key={c.userId} className={dotClass}>
                      <span className="pg-approval-chain__dot" />
                      <div className="pg-approval-chain__body">
                        <div className="pg-approval-chain__who">
                          <Avatar name={c.name} avatarUrl={c.avatarUrl} size={18} />
                          <strong>{c.name}</strong>
                          <span className="pg-approval-chain__role">{c.role}</span>
                          {isCurrent && <span className="pg-approval-chain__now">{t('current turn')}</span>}
                        </div>
                        {c.positionTitle && <small className="pg-approval-chain__pos">{c.positionTitle}</small>}
                        {c.status !== 'PENDING' && c.actedAt && (
                          <small className="pg-approval-chain__act">
                            {c.status === 'APPROVED' ? `✓ ${t('Approved')}` : c.status === 'RETURNED' ? `↩ ${t('Returned')}` : `✕ ${t('Rejected')}`} · {new Date(c.actedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </small>
                        )}
                        {c.note && <small className="pg-approval-chain__note">"{c.note}"</small>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          {isSelfAssign && (
            <div className="alert alert--muted" style={{ marginTop: 14 }}>
              <strong>{t('Self-assign')}</strong>
              <p>{t('This assignment is assigned to yourself — it skips the tiered approval chain.')}</p>
            </div>
          )}

          <EvidenceSection
            assignmentId={a.id}
            items={evidence}
            loading={evidenceLoading}
            canUpload={(isAssignee || isAdmin) && ['DITUGASKAN', 'DIKERJAKAN', 'IN_REVIEW'].includes(a.status)}
            canDelete={(item) => item.uploadedBy === currentUserId || isAdmin}
            evidenceRequired={a.evidenceRequired}
            onChanged={loadEvidence}
          />

          <section className="pg-section">
            <h4 className="pg-section__title">{t('Detail')}</h4>
            <dl className="pg-meta">
              <div><dt>{t('PIC')}</dt><dd>
                <span className="pg-person"><Avatar name={a.assignee.name} avatarUrl={a.assignee.avatarUrl} size={20} />{a.assignee.name}</span>
                {a.assignee.positionTitle && <small>{a.assignee.positionTitle}</small>}
              </dd></div>
              <div><dt>{t('Assigner')}</dt><dd>
                <span className="pg-person"><Avatar name={a.assigner.name} avatarUrl={a.assigner.avatarUrl} size={20} />{a.assigner.name}</span>
                {a.assigner.positionTitle && <small>{a.assigner.positionTitle}</small>}
              </dd></div>
              <div><dt>{t('Deadline')}</dt><dd style={{ padding: 0 }}>
                <span className={`pg-due-inline pg-due-inline--${due.tone}`}>{due.label}</span>
                {a.dueDate && <small>{new Date(a.dueDate).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>}
                {a.completedAt && a.dueDate && (
                  <small style={{ marginTop: 2, display: 'block', fontWeight: 600, color: new Date(a.completedAt) <= new Date(a.dueDate) ? 'var(--green)' : 'var(--red)' }}>
                    {new Date(a.completedAt) <= new Date(a.dueDate) ? `✓ ${t('Completed on time')}` : `⚠ ${t('Completed past deadline')}`}
                  </small>
                )}
                <small style={{ color: 'var(--text-muted)', marginTop: 1, display: 'block' }}>
                  {t('Set by: {{name}}', { name: a.assigner.name })}
                </small>
              </dd></div>
              {a.relatedProgram && (<div><dt>{t('Program')}</dt><dd>[{a.relatedProgram.code}] {a.relatedProgram.name}</dd></div>)}
              <div><dt>{t('Created')}</dt><dd>{new Date(a.createdAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd></div>
            </dl>
          </section>

          <section className="pg-section">
            <h4 className="pg-section__title">{t('Timeline')}</h4>
            <ol className="pg-timeline">
              <li className="is-done"><span className="pg-timeline__dot" /><div><strong>{t('Assigned')}</strong><small>{new Date(a.createdAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></li>
              <li className={a.acknowledgedAt ? 'is-done' : ''}><span className="pg-timeline__dot" /><div><strong>{t('Received')}</strong><small>{a.acknowledgedAt ? new Date(a.acknowledgedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('Not yet received')}</small></div></li>
              <li className={['IN_REVIEW', 'SELESAI'].includes(a.status) ? 'is-done' : ''}><span className="pg-timeline__dot" /><div><strong>{t('Submit review')}</strong><small>{a.status === 'IN_REVIEW' ? t('In review') : a.status === 'SELESAI' ? t('Approved') : t('Not submitted')}</small></div></li>
              <li className={a.completedAt ? 'is-done' : ''}><span className="pg-timeline__dot" /><div><strong>{t('Completed')}</strong><small>{a.completedAt ? new Date(a.completedAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('Not completed')}</small></div></li>
            </ol>
          </section>

          {err && <div className="alert alert--error">{err}</div>}

          {mode === 'clarify' && (
            <div className="pg-inline-form">
              <label>{t('Clarification question')}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('e.g. deadline clashes with prep for the 26 April Dekom meeting')} autoFocus />
              <div className="pg-inline-form__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => { setMode('none'); setNote('') }} type="button">{t('Cancel')}</button>
                <button className="btn btn--primary btn--sm" disabled={!note.trim() || busy} onClick={() => void runAction('CLARIFY', note.trim())} type="button">{t('Send')}</button>
              </div>
            </div>
          )}
          {mode === 'cancel' && (
            <div className="pg-inline-form pg-inline-form--danger">
              <label>{t('Cancellation reason')} <small>{t('(optional)')}</small></label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('e.g. scope changed, moved into another Program')} autoFocus />
              <div className="pg-inline-form__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => { setMode('none'); setNote('') }} type="button">{t('Back')}</button>
                <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => void runAction('CANCEL', note.trim() || undefined)} type="button">{t('Cancel Assignment')}</button>
              </div>
            </div>
          )}
          {mode === 'return' && (
            <div className="pg-inline-form">
              <label>{t('Note for the PIC')} <small>{t('(required — explain what needs fixing)')}</small></label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('e.g. complete the impact analysis in section 3, add a cost breakdown table')} autoFocus />
              <div className="pg-inline-form__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => { setMode('none'); setNote('') }} type="button">{t('Cancel')}</button>
                <button className="btn btn--primary btn--sm" disabled={!note.trim() || busy} onClick={() => void runAction('RETURN', note.trim())} type="button">{t('Return')}</button>
              </div>
            </div>
          )}
          {mode === 'reject' && (
            <div className="pg-inline-form pg-inline-form--danger">
              <label>{t('Rejection reason')} <small>{t('(required)')}</small></label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("e.g. results don't meet the standard, wrong scope, irrelevant material")} autoFocus />
              <div className="pg-inline-form__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => { setMode('none'); setNote('') }} type="button">{t('Cancel')}</button>
                <button className="btn btn--danger btn--sm" disabled={!note.trim() || busy} onClick={() => void runAction('REJECT', note.trim())} type="button">{t('Reject Assignment')}</button>
              </div>
            </div>
          )}
        </div>

        {mode === 'none' && (
          <footer className="pg-panel__footer">
            {/* ── DITUGASKAN: PIC menerima atau klarifikasi ── */}
            {(isAssignee || isAdmin) && a.status === 'DITUGASKAN' && (
              <>
                <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void runAction('ACKNOWLEDGE')} type="button">{t('Accept & Start')}</button>
                <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setMode('clarify')} type="button">{t('Ask for Clarification')}</button>
              </>
            )}
            {/* ── DIKERJAKAN: submit atau (self-assign) langsung selesai ── */}
            {(isAssignee || isAdmin) && a.status === 'DIKERJAKAN' && !isSelfAssign && (
              <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void runAction('SUBMIT')} type="button">{t('Submit for Review')}</button>
            )}
            {(isAssignee || isAdmin) && a.status === 'DIKERJAKAN' && isSelfAssign && (
              <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void runAction('APPROVE')} type="button">{t('Mark Complete')}</button>
            )}
            {/* ── IN_REVIEW: reviewer giliran approve/return/reject ── */}
            {(iAmCurrentReviewer || isAdmin) && a.status === 'IN_REVIEW' && (
              <>
                <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void runAction('APPROVE')} type="button">{t('Approve')}</button>
                <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setMode('return')} type="button">{t('Return')}</button>
                <button className="btn btn--ghost btn--sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => setMode('reject')} type="button">{t('Reject')}</button>
              </>
            )}
            {/* ── Pemberi: batalkan (selain terminal) ── */}
            {(isAssigner || isAdmin) && !['SELESAI', 'REJECTED', 'DIBATALKAN'].includes(a.status) && (
              <button className="btn btn--ghost btn--sm" style={{ color: 'var(--red)', marginLeft: 'auto' }} disabled={busy} onClick={() => setMode('cancel')} type="button">{t('Cancel')}</button>
            )}
            {/* ── Terminal: REOPEN oleh pemberi ── */}
            {(isAssigner || isAdmin) && ['SELESAI', 'REJECTED', 'DIBATALKAN'].includes(a.status) && (
              <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void runAction('REOPEN')} type="button">{t('Reopen')}</button>
            )}
          </footer>
        )}
      </aside>
    </>
  )
}

// ── Create modal ───────────────────────────────────────────────────────────
function CreateModal({ directory, currentUserId, currentRole, isOpen, onClose }: {
  directory: DirectoryUser[]; currentUserId: number; currentRole: Role; isOpen: boolean; onClose: () => void
}) {
  const { t } = useTranslation()
  const { rendered, closing } = useAnimatedClose(isOpen, 160)
  useEscKey(onClose, isOpen)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | ''>('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [evidenceRequired, setEvidenceRequired] = useState(true)
  const [isPrivate, setIsPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Preview rantai approval berdasar PIC yang dipilih
  const [, setPreviewChain] = useState<ChainEntry[]>([])
  const [, setPreviewLoading] = useState(false)
  const [, setPreviewError] = useState<string | null>(null)

  const canTogglePrivate = ['BOD', 'KADIV', 'ADMIN', 'SUPERADMIN'].includes(currentRole)

  useEffect(() => {
    if (isOpen) {
      setTitle(''); setDescription(''); setAssigneeId(''); setPriority('MEDIUM'); setDueDate('')
      setEvidenceRequired(true); setIsPrivate(false); setErr(null)
      setPreviewChain([]); setPreviewError(null)
      setTimeout(() => firstFieldRef.current?.focus(), 10)
    }
  }, [isOpen])

  // Fetch preview chain setiap kali PIC berubah (debounced via effect)
  useEffect(() => {
    if (!isOpen || !assigneeId) { setPreviewChain([]); return }
    let cancelled = false
    setPreviewLoading(true); setPreviewError(null)
    api.get<{ chain: ChainEntry[]; allowed: boolean }>(`/assignments/preview-chain?assigneeId=${assigneeId}`)
      .then(({ chain, allowed }) => {
        if (cancelled) return
        if (!allowed) {
          setPreviewError(t("You're not authorized to assign to this user."))
          setPreviewChain([])
        } else {
          setPreviewChain(chain)
        }
      })
      .catch((e) => { if (!cancelled) setPreviewError(extractErrorMessage(e)) })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [isOpen, assigneeId])

  const options = useMemo(() => directory.filter((u) => u.id !== currentUserId), [directory, currentUserId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !assigneeId) return
    setBusy(true); setErr(null)
    try {
      await api.post('/assignments', {
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: Number(assigneeId),
        priority,
        dueDate,
        evidenceRequired,
        isPrivate: canTogglePrivate ? isPrivate : false,
      })
      onClose()
    } catch (e) { setErr(extractErrorMessage(e)) } finally { setBusy(false) }
  }

  if (!rendered) return null
  // Phase 5B: portal-mount ke document.body. Subkomponen ini dipanggil dari
  // main AssignmentsView yang sekarang punya ds-stagger. Tanpa portal, modal
  // ter-scope ke wrapper saat transform aktif. Portal escape ke viewport.
  return createPortal(
    <div className={`modal-backdrop${closing ? ' modal-backdrop--closing' : ''}`} onClick={onClose}>
      <form className={`modal${closing ? ' modal--closing' : ''}`} style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__header">
          <div className="modal-headcopy">
            <span className="modal-kicker">{t('Assignment')}</span>
            <h3 className="modal__title">{t('New Assignment')}</h3>
            <p className="modal-subtitle">{t('Ad-hoc assignment outside a Program. The PIC will be notified.')}</p>
            <p className="modal-cross-hint">
              {t('Part of a work Program?')} <Link href="/execution">{t('Create it as a Task on the Workboard →')}</Link>
            </p>
          </div>
          <button className="modal__close" onClick={onClose} type="button">
            <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11"/></svg>
          </button>
        </div>
        <div className="modal__body">
          <div className="pg-form">
            <label className="pg-form__field">
              <span>{t('Task title *')}</span>
              <input ref={firstFieldRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required placeholder={t('e.g. Prepare the Danantara presentation deck')} />
            </label>
            <label className="pg-form__field">
              <span>{t('Description')}</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder={t('Context, expected output, references…')} />
            </label>
            <div className="pg-form__row">
              <label className="pg-form__field">
                <span>{t('PIC *')}</span>
                <UserPicker
                  inputClassName="pg-form__input"
                  onChange={(id) => setAssigneeId(id ?? '')}
                  options={options}
                  placeholder={t('— Select PIC —')}
                  value={assigneeId === '' ? null : assigneeId}
                />
              </label>
              <label className="pg-form__field">
                <span>{t('Deadline')} <span style={{ color: 'var(--red)', fontWeight: 700 }}>*</span></span>
                <input
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  type="date"
                  value={dueDate}
                />
                <span className="pg-form__hint">{t('The assigner sets the deadline')}</span>
              </label>
            </div>
            <div className="pg-form__field">
              <span>{t('Priority')}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRIORITY_ORDER.map((p) => (
                  <button key={p} type="button" className={`priority-badge priority-badge--${p}`} style={{ cursor: 'pointer', border: priority === p ? '1px solid currentColor' : '1px solid transparent', opacity: priority === p ? 1 : 0.55 }} onClick={() => setPriority(p)}>
                    {PRIORITY_LABEL(p)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {err && <div className="alert alert--error">{err}</div>}
        </div>
        <div className="modal__footer">
          <button className="btn btn--ghost btn--sm" onClick={() => onClose()} type="button" disabled={busy}>{t('Cancel')}</button>
          <button className="toolbar-action-btn" type="submit" disabled={busy || !title.trim() || !assigneeId || !dueDate}>
            {busy ? t('Saving…') : t('Assign')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

// ── Styles — minimal, hanya override/tambahan assignment-spesifik ────────
const PENUGASAN_CSS = `
.view-penugasan { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.view-penugasan .workboard-workspace { padding: 16px 20px 20px; overflow-x: auto; overflow-y: auto; flex: 1; }

/* Card flag untuk assignment-specific (PERLU RESPON / KLARIFIKASI) — pakai slot .work-card__blocked */
.pg-card__flag { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green); text-transform: uppercase; }
.pg-card__flag--clarify { background: color-mix(in srgb, var(--yellow) 15%, transparent); color: var(--yellow); }
.pg-card__flag--revision { background: color-mix(in srgb, var(--orange, #ea580c) 15%, transparent); color: var(--orange, #c2410c); }
.pg-card__flag--private { background: color-mix(in srgb, var(--purple, #7c3aed) 14%, transparent); color: var(--purple, #7c3aed); padding: 0 4px; font-size: 11px; }

/* Review badge di kartu (saat status IN_REVIEW) */
.pg-card-review-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; margin: 6px 0 2px; border-radius: 4px; background: var(--surface-1); border: 1px solid var(--panel-border); color: var(--text-muted); font-size: 10.5px; font-weight: 500; }
.pg-card-review-badge[data-me="true"] { background: var(--indigo-dim); border-color: color-mix(in srgb, var(--indigo) 30%, var(--panel-border)); color: var(--indigo); }
.pg-card-review-badge__me { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 1px 5px; border-radius: 3px; background: var(--indigo); color: var(--text-inverse); margin-left: 4px; }

/* Rantai approval stepper */
.pg-approval-chain { list-style: none; padding: 0; margin: 0; position: relative; }
.pg-approval-chain::before { content: ''; position: absolute; left: 5px; top: 10px; bottom: 10px; width: 1px; background: var(--panel-border); }
.pg-approval-chain li { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 6px 0 10px; position: relative; }
.pg-approval-chain li:last-child { padding-bottom: 0; }
.pg-approval-chain__dot { width: 11px; height: 11px; border-radius: 50%; background: var(--panel); border: 2px solid var(--panel-border); margin-top: 3px; z-index: 1; }
.pg-approval-chain li.is-approved .pg-approval-chain__dot { background: var(--green); border-color: var(--green); }
.pg-approval-chain li.is-returned .pg-approval-chain__dot { background: var(--yellow); border-color: var(--yellow); }
.pg-approval-chain li.is-rejected .pg-approval-chain__dot { background: var(--red); border-color: var(--red); }
.pg-approval-chain li.is-current .pg-approval-chain__dot { background: var(--panel); border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
.pg-approval-chain__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pg-approval-chain__who { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pg-approval-chain__who strong { font-size: 12.5px; color: var(--text-strong); font-weight: 600; }
.pg-approval-chain li:not(.is-approved):not(.is-current) .pg-approval-chain__who strong { color: var(--text-muted); font-weight: 500; }
.pg-approval-chain__role { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); padding: 1px 5px; border-radius: 3px; background: var(--surface-1); border: 1px solid var(--panel-border); }
.pg-approval-chain__now { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; background: var(--indigo); color: var(--text-inverse); }
.pg-approval-chain__pos { font-size: 11px; color: var(--text-muted); }
.pg-approval-chain__act { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.pg-approval-chain li.is-approved .pg-approval-chain__act { color: var(--green); }
.pg-approval-chain li.is-returned .pg-approval-chain__act { color: var(--yellow); }
.pg-approval-chain li.is-rejected .pg-approval-chain__act { color: var(--red); }
.pg-approval-chain__note { font-size: 11.5px; color: var(--text); font-style: italic; margin-top: 3px; padding: 5px 8px; background: var(--surface-1); border-left: 2px solid var(--panel-border); border-radius: 0 4px 4px 0; }

/* Evidence section */
.pg-evidence__count { margin-left: 6px; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 10px; background: var(--surface-1); border: 1px solid var(--panel-border); color: var(--text-muted); }
.pg-evidence__req { margin-left: 6px; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; background: var(--red-dim); color: var(--red); letter-spacing: 0.06em; }
.pg-evidence__empty { font-size: 12px; color: var(--text-muted); padding: 10px 0; font-style: italic; }
.pg-evidence__list { list-style: none; padding: 0; margin: 0 0 10px; display: flex; flex-direction: column; gap: 6px; }
.pg-evidence__item { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; padding: 9px 10px; border: 1px solid var(--panel-border); border-radius: 7px; background: var(--surface-1); align-items: start; }
.pg-evidence__item--note { background: color-mix(in srgb, var(--yellow) 4%, var(--panel)); border-color: color-mix(in srgb, var(--yellow) 20%, var(--panel-border)); }
.pg-evidence__icon { font-size: 16px; line-height: 1; margin-top: 1px; }
.pg-evidence__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pg-evidence__title { font-size: 12.5px; font-weight: 500; color: var(--text-strong); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pg-evidence__title:hover { color: var(--indigo); text-decoration: underline; }
.pg-evidence__desc { font-size: 11.5px; color: var(--text); line-height: 1.4; }
.pg-evidence__meta { font-size: 10.5px; color: var(--text-muted); margin-top: 2px; }
.pg-evidence__note-text { font-size: 12.5px; color: var(--text-strong); margin: 0; line-height: 1.45; white-space: pre-wrap; }
.pg-evidence__del { background: transparent; border: none; padding: 4px 6px; cursor: pointer; color: var(--text-muted); border-radius: 4px; display: flex; align-items: center; }
.pg-evidence__del:hover { background: var(--red-dim); color: var(--red); }

.pg-evidence__upload { margin-top: 4px; padding: 10px; border: 1px dashed var(--panel-border); border-radius: 7px; background: var(--surface-1); }
.pg-evidence__upload-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.pg-evidence__form { display: flex; flex-direction: column; gap: 6px; }
.pg-evidence__form label { font-size: 11.5px; color: var(--text-muted); font-weight: 500; }
.pg-evidence__form label small { font-weight: 400; opacity: 0.8; margin-left: 4px; }
.pg-evidence__form input, .pg-evidence__form textarea { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 6px; padding: 7px 10px; font-size: 12.5px; color: var(--text-strong); font-family: inherit; box-sizing: border-box; }
.pg-evidence__form textarea { resize: vertical; }
.pg-evidence__form input:focus, .pg-evidence__form textarea:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
.pg-evidence__form-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 2px; }

/* Dropzone + selected-file card */
.pg-dropzone { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100%; padding: 18px 14px; border: 1.5px dashed var(--panel-border); border-radius: 9px; background: var(--surface-1); color: var(--text-muted); cursor: pointer; text-align: center; transition: border-color .15s ease, background .15s ease, color .15s ease; }
.pg-dropzone:hover:not(:disabled) { border-color: var(--indigo); color: var(--text-strong); background: var(--indigo-dim); }
.pg-dropzone.is-dragging { border-color: var(--indigo); border-style: solid; background: var(--indigo-dim); color: var(--indigo); }
.pg-dropzone:disabled { opacity: .6; cursor: default; }
.pg-dropzone__icon { color: var(--indigo); margin-bottom: 3px; }
.pg-dropzone__title { font-size: 12.5px; font-weight: 600; color: var(--text-strong); }
.pg-dropzone__hint { font-size: 11.5px; color: var(--text-muted); }
.pg-dropzone__meta { font-size: 10px; color: var(--text-muted); margin-top: 4px; opacity: .85; }
.pg-filecard { display: grid; grid-template-columns: 28px 1fr auto; gap: 9px; align-items: center; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--indigo) 28%, var(--panel-border)); border-radius: 8px; background: var(--indigo-dim); }
.pg-filecard__icon { font-size: 19px; line-height: 1; }
.pg-filecard__body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pg-filecard__name { font-size: 12.5px; font-weight: 600; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pg-filecard__size { font-size: 10.5px; color: var(--text-muted); }
.pg-filecard__clear { background: transparent; border: none; padding: 5px; cursor: pointer; color: var(--text-muted); border-radius: 5px; display: flex; }
.pg-filecard__clear:hover:not(:disabled) { background: var(--red-dim); color: var(--red); }

/* Paperclip badge di card footer */
.pg-card__evidence-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 600; background: var(--surface-1); color: var(--text-muted); border: 1px solid var(--panel-border); }

/* Due date inline mini pill */
.pg-due-inline { display: inline-flex; padding: 0 5px; border-radius: 4px; font-size: 10.5px; font-weight: 500; }
.pg-due-inline--overdue { background: var(--red-dim); color: var(--red); }
.pg-due-inline--soon { background: var(--yellow-dim); color: var(--yellow); }
.pg-due-inline--normal { color: var(--text-muted); }
.pg-due-inline--none { opacity: 0.55; color: var(--text-muted); }

/* Alerts */
.alert { padding: 10px 13px; border-radius: 8px; font-size: 12.5px; line-height: 1.5; border: 1px solid var(--panel-border); margin-bottom: 14px; }
.alert strong { display: block; margin-bottom: 4px; color: var(--text-strong); font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.alert p { margin: 0; }
.alert--error { background: var(--red-dim); border-color: color-mix(in srgb, var(--red) 30%, var(--panel-border)); color: var(--red); }
.alert--error strong { color: var(--red); }
.alert--warn { background: var(--yellow-dim); border-color: color-mix(in srgb, var(--yellow) 30%, var(--panel-border)); color: var(--text-strong); }
.alert--muted { background: var(--surface-1); }

/* Detail panel */
.pg-overlay { position: fixed; inset: 0; background: rgba(15, 22, 30, .42); z-index: 80; animation: pgFade .15s ease-out; backdrop-filter: blur(2px); }
.pg-overlay.is-closing { animation: pgFadeOut .15s ease-in forwards; }
.pg-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 92vw; background: var(--panel); border-left: 1px solid var(--panel-border); z-index: 81; display: flex; flex-direction: column; animation: pgSlideIn .22s cubic-bezier(.2,.8,.2,1); box-shadow: -8px 0 28px rgba(0,0,0,.12); }
.pg-panel.is-closing { animation: pgSlideOut .16s ease-in forwards; }
.pg-panel__head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--panel-border); gap: 8px; background: var(--surface-1); }
.pg-panel__kicker { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-width: 0; }
.pg-panel__close { background: transparent; border: none; padding: 6px; border-radius: 6px; cursor: pointer; color: var(--text-muted); display: flex; }
.pg-panel__close:hover { background: var(--panel); color: var(--text-strong); }
.pg-panel__body { flex: 1; overflow-y: auto; padding: 18px 22px; }
.pg-panel__title { font-size: 18px; font-weight: 700; color: var(--text-strong); margin: 0 0 8px; letter-spacing: -0.015em; line-height: 1.35; }
.pg-panel__desc { font-size: 13px; color: var(--text); line-height: 1.6; margin: 0 0 16px; white-space: pre-wrap; }
.pg-panel__footer { border-top: 1px solid var(--panel-border); padding: 12px 18px; display: flex; gap: 8px; flex-wrap: wrap; background: var(--surface-1); }

.pg-section { margin-top: 20px; }
.pg-section__title { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 10px; }

.pg-meta { display: grid; grid-template-columns: 1fr; gap: 11px; padding: 13px 14px; background: var(--surface-1); border-radius: var(--radius-sm); font-size: 12.5px; margin: 0; border: 1px solid var(--panel-border); }
.pg-meta > div { display: grid; grid-template-columns: 80px 1fr; gap: 10px; align-items: start; }
.pg-meta dt { color: var(--text-muted); font-weight: 500; font-size: 11.5px; padding-top: 2px; }
.pg-meta dd { color: var(--text-strong); margin: 0; display: flex; flex-direction: column; gap: 2px; }
.pg-meta dd small { color: var(--text-muted); font-size: 11px; font-weight: 400; }
.pg-person { display: inline-flex; align-items: center; gap: 7px; font-weight: 500; }

.pg-timeline { list-style: none; padding: 0; margin: 0; position: relative; }
.pg-timeline::before { content: ''; position: absolute; left: 5px; top: 8px; bottom: 8px; width: 1px; background: var(--panel-border); }
.pg-timeline li { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 3px 0 9px; align-items: start; position: relative; }
.pg-timeline li:last-child { padding-bottom: 0; }
.pg-timeline__dot { width: 11px; height: 11px; border-radius: 50%; background: var(--panel); border: 2px solid var(--panel-border); margin-top: 2px; z-index: 1; }
.pg-timeline li.is-done .pg-timeline__dot { background: var(--green); border-color: var(--green); }
.pg-timeline li strong { display: block; font-size: 12.5px; font-weight: 600; color: var(--text-strong); }
.pg-timeline li:not(.is-done) strong { color: var(--text-muted); font-weight: 500; }
.pg-timeline li small { color: var(--text-muted); font-size: 11px; display: block; margin-top: 1px; }

.pg-inline-form { margin-top: 16px; padding: 12px; border: 1px solid var(--panel-border); border-radius: 8px; background: var(--surface-1); display: flex; flex-direction: column; gap: 8px; }
.pg-inline-form--danger { border-color: color-mix(in srgb, var(--red) 30%, var(--panel-border)); background: var(--red-dim); }
.pg-inline-form label { font-size: 11.5px; color: var(--text-muted); font-weight: 500; }
.pg-inline-form label small { font-weight: 400; opacity: 0.8; margin-left: 4px; }
.pg-inline-form textarea { width: 100%; resize: vertical; padding: 8px 10px; border: 1px solid var(--panel-border); border-radius: 6px; font-family: inherit; font-size: 12.5px; background: var(--panel); color: var(--text-strong); box-sizing: border-box; }
.pg-inline-form textarea:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
.pg-inline-form__actions { display: flex; gap: 8px; justify-content: flex-end; }

/* Form */
.pg-form { display: flex; flex-direction: column; gap: 13px; }
.pg-form__field { display: flex; flex-direction: column; gap: 5px; }
.pg-form__field > span { font-size: 11.5px; color: var(--text-muted); font-weight: 500; }
.pg-form input, .pg-form select, .pg-form textarea { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 7px; padding: 8px 11px; font-size: 13px; color: var(--text-strong); font-family: inherit; box-sizing: border-box; }
.pg-form input:focus, .pg-form select:focus, .pg-form textarea:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
.pg-form textarea { resize: vertical; min-height: 64px; }
.pg-form__row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 10px; }
.pg-form__row > * { min-width: 0; }
.pg-form__hint { font-size: 10.5px; color: var(--text-muted); font-style: italic; }

@keyframes pgFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pgFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes pgSlideIn { from { transform: translateX(28px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes pgSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(28px); opacity: 0; } }
`
