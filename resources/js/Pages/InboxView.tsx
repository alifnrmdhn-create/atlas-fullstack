import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useState, useEffect, useRef } from 'react'
import type { Blocker, ChannelSummary, FocusPolicy, Meeting, MyWorkDecision, NotificationItem, Program, Task } from '../types'
import { ActionPanel, actionPanelTitleFor } from '../components/ActionPanel'
import { CollapsibleSection, AgingIndicator } from '../components/ui'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useOnboardingTour } from '../hooks/useOnboardingTour'
import { EscalationTriagePanel, type EscalationRequest as EscalationRequestType } from '../components/Escalation'
import './FokusView.css'

// Sprint 2 — Komitmen Hari Ini section
type CommitmentItem = {
  kind: 'task' | 'action_item' | 'assignment'
  id: number
  title: string
  status: string
  due: string
  meetingId?: number
}
type CommitmentPayload = {
  items: CommitmentItem[]
  count: number
  breakdown: { task: number; action_item: number; assignment: number }
}

function CommitmentTodaySection() {
  const navigate = useInertiaNavigate()
  const [data, setData] = useState<CommitmentPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<CommitmentPayload>('/inbox/today')
      .then(payload => { if (!cancelled) { setData(payload); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err?.message || 'Gagal memuat'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const handleClick = (item: CommitmentItem) => {
    if (item.kind === 'task') navigate(`/execution/tasks/${item.id}`)
    else if (item.kind === 'assignment') navigate(`/penugasan`)
    else if (item.kind === 'action_item' && item.meetingId) navigate(`/jadwal`)
  }

  const kindLabel: Record<CommitmentItem['kind'], string> = {
    task: 'Task',
    action_item: 'Action Item',
    assignment: 'Penugasan',
  }

  return (
    <CollapsibleSection
      title="Komitmen Hari Ini"
      count={data?.count ?? 0}
      summary={data ? `${data.breakdown.task} task · ${data.breakdown.action_item} action · ${data.breakdown.assignment} penugasan` : undefined}
      defaultOpen
      persistKey="inbox.commitment-today"
    >
      {loading && (
        <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>Memuat…</div>
      )}
      {error && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--red, #c33)' }}>
          Gagal memuat komitmen: {error}
        </div>
      )}
      {!loading && !error && data && data.items.length === 0 && (
        <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>
          Tidak ada komitmen mendesak hari ini. Nice — fokus ke yang penting tapi belum genting.
        </div>
      )}
      {!loading && !error && data && data.items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.items.map(item => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => handleClick(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', border: '1px solid var(--panel-border)',
                borderRadius: 8, background: 'var(--panel)', cursor: 'pointer',
                textAlign: 'left', font: 'inherit', color: 'var(--text)',
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 6px',
                borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{kindLabel[item.kind]}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.status}</span>
            </button>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}

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

  useEffect(() => { refresh() }, [enabled])

  if (!enabled) return null

  const incomingPending = incoming.filter(e => e.status === 'REQUESTED')
  const mineActive = mine.filter(e => !['CLEARED', 'DECLINED'].includes(e.status))

  return (
    <>
      <div data-tour="escalation-incoming">
      <CollapsibleSection
        title="Permintaan Clear the Path Saya"
        count={incomingPending.length}
        defaultOpen
        persistKey="inbox.escalation-incoming"
      >
        {loading && incoming.length === 0 ? (
          <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>Memuat…</div>
        ) : incomingPending.length === 0 ? (
          <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>
            Tidak ada permintaan menunggu. Tim Anda lancar — bagus.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {incomingPending.map(req => (
              <EscalationRowButton key={req.id} request={req} onClick={() => setActiveTriage(req)} />
            ))}
          </div>
        )}
      </CollapsibleSection>
      </div>

      <div data-tour="escalation-mine">
      <CollapsibleSection
        title="Eskalasi yang Saya Ajukan"
        count={mineActive.length}
        defaultOpen={false}
        persistKey="inbox.escalation-mine"
      >
        {loading && mine.length === 0 ? (
          <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>Memuat…</div>
        ) : mineActive.length === 0 ? (
          <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>
            Belum ada eskalasi aktif dari Anda.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mineActive.map(req => (
              <EscalationRowButton key={req.id} request={req} onClick={() => setActiveTriage(req)} showStatus />
            ))}
          </div>
        )}
      </CollapsibleSection>
      </div>

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
          {request.status === 'REQUESTED' ? 'Menunggu' :
           request.status === 'COMMITTED' ? 'Di-commit' :
           request.status === 'IN_PROGRESS' ? 'Berjalan' :
           request.status === 'REROUTED' ? 'Diteruskan' : request.status}
        </span>
      )}
      <AgingIndicator days={request.agingDays} showText />
    </button>
  )
}

type FocusItemKind = 'task' | 'blocker' | 'program' | 'approval' | 'mention' | 'dm' | 'meeting' | 'focus' | 'notification'
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
  all: 'Semua',
  action: 'Aksi',
  risk: 'Risiko',
  communication: 'Komunikasi',
  schedule: 'Jadwal',
}

