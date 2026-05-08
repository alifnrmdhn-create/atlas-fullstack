import { useEffect, useId, useRef, useState, startTransition } from 'react'
import type { ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { effectivePresenceSlug } from '../components/ui'
import { applyThemePreference, getThemeSnapshot } from '../lib/theme'
import type { ResolvedTheme } from '../lib/theme'

type NavItem = {
  path: string
  label: string
  caption: string
  icon: () => React.ReactElement
  badge?: () => number
}

type SidebarTooltipState = {
  label: string
  detail?: string
  top: number
  left: number
  placement: 'right' | 'left'
  icon?: React.ReactElement
}

function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5L8 2.5l5.5 5" />
      <path d="M3.5 7v6.5h9V7" />
      <path d="M6.5 13.5v-3h3v3" />
    </svg>
  )
}
function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="4" height="4" rx="0.8" />
      <rect x="10" y="2" width="4" height="4" rx="0.8" />
      <rect x="2" y="10" width="4" height="4" rx="0.8" />
      <rect x="10" y="10" width="4" height="4" rx="0.8" />
    </svg>
  )
}
function IconPrograms() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2.5" width="10" height="11" rx="1.6" />
      <path d="M6 2.5h4v2H6z" />
      <path d="M5.5 7h5M5.5 10h5" />
    </svg>
  )
}
function IconExecution() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 13.5v-4.5" />
      <path d="M8 13.5v-7" />
      <path d="M12.5 13.5v-10" />
      <path d="M2 13.5h12" />
    </svg>
  )
}
function IconRoadmap() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12" />
      <path d="M2 8h9" />
      <path d="M2 12h6" />
    </svg>
  )
}
function IconKpiKolegial() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 8 8 4.5" />
      <path d="M8 8 11 9.5" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconScorecard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5l1.4 3.2 3.6.4-2.6 2.4.7 3.5L8 9.2l-3.1 1.8.7-3.5L3 5.1l3.6-.4z" />
      <path d="M4 13.5h8" />
      <path d="M6 13.5v-2M10 13.5v-2" />
    </svg>
  )
}
function IconKpiIndividu() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <path d="M10.5 7.5h4M10.5 10h3M10.5 12.5h2" />
    </svg>
  )
}
function IconReports() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 13.5h11" />
      <path d="M2.5 13.5V3" />
      <path d="M4 10.5 7 7.5l2.5 2 3.5-4" />
    </svg>
  )
}
function IconInbox() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14" />
    </svg>
  )
}
function IconActivity() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h2l2-5 3 10 2-7 1.5 2H14" />
    </svg>
  )
}
function IconGoals() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.2 3.2l1.2 1.2M11.6 11.6l1.2 1.2M3.2 12.8l1.2-1.2M11.6 4.4l1.2-1.2" />
    </svg>
  )
}
function IconChannels() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.5v11" />
      <path d="M4 3.5h8l-2.2 2.8L12 9H4" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  )
}
function IconPresence() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 14a5 5 0 0 1 10 0" />
      <circle cx="12" cy="4.5" r="2" />
      <path d="M14.5 14a3.5 3.5 0 0 0-3-3.5" />
    </svg>
  )
}
function IconProfile() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5.5" r="3" />
      <path d="M2 14a6 6 0 0 1 12 0" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="5" r="2.5" />
      <path d="M1 14a4.5 4.5 0 0 1 9 0" />
      <circle cx="12" cy="5" r="2" />
      <path d="M14.5 13a3.5 3.5 0 0 0-3-3.2" />
    </svg>
  )
}
function IconOrg() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="1.5" width="4" height="3" rx="1" />
      <rect x="1.5" y="11.5" width="4" height="3" rx="1" />
      <rect x="6" y="11.5" width="4" height="3" rx="1" />
      <rect x="10.5" y="11.5" width="4" height="3" rx="1" />
      <path d="M8 4.5v3M8 7.5H3.5v4M8 7.5h4.5v4" />
    </svg>
  )
}
function IconRoles() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5 10 6h5l-4 3 1.5 4.5L8 11l-4.5 2.5L5 9 1 6h5z" />
    </svg>
  )
}
function IconPositions() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="4" rx="1" />
      <rect x="1.5" y="7.5" width="8" height="3" rx="1" />
      <rect x="1.5" y="12" width="5" height="2.5" rx="1" />
    </svg>
  )
}
function IconAssignments() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
      <path d="M6 2.5h4v2H6z" />
      <path d="m5.5 8 1.3 1.3L10 6.5" />
      <path d="M5.5 11.5h3" />
    </svg>
  )
}
function IconSchedule() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M5 1.5v3M11 1.5v3M2 7h12" />
      <path d="M5 10h2M9 10h2M5 13h2" />
    </svg>
  )
}
function IconMonthlyReports() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" />
      <path d="M5 1.5v2M11 1.5v2" />
      <path d="M5 7h6M5 10h4" />
      <circle cx="11.5" cy="10.5" r="2.5" fill="none" />
      <path d="M11.5 9v1.5l1 1" />
    </svg>
  )
}

function IconRiskReports() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2L14 13H2L8 2z" />
      <path d="M8 6v3.5M8 11v.5" strokeWidth="1.5" />
    </svg>
  )
}

const ADMIN_ROLES = new Set(['superadmin', 'admin'])
const prefetchedRoutes = new Set<string>()

function prefetchRoute(path: string) {
  const route = path === '/roadmap' ? '/programs' : path
  if (prefetchedRoutes.has(route)) return
  prefetchedRoutes.add(route)

  const loaders: Record<string, () => Promise<unknown>> = {
    '/activity': () => import('../Pages/ActivityView'),
    '/admin/orgs': () => import('../Pages/AdminOrgsView'),
    '/admin/positions': () => import('../Pages/AdminPositionsView'),
    '/admin/roles': () => import('../Pages/AdminRolesView'),
    '/admin/users': () => import('../Pages/AdminUsersView'),
    '/channels': () => import('../Pages/ChannelsViewWrapper'),
    '/': () => import('../Pages/HomeView'),
    '/dashboard': () => import('../Pages/DashboardView'),
    '/execution': () => import('../Pages/WorkboardView'),
    '/penugasan': () => import('../Pages/AssignmentsView'),
    '/fokus': () => import('../Pages/InboxView'),
    '/goals': () => import('../Pages/GoalsView'),
    '/jadwal': () => import('../Pages/ScheduleView'),
    '/laporan-bulanan': () => import('../Pages/MonthlyReportsView'),
    '/laporan-risiko': () => import('../Pages/RiskReportsView'),
    '/playbook': () => import('../Pages/PlaybookView'),
    '/presence': () => import('../Pages/PresenceView'),
    '/profile': () => import('../Pages/ProfileView'),
    '/programs': () => import('../Pages/ProgramsView'),
    '/reports': () => import('../Pages/ReportsView'),
    '/search': () => import('../Pages/SearchView'),
    '/settings': () => import('../Pages/SettingsView'),
    '/performance/scorecard': () => import('../Pages/Performance/ScorecardView'),
    '/performance/kolegial':  () => import('../Pages/Performance/KolegialView'),
    '/performance/divisi':    () => import('../Pages/Performance/DivisiView'),
    '/performance/individu':  () => import('../Pages/Performance/IndividuView'),
  }

  void loaders[route]?.().catch(() => {
    prefetchedRoutes.delete(route)
  })
}

