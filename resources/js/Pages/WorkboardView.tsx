import { useState, useEffect, useId, useRef } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import { usePage, Link } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import {
  HealthPill,
  SectionState,
  looksLikeAvatarUrl,
} from '../components/ui'
import type { Task, Program } from '../types'
import { api } from '../lib/api'
import { TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { TaskDetailModal } from '../components/TaskDetailModal'
import { ConditionReportModal } from '../components/ConditionReportModal'
import type { HealthAtTime } from '../components/ConditionReportModal'
import { getProgramHealthDisplay } from '../lib/programStatus'
import { priorityLabel, severityLabel } from '../lib/status'
import { scheduleOf, scheduleBucket, taskIsOverdue } from '../lib/taskSchedule'
import { PageHeader, Button } from '../design-system'
import { useIsPhone } from '../hooks/useIsPhone'
import WorkboardMobile from './WorkboardMobile'
import { Plus } from 'lucide-react'
import './WorkboardView.css'

type BoardMode = 'kanban' | 'by-program' | 'list' | 'blockers'
type TimeFilter = 'week' | 'overdue' | 'in-flight' | 'all'

// Lane Workboard — restructure 2026-05-25 (hapus drag, posisi mengikuti progress):
// - 3 lane visual: Belum Mulai / Berjalan / Selesai
// - Status DB BACKLOG/READY/IN_PROGRESS/COMPLETED dipertahankan — load-bearing
//   untuk metrik, ExecutionGrid, validasi fase perencanaan. IN_REVIEW = status
//   legacy (Execution tak punya review), dinormalisasi oleh progres.
//   Status underlying ditampilkan sebagai badge dalam lane (READY → "Siap").
// - Perpindahan lane di-derive dari progress (lihat TaskService::updateProgress).
// Board (kanban) di-organize per URGENSI JADWAL (bukan lifecycle) sejak
// 2026-06-25 — Overdue/At Risk/On Track/Not Started/Completed. Memberi "wadah"
// pada item telat/berisiko (yang dulu terkubur di lane "In Progress") & selaras
// kosakata Schedule di seluruh app. Bucket per item via scheduleBucket().
type ScheduleLane = { key: string; label: string; hint: string }
const getScheduleLanes = (): ScheduleLane[] => [
  { key: 'overdue',     label: i18n.t('Overdue'),     hint: i18n.t('Past due, delayed, or blocked — act now.') },
  { key: 'at-risk',     label: i18n.t('At Risk'),     hint: i18n.t('Behind on health or due soon — watch closely.') },
  { key: 'on-track',    label: i18n.t('On Track'),    hint: i18n.t('In progress and on schedule.') },
  { key: 'not-started', label: i18n.t('Not Started'), hint: i18n.t('Not started yet.') },
  { key: 'completed',   label: i18n.t('Completed'),   hint: i18n.t('Done.') },
]
const statusSlug = (status: string) => status.toLowerCase()

// Badge status underlying dalam lane. BLOCKED & COMPLETED sudah punya badge
// sendiri di CardFace (Terhambat / Tepat waktu), jadi di-skip di sini.
// Catatan: Execution TIDAK punya review/approval (beda dgn Assignments), jadi
// tidak ada badge "Menunggu Review". IN_REVIEW = status legacy yang dinormalisasi.
const getStatusBadgeId = (): Record<string, string> => ({
  READY: i18n.t('Ready'),
})

// Time-based filter helpers (Daily PIC Workspace)
function taskDueWithinDays(t: Task, days: number): boolean {
  if (!t.targetCompletion || t.status === 'COMPLETED') return false
  const diffDays = (new Date(t.targetCompletion).getTime() - Date.now()) / 86400000
  return diffDays >= 0 && diffDays <= days
}
function taskDueToday(t: Task): boolean {
  if (!t.targetCompletion || t.status === 'COMPLETED') return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(t.targetCompletion); target.setHours(0, 0, 0, 0)
  return target.getTime() === today.getTime()
}
function taskInFlight(t: Task): boolean {
  return t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW'
}
const getTimeFilterLabels = (): Record<TimeFilter, string> => ({
  week: i18n.t('Active This Week'),
  overdue: i18n.t('Overdue'),
  'in-flight': i18n.t('In Progress'),
  all: i18n.t('All'),
})

// ── Sub-components for smooth DnD ──────────────────────────────────────────

/** Pure presentational card — no DnD hooks. Used inside DragOverlay. */
function CardFace({
  item, className, normalizeHealthStatus, showProgCode = true, showWorkstream = true,
}: {
  item: Task
  className?: string
  normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED'
  // By-program view sudah menampilkan kode program di header section, jadi
  // konteks kode di kartu anak redundan → sembunyikan (cukup nama workstream).
  showProgCode?: boolean
  // Nama workstream disembunyikan bila program hanya punya 1 workstream
  // (label identik di tiap kartu = noise). Tetap tampil bila >1 (diskriminatif).
  showWorkstream?: boolean
}) {
  const { t } = useTranslation()
  const statusBadgeId = getStatusBadgeId()
  const health = normalizeHealthStatus(item.healthStatus ?? 'GREEN')
  const statusClass = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
  const progCode = showProgCode ? item.workstream?.program?.code : undefined
  const iniName  = showWorkstream ? item.workstream?.name : undefined
  const assigneeName = item.assignee?.name
  const assigneeInitials = assigneeName
    ? assigneeName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : ''
  return (
    <div className={['work-card', item.isBlocked ? 'work-card--blocked' : '', className ?? ''].filter(Boolean).join(' ')}>
      <div className="work-card__head">
        <span className={`work-card__dot work-card__dot--${item.priority.toLowerCase()}`} />
        <h4 className="work-card__title">{item.title}</h4>
      </div>
      {(progCode || iniName) && (
        <div className="work-card__context">
          {progCode && <span className="work-card__context-prog">{progCode}</span>}
          {progCode && iniName && <span className="work-card__context-sep">›</span>}
          {iniName && <span className="work-card__context-ini">{iniName}</span>}
        </div>
      )}
      <div className="progress-bar-track work-card__progress-track">
        <div className={`progress-bar-fill ${statusClass}`} style={{ width: `${item.percentComplete}%` }} />
      </div>
      <div className="work-card__footer">
        <span className="code-badge">{item.code}</span>
        {item.isBlocked && item.status !== 'COMPLETED' ? (
          <span
            className="work-card__blocked"
            title={item.blockedReason ?? t('Task blocked — needs intervention')}
          >⚠ {t('Blocked')}</span>
        ) : statusBadgeId[item.status] ? (
          <span className={`work-card__status-badge work-card__status-badge--${statusSlug(item.status)}`}>
            {statusBadgeId[item.status]}
          </span>
        ) : null}
        {item.status === 'COMPLETED' && item.targetCompletion && item.actualCompletion && (
          <span className={`work-card__ontime work-card__ontime--${new Date(item.actualCompletion) <= new Date(item.targetCompletion) ? 'ok' : 'late'}`}>
            {new Date(item.actualCompletion) <= new Date(item.targetCompletion) ? `✓ ${t('On time')}` : `⚠ ${t('Late')}`}
          </span>
        )}
        <span className="work-card__footer-meta">
          <span className="work-card__pct">{item.percentComplete}%</span>
          {assigneeName && (
            looksLikeAvatarUrl(item.assignee?.avatarUrl)
              ? <img className="work-card__avatar" src={item.assignee.avatarUrl} alt={assigneeName} title={assigneeName} aria-label={assigneeName} style={{ objectFit: 'cover' }} />
              : <span className="work-card__avatar" title={assigneeName} aria-label={assigneeName}>
                  {assigneeInitials}
                </span>
          )}
        </span>
      </div>
    </div>
  )
}

/** Clickable board card (no drag) — buka rincian kartu untuk ubah progress/status. */
function BoardCard({
  item, onClick, normalizeHealthStatus, showProgCode = true, showWorkstream = true,
}: {
  item: Task
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED'
  showProgCode?: boolean
  showWorkstream?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="work-card-shell work-card-shell--clickable"
    >
      <CardFace item={item} normalizeHealthStatus={normalizeHealthStatus} showProgCode={showProgCode} showWorkstream={showWorkstream} />
    </button>
  )
}

// scheduleOf/scheduleBucket/taskIsOverdue/ScheduleTone dipindah ke
// lib/taskSchedule (sumber tunggal, dipakai WorkboardMobile juga).

/** Baris task di bawah section program (By Program). Bukan kartu — flat,
 *  ber-indentasi di bawah header program → keanggotaan otomatis jelas. Rail
 *  kiri + pill = sinyal JADWAL (urgensi). */
function ProgramTaskRow({
  item, onClick, normalizeHealthStatus, showWorkstream,
}: {
  item: Task
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED'
  showWorkstream: boolean
}) {
  const sched = scheduleOf(item, normalizeHealthStatus)
  const health = normalizeHealthStatus(item.healthStatus ?? 'GREEN')
  const healthClass = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
  const assigneeName = item.assignee?.name
  const initials = assigneeName
    ? assigneeName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : ''
  const iniName = showWorkstream ? item.workstream?.name : undefined
  // Tenggat eksplisit di kolom kanan (sebelumnya tak tampil di baris). Merah bila
  // sudah lewat tempo. Tak ditampilkan untuk task yang sudah selesai.
  const dueLabel = item.status !== 'COMPLETED' && item.targetCompletion
    ? new Date(item.targetCompletion).toLocaleDateString(i18n.language?.startsWith('en') ? 'en-GB' : 'id-ID', { day: '2-digit', month: 'short' })
    : null
  const dueLate = taskIsOverdue(item)
  return (
    <button type="button" data-task-card="true" className={`wb-row wb-row--${sched.tone}`} onClick={onClick}>
      <span className="wb-row__rail" aria-hidden="true" />
      <div className="wb-row__body">
        <div className="wb-row__title">{item.title}</div>
        <div className="wb-row__meta">
          <span className="wb-row__code">{item.code}</span>
          {iniName && <span className="wb-row__ws">{iniName}</span>}
        </div>
      </div>
      {/* Kolom KONDISI — selalu dirender (kosong saat On Track / Selesai) supaya
          grid tetap sejajar dengan header program & baris lain. */}
      <span className="wb-row__cond">
        {sched.tone !== 'green' && sched.tone !== 'done' && (
          <span className={`wb-row__sched wb-row__sched--${sched.tone}`}>{sched.label}</span>
        )}
      </span>
      <div className="wb-row__progress">
        <div className="progress-bar-track wb-row__progress-track">
          <div className={`progress-bar-fill ${healthClass}`} style={{ width: `${item.percentComplete}%` }} />
        </div>
        <span className="wb-row__pct">{item.percentComplete}%</span>
      </div>
      <div className="wb-row__right">
        {dueLabel && <span className={`wb-row__due${dueLate ? ' wb-row__due--late' : ''}`}>{dueLabel}</span>}
        {assigneeName && (
          looksLikeAvatarUrl(item.assignee?.avatarUrl)
            ? <img className="wb-row__avatar" src={item.assignee.avatarUrl} alt={assigneeName} title={assigneeName} aria-label={assigneeName} style={{ objectFit: 'cover' }} />
            : <span className="wb-row__avatar" title={assigneeName} aria-label={assigneeName}>{initials}</span>
        )}
      </div>
    </button>
  )
}

export function WorkboardView() {
  const { t } = useTranslation()
  const SCHEDULE_LANES = getScheduleLanes()
  const TIME_FILTER_LABELS = getTimeFilterLabels()
  const {
    workGroups, workGroupsStatus, reloadTasks, blockers, programs,
    boardStatus,
    loadOverview,
    normalizeHealthStatus, formatStatusLabel,
    boardOnOpen, clearBoardOnOpen,
    currentUser,
  } = useWorkspace()

  const roleAccess = useRoleAccess()
  const { url } = usePage()
  const _navigate = useInertiaNavigate()

  // Drill-down filters from URL — set by Kapasitas Tim cards on Home
  const [boardFilterAssigneeId, setBoardFilterAssigneeId] = useState<number | null>(null)
  const [boardFilterOwnerUnitId, setBoardFilterOwnerUnitId] = useState<number | null>(null)

  // Read URL filters on first mount
  const didConsumeUrlFilter = useRef(false)
  useEffect(() => {
    if (didConsumeUrlFilter.current) return
    didConsumeUrlFilter.current = true
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    const pid = params.get('programId')
    if (pid) setBoardFilterProgramId(Number(pid))
    const aid = params.get('assigneeId')
    if (aid) setBoardFilterAssigneeId(Number(aid))
    const uid = params.get('ownerUnitId')
    if (uid) setBoardFilterOwnerUnitId(Number(uid))
  }, [url])

  // ?report={programId} — one-door entry from Programs. Separate + reactive so
  // an SPA re-nav to a different program re-triggers (the one-shot ref above
  // would swallow it). Permission is enforced by the modal via the server's
  // `canReport` (reflection-meta) — the lean `programs` prop here can't reliably
  // tell whether the user is a PIC, so we don't gate client-side.
  const handledReportRef = useRef<string | null>(null)
  useEffect(() => {
    const report = new URLSearchParams(url.split('?')[1] ?? '').get('report')
    if (!report) { handledReportRef.current = null; return }
    if (handledReportRef.current === report) return
    handledReportRef.current = report
    const rid = Number(report)
    setBoardMode('by-program')
    setBoardFilterProgramId(rid)
    setConditionProgramId(rid)
  }, [url])

  // Default myItemsOnly respects role: KADIV/KASUBDIV/BOD default to full view.
  // NOTE: saat hard-load /execution, currentUser (→role) belum termuat di render
  // pertama (provider set via effect), jadi useState ini menangkap default
  // peran-kosong (= My Tasks). Di-sync ulang ke default-sesuai-peran begitu peran
  // termuat (effect di bawah) — KECUALI user sudah memilih view sendiri.
  const [myItemsOnly, setMyItemsOnly] = useState(roleAccess.defaultMyItemsOnly)
  const userPickedViewRef = useRef(false)

  // Daily PIC Workspace: smart time filter (default 'week' = active work this week)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')

  // OFFICER: locked to myItemsOnly regardless of toggle
  const effectiveMyItemsOnly = roleAccess.myItemsLocked ? true : myItemsOnly
  const setEffectiveMyItemsOnly = (v: boolean) => {
    if (!roleAccess.myItemsLocked) {
      userPickedViewRef.current = true
      setMyItemsOnly(v)
    }
  }

  // Re-sync default begitu peran user termuat (lihat NOTE di atas). Hanya
  // berlaku selama user belum memilih view sendiri dan belum ada intent
  // navigasi (boardOnOpen) yang menandai pilihan.
  useEffect(() => {
    if (!roleAccess.role || userPickedViewRef.current) return
    setMyItemsOnly(roleAccess.defaultMyItemsOnly)
  }, [roleAccess.role, roleAccess.defaultMyItemsOnly])
  const [boardFilterProgramId, setBoardFilterProgramId] = useState<number | null>(null)
  const [boardFilterWorkstreamId, setBoardFilterWorkstreamId] = useState<number | null>(null)
  // Lane collapse state (keyed by lane.key). Default semua lane terbuka.
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(() => new Set())
  const toggleCollapsedCol = (laneKey: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev)
      if (next.has(laneKey)) next.delete(laneKey); else next.add(laneKey)
      return next
    })
  }

  // By Program: program On Track / Completed dilipat default (fokus ke yang
  // genting — At Risk/Terlambat tetap terbuka). Map pid→isCollapsed berisi
  // override eksplisit user; default di-derive dari health (green/completed).
  const [progCollapseOverride, setProgCollapseOverride] = useState<Record<number, boolean>>({})
  const defaultProgCollapsed = (slug?: string) => slug === 'green' || slug === 'completed'
  // Lane Completed dilipat default per program; expand on-demand (done = arsip,
  // bukan aksi harian → beri ruang ke In Progress / Not Started).
  const [expandedDoneLanes, setExpandedDoneLanes] = useState<Set<number>>(() => new Set())
  const toggleDoneLane = (pid: number) => setExpandedDoneLanes((prev) => {
    const next = new Set(prev)
    if (next.has(pid)) next.delete(pid); else next.add(pid)
    return next
  })

  // Default = By Program: unit akuntabilitas PIC adalah program (health,
  // % achievement, Report Condition semua di level program), bukan tumpukan
  // task lepas. Buka langsung ke konteks program. Board/List/Blockers tetap
  // tersedia sebagai mode alternatif.
  const [boardMode, setBoardMode] = useState<BoardMode>('by-program')


  // One-door condition reporting (modal target) + session memory of what the
  // user just reported per program (immediate badge feedback, no full reload).
  const [conditionProgramId, setConditionProgramId] = useState<number | null>(null)
  const [reportedThisSession, setReportedThisSession] = useState<Record<number, HealthAtTime>>({})

  // Fix 4: rollback error banner
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  // Consume boardOnOpen intent set by openTaskWorkspace (fixes 1, 2)
  useEffect(() => {
    if (!boardOnOpen) return
    // OFFICER is always locked to myItemsOnly — don't override even if forceShowAll
    if (boardOnOpen.forceShowAll && !roleAccess.myItemsLocked) {
      userPickedViewRef.current = true
      setMyItemsOnly(false)
    }
    if (boardOnOpen.filterProgramId !== null) setBoardFilterProgramId(boardOnOpen.filterProgramId)
    clearBoardOnOpen()
  }, [boardOnOpen, clearBoardOnOpen, roleAccess.myItemsLocked])

  // Fix 4: watch boardStatus for errors and show prominent banner
  useEffect(() => {
    const msg = boardStatus.message
    if (!msg) return
    const isError = msg.toLowerCase().includes('failed')
    if (isError) {
      setRollbackError(msg)
      const t = setTimeout(() => setRollbackError(null), 5000)
      return () => clearTimeout(t)
    }
  }, [boardStatus.message])

  // Task detail modal state — card click open modal (kesan "card expand")
  // alih-alih navigate full page. Origin rect dicapture untuk animation
  // FLIP-like expand dari card position.
  const [taskModalId, setTaskModalId] = useState<number | null>(null)
  const [taskModalOriginRect, setTaskModalOriginRect] = useState<DOMRect | null>(null)

  // Auto-open modal dari query param `?task={id}` saat mount. Dipakai untuk
  // deep link — URL /execution/tasks/{id} redirect ke /execution?task={id},
  // lalu Workboard auto-open modal supaya URL share tetap functional.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const taskParam = params.get('task')
    if (taskParam) {
      const id = parseInt(taskParam, 10)
      if (!Number.isNaN(id)) {
        // Tanpa originRect — animation start dari center (defensive fallback)
        setTaskModalId(id)
      }
    }
  }, [])

  const openTaskModal = (taskId: number, e: React.MouseEvent | React.KeyboardEvent) => {
    // Cari nearest card element supaya rect-nya akurat (target bisa anak elemen)
    const target = e.currentTarget as HTMLElement
    const card = target.closest('.work-card, .wi-row, [data-task-card]') as HTMLElement | null
    const rect = card ? card.getBoundingClientRect() : target.getBoundingClientRect()
    setTaskModalOriginRect(rect)
    setTaskModalId(taskId)
    // Sync URL — supaya deep link/back button work. pushState (bukan replaceState)
    // supaya browser back menutup modal (lihat popstate handler di bawah).
    const newUrl = `${window.location.pathname}?task=${taskId}`
    window.history.pushState({ taskModalId: taskId }, '', newUrl)
  }

  const closeTaskModal = () => {
    setTaskModalId(null)
    setTaskModalOriginRect(null)
    // Strip ?task= via replaceState — JANGAN pakai history.back() karena
    // Inertia intercept popstate dan refetch /execution → board reload
    // (visible flash). User klik X = local close, tidak boleh ada server roundtrip.
    const params = new URLSearchParams(window.location.search)
    params.delete('task')
    const qs = params.toString()
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '')
    window.history.replaceState(null, '', newUrl)
  }

  // Popstate handler — browser back button close modal kalau open
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const taskParam = params.get('task')
      if (taskParam) {
        const id = parseInt(taskParam, 10)
        if (!Number.isNaN(id)) {
          setTaskModalId(id)
          return
        }
      }
      // No task param — close modal
      setTaskModalId(null)
      setTaskModalOriginRect(null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const byProgram = (items: typeof workGroups[0]['items']) =>
    boardFilterProgramId
      ? items.filter(i => i.workstream?.program?.id === boardFilterProgramId)
      : items
  const byWorkstream = (items: typeof workGroups[0]['items']) =>
    boardFilterWorkstreamId
      ? items.filter(i => i.workstream?.id === boardFilterWorkstreamId)
      : items
  const byAssignee = (items: typeof workGroups[0]['items']) =>
    boardFilterAssigneeId
      ? items.filter(i => i.assignee?.id === boardFilterAssigneeId)
      : items
  const byOwnerUnit = (items: typeof workGroups[0]['items']) =>
    boardFilterOwnerUnitId
      ? items.filter(i => i.workstream?.program?.ownerUnitId === boardFilterOwnerUnitId)
      : items
  const applyBoardFilters = (items: typeof workGroups[0]['items']) =>
    byOwnerUnit(byAssignee(byWorkstream(byProgram(items))))

  const rawItems = workGroups.flatMap(g => g.items)
  const scopedItems = applyBoardFilters(
    effectiveMyItemsOnly ? rawItems.filter(i => i.assignee?.id === currentUser?.id) : rawItems
  )

  const matchesTimeFilter = (t: Task): boolean => {
    if (timeFilter === 'all') return true
    if (timeFilter === 'overdue') return taskIsOverdue(t)
    if (timeFilter === 'in-flight') return taskInFlight(t)
    return taskInFlight(t) || taskIsOverdue(t) || taskDueWithinDays(t, 7)
  }

  const allItems = scopedItems.filter(matchesTimeFilter)

  // ── By-Program view: group the user's in-scope tasks under their program,
  //    enriched with program metadata (health/progress/PIC) from the programs
  //    prop. Intentionally ignores the time-filter — a program command view
  //    shows the whole program, not just this week's slice. ──
  const programById = new Map<number, Program>(programs.map(p => [p.id, p]))
  const REPORT_LABEL: Record<HealthAtTime, string> = {
    on_track: t('On Track'), at_risk: t('At Risk'), terlambat: t('Delayed'), overdue: t('Overdue'),
  }
  const isAdminRole = ['SUPERADMIN', 'ADMIN'].includes(roleAccess.role ?? '')
  const canReportFor = (p?: Program) => {
    if (!p) return false
    if (isAdminRole) return true
    if (p.owner?.id === currentUser?.id) return true
    return (p.picPersons ?? []).some(pic => pic.id === currentUser?.id)
  }
  const programSections = (() => {
    const groups = new Map<number, Task[]>()
    for (const item of scopedItems) {
      const pid = item.workstream?.program?.id
      if (pid == null) continue
      if (!groups.has(pid)) groups.set(pid, [])
      groups.get(pid)!.push(item)
    }
    // A PIC must be able to report on their own program even when it has no
    // tasks in the current scope — otherwise the in-view Report button is
    // unreachable and they'd be forced to the deep-link. Bounded to the user's
    // own programs (owner/co-PIC), so admins don't get every program injected.
    const meId = currentUser?.id
    if (meId != null) {
      for (const pr of programs) {
        const mine = pr.owner?.id === meId || (pr.picPersons ?? []).some(pic => pic.id === meId)
        if (mine && !groups.has(pr.id)) groups.set(pr.id, [])
      }
    }
    // Urut per kondisi YANG DITAMPILKAN (getProgramHealthDisplay), bukan healthStatus
    // mentah — supaya program "Overdue" (lewat tanggal, health bisa GREEN) naik ke
    // atas sesuai pill merahnya & konsisten dgn defaultProgCollapsed.
    const rankSlug = (slug?: string) =>
      slug === 'overdue' ? 0 : slug === 'red' ? 1 : slug === 'yellow' ? 2 : slug === 'completed' ? 4 : 3
    return Array.from(groups.entries())
      .map(([pid, items]) => {
        const program = programById.get(pid)
        // "Selesai ≠ Overdue": program yang SEMUA task-nya COMPLETED diperlakukan
        // sebagai selesai — turun ke bawah & pill netral — walau program.status
        // belum di-flip ke COMPLETED dan targetEndDate lewat (akar: status
        // kontainer belum di-derive dari task). Mencegah program tuntas nangkring
        // merah "Overdue" di puncak (temuan utama audit UX Workboard).
        const effDone = items.length > 0 && items.every(i => i.status === 'COMPLETED')
        const baseSlug = program ? getProgramHealthDisplay(program).slug : undefined
        return { program, pid, items, _effDone: effDone, _slug: effDone ? 'completed' : baseSlug }
      })
      .sort((a, b) => {
        const ra = rankSlug(a._slug), rb = rankSlug(b._slug)
        if (ra !== rb) return ra - rb
        return (a.program?.code ?? '').localeCompare(b.program?.code ?? '')
      })
  })()

  // Bedakan "fetch /tasks gagal/masih jalan" dari "sukses tapi nol task" —
  // tanpa ini board menampilkan "No tasks match the current filter" yang
  // menyesatkan padahal datanya gagal dimuat (lihat bug board kosong di prod).
  const boardLoadFailed = workGroupsStatus.failed && workGroups.length === 0
  const boardLoading = workGroupsStatus.loading && workGroups.length === 0
  const boardReady = !boardLoadFailed && !boardLoading

  // Derive workstream options from loaded items, scoped by program filter if set
  const workstreamOptions = (() => {
    const seen = new Map<number, { id: number; name: string; programId: number | null }>()
    for (const item of rawItems) {
      const ini = item.workstream
      if (!ini?.id) continue
      const programId = ini.program?.id ?? null
      if (boardFilterProgramId && programId !== boardFilterProgramId) continue
      if (!seen.has(ini.id)) {
        seen.set(ini.id, { id: ini.id, name: ini.name ?? '', programId })
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

  // Reset workstream filter if the selected one is no longer valid under program filter
  useEffect(() => {
    if (!boardFilterWorkstreamId) return
    if (!workstreamOptions.some(o => o.id === boardFilterWorkstreamId)) {
      setBoardFilterWorkstreamId(null)
    }
  }, [boardFilterProgramId, boardFilterWorkstreamId, workstreamOptions])
  const blockedCount = allItems.filter(i => i.isBlocked || i.status === 'BLOCKED').length
  const completedCount = allItems.filter(i => i.status === 'COMPLETED').length
  const inFlightCount = allItems.filter(i => ['IN_PROGRESS', 'IN_REVIEW'].includes(i.status)).length

  // Daily summary counts — derive dari scopedItems (sebelum timeFilter), supaya
  // angka tetap akurat walau user lagi narrowed view
  const overdueCount = scopedItems.filter(taskIsOverdue).length
  const dueTodayCount = scopedItems.filter(taskDueToday).length
  const dueWeekCount = scopedItems.filter(t => taskDueWithinDays(t, 7)).length

  // ── Buat Work Item modal ───────────────────────────────────────────────
  const [showCreateWI, setShowCreateWI] = useState(false)
  const [closingWIOverlay, setClosingWIOverlay] = useState<string | null>(null)
  const createTaskDialogRef = useDialogFocus<HTMLDivElement>(showCreateWI || closingWIOverlay === 'create-wi')
  const createTaskTitleId = useId()
  const createTaskDescId = useId()
  const closeWIOverlay = (name: string, action: () => void) => {
    setClosingWIOverlay(name)
    setTimeout(() => { action(); setClosingWIOverlay(null) }, 150)
  }
  // Escape handler for showCreateWI defined after wiForm/wiSaving — lihat di bawah.

  type DirectoryUser = { id: number; name: string; positionTitle: string | null; roleType: string; unit?: { name: string } }
  type WorkstreamOption = { id: number; code: string; name: string; program?: { code: string; name: string } }
  const [wiWorkstreams, setWiWorkstreams] = useState<WorkstreamOption[]>([])
  const [wiUsers, setWiUsers] = useState<DirectoryUser[]>([])
  const defaultTaskDueDate = () => {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  }
  const [wiForm, setWiForm] = useState({
    workstreamId: '', title: '', description: '',
    status: 'BACKLOG', priority: 'MEDIUM', assignedTo: '', targetCompletion: defaultTaskDueDate(),
  })
  const [wiSaving, setWiSaving] = useState(false)
  const [wiError, setWiError] = useState<string | null>(null)
  useEscKey(() => {
    if (wiSaving) return
    const wiDirty = wiForm.workstreamId !== '' || wiForm.title !== '' || wiForm.description !== '' ||
      wiForm.status !== 'BACKLOG' || wiForm.priority !== 'MEDIUM' || wiForm.assignedTo !== ''
    if (wiDirty && !window.confirm(t('Discard unsaved changes?'))) return
    closeWIOverlay('create-wi', () => { setShowCreateWI(false); setWiError(null) })
  }, showCreateWI || closingWIOverlay === 'create-wi')

  const openCreateWI = async () => {
    setShowCreateWI(true)
    try {
      const [iniRes, usrRes] = await Promise.all([
        api.get<{ data: WorkstreamOption[] }>('/workstreams'),
        api.get<{ data: DirectoryUser[] }>('/users/directory'),
      ])
      setWiWorkstreams(iniRes.data ?? [])
      setWiUsers(usrRes.data ?? [])
    } catch { /* non-critical — selects will be empty */ }
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; page: string }>).detail
      if (detail?.id === 'task.new') void openCreateWI()
    }
    window.addEventListener(TOPBAR_ACTION_EVENT, handler)
    return () => window.removeEventListener(TOPBAR_ACTION_EVENT, handler)
  }, [])

  const closeCreateWI = () => closeWIOverlay('create-wi', () => {
    setShowCreateWI(false)
    setWiError(null)
    setWiForm({ workstreamId: '', title: '', description: '', status: 'BACKLOG', priority: 'MEDIUM', assignedTo: '', targetCompletion: defaultTaskDueDate() })
  })

  const submitCreateWI = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setWiSaving(true)
    setWiError(null)
    try {
      await api.post('/tasks', {
        workstreamId: Number(wiForm.workstreamId),
        title: wiForm.title.trim(),
        description: wiForm.description.trim() || undefined,
        status: wiForm.status,
        priority: wiForm.priority,
        targetCompletion: wiForm.targetCompletion,
        assignedTo: wiForm.assignedTo ? Number(wiForm.assignedTo) : undefined,
      })
      closeCreateWI()
      await loadOverview('refresh')
    } catch (err: unknown) {
      setWiError((err as { message?: string })?.message ?? t('Failed to create task.'))
    } finally {
      setWiSaving(false)
    }
  }

  return (
    <div className="ds workboard-v2 view-workboard">
      {/* `ds-stagger`: Phase 3 motion standardization. Inline modals (Create WI,
          wb-prompt-modal) di-render OUTSIDE workboard-v2__inner — sibling level —
          jadi tidak ter-scope ke containing block animasi. Modal-safe. */}
      <div className="workboard-v2__inner ds-stagger">
      {/* ── Page header (design-system PageHeader — standardisasi 2026-05-26) ──
          CTA "New Task" hidup DI HALAMAN (page owns its CTA), bukan di topbar —
          selaras ProgramsView; /execution sengaja dikeluarkan dari TOPBAR_ACTIONS
          (lihat catatan di topbar-config.ts). Tombol di-gate utk peran non-
          monitoring (read-only direktorat tak membuat tugas). */}
      <PageHeader
        title={t('Workboard')}
        subtitle={
          roleAccess.isMonitoringOnly
            ? t('Track Program tasks & blockers across your directorate.')
            : roleAccess.isOfficer
            ? t('Program tasks assigned to you.')
            : t('Tasks from work Programs — part of the approved plan.')
        }
        actions={
          <>
            {boardStatus.message ? (
              <div className={`board-status-msg${boardStatus.message.includes('failed') ? ' board-status-msg--error' : ''}`}>
                {boardStatus.saving ? <span className="spinner" /> : null}
                {boardStatus.message}
              </div>
            ) : null}
            {/* Gate ke canCreateProgram (mirror BE TaskController::store →
                RolePolicy::canCreateProgram). `!isMonitoringOnly` lama keliru:
                ASISTEN/OFFICER ikut melihat tombol padahal BE 403 sejak
                pengetatan author-plan 26 Jun → CTA mati untuk mereka. */}
            {roleAccess.canCreateProgram && (
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Plus size={15} aria-hidden="true" />}
                onClick={() => void openCreateWI()}
              >
                {t('New Task')}
              </Button>
            )}
          </>
        }
      />

      {/* ── Filters + state row: toggles + selects + stats ── */}
      <div className="view-toolbar wb-toolbar-filters">
        <div className="view-toggle">
          {(['kanban', 'by-program', 'list', 'blockers'] as BoardMode[]).map(mode => (
            <button className={`view-toggle-btn${boardMode === mode ? ' active' : ''}`} key={mode} onClick={() => setBoardMode(mode)}>
              {mode === 'kanban' ? `⬜ ${t('Board')}` : mode === 'by-program' ? `▤ ${t('By Program')}` : mode === 'list' ? `≡ ${t('List')}` : `⚑ ${t('Blockers')}`}
            </button>
          ))}
        </div>
        {/* BOD: monitoring badge only — no filter toggle */}
        {roleAccess.isMonitoringOnly ? (
          <span className="role-monitoring-badge">{t('Monitoring')}</span>
        ) : (
          <div className="view-toggle wb-view-toggle">
            <button
              className={`view-toggle-btn${effectiveMyItemsOnly ? ' active' : ''}`}
              onClick={() => setEffectiveMyItemsOnly(true)}
            >
              {t('My Tasks')}
            </button>
            <button
              className={`view-toggle-btn${!effectiveMyItemsOnly ? ' active' : ''}`}
              onClick={() => setEffectiveMyItemsOnly(false)}
              disabled={roleAccess.myItemsLocked}
              title={roleAccess.myItemsLocked ? t('Support mode: view is limited to your tasks') : t('Show tasks across your team')}
            >
              {t('Team')}
            </button>
          </div>
        )}
        {/* Daily PIC Workspace: time filter chips. Disembunyikan di By Program —
            view itu sengaja menampilkan seluruh program (mengabaikan time
            filter), jadi chip ini akan jadi dead control di sana. */}
        {!roleAccess.isMonitoringOnly && boardMode !== 'by-program' && (
          <div className="view-toggle wb-time-filter">
            {(['week', 'overdue', 'in-flight', 'all'] as TimeFilter[]).map(tf => (
              <button
                key={tf}
                className={`view-toggle-btn${timeFilter === tf ? ' active' : ''}`}
                onClick={() => setTimeFilter(tf)}
                title={tf === 'week' ? t('In-flight + due ≤ 7 days + overdue') : undefined}
              >
                {TIME_FILTER_LABELS[tf]}
              </button>
            ))}
          </div>
        )}
        {/* Program filter */}
        <select
          className="wb-program-filter"
          value={boardFilterProgramId ?? ''}
          onChange={e => setBoardFilterProgramId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('All Programs')}</option>
          {programs.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
        {/* Workstream / Workstream filter */}
        <select
          className="wb-program-filter"
          value={boardFilterWorkstreamId ?? ''}
          onChange={e => setBoardFilterWorkstreamId(e.target.value ? Number(e.target.value) : null)}
          disabled={workstreamOptions.length === 0}
          title={t('Filter by workstream')}
        >
          <option value="">{t('All Workstreams')}</option>
          {workstreamOptions.map(ini => (
            <option key={ini.id} value={ini.id}>{ini.name}</option>
          ))}
        </select>
        <div className="view-toolbar__right">
          <div className="view-toolbar__stats wb-stats wb-daily-summary">
            {/* Ringkasan = DISPLAY-ONLY (konsisten span semua). Penyaringan ada di
                kontrol time-filter terpisah; chip sbg tombol dulu bikin sebagian
                klikable & sebagian mati (dead di By-Program) — membingungkan. */}
            <span
              className={`wb-summary-stat wb-summary-stat--overdue${overdueCount === 0 ? ' is-zero' : ''}`}
              title={t('Task past due & not completed')}
            >
              <span className="wb-summary-stat__num">{overdueCount}</span>
              <em>{t('overdue')}</em>
            </span>
            <span
              className={`wb-summary-stat wb-summary-stat--today${dueTodayCount === 0 ? ' is-zero' : ''}`}
              title={t('Tasks due today')}
            >
              <span className="wb-summary-stat__num">{dueTodayCount}</span>
              <em>{t('today')}</em>
            </span>
            <span
              className={`wb-summary-stat wb-summary-stat--week${dueWeekCount === 0 ? ' is-zero' : ''}`}
              title={t('Tasks due in the next 7 days')}
            >
              <span className="wb-summary-stat__num">{dueWeekCount}</span>
              <em>{t('due soon')}</em>
            </span>
            <span className="wb-summary-stat">
              <span className="wb-summary-stat__num">{inFlightCount}</span>
              <em>{t('in progress')}</em>
            </span>
            {blockedCount > 0 && (
              <span className="wb-summary-stat wb-stats__blocked">
                <span className="wb-summary-stat__num">{blockedCount}</span>
                <em>{t('blocked')}</em>
              </span>
            )}
            <span className="wb-summary-stat">
              <span className="wb-summary-stat__num">{completedCount}</span>
              <em>{t('completed')}</em>
            </span>
          </div>
        </div>
      </div>

      {/* Fix 4: prominent rollback error banner */}
      {rollbackError ? (
        <div className="board-rollback-banner" role="alert">
          <span className="board-rollback-banner__icon">⚠</span>
          <span className="board-rollback-banner__msg">{rollbackError}</span>
          <span className="board-rollback-banner__sub">{t('Card was returned to its original position.')}</span>
          <button className="board-rollback-banner__close" onClick={() => setRollbackError(null)} aria-label={t('Close')}>×</button>
        </div>
      ) : null}

      <div className="workboard-workspace">
        {/* ── Main board ───────────────────────── */}
        <div className="workboard-main">
          {boardLoading && (
            <SectionState icon="⏳" title={t('Loading tasks…')} text={t('Fetching Program tasks across your directorate.')} />
          )}
          {boardLoadFailed && (
            <SectionState
              tone="warning"
              icon="⚠️"
              title={t("Couldn't load tasks")}
              text={t('The task list failed to load (the request may have timed out). Your data is safe — this is a loading issue, not missing tasks.')}
              cta={{ label: t('Try again'), onClick: () => void reloadTasks() }}
            />
          )}
          {boardReady && boardMode === 'kanban' && allItems.length === 0 ? (
            <SectionState
              icon="✨"
              title={
                effectiveMyItemsOnly
                  ? (timeFilter === 'week' ? t("You're free this week") : t('No active tasks'))
                  : t('No tasks match the current filter')
              }
              text={
                effectiveMyItemsOnly && timeFilter === 'week'
                  ? t("No overdue, due-in-7-days, or in-flight tasks assigned to you. Click 'All' to see everything, or toggle to team tasks.")
                  : effectiveMyItemsOnly
                  ? t("None of your tasks match. Try changing the time filter or toggle to 'All'.")
                  : t("No tasks match the current filter. Change the time preset or the program/workstream filter.")
              }
            />
          ) : null}
          {boardReady && boardMode === 'kanban' && allItems.length > 0 && (
            <div className="kanban-board kanban-board--lanes">
              {(() => {
                // Bucket allItems per kolom urgensi (Overdue/At Risk/On Track/
                // Not Started/Completed) — sumbu Schedule, bukan lifecycle.
                const byBucket = new Map<string, Task[]>()
                for (const it of allItems) {
                  const b = scheduleBucket(it, normalizeHealthStatus)
                  const arr = byBucket.get(b)
                  if (arr) arr.push(it); else byBucket.set(b, [it])
                }
                return SCHEDULE_LANES.map((lane) => {
                const items = byBucket.get(lane.key) ?? []
                const isCollapsed = collapsedCols.has(lane.key)
                return (
                  <div
                    key={lane.key}
                    className={`kanban-col${isCollapsed ? ' kanban-col--collapsed' : ''}`}
                  >
                    <button
                      type="button"
                      className={`kanban-col__header kanban-col__header--toggle kanban-col__header--${lane.key}`}
                      onClick={() => toggleCollapsedCol(lane.key)}
                      aria-expanded={!isCollapsed}
                      title={isCollapsed ? t('Expand lane') : t('Collapse lane')}
                    >
                      <div className="kanban-col__label-row">
                        <span className="kanban-col__caret" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                        <span className="kanban-col__label">{lane.label}</span>
                        <span
                          className="kanban-col__info"
                          title={lane.hint}
                          aria-label={t('About the {{lane}} lane', { lane: lane.label })}
                          onClick={(e) => e.stopPropagation()}
                        >ⓘ</span>
                      </div>
                      <span className="section-badge">{items.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="kanban-col__body">
                        {items.map((item) => (
                          <BoardCard
                            key={item.id}
                            item={item}
                            onClick={(e) => openTaskModal(item.id, e)}
                            normalizeHealthStatus={normalizeHealthStatus}
                          />
                        ))}
                        {items.length === 0 && (
                          <div className="kanban-col__empty kanban-col__empty--dashed">{lane.hint}</div>
                        )}
                      </div>
                    )}
                  </div>
                )
                })
              })()}
            </div>
          )}

          {boardReady && boardMode === 'by-program' && programSections.length === 0 ? (
            <SectionState icon="✨" title={t('No programs match the current filter')} text={t('Adjust the program / workstream filter, or toggle to All tasks.')} />
          ) : null}
          {boardReady && boardMode === 'by-program' && programSections.length > 0 && (
            <div className="wb-prog-list">
              {programSections.map(({ program, pid, items, _effDone }) => {
                const baseCond = program ? getProgramHealthDisplay(program) : null
                // Program tuntas → pill netral "Completed" (bukan Overdue merah).
                const cond = _effDone && baseCond
                  ? { ...baseCond, label: t('Completed'), slug: 'completed', tone: 'selesai' as const, isOverdue: false }
                  : baseCond
                const reported = reportedThisSession[pid]
                const done = items.filter(i => i.status === 'COMPLETED').length
                const overdue = items.filter(taskIsOverdue).length
                // Pelaksana (asisten/officer) lapor progres/eksekusi LANGSUNG dari
                // card task di sini — bukan lewat masuk ke Programs. Auto-collapse
                // program "On Track" (default manajer untuk triage lintas-program)
                // menyembunyikan card task milik user → jalur lapornya buntu. Jadi:
                // jangan collapse-by-default bila view "Tugas Saya" aktif atau bila
                // program ini punya task aktif yang di-assign ke user.
                const hasMyActiveTask = items.some(
                  i => i.status !== 'COMPLETED' && i.assignee?.id === currentUser?.id,
                )
                const collapsed = progCollapseOverride[pid]
                  ?? (_effDone ? true : effectiveMyItemsOnly || hasMyActiveTask ? false : defaultProgCollapsed(cond?.slug))
                const doneExpanded = expandedDoneLanes.has(pid)
                // Nama workstream cuma berguna bila program punya >1 workstream.
                const multiWorkstream = new Set(items.map(i => i.workstream?.id).filter(Boolean)).size > 1
                // Urut baris per urgensi JADWAL (the "wadah": Overdue/Blocked/Delayed
                // → At Risk → On Track → Not Started). Completed dipisah ke bawah &
                // dilipat default (arsip, bukan aksi harian).
                const activeItems = items
                  .filter(i => i.status !== 'COMPLETED')
                  .sort((a, b) => {
                    const r = scheduleOf(a, normalizeHealthStatus).rank - scheduleOf(b, normalizeHealthStatus).rank
                    if (r !== 0) return r
                    // tiebreak: tenggat terdekat dulu, lalu kode (urutan stabil & terbaca)
                    const da = a.targetCompletion ? new Date(a.targetCompletion).getTime() : Infinity
                    const db = b.targetCompletion ? new Date(b.targetCompletion).getTime() : Infinity
                    if (da !== db) return da - db
                    return (a.code ?? '').localeCompare(b.code ?? '')
                  })
                const doneItems = items.filter(i => i.status === 'COMPLETED')
                return (
                  <section className={`wb-prog${collapsed ? ' wb-prog--collapsed' : ''}`} key={pid}>
                    {/* Header = grid 5 kolom (caret · id+jumlah · kondisi · progres ·
                        aksi). Kolom kondisi & progres sejajar dengan baris task di
                        bawahnya (var --wb-grid) → mata punya jangkar vertikal. */}
                    <header className="wb-prog__head">
                      <button
                        type="button"
                        className="wb-prog__toggle"
                        onClick={() => setProgCollapseOverride(prev => ({ ...prev, [pid]: !collapsed }))}
                        aria-expanded={!collapsed}
                        title={collapsed ? t('Expand program') : t('Collapse program')}
                      >
                        <span className="wb-prog__caret" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                      </button>
                      <div className="wb-prog__id">
                        <div className="wb-prog__title-row">
                          <span className="wb-prog__code">{program?.code ?? `#${pid}`}</span>
                          <span className="wb-prog__counts">
                            <span>{t('{{count}} tasks', { count: items.length })}</span>
                            <span className="wb-prog__count-done">{done} {t('done')}</span>
                            {overdue > 0 && <span className="wb-prog__count-overdue">{overdue} {t('overdue')}</span>}
                          </span>
                          {reported && (
                            <span className="wb-prog__reported" title={t('What you reported this week')}>
                              {t('Reported')}: {REPORT_LABEL[reported]}
                            </span>
                          )}
                        </div>
                        <h3 className="wb-prog__name">{program?.name ?? t('Unknown program')}</h3>
                      </div>
                      <span className="wb-prog__cond-cell">
                        {cond && <span className={`wb-prog__cond wb-prog__cond--${cond.slug}`}>{cond.label}</span>}
                      </span>
                      <div className="wb-prog__progress">
                        <div className="progress-bar-track wb-prog__progress-track">
                          <div className="progress-bar-fill" style={{ width: `${program?.progressPercent ?? 0}%` }} />
                        </div>
                        <span className="wb-prog__progress-val">{program?.progressPercent ?? 0}%</span>
                      </div>
                      <div className="wb-prog__actions">
                        {canReportFor(program) && (
                          <Button variant="primary" size="sm" onClick={() => setConditionProgramId(pid)}>
                            {t('Report Condition')}
                          </Button>
                        )}
                        <Link href={`/programs/${pid}`} className="wb-prog__plan-link">
                          {roleAccess.canEditProgram(program?.owner?.id === currentUser?.id) ? t('Edit plan') : t('View')} →
                        </Link>
                      </div>
                    </header>
                    {!collapsed && (
                    <div className="wb-prog__rows">
                      {activeItems.length === 0 && doneItems.length === 0 && (
                        <div className="wb-prog__empty">{t('No tasks in this program yet.')}</div>
                      )}
                      {activeItems.map(item => (
                        <ProgramTaskRow
                          key={item.id}
                          item={item}
                          onClick={(e) => openTaskModal(item.id, e)}
                          normalizeHealthStatus={normalizeHealthStatus}
                          showWorkstream={multiWorkstream}
                        />
                      ))}
                      {doneItems.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="wb-prog__done-toggle"
                            onClick={() => toggleDoneLane(pid)}
                            aria-expanded={doneExpanded}
                          >
                            <span aria-hidden="true">{doneExpanded ? '▾' : '▸'}</span>
                            {doneExpanded ? `${t('Completed')} · ${doneItems.length}` : t('Show {{count}} completed', { count: doneItems.length })}
                          </button>
                          {doneExpanded && doneItems.map(item => (
                            <ProgramTaskRow
                              key={item.id}
                              item={item}
                              onClick={(e) => openTaskModal(item.id, e)}
                              normalizeHealthStatus={normalizeHealthStatus}
                              showWorkstream={multiWorkstream}
                            />
                          ))}
                        </>
                      )}
                    </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}

          {boardReady && boardMode === 'list' && (
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{myItemsOnly ? t('My Tasks') : t('All Tasks')}</h3>
                <span className="badge">{t('{{count}} tasks', { count: allItems.length })}</span>
              </div>
              <div className="wi-list">
                {allItems.map((item) => (
                  <button
                    className="wi-list-row"
                    key={item.id}
                    onClick={(e) => openTaskModal(item.id, e)}
                  >
                    <div className="wi-list-row__left">
                      <span className="code-badge">{item.code}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <span className="text-muted text-sm">{item.workstream?.name ?? t('No workstream yet')}</span>
                      </div>
                    </div>
                    <div className="wi-list-row__right">
                      <span className={`status-dot-label status-dot-label--${statusSlug(item.status)}`}>
                        {formatStatusLabel(item.status)}
                      </span>
                      <span className={`priority-badge priority-badge--${item.priority.toLowerCase()}`}>{priorityLabel(item.priority)}</span>
                      <HealthPill status={normalizeHealthStatus(item.healthStatus ?? 'GREEN')} />
                      {item.isBlocked ? <span className="severity-badge severity-badge--high">⚑</span> : null}
                      <div className="progress-bar progress-bar--inline">
                        <div className="progress-bar__fill" style={{ width: `${item.percentComplete}%` }} />
                      </div>
                      <span className="text-muted text-sm">{item.percentComplete}%</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {boardReady && boardMode === 'blockers' && (() => {
            // Scope blocker SAMA spt task: My Tasks (assignedTo), filter program/
            // workstream (via blocker.task). + konteks program & klik-ke-task —
            // dulu tab ini abaikan semua filter & barisnya mati (tak bisa diklik).
            const scopedBlockers = blockers
              .filter(b => effectiveMyItemsOnly ? b.assignedTo === currentUser?.id : true)
              .filter(b => boardFilterProgramId ? b.task?.workstream?.program?.id === boardFilterProgramId : true)
              .filter(b => boardFilterWorkstreamId ? b.task?.workstream?.id === boardFilterWorkstreamId : true)
            return (
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{t('Blocker Tracker')}</h3>
                <span className="badge badge--red">{t('{{count}} blockers', { count: scopedBlockers.length })}</span>
              </div>
              {scopedBlockers.length > 0 ? (
                <div className="blocker-list">
                  {scopedBlockers.map((blocker) => {
                    const prog = blocker.task?.workstream?.program
                    const tid = blocker.taskId ?? blocker.task?.id
                    const body = (
                      <>
                        <div className="blocker-row__left">
                          <span className={`severity-badge severity-badge--${blocker.severity.toLowerCase()}`}>
                            {severityLabel(blocker.severity)}
                          </span>
                          <div>
                            <strong>{blocker.code}</strong>
                            <p>{blocker.title}</p>
                            {(prog || blocker.task) && (
                              <span className="blocker-row__context">
                                {prog && <span className="blocker-row__prog">{prog.code}</span>}
                                {prog && blocker.task && <span className="blocker-row__sep"> › </span>}
                                {blocker.task && <span>{blocker.task.title}</span>}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="badge">{formatStatusLabel(blocker.status)}</span>
                      </>
                    )
                    return tid ? (
                      <button type="button" className="blocker-row blocker-row--clickable" key={blocker.id} onClick={(e) => openTaskModal(tid, e)}>
                        {body}
                      </button>
                    ) : (
                      <div className="blocker-row" key={blocker.id}>{body}</div>
                    )
                  })}
                </div>
              ) : (
                <SectionState icon="✅" title={t('No blockers')} text={effectiveMyItemsOnly ? t('No blockers on your tasks right now.') : t('No blockers recorded at this time.')} />
              )}
            </div>
            )
          })()}
        </div>

      </div>

      </div>
      {/* ── Modal: Buat Work Item ────────────────────────────────────── */}
      {(showCreateWI || closingWIOverlay === 'create-wi') && (
        <div
          className={`modal-backdrop${closingWIOverlay === 'create-wi' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !wiSaving && closeCreateWI()}
        >
          <div aria-describedby={createTaskDescId} aria-labelledby={createTaskTitleId} aria-modal="true" className="modal modal--wide" ref={createTaskDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{t('Execution')}</span>
                <h3 className="modal__title" id={createTaskTitleId}>{t('New Task')}</h3>
                <p className="modal-subtitle" id={createTaskDescId}>
                  {t('Create a new work item with clear workstream context, priority, and owner so execution stays tidy.')}
                </p>
                <p className="modal-cross-hint">
                  {t('Not part of a Program? Create it as an')} <Link href="/penugasan">{t('Assignment →')}</Link>
                </p>
              </div>
              <button
                aria-label={t('Close')}
                className="modal__close"
                disabled={wiSaving}
                onClick={closeCreateWI}
                type="button"
              >
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
                  <path d="m1 1 10 10M11 1 1 11" />
                </svg>
              </button>
            </div>
            <form onSubmit={submitCreateWI}>
              <div className="modal__body">
                {wiError && <div className="wb-modal-error">{wiError}</div>}
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>{t('Work Context')}</h4>
                    <p>{t('Link the task to the right workstream and give it a title specific enough for the action owner.')}</p>
                  </div>
                  <div className="form-field">
                    <label>{t('Workstream')} <span className="form-field__required">*</span></label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, workstreamId: e.target.value }))}
                      required
                      value={wiForm.workstreamId}
                    >
                      <option value="">{t('Select a workstream…')}</option>
                      {wiWorkstreams.map(ini => (
                        <option key={ini.id} value={ini.id}>
                          {ini.program ? `${ini.program.code} › ` : ''}{ini.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{t('Title')} <span className="form-field__required">*</span></label>
                    <input
                      maxLength={120}
                      minLength={3}
                      onChange={e => setWiForm(f => ({ ...f, title: e.target.value }))}
                      placeholder={t('Task title')}
                      required
                      type="text"
                      value={wiForm.title}
                    />
                  </div>
                  <div className="form-field">
                    <label>{t('Description')}</label>
                    <textarea
                      className="composer__input wb-modal-textarea"
                      maxLength={400}
                      onChange={e => setWiForm(f => ({ ...f, description: e.target.value }))}
                      placeholder={t('Brief description (optional)')}
                      rows={2}
                      value={wiForm.description}
                    />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>{t('Execution')}</h4>
                    <p>{t('Set the initial status and assignee so this item is ready to track from the board.')}</p>
                  </div>
                  <div className="form-field">
                    <label>{t('Status')}</label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, status: e.target.value }))}
                      value={wiForm.status}
                    >
                      {/* Hanya state awal yang sah utk task baru. BLOCKED butuh
                          alasan; IN_REVIEW tak ada di Execution; COMPLETED @0%
                          = kartu inkonsisten (posisi lane di-derive dari progress). */}
                      <option value="BACKLOG">{t('Backlog')}</option>
                      <option value="READY">{t('Ready')}</option>
                      <option value="IN_PROGRESS">{t('In Progress')}</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{t('Assignee')}</label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, assignedTo: e.target.value }))}
                      value={wiForm.assignedTo}
                    >
                      <option value="">{t('— Unassigned —')}</option>
                      {wiUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}{u.positionTitle ? ` · ${u.positionTitle}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{t('Deadline')} <span className="form-field__required">*</span></label>
                    <input
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, targetCompletion: e.target.value }))}
                      required
                      type="date"
                      value={wiForm.targetCompletion}
                    />
                  </div>
                </section>
              </div>
              <div className="modal__footer">
                <button
                  className="btn btn--ghost"
                  disabled={wiSaving}
                  onClick={closeCreateWI}
                  type="button"
                >
                  {t('Cancel')}
                </button>
                <button
                  className="profile-save-btn"
                  disabled={wiSaving || !wiForm.workstreamId || !wiForm.title.trim() || !wiForm.targetCompletion}
                  type="submit"
                >
                  {wiSaving ? t('Saving…') : t('Create Task')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task detail modal — single surface untuk detail task. Full page
          /execution/tasks/{id} di-redirect server-side ke /execution?task={id}
          dan auto-open modal (lihat useEffect parse query param). */}
      {taskModalId !== null && (
        <TaskDetailModal
          taskId={taskModalId}
          originRect={taskModalOriginRect}
          onClose={closeTaskModal}
        />
      )}

      {conditionProgramId !== null && (() => {
        const pid = conditionProgramId
        const prog = programById.get(pid)
        const cond = prog ? getProgramHealthDisplay(prog) : null
        return (
          <ConditionReportModal
            programId={pid}
            programCode={prog?.code ?? `#${pid}`}
            programName={prog?.name ?? ''}
            autoHealthLabel={cond?.label}
            onClose={() => setConditionProgramId(null)}
            onSaved={(_period, health) => {
              setReportedThisSession(prev => ({ ...prev, [pid]: health }))
              void loadOverview('refresh')
            }}
          />
        )
      })()}
    </div>
  )
}

/* Wrapper responsif: phone (≤640) → board mobile-native; desktop → board penuh.
   Child di-mount kondisional sehingga hook WorkboardView berat tak jalan di
   phone. Lihat pola sama di ProgramsView (ProgramsViewResponsive). */
export default function WorkboardViewResponsive() {
  const isPhone = useIsPhone()
  return isPhone ? <WorkboardMobile /> : <WorkboardView />
}
