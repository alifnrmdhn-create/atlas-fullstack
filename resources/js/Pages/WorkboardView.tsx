import { useState, useEffect, useId, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import {
  HealthPill,
  SectionState,
} from '../components/ui'
import type { Task } from '../types'
import { api } from '../lib/api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useRoleAccess } from '../hooks/useRoleAccess'
import './WorkboardView.css'

type BoardMode = 'kanban' | 'list' | 'blockers'

const STATUS_ORDER = ['BACKLOG', 'READY', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED']
const statusSlug = (status: string) => status.toLowerCase()

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
          <span className="work-card__blocked">BLOCKED</span>
        ) : null}
        {item.status === 'COMPLETED' && item.targetCompletion && item.actualCompletion && (
          <span className={`work-card__ontime work-card__ontime--${new Date(item.actualCompletion) <= new Date(item.targetCompletion) ? 'ok' : 'late'}`}>
            {new Date(item.actualCompletion) <= new Date(item.targetCompletion) ? '✓ Tepat waktu' : '⚠ Terlambat'}
          </span>
        )}
        <span className="work-card__footer-meta">
          {item.percentComplete}%{item.assignee ? ` · ${item.assignee.name.split(' ')[0]}` : ''}
        </span>
      </div>
    </div>
  )
}

/** Draggable card in the board columns — registers with DnD context. */
function DraggableCard({
  item, isSelected, onClick, normalizeHealthStatus, draggable = true,
}: {
  item: Task
  isSelected: boolean
  onClick: () => void
  normalizeHealthStatus: (h: string) => 'GREEN' | 'YELLOW' | 'RED'
  /** When false the card renders as non-interactive (BOD monitoring mode, OFFICER viewing others) */
  draggable?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: !draggable })
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      onClick={onClick}
      className={`work-card-shell${draggable ? ' work-card-shell--draggable' : ' work-card-shell--readonly'}${isDragging ? ' work-card-shell--dragging' : ''}`}
    >
      <CardFace
        item={item}
        normalizeHealthStatus={normalizeHealthStatus}
        className={[
          isSelected && !isDragging ? 'work-card--active' : '',
          isDragging ? 'work-card--drag-ghost' : '',
          !draggable ? 'work-card--readonly' : '',
        ].filter(Boolean).join(' ')}
      />
    </button>
  )
}