const SEV_LABEL: Record<string, string> = {
  CRITICAL: 'Kritis', HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah',
}

const NOTIF_TYPE_LABEL: Record<string, string> = {
  MENTION: 'Mention', APPROVAL: 'Approval', BLOCKER_RAISED: 'Blocker',
  BLOCKER_CREATED: 'Blocker', STATUS_CHANGE: 'Update', COMMENT: 'Komentar',
  ASSIGNED: 'Ditugaskan', TASK_ASSIGNED: 'Ditugaskan', SYSTEM: 'Sistem',
  PROGRAM_NEEDS_APPROVAL: 'Approval', PROGRAM_APPROVED: 'Program',
  PROGRAM_REJECTED: 'Program', REPORT_AWAITING_REVIEW: 'Laporan',
  REPORT_AWAITING_APPROVAL: 'Laporan', REPORT_APPROVED: 'Laporan',
  REPORT_REJECTED: 'Laporan', REPORT_NEEDS_REVISION: 'Laporan',
  DEADLINE_APPROACHING: 'Deadline', DM_RECEIVED: 'DM',
}

function todayLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const DAY_MS = 24 * 60 * 60 * 1000

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
  if (days < 0) return `Lewat ${Math.abs(days)} hari`
  if (days === 0) return 'Jatuh tempo hari ini'
  if (days === 1) return 'Jatuh tempo besok'
  if (days <= policy.due.watchWindowDays) return `Jatuh tempo ${days} hari lagi`
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
  if (days >= policy.idle.criticalAfterDays) return `Idle ${days} hari`
  return `Belum update ${days} hari`
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
  if (notification.type === 'DM_RECEIVED') return 'Anda penerima pesan'
  if (notification.type === 'MENTION') return 'Anda disebut dalam diskusi'
  if (notification.type === 'BLOCKER_CREATED') return 'Anda perlu bantu unblock'
  if (notification.type === 'PROGRAM_NEEDS_APPROVAL' || notification.type === 'APPROVAL') return 'Anda pemberi keputusan'
  if (notification.type === 'REPORT_NEEDS_REVISION') return 'Anda perlu koreksi laporan'
  if (notification.type === 'DEADLINE_APPROACHING') return 'Anda pemilik tenggat'
  if (notification.type === 'TASK_ASSIGNED') return 'Anda pemilik tugas'
  return 'Update relevan untuk Anda'
}

function notificationNextCue(notification: NotificationItem): string {
  if (notification.type === 'DM_RECEIVED') return 'Balas agar alur kerja tidak tertahan'
  if (notification.type === 'MENTION') return 'Buka konteks dan respon bila perlu'
  if (notification.type === 'BLOCKER_CREATED') return 'Follow up hambatan'
  if (notification.type === 'PROGRAM_NEEDS_APPROVAL' || notification.type === 'APPROVAL') return 'Putuskan agar program bisa lanjut'
  if (notification.type === 'REPORT_NEEDS_REVISION') return 'Revisi sebelum proses lanjut'
  if (notification.type === 'DEADLINE_APPROACHING') return 'Amankan sebelum lewat tenggat'
  if (notification.type === 'TASK_ASSIGNED') return 'Mulai atau update progres'
  return 'Cek detail perubahan'
}

