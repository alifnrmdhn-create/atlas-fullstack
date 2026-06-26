import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useState, useEffect, useRef } from 'react'
import type { Blocker, CommittedEscalation, FocusPolicy, Meeting, MyActionItem, MyAssignment, MyWorkDecision, NeedsActionItem, NotificationItem, Program, Task } from '../types'
import { ActionPanel, actionPanelTitleFor } from '../components/ActionPanel'
import { NeedsActionPanel } from '../components/NeedsActionPanel'
import { FocusQuickPanel } from '../components/FocusQuickPanel'
import { CollapsibleSection, AgingIndicator } from '../components/ui'
import { getProgramDisplayStatus } from '../lib/programStatus'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useOnboardingTour } from '../hooks/useOnboardingTour'
import { EscalationTriagePanel, type EscalationRequest as EscalationRequestType } from '../components/Escalation'
import { PageHeader } from '../design-system'
import './FokusView.css'

type FocusBlock = {
  id: number
  title: string
  startAt: string
  endAt: string
  note?: string
}

// Sprint 4 — Escalation sections (Clear the Path)
function EscalationSections({ currentUserId }: { currentUserId: number }) {
  const enabled = useFeatureFlag('clear-the-path')
  const [incoming, setIncoming] = useState<EscalationRequestType[]>([])
  const [mine, setMine] = useState<EscalationRequestType[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTriage, setActiveTriage] = useState<EscalationRequestType | null>(null)

  // Trigger tour saat fitur enabled & data sudah loaded (ada/tidak ada items)
  useOnboardingTour('escalation-inbox', { trigger: enabled && !loading })

  const refresh = () => {
    if (!enabled) return
    setLoading(true)
    Promise.all([
      api.get<{ data: EscalationRequestType[] }>('/escalations?filter=incoming'),
      api.get<{ data: EscalationRequestType[] }>('/escalations?filter=mine'),
    ]).then(([a, b]) => {
      setIncoming(a.data)
      setMine(b.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    if (enabled) {
      refresh()
    } else {
      // Feature flag di-toggle OFF mid-session — reset state biar tidak
      // ada stale data kalau flag re-enable lagi.
      setIncoming([])
      setMine([])
      setActiveTriage(null)
      setLoading(false)
    }
  }, [enabled])

  if (!enabled) return null

  const incomingPending = incoming.filter(e => e.status === 'REQUESTED')
  const mineActive = mine.filter(e => !['CLEARED', 'DECLINED'].includes(e.status))

  return (
    <>
      {/* Section disembunyikan saat kosong (anti "wall of empty headings" — audit
          Focus Jun 2026). Hanya muncul kalau ada yang benar-benar perlu disposition. */}
      {incomingPending.length > 0 && (
        <div data-tour="escalation-incoming">
        <CollapsibleSection
          title="My Clear the Path Requests"
          count={incomingPending.length}
          defaultOpen
          persistKey="inbox.escalation-incoming"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {incomingPending.map(req => (
              <EscalationRowButton key={req.id} request={req} onClick={() => setActiveTriage(req)} />
            ))}
          </div>
        </CollapsibleSection>
        </div>
      )}

      {mineActive.length > 0 && (
        <div data-tour="escalation-mine">
        <CollapsibleSection
          title="Escalations I Raised"
          count={mineActive.length}
          defaultOpen={false}
          persistKey="inbox.escalation-mine"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mineActive.map(req => (
              <EscalationRowButton key={req.id} request={req} onClick={() => setActiveTriage(req)} showStatus />
            ))}
          </div>
        </CollapsibleSection>
        </div>
      )}

      {activeTriage && (
        <EscalationTriagePanel
          request={activeTriage}
          currentUserId={currentUserId}
          onClose={() => setActiveTriage(null)}
          onUpdated={(next) => {
            setActiveTriage(next)
            refresh()
          }}
        />
      )}
    </>
  )
}

function EscalationRowButton({
  request, onClick, showStatus,
}: {
  request: EscalationRequestType
  onClick: () => void
  showStatus?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        border: '1px solid var(--panel-border)', borderRadius: 8, background: 'var(--panel)',
        cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'var(--text)',
      }}
    >
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{request.title}</span>
      {showStatus && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {request.status === 'REQUESTED' ? 'Awaiting' :
           request.status === 'COMMITTED' ? 'Committed' :
           request.status === 'IN_PROGRESS' ? 'In Progress' :
           request.status === 'REROUTED' ? 'Rerouted' : request.status}
        </span>
      )}
      <AgingIndicator days={request.agingDays} showText />
    </button>
  )
}

type FocusItemKind = 'task' | 'blocker' | 'program' | 'approval' | 'mention' | 'dm' | 'meeting' | 'focus' | 'notification' | 'action_item' | 'assignment' | 'escalation'
type FocusScope = 'all' | 'action' | 'risk' | 'communication' | 'schedule'

/**
 * Urgency model — kind-driven, restraint-first. Replaces the generic
 * red/yellow/green tone palette which color-coded everything indiscriminately.
 *
 *   critical — must act today. Blockers, overdue tasks, RED programs.
 *   warn     — soon. Tasks due today/tomorrow, YELLOW programs.
 *   decide   — decision pending. Approvals.
 *   info     — awareness only. Mentions, DMs, notifications, meetings.
 *
 * Visual rule: only `critical` and `warn` get tinted accents. `decide` gets
 * indigo accent. `info` stays fully neutral — color is reserved for genuine
 * urgency, not status enumeration.
 */
type Urgency = 'critical' | 'warn' | 'decide' | 'info'

type FocusItem = {
  id: string
  kind: FocusItemKind
  section: 'assigned' | 'blocker' | 'atrisk' | 'mention' | 'notif' | 'priority'
  title: string
  meta: string
  impact?: string
  reason: string
  roleCue: string
  nextCue: string
  actionLabel: string
  score: number
  urgency: Urgency
  chip?: string
  evidence?: string[]
  entityId?: number
  taskId?: number
  channelId?: number
  notificationId?: number
  source?: string
}

type ApprovalCandidate = Program | MyWorkDecision

type NotificationGroup = {
  id: string
  latest: NotificationItem
  items: NotificationItem[]
  unreadCount: number
}

const FOCUS_SCOPE_LABEL: Record<FocusScope, string> = {
  all: 'All',
  action: 'Action',
  risk: 'Risk',
  communication: 'Communication',
  schedule: 'Schedule',
}

const SEV_LABEL: Record<string, string> = {
  CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low',
}

const NOTIF_TYPE_LABEL: Record<string, string> = {
  MENTION: 'Mention', APPROVAL: 'Approval', BLOCKER_RAISED: 'Blocker',
  BLOCKER_CREATED: 'Blocker', STATUS_CHANGE: 'Update', COMMENT: 'Comment',
  ASSIGNED: 'Assigned', TASK_ASSIGNED: 'Assigned', SYSTEM: 'System',
  PROGRAM_NEEDS_APPROVAL: 'Approval', PROGRAM_APPROVED: 'Program',
  PROGRAM_REJECTED: 'Program', REPORT_AWAITING_REVIEW: 'Report',
  REPORT_AWAITING_APPROVAL: 'Report', REPORT_APPROVED: 'Report',
  REPORT_REJECTED: 'Report', REPORT_NEEDS_REVISION: 'Report',
  DEADLINE_APPROACHING: 'Deadline', DM_RECEIVED: 'DM',
  MEETING_INVITED: 'Meeting', MEETING_DELEGATED: 'Meeting',
  ACTION_ITEM_ASSIGNED: 'Action Item',
}

function _todayLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const DAY_MS = 24 * 60 * 60 * 1000

// ── Snooze (anti Focus-fatigue) ──────────────────────────────────────────────
const SNOOZE_KEY = 'atlas.focus.snoozed'

/** Baca map snooze dari localStorage, buang entry yang sudah lewat. */
function loadSnoozed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, number>
    const now = Date.now()
    const fresh: Record<string, number> = {}
    for (const [id, until] of Object.entries(parsed)) {
      if (typeof until === 'number' && until > now) fresh[id] = until
    }
    return fresh
  } catch {
    return {}
  }
}

/** Snooze sampai besok pukul 08:00 lokal (default "lihat lagi besok"). */
function snoozeUntilTomorrow(): number {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return d.getTime()
}

const PRIORITY_SCORE: Record<string, number> = {
  CRITICAL: 28,
  HIGH: 20,
  MEDIUM: 10,
  LOW: 4,
}

