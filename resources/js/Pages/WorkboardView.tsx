import { useState, useEffect, useId, useRef } from 'react'
import type { FormEvent } from 'react'
import { usePage, Link } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import {
  HealthPill,
  SectionState,
} from '../components/ui'
import type { Task } from '../types'
import { api } from '../lib/api'
import { TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { TaskDetailModal } from '../components/TaskDetailModal'
import { PageHeader } from '../design-system'
import './WorkboardView.css'

type BoardMode = 'kanban' | 'list' | 'blockers'
type TimeFilter = 'week' | 'overdue' | 'in-flight' | 'all'

// Lane Workboard — restructure 2026-05-25 (hapus drag, posisi mengikuti progress):
// - 3 lane visual: Belum Mulai / Berjalan / Selesai
// - Status DB BACKLOG/READY/IN_PROGRESS/COMPLETED dipertahankan — load-bearing
//   untuk metrik, ExecutionGrid, validasi fase perencanaan. IN_REVIEW = status
//   legacy (Execution tak punya review), dinormalisasi oleh progres.
//   Status underlying ditampilkan sebagai badge dalam lane (READY → "Siap").
// - Perpindahan lane di-derive dari progress (lihat TaskService::updateProgress).
type Lane = { key: string; label: string; statuses: string[]; hint: string }
const LANES: Lane[] = [
  {
    key: 'todo',
    label: 'Not Started',
    statuses: ['BACKLOG', 'READY'],
    hint: 'Task not started yet. Enter progress in the card detail to begin.',
  },
  {
    key: 'doing',
    label: 'In Progress',
    statuses: ['IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'],
    hint: 'Task is actively being worked on or blocked.',
  },
  {
    key: 'done',
    label: 'Completed',
    statuses: ['COMPLETED'],
    hint: 'Task done (100% progress or approved by reviewer).',
  },
]
const statusSlug = (status: string) => status.toLowerCase()

// Badge status underlying dalam lane. BLOCKED & COMPLETED sudah punya badge
// sendiri di CardFace (Terhambat / Tepat waktu), jadi di-skip di sini.
// Catatan: Execution TIDAK punya review/approval (beda dgn Assignments), jadi
// tidak ada badge "Menunggu Review". IN_REVIEW = status legacy yang dinormalisasi.
const STATUS_BADGE_ID: Record<string, string> = {
  READY: 'Ready',
}

// Time-based filter helpers (Daily PIC Workspace)
function taskIsOverdue(t: Task): boolean {
  return !!t.targetCompletion
    && new Date(t.targetCompletion).getTime() < Date.now()
    && t.status !== 'COMPLETED'
}
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
const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  week: 'Active This Week',
  overdue: 'Overdue',
  'in-flight': 'In Progress',
  all: 'All',
}

// ── Sub-components for smooth DnD ──────────────────────────────────────────

/** Pure presentational card — no DnD hooks. Used inside DragOverlay. */
function CardFace({
  item, className, normalizeHealthStatus,
}: {
  item: Task
  className?: string
  normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED'
}) {
  const health = normalizeHealthStatus(item.healthStatus ?? 'GREEN')
  const statusClass = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
  const progCode = item.workstream?.program?.code
  const iniName  = item.workstream?.name
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
        {item.isBlocked ? (
          <span
            className="work-card__blocked"
            title={item.blockedReason ?? 'Task blocked — needs intervention'}
          >⚠ Blocked</span>
        ) : STATUS_BADGE_ID[item.status] ? (
          <span className={`work-card__status-badge work-card__status-badge--${statusSlug(item.status)}`}>
            {STATUS_BADGE_ID[item.status]}
          </span>
        ) : null}
        {item.status === 'COMPLETED' && item.targetCompletion && item.actualCompletion && (
          <span className={`work-card__ontime work-card__ontime--${new Date(item.actualCompletion) <= new Date(item.targetCompletion) ? 'ok' : 'late'}`}>
            {new Date(item.actualCompletion) <= new Date(item.targetCompletion) ? '✓ On time' : '⚠ Late'}
          </span>
        )}
        <span className="work-card__footer-meta">
          {item.percentComplete}%{item.assignee ? ` · ${item.assignee.name.split(' ')[0]}` : ''}
        </span>
      </div>
    </div>
  )
}

/** Clickable board card (no drag) — buka rincian kartu untuk ubah progress/status. */
function BoardCard({
  item, onClick, normalizeHealthStatus,
}: {
  item: Task
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="work-card-shell work-card-shell--clickable"
    >
      <CardFace item={item} normalizeHealthStatus={normalizeHealthStatus} />
    </button>
  )
}

