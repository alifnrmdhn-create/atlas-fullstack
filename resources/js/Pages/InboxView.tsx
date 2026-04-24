import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/workspace'
import { api } from '../lib/api'
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import type { Blocker, ChannelSummary, FocusPolicy, Meeting, MyWorkDecision, NotificationItem, Program, Task } from '../types'

type FocusBlock = {
  id: number
  title: string
  startAt: string
  endAt: string
  note?: string
}

type FocusItemKind = 'task' | 'blocker' | 'program' | 'approval' | 'mention' | 'dm' | 'meeting' | 'focus' | 'notification'
type FocusScope = 'all' | 'action' | 'risk' | 'communication' | 'schedule'

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
  tone: 'red' | 'yellow' | 'green' | 'indigo' | 'neutral'
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

const PERSON_AVATAR_PALETTE = [
  { bg: 'var(--purple-dim)', fg: 'var(--purple-ink)', ring: 'var(--purple-subtle)' },
  { bg: 'var(--blue-dim)', fg: 'var(--blue-ink)', ring: 'var(--blue-subtle)' },
  { bg: 'var(--green-dim)', fg: 'var(--green-ink)', ring: 'var(--green-subtle)' },
  { bg: 'var(--yellow-dim)', fg: 'var(--yellow-ink)', ring: 'var(--yellow-subtle)' },
  { bg: 'var(--red-dim)', fg: 'var(--red-ink)', ring: 'var(--red-subtle)' },
  { bg: 'var(--cyan-dim)', fg: 'var(--cyan-ink)', ring: 'var(--cyan-subtle)' },
] as const

const HEALTH_TONES = {
  RED: { bg: 'var(--red-dim)', fg: 'var(--red-ink)', bar: 'var(--red)' },
  YELLOW: { bg: 'var(--yellow-dim)', fg: 'var(--yellow-ink)', bar: 'var(--yellow)' },
  GREEN: { bg: 'var(--green-dim)', fg: 'var(--green-ink)', bar: 'var(--green)' },
} as const

const SEVERITY_TONES = {
  CRITICAL: { bg: 'var(--red-dim)', fg: 'var(--red-ink)', border: 'var(--red-subtle)' },
  HIGH: { bg: 'var(--yellow-dim)', fg: 'var(--yellow-ink)', border: 'var(--yellow-subtle)' },
  MEDIUM: { bg: 'var(--blue-dim)', fg: 'var(--blue-ink)', border: 'var(--blue-subtle)' },
  LOW: { bg: 'var(--green-dim)', fg: 'var(--green-ink)', border: 'var(--green-subtle)' },
} as const

const NEUTRAL_TONE = { bg: 'var(--gray-dim)', fg: 'var(--gray-ink)', border: 'var(--gray-subtle)' } as const
const SOFT_SURFACE = 'var(--surface-overlay-soft)'
const TRACK_BG = 'var(--surface-quiet)'
const PRIORITY_PREVIEW_LIMIT = 3
const SECTION_PREVIEW_LIMIT = 2

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

const toneVars = (vars: Record<string, string | number | undefined>): CSSProperties =>
  vars as CSSProperties

// Section accent colors — only used on headers, NOT on items
const SECTION_BORDER: Record<string, string> = {
  priority: 'var(--yellow)',
  assigned: 'var(--indigo)',
  blocker:  'var(--red)',
  atrisk:   'var(--yellow)',
  mention:  'var(--indigo)',
  notif:    'var(--text-muted)',
}

// Section icons — small SVG per section type
const SECTION_ICON: Record<string, React.ReactNode> = {
  priority: (
    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13">
      <path d="M8.5 1.8 3 9h4l-.8 5.2L13 6.8H9l-.5-5z" />
    </svg>
  ),
  assigned: (
    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13">
      <rect height="11" rx="2" width="11" x="2.5" y="2.5" />
      <path d="m5.5 8 2 2 3-3.5" />
    </svg>
  ),
  blocker: (
    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13">
      <circle cx="8" cy="8" r="5.5" />
      <path d="m4.1 4.1 7.8 7.8" />
    </svg>
  ),
  atrisk: (
    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13">
      <path d="M8 2 1.5 13.5h13L8 2z" />
      <path d="M8 6.5v3.5M8 11.5v.5" />
    </svg>
  ),
  mention: (
    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M10.5 8A2.5 2.5 0 0 0 8 5.5m0 5a2.5 2.5 0 0 0 2.5-2.5M13.5 8a5.5 5.5 0 1 1-5.5-5.5" />
      <path d="M13.5 5.5V8h-2.5" />
    </svg>
  ),
  notif: (
    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13">
      <path d="M8 2a4.5 4.5 0 0 1 4.5 4.5V9l1 2H2.5l1-2V6.5A4.5 4.5 0 0 1 8 2z" />
      <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  ),
}

// ── Status avatar icons (SVG inline) ───────────────────────────────────────

function IconTask({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="m5.5 8 2 2 3-3.5" />
    </svg>
  )
}
function IconBlock({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5.5" />
      <path d="m4.1 4.1 7.8 7.8" />
    </svg>
  )
}
function IconProgram({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 6h5M5.5 9h5M5.5 12h3" />
    </svg>
  )
}

/** Colored status avatar — replaces border-left for work items, blockers, programs */
function StatusAvatar({
  bg, shape = 'rounded', children,
}: {
  bg: string; shape?: 'circle' | 'rounded'; children: React.ReactNode
}) {
  return (
    <div
      className="fokus-avatar"
      style={toneVars({
        '--fokus-avatar-bg': bg,
        '--fokus-avatar-radius': shape === 'circle' ? '999px' : '9px',
      })}
    >
      {children}
    </div>
  )
}

/** Person avatar for notifications — warm pastel palette with ring */
function PersonAvatar({ name, seed }: { name: string; seed: number }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
  const tone = PERSON_AVATAR_PALETTE[seed % PERSON_AVATAR_PALETTE.length]
  return (
    <div
      className="fokus-avatar fokus-avatar--person"
      style={toneVars({
        '--fokus-avatar-bg': tone.bg,
        '--fokus-avatar-fg': tone.fg,
        '--fokus-avatar-ring': tone.ring,
        '--fokus-avatar-size': '36px',
        '--fokus-avatar-radius': '999px',
      })}
    >
      {initials}
    </div>
  )
}

/** Progress bar — neutral, single color */
function Bar({
  value,
  track = 'var(--panel-border)',
  fill = 'var(--text-muted)',
}: {
  value: number
  track?: string
  fill?: string
}) {
  return (
    <div className="fokus-progress" style={toneVars({ '--fokus-progress-track': track })}>
      <div
        className="fokus-progress__fill"
        style={toneVars({
          '--fokus-progress-fill': fill,
          '--fokus-progress-value': `${Math.min(100, value)}%`,
        })}
      />
    </div>
  )
}