const HEALTH_SCORE: Record<string, number> = {
  RED: 24,
  YELLOW: 12,
  GREEN: 0,
}

const SEVERITY_SCORE: Record<string, number> = {
  CRITICAL: 34,
  HIGH: 26,
  MEDIUM: 14,
  LOW: 6,
}

const DEFAULT_FOCUS_POLICY: FocusPolicy = {
  profile: 'Operational owner',
  source: 'DEFAULT',
  due: {
    upcomingWindowDays: 3,
    watchWindowDays: 7,
    overdueBaseScore: 30,
    overduePerDayScore: 3,
    overdueCapScore: 18,
    todayScore: 24,
    tomorrowScore: 18,
    upcomingScore: 12,
    watchScore: 6,
  },
  idle: {
    watchAfterDays: 3,
    highAfterDays: 7,
    criticalAfterDays: 14,
    watchScore: 6,
    highScore: 12,
    criticalScore: 18,
  },
  blockerAging: {
    watchAfterDays: 3,
    highAfterDays: 7,
    watchScore: 8,
    highScore: 14,
  },
  approval: {
    ownerScore: 66,
    kasubScore: 92,
    kadivScore: 98,
    highBlockingScore: 106,
  },
} as const

function daysUntil(dateString?: string | null): number | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.ceil((date.getTime() - today.getTime()) / DAY_MS)
}

function daysSince(dateString?: string | null): number | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / DAY_MS))
}

function dueLabel(dateString?: string | null, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): string | null {
  const days = daysUntil(dateString)
  if (days == null) return null
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= policy.due.watchWindowDays) return `Due in ${days} days`
  return null
}

function dueScore(dateString?: string | null, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): number {
  const days = daysUntil(dateString)
  if (days == null) return 0
  if (days < 0) return policy.due.overdueBaseScore + Math.min(policy.due.overdueCapScore, Math.abs(days) * policy.due.overduePerDayScore)
  if (days === 0) return policy.due.todayScore
  if (days === 1) return policy.due.tomorrowScore
  if (days <= policy.due.upcomingWindowDays) return policy.due.upcomingScore
  if (days <= policy.due.watchWindowDays) return policy.due.watchScore
  return 0
}

function idleScore(dateString?: string | null, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): number {
  const days = daysSince(dateString)
  if (days == null) return 0
  if (days >= policy.idle.criticalAfterDays) return policy.idle.criticalScore
  if (days >= policy.idle.highAfterDays) return policy.idle.highScore
  if (days >= policy.idle.watchAfterDays) return policy.idle.watchScore
  return 0
}

function idleLabel(dateString?: string | null, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): string | null {
  const days = daysSince(dateString)
  if (days == null || days < policy.idle.watchAfterDays) return null
  if (days >= policy.idle.criticalAfterDays) return `Idle ${days} days`
  return `No update for ${days} days`
}

function focusEvidence(items: Array<string | null | undefined | false>): string[] {
  return items.filter((item): item is string => Boolean(item)).slice(0, 3)
}

function recencyScore(dateString?: string): number {
  if (!dateString) return 0
  const ageHours = (Date.now() - new Date(dateString).getTime()) / (60 * 60 * 1000)
  if (ageHours <= 1) return 16
  if (ageHours <= 8) return 10
  if (ageHours <= 24) return 6
  return 2
}

function notificationRoleCue(notification: NotificationItem): string {
  if (notification.type === 'DM_RECEIVED') return 'You received a message'
  if (notification.type === 'MENTION') return 'You were mentioned in a discussion'
  if (notification.type === 'BLOCKER_CREATED') return 'You need to help unblock'
  if (notification.type === 'PROGRAM_NEEDS_APPROVAL' || notification.type === 'APPROVAL') return 'You are the decision-maker'
  if (notification.type === 'PROGRAM_REJECTED') return 'You are the PIC of a rejected program'
  if (notification.type === 'REPORT_NEEDS_REVISION') return 'You need to correct the report'
  if (notification.type === 'DEADLINE_APPROACHING') return 'You own the deadline'
  if (notification.type === 'TASK_ASSIGNED') return 'You own the task'
  return 'Update relevant to you'
}

function notificationNextCue(notification: NotificationItem): string {
  if (notification.type === 'DM_RECEIVED') return 'Reply so the workflow keeps moving'
  if (notification.type === 'MENTION') return 'Open the context and respond if needed'
  if (notification.type === 'BLOCKER_CREATED') return 'Follow up on the blocker'
  if (notification.type === 'PROGRAM_NEEDS_APPROVAL' || notification.type === 'APPROVAL') return 'Decide so the program can proceed'
  if (notification.type === 'PROGRAM_REJECTED') return 'Fix per the notes, then resubmit'
  if (notification.type === 'REPORT_NEEDS_REVISION') return 'Revise before the process continues'
  if (notification.type === 'DEADLINE_APPROACHING') return 'Secure it before the deadline passes'
  if (notification.type === 'TASK_ASSIGNED') return 'Start or update progress'
  return 'Check the change details'
}

function taskFocusItem(task: Task, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const due = dueLabel(task.targetCompletion, policy)
  const idle = idleLabel(task.updatedAt ?? task.createdAt, policy)
  const program = task.workstream?.program
  const programContext = program ? `${program.code} · ${program.name}` : task.workstream?.name
  const programImpact =
    program?.healthStatus === 'RED'
      ? `Affects red program ${program.code}`
      : program?.healthStatus === 'YELLOW'
        ? `Keeps program ${program.code} from worsening`
        : program
          ? `Related to program ${program.code}`
          : undefined
  const score =
    28 +
    (HEALTH_SCORE[task.healthStatus] ?? 8) +
    (PRIORITY_SCORE[task.priority] ?? 8) +
    dueScore(task.targetCompletion, policy) +
    idleScore(task.updatedAt ?? task.createdAt, policy) +
    (task.isBlocked ? 18 : 0) +
    Math.min(10, task.blockerCount * 4) +
    (program?.healthStatus === 'RED' ? 10 : program?.healthStatus === 'YELLOW' ? 4 : 0)

  const reason =
    task.isBlocked
      ? task.blockedReason || `${task.blockerCount || 1} blocker(s) holding up this task`
      : due
        ? due
        : idle
          ? idle
          : task.healthStatus === 'RED'
          ? 'Task health is red and needs checking'
          : task.priority === 'HIGH' || task.priority === 'CRITICAL'
            ? `${task.priority.toLowerCase()} priority`
            : 'Active task awaiting your progress'

  // Urgency: derived from due/blocked context, NOT from healthStatus —
  // a task with healthGreen but 7 days overdue is critical, not "ok".
  const dueDays = daysUntil(task.targetCompletion)
  const urgency: Urgency =
    task.isBlocked ? 'critical' :
    dueDays !== null && dueDays < 0 ? 'critical' :
    dueDays !== null && dueDays <= 1 ? 'warn' :
    task.healthStatus === 'RED' ? 'warn' :
    'info'

  return {
    id: `task-${task.id}`,
    kind: 'task',
    section: 'assigned',
    title: task.title,
    meta: `${task.code}${programContext ? ` · ${programContext}` : ''}`,
    impact: programImpact,
    reason,
    roleCue: task.isBlocked ? 'You are the PIC to clear the blocker' : 'You are the task progress PIC',
    nextCue: task.isBlocked ? 'Clear the blocker before progress can continue' : due ? due : idle ? 'Update the status so risk stays visible' : 'Log the next progress update',
    actionLabel: task.isBlocked ? 'Open blocker →' : 'Work on it →',
    score,
    urgency,
    chip: due ?? idle ?? task.status.replace(/_/g, ' '),
    evidence: focusEvidence([
      task.isBlocked && 'Blocked',
      due,
      idle,
      task.healthStatus !== 'GREEN' && `Health ${task.healthStatus}`,
      task.priority === 'HIGH' || task.priority === 'CRITICAL' ? `${task.priority} priority` : null,
      program?.healthStatus === 'RED' ? 'Program RED' : program?.healthStatus === 'YELLOW' ? 'Program YELLOW' : null,
    ]),
    entityId: task.id,
  }
}