function taskFocusItem(task: Task, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const due = dueLabel(task.targetCompletion, policy)
  const idle = idleLabel(task.updatedAt ?? task.createdAt, policy)
  const program = task.workstream?.program
  const programContext = program ? `${program.code} · ${program.name}` : task.workstream?.name
  const programImpact =
    program?.healthStatus === 'RED'
      ? `Berdampak ke program merah ${program.code}`
      : program?.healthStatus === 'YELLOW'
        ? `Menjaga program ${program.code} agar tidak memburuk`
        : program
          ? `Terkait program ${program.code}`
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
      ? task.blockedReason || `${task.blockerCount || 1} blocker menahan progres task ini`
      : due
        ? due
        : idle
          ? idle
          : task.healthStatus === 'RED'
          ? 'Status kesehatan task merah dan perlu diperiksa'
          : task.priority === 'HIGH' || task.priority === 'CRITICAL'
            ? `Prioritas ${task.priority.toLowerCase()}`
            : 'Task aktif yang menunggu progres Anda'

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
    roleCue: task.isBlocked ? 'Anda PIC untuk membuka hambatan' : 'Anda PIC progres task',
    nextCue: task.isBlocked ? 'Selesaikan blocker sebelum progres lanjut' : due ? due : idle ? 'Update status agar risiko tidak tersembunyi' : 'Update progres berikutnya',
    actionLabel: task.isBlocked ? 'Buka blocker →' : 'Kerjakan →',
    score,
    urgency,
    chip: due ?? idle ?? task.status.replace(/_/g, ' '),
    evidence: focusEvidence([
      task.isBlocked && 'Blocked',
      due,
      idle,
      task.healthStatus !== 'GREEN' && `Health ${task.healthStatus}`,
      task.priority === 'HIGH' || task.priority === 'CRITICAL' ? `Prioritas ${task.priority}` : null,
      program?.healthStatus === 'RED' ? 'Program RED' : program?.healthStatus === 'YELLOW' ? 'Program YELLOW' : null,
    ]),
    entityId: task.id,
  }
}