/** Section group header with icon + collapse toggle */
function SectionHeader({
  section, title, count, onNav, collapsed = false, onToggle,
}: {
  section: string; title: string; count: number; onNav?: () => void
  collapsed?: boolean; onToggle?: () => void
}) {
  const accentColor = SECTION_BORDER[section] ?? 'var(--text-muted)'
  return (
    <div className="fokus-section-header">
      {onToggle && (
        <button className="fokus-section-toggle" onClick={onToggle} type="button">
          <span className={`fokus-section-toggle__icon${collapsed ? ' fokus-section-toggle__icon--collapsed' : ''}`}>
            <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="12">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </span>
        </button>
      )}
      {SECTION_ICON[section] && (
        <span className="fokus-section-header__icon" style={toneVars({ '--fokus-section-accent': accentColor })}>
          {SECTION_ICON[section]}
        </span>
      )}
      <span className="fokus-section-header__title">{title}</span>
      {count > 0 && <span className="fokus-section-header__badge">{count}</span>}
      {onNav && (
        <button className="fokus-nav-link" onClick={onNav} type="button">
          Lihat semua →
        </button>
      )}
    </div>
  )
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <div className="fokus-empty">
      <span className="fokus-empty__icon">✓</span>
      <span>{text}</span>
    </div>
  )
}

function SectionMore({ hiddenCount, onClick, label = 'item lain disembunyikan sementara', actionLabel = 'Tampilkan di Focus →' }: { hiddenCount: number; onClick: () => void; label?: string; actionLabel?: string }) {
  if (hiddenCount <= 0) return null
  return (
    <button className="fokus-section-more" onClick={onClick} type="button">
      <span>{hiddenCount} {label}</span>
      <span>{actionLabel}</span>
    </button>
  )
}

// ── Personal helpers ────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 18) return 'Selamat sore'
  return 'Selamat malam'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function nameInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
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
    tone: task.isBlocked || task.healthStatus === 'RED' ? 'red' : task.healthStatus === 'YELLOW' ? 'yellow' : 'green',
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
    tone: blocker.severity === 'CRITICAL' || blocker.severity === 'HIGH' ? 'red' : 'yellow',
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
    tone: program.healthStatus === 'RED' ? 'red' : 'yellow',
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
    tone: 'yellow',
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
    tone: isHighSignal ? 'yellow' : notification.type === 'MENTION' || notification.type === 'DM_RECEIVED' ? 'indigo' : 'neutral',
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
    tone: 'indigo',
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
  if (scope === 'action') return item.kind === 'task' || item.kind === 'blocker' || item.kind === 'approval' || (item.kind === 'notification' && item.tone !== 'neutral')
  if (scope === 'risk') return item.kind === 'program' || item.kind === 'blocker' || item.tone === 'red' || item.tone === 'yellow'
  if (scope === 'communication') return item.kind === 'mention' || item.kind === 'dm' || (item.kind === 'notification' && item.section === 'mention')
  return item.kind === 'meeting' || item.kind === 'focus'
}

// ── Main view ───────────────────────────────────────────────────────────────