function blockerFocusItem(blocker: Blocker, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const program = blocker.task?.workstream?.program
  const age = daysSince(blocker.createdAt)
  const ageText = age != null && age >= policy.blockerAging.watchAfterDays ? `Open ${age} days` : null
  const taskContext = blocker.task ? `${blocker.task.code} · ${blocker.task.title}` : blocker.code
  const impact =
    program?.healthStatus === 'RED'
      ? `Holding up a task on red program ${program.code}`
      : program
        ? `Holding up a task on program ${program.code}`
        : blocker.task
          ? `Holding up task ${blocker.task.code}`
          : undefined
  const score =
    42 +
    (SEVERITY_SCORE[blocker.severity] ?? 12) +
    (PRIORITY_SCORE[blocker.priority] ?? 10) +
    (blocker.status === 'OPEN' ? 8 : 4) +
    (age != null && age >= policy.blockerAging.highAfterDays
      ? policy.blockerAging.highScore
      : age != null && age >= policy.blockerAging.watchAfterDays
        ? policy.blockerAging.watchScore
        : 0) +
    (program?.healthStatus === 'RED' ? 12 : program?.healthStatus === 'YELLOW' ? 5 : 0)

  return {
    id: `blocker-${blocker.id}`,
    kind: 'blocker',
    section: 'blocker',
    title: blocker.title,
    meta: `${blocker.code} · ${taskContext}`,
    impact,
    reason: ageText ? `${ageText} · ${SEV_LABEL[blocker.severity] ?? blocker.severity}` : `${SEV_LABEL[blocker.severity] ?? blocker.severity} and still needs follow-up`,
    roleCue: 'You need to help unblock the work',
    nextCue: ageText ? 'Prioritize — this blocker is aging' : program ? `Its impact links to ${program.code}` : 'Follow up until the blocker has an owner',
    actionLabel: 'Follow up →',
    score,
    // Blockers are intrinsically critical — by definition something is blocked.
    // Severity scales the score, not the urgency category.
    urgency: 'critical',
    chip: ageText ?? SEV_LABEL[blocker.severity] ?? blocker.severity,
    evidence: focusEvidence([
      SEV_LABEL[blocker.severity] ?? blocker.severity,
      ageText,
      blocker.status === 'OPEN' ? 'Still open' : blocker.status.replace(/_/g, ' '),
      program?.healthStatus === 'RED' ? 'Program RED' : program?.healthStatus === 'YELLOW' ? 'Program YELLOW' : null,
    ]),
    entityId: blocker.id,
    taskId: blocker.taskId,
  }
}

function programFocusItem(program: Program, isStrategic: boolean): FocusItem {
  const score =
    (isStrategic ? 30 : 20) +
    (HEALTH_SCORE[program.healthStatus] ?? 10) +
    (PRIORITY_SCORE[program.priority] ?? 8) +
    Math.max(0, 10 - Math.round(program.progressPercent / 10))

  // Status label: pakai display-status helper yang approval-aware. Tanpa ini,
  // program PENDING_KADIV tampil sebagai "IN PROGRESS" (raw operational status)
  // padahal sebenarnya menunggu approval — bikin user bingung soal posisi
  // sebenarnya. Untuk program rejected (DRAFT+rejectionNote) juga jadi "Perlu
  // revisi" instead of "DRAFT".
  const displayStatus = getProgramDisplayStatus(program).label
  return {
    id: `program-${program.id}`,
    kind: 'program',
    section: 'atrisk',
    title: program.name,
    meta: `${program.code} · ${displayStatus}`,
    reason: program.healthStatus === 'RED'
      ? 'Red program — could impact the portfolio'
      : 'Yellow program — watch before it worsens',
    roleCue: isStrategic ? 'You monitor the portfolio' : 'Program is in your area',
    nextCue: program.healthStatus === 'RED' ? 'Needs intervention or a quick decision' : 'Watch before it turns red',
    actionLabel: isStrategic ? 'Review program →' : 'Check program →',
    score,
    urgency: program.healthStatus === 'RED' ? 'critical' : program.healthStatus === 'YELLOW' ? 'warn' : 'info',
    chip: `${program.progressPercent}%`,
    evidence: focusEvidence([
      `Health ${program.healthStatus}`,
      isStrategic ? 'Portfolio' : 'Your area',
      `${program.progressPercent}% complete`,
      program.priority === 'HIGH' || program.priority === 'CRITICAL' ? `${program.priority} priority` : null,
    ]),
    entityId: program.id,
  }
}

function approvalFocusItem(program: ApprovalCandidate, role: string, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const isKadivApproval = role === 'KADIV' || role === 'ADMIN' || role === 'SUPERADMIN'
  const label = role === 'KASUBDIV' ? 'Kasub' : isKadivApproval ? 'Kadiv' : 'Owner'
  const hasDecisionSignal = 'decisionLabel' in program
  const approvalScore =
    hasDecisionSignal && program.blockingLevel === 'HIGH'
      ? policy.approval.highBlockingScore
      : isKadivApproval
        ? policy.approval.kadivScore
        : role === 'KASUBDIV'
          ? policy.approval.kasubScore
          : policy.approval.ownerScore
  return {
    id: `approval-${program.id}`,
    kind: 'approval',
    section: 'mention',
    title: program.name,
    meta: `${program.code} · ${program.approvalStatus?.replace(/_/g, ' ') ?? 'Approval'}`,
    reason: hasDecisionSignal
      ? program.decisionReason
      : role === 'KASUBDIV' || isKadivApproval
      ? `Awaiting your ${label} decision so the program can proceed`
      : 'Draft not yet submitted and awaiting your action',
    roleCue: hasDecisionSignal ? program.decisionLabel : role === 'KASUBDIV' || isKadivApproval ? `You are the ${label} approver` : 'You are the submission owner',
    nextCue: role === 'KASUBDIV' || isKadivApproval ? 'Decide to clear the bottleneck' : 'Submit it to enter the approval flow',
    actionLabel: hasDecisionSignal && program.decisionType === 'SUBMIT_PROGRAM' ? 'Submit →' : role === 'KASUBDIV' || isKadivApproval ? 'Review →' : 'Submit →',
    score: approvalScore,
    urgency: 'decide',
    chip: 'Approval',
    evidence: focusEvidence([
      `${label} role`,
      hasDecisionSignal && program.blockingLevel === 'HIGH' ? 'High blocking' : 'Holding up the flow',
      program.approvalStatus?.replace(/_/g, ' '),
    ]),
    entityId: program.id,
  }
}

function actionItemFocusItem(item: MyActionItem, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const due = dueLabel(item.dueDate, policy)
  const dueDays = daysUntil(item.dueDate)
  const urgency: Urgency =
    dueDays !== null && dueDays < 0 ? 'critical' :
    dueDays !== null && dueDays <= 1 ? 'warn' : 'info'
  const score = 26 + dueScore(item.dueDate, policy) + (item.status === 'OPEN' ? 2 : 0)
  return {
    id: `action_item-${item.id}`,
    kind: 'action_item',
    section: 'assigned',
    title: item.title,
    meta: 'Meeting action item',
    reason: due ?? 'Action item from a meeting awaiting follow-through',
    roleCue: 'You own this meeting action item',
    nextCue: due ? 'Close it before it slips' : 'Update or complete the action item',
    actionLabel: 'Work on it →',
    score,
    urgency,
    chip: due ?? item.status.replace(/_/g, ' '),
    evidence: focusEvidence(['Meeting action', due, item.status === 'OPEN' ? 'Open' : null]),
    entityId: item.id,
  }
}

function assignmentFocusItem(item: MyAssignment, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const due = dueLabel(item.dueDate, policy)
  const dueDays = daysUntil(item.dueDate)
  const urgency: Urgency =
    dueDays !== null && dueDays < 0 ? 'critical' :
    dueDays !== null && dueDays <= 1 ? 'warn' :
    item.priority === 'CRITICAL' || item.priority === 'HIGH' ? 'warn' : 'info'
  const score = 24 + (PRIORITY_SCORE[item.priority] ?? 8) + dueScore(item.dueDate, policy)
  return {
    id: `assignment-${item.id}`,
    kind: 'assignment',
    section: 'assigned',
    title: item.title,
    meta: item.code,
    reason: due ?? `${(item.priority ?? '').toLowerCase() || 'active'} priority assignment awaiting your action`,
    roleCue: 'You are the assignee',
    nextCue: due ? 'Acknowledge or complete before the deadline' : 'Acknowledge and start the assignment',
    actionLabel: 'Open →',
    score,
    urgency,
    chip: due ?? (item.priority === 'HIGH' || item.priority === 'CRITICAL' ? `${item.priority} priority` : item.status.replace(/_/g, ' ')),
    evidence: focusEvidence(['Assignment', due, item.priority === 'HIGH' || item.priority === 'CRITICAL' ? `${item.priority} priority` : null]),
    entityId: item.id,
  }
}