function normalizeShellPath(pathname: string): string {
  if (pathname === '/') return '/'
  if (pathname.startsWith('/programs/')) return '/programs'
  if (pathname.startsWith('/execution/tasks/')) return '/execution'
  if (pathname.startsWith('/assignments')) return '/penugasan'
  if (pathname.startsWith('/channels/')) return '/channels'
  if (pathname.startsWith('/meetings')) return '/jadwal'
  if (pathname.startsWith('/monthly-reports') || pathname.startsWith('/laporan-bulanan/')) return '/laporan-bulanan'
  if (pathname.startsWith('/risk-reports') || pathname.startsWith('/laporan-risiko/')) return '/laporan-risiko'
  if (pathname.startsWith('/organization')) return '/admin/orgs'
  if (pathname.startsWith('/performance/kolegial')) return '/performance/kolegial'
  if (pathname.startsWith('/performance/scorecard')) return '/performance/scorecard'
  if (pathname.startsWith('/performance/divisi')) return '/performance/divisi'
  if (pathname.startsWith('/performance/me')) return '/performance/me'
  if (pathname.startsWith('/performance/individu')) return '/performance/individu'
  return pathname
}

// ── Notification Toast Item ─────────────────────────────────────────────────
import { type NotificationItem } from '../types'

type NotificationDropGroup = {
  id: string
  latest: NotificationItem
  actionItem?: NotificationItem
  items: NotificationItem[]
  unreadCount: number
}

type NotificationDropView = 'all' | 'action' | 'communication' | 'risk'

const DAY_MS = 24 * 60 * 60 * 1000
const READ_CONTEXT_DROPDOWN_TTL_DAYS = 2
const READ_ACTION_DROPDOWN_TTL_DAYS = 14

const ACTION_NOTIF_TYPES = new Set([
  'APPROVAL',
  'BLOCKER_CREATED',
  'DM_RECEIVED',
  'MENTION',
  'PROGRAM_NEEDS_APPROVAL',
  'REPORT_NEEDS_REVISION',
  'DEADLINE_APPROACHING',
  'TASK_ASSIGNED',
  // Sprint 4 — Clear the Path
  'CLEAR_PATH_REQUESTED',
  // Sprint 4 — carryover threshold (action item belum selesai berulang)
  'CARRYOVER_THRESHOLD',
])

const NOTIF_FALLBACK_CONTEXT: Record<string, { roleImpact: string; impact: string }> = {
  APPROVAL: { roleImpact: 'Anda pemberi keputusan', impact: 'Menahan alur sampai diputuskan' },
  BLOCKER_CREATED: { roleImpact: 'Anda perlu bantu unblock', impact: 'Progres task tertahan' },
  DEADLINE_APPROACHING: { roleImpact: 'Anda pemilik tenggat', impact: 'Risiko keterlambatan meningkat' },
  DM_RECEIVED: { roleImpact: 'Anda penerima pesan langsung', impact: 'Percakapan kerja menunggu respon' },
  MENTION: { roleImpact: 'Anda disebut dalam diskusi', impact: 'Ada konteks yang mungkin membutuhkan respon' },
  PROGRAM_NEEDS_APPROVAL: { roleImpact: 'Anda approver program', impact: 'Program belum bisa lanjut tanpa approval' },
  REPORT_NEEDS_REVISION: { roleImpact: 'Anda perlu memperbaiki laporan', impact: 'Siklus review tertahan sampai revisi masuk' },
  TASK_ASSIGNED: { roleImpact: 'Anda PIC tugas', impact: 'Menunggu tindak lanjut dari Anda' },
  // Sprint 4 — Clear the Path
  CLEAR_PATH_REQUESTED: { roleImpact: 'Anda diminta membersihkan hambatan', impact: 'Tim menunggu disposition (Commit / Reroute / Decline)' },
  CLEAR_PATH_COMMITTED:  { roleImpact: 'Permintaan Anda di-commit atasan', impact: 'Hambatan akan dibersihkan sesuai komitmen' },
  CLEAR_PATH_CLEARED:    { roleImpact: 'Hambatan sudah dibersihkan', impact: 'Anda bisa lanjut eksekusi' },
  // Sprint 4 — carryover
  CARRYOVER_THRESHOLD: { roleImpact: 'Action item Anda berulang carry-over', impact: 'Pertimbangkan eskalasi atau re-scope' },
  // Sprint 5 — Plan→Do handoff
  PROGRAM_TASKS_ASSIGNED: { roleImpact: 'Tugas baru di pipeline Anda', impact: 'Program aktif, mulai eksekusi' },
}

function isActionNotification(type: string): boolean {
  return ACTION_NOTIF_TYPES.has(type)
}

function notificationIntentLabel(notification: NotificationItem): string {
  if (notification.actionLabel) return notification.actionLabel
  if (notification.type === 'DM_RECEIVED') return 'Balas'
  if (notification.type === 'MENTION') return 'Buka percakapan'
  if (notification.type === 'BLOCKER_CREATED') return 'Follow up'
  if (notification.type === 'PROGRAM_NEEDS_APPROVAL' || notification.type === 'APPROVAL') return 'Review'
  if (notification.type === 'REPORT_NEEDS_REVISION') return 'Revisi'
  if (notification.type === 'DEADLINE_APPROACHING') return 'Cek deadline'
  if (notification.type === 'TASK_ASSIGNED') return 'Kerjakan'
  if (notification.type === 'CLEAR_PATH_REQUESTED') return 'Disposition'
  if (notification.type === 'CLEAR_PATH_COMMITTED') return 'Lihat komitmen'
  if (notification.type === 'CLEAR_PATH_CLEARED') return 'Lanjut eksekusi'
  if (notification.type === 'CARRYOVER_THRESHOLD') return 'Tinjau ulang'
  if (notification.type === 'PROGRAM_TASKS_ASSIGNED') return 'Buka pipeline'
  return 'Cek detail'
}

function notificationRequiresAction(notification: NotificationItem): boolean {
  return notification.requiresAction ?? isActionNotification(notification.type)
}