export function InboxView() {
  const {
    notifications, markNotificationRead, loadOverview,
    programs, myWork, channels,
    currentUser, formatDate, setSelectedProgramId, setSelectedTaskId, setSelectedChannelId,
  } = useWorkspace()
  const navigate = useNavigate()

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

  // ── Sidebar programs ───────────────────────────────────────────────────────
  // BOD/KADIV: all programs sorted by health (worst first)
  // Others: only owned programs
  const HEALTH_ORDER: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
  const sidebarProgs = isStrategic
    ? [...programs].sort((a, b) => (HEALTH_ORDER[a.healthStatus] ?? 3) - (HEALTH_ORDER[b.healthStatus] ?? 3))
    : (myWork?.programs ?? programs.filter(p => p.owner?.id === currentUser?.id))

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

  const totalActions = myTasks.length + myBlockers.length + myAtRisk.length + mentions.length + pendingApprovalPrograms.length + unreadDms.length + actionableOtherUnread.length

  // ── Collapsible sections ──────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedPreview, setExpandedPreview] = useState<Set<string>>(new Set())
  const [focusScope, setFocusScope] = useState<FocusScope>('all')
  const isCollapsed = (key: string) => collapsed.has(key)
  const isPreviewExpanded = (key: string) => expandedPreview.has(key)
  const toggleSection = (key: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    return next
  })
  const expandPreview = (key: string) => setExpandedPreview(prev => {
    const next = new Set(prev)
    next.add(key)
    return next
  })

  // ── Personal context ──────────────────────────────────────────────────────
  const firstName = (() => {
    const name = currentUser?.name
    if (!name) return 'Anda'
    if (role === 'BOD') return name
    const parts = name.split(' ')
    if (parts[0].length <= 2 || parts[0].endsWith('.')) return name
    return parts[0]
  })()
  const greeting  = getGreeting()

  const criticalCount = myBlockers.filter(b => b.severity === 'CRITICAL').length
  const redItemCount  = myTasks.filter(i => i.healthStatus === 'RED').length

  const contextSummary =
    criticalCount > 0 ? `${criticalCount} blocker kritis perlu ditangani segera` :
    redItemCount  > 0 ? `${redItemCount} item dalam kondisi kritis` :
    totalActions  > 0 ? `${totalActions} hal menunggu tindakan Anda` :
    'Semua item beres hari ini ✓'

  // Weekly progress: completed items from myWork
  const weeklyCompleted = myTasks.filter(i => i.status === 'COMPLETED' || i.status === 'IN_REVIEW').length
  const weeklyTotal = myTasks.length

  // User avatar color from stable token palette
  const userTone = PERSON_AVATAR_PALETTE[(currentUser?.id ?? 42) % PERSON_AVATAR_PALETTE.length]

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
      .catch(() => {})
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
      .catch(() => {})
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
        tone: isOngoing ? 'green' : 'neutral',
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
        tone: isActive ? 'indigo' : 'neutral',
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
  const scopedRankedFocusItems = rankedFocusItems.filter(item => focusItemMatchesScope(item, focusScope))
  const topFocusItems = scopedRankedFocusItems.slice(0, PRIORITY_PREVIEW_LIMIT)
  const surfacedFocusIds = new Set(topFocusItems.map(item => item.id))
  const surfacedNotificationIds = new Set(
    topFocusItems
      .map(item => item.notificationId)
      .filter((id): id is number => typeof id === 'number')
  )
  const surfacedPreviewText = 'Item utama sudah muncul di Prioritas Hari Ini'

  function previewItems<T>(items: T[], key: string): T[] {
    return isPreviewExpanded(key) ? items : items.slice(0, SECTION_PREVIEW_LIMIT)
  }

  const dueSoonTasks = myTasks.filter(task => {
    const days = daysUntil(task.targetCompletion)
    return days != null && days <= focusPolicy.due.upcomingWindowDays
  })
  const overdueTasks = myTasks.filter(task => {
    const days = daysUntil(task.targetCompletion)
    return days != null && days < 0
  })
  const idleTasks = myTasks.filter(task => idleScore(task.updatedAt ?? task.createdAt, focusPolicy) > 0)
  const agingBlockers = myBlockers.filter(blocker => {
    const days = daysSince(blocker.createdAt)
    return days != null && days >= focusPolicy.blockerAging.watchAfterDays
  })
  const prioritySignals = [
    { label: 'Lewat tenggat', value: overdueTasks.length },
    { label: 'Task idle', value: idleTasks.length },
    { label: 'Blocker menua', value: agingBlockers.length },
    { label: 'Approval menahan alur', value: pendingApprovalPrograms.length },
  ].filter(signal => signal.value > 0)
  const priorityPolicyNotes = [
    focusPolicy.profile ? `Kebijakan: ${focusPolicy.profile}` : null,
    `Overdue naik per hari`,
    `Idle >= ${focusPolicy.idle.watchAfterDays} hari`,
    `Blocker >= ${focusPolicy.blockerAging.watchAfterDays} hari`,
    'Approval Kadiv = high blocking',
  ].filter((note): note is string => Boolean(note))
  const decisionRows = [
    {
      label: 'Aksi prioritas',
      value: pendingApprovalPrograms.length + myBlockers.length + dueSoonTasks.length + actionableOtherUnread.length,
      color: 'var(--red)',
      icon: SECTION_ICON.priority,
    },
    {
      label: 'Risiko perlu pantau',
      value: myAtRisk.length + criticalCount,
      color: 'var(--yellow)',
      icon: SECTION_ICON.atrisk,
    },
    {
      label: 'Komunikasi',
      value: mentionGroups.length + unreadDms.length,
      color: 'var(--indigo)',
      icon: SECTION_ICON.mention,
    },
    {
      label: 'Jadwal hari ini',
      value: todayMeetings.length + todayFocusBlocks.length,
      color: 'var(--green)',
      icon: SECTION_ICON.notif,
    },
  ] as { label: string; value: number; color: string; icon: React.ReactNode }[]
  const focusScopeOptions = (['all', 'action', 'risk', 'communication', 'schedule'] as FocusScope[]).map(scope => ({
    scope,
    label: FOCUS_SCOPE_LABEL[scope],
    count: scope === 'all'
      ? rankedFocusItems.length
      : rankedFocusItems.filter(item => focusItemMatchesScope(item, scope)).length,
  }))

  const previewMeetings = todayMeetings.filter(item => !surfacedFocusIds.has(`meeting-${item.id}`))
  const previewFocusBlocks = todayFocusBlocks.filter(item => !surfacedFocusIds.has(`focus-${item.id}`))
  const previewUnreadDms = unreadDms.filter(item => !surfacedFocusIds.has(`dm-${item.id}`))
  const previewPendingApprovals = pendingApprovalPrograms.filter(item => !surfacedFocusIds.has(`approval-${item.id}`))
  const previewAtRisk = myAtRisk.filter(item => !surfacedFocusIds.has(`program-${item.id}`))
  const previewTasks = myTasks.filter(item => !surfacedFocusIds.has(`task-${item.id}`))
  const previewBlockers = myBlockers.filter(item => !surfacedFocusIds.has(`blocker-${item.id}`))
  const previewMentionGroups = mentionGroups.filter(group => !surfacedNotificationIds.has(group.latest.id))
  const scopedOtherUnreadGroups = focusScope === 'action' ? actionableOtherGroups : otherUnreadGroups
  const scopedOtherUnreadCount = focusScope === 'action' ? actionableOtherUnread.length : otherUnread.length
  const previewOtherUnreadGroups = scopedOtherUnreadGroups.filter(group => !surfacedNotificationIds.has(group.latest.id))

  const visibleMeetings = previewItems(previewMeetings, 'meetings')
  const visibleFocusBlocks = previewItems(previewFocusBlocks, 'focus')
  const visibleUnreadDms = previewItems(previewUnreadDms, 'dms')
  const visiblePendingApprovals = previewItems(previewPendingApprovals, 'approval')
  const visibleAtRisk = previewItems(previewAtRisk, 'atrisk')
  const visibleTasks = previewItems(previewTasks, 'assigned')
  const visibleBlockers = previewItems(previewBlockers, 'blocker')
  const visibleMentionGroups = previewItems(previewMentionGroups, 'mention')
  const visibleOtherUnreadGroups = previewItems(previewOtherUnreadGroups, 'notif')
  const showActionScope = focusScope === 'all' || focusScope === 'action'
  const showRiskScope = focusScope === 'all' || focusScope === 'risk'
  const showCommunicationScope = focusScope === 'all' || focusScope === 'communication'
  const showScheduleScope = focusScope === 'all' || focusScope === 'schedule'
  const showBlockerScope = focusScope === 'all' || focusScope === 'action' || focusScope === 'risk'

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

  return (
    <div className="view-inbox">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Fokus</h2>
        <div className="view-toolbar__sep" />
        <span className="fokus-context-line">
          {totalActions > 0
            ? <><strong>{totalActions}</strong> item menunggu tindakan Anda</>
            : 'Semua item sudah beres ✓'}
        </span>
        {(mentions.length > 0 || otherUnread.length > 0) && (
          <button className="inbox-mark-all-btn" disabled={markingAll} onClick={() => void handleMarkAllRead()}>
            {markingAll ? 'Marking…' : 'Tandai semua dibaca'}
          </button>
        )}
      </div>

      <div className="inbox-workspace">

        {/* ── Main feed ── */}
        <div className="inbox-main">

          {totalActions === 0 && otherUnread.length === 0 && (
            <div className="fokus-feed">
              <div className="fokus-hero">
                <div
                  className="fokus-hero__avatar"
                  style={toneVars({
                    '--fokus-hero-avatar-bg': userTone.bg,
                    '--fokus-hero-avatar-fg': userTone.fg,
                  })}
                >
                  {nameInitials(currentUser?.name ?? '?')}
                </div>
                <div className="fokus-hero__text">
                  <div className="fokus-hero__greeting">{greeting}, <strong>{firstName}</strong></div>
                  <div className="fokus-hero__date">
                    {todayLabel()}
                    <span className="fokus-hero__sep">·</span>
                    <span>{contextSummary}</span>
                  </div>
                </div>
              </div>
              <div className="fokus-empty-state">
                <div className="fokus-empty-state__copy">
                  Semua task dan notifikasi sudah beres untuk hari ini.
                </div>
              </div>
            </div>
          )}

          {totalActions > 0 || otherUnread.length > 0 ? (
            <div className="fokus-feed">

              {/* ── Hero greeting — inside the feed panel ── */}
              <div className="fokus-hero">
                <div
                  className="fokus-hero__avatar"
                  style={toneVars({
                    '--fokus-hero-avatar-bg': userTone.bg,
                    '--fokus-hero-avatar-fg': userTone.fg,
                  })}
                >
                  {nameInitials(currentUser?.name ?? '?')}
                </div>
                <div className="fokus-hero__text">
                  <div className="fokus-hero__greeting">{greeting}, <strong>{firstName}</strong></div>
                  <div className="fokus-hero__date">
                    {todayLabel()}
                    <span className="fokus-hero__sep">·</span>
                    <span className={criticalCount > 0 ? 'fokus-hero__alert' : ''}>
                      {contextSummary}
                    </span>
                  </div>
                </div>
              </div>

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

              {/* ── Priority layer: cross-section ranking without replacing the existing feed ── */}
              {topFocusItems.length > 0 && (
                <>
                  <div className="fokus-priority-spot">
                    <span className="fokus-priority-spot__lightning">{SECTION_ICON.priority}</span>
                    <span className="fokus-priority-spot__title">
                      Prioritas utama{focusScope === 'all' ? '' : ` ${FOCUS_SCOPE_LABEL[focusScope].toLowerCase()}`}: {topFocusItems[0].title}
                    </span>
                    <span className="fokus-priority-spot__badge">{topFocusItems[0].chip ?? 'Action'}</span>
                  </div>
                  <SectionHeader section="priority" title="Prioritas Hari Ini" count={scopedRankedFocusItems.length} collapsed={isCollapsed('priority')} onToggle={() => toggleSection('priority')} />
                  {!isCollapsed('priority') && topFocusItems.map((item, index) => (
                    <button className={`fokus-item fokus-item--priority fokus-item--priority-${item.tone}`} key={item.id} onClick={() => handleFocusItemClick(item, index + 1)}>
                      <StatusAvatar bg={SOFT_SURFACE} shape={item.kind === 'mention' || item.kind === 'dm' ? 'circle' : 'rounded'}>
                        {SECTION_ICON[item.section]}
                      </StatusAvatar>
                      <div className="fokus-item__body">
                        <div className="fokus-item__titlerow">
                          <span className="fokus-item__title">{item.title}</span>
                          {item.chip && (
                            <span className="fokus-chip fokus-chip--tone" style={toneVars({
                              '--fokus-chip-bg':
                                item.tone === 'red' ? SEVERITY_TONES.CRITICAL.bg :
                                item.tone === 'yellow' ? HEALTH_TONES.YELLOW.bg :
                                item.tone === 'green' ? HEALTH_TONES.GREEN.bg :
                                item.tone === 'indigo' ? 'var(--indigo-dim)' :
                                NEUTRAL_TONE.bg,
                              '--fokus-chip-fg':
                                item.tone === 'red' ? SEVERITY_TONES.CRITICAL.fg :
                                item.tone === 'yellow' ? HEALTH_TONES.YELLOW.fg :
                                item.tone === 'green' ? HEALTH_TONES.GREEN.fg :
                                item.tone === 'indigo' ? 'var(--indigo)' :
                                NEUTRAL_TONE.fg,
                            })}>{item.chip}</span>
                          )}
                        </div>
                        <div className="fokus-item__meta">{item.meta}</div>
                        <div className="fokus-item__reason">
                          {item.impact ? `${item.impact} · ${item.reason}` : item.reason}
                        </div>
                        {item.evidence && item.evidence.length > 0 && (
                          <div className="fokus-item__evidence" aria-label="Alasan item ini diprioritaskan">
                            {item.evidence.map(signal => (
                              <span key={signal}>{signal}</span>
                            ))}
                          </div>
                        )}
                        <div className="fokus-item__cue-row">
                          <span>{item.roleCue}</span>
                          <span>{item.nextCue}</span>
                        </div>
                      </div>
                      <span className="fokus-item__aside fokus-item__aside--label">{item.actionLabel}</span>
                    </button>
                  ))}
                  {!isCollapsed('priority') && (
                    <SectionMore
                      hiddenCount={Math.max(0, scopedRankedFocusItems.length - topFocusItems.length)}
                      label="prioritas lain muncul di section bawah"
                      actionLabel="Lanjut scan ↓"
                      onClick={() => document.querySelector('.fokus-section-header:nth-of-type(3)')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    />
                  )}
                </>
              )}

              {topFocusItems.length === 0 && focusScope !== 'all' && (
                <SectionEmpty text={`Tidak ada item untuk mode ${FOCUS_SCOPE_LABEL[focusScope].toLowerCase()} saat ini`} />
              )}

              {/* ── Meeting Hari Ini ─────────────────────────────────────────────── */}
              {showScheduleScope && todayMeetings.length > 0 && (
                <>
                  <SectionHeader section="notif" title="Meeting Hari Ini" count={todayMeetings.length} onNav={() => navigate('/jadwal')} collapsed={isCollapsed('meetings')} onToggle={() => toggleSection('meetings')} />
                  {!isCollapsed('meetings') && (visibleMeetings.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> : visibleMeetings.map(m => {
                    const start = new Date(m.startAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                    const end   = new Date(m.endAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                    const isOngoing = m.status === 'ONGOING'
                    return (
                      <button className="fokus-item" key={m.id} onClick={() => navigate('/jadwal')}>
                        <StatusAvatar bg={isOngoing ? HEALTH_TONES.GREEN.bg : SOFT_SURFACE} shape="rounded">
                          <svg fill="none" height="15" stroke={isOngoing ? HEALTH_TONES.GREEN.bar : 'var(--text-muted)'} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="15">
                            <rect height="11" rx="1.5" width="12" x="2" y="3" />
                            <path d="M5 1.5v3M11 1.5v3M2 7h12" />
                          </svg>
                        </StatusAvatar>
                        <div className="fokus-item__body">
                          <div className="fokus-item__titlerow">
                            <span className="fokus-item__title">{m.title}</span>
                            {isOngoing && (
                              <span
                                className="fokus-chip fokus-chip--tone"
                                style={toneVars({
                                  '--fokus-chip-bg': HEALTH_TONES.GREEN.bg,
                                  '--fokus-chip-fg': HEALTH_TONES.GREEN.fg,
                                })}
                              >
                                Berlangsung
                              </span>
                            )}
                          </div>
                          <div className="fokus-item__meta">
                            <span className="fokus-status-tag">{start} – {end}</span>
                            {m.location && <span className="fokus-item__meta-detail">· {m.location}</span>}
                          </div>
                        </div>
                        <span className="fokus-item__aside fokus-item__aside--label">
                          {MEETING_TYPE_LABEL[m.meetingType] ?? m.meetingType}
                        </span>
                      </button>
                    )
                  }))}
                  {!isCollapsed('meetings') && <SectionMore hiddenCount={previewMeetings.length - visibleMeetings.length} onClick={() => expandPreview('meetings')} />}
                </>
              )}

              {/* ── Section: Waktu Fokus Hari Ini ────────────────────────────────── */}
              {showScheduleScope && todayFocusBlocks.length > 0 && (
                <>
                  <SectionHeader section="notif" title="Waktu Fokus Saya" count={todayFocusBlocks.length} onNav={() => navigate('/jadwal')} collapsed={isCollapsed('focus')} onToggle={() => toggleSection('focus')} />
                  {!isCollapsed('focus') && (visibleFocusBlocks.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> : visibleFocusBlocks.map(fb => {
                    const start = new Date(fb.startAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                    const end   = new Date(fb.endAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                    const now = Date.now()
                    const isActive = now >= new Date(fb.startAt).getTime() && now <= new Date(fb.endAt).getTime()
                    return (
                      <button className="fokus-item" key={fb.id} onClick={() => navigate('/jadwal')}>
                        <StatusAvatar bg="var(--purple-dim)" shape="rounded">
                          <svg fill="none" height="15" stroke="var(--purple-ink)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="15">
                            <circle cx="8" cy="8" r="6" />
                            <circle cx="8" cy="8" r="2.5" />
                            <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14" />
                          </svg>
                        </StatusAvatar>
                        <div className="fokus-item__body">
                          <div className="fokus-item__titlerow">
                            <span className="fokus-item__title">{fb.title}</span>
                            {isActive && (
                              <span
                                className="fokus-chip fokus-chip--tone"
                                style={toneVars({
                                  '--fokus-chip-bg': 'var(--purple-dim)',
                                  '--fokus-chip-fg': 'var(--purple-ink)',
                                })}
                              >
                                Aktif
                              </span>
                            )}
                          </div>
                          <div className="fokus-item__meta">
                            <span className="fokus-status-tag">{start} – {end}</span>
                            {fb.note && <span className="fokus-item__meta-detail">· {fb.note}</span>}
                          </div>
                        </div>
                        <span className="fokus-item__aside fokus-item__aside--label">Fokus</span>
                      </button>
                    )
                  }))}
                  {!isCollapsed('focus') && <SectionMore hiddenCount={previewFocusBlocks.length - visibleFocusBlocks.length} onClick={() => expandPreview('focus')} />}
                </>
              )}

              {/* ── Section: Pesan Langsung Belum Dibaca ─────────────────────────── */}
              {showCommunicationScope && unreadDms.length > 0 && (
                <>
                  <SectionHeader section="mention" title="Pesan Langsung" count={unreadDms.length} onNav={() => navigate('/channels')} collapsed={isCollapsed('dms')} onToggle={() => toggleSection('dms')} />
                  {!isCollapsed('dms') && (visibleUnreadDms.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> : visibleUnreadDms.map(ch => {
                    const partnerName = ch.description && ch.description !== 'Direct message'
                      ? ch.description
                      : (ch.lastMessage?.content ? ch.name : ch.name)
                    return (
                      <button
                        className="fokus-item"
                        key={ch.id}
                        onClick={() => { setSelectedChannelId(ch.id); navigate('/channels') }}
                      >
                        <StatusAvatar bg="var(--indigo-dim)" shape="circle">
                          <svg fill="none" height="15" stroke="var(--indigo)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="15">
                            <path d="M14 10a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
                          </svg>
                        </StatusAvatar>
                        <div className="fokus-item__body">
                          <div className="fokus-item__titlerow">
                            <span className="fokus-item__title">{partnerName}</span>
                            {(ch.unreadCount ?? 0) > 0 && (
                              <span
                                className="fokus-chip fokus-chip--tone"
                                style={toneVars({ '--fokus-chip-bg': 'var(--indigo-dim)', '--fokus-chip-fg': 'var(--indigo)' })}
                              >
                                {ch.unreadCount} baru
                              </span>
                            )}
                          </div>
                          {ch.lastMessage && (
                            <div className="fokus-item__meta">
                              <span className="fokus-item__meta-detail">{ch.lastMessage.content.slice(0, 60)}{ch.lastMessage.content.length > 60 ? '…' : ''}</span>
                            </div>
                          )}
                        </div>
                        <span className="fokus-item__aside fokus-item__aside--label">Balas →</span>
                      </button>
                    )
                  }))}
                  {!isCollapsed('dms') && <SectionMore hiddenCount={previewUnreadDms.length - visibleUnreadDms.length} onClick={() => expandPreview('dms')} />}
                </>
              )}

              {/* ── Section: Program Perlu Persetujuan ────────────────────────────── */}
              {showActionScope && pendingApprovalPrograms.length > 0 && (
                <>
                  <SectionHeader
                    section="approval"
                    title={explicitDecisionPrograms.length > 0 ? 'Keputusan Saya' : role === 'KASUBDIV' ? 'Persetujuan Kasub' : role === 'KADIV' ? 'Persetujuan Kadiv' : 'Program Belum Diajukan'}
                    count={pendingApprovalPrograms.length}
                    onNav={() => navigate('/programs')}
                    collapsed={isCollapsed('approval')}
                    onToggle={() => toggleSection('approval')}
                  />
                  {!isCollapsed('approval') && (visiblePendingApprovals.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> : visiblePendingApprovals.map(prog => (
                    <button className="fokus-item" key={prog.id} onClick={() => goToProgram(prog.id)}>
                      <StatusAvatar bg="var(--yellow-dim)" shape="rounded">
                        <svg fill="none" height="15" stroke="var(--yellow-ink)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="15">
                          <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z"/><path d="M8 6v3M8 11h.01"/>
                        </svg>
                      </StatusAvatar>
                      <div className="fokus-item__body">
                        <div className="fokus-item__titlerow">
                          <span className="fokus-item__title">{prog.name}</span>
                        </div>
                        <div className="fokus-item__meta">
                          <span className="code-badge fokus-code-badge">{prog.code}</span>
                          <span className="fokus-status-tag">
                            {prog.approvalStatus === 'PENDING_KASUB' ? 'Menunggu Kasub' :
                             prog.approvalStatus === 'PENDING_KADIV' ? 'Menunggu Kadiv' :
                             'Draft'}
                          </span>
                        </div>
                        {'decisionReason' in prog && (
                          <div className="fokus-item__impact">{prog.decisionReason}</div>
                        )}
                      </div>
                      <span className="fokus-item__aside fokus-item__aside--label">Review →</span>
                    </button>
                  )))}
                  {!isCollapsed('approval') && <SectionMore hiddenCount={previewPendingApprovals.length - visiblePendingApprovals.length} onClick={() => expandPreview('approval')} />}
                </>
              )}

              {/* ── Sections: order is role-aware ─────────────────────────────────── */}
              {/* BOD/KADIV: Programs → Blockers → Tasks */}
              {/* Others   : Tasks → Blockers → Programs */}

              {/* Section: Program Perlu Perhatian — strategic roles only (BOD/KADIV first) */}
              {showRiskScope && isStrategic && (
                <>
                  <SectionHeader section="atrisk" title="Program Perlu Perhatian" count={myAtRisk.length} onNav={() => navigate('/programs')} collapsed={isCollapsed('atrisk')} onToggle={() => toggleSection('atrisk')} />
                  {!isCollapsed('atrisk') && (myAtRisk.length === 0 ? <SectionEmpty text="Semua program dalam kondisi sehat ✓" /> :
                    visibleAtRisk.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> :
                    visibleAtRisk.map(prog => {
                      const hc = HEALTH_TONES[prog.healthStatus as keyof typeof HEALTH_TONES] ?? HEALTH_TONES.GREEN
                      return (
                        <button className="fokus-item" key={prog.id} onClick={() => goToProgram(prog.id)}>
                          <StatusAvatar bg={SOFT_SURFACE} shape="rounded"><IconProgram color={hc.fg} /></StatusAvatar>
                          <div className="fokus-item__body">
                            <div className="fokus-item__titlerow">
                              <span className="fokus-item__title">{prog.name}</span>
                            </div>
                            <div className="fokus-item__meta">
                              <span className="code-badge fokus-code-badge">{prog.code}</span>
                              <span className="fokus-status-tag">{prog.status.replace(/_/g, ' ')}</span>
                            </div>
                            <Bar value={prog.progressPercent} fill={hc.bar} track={TRACK_BG} />
                          </div>
                          <span className="fokus-item__aside fokus-item__aside--metric">
                            {prog.progressPercent}%
                          </span>
                        </button>
                      )
                    })
                  )}
                  {!isCollapsed('atrisk') && <SectionMore hiddenCount={previewAtRisk.length - visibleAtRisk.length} onClick={() => expandPreview('atrisk')} />}
                </>
              )}

              {/* Section: Ditugaskan ke Saya */}
              {showActionScope && (
                <>
                  <SectionHeader section="assigned" title="Ditugaskan ke Saya" count={myTasks.length} onNav={() => navigate('/execution')} collapsed={isCollapsed('assigned')} onToggle={() => toggleSection('assigned')} />
                  {!isCollapsed('assigned') && (myTasks.length === 0 ? <SectionEmpty text={`Tidak ada task aktif untuk ${firstName} saat ini`} /> :
                    visibleTasks.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> :
                    visibleTasks.map(item => {
                      const hc = HEALTH_TONES[item.healthStatus as keyof typeof HEALTH_TONES] ?? HEALTH_TONES.GREEN
                      return (
                        <button className="fokus-item" key={item.id} onClick={() => goToTask(item.id)}>
                          <StatusAvatar bg={SOFT_SURFACE} shape="rounded"><IconTask color={hc.fg} /></StatusAvatar>
                          <div className="fokus-item__body">
                            <div className="fokus-item__titlerow">
                              <span className="fokus-item__title">{item.title}</span>
                              {item.isBlocked && <span className="fokus-chip fokus-chip--blocked">Blocked</span>}
                            </div>
                            <div className="fokus-item__meta">
                              <span className="code-badge fokus-code-badge">{item.code}</span>
                              {item.workstream?.program?.code ? `${item.workstream.program.code} · ` : ''}
                              {item.workstream?.name}
                              {' '}
                              <span className="fokus-status-tag">{item.status.replace(/_/g, ' ')}</span>
                            </div>
                            {item.workstream?.program?.healthStatus && item.workstream.program.healthStatus !== 'GREEN' && (
                              <div className="fokus-item__impact">
                                Terkait program {item.workstream.program.code} yang berstatus {item.workstream.program.healthStatus}
                              </div>
                            )}
                            <Bar value={item.percentComplete} fill={hc.bar} track={TRACK_BG} />
                          </div>
                          <span className="fokus-item__aside fokus-item__aside--metric">
                            {item.percentComplete}%
                          </span>
                        </button>
                      )
                    })
                  )}
                  {!isCollapsed('assigned') && <SectionMore hiddenCount={previewTasks.length - visibleTasks.length} onClick={() => expandPreview('assigned')} />}
                </>
              )}

              {/* Section: Blocker Aktif */}
              {showBlockerScope && (
                <>
                  <SectionHeader section="blocker" title="Blocker Aktif" count={myBlockers.length} onNav={() => navigate('/execution')} collapsed={isCollapsed('blocker')} onToggle={() => toggleSection('blocker')} />
                  {!isCollapsed('blocker') && (myBlockers.length === 0 ? <SectionEmpty text={`Tidak ada blocker aktif untuk ${firstName} hari ini ✓`} /> :
                    visibleBlockers.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> :
                    visibleBlockers.map(b => {
                      const sc = SEVERITY_TONES[b.severity as keyof typeof SEVERITY_TONES] ?? SEVERITY_TONES.MEDIUM
                      return (
                        <button className="fokus-item" key={b.id} onClick={() => goToTask(b.taskId)}>
                          <StatusAvatar bg={SOFT_SURFACE} shape="circle"><IconBlock color={sc.fg} /></StatusAvatar>
                          <div className="fokus-item__body">
                            <div className="fokus-item__titlerow">
                              <span className="fokus-item__title">{b.title}</span>
                            </div>
                            <div className="fokus-item__meta">
                              <span className="code-badge fokus-code-badge">{b.code}</span>
                              {b.task?.code && <span>{b.task.code} · </span>}
                              <span className="fokus-status-tag">{b.status.replace(/_/g, ' ')}</span>
                              {' '}
                              <span className="fokus-item__sev-label" style={toneVars({ '--fokus-tone-fg': sc.fg })}>{SEV_LABEL[b.severity] ?? b.severity}</span>
                            </div>
                            {b.task?.workstream?.program && (
                              <div className="fokus-item__impact">
                                Dampak ke {b.task.workstream.program.code} · {b.task.workstream.program.name}
                              </div>
                            )}
                          </div>
                          <span className="fokus-item__aside fokus-item__aside--symbol">
                            {b.status === 'RESOLVED' ? '✓' : '—'}
                          </span>
                        </button>
                      )
                    })
                  )}
                  {!isCollapsed('blocker') && <SectionMore hiddenCount={previewBlockers.length - visibleBlockers.length} onClick={() => expandPreview('blocker')} />}
                </>
              )}

              {/* Section: Program Berisiko — non-strategic roles (after tasks/blockers) */}
              {showRiskScope && !isStrategic && (
                <>
                  <SectionHeader section="atrisk" title="Program Saya yang Berisiko" count={myAtRisk.length} onNav={() => navigate('/programs')} collapsed={isCollapsed('atrisk')} onToggle={() => toggleSection('atrisk')} />
                  {!isCollapsed('atrisk') && (myAtRisk.length === 0 ? <SectionEmpty text={`Semua program ${firstName} dalam kondisi sehat ✓`} /> :
                    visibleAtRisk.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> :
                    visibleAtRisk.map(prog => {
                      const hc = HEALTH_TONES[prog.healthStatus as keyof typeof HEALTH_TONES] ?? HEALTH_TONES.GREEN
                      return (
                        <button className="fokus-item" key={prog.id} onClick={() => goToProgram(prog.id)}>
                          <StatusAvatar bg={SOFT_SURFACE} shape="rounded"><IconProgram color={hc.fg} /></StatusAvatar>
                          <div className="fokus-item__body">
                            <div className="fokus-item__titlerow">
                              <span className="fokus-item__title">{prog.name}</span>
                            </div>
                            <div className="fokus-item__meta">
                              <span className="code-badge fokus-code-badge">{prog.code}</span>
                              <span className="fokus-status-tag">{prog.status.replace(/_/g, ' ')}</span>
                            </div>
                            <Bar value={prog.progressPercent} fill={hc.bar} track={TRACK_BG} />
                          </div>
                          <span className="fokus-item__aside fokus-item__aside--metric">
                            {prog.progressPercent}%
                          </span>
                        </button>
                      )
                    })
                  )}
                  {!isCollapsed('atrisk') && <SectionMore hiddenCount={previewAtRisk.length - visibleAtRisk.length} onClick={() => expandPreview('atrisk')} />}
                </>
              )}

              {/* ── 4. Mention & Approval ── */}
              {showCommunicationScope && (
                <>
                  <SectionHeader section="mention" title="Mention & Approval" count={mentions.length} collapsed={isCollapsed('mention')} onToggle={() => toggleSection('mention')} />
                  {!isCollapsed('mention') && (mentions.length === 0 ? <SectionEmpty text={`Tidak ada mention atau approval untuk ${firstName}`} /> :
                    visibleMentionGroups.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> :
                    visibleMentionGroups.map((group, idx) => {
                      const n = group.latest
                      const chipStyle = n.type === 'APPROVAL'
                        ? { background: HEALTH_TONES.YELLOW.bg, color: HEALTH_TONES.YELLOW.fg }
                        : { background: HEALTH_TONES.GREEN.bg,  color: HEALTH_TONES.GREEN.fg }
                      return (
                        <button className="fokus-item fokus-item--mention" key={group.id} onClick={() => void handleNotifGroupClick(group)}>
                          <PersonAvatar name={n.source.split('·')[0].trim()} seed={n.id + idx} />
                          <div className="fokus-item__body">
                            <div className="fokus-item__titlerow">
                              <span className="fokus-item__author">{n.source.split('·')[0].trim()}</span>
                              <span className="fokus-chip fokus-chip--inline fokus-chip--tone" style={toneVars({ '--fokus-chip-bg': chipStyle.background, '--fokus-chip-fg': chipStyle.color })}>{NOTIF_TYPE_LABEL[n.type] ?? n.type}</span>
                              {group.items.length > 1 && <span className="fokus-chip fokus-chip--inline">{group.items.length} update</span>}
                              <time className="fokus-item__time">{formatDate(n.createdAt)}</time>
                            </div>
                            {n.source.includes('·') && (
                              <div className="fokus-item__source">{n.source.split('·').slice(1).join('·').trim()}</div>
                            )}
                            <p className="fokus-item__msg">{n.message}</p>
                          </div>
                        </button>
                      )
                    })
                  )}
                  {!isCollapsed('mention') && <SectionMore hiddenCount={previewMentionGroups.length - visibleMentionGroups.length} onClick={() => expandPreview('mention')} />}
                </>
              )}

              {/* ── 5. Notifikasi Lainnya ── */}
              {(focusScope === 'all' || focusScope === 'action') && scopedOtherUnreadCount > 0 && <>
                <SectionHeader section="notif" title="Notifikasi Lainnya" count={scopedOtherUnreadCount} collapsed={isCollapsed('notif')} onToggle={() => toggleSection('notif')} />
                {!isCollapsed('notif') && (visibleOtherUnreadGroups.length === 0 ? <SectionEmpty text={surfacedPreviewText} /> : visibleOtherUnreadGroups.map((group, idx) => {
                  const n = group.latest
                  return (
                    <button className="fokus-item" key={group.id} onClick={() => void handleNotifGroupClick(group)}>
                      <PersonAvatar name={n.source.split('·')[0].trim()} seed={n.id + idx + 60} />
                      <div className="fokus-item__body">
                        <div className="fokus-item__titlerow">
                          <span className="fokus-item__author">{n.source.split('·')[0].trim()}</span>
                          {group.items.length > 1 && <span className="fokus-chip fokus-chip--inline">{group.items.length} update</span>}
                          <time className="fokus-item__time">{formatDate(n.createdAt)}</time>
                        </div>
                        {n.source.includes('·') && (
                          <div className="fokus-item__source">{n.source.split('·').slice(1).join('·').trim()}</div>
                        )}
                        <p className="fokus-item__msg">{n.message}</p>
                      </div>
                      <span className="fokus-chip fokus-chip--tone" style={toneVars({ '--fokus-chip-bg': NEUTRAL_TONE.bg, '--fokus-chip-fg': NEUTRAL_TONE.fg })}>
                        {NOTIF_TYPE_LABEL[n.type] ?? n.type}
                      </span>
                    </button>
                  )
                }))}
                {!isCollapsed('notif') && <SectionMore hiddenCount={previewOtherUnreadGroups.length - visibleOtherUnreadGroups.length} onClick={() => expandPreview('notif')} />}
              </>}

            </div>
          ) : null}

        </div>

        {/* ── Sidebar ── */}
        <aside className="inbox-sidebar right-rail">

          <div className="section-block">
            <div className="section-header">
              <h3 className="section-title fokus-sidebar-title">Ringkasan</h3>
            </div>
            <div className="fokus-stats-list">
              {decisionRows.map(({ label, value, color, icon }) => (
                <div
                  className="fokus-stats-row"
                  key={label}
                  style={toneVars({
                    '--fokus-stats-icon': value > 0 ? color : 'var(--text-muted)',
                    '--fokus-stats-value': value > 0 ? color : 'var(--text-strong)',
                  })}
                >
                  <span className="fokus-stats-row__icon">{icon}</span>
                  <span className="fokus-stats-row__label">{label}</span>
                  <span className="fokus-stats-row__val">{value}</span>
                </div>
              ))}
            </div>

            {topFocusItems[0] && (
              <div className="fokus-next-action">
                <div className="fokus-next-action__label">Fokus berikutnya</div>
                <button className="fokus-next-action__button" onClick={() => handleFocusItemClick(topFocusItems[0], 1)}>
                  <span className="fokus-next-action__title">{topFocusItems[0].title}</span>
                  <span className="fokus-next-action__reason">{topFocusItems[0].nextCue}</span>
                </button>
              </div>
            )}

            {topFocusItems.length > 1 && (
              <div className="fokus-plan">
                <div className="fokus-plan__label">Rencana 30 menit</div>
                {topFocusItems.map((item, index) => (
                  <button className="fokus-plan__row" key={item.id} onClick={() => handleFocusItemClick(item, index + 1)} type="button">
                    <span className="fokus-plan__step">{index + 1}</span>
                    <span className="fokus-plan__body">
                      <span className="fokus-plan__title">{item.actionLabel.replace(' →', '')}</span>
                      <span className="fokus-plan__cue">{item.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {prioritySignals.length > 0 && (
              <div className="fokus-signal-list">
                <div className="fokus-signal-list__label">Sinyal prioritas</div>
                {prioritySignals.map(signal => (
                  <div className="fokus-signal-list__row" key={signal.label}>
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                  </div>
                ))}
                <div className="fokus-policy-note">
                  {priorityPolicyNotes.map(note => (
                    <span key={note}>{note}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly progress */}
            <div className="fokus-weekly-progress">
              <div className="fokus-weekly-progress__header">
                <span>Progres minggu ini</span>
                <span className="fokus-weekly-progress__count">{weeklyCompleted}/{weeklyTotal}</span>
              </div>
              <div className="fokus-weekly-progress__track">
                <div
                  className="fokus-weekly-progress__fill"
                  style={{ width: `${weeklyTotal > 0 ? Math.min(100, Math.round((weeklyCompleted / weeklyTotal) * 100)) : 0}%` }}
                />
              </div>
              <div className="fokus-weekly-progress__sub">
                {weeklyCompleted} task diselesaikan minggu ini
              </div>
            </div>
          </div>

          <div className="section-block">
            <div className="section-header">
              <h3 className="section-title fokus-sidebar-title">
                {isStrategic ? 'Portfolio Programs' : 'Program Saya'}
              </h3>
              <span className="section-badge">{sidebarProgs.length}</span>
            </div>
            <div className="fokus-sidebar-list">
              {sidebarProgs.slice(0, 5).map(prog => {
                const hc = HEALTH_TONES[prog.healthStatus as keyof typeof HEALTH_TONES]
                return (
                  <button
                    className="list-row fokus-sidebar-program"
                    key={prog.id}
                    onClick={() => goToProgram(prog.id)}
                    style={toneVars({
                      '--fokus-program-accent': hc?.bar ?? NEUTRAL_TONE.fg,
                      '--fokus-program-progress': `${Math.min(100, prog.progressPercent)}%`,
                      '--fokus-program-track': TRACK_BG,
                    })}
                  >
                    <span className="fokus-sidebar-program__dot" />
                    <div className="fokus-sidebar-program__body">
                      <div className="fokus-sidebar-program__name">
                        {prog.name}
                      </div>
                      <div className="fokus-sidebar-program__track">
                        <div className="fokus-sidebar-program__fill" />
                      </div>
                    </div>
                    <span className="fokus-sidebar-program__pct">{prog.progressPercent}%</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="section-block">
            <div className="section-header">
              <h3 className="section-title fokus-sidebar-title">Aksi Cepat</h3>
            </div>
            <div className="fokus-quicklinks">
              {((isStrategic ? [
                ['Dashboard', '/dashboard',
                  <svg key="db" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><rect height="5" rx="1" width="6" x="2" y="2" /><rect height="8" rx="1" width="6" x="2" y="9" /><rect height="5" rx="1" width="5" x="9" y="2" /><rect height="8" rx="1" width="5" x="9" y="9" /></svg>],
                ['Semua Program', '/programs',
                  <svg key="pr" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><rect height="11" rx="1.5" width="10" x="3" y="2.5" /><path d="M6 2.5h4v2H6zM5.5 7h5M5.5 10h5" /></svg>],
                ['Jadwal Meeting', '/jadwal',
                  <svg key="sc" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><rect height="11" rx="1.5" width="12" x="2" y="3" /><path d="M5 1.5v3M11 1.5v3M2 7h12" /></svg>],
                ['Channels', '/channels',
                  <svg key="ch" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><path d="M14 10a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /></svg>],
              ] : [
                ['Tugas Saya', '/execution',
                  <svg key="ex2" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><rect height="11" rx="2" width="11" x="2.5" y="2.5" /><path d="m5.5 8 2 2 3-3.5" /></svg>],
                ['Jadwal Meeting', '/jadwal',
                  <svg key="sc" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><rect height="11" rx="1.5" width="12" x="2" y="3" /><path d="M5 1.5v3M11 1.5v3M2 7h12" /></svg>],
                ['Channels', '/channels',
                  <svg key="ch" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><path d="M14 10a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /></svg>],
                ['Presence', '/presence',
                  <svg key="ps" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14"><circle cx="6" cy="5" r="2" /><circle cx="11" cy="5" r="2" /><path d="M1 14c0-2.8 2-4.5 5-4.5s5 1.7 5 4.5" /><path d="M11 10.5c1.5.3 3 1.5 3 3.5" /></svg>],
              ]) as [string, string, React.ReactNode][]).map(([label, path, icon]) => (
                <button className="fokus-quicklink" key={label} onClick={() => navigate(path)}>
                  <span className="fokus-quicklink__icon">{icon}</span>
                  <span className="fokus-quicklink__label">{label}</span>
                  <span className="fokus-quicklink__arrow">
                    <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="12"><path d="m6 3 5 5-5 5" /></svg>
                  </span>
                </button>
              ))}
            </div>
          </div>

        </aside>
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