/** Escalation yang user (atasan) commit tapi belum resolve — open-loop yang harus
 *  ditutup. Klik → EscalationTriagePanel (Resolve inline). */
function committedEscalationFocusItem(esc: CommittedEscalation, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const due = dueLabel(esc.commitmentDueDate, policy)
  const dueDays = daysUntil(esc.commitmentDueDate)
  const urgency: Urgency =
    dueDays !== null && dueDays < 0 ? 'critical' :
    dueDays !== null && dueDays <= 1 ? 'warn' : 'info'
  const score = 40 + dueScore(esc.commitmentDueDate, policy)
  return {
    id: `escalation-${esc.id}`,
    kind: 'escalation',
    section: 'blocker',
    title: esc.title,
    meta: esc.linkedProgram ? esc.linkedProgram.code : esc.code,
    reason: due ? `You committed to clear this — ${due.toLowerCase()}` : 'You committed to clear this — follow through',
    roleCue: 'You committed to clear this escalation',
    nextCue: 'Resolve it or it stays an open promise to your team',
    actionLabel: 'Resolve →',
    score,
    urgency,
    chip: due ?? 'Committed',
    evidence: focusEvidence(['Your commitment', due, esc.linkedProgram?.code ?? null]),
    entityId: esc.id,
  }
}

/**
 * Format notification.source jadi label human-friendly untuk card meta line.
 * Sebelumnya raw source bocor sebagai "program:24" / "channel:11" — confusing.
 * Rules:
 *   - `program:N` → resolve ke program.code (mis. "PRG-DIMR-PPM-002")
 *   - `Name·entity:id` → return Name (display segment di depan ·)
 *   - lainnya `entity:id` saja → return '' (hide)
 */
function humanizeNotificationMeta(source: string, programs: Program[]): string {
  if (!source) return ''
  const parts = source.split('·').map(s => s.trim()).filter(Boolean)
  if (parts.length > 1) {
    // First segment biasanya display name (mis. "Dimas Aryo Wibisono" di DM)
    return parts[0]
  }
  const colonIdx = source.indexOf(':')
  if (colonIdx > 0) {
    const type = source.slice(0, colonIdx)
    const id = Number(source.slice(colonIdx + 1).split(':')[0])
    if (type === 'program' && !isNaN(id)) {
      const prog = programs.find(p => p.id === id)
      return prog?.code ?? ''
    }
    // task:N / assignment:N / channel:N — tidak punya resolver di scope ini,
    // hide aja daripada tampil raw.
    return ''
  }
  return source
}

/** Verb-specific CTA per notification type. Generic "Buka"/"Lihat" lemah —
 *  user lebih jelas apa yang harus dilakukan. */
function notifVerbFor(type: string): string {
  switch (type) {
    case 'PROGRAM_NEEDS_APPROVAL': case 'APPROVAL': return 'Review'
    case 'PROGRAM_REJECTED': return 'Fix'
    case 'PROGRAM_WITHDRAWN': case 'PROGRAM_APPROVED': return 'View program'
    case 'PROGRAM_COMMITMENT_CHANGED': return 'View change'
    case 'DM_RECEIVED': return 'Reply'
    case 'MENTION': return 'Open conversation'
    case 'BLOCKER_CREATED': return 'Follow up'
    case 'TASK_ASSIGNED': return 'Work on it'
    case 'DEADLINE_APPROACHING': return 'Check deadline'
    case 'MEETING_INVITED': case 'MEETING_DELEGATED': return 'Confirm'
    case 'ACTION_ITEM_ASSIGNED': return 'Work on it'
    case 'CLEAR_PATH_REQUESTED': return 'Disposition'
    default: return 'Open'
  }
}

function notificationFocusItem(notification: NotificationItem, programs: Program[]): FocusItem {
  const requiresAction = notification.requiresAction ?? (
    notification.type === 'REPORT_NEEDS_REVISION' ||
    notification.type === 'PROGRAM_NEEDS_APPROVAL' ||
    notification.type === 'PROGRAM_REJECTED' ||
    notification.type === 'DEADLINE_APPROACHING' ||
    notification.type === 'BLOCKER_CREATED' ||
    notification.type === 'TASK_ASSIGNED' ||
    notification.type === 'DM_RECEIVED' ||
    notification.type === 'MENTION'
  )
  const isHighSignal =
    notification.priority === 'CRITICAL' ||
    notification.priority === 'HIGH' ||
    notification.type === 'REPORT_NEEDS_REVISION' ||
    notification.type === 'PROGRAM_NEEDS_APPROVAL' ||
    notification.type === 'PROGRAM_REJECTED' ||
    notification.type === 'DEADLINE_APPROACHING' ||
    notification.type === 'BLOCKER_CREATED'

  return {
    id: `notification-${notification.id}`,
    kind: notification.type === 'MENTION' || notification.type === 'DM_RECEIVED' ? 'mention' : 'notification',
    section: notification.type === 'MENTION' || notification.type === 'DM_RECEIVED' ? 'mention' : 'notif',
    title: NOTIF_TYPE_LABEL[notification.type] ?? notification.type,
    meta: humanizeNotificationMeta(notification.source, programs),
    reason: notification.message,
    impact: notification.impact,
    roleCue: notification.roleImpact ?? notificationRoleCue(notification),
    nextCue: notification.impact ?? notificationNextCue(notification),
    actionLabel: `${notification.actionLabel ?? notifVerbFor(notification.type)} →`,
    score: (isHighSignal ? 66 : requiresAction ? 54 : 42) + recencyScore(notification.createdAt),
    urgency: isHighSignal && notification.type !== 'MENTION' && notification.type !== 'DM_RECEIVED' ? 'warn' : 'info',
    chip: NOTIF_TYPE_LABEL[notification.type] ?? notification.type,
    evidence: focusEvidence([
      NOTIF_TYPE_LABEL[notification.type] ?? notification.type,
      recencyScore(notification.createdAt) >= 10 ? 'New' : null,
      requiresAction ? 'Needs action' : null,
      notification.priority ? `${notification.priority} priority` : null,
    ]),
    notificationId: notification.id,
    source: notification.source,
  }
}

function notificationGroupKey(notification: NotificationItem): string {
  if (notification.groupKey) return notification.groupKey
  const entity = notification.source.split('·').map(part => part.trim()).find(part => part.includes(':'))
  return entity ?? `${notification.type}:${notification.source}`
}