function blockerFocusItem(blocker: Blocker, policy: FocusPolicy = DEFAULT_FOCUS_POLICY): FocusItem {
  const program = blocker.task?.workstream?.program
  const age = daysSince(blocker.createdAt)
  const ageText = age != null && age >= policy.blockerAging.watchAfterDays ? `Terbuka ${age} hari` : null
  const taskContext = blocker.task ? `${blocker.task.code} · ${blocker.task.title}` : blocker.code
  const impact =
    program?.healthStatus === 'RED'
      ? `Menahan task pada program merah ${program.code}`
      : program
        ? `Menahan task pada program ${program.code}`
        : blocker.task
          ? `Menahan task ${blocker.task.code}`
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
    reason: ageText ? `${ageText} · ${SEV_LABEL[blocker.severity] ?? blocker.severity}` : `${SEV_LABEL[blocker.severity] ?? blocker.severity} dan masih membutuhkan tindak lanjut`,
    roleCue: 'Anda perlu membantu unblock pekerjaan',
    nextCue: ageText ? 'Prioritaskan karena blocker sudah menua' : program ? `Dampaknya tersambung ke ${program.code}` : 'Follow up hambatan sampai ada owner',
    actionLabel: 'Follow up →',
    score,
    // Blockers are intrinsically critical — by definition something is blocked.
    // Severity scales the score, not the urgency category.
    urgency: 'critical',
    chip: ageText ?? SEV_LABEL[blocker.severity] ?? blocker.severity,
    evidence: focusEvidence([
      SEV_LABEL[blocker.severity] ?? blocker.severity,
      ageText,
      blocker.status === 'OPEN' ? 'Masih open' : blocker.status.replace(/_/g, ' '),
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

  return {
    id: `program-${program.id}`,
    kind: 'program',
    section: 'atrisk',
    title: program.name,
    meta: `${program.code} · ${program.status.replace(/_/g, ' ')}`,
    reason: program.healthStatus === 'RED'
      ? 'Program merah dan berpotensi berdampak ke portofolio'
      : 'Program kuning perlu dipantau sebelum memburuk',
    roleCue: isStrategic ? 'Anda pemantau portofolio' : 'Program berada di area Anda',
    nextCue: program.healthStatus === 'RED' ? 'Butuh intervensi atau keputusan cepat' : 'Pantau sebelum berubah merah',
    actionLabel: isStrategic ? 'Review program →' : 'Cek program →',
    score,
    urgency: program.healthStatus === 'RED' ? 'critical' : program.healthStatus === 'YELLOW' ? 'warn' : 'info',
    chip: `${program.progressPercent}%`,
    evidence: focusEvidence([
      `Health ${program.healthStatus}`,
      isStrategic ? 'Portfolio' : 'Area Anda',
      `${program.progressPercent}% selesai`,
      program.priority === 'HIGH' || program.priority === 'CRITICAL' ? `Prioritas ${program.priority}` : null,
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
      ? `Menunggu keputusan ${label} Anda agar program bisa lanjut`
      : 'Draft belum diajukan dan masih menunggu tindakan Anda',
    roleCue: hasDecisionSignal ? program.decisionLabel : role === 'KASUBDIV' || isKadivApproval ? `Anda approver ${label}` : 'Anda owner pengajuan',
    nextCue: role === 'KASUBDIV' || isKadivApproval ? 'Putuskan agar bottleneck selesai' : 'Ajukan supaya masuk alur approval',
    actionLabel: hasDecisionSignal && program.decisionType === 'SUBMIT_PROGRAM' ? 'Ajukan →' : role === 'KASUBDIV' || isKadivApproval ? 'Review →' : 'Ajukan →',
    score: approvalScore,
    urgency: 'decide',
    chip: 'Approval',
    evidence: focusEvidence([
      `Peran ${label}`,
      hasDecisionSignal && program.blockingLevel === 'HIGH' ? 'High blocking' : 'Menahan alur',
      program.approvalStatus?.replace(/_/g, ' '),
    ]),
    entityId: program.id,
  }
}

function notificationFocusItem(notification: NotificationItem): FocusItem {
  const requiresAction = notification.requiresAction ?? (
    notification.type === 'REPORT_NEEDS_REVISION' ||
    notification.type === 'PROGRAM_NEEDS_APPROVAL' ||
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
    notification.type === 'DEADLINE_APPROACHING' ||
    notification.type === 'BLOCKER_CREATED'

  return {
    id: `notification-${notification.id}`,
    kind: notification.type === 'MENTION' || notification.type === 'DM_RECEIVED' ? 'mention' : 'notification',
    section: notification.type === 'MENTION' || notification.type === 'DM_RECEIVED' ? 'mention' : 'notif',
    title: NOTIF_TYPE_LABEL[notification.type] ?? notification.type,
    meta: notification.source.split('·').slice(1).join(' · ') || notification.source,
    reason: notification.message,
    impact: notification.impact,
    roleCue: notification.roleImpact ?? notificationRoleCue(notification),
    nextCue: notification.impact ?? notificationNextCue(notification),
    actionLabel: `${notification.actionLabel ?? (notification.type === 'DM_RECEIVED' ? 'Balas' : 'Buka')} →`,
    score: (isHighSignal ? 66 : requiresAction ? 54 : 42) + recencyScore(notification.createdAt),
    urgency: isHighSignal && notification.type !== 'MENTION' && notification.type !== 'DM_RECEIVED' ? 'warn' : 'info',
    chip: NOTIF_TYPE_LABEL[notification.type] ?? notification.type,
    evidence: focusEvidence([
      NOTIF_TYPE_LABEL[notification.type] ?? notification.type,
      recencyScore(notification.createdAt) >= 10 ? 'Baru' : null,
      requiresAction ? 'Perlu aksi' : null,
      notification.priority ? `Prioritas ${notification.priority}` : null,
    ]),
    notificationId: notification.id,
    source: notification.source,
  }
}

function dmFocusItem(channel: ChannelSummary): FocusItem {
  const partnerName = channel.description && channel.description !== 'Direct message' ? channel.description : channel.name
  return {
    id: `dm-${channel.id}`,
    kind: 'dm',
    section: 'mention',
    title: partnerName,
    meta: channel.lastMessage?.content ? channel.lastMessage.content.slice(0, 72) : 'Pesan langsung belum dibaca',
    reason: `${channel.unreadCount} pesan langsung belum dibaca`,
    roleCue: 'Anda penerima pesan langsung',
    nextCue: 'Balas untuk membuka konteks kerja',
    actionLabel: 'Balas →',
    score: 58 + Math.min(18, channel.unreadCount * 4) + recencyScore(channel.lastMessage?.createdAt),
    urgency: 'info',
    chip: `${channel.unreadCount} baru`,
    evidence: focusEvidence([
      `${channel.unreadCount} pesan`,
      recencyScore(channel.lastMessage?.createdAt) >= 10 ? 'Baru' : null,
      'Komunikasi',
    ]),
    channelId: channel.id,
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
  if (scope === 'action') return item.kind === 'task' || item.kind === 'blocker' || item.kind === 'approval' || (item.kind === 'notification' && item.urgency !== 'info')
  if (scope === 'risk') return item.kind === 'program' || item.kind === 'blocker' || item.urgency === 'critical' || item.urgency === 'warn'
  if (scope === 'communication') return item.kind === 'mention' || item.kind === 'dm' || (item.kind === 'notification' && item.section === 'mention')
  return item.kind === 'meeting' || item.kind === 'focus'
}

/** Verb-driven CTA per item kind. Primary CTA only for genuinely urgent items. */
function ctaFor(item: FocusItem): { label: string; primary: boolean } {
  if (item.kind === 'blocker')                       return { label: 'Tangani',     primary: true  }
  if (item.kind === 'approval')                      return { label: 'Putuskan',    primary: true  }
  if (item.kind === 'task')                          return { label: 'Kerjakan',    primary: item.urgency === 'critical' }
  if (item.kind === 'program')                       return { label: 'Tinjau',      primary: false }
  if (item.kind === 'mention' || item.kind === 'dm') return { label: 'Balas',       primary: false }
  if (item.kind === 'meeting' || item.kind === 'focus') return { label: 'Buka jadwal', primary: false }
  return { label: 'Lihat', primary: false }
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
}

// ── Item presentation ──────────────────────────────────────────────────────

/** Hero card — Linear-style: just left rail + typography hierarchy.
 *  No icon BG pill, no border tint, no colored chips. Color = 1 rail line. */
function FokusHeroCard({
  item,
  onAction,
}: {
  item: FocusItem
  onAction: (item: FocusItem, rank?: number) => void
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
      <button
        type="button"
        className={`fokus-cta fokus-cta--lg${cta.primary ? ' fokus-cta--primary' : ''}`}
        onClick={() => onAction(item, 1)}
      >
        {cta.label}
      </button>
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
  muted = false,
}: {
  item: FocusItem
  rank: number
  onAction: (item: FocusItem, rank?: number) => void
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
      <button
        type="button"
        className={`fokus-cta fokus-cta--sm${cta.primary ? ' fokus-cta--primary' : ''}`}
        onClick={() => onAction(item, rank)}
      >
        {cta.label}
      </button>
    </li>
  )
}

// ── Main view ───────────────────────────────────────────────────────────────

export function InboxView() {
  const {
    notifications, markNotificationRead, loadOverview,
    programs, myWork, channels, programSummary, openProgramWorkspace,
    currentUser, setSelectedProgramId, setSelectedTaskId, setSelectedChannelId,
  } = useWorkspace()
  const navigate = useInertiaNavigate()

  function navigateToNotifSource(source: string) {
    // Source dapat berupa: "type:id", "name·type:id", atau kombinasi lain
    // Iterasi semua parts — ambil entitas navigable pertama
    for (const part of source.split('·').map(p => p.trim())) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      const type = part.slice(0, colon)
      const id = Number(part.slice(colon + 1).split(':')[0])
      if (type === 'task' && !isNaN(id)) { setSelectedTaskId(id); navigate('/execution'); return }
      if (type === 'program' && !isNaN(id)) { setSelectedProgramId(id); navigate('/programs'); return }
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
  async function handleNotifGroupClick(group: NotificationGroup) {
    await Promise.all(group.items.map(n => api.put(`/notifications/${n.id}/read`, {})))
    await loadOverview('refresh')
    navigateToNotifSource(group.latest.source)
  }
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

  // ── Data from /api/my-work (personal assignments) ─────────────────────────
  const myTasks = myWork?.tasks ?? []
  const myBlockers = myWork?.blockers ?? []
  const focusPolicy = myWork?.focusPolicy ?? DEFAULT_FOCUS_POLICY

  // ── At-risk programs: role-aware source ────────────────────────────────────
  // BOD/KADIV: see ALL at-risk programs in their scope (portfolio view)
  // Others: see only programs they own
  const myAtRisk = isStrategic
    ? programs.filter(p => p.healthStatus === 'RED' || p.healthStatus === 'YELLOW')
    : (myWork?.programs ?? [])

  // ── Notifications ──────────────────────────────────────────────────────────
  const MENTION_TYPES = new Set(['MENTION', 'APPROVAL', 'DM_RECEIVED'])
  const mentions = notifications.filter(n =>
    MENTION_TYPES.has(n.type) && n.state === 'UNREAD'
  )

  const otherUnread = notifications.filter(n =>
    n.state === 'UNREAD' && !MENTION_TYPES.has(n.type)
  )

  const mentionGroups = groupNotifications(mentions)
  const otherUnreadGroups = groupNotifications(otherUnread)

  const actionableOtherUnread = otherUnread.filter(n =>
    n.type === 'REPORT_NEEDS_REVISION' ||
    n.type === 'PROGRAM_NEEDS_APPROVAL' ||
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

  // ── DM channels dengan unread messages ────────────────────────────────────
  const unreadDms = channels.filter(ch =>
    ch.type === 'PRIVATE' && ch.name?.startsWith('dm-') && (ch.unreadCount ?? 0) > 0
  )

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

  const MEETING_TYPE_LABEL: Record<string, string> = {
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
        reason: isOngoing ? 'Meeting sedang berlangsung dan membutuhkan perhatian Anda' : 'Agenda hari ini yang perlu dipersiapkan',
        roleCue: 'Anda peserta agenda hari ini',
        nextCue: isOngoing ? 'Masuk sekarang atau cek hasil diskusi' : 'Siapkan konteks sebelum agenda dimulai',
        actionLabel: 'Buka jadwal →',
        score: isOngoing ? 72 : 44 + recencyScore(meeting.startAt),
        urgency: isOngoing ? 'warn' : 'info',
        chip: isOngoing ? 'Berlangsung' : 'Meeting',
        evidence: focusEvidence([
          isOngoing ? 'Sedang berlangsung' : 'Agenda hari ini',
          meeting.location ? 'Ada lokasi' : null,
          'Jadwal',
        ]),
        entityId: meeting.id,
      }
    })

    const focusBlockItems: FocusItem[] = todayFocusBlocks.slice(0, 1).map((block) => {
      const now = Date.now()
      const isActive = now >= new Date(block.startAt).getTime() && now <= new Date(block.endAt).getTime()
      const start = new Date(block.startAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      const end = new Date(block.endAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      return {
        id: `focus-${block.id}`,
        kind: 'focus',
        section: 'priority',
        title: block.title,
        meta: `${start} – ${end}`,
        reason: isActive ? 'Slot fokus sedang aktif; pilih satu prioritas untuk dituntaskan' : block.note || 'Slot fokus hari ini sudah dijadwalkan',
        roleCue: 'Anda pemilik waktu fokus',
        nextCue: isActive ? 'Gunakan slot ini untuk satu aksi utama' : 'Amankan waktu dari distraksi',
        actionLabel: 'Buka jadwal →',
        score: isActive ? 70 : 38,
        urgency: isActive ? 'warn' : 'info',
        chip: isActive ? 'Aktif' : 'Fokus',
        evidence: focusEvidence([
          isActive ? 'Slot aktif' : 'Slot hari ini',
          'Proteksi waktu',
          block.note ? 'Ada catatan' : null,
        ]),
        entityId: block.id,
      }
    })

    const notificationItems = [
      ...mentionGroups.map(group => notificationFocusItem(group.latest)),
      ...actionableOtherGroups.map(group => notificationFocusItem(group.latest)),
    ]

    return [
      ...myBlockers.map(blocker => blockerFocusItem(blocker, focusPolicy)),
      ...myTasks.map(task => taskFocusItem(task, focusPolicy)),
      ...pendingApprovalPrograms.map(program => approvalFocusItem(program, role, focusPolicy)),
      ...myAtRisk.map(program => programFocusItem(program, isStrategic)),
      ...unreadDms.map(dmFocusItem),
      ...notificationItems,
      ...meetingItems,
      ...focusBlockItems,
    ]
      .sort((a, b) => b.score - a.score)
  })()
  // Dedup: approval items already shown in ActionPanel don't need to appear in the focus list
  const actionPanelIds = new Set((programSummary?.needsAction ?? []).map(n => n.id))
  const deduplicatedItems = rankedFocusItems.filter(item =>
    item.kind !== 'approval' || !actionPanelIds.has(item.entityId ?? -1)
  )
  const scopedRankedFocusItems = deduplicatedItems.filter(item => focusItemMatchesScope(item, focusScope))

  const focusScopeOptions = (['all', 'action', 'risk', 'communication', 'schedule'] as FocusScope[]).map(scope => ({
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
      showToast(err instanceof Error ? err.message : 'Gagal menandai semua notifikasi.', 'error')
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
    if (item.kind === 'task') { goToTask(item.entityId); return }
    if (item.kind === 'blocker') { goToTask(item.taskId); return }
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

  return (
    <div className="ds fokus-v2 view-inbox">
      <div className="fokus-v2__inner">
        <header className="fokus-v2__header">
          <div className="fokus-v2__header-left">
            <h1 className="fokus-v2__title">Fokus</h1>
            <span className="fokus-v2__subtitle">
              {todayLabel()}
              {todayCompletedCount > 0 && ` · ${todayCompletedCount} selesai hari ini`}
            </span>
          </div>
          <div className="fokus-v2__header-actions">
            {(mentions.length > 0 || otherUnread.length > 0) && (
              <button
                type="button"
                className="fokus-v2__mark-all"
                disabled={markingAll}
                onClick={() => void handleMarkAllRead()}
              >
                {markingAll ? 'Marking…' : 'Tandai semua dibaca'}
              </button>
            )}
          </div>
        </header>

      <div className="fokus-page">

        {/* ── 0a. Sprint 2 — Komitmen Hari Ini (data-driven dari /inbox/today) ── */}
        <CommitmentTodaySection />

        {/* ── 0b. Sprint 4 — Clear the Path sections (DKM pilot via feature flag) ── */}
        {currentUser?.id && <EscalationSections currentUserId={currentUser.id} />}

        {/* ── 1. Eksekutif: Perlu Tindakan (program-level decisions) ── */}
        {(programSummary?.needsAction.length ?? 0) > 0 && (
          <ActionPanel
            items={programSummary!.needsAction}
            onOpen={openProgramWorkspace}
            title={actionPanelTitleFor(programSummary!.scope)}
          />
        )}

        {/* ── 2. Scope strip — filter pill ── */}
        <div className="fokus-scope-strip" aria-label="Mode baca Focus">
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

        {/* ── 3. SEKARANG — top item as hero card ── */}
        {nowItem && (
          <section className="fokus-bucket fokus-bucket--now">
            <div className="fokus-bucket__head">
              <h3 className="fokus-bucket__label">Sekarang</h3>
            </div>
            <FokusHeroCard item={nowItem} onAction={handleFocusItemClick} />
          </section>
        )}

        {/* ── 4. HARI INI — next 5 items ── */}
        {todayItems.length > 0 && (
          <section className="fokus-bucket">
            <div className="fokus-bucket__head">
              <h3 className="fokus-bucket__label">Hari Ini</h3>
              <span className="fokus-bucket__count">{todayItems.length}</span>
            </div>
            <ul className="fokus-bucket__list">
              {todayItems.map((item, idx) => (
                <FokusItemRow
                  key={item.id}
                  item={item}
                  rank={idx + 2}
                  onAction={handleFocusItemClick}
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
              <h3 className="fokus-bucket__label">Bisa Ditunda</h3>
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
                    muted
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── 6. Empty state ── */}
        {nowItem == null && todayItems.length === 0 && laterItems.length === 0 && (programSummary?.needsAction.length ?? 0) === 0 && (
          <div className="fokus-zero">
            <div className="fokus-zero__check" aria-hidden="true">✓</div>
            <p className="fokus-zero__title">Antrian Anda beres</p>
            <p className="fokus-zero__sub">
              Tidak ada yang perlu ditangani sekarang. Saatnya istirahat atau cek <button type="button" className="fokus-zero__link" onClick={() => navigate('/')}>Home</button> untuk gambaran divisi.
            </p>
          </div>
        )}

      </div>
      </div>

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