function DroppableColumn({
  status, isOver, children, className,
}: {
  status: string
  isOver: boolean
  children: ReactNode
  className?: string
}) {
  const { setNodeRef } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={[className, isOver ? 'kanban-col--drop-target' : ''].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
const DROP_ANIMATION = {
  duration: 260,
  easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // spring overshoot → settle
}

export function WorkboardView() {
  const {
    workGroups, blockers, programs,
    boardStatus,
    setDragState,
    loadOverview,
    handleTaskDragStart, handleTaskDrop,
    normalizeHealthStatus, formatStatusLabel,
    boardOnOpen, clearBoardOnOpen,
    currentUser,
  } = useWorkspace()

  const roleAccess = useRoleAccess()
  const { url } = usePage()
  const navigate = useInertiaNavigate()

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

  // Default myItemsOnly respects role: KADIV/KASUBDIV/BOD default to full view
  const [myItemsOnly, setMyItemsOnly] = useState(roleAccess.defaultMyItemsOnly)

  // OFFICER: locked to myItemsOnly regardless of toggle
  const effectiveMyItemsOnly = roleAccess.myItemsLocked ? true : myItemsOnly
  const setEffectiveMyItemsOnly = (v: boolean) => {
    if (!roleAccess.myItemsLocked) setMyItemsOnly(v)
  }
  const [boardFilterProgramId, setBoardFilterProgramId] = useState<number | null>(null)
  const [boardFilterWorkstreamId, setBoardFilterWorkstreamId] = useState<number | null>(null)
  // Collapse backlog by default — reduces demo clutter; user can expand on click.
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(() => new Set(['BACKLOG']))
  const toggleCollapsedCol = (status: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
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
    if (boardOnOpen.forceShowAll && !roleAccess.myItemsLocked) setMyItemsOnly(false)
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

  // DnD-kit state
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )
  const [activeItem, setActiveItem] = useState<Task | null>(null)
  const [overColId, setOverColId] = useState<string | null>(null)

  const onDragStart = ({ active }: DragStartEvent) => {
    const item = allItems.find(i => i.id === active.id)
    if (item) { setActiveItem(item); handleTaskDragStart(item.id) }
  }
  const onDragOver = ({ over }: DragOverEvent) => {
    setOverColId(over ? String(over.id) : null)
  }
  const onDragEnd = ({ over }: DragEndEvent) => {
    if (over) { void handleTaskDrop(String(over.id)) }
    else { setDragState({ itemId: null, overStatus: null }) }
    setActiveItem(null)
    setOverColId(null)
  }
  const onDragCancel = () => {
    setDragState({ itemId: null, overStatus: null })
    setActiveItem(null)
    setOverColId(null)
  }

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
  const allItems = applyBoardFilters(
    effectiveMyItemsOnly ? rawItems.filter(i => i.assignee?.id === currentUser?.id) : rawItems
  )
  const filteredGroups = workGroups.map(g => ({
    ...g,
    items: applyBoardFilters(
      effectiveMyItemsOnly ? g.items.filter(i => i.assignee?.id === currentUser?.id) : g.items
    ),
  }))

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
      setWiError((err as { message?: string })?.message ?? 'Gagal membuat task.')
    } finally {
      setWiSaving(false)
    }
  }

  return (
    <div className="ds workboard-v2 view-workboard">
      <div className="workboard-v2__inner">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Execution Board</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">
          {roleAccess.isMonitoringOnly
            ? 'Pantau status eksekusi semua task dan blocker di direktorat Anda.'
            : roleAccess.isOfficer
            ? 'Kelola dan selesaikan task yang ditugaskan kepada Anda.'
            : 'Kelola workstream, task, dan blocker tim secara real-time.'}
        </span>
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
          <div className="view-toolbar__stats wb-stats">
            <span>{allItems.length} <em>items</em></span>
            <span>{inFlightCount} <em>in flight</em></span>
            {blockedCount > 0 && (
              <span className="wb-stats__blocked">{blockedCount} <em>blocked</em></span>
            )}
            <span>{completedCount} <em>done</em></span>
          </div>
          {!roleAccess.isMonitoringOnly && roleAccess.canCreateWorkstream && (
            <button className="toolbar-action-btn" onClick={() => void openCreateWI()}>
              + Tugas Baru
            </button>
          )}
          {boardStatus.message ? (
            <div className={`board-status-msg${boardStatus.message.includes('failed') ? ' board-status-msg--error' : ''}`}>
              {boardStatus.saving ? <span className="spinner" /> : null}
              {boardStatus.message}
            </div>
          ) : null}
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
          {boardMode === 'kanban' && (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            >
              <div className="kanban-board">
                {STATUS_ORDER.map((status) => {
                  const group = filteredGroups.find(g => g.status === status)
                  const items = group?.items ?? []
                  const isCollapsed = collapsedCols.has(status)
                  return (
                    <DroppableColumn
                      key={status}
                      status={status}
                      isOver={overColId === status}
                      className={`kanban-col${isCollapsed ? ' kanban-col--collapsed' : ''}`}
                    >
                      <button
                        type="button"
                        className={`kanban-col__header kanban-col__header--toggle kanban-col__header--${statusSlug(status)}`}
                        onClick={() => toggleCollapsedCol(status)}
                        aria-expanded={!isCollapsed}
                        title={isCollapsed ? 'Expand column' : 'Collapse column'}
                      >
                        <div className="kanban-col__label-row">
                          <span className="kanban-col__caret" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                          <span className="kanban-col__label">{formatStatusLabel(status)}</span>
                        </div>
                        <span className="section-badge">{items.length}</span>
                      </button>
                      {!isCollapsed && (
                        <div className="kanban-col__body">
                          {items.map((item) => (
                            <DraggableCard
                              key={item.id}
                              item={item}
                              isSelected={false}
                              onClick={() => navigate(`/execution/tasks/${item.id}`)}
                              normalizeHealthStatus={normalizeHealthStatus}
                              draggable={
                                roleAccess.canDragCards &&
                                (roleAccess.canDragOthersCards || item.assignee?.id === currentUser?.id)
                              }
                            />
                          ))}
                          {/* Drop slot: visible landing zone while hovering this column */}
                          {overColId === status && activeItem?.status !== status ? (
                            <div key="drop-slot" className="kanban-drop-slot" />
                          ) : items.length === 0 ? (
                            <div className="kanban-col__empty kanban-col__empty--dashed">Drop items here</div>
                          ) : null}
                        </div>
                      )}
                    </DroppableColumn>
                  )
                })}
              </div>
              <DragOverlay dropAnimation={DROP_ANIMATION} modifiers={[snapCenterToCursor]}>
                {activeItem ? (
                  <CardFace
                    item={activeItem}
                    normalizeHealthStatus={normalizeHealthStatus}
                    className="work-card--drag-overlay"
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {boardMode === 'list' && (
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">{myItemsOnly ? 'Task Saya' : 'Semua Task'}</h3>
                <span className="badge">{allItems.length} task</span>
              </div>
              <div className="wi-list">
                {allItems.map((item) => (
                  <button
                    className="wi-list-row"
                    key={item.id}
                    onClick={() => navigate(`/execution/tasks/${item.id}`)}
                  >
                    <div className="wi-list-row__left">
                      <span className="code-badge">{item.code}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <span className="text-muted text-sm">{item.workstream?.name ?? 'Belum ada workstream'}</span>
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

          {boardMode === 'blockers' && (
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
                  onClick={() => navigate(`/execution/tasks/${item.id}`)}
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
                <span className="modal-kicker">Eksekusi</span>
                <h3 className="modal__title" id={createTaskTitleId}>Tugas Baru</h3>
                <p className="modal-subtitle" id={createTaskDescId}>
                  Buat item kerja baru dengan konteks workstream, prioritas, dan pemilik yang jelas agar eksekusi langsung rapi.
                </p>
              </div>
              <button
                aria-label="Tutup"
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
                    <h4>Konteks Pekerjaan</h4>
                    <p>Pautkan task ke workstream yang tepat dan beri judul yang cukup spesifik untuk action owner.</p>
                  </div>
                  <div className="form-field">
                    <label>Workstream <span className="form-field__required">*</span></label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, workstreamId: e.target.value }))}
                      required
                      value={wiForm.workstreamId}
                    >
                      <option value="">Pilih workstream…</option>
                      {wiWorkstreams.map(ini => (
                        <option key={ini.id} value={ini.id}>
                          {ini.program ? `${ini.program.code} › ` : ''}{ini.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Judul <span className="form-field__required">*</span></label>
                    <input
                      maxLength={120}
                      minLength={3}
                      onChange={e => setWiForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Judul task"
                      required
                      type="text"
                      value={wiForm.title}
                    />
                  </div>
                  <div className="form-field">
                    <label>Deskripsi</label>
                    <textarea
                      className="composer__input wb-modal-textarea"
                      maxLength={400}
                      onChange={e => setWiForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Deskripsi singkat (opsional)"
                      rows={2}
                      value={wiForm.description}
                    />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Eksekusi</h4>
                    <p>Tentukan status awal, tingkat prioritas, dan penanggung jawab supaya item ini siap dipantau dari board.</p>
                  </div>
                  <div className="wb-form-grid wb-form-grid--equal">
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
                      <label>Prioritas</label>
                      <select
                        className="form-input"
                        onChange={e => setWiForm(f => ({ ...f, priority: e.target.value }))}
                        value={wiForm.priority}
                      >
                        <option value="CRITICAL">Critical</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Penanggung Jawab</label>
                    <select
                      className="form-input"
                      onChange={e => setWiForm(f => ({ ...f, assignedTo: e.target.value }))}
                      value={wiForm.assignedTo}
                    >
                      <option value="">— Belum ditugaskan —</option>
                      {wiUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}{u.positionTitle ? ` · ${u.positionTitle}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Tenggat <span className="form-field__required">*</span></label>
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
                  Batal
                </button>
                <button
                  className="profile-save-btn"
                  disabled={wiSaving || !wiForm.workstreamId || !wiForm.title.trim() || !wiForm.targetCompletion}
                  type="submit"
                >
                  {wiSaving ? 'Menyimpan…' : 'Buat Tugas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default WorkboardView