function groupNotifications(items: NotificationItem[]): NotificationGroup[] {
  const byKey = new Map<string, NotificationGroup>()
  for (const notification of items) {
    const key = notificationGroupKey(notification)
    const group = byKey.get(key)
    if (!group) {
      byKey.set(key, {
        id: key,
        latest: notification,
        items: [notification],
        unreadCount: notification.state === 'UNREAD' ? 1 : 0,
      })
      continue
    }
    group.items.push(notification)
    if (notification.state === 'UNREAD') group.unreadCount += 1
    const shouldPreferUnread = notification.state === 'UNREAD' && group.latest.state !== 'UNREAD'
    const isNewerSameReadState =
      notification.state === group.latest.state &&
      new Date(notification.createdAt).getTime() > new Date(group.latest.createdAt).getTime()
    if (shouldPreferUnread || isNewerSameReadState) {
      group.latest = notification
    }
  }
  return Array.from(byKey.values()).sort((a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime())
}

function focusItemMatchesScope(item: FocusItem, scope: FocusScope): boolean {
  if (scope === 'all') return true
  if (scope === 'action') return item.kind === 'task' || item.kind === 'blocker' || item.kind === 'approval' || item.kind === 'action_item' || item.kind === 'assignment' || item.kind === 'escalation' || (item.kind === 'notification' && item.urgency !== 'info')
  if (scope === 'risk') return item.kind === 'program' || item.kind === 'blocker' || item.urgency === 'critical' || item.urgency === 'warn'
  if (scope === 'communication') return item.kind === 'mention' || item.kind === 'dm' || (item.kind === 'notification' && item.section === 'mention')
  return item.kind === 'meeting' || item.kind === 'focus'
}

/** Verb-driven CTA per item kind. Primary CTA only for genuinely urgent items. */
function ctaFor(item: FocusItem): { label: string; primary: boolean } {
  if (item.kind === 'blocker')                       return { label: 'Handle',      primary: true  }
  if (item.kind === 'approval')                      return { label: 'Decide',      primary: true  }
  if (item.kind === 'escalation')                    return { label: 'Resolve',     primary: item.urgency === 'critical' || item.urgency === 'warn' }
  if (item.kind === 'task')                          return { label: 'Work on it',  primary: item.urgency === 'critical' }
  if (item.kind === 'action_item')                   return { label: 'Work on it',  primary: item.urgency === 'critical' }
  if (item.kind === 'assignment')                    return { label: 'Open',        primary: item.urgency === 'critical' }
  if (item.kind === 'program')                       return { label: 'Review',      primary: false }
  if (item.kind === 'mention' || item.kind === 'dm') return { label: 'Reply',       primary: false }
  if (item.kind === 'meeting' || item.kind === 'focus') return { label: 'Open schedule', primary: false }
  // Notification cards — strip the " →" suffix yang ditambahkan oleh
  // notificationFocusItem.actionLabel; promote ke primary kalau urgency-nya warn/critical
  // (mis. PROGRAM_NEEDS_APPROVAL, PROGRAM_REJECTED) supaya user lihat itu butuh aksi.
  if (item.kind === 'notification' && item.actionLabel) {
    const label = item.actionLabel.replace(/\s*→\s*$/, '')
    return { label, primary: item.urgency === 'warn' || item.urgency === 'critical' }
  }
  return { label: 'View', primary: false }
}

/** Map item.kind to a per-kind icon. Replaces section-based icon (which was generic). */
const KIND_ICON: Record<FocusItemKind, React.ReactNode> = {
  task: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
      <path d="m5.5 8 2 2 3.5-4" />
    </svg>
  ),
  blocker: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M3.8 3.8l8.4 8.4" />
    </svg>
  ),
  approval: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2.5 13.5 5l-7 7H4v-2.5l7-7z" />
      <path d="M9.5 4 12 6.5" />
    </svg>
  ),
  program: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
      <path d="M5.5 6h5M5.5 9h5M5.5 12h3" />
    </svg>
  ),
  mention: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M10.5 8a2.5 2.5 0 0 0-2.5-2.5M13.5 8a5.5 5.5 0 1 1-5.5-5.5" />
      <path d="M13.5 5.5V8h-2.5" />
    </svg>
  ),
  dm: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6z" />
    </svg>
  ),
  meeting: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M5 1.5v3M11 1.5v3M2 7h12" />
    </svg>
  ),
  focus: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
    </svg>
  ),
  notification: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2a4.5 4.5 0 0 1 4.5 4.5V9l1 2H2.5l1-2V6.5A4.5 4.5 0 0 1 8 2z" />
      <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  ),
  action_item: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
    </svg>
  ),
  assignment: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 2.5h5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
      <path d="M6.5 2.5V4h3V2.5M7 8.5l1 1 2-2.5" />
    </svg>
  ),
  escalation: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13V3M4 7l4-4 4 4" />
    </svg>
  ),
}

/** Tombol snooze (ikon bulan) — tunda item sampai besok. Icon-only, muted. */
function SnoozeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title="Snooze until tomorrow"
      aria-label="Snooze until tomorrow"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid var(--panel-border)', borderRadius: 8, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.2 9.6A5.5 5.5 0 1 1 6.4 2.8a4.5 4.5 0 0 0 6.8 6.8z" />
      </svg>
    </button>
  )
}

// ── Item presentation ──────────────────────────────────────────────────────

/** Hero card — Linear-style: just left rail + typography hierarchy.
 *  No icon BG pill, no border tint, no colored chips. Color = 1 rail line. */