function notificationVisibleInDropdown(notification: NotificationItem, now = Date.now()): boolean {
  if (notification.state === 'DISMISSED') return false
  if (notification.dismissedAt || notification.resolvedAt) return false
  if (notification.expiresAt) {
    const expiresAt = new Date(notification.expiresAt).getTime()
    if (!Number.isNaN(expiresAt) && expiresAt <= now) return false
  }
  if (notification.state === 'UNREAD') return true

  const retentionDays = notificationRequiresAction(notification)
    ? READ_ACTION_DROPDOWN_TTL_DAYS
    : READ_CONTEXT_DROPDOWN_TTL_DAYS
  const anchor = notification.readAt ?? notification.createdAt
  const anchorTime = new Date(anchor).getTime()
  if (Number.isNaN(anchorTime)) return false

  return now - anchorTime <= retentionDays * DAY_MS
}

function shouldPreferNotification(current: NotificationItem, candidate: NotificationItem): boolean {
  const shouldPreferUnread = candidate.state === 'UNREAD' && current.state !== 'UNREAD'
  const isNewerSameReadState =
    candidate.state === current.state &&
    new Date(candidate.createdAt).getTime() > new Date(current.createdAt).getTime()
  return shouldPreferUnread || isNewerSameReadState
}

function notificationPriority(notification: NotificationItem): NonNullable<NotificationItem['priority']> {
  return notification.priority ?? (notificationRequiresAction(notification) ? 'MEDIUM' : 'LOW')
}

function notificationCategory(notification: NotificationItem): NonNullable<NotificationItem['category']> {
  if (notification.category) return notification.category
  if (notification.type === 'DM_RECEIVED' || notification.type === 'MENTION') return 'COMMUNICATION'
  if (notification.type === 'BLOCKER_CREATED' || notification.type === 'DEADLINE_APPROACHING') return 'RISK'
  if (notificationRequiresAction(notification)) return 'ACTION'
  return 'SYSTEM'
}

function notificationRoleImpact(notification: NotificationItem): string | undefined {
  return notification.roleImpact ?? NOTIF_FALLBACK_CONTEXT[notification.type]?.roleImpact
}

function notificationImpact(notification: NotificationItem): string | undefined {
  return notification.impact ?? NOTIF_FALLBACK_CONTEXT[notification.type]?.impact
}

function notificationDropdownContext(notification: NotificationItem): string[] {
  const roleImpact = notificationRoleImpact(notification)
  const impact = notificationImpact(notification)

  if (notificationRequiresAction(notification)) {
    return [impact ?? roleImpact].filter((value): value is string => Boolean(value))
  }

  return [roleImpact ?? impact].filter((value): value is string => Boolean(value))
}

function notificationDropGroupKey(notification: NotificationItem): string {
  if (notification.groupKey) return notification.groupKey
  const entity = notification.source.split('·').map(part => part.trim()).find(part => part.includes(':'))
  return entity ?? `${notification.type}:${notification.source}`
}

