import { Fragment, useEffect, useId, useRef, useState, startTransition } from 'react'
import type { ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useRealtime } from '../hooks/useRealtime'
import { applyThemePreference, getThemeSnapshot } from '../lib/theme'
import type { ResolvedTheme } from '../lib/theme'
import { TopbarAction } from '../components/TopbarAction'
import { CommandPalette } from '../components/CommandPalette'
import { ContextPanel } from '../components/ContextPanel'
import { TOPBAR_ACTIONS, TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import { resolveContextPanel } from '../lib/context-panel-config'
import { formatRoleLabel, formatRoleLabelTitleCase } from '../lib/roleLabel'

type NavItem = {
  path: string
  label: string
  caption: string
  icon: () => React.ReactElement
  badge?: () => number
  /** When true, badge is rendered as urgent (brand green) — used for unread/action items */
  badgeUrgent?: boolean
  /** Optional keyboard shortcut hint, shown in collapsed tooltip (e.g., "G H"). */
  shortcut?: string
}

type SidebarTooltipState = {
  label: string
  detail?: string
  top: number
  left: number
  placement: 'right' | 'left'
  icon?: React.ReactElement
  shortcut?: string
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
function IconGlossary() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2.5h7.5a2 2 0 0 1 2 2v9H4.5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3 11.5h9.5" />
      <path d="M5.5 5.5h5M5.5 8h3.5" />
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
    '/admin/pilot-metrics': () => import('../Pages/AdminPilotMetricsView'),
    '/admin/thresholds': () => import('../Pages/AdminThresholdsView'),
    '/channels': () => import('../Pages/ChannelsViewWrapper'),
    '/': () => import('../Pages/HomeView'),
    '/execution': () => import('../Pages/WorkboardView'),
    '/penugasan': () => import('../Pages/AssignmentsView'),
    '/fokus': () => import('../Pages/InboxView'),
    '/goals': () => import('../Pages/GoalsView'),
    '/jadwal': () => import('../Pages/ScheduleView'),
    '/laporan-bulanan': () => import('../Pages/MonthlyReportsView'),
    '/laporan-risiko': () => import('../Pages/RiskReportsView'),
    '/playbook': () => import('../Pages/PlaybookView'),
    '/glossary': () => import('../Pages/GlossaryView'),
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
  'PROGRAM_REJECTED',
  'REPORT_NEEDS_REVISION',
  'DEADLINE_APPROACHING',
  'TASK_ASSIGNED',
  // Sprint 4 — Clear the Path
  'CLEAR_PATH_REQUESTED',
  // Sprint 4 — carryover threshold (action item belum selesai berulang)
  'CARRYOVER_THRESHOLD',
  // Sprint 5 — Plan→Do handoff
  'PROGRAM_TASKS_ASSIGNED',
  // Meeting flow — invite minta RSVP, action item minta dikerjakan, update perlu acknowledge
  'MEETING_INVITED',
  'MEETING_UPDATED',
  'ACTION_ITEM_ASSIGNED',
])