function FokusHeroCard({
  item,
  onAction,
  onSnooze,
}: {
  item: FocusItem
  onAction: (item: FocusItem, rank?: number) => void
  onSnooze?: (item: FocusItem) => void
}) {
  const cta = ctaFor(item)
  return (
    <article className={`fokus-hero-card fokus-hero-card--${item.urgency}`}>
      <span className="fokus-hero-card__icon" aria-hidden="true">
        {KIND_ICON[item.kind]}
      </span>
      <div className="fokus-hero-card__body">
        <h4 className="fokus-hero-card__title">{item.title}</h4>
        <p className="fokus-hero-card__meta">{item.meta}</p>
        <p className="fokus-hero-card__reason">
          {item.impact ? <><strong>{item.impact}.</strong> {item.reason}</> : item.reason}
        </p>
        {item.nextCue && (
          <p className="fokus-hero-card__next">→ {item.nextCue}</p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {onSnooze && <SnoozeButton onClick={() => onSnooze(item)} />}
        <button
          type="button"
          className={`fokus-cta fokus-cta--lg${cta.primary ? ' fokus-cta--primary' : ''}`}
          onClick={() => onAction(item, 1)}
        >
          {cta.label}
        </button>
      </div>
    </article>
  )
}

/** Compact row — Linear-style restraint:
 *  - Icon: small SVG, no background pill
 *  - Title: black, bold
 *  - Meta: single muted line. Chip only if it adds info NOT already in reason.
 *  - Color: ONE signal — left rail. No colored chip. Critical = inline red text via class. */
function FokusItemRow({
  item,
  rank,
  onAction,
  onSnooze,
  muted = false,
}: {
  item: FocusItem
  rank: number
  onAction: (item: FocusItem, rank?: number) => void
  onSnooze?: (item: FocusItem) => void
  muted?: boolean
}) {
  const cta = ctaFor(item)
  // Dedupe: if chip text already appears in reason, drop it.
  const showChip = item.chip && !item.reason.toLowerCase().includes(item.chip.toLowerCase())
  return (
    <li className={`fokus-row fokus-row--${item.urgency}${muted ? ' fokus-row--muted' : ''}`}>
      <span className="fokus-row__icon" aria-hidden="true">
        {KIND_ICON[item.kind]}
      </span>
      <div className="fokus-row__body">
        <div className="fokus-row__title">{item.title}</div>
        <div className="fokus-row__meta">
          {showChip && <><span className="fokus-row__chip">{item.chip}</span> · </>}
          <span>{item.reason}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {onSnooze && <SnoozeButton onClick={() => onSnooze(item)} />}
        <button
          type="button"
          className={`fokus-cta fokus-cta--sm${cta.primary ? ' fokus-cta--primary' : ''}`}
          onClick={() => onAction(item, rank)}
        >
          {cta.label}
        </button>
      </div>
    </li>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────

export function InboxView() {
  const {
    notifications, markNotificationRead, loadOverview,
    programs, myWork, programSummary,
    currentUser, setSelectedProgramId, setSelectedTaskId, setSelectedChannelId,
  } = useWorkspace()
  const navigate = useInertiaNavigate()

  function navigateToNotifSource(source: string) {
    // Source dapat berupa: "type:id", "name·type:id", atau kombinasi lain
    // Iterasi semua parts — ambil entitas navigable pertama.
    //
    // Untuk program & task: navigate ke DETAIL page (/programs/{id}),
    // bukan list. User klik notif "menunggu persetujuan Anda" memang mau
    // landed di tempat yang punya tombol Setujui/Tolak, bukan harus cari
    // sendiri dari list. Plus list-page navigation pernah glitch (URL
    // berubah tapi component tidak rerender) — detail route lebih stabil.
    for (const part of source.split('·').map(p => p.trim())) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      const type = part.slice(0, colon)
      const id = Number(part.slice(colon + 1).split(':')[0])
      if (type === 'task' && !isNaN(id)) { navigate(`/execution/tasks/${id}`); return }
      if (type === 'program' && !isNaN(id)) { navigate(`/programs/${id}`); return }
      if (type === 'channel' && !isNaN(id)) { setSelectedChannelId(id); navigate('/channels'); return }
      if (type === 'workstream' && !isNaN(id)) { navigate('/programs'); return }
      if (type === 'assignment' && !isNaN(id)) { navigate('/penugasan'); return }
      if (type === 'report') { navigate('/laporan-bulanan'); return }
    }
    navigate('/fokus')
  }

  async function handleNotifClick(notifId: number, source: string) {
    await markNotificationRead(notifId)
    navigateToNotifSource(source)
  }
  async function _handleNotifGroupClick(group: NotificationGroup) {
    await Promise.all(group.items.map(n => api.put(`/notifications/${n.id}/read`, {})))
    await loadOverview('refresh')
    navigateToNotifSource(group.latest.source)
  }
  // Disposition panel untuk item "Needs Action" — menutup loop follow-up
  // (Berikan dukungan / Teruskan ke atas / Tandai ditangani) alih-alih hanya
  // melempar ke workspace program. `dismissedNeedsAction` menyembunyikan item
  // secara optimistik setelah diaksi; backend menyembunyikannya permanen via
  // FocusDisposition saat reload.
  const [activeNeedsAction, setActiveNeedsAction] = useState<NeedsActionItem | null>(null)
  const [dismissedNeedsAction, setDismissedNeedsAction] = useState<Set<string>>(new Set())
  // Triage panel untuk escalation yang saya commit (Resolve inline) — menutup loop.
  const [activeEscalationTriage, setActiveEscalationTriage] = useState<EscalationRequestType | null>(null)
  // Quick-action panel (resolve blocker / log progress) inline tanpa pindah halaman.
  const [activeQuick, setActiveQuick] = useState<{ kind: 'blocker' | 'task'; entityId: number; taskId?: number; title: string; prefillPercent: number } | null>(null)
  // Snooze item feed ranked: { [focusItemId]: untilEpochMs }. Disimpan di
  // localStorage supaya item yang sengaja ditunda tidak muncul lagi sampai waktunya
  // (anti Focus-fatigue). Entry kedaluwarsa dibersihkan saat load.
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => loadSnoozed())
  const [markingAll, setMarkingAll] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const showToast = (msg: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ msg, tone })
    toastTimerRef.current = window.setTimeout(() => setToast(null), tone === 'error' ? 3200 : 2200)
  }

  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const isStrategic = role === 'BOD' || role === 'KADIV'
  // Hanya BOD read-only (memory project_officer_write_enabled). Sisanya boleh aksi
  // inline (resolve blocker / log progress) langsung dari kartu Focus.
  const canQuickAct = role !== 'BOD'

  // Deep-link dari notifikasi Clear the Path: /fokus?escalation={id} → buka triage
  // panel langsung. Tanpa ini, klik notif Clear the Path mendarat di Focus tanpa
  // membuka apa pun (audit notif 2026-06-24). Pola StrictMode-safe: JANGAN hapus
  // query secara sinkron — remount (StrictMode/HMR) memberi instance baru yang
  // membaca ulang query; kalau sudah dihapus, fetch tak pernah jalan di instance
  // hidup. Hapus param di dalam .then (setelah state ter-set).
  useEffect(() => {
    const escId = new URLSearchParams(window.location.search).get('escalation')
    if (!escId) return
    let active = true
    void api.get<{ data: EscalationRequestType }>(`/escalations/${escId}`)
      .then(r => {
        if (!active) return
        setActiveEscalationTriage(r.data)
        const url = new URL(window.location.href)
        url.searchParams.delete('escalation')
        window.history.replaceState({}, '', url.pathname + url.search)
      })
      .catch(() => { /* tak punya akses / fitur off → abaikan diam-diam */ })
    return () => { active = false }
  }, [])
  // Default Focus = program terkait user. Role strategis bisa beralih ke
  // portfolio divisi (at-risk) lewat toggle (catatan 24 Jun 2026).
  const [programScope, setProgramScope] = useState<'mine' | 'division'>('mine')

  // ── Data from /api/my-work (personal assignments) ─────────────────────────
  const myTasks = myWork?.tasks ?? []
  const myBlockers = myWork?.blockers ?? []
  const myActionItems = myWork?.actionItems ?? []
  const myAssignments = myWork?.assignments ?? []
  const myCommittedEscalations = myWork?.committedEscalations ?? []
  const focusPolicy = myWork?.focusPolicy ?? DEFAULT_FOCUS_POLICY

  // ── At-risk programs: scope-aware source ──────────────────────────────────
  // Default ("mine"): hanya program TERKAIT user — owner/co-PIC/owner workstream/
  // assignee task/member channel (myWork.programs, di-resolve BE via
  // MembershipResolver). Ini default semua role, termasuk BOD/KADIV (catatan
  // 24 Jun 2026: "cukup yang terkait dengan program user terkait saja").
  // Role strategis bisa beralih ke "division" = portfolio at-risk se-scope.
  //
  // ACTIVE-only filter: "perlu dipantau sebelum memburuk" cuma make sense untuk
  // program yang sedang berjalan. DRAFT/PENDING_*/COMPLETED tidak relevan —
  // belum ada eksekusi yang bisa memburuk, atau sudah ditutup. Memunculkan
  // mereka di feed at-risk = noise (PIC PENDING tidak bisa "intervensi" apa-apa,
  // mereka menunggu approval; program COMPLETED ya sudah selesai).
  const isActive = (p: Program) => p.approvalStatus === 'ACTIVE'
  const minePrograms = (myWork?.programs ?? []).filter(isActive)
  const divisionAtRisk = programs.filter(p => isActive(p) && (p.healthStatus === 'RED' || p.healthStatus === 'YELLOW'))
  const showDivisionPrograms = isStrategic && programScope === 'division'
  const myAtRisk = showDivisionPrograms ? divisionAtRisk : minePrograms

  // ── Notifications ──────────────────────────────────────────────────────────
  const MENTION_TYPES = new Set(['MENTION', 'APPROVAL', 'DM_RECEIVED'])
  const mentions = notifications.filter(n =>
    MENTION_TYPES.has(n.type) && n.state === 'UNREAD'
  )

  const otherUnread = notifications.filter(n =>
    n.state === 'UNREAD' && !MENTION_TYPES.has(n.type)
  )

  const _otherUnreadGroups = groupNotifications(otherUnread)

  const actionableOtherUnread = otherUnread.filter(n =>
    n.type === 'REPORT_NEEDS_REVISION' ||
    n.type === 'PROGRAM_NEEDS_APPROVAL' ||
    n.type === 'PROGRAM_REJECTED' ||
    n.type === 'DEADLINE_APPROACHING' ||
    n.type === 'BLOCKER_CREATED' ||
    n.type === 'TASK_ASSIGNED'
  )
  const actionableOtherGroups = groupNotifications(actionableOtherUnread)

  // ── Programs needing current user's approval action ───────────────────────
  const explicitDecisionPrograms = myWork?.decisions ?? []
  const inferredDecisionPrograms = programs.filter(p => {
    if (role === 'KASUBDIV') return p.approvalStatus === 'PENDING_KASUB'
    if (['KADIV', 'ADMIN', 'SUPERADMIN'].includes(role)) return p.approvalStatus === 'PENDING_KADIV'
    return p.approvalStatus === 'DRAFT' && p.submittedById === currentUser?.id
  })
  const pendingApprovalPrograms: ApprovalCandidate[] =
    explicitDecisionPrograms.length > 0 ? explicitDecisionPrograms : inferredDecisionPrograms

  const [focusScope, setFocusScope] = useState<FocusScope>('all')

  // ── Today's meetings ────────────────────────────────────────────────────
  const [todayMeetings, setTodayMeetings] = useState<Meeting[]>([])
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    api.get<{ data: Meeting[] }>(`/meetings?from=${today}&to=${today}&limit=10`)
      .then(res => {
        const all = res.data ?? []
        const uid = currentUser?.id
        // Only show meetings I'm attending or organizing, status SCHEDULED or ONGOING
        const mine = all.filter(m =>
          (m.status === 'SCHEDULED' || m.status === 'ONGOING') &&
          (m.organizerId === uid || m.attendees.some(a => a.userId === uid))
        )
        mine.sort((a, b) => a.startAt.localeCompare(b.startAt))
        setTodayMeetings(mine)
      })
      .catch((err) => console.error('[Atlas] Gagal memuat jadwal meeting hari ini:', err))
  }, [currentUser?.id])

  const _MEETING_TYPE_LABEL: Record<string, string> = {
    RAPAT_DIREKSI:    'Rapat Direksi',
    RAPAT_KOORDINASI: 'Rapat Koordinasi',
    RAPAT_DIVISI:     'Rapat Divisi',
    RAPAT_TIM:        'Rapat Tim',
    ONE_ON_ONE:       '1-on-1',
  }

  // ── Today's focus blocks ─────────────────────────────────────────────────
  const [todayFocusBlocks, setTodayFocusBlocks] = useState<FocusBlock[]>([])
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    api.get<{ data: FocusBlock[] }>(`/focus-blocks?from=${today}&to=${today}`)
      .then(res => {
        const blocks = (res.data ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt))
        setTodayFocusBlocks(blocks)
      })
      .catch((err) => console.error('[Atlas] Gagal memuat focus blocks hari ini:', err))
  }, [currentUser?.id])

  const rankedFocusItems = (() => {
    const meetingItems: FocusItem[] = todayMeetings.slice(0, 2).map((meeting) => {
      const isOngoing = meeting.status === 'ONGOING'
      const start = new Date(meeting.startAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      const end = new Date(meeting.endAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      return {
        id: `meeting-${meeting.id}`,
        kind: 'meeting',
        section: 'notif',
        title: meeting.title,
        meta: `${start} – ${end}${meeting.location ? ` · ${meeting.location}` : ''}`,
        reason: isOngoing ? 'Meeting in progress and needs your attention' : "Today's agenda to prepare for",
        roleCue: "You're a participant in today's agenda",
        nextCue: isOngoing ? 'Join now or check the discussion outcome' : 'Prepare context before the agenda starts',
        actionLabel: 'Open schedule →',
        score: isOngoing ? 72 : 44 + recencyScore(meeting.startAt),
        urgency: isOngoing ? 'warn' : 'info',
        chip: isOngoing ? 'In progress' : 'Meeting',
        evidence: focusEvidence([
          isOngoing ? 'In progress' : "Today's agenda",
          meeting.location ? 'Has a location' : null,
          'Schedule',
        ]),
        entityId: meeting.id,
      }
    })

    const focusBlockItems: FocusItem[] = todayFocusBlocks.slice(0, 1).map((block) => {
      const now = Date.now()
      const isActive = now >= new Date(block.startAt).getTime() && now <= new Date(block.endAt).getTime()
      const start = new Date(block.startAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const end = new Date(block.endAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      return {
        id: `focus-${block.id}`,
        kind: 'focus',
        section: 'priority',
        title: block.title,
        meta: `${start} – ${end}`,
        reason: isActive ? 'Focus slot is active; pick one priority to finish' : block.note || "Today's focus slot is scheduled",
        roleCue: 'You own this focus time',
        nextCue: isActive ? 'Use this slot for one main action' : 'Protect the time from distractions',
        actionLabel: 'Open schedule →',
        score: isActive ? 70 : 38,
        urgency: isActive ? 'warn' : 'info',
        chip: isActive ? 'Active' : 'Focus',
        evidence: focusEvidence([
          isActive ? 'Active slot' : "Today's slot",
          'Time protection',
          block.note ? 'Has a note' : null,
        ]),
        entityId: block.id,
      }
    })

    // Chat (channel mentions + DM) sengaja TIDAK masuk Focus — rumahnya di
    // Channels (badge unread). Focus = komitmen + keputusan + notifikasi
    // actionable (task/program/deadline/blocker/report), bukan percakapan.
    const notificationItems = actionableOtherGroups.map(group => notificationFocusItem(group.latest, programs))

    return [
      ...myCommittedEscalations.map(esc => committedEscalationFocusItem(esc, focusPolicy)),
      ...myBlockers.map(blocker => blockerFocusItem(blocker, focusPolicy)),
      ...myTasks.map(task => taskFocusItem(task, focusPolicy)),
      ...myActionItems.map(item => actionItemFocusItem(item, focusPolicy)),
      ...myAssignments.map(item => assignmentFocusItem(item, focusPolicy)),
      ...pendingApprovalPrograms.map(program => approvalFocusItem(program, role, focusPolicy)),
      ...myAtRisk.map(program => programFocusItem(program, isStrategic)),
      ...notificationItems,
      ...meetingItems,
      ...focusBlockItems,
    ]
      .sort((a, b) => b.score - a.score)
  })()
  // Dedup: approval items already shown in ActionPanel don't need to appear in the focus list
  const actionPanelIds = new Set((programSummary?.needsAction ?? []).map(n => n.id))
  const deduplicatedItems = rankedFocusItems.filter(item =>
    (item.kind !== 'approval' || !actionPanelIds.has(item.entityId ?? -1)) &&
    // Item yang di-snooze disembunyikan sampai waktunya.
    !(snoozed[item.id] && snoozed[item.id] > Date.now())
  )
  const scopedRankedFocusItems = deduplicatedItems.filter(item => focusItemMatchesScope(item, focusScope))

  // 'communication' (chat) sengaja dihilangkan dari filter Focus — DM & channel
  // mention tak lagi disurface di sini (rumahnya Channels).
  const focusScopeOptions = (['all', 'action', 'risk', 'schedule'] as FocusScope[]).map(scope => ({
    scope,
    label: FOCUS_SCOPE_LABEL[scope],
    count: scope === 'all'
      ? deduplicatedItems.length
      : deduplicatedItems.filter(item => focusItemMatchesScope(item, scope)).length,
  }))

  const handleMarkAllRead = async () => {
    if (markingAll) return
    setMarkingAll(true)
    try { await api.put('/notifications/read-all', {}); await loadOverview('refresh') }
    catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to mark all notifications read.', 'error')
    } finally { setMarkingAll(false) }
  }
  const goToProgram = (id: number) => { setSelectedProgramId(id); navigate('/programs') }
  const goToTask = (id?: number) => {
    if (id) setSelectedTaskId(id)
    navigate('/execution')
  }
  const logFocusInteraction = (item: FocusItem, rank?: number) => {
    const inferredRank = scopedRankedFocusItems.findIndex(candidate => candidate.id === item.id) + 1
    void api.post('/analytics/focus-interactions', {
      itemId: item.id,
      kind: item.kind,
      section: item.section,
      action: 'open',
      scope: focusScope,
      rank: rank ?? (inferredRank > 0 ? inferredRank : undefined),
      score: item.score,
      targetEntityId: item.entityId ?? item.taskId ?? item.channelId ?? item.notificationId ?? 0,
      targetKind: item.kind,
      evidence: item.evidence ?? [],
      policyProfile: focusPolicy.profile,
      policySource: focusPolicy.source,
    }).catch(() => {})
  }
  const handleFocusScopeChange = (nextScope: FocusScope, count: number) => {
    if (nextScope === focusScope) return
    void api.post('/analytics/focus-interactions', {
      itemId: `scope-${nextScope}`,
      kind: 'scope',
      section: 'priority',
      action: 'scope_change',
      scope: nextScope,
      score: count,
      targetEntityId: 0,
      targetKind: 'scope',
      evidence: [`${count} item`, `Dari ${FOCUS_SCOPE_LABEL[focusScope]}`],
      policyProfile: focusPolicy.profile,
      policySource: focusPolicy.source,
    }).catch(() => {})
    setFocusScope(nextScope)
  }
  const handleFocusItemClick = (item: FocusItem, rank?: number) => {
    logFocusInteraction(item, rank)
    if (item.notificationId && item.source) {
      void handleNotifClick(item.notificationId, item.source)
      return
    }
    if (item.kind === 'task') {
      if (canQuickAct && item.entityId) {
        const prefill = myTasks.find(t => t.id === item.entityId)?.percentComplete ?? 0
        setActiveQuick({ kind: 'task', entityId: item.entityId, title: item.title, prefillPercent: prefill })
      } else goToTask(item.entityId)
      return
    }
    if (item.kind === 'blocker') {
      if (canQuickAct && item.entityId) {
        setActiveQuick({ kind: 'blocker', entityId: item.entityId, taskId: item.taskId, title: item.title, prefillPercent: 0 })
      } else goToTask(item.taskId)
      return
    }
    if (item.kind === 'escalation') {
      const esc = myCommittedEscalations.find(e => e.id === item.entityId)
      if (esc) setActiveEscalationTriage(esc as unknown as EscalationRequestType)
      return
    }
    if (item.kind === 'action_item') { navigate('/jadwal'); return }
    if (item.kind === 'assignment') { navigate('/penugasan'); return }
    if (item.kind === 'program' || item.kind === 'approval') {
      if (item.entityId) goToProgram(item.entityId)
      return
    }
    if (item.kind === 'dm' && item.channelId) {
      setSelectedChannelId(item.channelId)
      navigate('/channels')
      return
    }
    if (item.kind === 'meeting' || item.kind === 'focus') {
      navigate('/jadwal')
      return
    }
    navigate('/fokus')
  }

  const handleSnooze = (item: FocusItem) => {
    const until = snoozeUntilTomorrow()
    setSnoozed(prev => {
      const next = { ...prev, [item.id]: until }
      try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)) } catch { /* ignore quota */ }
      return next
    })
    showToast('Ditunda sampai besok.')
  }

  // ── Daily progress: completed today (status COMPLETED + updatedAt within today) ──
  const todayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()
  const todayCompletedCount = myTasks.filter(t =>
    (t.status === 'COMPLETED' || t.status === 'IN_REVIEW') &&
    t.updatedAt && new Date(t.updatedAt).getTime() >= todayStart
  ).length

  // ── Urgency buckets: rank-based ──
  // Sekarang  = top 1 (the hero)
  // Hari Ini  = next 5 (rank 2–6) — what realistically completes today
  // Bisa Ditunda = remaining (rank 7+), collapsed by default
  const nowItem    = scopedRankedFocusItems[0] ?? null
  const todayItems = scopedRankedFocusItems.slice(1, 6)
  const laterItems = scopedRankedFocusItems.slice(6)

  const [laterOpen, setLaterOpen] = useState(false)

  // Item Needs Action yang masih perlu ditindaklanjuti (yang sudah di-disposition
  // disembunyikan optimistik via dismissedNeedsAction).
  const visibleNeedsAction = (programSummary?.needsAction ?? [])
    .filter(i => !dismissedNeedsAction.has(`${i.id}:${i.tag}`))

  return (
    <div className="ds fokus-v2 view-inbox">
      {/* `ds-stagger`: motion standardization (no inline modal). */}
      <div className="fokus-v2__inner ds-stagger">
        <PageHeader
          title="Focus"
          subtitle={
            todayCompletedCount > 0
              ? `Today's priority commitments & notifications · ${todayCompletedCount} done`
              : "Today's priority commitments & notifications"
          }
          actions={
            (mentions.length > 0 || otherUnread.length > 0) ? (
              <button
                type="button"
                className="fokus-v2__mark-all"
                disabled={markingAll}
                onClick={() => void handleMarkAllRead()}
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            ) : null
          }
        />

      <div className="fokus-page">

        {/* ── 0. Clear the Path: REQUESTED yang butuh disposition saya (DKM pilot) ──
            Komitmen task/action-item/assignment kini menyatu di feed terprioritisasi
            di bawah (Now/Today/Can Wait) — tidak ada lagi daftar "Today's Commitments"
            terpisah yang menduplikasi task. */}
        {currentUser?.id && <EscalationSections currentUserId={currentUser.id} />}

        {/* ── 1. Eksekutif: Perlu Tindakan (program-level decisions) ── */}
        {visibleNeedsAction.length > 0 && (
          <ActionPanel
            items={visibleNeedsAction}
            onOpen={(id) => {
              const found = visibleNeedsAction.find(i => i.id === id)
              if (found) setActiveNeedsAction(found)
            }}
            title={actionPanelTitleFor(programSummary!.scope)}
          />
        )}

        {/* ── 2. Scope strip — filter pill ── */}
        <div className="fokus-scope-strip" aria-label="Focus reading mode">
          {focusScopeOptions.map(option => (
            <button
              aria-pressed={focusScope === option.scope}
              className={`fokus-scope-pill${focusScope === option.scope ? ' is-active' : ''}`}
              key={option.scope}
              onClick={() => handleFocusScopeChange(option.scope, option.count)}
              type="button"
            >
              <span>{option.label}</span>
              <strong>{option.count}</strong>
            </button>
          ))}
        </div>

        {/* ── 2b. Program scope toggle — strategis: My programs ⟷ Division ── */}
        {isStrategic && (
          <div className="fokus-scope-strip" aria-label="Program scope">
            <button
              aria-pressed={programScope === 'mine'}
              className={`fokus-scope-pill${programScope === 'mine' ? ' is-active' : ''}`}
              onClick={() => setProgramScope('mine')}
              type="button"
            >
              <span>My programs</span>
              <strong>{minePrograms.length}</strong>
            </button>
            <button
              aria-pressed={programScope === 'division'}
              className={`fokus-scope-pill${programScope === 'division' ? ' is-active' : ''}`}
              onClick={() => setProgramScope('division')}
              type="button"
            >
              <span>Division at-risk</span>
              <strong>{divisionAtRisk.length}</strong>
            </button>
          </div>
        )}

        {/* ── 3. SEKARANG — top item as hero card ── */}
        {nowItem && (
          <section className="fokus-bucket fokus-bucket--now">
            <div className="fokus-bucket__head">
              <h3 className="fokus-bucket__label">Now</h3>
            </div>
            <FokusHeroCard item={nowItem} onAction={handleFocusItemClick} onSnooze={handleSnooze} />
          </section>
        )}

        {/* ── 4. HARI INI — next 5 items ── */}
        {todayItems.length > 0 && (
          <section className="fokus-bucket">
            <div className="fokus-bucket__head">
              <h3 className="fokus-bucket__label">Today</h3>
              <span className="fokus-bucket__count">{todayItems.length}</span>
            </div>
            <ul className="fokus-bucket__list">
              {todayItems.map((item, idx) => (
                <FokusItemRow
                  key={item.id}
                  item={item}
                  rank={idx + 2}
                  onAction={handleFocusItemClick}
                  onSnooze={handleSnooze}
                />
              ))}
            </ul>
          </section>
        )}

        {/* ── 5. BISA DITUNDA — collapsed remainder ── */}
        {laterItems.length > 0 && (
          <section className="fokus-bucket fokus-bucket--later">
            <button
              type="button"
              className="fokus-bucket__toggle"
              onClick={() => setLaterOpen(open => !open)}
              aria-expanded={laterOpen}
            >
              <span className={`fokus-bucket__chev${laterOpen ? ' is-open' : ''}`}>▸</span>
              <h3 className="fokus-bucket__label">Can Wait</h3>
              <span className="fokus-bucket__count">{laterItems.length}</span>
            </button>
            {laterOpen && (
              <ul className="fokus-bucket__list">
                {laterItems.map((item, idx) => (
                  <FokusItemRow
                    key={item.id}
                    item={item}
                    rank={idx + 7}
                    onAction={handleFocusItemClick}
                    onSnooze={handleSnooze}
                    muted
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── 6. Empty state ── */}
        {nowItem == null && todayItems.length === 0 && laterItems.length === 0 && visibleNeedsAction.length === 0 && (
          <div className="fokus-zero">
            <div className="fokus-zero__check" aria-hidden="true">✓</div>
            <p className="fokus-zero__title">Your queue is clear</p>
            <p className="fokus-zero__sub">
              Nothing to handle right now. Take a break or check <button type="button" className="fokus-zero__link" onClick={() => navigate('/')}>Home</button> for the division overview.
            </p>
          </div>
        )}

      </div>
      </div>

      {activeNeedsAction && (
        <NeedsActionPanel
          item={activeNeedsAction}
          onClose={() => setActiveNeedsAction(null)}
          onActed={(programId, tag) => {
            setDismissedNeedsAction(prev => new Set(prev).add(`${programId}:${tag}`))
            setActiveNeedsAction(null)
            showToast('Tindak lanjut tersimpan.')
            void loadOverview('refresh')
          }}
        />
      )}

      {activeQuick && (
        <FocusQuickPanel
          kind={activeQuick.kind}
          entityId={activeQuick.entityId}
          title={activeQuick.title}
          prefillPercent={activeQuick.prefillPercent}
          onClose={() => setActiveQuick(null)}
          onActed={() => {
            setActiveQuick(null)
            showToast(activeQuick.kind === 'blocker' ? 'Blocker resolved.' : 'Progress tersimpan.')
            void loadOverview('refresh')
          }}
          onOpenDetail={() => {
            const tid = activeQuick.kind === 'blocker' ? activeQuick.taskId : activeQuick.entityId
            setActiveQuick(null)
            goToTask(tid)
          }}
        />
      )}

      {activeEscalationTriage && currentUser?.id && (
        <EscalationTriagePanel
          request={activeEscalationTriage}
          currentUserId={currentUser.id}
          onClose={() => setActiveEscalationTriage(null)}
          onUpdated={(next) => {
            // Setelah Resolve/disposition, item committed keluar dari feed saat
            // myWork di-refresh (status jadi CLEARED → tak lolos filter myWork).
            if (['CLEARED', 'DECLINED', 'REROUTED'].includes(next.status)) {
              setActiveEscalationTriage(null)
              showToast('Escalation diperbarui.')
            } else {
              setActiveEscalationTriage(next)
            }
            void loadOverview('refresh')
          }}
        />
      )}

      {toast && (
        <div className={`wid-toast wid-toast--${toast.tone}`} role="status" aria-live="polite">
          <span className="wid-toast__icon" aria-hidden="true">
            {toast.tone === 'error'
              ? <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="14"><circle cx="8" cy="8" r="7"/><path d="M8 5v3M8 11h.01"/></svg>
              : <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="14"><path d="m3 8 4 4 6-7"/></svg>
            }
          </span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

export default InboxView