export function WorkboardView() {
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

  const [boardMode, setBoardMode] = useState<BoardMode>('kanban')

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
  const filteredGroups = workGroups.map(g => ({
    ...g,
    items: applyBoardFilters(
      effectiveMyItemsOnly ? g.items.filter(i => i.assignee?.id === currentUser?.id) : g.items
    ).filter(matchesTimeFilter),
  }))

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
  const criticalItems = [...allItems]
    .sort((a, b) => {
      const bw = Number(b.isBlocked || b.status === 'BLOCKED') - Number(a.isBlocked || a.status === 'BLOCKED')
      if (bw !== 0) return bw
      const po = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
      return po.indexOf(a.priority) - po.indexOf(b.priority)
    })
    .slice(0, 6)

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
    if (wiDirty && !window.confirm('Discard unsaved changes?')) return
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
      setWiError((err as { message?: string })?.message ?? 'Failed to create task.')
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
          "+ Task Baru" content button dihapus 2026-05-24 — duplikat dgn topbar
          action (topbar-config.ts:32). Single CTA per page. */}
      <PageHeader
        title="Workboard"
        subtitle={
          roleAccess.isMonitoringOnly
            ? 'Track Program tasks & blockers across your directorate.'
            : roleAccess.isOfficer
            ? 'Program tasks assigned to you.'
            : 'Tasks from work Programs — part of the approved plan.'
        }
        actions={
          boardStatus.message ? (
            <div className={`board-status-msg${boardStatus.message.includes('failed') ? ' board-status-msg--error' : ''}`}>
              {boardStatus.saving ? <span className="spinner" /> : null}
              {boardStatus.message}
            </div>
          ) : null
        }
      />

      {/* ── Filters + state row: toggles + selects + stats ── */}
      <div className="view-toolbar wb-toolbar-filters">
        <div className="view-toggle">
          {(['kanban', 'list', 'blockers'] as BoardMode[]).map(mode => (
            <button className={`view-toggle-btn${boardMode === mode ? ' active' : ''}`} key={mode} onClick={() => setBoardMode(mode)}>
              {mode === 'kanban' ? '⬜ Board' : mode === 'list' ? '≡ List' : '⚑ Blockers'}
            </button>
          ))}
        </div>
        {/* BOD: monitoring badge only — no filter toggle */}
        {roleAccess.isMonitoringOnly ? (
          <span className="role-monitoring-badge">Monitoring</span>
        ) : (
          <div className="view-toggle wb-view-toggle">
            <button
              className={`view-toggle-btn${effectiveMyItemsOnly ? ' active' : ''}`}
              onClick={() => setEffectiveMyItemsOnly(true)}
            >
              My Tasks
            </button>
            <button
              className={`view-toggle-btn${!effectiveMyItemsOnly ? ' active' : ''}`}
              onClick={() => setEffectiveMyItemsOnly(false)}
              disabled={roleAccess.myItemsLocked}
              title={roleAccess.myItemsLocked ? 'Support mode: view is limited to your tasks' : undefined}
            >
              All
            </button>
          </div>
        )}
        {/* Daily PIC Workspace: time filter chips */}
        {!roleAccess.isMonitoringOnly && (
          <div className="view-toggle wb-time-filter">
            {(['week', 'overdue', 'in-flight', 'all'] as TimeFilter[]).map(tf => (
              <button
                key={tf}
                className={`view-toggle-btn${timeFilter === tf ? ' active' : ''}`}
                onClick={() => setTimeFilter(tf)}
                title={tf === 'week' ? 'In-flight + due ≤ 7 days + overdue' : undefined}
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
          <option value="">All Programs</option>
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
          title="Filter by workstream / workstream"
        >
          <option value="">All Workstreams</option>
          {workstreamOptions.map(ini => (
            <option key={ini.id} value={ini.id}>{ini.name}</option>
          ))}
        </select>
        <div className="view-toolbar__right">
          <div className="view-toolbar__stats wb-stats wb-daily-summary">
            <button
              type="button"
              className={`wb-summary-stat wb-summary-stat--overdue${overdueCount === 0 ? ' is-zero' : ''}${timeFilter === 'overdue' ? ' is-active' : ''}`}
              onClick={() => overdueCount > 0 && setTimeFilter('overdue')}
              disabled={overdueCount === 0}
              title="Task past due & not completed"
            >
              <span className="wb-summary-stat__num">{overdueCount}</span>
              <em>overdue</em>
            </button>
            <button
              type="button"
              className={`wb-summary-stat wb-summary-stat--today${dueTodayCount === 0 ? ' is-zero' : ''}`}
              onClick={() => dueTodayCount > 0 && setTimeFilter('week')}
              disabled={dueTodayCount === 0}
              title="Tasks due today"
            >
              <span className="wb-summary-stat__num">{dueTodayCount}</span>
              <em>today</em>
            </button>
            <button
              type="button"
              className={`wb-summary-stat wb-summary-stat--week${dueWeekCount === 0 ? ' is-zero' : ''}`}
              onClick={() => dueWeekCount > 0 && setTimeFilter('week')}
              disabled={dueWeekCount === 0}
              title="Tasks due in the next 7 days"
            >
              <span className="wb-summary-stat__num">{dueWeekCount}</span>
              <em>7 days</em>
            </button>
            <span className="wb-summary-stat">
              <span className="wb-summary-stat__num">{inFlightCount}</span>
              <em>in progress</em>
            </span>
            {blockedCount > 0 && (
              <span className="wb-summary-stat wb-stats__blocked">
                <span className="wb-summary-stat__num">{blockedCount}</span>
                <em>blocked</em>
              </span>
            )}
            <span className="wb-summary-stat">
              <span className="wb-summary-stat__num">{completedCount}</span>
              <em>completed</em>
            </span>
          </div>
        </div>
      </div>

      {/* Fix 4: prominent rollback error banner */}
      {rollbackError ? (
        <div className="board-rollback-banner" role="alert">
          <span className="board-rollback-banner__icon">⚠</span>
          <span className="board-rollback-banner__msg">{rollbackError}</span>
          <span className="board-rollback-banner__sub">Card was returned to its original position.</span>
          <button className="board-rollback-banner__close" onClick={() => setRollbackError(null)} aria-label="Close">×</button>
        </div>
      ) : null}

      <div className="workboard-workspace">
        {/* ── Main board ───────────────────────── */}
        <div className="workboard-main">
          {boardLoading && (
            <SectionState icon="⏳" title="Loading tasks…" text="Fetching Program tasks across your directorate." />
          )}
          {boardLoadFailed && (
            <SectionState
              tone="warning"
              icon="⚠️"
              title="Couldn't load tasks"
              text="The task list failed to load (the request may have timed out). Your data is safe — this is a loading issue, not missing tasks."
              cta={{ label: 'Try again', onClick: () => void reloadTasks() }}
            />
          )}
          {boardReady && boardMode === 'kanban' && allItems.length === 0 ? (
            <SectionState
              icon="✨"
              title={
                effectiveMyItemsOnly
                  ? (timeFilter === 'week' ? "You're free this week" : 'No active tasks')
                  : 'No tasks match the current filter'
              }
              text={
                effectiveMyItemsOnly && timeFilter === 'week'
                  ? "No overdue, due-in-7-days, or in-flight tasks assigned to you. Click 'All' to see everything, or toggle to team tasks."
                  : effectiveMyItemsOnly
                  ? "None of your tasks match. Try changing the time filter or toggle to 'All'."
                  : "No tasks match the current filter. Change the time preset or the program/workstream filter."
              }
            />
          ) : null}
          {boardReady && boardMode === 'kanban' && allItems.length > 0 && (
            <div className="kanban-board kanban-board--lanes">
              {LANES.map((lane) => {
                // Bucket item per lane berdasarkan status underlying. Urutan
                // status di lane.statuses menentukan urutan tampil dalam lane.
                const items = lane.statuses.flatMap(
                  s => filteredGroups.find(g => g.status === s)?.items ?? []
                )
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
                      title={isCollapsed ? 'Expand lane' : 'Collapse lane'}
                    >
                      <div className="kanban-col__label-row">
                        <span className="kanban-col__caret" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                        <span className="kanban-col__label">{lane.label}</span>
                        <span
                          className="kanban-col__info"
                          title={lane.hint}
                          aria-label={`About the ${lane.label} lane`}
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
              })}
            </div>
          )}

          {boardReady && boardMode === 'list' && (
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{myItemsOnly ? 'My Tasks' : 'All Tasks'}</h3>
                <span className="badge">{allItems.length} tasks</span>
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
                        <span className="text-muted text-sm">{item.workstream?.name ?? 'No workstream yet'}</span>
                      </div>
                    </div>
                    <div className="wi-list-row__right">
                      <span className={`status-dot-label status-dot-label--${statusSlug(item.status)}`}>
                        {formatStatusLabel(item.status)}
                      </span>
                      <span className={`priority-badge priority-badge--${item.priority.toLowerCase()}`}>{item.priority}</span>
                      <HealthPill status={normalizeHealthStatus(item.healthStatus)} />
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

          {boardReady && boardMode === 'blockers' && (
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">Blocker Tracker</h3>
                <span className="badge badge--red">{blockers.length} blockers</span>
              </div>
              {blockers.length > 0 ? (
                <div className="blocker-list">
                  {blockers.map((blocker) => (
                    <div className="blocker-row" key={blocker.id}>
                      <div className="blocker-row__left">
                        <span className={`severity-badge severity-badge--${blocker.severity.toLowerCase()}`}>
                          {blocker.severity}
                        </span>
                        <div>
                          <strong>{blocker.code}</strong>
                          <p>{blocker.title}</p>
                        </div>
                      </div>
                      <span className="badge">{formatStatusLabel(blocker.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <SectionState icon="✅" title="No blockers" text="No blockers recorded at this time." />
              )}
            </div>
          )}

          {/* Attention queue */}
          <div className="panel attention-panel">
            <div className="panel__header">
              <h3 className="panel__title">Attention Queue</h3>
              <span className="badge">Top {criticalItems.length}</span>
            </div>
            <div className="wi-list">
              {criticalItems.map((item) => (
                <button
                  className="wi-list-row"
                  key={item.id}
                  onClick={(e) => openTaskModal(item.id, e)}
                >
                  <div className="wi-list-row__left">
                    <span className="code-badge">{item.code}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <span className="text-muted text-sm">{item.percentComplete}% complete</span>
                    </div>
                  </div>
                  <div className="wi-list-row__right">
                    <span className={`priority-badge priority-badge--${item.priority.toLowerCase()}`}>{item.priority}</span>
                    {item.isBlocked ? <span className="severity-badge severity-badge--high">BLOCKED</span> : null}
                    <HealthPill status={normalizeHealthStatus(item.healthStatus)} />
                  </div>
                </button>
              ))}
            </div>
          </div>
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
                <span className="modal-kicker">Execution</span>
                <h3 className="modal__title" id={createTaskTitleId}>New Task</h3>
                <p className="modal-subtitle" id={createTaskDescId}>
                  Create a new work item with clear workstream context, priority, and owner so execution stays tidy.
                </p>
                <p className="modal-cross-hint">
                  Not part of a Program? Create it as an <Link href="/penugasan">Assignment →</Link>
                </p>
              </div>
              <button
                aria-label="Close"
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
                    <h4>Work Context</h4>
                    <p>Link the task to the right workstream and give it a title specific enough for the action owner.</p>
                  </div>
                  <div className="form-field">
                    <label>Workstream <span className="form-field__required">*</span></label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, workstreamId: e.target.value }))}
                      required
                      value={wiForm.workstreamId}
                    >
                      <option value="">Select a workstream…</option>
                      {wiWorkstreams.map(ini => (
                        <option key={ini.id} value={ini.id}>
                          {ini.program ? `${ini.program.code} › ` : ''}{ini.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Title <span className="form-field__required">*</span></label>
                    <input
                      maxLength={120}
                      minLength={3}
                      onChange={e => setWiForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Task title"
                      required
                      type="text"
                      value={wiForm.title}
                    />
                  </div>
                  <div className="form-field">
                    <label>Description</label>
                    <textarea
                      className="composer__input wb-modal-textarea"
                      maxLength={400}
                      onChange={e => setWiForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Brief description (optional)"
                      rows={2}
                      value={wiForm.description}
                    />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Execution</h4>
                    <p>Set the initial status and assignee so this item is ready to track from the board.</p>
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, status: e.target.value }))}
                      value={wiForm.status}
                    >
                      <option value="BACKLOG">Backlog</option>
                      <option value="READY">Ready</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Assignee</label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, assignedTo: e.target.value }))}
                      value={wiForm.assignedTo}
                    >
                      <option value="">— Unassigned —</option>
                      {wiUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}{u.positionTitle ? ` · ${u.positionTitle}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Deadline <span className="form-field__required">*</span></label>
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
                  Cancel
                </button>
                <button
                  className="profile-save-btn"
                  disabled={wiSaving || !wiForm.workstreamId || !wiForm.title.trim() || !wiForm.targetCompletion}
                  type="submit"
                >
                  {wiSaving ? 'Saving…' : 'Create Task'}
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
    </div>
  )
}

export default WorkboardView