const NOTIF_FALLBACK_CONTEXT: Record<string, { roleImpact: string; impact: string }> = {
  APPROVAL: { roleImpact: 'Anda pemberi keputusan', impact: 'Menahan alur sampai diputuskan' },
  BLOCKER_CREATED: { roleImpact: 'Anda perlu bantu unblock', impact: 'Progres task tertahan' },
  DEADLINE_APPROACHING: { roleImpact: 'Anda pemilik tenggat', impact: 'Risiko keterlambatan meningkat' },
  DM_RECEIVED: { roleImpact: 'Anda penerima pesan langsung', impact: 'Percakapan kerja menunggu respon' },
  MENTION: { roleImpact: 'Anda disebut dalam diskusi', impact: 'Ada konteks yang mungkin membutuhkan respon' },
  PROGRAM_NEEDS_APPROVAL: { roleImpact: 'Anda approver program', impact: 'Program belum bisa lanjut tanpa approval' },
  PROGRAM_REJECTED: { roleImpact: 'Anda PIC program', impact: 'Perbaiki sesuai catatan, lalu ajukan ulang' },
  PROGRAM_WITHDRAWN: { roleImpact: 'Anda reviewer program', impact: 'Pengajuan ditarik PIC — tidak perlu review lagi' },
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
  // Meeting flow
  MEETING_INVITED:       { roleImpact: 'Anda diundang ke rapat',         impact: 'Konfirmasi RSVP supaya organizer tahu kehadiran' },
  MEETING_UPDATED:       { roleImpact: 'Jadwal rapat berubah',           impact: 'Cek waktu baru dan adjust kalender Anda' },
  MEETING_CANCELLED:     { roleImpact: 'Rapat dibatalkan organizer',     impact: 'Slot waktu Anda terbuka kembali' },
  MEETING_POSTPONED:     { roleImpact: 'Rapat ditunda sementara',        impact: 'Tunggu jadwal baru dari organizer' },
  ACTION_ITEM_ASSIGNED:  { roleImpact: 'Anda PIC action item rapat',     impact: 'Tindak lanjut dengan deadline yang ditetapkan' },
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
  if (notification.type === 'PROGRAM_REJECTED') return 'Perbaiki & ajukan ulang'
  if (notification.type === 'REPORT_NEEDS_REVISION') return 'Revisi'
  if (notification.type === 'DEADLINE_APPROACHING') return 'Cek deadline'
  if (notification.type === 'TASK_ASSIGNED') return 'Kerjakan'
  if (notification.type === 'CLEAR_PATH_REQUESTED') return 'Disposition'
  if (notification.type === 'CLEAR_PATH_COMMITTED') return 'Lihat komitmen'
  if (notification.type === 'CLEAR_PATH_CLEARED') return 'Lanjut eksekusi'
  if (notification.type === 'CARRYOVER_THRESHOLD') return 'Tinjau ulang'
  if (notification.type === 'PROGRAM_TASKS_ASSIGNED') return 'Buka pipeline'
  if (notification.type === 'MEETING_INVITED') return 'Konfirmasi RSVP'
  if (notification.type === 'MEETING_UPDATED') return 'Lihat jadwal'
  if (notification.type === 'MEETING_CANCELLED' || notification.type === 'MEETING_POSTPONED') return 'Buka rapat'
  if (notification.type === 'ACTION_ITEM_ASSIGNED') return 'Kerjakan'
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
  // Meeting cancel/postpone = perubahan jadwal mendadak → masuk RISK supaya menonjol di tab Risk
  if (notification.type === 'BLOCKER_CREATED' || notification.type === 'DEADLINE_APPROACHING') return 'RISK'
  if (notification.type === 'MEETING_CANCELLED' || notification.type === 'MEETING_POSTPONED') return 'RISK'
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
  const hasContextPanel = resolveContextPanel(activePath, pathname) !== null
  const navigate = useInertiaNavigate()
  const {
    userMenuSurface, toggleUserMenu, closeUserMenu,
    currentUser, totalUnreadChannels,
    overviewStatus, loadOverview,
    handleLogout, notifications, markNotificationRead, dismissNotification,
    notifToasts, dismissToast,
    setSelectedProgramId, setSelectedTaskId, setSelectedChannelId,
    authStatus, logoutPending, requestLogout, cancelLogout,
    programs, myWork,
  } = useWorkspace()
  const { status: realtimeStatus } = useRealtime()
  const isAdmin = ADMIN_ROLES.has(currentUser?.roleType?.toLowerCase() ?? '')
  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const shellRef = useRef<HTMLDivElement>(null)
  const [sidebarCollapsedView, setSidebarCollapsedView] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('atlas.sidebarCollapsed') === 'true'
  })
  const collapsedRef = useRef(sidebarCollapsedView)

  const toggleSidebar = () => {
    const next = !collapsedRef.current
    collapsedRef.current = next
    if (!next) setTooltipState(null)
    try { localStorage.setItem('atlas.sidebarCollapsed', String(next)) } catch {}
    startTransition(() => setSidebarCollapsedView(next))
  }

  const [tooltipState, setTooltipState] = useState<SidebarTooltipState | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [stickyTitleVisible, setStickyTitleVisible] = useState(false)
  const quickCreateRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEscKey(() => setQuickCreateOpen(false), quickCreateOpen)
  useEffect(() => {
    if (!quickCreateOpen) return
    const handler = (e: MouseEvent) => {
      if (quickCreateRef.current && !quickCreateRef.current.contains(e.target as Node)) {
        setQuickCreateOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [quickCreateOpen])

  useEscKey(closeUserMenu, userMenuSurface !== null)
  useEscKey(cancelLogout, logoutPending)

  // Sticky page title — fade in setelah user scroll melewati page heading.
  // Tidak butuh IntersectionObserver per-page; cukup track scroll workspace.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.workspace__content')
    if (!main) return
    const handler = () => {
      setStickyTitleVisible(main.scrollTop > 96)
    }
    handler()
    main.addEventListener('scroll', handler, { passive: true })
    return () => main.removeEventListener('scroll', handler)
  }, [pathname])
  const logoutDialogRef = useDialogFocus<HTMLDivElement>(logoutPending)
  const logoutTitleId = useId()
  const logoutDescId = useId()

  const userInitials = (currentUser?.name ?? 'Atlas User')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  const openTooltip = (anchor: HTMLElement, label: string, detail?: string, icon?: React.ReactElement, shortcut?: string) => {
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
    setTooltipState({ label, detail, top, left, placement, icon, shortcut })
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
    PROGRAM_REJECTED: 'Program', PROGRAM_WITHDRAWN: 'Program',
    REPORT_AWAITING_REVIEW: 'Laporan',
    REPORT_AWAITING_APPROVAL: 'Laporan', REPORT_APPROVED: 'Laporan',
    REPORT_REJECTED: 'Laporan', REPORT_NEEDS_REVISION: 'Laporan',
    DEADLINE_APPROACHING: 'Deadline', DM_RECEIVED: 'DM',
    CLEAR_PATH_REQUESTED: 'Clear the Path', CLEAR_PATH_COMMITTED: 'Clear the Path',
    CLEAR_PATH_CLEARED: 'Clear the Path', CARRYOVER_THRESHOLD: 'Carryover',
    PROGRAM_TASKS_ASSIGNED: 'Pipeline',
    MEETING_INVITED: 'Rapat', MEETING_UPDATED: 'Rapat',
    MEETING_CANCELLED: 'Rapat', MEETING_POSTPONED: 'Rapat',
    ACTION_ITEM_ASSIGNED: 'Action Item',
  }

  const NOTIF_TYPE_COLOR: Record<string, string> = {
    MENTION: 'notif-type--mention', PROGRAM_NEEDS_APPROVAL: 'notif-type--approval',
    APPROVAL: 'notif-type--approval', BLOCKER_CREATED: 'notif-type--blocker',
    PROGRAM_REJECTED: 'notif-type--danger', REPORT_REJECTED: 'notif-type--danger',
    REPORT_NEEDS_REVISION: 'notif-type--warn', DEADLINE_APPROACHING: 'notif-type--warn',
    DM_RECEIVED: 'notif-type--mention',
    CLEAR_PATH_REQUESTED: 'notif-type--approval', CARRYOVER_THRESHOLD: 'notif-type--warn',
    CLEAR_PATH_CLEARED: 'notif-type--success' as string,
    MEETING_INVITED: 'notif-type--approval',
    MEETING_UPDATED: 'notif-type--warn',
    MEETING_CANCELLED: 'notif-type--danger',
    MEETING_POSTPONED: 'notif-type--warn',
    ACTION_ITEM_ASSIGNED: 'notif-type--approval',
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
      if (type === 'meeting' && !isNaN(id)) { navigate(`/jadwal?meeting=${id}`); return }
      if (type === 'escalation' && !isNaN(id)) { navigate(`/fokus?escalation=${id}`); return }
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
    // Pakai workspace's markNotificationRead — sudah optimistic update local state,
    // jadi UI update instan tanpa tunggu loadOverview heavy refetch.
    const unread = group.items.filter(n => n.state === 'UNREAD')
    await Promise.all(unread.map(n => markNotificationRead(n.id)))
    navigateToNotifSource(target.source)
  }

  async function handleNotifGroupDismiss(group: NotificationDropGroup) {
    await Promise.all(group.items.map(n => dismissNotification(n.id)))
  }

  async function handleMarkAllReadDrop() {
    if (markingAllRead) return
    setMarkingAllRead(true)
    // Pakai single-item helper untuk dapat optimistic update — bulk endpoint
    // /notifications/read-all dipakai oleh server tapi local state di-update via setNotifications.
    const unread = activeNotifications.filter(n => n.state === 'UNREAD')
    try {
      await Promise.all(unread.map(n => markNotificationRead(n.id)))
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

  const fokusItem: NavItem = { path: '/fokus', label: 'Focus', caption: 'Tasks, mentions, and items awaiting you', icon: IconInbox, badge: () => unreadCount, badgeUrgent: true, shortcut: 'G F' }
  const programsCount = programs?.length ?? 0
  const tasksCount = myWork?.tasks?.length ?? 0

  // ── Nav items palette ──────────────────────────────────────────────────────
  // Sidebar mengikuti siklus PDCA per CLAUDE.md:
  //   Today → Perencanaan (Plan) → Eksekusi (Do) → Performance (Check) →
  //   Pelaporan (Check) → Tindak Lanjut (Act) → Komunikasi → Akun → Admin
  // Single source of truth: lib/nav-config.ts. Labels & order mirror that file.
  const NI = {
    home:        { path: '/',          label: 'Home',             caption: 'Ringkasan eksekutif program kerja', icon: IconHome,        shortcut: 'G H' },
    roadmap:     { path: '/roadmap',   label: 'Roadmap',          caption: 'Visual program timeline',           icon: IconRoadmap    },
    programs:    { path: '/programs',  label: 'Programs',         caption: 'Portfolio orchestration',           icon: IconPrograms,    shortcut: 'G P', badge: () => programsCount },
    execution:   { path: '/execution', label: 'Execution',        caption: 'Kanban delivery board',             icon: IconExecution,   shortcut: 'G E', badge: () => tasksCount },
    penugasan:   { path: '/penugasan', label: 'Penugasan',        caption: 'Tugas harian di luar Program',      icon: IconAssignments, shortcut: 'G A' },
    goals:       { path: '/goals',      label: 'Goals & KPI',   caption: 'Manage KPI organisasi & tracking capaian',  icon: IconGoals    },
    activity:    { path: '/activity',   label: 'Team Activity', caption: 'Leaderboard sesi & aktivitas harian tim',   icon: IconActivity },
    reports:       { path: '/reports',         label: 'Analytics',       caption: 'KPI, program health & leaderboard',  icon: IconReports       },
    perfScorecard: { path: '/performance/scorecard', label: 'Scorecard',       caption: 'Ranking capaian direktorat & divisi',  icon: IconScorecard    },
    perfDirektorat:{ path: '/performance/kolegial',  label: 'KPI Direktorat',  caption: 'Capaian KPI bersama jajaran direksi',  icon: IconKpiKolegial  },
    perfDivisi:    { path: '/performance/divisi',    label: 'KPI Divisi',      caption: 'Capaian KPI level divisi',             icon: IconKpiKolegial  },
    perfSaya:      { path: '/performance/me',        label: 'KPI Saya',        caption: 'KPI individual saya',                  icon: IconKpiIndividu  },
    perfIndividu:  { path: '/performance/individu',  label: 'Leaderboard',     caption: 'Top performer per BOD level',          icon: IconKpiIndividu  },
    schedule:    { path: '/jadwal',    label: 'Rapat Koordinasi', caption: 'Rapat koordinasi & cadence tim',    icon: IconSchedule,    shortcut: 'G R' },
    channels:    { path: '/channels',  label: 'Channels',         caption: 'Team collaboration',                icon: IconChannels,    shortcut: 'G C', badge: () => totalUnreadChannels, badgeUrgent: true },
    presence:    { path: '/presence',  label: 'Presence',         caption: 'Live team availability',            icon: IconPresence   },
    profile:     { path: '/profile',   label: 'Profile',          caption: 'Account & position hierarchy',      icon: IconProfile    },
    settings:    { path: '/settings',  label: 'Settings',         caption: 'Workspace preferences',             icon: IconSettings   },
    glossary:    { path: '/glossary',  label: 'Glossary',         caption: 'Vokabulari & istilah ATLAS',        icon: IconGlossary   },
  } satisfies Record<string, NavItem>

  // ── Sidebar groups — PDCA-aligned per CLAUDE.md ──────────────────────────
  // Order: Perencanaan (Plan) → Eksekusi (Do) → Performance (Check)
  // → Tindak Lanjut (Act) → Komunikasi → Akun → Admin.
  // KPI items sit flat under "Performance" (no nested sub-label "kpi" anymore).
  const grpPerencanaan        = { label: 'Perencanaan', items: [NI.programs] }
  const grpEksekusi           = { label: 'Eksekusi',    items: [NI.execution, NI.penugasan] }
  const grpEksekusiReadOnly   = { label: 'Eksekusi',    items: [NI.execution, NI.penugasan] }
  // Performance hierarchy: Scorecard → KPI Direktorat → KPI Divisi → KPI Saya.
  // BOD: tanpa "KPI Saya" — Direksi tidak punya KPI personal, scope-nya = direktorat.
  // KADIV: full set (KPI Saya = personal Kadiv sebagai individu).
  // KASUBDIV: hanya KPI Divisi & KPI Saya. OFFICER/ASISTEN: hanya KPI Saya.
  const grpPerformanceBod     = { label: 'Performance', items: [NI.perfScorecard, NI.perfDirektorat, NI.perfDivisi, NI.perfIndividu] }
  const grpPerformanceFull    = { label: 'Performance', items: [NI.perfScorecard, NI.perfDirektorat, NI.perfDivisi, NI.perfIndividu, NI.perfSaya] }
  const grpPerformanceMid     = { label: 'Performance', items: [NI.perfDivisi, NI.perfSaya] }
  const grpPerformanceMin     = { label: 'Performance', items: [NI.perfSaya] }
  const grpTindakLanjut       = { label: 'Tindak Lanjut', items: [NI.schedule] }
  const grpKomunikasi         = { label: 'Komunikasi', items: [NI.channels] }
  const grpAkun               = { label: 'Akun',       items: [NI.presence, NI.profile, NI.settings, NI.glossary] }
  const grpAdmin = {
    label: 'Admin',
    items: [
      { path: '/admin/orgs',           label: 'Companies',      caption: 'Entitas & hierarki org',     icon: IconOrg       },
      { path: '/admin/positions',      label: 'Positions',      caption: 'Manajemen jabatan',          icon: IconPositions },
      { path: '/admin/users',          label: 'Users',          caption: 'Manajemen pengguna',         icon: IconUsers     },
      { path: '/admin/roles',          label: 'Roles',          caption: 'Peran & permission matrix',  icon: IconRoles     },
      { path: '/admin/pilot-metrics',  label: 'Pilot Metrics',  caption: 'Pilot DKM dashboard (Sprint 4)', icon: IconReports },
      ...(role === 'SUPERADMIN' ? [
        { path: '/admin/thresholds',   label: 'Thresholds',     caption: 'Tuning angka sistem (live)',     icon: IconSettings },
      ] : []),
    ],
  }

  // ── Role-aware nav groups (PDCA flow) ──────────────────────────────────────
  // BOD               → Plan, Do, Performance BOD (no KPI Saya), Act, Komunikasi, Akun
  // KADIV             → Plan, Do, Performance lengkap, Act, Komunikasi, Akun
  // KASUBDIV          → Plan, Do, Performance mid (KPI Divisi + KPI Saya), Act, Komunikasi, Akun
  // OFFICER/ASISTEN   → Do prioritas, KPI Saya, Act, Komunikasi, Akun
  // Default (Admin)   → full nav
  // NOTE: grup "Pelaporan" dihilangkan dari semua surface navigasi utama
  // (sidebar + Command Palette + breadcrumb) per permintaan user 2026-05-10.
  // Halaman /laporan-bulanan & /laporan-risiko tetap hidup: accessible via
  // direct URL, notif deep-link, dan link di Analytics/Home focus card.
  // Re-enable: tambah grup di blok ini + restore section di lib/nav-config.ts.
  const navGroups: { label: string; items: NavItem[] }[] = (() => {
    if (role === 'BOD') {
      return [
        grpPerencanaan, grpEksekusi, grpPerformanceBod,
        grpTindakLanjut, grpKomunikasi, grpAkun,
        ...(isAdmin ? [grpAdmin] : []),
      ]
    }
    if (role === 'KADIV') {
      return [
        grpPerencanaan, grpEksekusi, grpPerformanceFull,
        grpTindakLanjut, grpKomunikasi, grpAkun,
        ...(isAdmin ? [grpAdmin] : []),
      ]
    }
    if (role === 'KASUBDIV') {
      return [
        grpPerencanaan, grpEksekusi, grpPerformanceMid,
        grpTindakLanjut, grpKomunikasi, grpAkun,
        ...(isAdmin ? [grpAdmin] : []),
      ]
    }
    if (role === 'OFFICER' || role === 'ASISTEN') {
      return [
        grpPerencanaan, grpEksekusiReadOnly, grpPerformanceMin,
        grpTindakLanjut, grpKomunikasi, grpAkun,
        ...(isAdmin ? [grpAdmin] : []),
      ]
    }
    // Default: full nav (SUPERADMIN, ADMIN, unknown role)
    return [
      grpPerencanaan, grpEksekusi, grpPerformanceFull,
      grpTindakLanjut, grpKomunikasi, grpAkun,
      ...(isAdmin ? [grpAdmin] : []),
    ]
  })()

  // Page name for breadcrumb
  const PAGE_NAMES: Record<string, string> = {
    '/': 'Home', '/programs': 'Programs',
    '/goals': 'Goals & KPI', '/activity': 'Team Activity', '/execution': 'Execution', '/penugasan': 'Penugasan', '/reports': 'Analytics', '/laporan-bulanan': 'Monthly Reports', '/laporan-risiko': 'Risk Reports',
    '/fokus': 'Focus', '/channels': 'Channels', '/jadwal': 'Rapat Koordinasi', '/search': 'Search',
    '/presence': 'Presence', '/profile': 'Profile', '/settings': 'Settings', '/glossary': 'Glossary',
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

  return (
    <div className={`app-shell${sidebarCollapsedView ? ' app-shell--collapsed' : ''}${hasContextPanel ? ' app-shell--with-panel' : ''}${authStatus === 'logging_out' ? ' app-shell--exiting' : ''}`} ref={shellRef}>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <div
              className="sidebar__brand-mark"
              role={sidebarCollapsedView ? 'button' : undefined}
              tabIndex={sidebarCollapsedView ? 0 : undefined}
              aria-label={sidebarCollapsedView ? 'Buka sidebar' : undefined}
              title={sidebarCollapsedView ? 'Buka sidebar (⌘\\)' : 'ATLAS'}
              onClick={sidebarCollapsedView ? toggleSidebar : undefined}
              onKeyDown={sidebarCollapsedView ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSidebar() } } : undefined}
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="2.5" y1="18.5" x2="10" y2="2.5"/>
                <line x1="17.5" y1="18.5" x2="10" y2="2.5"/>
                <line x1="6.3" y1="11.5" x2="13.7" y2="11.5"/>
              </svg>
            </div>
            <div className="sidebar__brand-name">
              <span className="sidebar__brand-title" title="Advanced Transformation &amp; Leadership Alignment System">ATLAS</span>
              <span className="sidebar__brand-tagline" aria-label="PTPN III Holding workspace">PTPN III · Holding</span>
            </div>
          </div>
          <button
            className="sidebar__collapse-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsedView ? 'Buka sidebar (⌘\\)' : 'Tutup sidebar (⌘\\)'}
            aria-label={sidebarCollapsedView ? 'Buka sidebar' : 'Tutup sidebar'}
            type="button"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="10" height="8" rx="1.5" />
              <path d="M5.5 3v8" />
              <path d="m9 5.5-1.5 1.5L9 8.5" />
            </svg>
          </button>
        </div>

        <nav className="sidebar__nav">
          {/* Today — Home (organisasi) + Focus (personal), always at top */}
          {(() => {
            const todayItems: NavItem[] = [NI.home, fokusItem]
            return (
              <div className="sidebar__fokus-wrap">
                {todayItems.map((item) => {
                  const isActive = activePath === item.path
                  const badge = item.badge?.()
                  return (
                    <Link
                      key={item.path}
                      className={`sidebar__item sidebar__item--home${isActive ? ' sidebar__item--active' : ''}`}
                      data-tooltip={item.label}
                      href={item.path}
                      onMouseEnter={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon(), item.shortcut) }}
                      onMouseLeave={closeTooltip}
                      onFocus={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon(), item.shortcut) }}
                      onBlur={closeTooltip}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="sidebar__item-icon">{item.icon()}</span>
                      <span className="sidebar__item-label">{item.label}</span>
                      {badge && badge > 0 ? (
                        <span className={`sidebar__badge${item.badgeUrgent ? ' sidebar__badge--urgent' : ''}`}>{badge > 99 ? '99+' : badge}</span>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            )
          })()}

          {navGroups.filter((group) => group.items.length > 0).map((group) => {
            const pdcaTone = (
              {
                'Perencanaan':   'plan',
                'Eksekusi':      'do',
                'Performance':   'check',
                'Tindak Lanjut': 'act',
                'Komunikasi':    'utility',
                'Akun':          'utility',
              } as Record<string, string>
            )[group.label] ?? ''
            return (
            <div
              className={`sidebar__group sidebar__group--separated${pdcaTone ? ` sidebar__group--${pdcaTone}` : ''}${group.label === 'Admin' ? ' sidebar__group--admin' : ''}`}
              key={group.label}
            >
              <p className="sidebar__group-label">{group.label}</p>
              {group.items.map((item) => {
                const isActive = activePath === item.path
                const badge = item.badge?.()
                const isUtility = item.path === '/profile' || item.path === '/settings'
                return (
                  <Fragment key={item.path}>
                    <Link
                      className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}${isUtility ? ' sidebar__item--utility' : ''}`}
                      data-tooltip={item.label}
                      href={item.path}
                      onMouseEnter={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon(), item.shortcut) }}
                      onMouseLeave={closeTooltip}
                      onFocus={(e) => { prefetchRoute(item.path); openTooltip(e.currentTarget, item.label, item.caption, item.icon(), item.shortcut) }}
                      onBlur={closeTooltip}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="sidebar__item-icon">{item.icon()}</span>
                      <span className="sidebar__item-label">{item.label}</span>
                      {badge && badge > 0 ? (
                        <span className={`sidebar__badge${item.badgeUrgent ? ' sidebar__badge--urgent' : ''}`}>{badge > 99 ? '99+' : badge}</span>
                      ) : null}
                    </Link>
                  </Fragment>
                )
              })}
            </div>
          )})}
        </nav>

        <div className="sidebar__footer">
          {/* User mini-card — clicking opens menu (anchored above) */}
          <button
            className="sidebar__user-card"
            onClick={() => toggleUserMenu('sidebar')}
            aria-expanded={userMenuSurface === 'sidebar'}
            aria-haspopup="menu"
            title={currentUser?.name ?? 'User menu'}
            type="button"
          >
            <span className="sidebar__user-card-avatar">
              {userInitials || 'AU'}
              <span className="sidebar__user-card-status" aria-hidden="true" />
            </span>
            <span className="sidebar__user-card-body">
              <span className="sidebar__user-card-name">{currentUser?.name ?? 'Atlas User'}</span>
              <span className="sidebar__user-card-role">{
                currentUser?.unit?.name
                ?? formatRoleLabelTitleCase(currentUser?.roleType, 'Member')
              }</span>
            </span>
            <svg className="sidebar__user-card-chev" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3 7.5 3-3 3 3" />
            </svg>
          </button>

          {userMenuSurface === 'sidebar' ? (
            <>
              <div className="topbar__menu-backdrop" onClick={closeUserMenu} />
              <div className="sidebar__user-popover" role="menu">
                <div className="sidebar__user-popover-identity">
                  <div className="sidebar__user-popover-avatar">{userInitials || 'AU'}</div>
                  <div>
                    <strong>{currentUser?.name}</strong>
                    <span>{currentUser?.unit?.name ?? formatRoleLabel(currentUser?.roleType)}</span>
                  </div>
                </div>
                <div className="sidebar__user-popover-divider" />
                <button
                  className="sidebar__user-popover-item"
                  onClick={() => { toggleTheme(); closeUserMenu() }}
                  type="button"
                >
                  {resolvedTheme === 'dark' ? (
                    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <circle cx="9" cy="9" r="3.5" />
                      <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15.5 10.5A7 7 0 0 1 7.5 2.5a7.002 7.002 0 1 0 8 8Z" />
                    </svg>
                  )}
                  {resolvedTheme === 'dark' ? 'Mode terang' : 'Mode gelap'}
                </button>
                <Link
                  className="sidebar__user-popover-item"
                  href="/playbook"
                  onClick={closeUserMenu}
                  onFocus={() => prefetchRoute('/playbook')}
                  onMouseEnter={() => prefetchRoute('/playbook')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="1" width="10" height="12" rx="1" />
                    <path d="M5 4h4M5 7h4M5 10h2" />
                  </svg>
                  Playbook
                </Link>
                <Link
                  className="sidebar__user-popover-item"
                  href="/settings"
                  onClick={closeUserMenu}
                  onFocus={() => prefetchRoute('/settings')}
                  onMouseEnter={() => prefetchRoute('/settings')}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="2.5" />
                    <path d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.2 3.2l1.2 1.2M11.6 11.6l1.2 1.2M3.2 12.8l1.2-1.2M11.6 4.4l1.2-1.2" />
                  </svg>
                  Settings
                </Link>
                <div className="sidebar__user-popover-divider" />
                <button
                  className="sidebar__user-popover-item"
                  onClick={() => { void loadOverview('refresh'); closeUserMenu() }}
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M12.5 7A5.5 5.5 0 1 1 7 1.5a5.5 5.5 0 0 1 4.5 2.3" />
                    <path d="M10 1.5h3v3" />
                  </svg>
                  {overviewStatus.refreshing ? 'Menyegarkan…' : 'Refresh data'}
                </button>
                <div className="sidebar__user-popover-divider" />
                <button
                  className="sidebar__user-popover-item sidebar__user-popover-item--danger"
                  onClick={() => { requestLogout(); closeUserMenu() }}
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 7h7M9.5 4.5 12 7l-2.5 2.5" />
                    <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" />
                  </svg>
                  Sign out
                </button>
              </div>
            </>
          ) : null}

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
              <strong>
                <span>{tooltipState.label}</span>
                {tooltipState.shortcut ? <kbd>{tooltipState.shortcut}</kbd> : null}
              </strong>
              {tooltipState.detail ? <span>{tooltipState.detail}</span> : null}
            </div>
          </div>
        ) : null}
      </aside>

      {/* ── Context panel (route-aware, opt-out per resolver) ── */}
      <ContextPanel />

      {/* ── Main workspace ── */}
      <div className="workspace" id="workspace-modal-root">
        <header className="topbar">
          {/* ── Slim utility bar — date/period/live + sticky title + actions ──
           * Pure System: no breadcrumb, no full-width search input. Topbar is
           * a thin context strip sharing the sidebar's canvas. Sticky page
           * title fades in once user scrolls past the page heading. */}
          {(() => {
            const now = new Date()
            const dateStr = now.toLocaleDateString('id-ID', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            }).toUpperCase()
            const monthShort = now.toLocaleDateString('id-ID', { month: 'short' }).toUpperCase()
            const quarter = Math.floor(now.getMonth() / 3) + 1
            // ISO-week (Mon=1) — week containing first Thursday of the year.
            const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
            const dayNum = tmp.getUTCDay() || 7
            tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
            const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
            const weekOfYear = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
            // Week-of-month (Mon-aligned): which calendar-week of the current month today falls into.
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            const firstISO = firstOfMonth.getDay() || 7 // Mon=1 … Sun=7
            const weekOfMonth = Math.ceil((now.getDate() + firstISO - 1) / 7)
            const liveLabel = realtimeStatus === 'connected' ? 'LIVE'
              : realtimeStatus === 'connecting' ? 'SYNCING'
              : realtimeStatus === 'disconnected' ? 'OFFLINE'
              : ''
            const liveClass = realtimeStatus === 'connected' ? 'topbar__live--connected'
              : realtimeStatus === 'disconnected' ? 'topbar__live--disconnected'
              : 'topbar__live--connecting'
            return (
              <div className="topbar__meta">
                <span className="topbar__meta-date">{dateStr}</span>
                <span className="topbar__meta-sep" aria-hidden>·</span>
                <span className="topbar__meta-period">
                  Q{quarter} · WEEK-{weekOfMonth} {monthShort} · WEEK-{weekOfYear}
                </span>
                {liveLabel ? (
                  <span
                    className={`topbar__live ${liveClass}`}
                    title={
                      realtimeStatus === 'connected' ? 'Real-time aktif — data tersinkron'
                      : realtimeStatus === 'connecting' ? 'Menyambung ke server real-time…'
                      : realtimeStatus === 'disconnected' ? 'Koneksi real-time terputus — mencoba sambung ulang'
                      : ''
                    }
                  >
                    <span className="topbar__live-dot" aria-hidden="true" />
                    {liveLabel}
                  </span>
                ) : null}
              </div>
            )
          })()}

          <div className="topbar__spacer" />

          {/* Contextual page action (route-aware, primary CTA when defined) */}
          {TOPBAR_ACTIONS[activePath] ? (
            <TopbarAction action={TOPBAR_ACTIONS[activePath]} page={activePath} />
          ) : null}

          {/* Global Quick-Create — universal "+" with mini-menu */}
          <div className="topbar__quick-menu" ref={quickCreateRef}>
            <button
              type="button"
              className="topbar__quick-btn"
              onClick={() => setQuickCreateOpen(o => !o)}
              aria-expanded={quickCreateOpen}
              aria-haspopup="menu"
              aria-label="Buat baru"
              title="Buat baru"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M8 3.5v9M3.5 8h9" />
              </svg>
            </button>
            {quickCreateOpen && (
              <div className="topbar__quick-popover" role="menu">
                <div className="topbar__quick-popover-head">Buat baru</div>
                {([
                  { id: 'task.new',       label: 'Task',       sub: 'di Workboard',          route: '/execution', icon: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="m5.5 8 1.3 1.3L10 6.5"/></svg> },
                  { id: 'program.new',    label: 'Program',    sub: 'portfolio baru',        route: '/programs',  icon: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2.5" width="10" height="11" rx="1.6"/><path d="M6 2.5h4v2H6z"/><path d="M5.5 7h5M5.5 10h5"/></svg> },
                  { id: 'meeting.new',    label: 'Rapat',      sub: 'koordinasi',            route: '/jadwal',    icon: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 1.5v3M11 1.5v3M2 7h12"/></svg> },
                  { id: 'assignment.new', label: 'Penugasan',  sub: 'di luar program',       route: '/penugasan', icon: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M6 2.5h4v2H6z"/><path d="M5.5 11.5h3"/></svg> },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className="topbar__quick-item"
                    onClick={() => {
                      setQuickCreateOpen(false)
                      // Navigate first if not on the page, lalu dispatch action.
                      // Page listeners pakai TOPBAR_ACTION_EVENT; mereka self-mount,
                      // jadi kita kasih microtask delay untuk navigation in-flight.
                      if (activePath !== item.route) {
                        navigate(item.route)
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent(TOPBAR_ACTION_EVENT, { detail: { id: item.id, page: item.route } }))
                        }, 220)
                      } else {
                        window.dispatchEvent(new CustomEvent(TOPBAR_ACTION_EVENT, { detail: { id: item.id, page: item.route } }))
                      }
                    }}
                    onMouseEnter={() => prefetchRoute(item.route)}
                    onFocus={() => prefetchRoute(item.route)}
                  >
                    <span className="topbar__quick-item-icon" aria-hidden="true">{item.icon}</span>
                    <span className="topbar__quick-item-body">
                      <span className="topbar__quick-item-title">{item.label}</span>
                      <span className="topbar__quick-item-sub">{item.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ⌘K command palette — prominent search pill */}
          <button
            type="button"
            className="topbar__cmdk"
            onClick={() => setPaletteOpen(true)}
            aria-label="Buka command palette (⌘K)"
            title="Cari (⌘K)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" />
              <path d="m9.5 9.5 3 3" />
            </svg>
            <span className="topbar__cmdk-placeholder">Cari programs, tasks…</span>
            <kbd>⌘K</kbd>
          </button>

          {/* Right cluster */}
          <div className="topbar__right">
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
                  <span className={`topbar__notif-badge${urgentCount > 0 ? ' topbar__notif-badge--urgent' : ' topbar__notif-badge--info'}`}>
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
      />
    </div>
  )
}