function groupDropNotifications(items: NotificationItem[]): NotificationDropGroup[] {
  const byKey = new Map<string, NotificationDropGroup>()
  for (const notification of items) {
    const key = notificationDropGroupKey(notification)
    const group = byKey.get(key)
    if (!group) {
      byKey.set(key, {
        id: key,
        latest: notification,
        actionItem: notificationRequiresAction(notification) ? notification : undefined,
        items: [notification],
        unreadCount: notification.state === 'UNREAD' ? 1 : 0,
      })
      continue
    }
    group.items.push(notification)
    if (notification.state === 'UNREAD') group.unreadCount += 1
    if (notificationRequiresAction(notification) && (!group.actionItem || shouldPreferNotification(group.actionItem, notification))) {
      group.actionItem = notification
    }
    if (shouldPreferNotification(group.latest, notification)) {
      group.latest = notification
    }
  }
  return Array.from(byKey.values()).sort((a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime())
}

function NotifToast({
  toast, typeLabel, typeClass, isDm, isMention,
  onDismiss, onClick,
}: {
  toast: NotificationItem
  typeLabel: string
  typeClass: string
  isDm: boolean
  isMention: boolean
  onDismiss: () => void
  onClick: () => void
}) {
  // Simpan onDismiss di ref agar timer tidak direset setiap re-render parent
  const dismissRef = useRef(onDismiss)
  useEffect(() => { dismissRef.current = onDismiss })

  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(), 5500)
    return () => clearTimeout(t)
  }, []) // intentionally empty — hanya jalan sekali saat mount

  const avatarLetter = (() => {
    const parts = toast.source.split('·')
    const name = parts[0].trim()
    if (name.includes(':')) return '!'
    return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '!'
  })()

  return (
    <div className="notif-toast" role="alert">
      <button className="notif-toast__body" onClick={onClick} type="button">
        <div className={`notif-toast__avatar${isDm || isMention ? ' notif-toast__avatar--person' : ''}`}>
          {isDm || isMention ? avatarLetter : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1.5a5 5 0 0 1 5 5v2.5l1 1.5H1l1-1.5V6.5a5 5 0 0 1 5-5Z" />
              <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
            </svg>
          )}
        </div>
        <div className="notif-toast__content">
          <div className="notif-toast__header">
            <span className={`notif-toast__type ${typeClass}`}>{typeLabel}</span>
            <span className="notif-toast__app">ATLAS</span>
          </div>
          <p className="notif-toast__msg">{toast.message}</p>
        </div>
      </button>
      <button
        className="notif-toast__close"
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        type="button"
        aria-label="Tutup"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m1 1 10 10M11 1 1 11" />
        </svg>
      </button>
      <div className="notif-toast__progress" />
    </div>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { url } = usePage()
  const pathname = url.split('?')[0] || '/'
  const activePath = normalizeShellPath(pathname)
  const navigate = useInertiaNavigate()
  const {
    userMenuSurface, toggleUserMenu, closeUserMenu,
    currentUser, totalUnreadChannels,
    overviewStatus, loadOverview,
    query, setQuery, runSearch,
    handleLogout, notifications, markNotificationRead,
    notifToasts, dismissToast,
    setSelectedProgramId, setSelectedTaskId, setSelectedChannelId,
    presence,
    authStatus, logoutPending, requestLogout, cancelLogout,
  } = useWorkspace()
  const isAdmin = ADMIN_ROLES.has(currentUser?.roleType?.toLowerCase() ?? '')
  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const shellRef = useRef<HTMLDivElement>(null)
  const collapsedRef = useRef(false)
  const [sidebarCollapsedView, setSidebarCollapsedView] = useState(false)

  const toggleSidebar = () => {
    const next = !collapsedRef.current
    collapsedRef.current = next
    shellRef.current?.classList.toggle('app-shell--collapsed', next)
    if (!next) setTooltipState(null)
    startTransition(() => setSidebarCollapsedView(next))
  }

  const [tooltipState, setTooltipState] = useState<SidebarTooltipState | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEscKey(closeUserMenu, userMenuSurface === 'topbar')
  useEscKey(cancelLogout, logoutPending)
  const logoutDialogRef = useDialogFocus<HTMLDivElement>(logoutPending)
  const logoutTitleId = useId()
  const logoutDescId = useId()

  const userInitials = (currentUser?.name ?? 'Atlas User')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  const userRoleLabel = currentUser?.positionTitle ?? currentUser?.roleType ?? currentUser?.unit?.name ?? 'Pengguna'

  // Resolve current user's live activity for the avatar dot.
  const myPresence = currentUser
    ? presence.find((p) => p.userId === currentUser.id)
    : undefined
  const myPresenceSlug = myPresence
    ? effectivePresenceSlug(myPresence.status, myPresence.lastActivityAt)
    : 'offline'
  const dotClass = myPresenceSlug === 'online' ? 'sidebar__avatar-dot--online'
    : myPresenceSlug === 'away' ? 'sidebar__avatar-dot--away'
    : myPresenceSlug === 'do-not-disturb' ? 'sidebar__avatar-dot--dnd'
    : 'sidebar__avatar-dot--offline'

  // Display name — BOD always gets full name; others get first name unless abbreviated
  const displayName = (() => {
    const name = currentUser?.name
    if (!name) return 'Atlas User'
    if (role === 'BOD') return name
    const parts = name.split(' ')
    if (parts[0].length <= 2 || parts[0].endsWith('.')) return name
    return parts[0]
  })()

  const openTooltip = (anchor: HTMLElement, label: string, detail?: string, icon?: React.ReactElement) => {
    if (!collapsedRef.current) return
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    const rect = anchor.getBoundingClientRect()
    const preferredWidth = detail ? 246 : 196
    const margin = 12
    const fitsRight = rect.right + preferredWidth + 18 <= window.innerWidth - margin
    const placement = fitsRight ? 'right' : 'left'
    const left = placement === 'right'
      ? rect.right + 12
      : Math.max(margin, rect.left - preferredWidth - 12)
    const top = Math.min(
      Math.max(rect.top + rect.height / 2, margin + 32),
      window.innerHeight - margin - 32,
    )
    setTooltipState({ label, detail, top, left, placement, icon })
  }
  const closeTooltip = () => {
    tooltipTimeoutRef.current = setTimeout(() => setTooltipState(null), 80)
  }

  const activeNotifications = notifications.filter(notification => notificationVisibleInDropdown(notification))
  const unreadCount = activeNotifications.filter(n => n.state === 'UNREAD').length
  const urgentCount = activeNotifications.filter(n =>
    n.state === 'UNREAD' && notificationRequiresAction(n)
  ).length

  // ── Notification dropdown ──────────────────────────────────────────────────
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getThemeSnapshot().resolved)

  useEffect(() => {
    const handler = (e: Event) => {
      const snapshot = (e as CustomEvent<{ resolved: ResolvedTheme }>).detail
      if (snapshot?.resolved) setResolvedTheme(snapshot.resolved)
    }
    window.addEventListener('atlas:themechange', handler)
    return () => window.removeEventListener('atlas:themechange', handler)
  }, [])

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark'
    applyThemePreference(next)
    setResolvedTheme(next)
  }

  const [notifDropOpen, setNotifDropOpen] = useState(false)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [notifDropView, setNotifDropView] = useState<NotificationDropView>('all')
  const notifDropRef = useRef<HTMLDivElement>(null)

  useEscKey(() => setNotifDropOpen(false), notifDropOpen)

  useEffect(() => {
    if (!notifDropOpen) return
    const handler = (e: MouseEvent) => {
      if (notifDropRef.current && !notifDropRef.current.contains(e.target as Node)) {
        setNotifDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifDropOpen])

  const NOTIF_TYPE_LABEL: Record<string, string> = {
    MENTION: 'Mention', APPROVAL: 'Approval',
    BLOCKER_CREATED: 'Blocker', TASK_ASSIGNED: 'Tugas',
    PROGRAM_NEEDS_APPROVAL: 'Approval', PROGRAM_APPROVED: 'Program',
    PROGRAM_REJECTED: 'Program', REPORT_AWAITING_REVIEW: 'Laporan',
    REPORT_AWAITING_APPROVAL: 'Laporan', REPORT_APPROVED: 'Laporan',
    REPORT_REJECTED: 'Laporan', REPORT_NEEDS_REVISION: 'Laporan',
    DEADLINE_APPROACHING: 'Deadline', DM_RECEIVED: 'DM',
    CLEAR_PATH_REQUESTED: 'Clear the Path', CLEAR_PATH_COMMITTED: 'Clear the Path',
    CLEAR_PATH_CLEARED: 'Clear the Path', CARRYOVER_THRESHOLD: 'Carryover',
    PROGRAM_TASKS_ASSIGNED: 'Pipeline',
  }

  const NOTIF_TYPE_COLOR: Record<string, string> = {
    MENTION: 'notif-type--mention', PROGRAM_NEEDS_APPROVAL: 'notif-type--approval',
    APPROVAL: 'notif-type--approval', BLOCKER_CREATED: 'notif-type--blocker',
    PROGRAM_REJECTED: 'notif-type--danger', REPORT_REJECTED: 'notif-type--danger',
    REPORT_NEEDS_REVISION: 'notif-type--warn', DEADLINE_APPROACHING: 'notif-type--warn',
    DM_RECEIVED: 'notif-type--mention',
    CLEAR_PATH_REQUESTED: 'notif-type--approval', CARRYOVER_THRESHOLD: 'notif-type--warn',
    CLEAR_PATH_CLEARED: 'notif-type--success' as string,
  }

  function formatNotifTime(dateString: string): string {
    const diff = Date.now() - new Date(dateString).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'baru saja'
    if (m < 60) return `${m}m lalu`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}j lalu`
    return `${Math.floor(h / 24)}h lalu`
  }

  function navigateToNotifSource(source: string) {
    // Source dapat berupa: "type:id", "name·type:id", "type:id·type:id"
    // Iterasi semua parts — ambil entitas navigable pertama (bukan comment, bukan plain text)
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
    setNotifDropOpen(false)
    navigateToNotifSource(source)
  }

  async function handleNotifGroupClick(group: NotificationDropGroup, target: NotificationItem = group.latest) {
    setNotifDropOpen(false)
    await Promise.all(group.items.filter(n => n.state === 'UNREAD').map(n => api.put(`/notifications/${n.id}/read`, {})))
    await loadOverview('refresh')
    navigateToNotifSource(target.source)
  }

  async function handleNotifGroupDismiss(group: NotificationDropGroup) {
    try {
      await Promise.all(group.items.map(n => api.put(`/notifications/${n.id}/dismiss`, {})))
    } catch {
      // Tetap refresh agar UI kembali sinkron jika sebagian request berhasil.
    } finally {
      await loadOverview('refresh')
    }
  }

  async function handleMarkAllReadDrop() {
    if (markingAllRead) return
    setMarkingAllRead(true)
    try {
      await api.put('/notifications/read-all', {})
      await loadOverview('refresh')
    } finally {
      setMarkingAllRead(false)
    }
  }

  // Topbar adalah triage singkat, bukan arsip: read action diberi grace period,
  // sedangkan update biasa cepat turun ke Focus agar popover tetap ringan.
  const dropVisibleNotifications = activeNotifications

  // Unread dulu, kemudian read — group by entity agar update beruntun tidak bising.
  const dropNotifGroups = groupDropNotifications([
    ...dropVisibleNotifications.filter(n => n.state === 'UNREAD'),
    ...dropVisibleNotifications.filter(n => n.state === 'READ'),
  ])
  const dropActionGroups = dropNotifGroups.filter(group => group.actionItem)
  const dropActionGroupIds = new Set(dropActionGroups.map(group => group.id))
  const dropContextGroups = dropNotifGroups.filter(group => !dropActionGroupIds.has(group.id))
  const dropCommunicationGroups = dropNotifGroups.filter(group => group.items.some(item => notificationCategory(item) === 'COMMUNICATION'))
  const dropRiskGroups = dropNotifGroups.filter(group => group.items.some(item => notificationCategory(item) === 'RISK' || notificationPriority(item) === 'HIGH' || notificationPriority(item) === 'CRITICAL'))
  const visibleDropActionGroups = dropActionGroups.slice(0, 4)
  const visibleDropContextGroups = dropContextGroups.slice(0, Math.max(0, 8 - visibleDropActionGroups.length))
  const visibleFilteredGroups =
    notifDropView === 'action'
      ? dropActionGroups.slice(0, 8)
      : notifDropView === 'communication'
        ? dropCommunicationGroups.slice(0, 8)
        : notifDropView === 'risk'
          ? dropRiskGroups.slice(0, 8)
          : []
  const notifViewOptions: Array<{ view: NotificationDropView; label: string; count: number }> = [
    { view: 'all', label: 'Semua', count: dropNotifGroups.length },
    { view: 'action', label: 'Aksi', count: dropActionGroups.length },
    { view: 'communication', label: 'Komunikasi', count: dropCommunicationGroups.length },
    { view: 'risk', label: 'Risiko', count: dropRiskGroups.length },
  ]

  const renderNotifDropGroup = (group: NotificationDropGroup, displayItem: NotificationItem = group.latest) => {
    const n = displayItem
    const typeLabel = NOTIF_TYPE_LABEL[n.type] ?? n.type
    const typeClass = NOTIF_TYPE_COLOR[n.type] ?? ''
    const priority = notificationPriority(n).toLowerCase()
    const contextPills = notificationDropdownContext(n)
    return (
      <div className={`topbar__notif-row${group.unreadCount > 0 ? ' topbar__notif-row--unread' : ''}`} key={group.id}>
        <button
          className={`topbar__notif-item topbar__notif-item--priority-${priority}${group.unreadCount > 0 ? ' topbar__notif-item--unread' : ''}`}
          onClick={() => void handleNotifGroupClick(group, n)}
          type="button"
        >
          <span className={`topbar__notif-dot${group.unreadCount > 0 ? '' : ' topbar__notif-dot--read'}`} />
          <div className="topbar__notif-item-body">
            <div className="topbar__notif-item-meta">
              <span className={`topbar__notif-item-type ${typeClass}`}>{typeLabel}</span>
              {group.items.length > 1 && <span className="topbar__notif-item-count">{group.items.length} update</span>}
            </div>
            <p className="topbar__notif-item-msg">{n.message}</p>
            {contextPills.length > 0 && (
              <div className="topbar__notif-item-context">
                {contextPills.map(context => <span key={context}>{context}</span>)}
              </div>
            )}
            <div className="topbar__notif-item-foot">
              <time className="topbar__notif-item-time">{formatNotifTime(n.createdAt)}</time>
              <span className="topbar__notif-item-action">{notificationIntentLabel(n)} →</span>
            </div>
          </div>
        </button>
        <button
          aria-label={`Sembunyikan notifikasi: ${n.message}`}
          className="topbar__notif-dismiss"
          onClick={() => void handleNotifGroupDismiss(group)}
          title="Sembunyikan dari notifikasi"
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 12 12" width="12">
            <path d="m2 2 8 8M10 2 2 10" />
          </svg>
        </button>
      </div>
    )
  }

  const fokusItem: NavItem = { path: '/fokus', label: 'Focus', caption: 'Tasks, mentions, and items awaiting you', icon: IconInbox, badge: () => unreadCount }

  // ── Nav items palette ──────────────────────────────────────────────────────
  // Sidebar mengikuti siklus PDCA: Today → Plan → Do → Check (Performance + Pelaporan) → Act → Komunikasi → Akun
  const NI = {
    home:      { path: '/',          label: 'Home',             caption: 'Ringkasan eksekutif program kerja', icon: IconHome },
    roadmap:   { path: '/roadmap',   label: 'Roadmap',          caption: 'Visual program timeline',           icon: IconRoadmap   },
    programs:  { path: '/programs',  label: 'Programs',         caption: 'Portfolio orchestration',           icon: IconPrograms  },
    execution: { path: '/execution', label: 'Execution',        caption: 'Kanban delivery board',             icon: IconExecution },
    penugasan: { path: '/penugasan', label: 'Assignment',       caption: 'Tugas harian di luar Program',       icon: IconAssignments },
    goals:     { path: '/goals',      label: 'Goals & KPI',   caption: 'Manage KPI organisasi & tracking capaian',  icon: IconGoals    },
    activity:  { path: '/activity',   label: 'Team Activity', caption: 'Leaderboard sesi & aktivitas harian tim',   icon: IconActivity },
    reports:   { path: '/reports',    label: 'Analytics',     caption: 'KPI, program health & leaderboard',         icon: IconReports  },
    lapbul:    { path: '/laporan-bulanan', label: 'Monthly Reports', caption: 'Periodic division report documents', icon: IconMonthlyReports },
    laprisiko: { path: '/laporan-risiko',  label: 'Risk Reports',    caption: 'Laporan risiko bulanan BUMN 5×5',   icon: IconRiskReports    },
    perfScorecard: { path: '/performance/scorecard', label: 'Scorecard',       caption: 'Ranking capaian direktorat & divisi',  icon: IconScorecard    },
    perfDirektorat:{ path: '/performance/kolegial',  label: 'KPI Direktorat',  caption: 'Capaian KPI bersama jajaran direksi',  icon: IconKpiKolegial  },
    perfDivisi:    { path: '/performance/divisi',    label: 'KPI Divisi',      caption: 'Capaian KPI level divisi',             icon: IconKpiKolegial  },
    perfSaya:      { path: '/performance/me',        label: 'KPI Saya',        caption: 'KPI individual saya',                  icon: IconKpiIndividu  },
    perfIndividu:  { path: '/performance/individu',  label: 'KPI Individu',    caption: 'Browse KPI individual karyawan',       icon: IconKpiIndividu  },
    channels:  { path: '/channels',  label: 'Channels',         caption: 'Team collaboration',                icon: IconChannels, badge: () => totalUnreadChannels },
    schedule:  { path: '/jadwal',    label: 'Rapat Koordinasi', caption: 'Rapat koordinasi & cadence tim',    icon: IconSchedule  },
    search:    { path: '/search',    label: 'Search',           caption: 'Discover decisions fast',           icon: IconSearch    },
    presence:  { path: '/presence',  label: 'Presence',         caption: 'Live team availability',            icon: IconPresence  },
    profile:   { path: '/profile',   label: 'Profile',          caption: 'Account & position hierarchy',      icon: IconProfile   },
    settings:  { path: '/settings',  label: 'Settings',         caption: 'Workspace preferences',             icon: IconSettings  },
  } satisfies Record<string, NavItem>

  // ── Shared groups (PDCA-aligned) ───────────────────────────────────────────
  const grpPlan       = { label: 'Perencanaan',  items: [NI.programs] }
  const grpDo         = { label: 'Eksekusi',     items: [NI.execution, NI.penugasan] }
  // Performance hierarchy: Scorecard → KPI Direktorat → KPI Divisi → KPI Saya
  // KASUBDIV: hanya KPI Divisi & KPI Saya. OFFICER/ASISTEN: hanya KPI Saya.
  const grpPerfFull   = { label: 'Performance',  items: [NI.perfScorecard, NI.perfDirektorat, NI.perfDivisi, NI.perfSaya] }
  const grpPerfMid    = { label: 'Performance',  items: [NI.perfDivisi, NI.perfSaya] }
  const grpPerfMin    = { label: 'Performance',  items: [NI.perfSaya] }
  const grpPelaporan  = { label: 'Pelaporan',    items: [NI.lapbul, NI.laprisiko] }
  const grpAct        = { label: 'Tindak Lanjut', items: [NI.schedule] }
  const grpKolab      = { label: 'Komunikasi',   items: [NI.channels, NI.search] }
  const grpAkun       = { label: 'Akun',         items: [NI.presence, NI.profile, NI.settings] }
  const grpAdmin      = {
    label: 'Admin',
    items: [
      { path: '/admin/orgs',       label: 'Companies', caption: 'Entitas & hierarki org',     icon: IconOrg       },
      { path: '/admin/positions',  label: 'Positions', caption: 'Manajemen jabatan',          icon: IconPositions },
      { path: '/admin/users',      label: 'Users',     caption: 'Manajemen pengguna',         icon: IconUsers     },
      { path: '/admin/roles',      label: 'Roles',     caption: 'Peran & permission matrix',  icon: IconRoles     },
    ],
  }

  // ── Role-aware nav groups (PDCA flow) ──────────────────────────────────────
  // BOD / KADIV       → semua: Plan, Do, Performance lengkap, Pelaporan, Act, Komunikasi
  // KASUBDIV          → Plan, Do, Performance mid (KPI Divisi + KPI Saya), Pelaporan, Act
  // OFFICER/ASISTEN   → Do prioritas, Plan read, KPI Saya saja, Pelaporan read, Act
  // Default (Admin)   → full nav
  const navGroups: { label: string; items: NavItem[] }[] = (() => {
    if (role === 'BOD' || role === 'KADIV') {
      return [
        grpPlan, grpDo,
        grpPerfFull, grpPelaporan,
        grpAct,
        grpKolab, grpAkun,
        ...(isAdmin ? [grpAdmin] : []),
      ]
    }
    if (role === 'KASUBDIV') {
      return [
        grpPlan, grpDo,
        grpPerfMid, grpPelaporan,
        grpAct,
        grpKolab, grpAkun,
        ...(isAdmin ? [grpAdmin] : []),
      ]
    }
    if (role === 'OFFICER' || role === 'ASISTEN') {
      return [
        grpDo,
        { label: 'Perencanaan', items: [NI.programs] }, // read-only context
        grpPerfMin, grpPelaporan,
        grpAct,
        grpKolab, grpAkun,
        ...(isAdmin ? [grpAdmin] : []),
      ]
    }
    // Default: full nav (SUPERADMIN, ADMIN, unknown role)
    return [
      grpPlan, grpDo,
      grpPerfFull, grpPelaporan,
      grpAct,
      grpKolab, grpAkun,
      ...(isAdmin ? [grpAdmin] : []),
    ]
  })()

  // Page name for breadcrumb
  const PAGE_NAMES: Record<string, string> = {
    '/': 'Home', '/programs': 'Programs',
    '/goals': 'Goals & KPI', '/activity': 'Team Activity', '/execution': 'Execution', '/penugasan': 'Penugasan', '/reports': 'Analytics', '/laporan-bulanan': 'Monthly Reports', '/laporan-risiko': 'Risk Reports',
    '/fokus': 'Focus', '/channels': 'Channels', '/jadwal': 'Rapat Koordinasi', '/search': 'Search',
    '/presence': 'Presence', '/profile': 'Profile', '/settings': 'Settings',
    '/admin/users': 'Users', '/admin/positions': 'Positions',
    '/admin/orgs': 'Companies', '/admin/roles': 'Roles & Permissions',
    '/playbook': 'Playbook',
    '/performance/scorecard': 'Scorecard',
    '/performance/kolegial': 'KPI Direktorat',
    '/performance/divisi': 'KPI Divisi',
    '/performance/me': 'KPI Saya',
    '/performance/individu': 'KPI Individu',
  }
  const currentPage = PAGE_NAMES[activePath] ?? PAGE_NAMES[pathname] ?? 'ATLAS'

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void runSearch(query)
  }

  return (
    <div className={`app-shell${authStatus === 'logging_out' ? ' app-shell--exiting' : ''}`} ref={shellRef}>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <div className="sidebar__brand-mark">
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="2.5" y1="18.5" x2="10" y2="2.5"/>
                <line x1="17.5" y1="18.5" x2="10" y2="2.5"/>
                <line x1="6.3" y1="11.5" x2="13.7" y2="11.5"/>
              </svg>
            </div>
            <div className="sidebar__brand-name">
              <span className="sidebar__brand-title" title="Advanced Transformation &amp; Leadership Alignment System">ATLAS</span>
            </div>
          </div>
          <button
            className="sidebar__collapse-btn"
            onClick={toggleSidebar}
            title="Toggle sidebar"
            type="button"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m7 2-3 3 3 3" />
            </svg>
          </button>
        </div>

        <nav className="sidebar__nav">
          {/* Today — Home (organisasi) + Focus (personal), always at top */}
          {(() => {
            const showHome = role === 'BOD' || role === 'KADIV' || role === 'KASUBDIV' || isAdmin
            const todayItems: NavItem[] = showHome ? [NI.home, fokusItem] : [fokusItem]
            return (
              <div className="sidebar__fokus-wrap">
                <p className="sidebar__group-label sidebar__group-label--home">Today</p>
                {todayItems.map((item) => {
                  const isActive = activePath === item.path
                  const badge = item.badge?.()
                  return (
                    <Link
                      key={item.path}
                      className={`sidebar__item sidebar__item--home${isActive ? ' sidebar__item--active' : ''}`}
                      data-tooltip={item.label}
                      href={item.path}
                      onMouseEnter={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon()) }}
                      onMouseLeave={closeTooltip}
                      onFocus={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon()) }}
                      onBlur={closeTooltip}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="sidebar__item-icon">{item.icon()}</span>
                      <span className="sidebar__item-label">{item.label}</span>
                      {badge && badge > 0 ? (
                        <span className="sidebar__badge">{badge > 99 ? '99+' : badge}</span>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            )
          })()}

          {navGroups.filter((group) => group.items.length > 0).map((group) => (
            <div
              className={`sidebar__group sidebar__group--separated${group.label === 'Tim' ? ' sidebar__group--tim' : ''}`}
              key={group.label}
            >
              <p className="sidebar__group-label">{group.label}</p>
              {group.items.map((item) => {
                const isActive = activePath === item.path
                const badge = item.badge?.()
                return (
                  <Link
                    className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
                    data-tooltip={item.label}
                    key={item.path}
                    href={item.path}
                    onMouseEnter={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon()) }}
                    onMouseLeave={closeTooltip}
                    onFocus={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon()) }}
                    onBlur={closeTooltip}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="sidebar__item-icon">{item.icon()}</span>
                    <span className="sidebar__item-label">{item.label}</span>
                    {badge && badge > 0 ? (
                      <span className="sidebar__badge">{badge > 99 ? '99+' : badge}</span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <Link
            className="sidebar__user"
            href="/profile"
            onMouseEnter={(e) => { prefetchRoute('/profile'); openTooltip(e.currentTarget, currentUser?.name ?? 'Atlas User', userRoleLabel, IconProfile()) }}
            onMouseLeave={closeTooltip}
            onFocus={(e) => { prefetchRoute('/profile'); openTooltip(e.currentTarget, currentUser?.name ?? 'Atlas User', userRoleLabel, IconProfile()) }}
            onBlur={closeTooltip}
          >
            <div className="sidebar__avatar-wrap">
              <div className="sidebar__avatar">{userInitials || 'AU'}</div>
              <span className={`sidebar__avatar-dot ${dotClass}`} aria-hidden="true" />
            </div>
            <div className="sidebar__user-info">
              <span className="sidebar__user-name" title={currentUser?.name}>{displayName}</span>
              <span className="sidebar__user-role">{userRoleLabel}</span>
            </div>
          </Link>
        </div>

        {sidebarCollapsedView && tooltipState ? (
          <div
            className={`sidebar__tooltip sidebar__tooltip--${tooltipState.placement}`}
            style={{ top: tooltipState.top, left: tooltipState.left }}
            onMouseEnter={() => { if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current) }}
            onMouseLeave={closeTooltip}
          >
            <span className="sidebar__tooltip-arrow" aria-hidden="true" />
            {tooltipState.icon ? (
              <span className="sidebar__tooltip-icon" aria-hidden="true">{tooltipState.icon}</span>
            ) : null}
            <div className="sidebar__tooltip-copy">
              <strong>{tooltipState.label}</strong>
              {tooltipState.detail ? <span>{tooltipState.detail}</span> : null}
            </div>
          </div>
        ) : null}
      </aside>

      {/* ── Main workspace ── */}
      <div className="workspace" id="workspace-modal-root">
        <header className="topbar">
          {/* Breadcrumb */}
          <nav className="topbar__breadcrumb" aria-label="breadcrumb">
            <span className="topbar__breadcrumb-workspace">PTPN III</span>
            <span className="topbar__breadcrumb-sep">/</span>
            <span className="topbar__breadcrumb-page">{currentPage}</span>
          </nav>

          {/* Breadcrumb / search divider */}
          <div className="topbar__breadcrumb-divider" aria-hidden="true" />

          {/* Command search */}
          <form className="topbar__search" onSubmit={handleSearchSubmit}>
            <span className="topbar__search-icon">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="5.5" cy="5.5" r="4" />
                <path d="m9 9 3 3" />
              </svg>
            </span>
            <input
              className="topbar__search-input"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari program, aktivitas, blockers…"
              ref={searchInputRef}
              value={query}
            />
            <kbd className="topbar__search-kbd">⌘K</kbd>
          </form>

          {/* Right cluster */}
          <div className="topbar__right">
            {/* Theme toggle */}
            <button
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="topbar__theme-btn"
              onClick={toggleTheme}
              title={resolvedTheme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              type="button"
            >
              {resolvedTheme === 'dark' ? (
                <svg aria-hidden="true" className="topbar__theme-icon" fill="none" height="18" viewBox="0 0 18 18" width="18">
                  <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="topbar__theme-icon" fill="none" height="18" viewBox="0 0 18 18" width="18">
                  <path d="M15.5 10.5A7 7 0 0 1 7.5 2.5a7.002 7.002 0 1 0 8 8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                </svg>
              )}
            </button>

            {/* Notification bell */}
            <div className="topbar__notif-menu" ref={notifDropRef}>
              <button
                aria-expanded={notifDropOpen}
                aria-haspopup="menu"
                className="topbar__notif-btn"
                onClick={() => setNotifDropOpen(open => !open)}
                title="Notifikasi"
                type="button"
              >
                <svg className="topbar__notif-icon" fill="none" height="20" viewBox="0 0 20 20" width="20" aria-hidden="true">
                  <path d="M10 3.2c-2.25 0-4.05 1.73-4.05 4.08v1.68c0 .78-.26 1.53-.74 2.14l-.68.85c-.3.37-.03.93.44.93h10.06c.47 0 .74-.56.44-.93l-.68-.85a3.42 3.42 0 0 1-.74-2.14V7.28c0-2.35-1.8-4.08-4.05-4.08Z" />
                  <path d="M8.25 15.05c.3.76.95 1.25 1.75 1.25s1.45-.49 1.75-1.25" />
                </svg>
                {unreadCount > 0 && (
                  <span className={`topbar__notif-badge${urgentCount > 0 ? '' : ' topbar__notif-badge--info'}`}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifDropOpen && (
                <div className="topbar__notif-popover" role="menu">
                  <div className="topbar__notif-popover-head">
                    <span className="topbar__notif-popover-title">Notifikasi</span>
                    {unreadCount > 0 && (
                      <button
                        className="topbar__notif-mark-all"
                        disabled={markingAllRead}
                        onClick={() => void handleMarkAllReadDrop()}
                        type="button"
                      >
                        {markingAllRead ? 'Menandai…' : 'Tandai semua dibaca'}
                      </button>
                    )}
                  </div>

                  <div className="topbar__notif-filter" aria-label="Filter notifikasi">
                    {notifViewOptions.map(option => (
                      <button
                        aria-pressed={notifDropView === option.view}
                        className={`topbar__notif-filter-btn${notifDropView === option.view ? ' is-active' : ''}`}
                        key={option.view}
                        onClick={() => setNotifDropView(option.view)}
                        type="button"
                      >
                        <span>{option.label}</span>
                        <strong>{option.count}</strong>
                      </button>
                    ))}
                  </div>

                  <div className="topbar__notif-list">
                    {dropNotifGroups.length === 0 ? (
                      <div className="topbar__notif-empty">
                        <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }}>
                          <path d="M8 1.5a5 5 0 0 1 5 5v2.5l1 1.5H1l1-1.5V6.5a5 5 0 0 1 5-5Z" />
                          <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
                        </svg>
                        Tidak ada notifikasi
                      </div>
                    ) : (
                      <>
                        {dropActionGroups.length > 0 && (
                          <div className="topbar__notif-priority">
                            <div>
                                <span className="topbar__notif-priority-label">Perlu tindakan</span>
                                <span className="topbar__notif-priority-copy">Tugas, approval, blocker, revisi, atau percakapan yang butuh respons.</span>
                            </div>
                            <strong>{dropActionGroups.length}</strong>
                          </div>
                        )}
                        {notifDropView === 'all' ? (
                          <>
                            {visibleDropActionGroups.map(group => renderNotifDropGroup(group, group.actionItem ?? group.latest))}
                            {visibleDropContextGroups.length > 0 && (
                              <div className="topbar__notif-section-label">
                                {visibleDropActionGroups.length > 0 ? 'Update lainnya' : 'Update terbaru'}
                              </div>
                            )}
                            {visibleDropContextGroups.map(group => renderNotifDropGroup(group))}
                          </>
                        ) : visibleFilteredGroups.length > 0 ? (
                          visibleFilteredGroups.map(group => renderNotifDropGroup(group, notifDropView === 'action' ? group.actionItem ?? group.latest : group.latest))
                        ) : (
                          <div className="topbar__notif-empty topbar__notif-empty--compact">
                            Tidak ada notifikasi untuk filter ini
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="topbar__notif-footer">
                    <button
                      className="topbar__notif-view-all"
                      onClick={() => { setNotifDropOpen(false); navigate('/fokus') }}
                      type="button"
                    >
                      Lihat semua di Focus →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User button */}
            <div className="topbar__user-menu">
              <button
                className="topbar__user-btn"
                onClick={() => toggleUserMenu('topbar')}
                aria-expanded={userMenuSurface === 'topbar'}
                aria-haspopup="menu"
                title={currentUser?.name ?? 'User menu'}
                type="button"
              >
                <span className="topbar__user-avatar-wrap">
                  <span className="topbar__user-avatar">{userInitials || 'AU'}</span>
                  <span className="topbar__user-status" aria-hidden="true" />
                </span>
              </button>

              {userMenuSurface === 'topbar' ? (
                <>
                  <div className="topbar__menu-backdrop" onClick={closeUserMenu} />
                  <div className="topbar__menu-popover" role="menu">
                    <div className="topbar__menu-identity">
                      <div className="topbar__menu-avatar">{userInitials || 'AU'}</div>
                      <div>
                        <strong>{currentUser?.name}</strong>
                        <span>{currentUser?.unit?.name ?? currentUser?.roleType}</span>
                      </div>
                    </div>
                    <div className="topbar__menu-divider" />
                    <Link
                      className="topbar__menu-item"
                      href="/playbook"
                      onClick={closeUserMenu}
                      onFocus={() => prefetchRoute('/playbook')}
                      onMouseEnter={() => prefetchRoute('/playbook')}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="1" width="10" height="12" rx="1" />
                        <path d="M5 4h4M5 7h4M5 10h2" />
                      </svg>
                      Playbook
                    </Link>
                    <div className="topbar__menu-divider" />
                    <button
                      className="topbar__menu-item"
                      onClick={() => { void loadOverview('refresh'); closeUserMenu() }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M12.5 7A5.5 5.5 0 1 1 7 1.5a5.5 5.5 0 0 1 4.5 2.3" />
                        <path d="M10 1.5h3v3" />
                      </svg>
                      {overviewStatus.refreshing ? 'Menyegarkan…' : 'Refresh data'}
                    </button>
                    <div className="topbar__menu-divider" />
                    <button
                      className="topbar__menu-item topbar__menu-item--danger"
                      onClick={() => { requestLogout(); closeUserMenu() }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M5 7h7M9.5 4.5 12 7l-2.5 2.5" />
                        <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="workspace__content">
          {children}
        </main>
      </div>

      {/* ── Sign-out confirmation modal ── */}
      {logoutPending && (
        <div className="modal-backdrop" onClick={cancelLogout}>
          <div aria-describedby={logoutDescId} aria-labelledby={logoutTitleId} aria-modal="true" className="modal" ref={logoutDialogRef} role="dialog" style={{ maxWidth: 380 }} tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Sesi</span>
                <h3 className="modal__title" id={logoutTitleId}>Keluar dari sesi?</h3>
                <p className="modal-subtitle" id={logoutDescId}>Akhiri sesi saat ini dan kembali ke layar login.</p>
              </div>
              <button className="modal__close" onClick={cancelLogout} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
                  <path d="m1 1 10 10M11 1 1 11" />
                </svg>
              </button>
            </div>
            <div className="modal__body">
              <div className="modal-helper-note modal-helper-note--danger">
                Anda akan kembali ke layar login. Perubahan yang belum disimpan akan hilang.
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={cancelLogout} type="button">
                Batal
              </button>
              <button
                className="btn btn--primary"
                onClick={() => void handleLogout()}
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                type="button"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notification toast stack (kanan bawah) ── */}
      {notifToasts.length > 0 && (
        <div className="notif-toast-stack" aria-live="polite" aria-label="Notifikasi baru">
          {notifToasts.map(toast => {
            const typeLabel = NOTIF_TYPE_LABEL[toast.type] ?? toast.type
            const typeClass = NOTIF_TYPE_COLOR[toast.type] ?? ''
            const isDm = toast.type === 'DM_RECEIVED'
            const isMention = toast.type === 'MENTION'
            return (
              <NotifToast
                key={toast.id}
                toast={toast}
                typeLabel={typeLabel}
                typeClass={typeClass}
                isDm={isDm}
                isMention={isMention}
                onDismiss={() => dismissToast(toast.id)}
                onClick={() => void handleNotifClick(toast.id, toast.source)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
