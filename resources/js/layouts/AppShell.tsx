import { Fragment, useEffect, useId, useRef, useState, startTransition } from 'react'
import type { ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import { useWorkspace } from '../hooks/useWorkspace'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useAuth } from '../hooks/useAuth'
import { useRealtime } from '../hooks/useRealtime'
import { applyThemePreference, getThemeSnapshot } from '../lib/theme'
import type { ResolvedTheme } from '../lib/theme'
import { TopbarAction } from '../components/TopbarAction'
import { CommandPalette } from '../components/CommandPalette'
import { MobileMenuSheet } from '../components/MobileMenuSheet'
import { InstallBanner } from '../components/InstallBanner'
import { ContextPanel } from '../components/ContextPanel'
import { looksLikeAvatarUrl } from '../components/ui'
import { TOPBAR_ACTIONS } from '../lib/topbar-config'
import { resolveContextPanel } from '../lib/context-panel-config'
import { formatRoleLabel } from '../lib/roleLabel'
import { taskIsOverdue } from '../lib/taskSchedule'

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
function _IconDashboard() {
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
// KPI Direktorat — institusi/pilar (badan direktorat). Dipisah dari IconKpiDivisi
// 2026-06-01: dulu keduanya pakai satu ikon jam yang sama → ambigu & lambat di-scan.
// Glyph "orang" sengaja dihindari (sudah dipakai item Presence di sidebar yang sama).
function IconKpiDirektorat() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2 13.5 5.5H2.5z" />
      <path d="M4 5.5v6.5M8 5.5v6.5M12 5.5v6.5" />
      <path d="M2.5 12.5h11" />
    </svg>
  )
}
// KPI Divisi — grid unit (divisi-divisi di bawah direktorat).
function IconKpiDivisi() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1.2" />
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
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
  // Sliders icon — 3 horizontal tracks dengan handle bulat di posisi berbeda.
  // Sebelumnya pakai sun-rays glyph (lingkaran kecil + 8 rays) yang sering
  // disalahartikan sebagai "light mode toggle". Sliders = universal "settings
  // / preferences" idiom yang clean di 16×16.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5h7M12 4.5h1.5" />
      <circle cx="10.5" cy="4.5" r="1.5" />
      <path d="M2.5 8h3M8 8h5.5" />
      <circle cx="6.5" cy="8" r="1.5" />
      <path d="M2.5 11.5h8M13 11.5h.5" />
      <circle cx="11.5" cy="11.5" r="1.5" />
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
function helpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M6.4 6.1c0-.9.72-1.6 1.6-1.6s1.6.7 1.6 1.6c0 .64-.4 1.12-.96 1.36-.4.16-.64.48-.64.88V9" />
      <circle cx="8" cy="11.1" r="0.55" fill="currentColor" stroke="none" />
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
    '/playbook': () => import('../Pages/PlaybookView'),
    '/panduan': () => import('../Pages/PanduanView'),
    '/executive': () => import('../Pages/ExecutiveSummaryView'),
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
  // Assignment review flow — reviewer giliran perlu approve, PIC perlu revisi/lanjut
  'ASSIGNMENT_REVIEW',
  'ASSIGNMENT_RETURNED',
  'ASSIGNMENT_REOPENED',
])

function notifFallbackContext(): Record<string, { roleImpact: string; impact: string }> {
  return {
  APPROVAL: { roleImpact: i18n.t('You are the decision-maker'), impact: i18n.t('Holding up the flow until decided') },
  BLOCKER_CREATED: { roleImpact: i18n.t('You need to help unblock'), impact: i18n.t('Task progress is stalled') },
  DEADLINE_APPROACHING: { roleImpact: i18n.t('You own the deadline'), impact: i18n.t('Rising risk of falling behind') },
  DM_RECEIVED: { roleImpact: i18n.t('You received a direct message'), impact: i18n.t('A work conversation is awaiting your reply') },
  MENTION: { roleImpact: i18n.t('You were mentioned in a discussion'), impact: i18n.t('Context that may need your response') },
  PROGRAM_NEEDS_APPROVAL: { roleImpact: i18n.t('You are the program approver'), impact: i18n.t("Program can't proceed without approval") },
  PROGRAM_REJECTED: { roleImpact: i18n.t('You are the program PIC'), impact: i18n.t('Fix per the notes, then resubmit') },
  PROGRAM_WITHDRAWN: { roleImpact: i18n.t('You are the program reviewer'), impact: i18n.t('Submission withdrawn by PIC — no further review needed') },
  PROGRAM_COMMITMENT_CHANGED: { roleImpact: i18n.t('You are the KADIV approver for this program'), impact: i18n.t('PIC changed the commitment (target/priority/etc.) — review if needed') },
  REPORT_NEEDS_REVISION: { roleImpact: i18n.t('You need to revise the report'), impact: i18n.t('Review cycle is on hold until the revision lands') },
  TASK_ASSIGNED: { roleImpact: i18n.t('You are the task PIC'), impact: i18n.t('Awaiting your follow-up') },
  // Sprint 4 — Clear the Path
  CLEAR_PATH_REQUESTED: { roleImpact: i18n.t('You are asked to clear a blocker'), impact: i18n.t('The team awaits a disposition (Commit / Reroute / Decline)') },
  CLEAR_PATH_COMMITTED:  { roleImpact: i18n.t('Your request was committed by your manager'), impact: i18n.t('The blocker will be cleared per the commitment') },
  CLEAR_PATH_CLEARED:    { roleImpact: i18n.t('The blocker has been cleared'), impact: i18n.t('You can resume execution') },
  // Sprint 4 — carryover
  CARRYOVER_THRESHOLD: { roleImpact: i18n.t('Your action item keeps carrying over'), impact: i18n.t('Consider escalating or re-scoping') },
  // Sprint 5 — Plan→Do handoff
  PROGRAM_TASKS_ASSIGNED: { roleImpact: i18n.t('New tasks in your pipeline'), impact: i18n.t('Program is active, start executing') },
  // Meeting flow
  MEETING_INVITED:       { roleImpact: i18n.t('You are invited to a meeting'),   impact: i18n.t('Confirm your RSVP so the organizer knows your attendance') },
  MEETING_UPDATED:       { roleImpact: i18n.t('The meeting schedule changed'),   impact: i18n.t('Check the new time and adjust your calendar') },
  MEETING_CANCELLED:     { roleImpact: i18n.t('The organizer cancelled the meeting'), impact: i18n.t('Your time slot is free again') },
  MEETING_POSTPONED:     { roleImpact: i18n.t('The meeting is postponed'),       impact: i18n.t('Wait for a new schedule from the organizer') },
  ACTION_ITEM_ASSIGNED:  { roleImpact: i18n.t('You are the PIC for a meeting action item'), impact: i18n.t('Follow up by the set deadline') },
  // Assignment review flow
  ASSIGNMENT_REVIEW:   { roleImpact: i18n.t('You are the reviewer in turn'), impact: i18n.t('The assignment is on hold until you approve or return it') },
  ASSIGNMENT_RETURNED: { roleImpact: i18n.t('You are the assignment PIC'), impact: i18n.t('Revise per the notes, then resubmit for review') },
  ASSIGNMENT_REOPENED: { roleImpact: i18n.t('You are the assignment PIC'), impact: i18n.t('The assignment was reopened — continue the work') },
  ASSIGNMENT_CANCELLED: { roleImpact: i18n.t('You are the assignment PIC'), impact: i18n.t('The assignment was cancelled — no further action') },
  ASSIGNMENT_REJECTED: { roleImpact: i18n.t('You are the assignment PIC'), impact: i18n.t('The assignment was rejected — check the reason') },
  ASSIGNMENT_APPROVED: { roleImpact: i18n.t('You are the assignment PIC'), impact: i18n.t('Approved and marked complete — no further action') },
  }
}

function isActionNotification(type: string): boolean {
  return ACTION_NOTIF_TYPES.has(type)
}

function notificationIntentLabel(notification: NotificationItem): string {
  if (notification.actionLabel) return notification.actionLabel
  if (notification.type === 'DM_RECEIVED') return i18n.t('Reply')
  if (notification.type === 'MENTION') return i18n.t('Open conversation')
  if (notification.type === 'BLOCKER_CREATED') return i18n.t('Follow up')
  if (notification.type === 'PROGRAM_NEEDS_APPROVAL' || notification.type === 'APPROVAL') return i18n.t('Review')
  if (notification.type === 'PROGRAM_REJECTED') return i18n.t('Fix & resubmit')
  if (notification.type === 'REPORT_NEEDS_REVISION') return i18n.t('Revise')
  if (notification.type === 'DEADLINE_APPROACHING') return i18n.t('Check deadline')
  if (notification.type === 'TASK_ASSIGNED') return i18n.t('Work on it')
  if (notification.type === 'CLEAR_PATH_REQUESTED') return i18n.t('Disposition')
  if (notification.type === 'CLEAR_PATH_COMMITTED') return i18n.t('View commitment')
  if (notification.type === 'CLEAR_PATH_CLEARED') return i18n.t('Resume execution')
  if (notification.type === 'CARRYOVER_THRESHOLD') return i18n.t('Review again')
  if (notification.type === 'PROGRAM_TASKS_ASSIGNED') return i18n.t('Open pipeline')
  if (notification.type === 'MEETING_INVITED') return i18n.t('Confirm RSVP')
  if (notification.type === 'MEETING_UPDATED') return i18n.t('View schedule')
  if (notification.type === 'MEETING_CANCELLED' || notification.type === 'MEETING_POSTPONED') return i18n.t('Open meeting')
  if (notification.type === 'ACTION_ITEM_ASSIGNED') return i18n.t('Work on it')
  if (notification.type === 'ASSIGNMENT_REVIEW') return i18n.t('Review')
  if (notification.type === 'ASSIGNMENT_RETURNED') return i18n.t('Revise & resubmit')
  if (notification.type === 'ASSIGNMENT_REOPENED') return i18n.t('Continue')
  if (notification.type === 'ASSIGNMENT_CANCELLED') return i18n.t('View details')
  return i18n.t('View details')
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
  return notification.roleImpact ?? notifFallbackContext()[notification.type]?.roleImpact
}

function notificationImpact(notification: NotificationItem): string | undefined {
  return notification.impact ?? notifFallbackContext()[notification.type]?.impact
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
  const { t } = useTranslation()
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
        aria-label={t('Close')}
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
  const { t } = useTranslation()
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
    myWork,
  } = useWorkspace()
  const { status: realtimeStatus } = useRealtime()
  const isAdmin = ADMIN_ROLES.has(currentUser?.roleType?.toLowerCase() ?? '')
  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const isSuperAdmin = role === 'SUPERADMIN'
  // Performance role-scoped (2026-05-29): SUPERADMIN sees the full grid;
  // members of a directorate with KPI data (DIR-KMR today) get a scoped set.
  // Flag resolved BE-side (EnsurePerformanceAccess::allows) + shared in auth.user.
  const canAccessPerformance = useAuth()?.canAccessPerformance ?? false
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

  /* Auto-collapse sidebar di viewport ≤1024 (T1 laptop kantor + di bawahnya).
   * Preference manual (localStorage) tetap dipertahankan — kalau user resize
   * ke viewport lebar lagi, sidebar kembali ke preference mereka.
   * Lihat docs/responsive-audit-2026-05.md §3.1 + token --bp-md. */
  const [viewportNarrow, setViewportNarrow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 1024px)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 1024px)')
    const update = (e: MediaQueryListEvent | MediaQueryList) => setViewportNarrow(e.matches)
    update(mql)
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  /* Phone (≤640 = --bp-sm). Sidebar disembunyikan (keluar grid); navigasi via
   * All-menu sheet (marketplace) yang dibuka hamburger/tab Menu — lihat
   * MobileMenuSheet + memory project_mobile_native_marketplace. Sidebar
   * off-canvas LAMA sudah dihapus (yatim sejak sheet jadi satu-satunya entri). */
  const [viewportPhone, setViewportPhone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 640px)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 640px)')
    const update = (e: MediaQueryListEvent | MediaQueryList) => setViewportPhone(e.matches)
    update(mql)
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  // Di phone sidebar (tersembunyi) tetap expanded internal — collapse efektif
  // hanya berlaku saat BUKAN phone.
  const effectiveCollapsed = !viewportPhone && (sidebarCollapsedView || viewportNarrow)

  const [menuSheetOpen, setMenuSheetOpen] = useState(false)
  // Tutup All-menu sheet otomatis saat navigasi (klik item → route berubah).
  useEffect(() => { setMenuSheetOpen(false) }, [activePath])

  const [tooltipState, setTooltipState] = useState<SidebarTooltipState | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [_stickyTitleVisible, setStickyTitleVisible] = useState(false)

  // User account menu kini hidup di kanan-atas topbar (avatar) — popover pakai
  // positioning absolut biasa di dalam `.topbar__user-menu` (topbar tidak
  // overflow:hidden), jadi tak perlu portal/rect seperti footer sidebar dulu.
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

  // Buka command palette / All-menu sheet dari komponen lain (search pill &
  // "All menu" di HomeMobile) via event — menghindari prop-drilling +
  // mencegah sheet ter-mount ganda (satu sumber di AppShell).
  useEffect(() => {
    const openPalette = () => setPaletteOpen(true)
    const openMenu = () => setMenuSheetOpen(true)
    window.addEventListener('atlas:open-palette', openPalette)
    window.addEventListener('atlas:open-menu', openMenu)
    return () => {
      window.removeEventListener('atlas:open-palette', openPalette)
      window.removeEventListener('atlas:open-menu', openMenu)
    }
  }, [])

  useEscKey(() => setMenuSheetOpen(false), menuSheetOpen)

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
  // Badge Focus = unread NON-chat. DM & mention sudah tidak disurface di Focus
  // (rumahnya Channels, dihitung di badge Channels) — kalau ikut dihitung di sini
  // badge overstate vs isi feed. Lihat memory project_focus_disposition_followup.
  const focusBadgeCount = activeNotifications.filter(n =>
    n.state === 'UNREAD' && n.type !== 'DM_RECEIVED' && n.type !== 'MENTION'
  ).length
  const urgentCount = activeNotifications.filter(n =>
    n.state === 'UNREAD' && notificationRequiresAction(n)
  ).length

  // ── Anchor "Butuh aksi" (sidebar, 2026-06-26) ────────────────────────────
  // Cerminan ringkas halaman Focus (InboxView). HARUS pakai angka & kosakata
  // yang SAMA dgn Focus, kalau tidak terasa bug (2026-06-26: user 0 unread tapi
  // 29 item Focus → anchor salah "All clear"). MIRROR komputasi InboxView:
  //   total ("All") = jumlah semua entity di feed (escalation+blocker+task+
  //     actionItem+assignment+approval+programAktif-terkait+notif-actionable),
  //     tiap entity dihitung sekali (lihat InboxView rakit array lalu dedup).
  //   baris = tab Focus: Action (task|blocker|actionItem|assignment) & Risk
  //     (programAktif|blocker). Schedule (meeting/focus-block) di-skip — butuh
  //     fetch async, jarang & Focus sering 0; total juga tak menyertakannya.
  // ⚠ Jaga sinkron dgn InboxView (rankedFocusItems + focusItemMatchesScope).
  // 'mine' scope (default Focus, tanpa toggle divisi di sidebar): program aktif
  // yang TERKAIT user = myWork.programs aktif (BE sudah resolve via membership).
  const fTasks = (myWork?.tasks ?? []).length
  const fBlockers = (myWork?.blockers ?? []).length
  const fEscalations = (myWork?.committedEscalations ?? []).length
  const fApprovals = (myWork?.decisions ?? []).length
  const fActionItems = (myWork?.actionItems ?? []).length
  const fAssignments = (myWork?.assignments ?? []).length
  const fProgramsActive = (myWork?.programs ?? []).filter(p => p.approvalStatus === 'ACTIVE').length
  // Notif actionable (mirror actionableOtherUnread di InboxView; chat dikecualikan).
  const ANCHOR_NOTIF_ACTIONABLE = new Set([
    'REPORT_NEEDS_REVISION', 'PROGRAM_NEEDS_APPROVAL', 'PROGRAM_REJECTED',
    'DEADLINE_APPROACHING', 'BLOCKER_CREATED', 'TASK_ASSIGNED',
  ])
  const fNotif = activeNotifications.filter(
    n => n.state === 'UNREAD' && ANCHOR_NOTIF_ACTIONABLE.has(n.type),
  ).length
  const anchorTotal = fEscalations + fBlockers + fTasks + fActionItems + fAssignments + fApprovals + fProgramsActive + fNotif
  // Breakdown per TIPE entity (bukan tab Focus yang overlapping & butuh urgency
  // scoring) — jumlah baris = anchorTotal persis, internal konsisten. Urut
  // severity, tampil 3 teratas non-nol.
  const anchorTopRows = [
    { key: 'block',    count: fBlockers + fEscalations,    label: t('blockers'),     tone: 'danger' },
    { key: 'approval', count: fApprovals,                  label: t('approvals'),    tone: 'warn' },
    { key: 'task',     count: fTasks,                      label: t('tasks'),        tone: 'warn' },
    { key: 'work',     count: fActionItems + fAssignments, label: t('action items'), tone: 'info' },
    { key: 'program',  count: fProgramsActive,             label: t('programs'),     tone: 'info' },
    { key: 'notif',    count: fNotif,                      label: t('updates'),      tone: 'neutral' },
  ].filter(r => r.count > 0).slice(0, 3)

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

  // ── Workspace switcher (sidebar header chip, 2026-06-26) ──────────────────
  // Header brand jadi chip clickable (sinyal SaaS premium) + popover ringkas
  // scope workspace. SENGAJA tidak menduplikasi akun/logout (itu tetap di
  // user-popover topbar) — popover ini fokus konteks workspace + shortcut.
  const [wsMenuOpen, setWsMenuOpen] = useState(false)
  const wsMenuRef = useRef<HTMLDivElement>(null)
  useEscKey(() => setWsMenuOpen(false), wsMenuOpen)
  useEffect(() => {
    if (!wsMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) setWsMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [wsMenuOpen])
  // Tutup popover saat pindah halaman supaya tidak menggantung.
  useEffect(() => { setWsMenuOpen(false) }, [activePath])
  // Scope ringkas untuk sub-line chip: direktorat user > unit > Holding.
  const wsScope = currentUser?.directorate?.code ?? currentUser?.unit?.code ?? t('Holding')

  const NOTIF_TYPE_LABEL: Record<string, string> = {
    MENTION: t('Mention'), APPROVAL: t('Approval'),
    BLOCKER_CREATED: t('Blocker'), TASK_ASSIGNED: t('Task'),
    PROGRAM_NEEDS_APPROVAL: t('Approval'), PROGRAM_APPROVED: t('Program'),
    PROGRAM_REJECTED: t('Program'), PROGRAM_WITHDRAWN: t('Program'),
    PROGRAM_COMMITMENT_CHANGED: t('Commitment'),
    REPORT_AWAITING_REVIEW: t('Report'),
    REPORT_AWAITING_APPROVAL: t('Report'), REPORT_APPROVED: t('Report'),
    REPORT_REJECTED: t('Report'), REPORT_NEEDS_REVISION: t('Report'),
    DEADLINE_APPROACHING: t('Deadline'), DM_RECEIVED: t('DM'),
    CLEAR_PATH_REQUESTED: t('Clear the Path'), CLEAR_PATH_COMMITTED: t('Clear the Path'),
    CLEAR_PATH_CLEARED: t('Clear the Path'), CARRYOVER_THRESHOLD: t('Carryover'),
    PROGRAM_TASKS_ASSIGNED: t('Pipeline'),
    MEETING_INVITED: t('Meeting'), MEETING_UPDATED: t('Meeting'),
    MEETING_CANCELLED: t('Meeting'), MEETING_POSTPONED: t('Meeting'),
    ACTION_ITEM_ASSIGNED: t('Action Item'),
    ASSIGNMENT_REVIEW: t('Review'), ASSIGNMENT_RETURNED: t('Assignment'),
    ASSIGNMENT_REOPENED: t('Assignment'), ASSIGNMENT_CANCELLED: t('Assignment'),
    ASSIGNMENT_REJECTED: t('Assignment'), ASSIGNMENT_APPROVED: t('Assignment'),
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
    ASSIGNMENT_REVIEW: 'notif-type--approval',
    ASSIGNMENT_RETURNED: 'notif-type--warn',
    ASSIGNMENT_REOPENED: 'notif-type--warn',
    ASSIGNMENT_CANCELLED: '',
    ASSIGNMENT_REJECTED: 'notif-type--danger',
    ASSIGNMENT_APPROVED: 'notif-type--success' as string,
  }

  function formatNotifTime(dateString: string): string {
    const diff = Date.now() - new Date(dateString).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return t('just now')
    if (m < 60) return t('{{count}}m ago', { count: m })
    const h = Math.floor(m / 60)
    if (h < 24) return t('{{count}}h ago', { count: h })
    return t('{{count}}d ago', { count: Math.floor(h / 24) })
  }

  function navigateToNotifSource(source: string) {
    // Source dapat berupa: "type:id", "name·type:id", "type:id·type:id"
    // Iterasi semua parts — ambil entitas navigable pertama (bukan comment, bukan plain text)
    for (const part of source.split('·').map(p => p.trim())) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      const type = part.slice(0, colon)
      const id = Number(part.slice(colon + 1).split(':')[0])
      // Detail route (bukan list) — selaras dgn Focus; list-nav pernah glitch
      // (URL ganti tapi komponen tak rerender). setSelected* untuk konteks.
      if (type === 'task' && !isNaN(id)) { setSelectedTaskId(id); navigate(`/execution/tasks/${id}`); return }
      if (type === 'program' && !isNaN(id)) { setSelectedProgramId(id); navigate(`/programs/${id}`); return }
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
  // Badge lonceng = jumlah ENTITAS unread (grup), bukan unread mentah — selaras
  // tab "All" & tidak melebih-lebihkan saat 1 entitas punya banyak update.
  const unreadGroupCount = dropNotifGroups.filter(group => group.unreadCount > 0).length
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
    { view: 'all', label: t('All'), count: dropNotifGroups.length },
    { view: 'action', label: t('Action'), count: dropActionGroups.length },
    { view: 'communication', label: t('Communication'), count: dropCommunicationGroups.length },
    { view: 'risk', label: t('Risk'), count: dropRiskGroups.length },
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
              {group.items.length > 1 && <span className="topbar__notif-item-count">{t('{{count}} update', { count: group.items.length })}</span>}
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
          aria-label={t('Dismiss notification: {{message}}', { message: n.message })}
          className="topbar__notif-dismiss"
          onClick={() => void handleNotifGroupDismiss(group)}
          title={t('Dismiss notification')}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 12 12" width="12">
            <path d="m2 2 8 8M10 2 2 10" />
          </svg>
        </button>
      </div>
    )
  }

  const fokusItem: NavItem = { path: '/fokus', label: t('Focus'), caption: t('Tasks and items awaiting you'), icon: IconInbox, badge: () => focusBadgeCount, badgeUrgent: true, shortcut: 'G F' }
  // Badge sidebar = SATU makna seragam: "sekian hal menunggu aksimu" (bukan
  // jumlah katalog/antrian). Lihat memory project_status_label_fragmentation.
  //  - Workboard: task milik user yang overdue / ter-blokir (butuh aksi),
  //    bukan total task assigned. taskIsOverdue = sumber tunggal (taskSchedule).
  //  - Assignment: assignment yang masih jalan & due-window (gate sudah di BE
  //    /my-work: belum selesai DAN due ≤7h / overdue / belum ber-due).
  //  - Programs: TIDAK ada badge — "total program di portofolio" itu stok, bukan
  //    sinyal aksi (selaras keputusan bottom-nav mobile yang men-set 0).
  const tasksCount = (myWork?.tasks ?? []).filter(
    t => taskIsOverdue(t) || t.isBlocked || t.status === 'BLOCKED',
  ).length
  const assignmentsCount = myWork?.assignments?.length ?? 0

  // ── Nav items palette ──────────────────────────────────────────────────────
  // Sidebar di-organize secara intent-based (post 2026-05-25, revisi 2026-05-26):
  //   Today (pinned: Home + Focus) → My Work → Portfolio[& Performance] → Admin
  //   (grup Account dihapus — Presence ke My Work, Profile/Settings ke popover)
  // PDCA tetap framework sistem di docs/playbook, tapi navigasi user-facing
  // dioptimasi untuk fast lookup (group by intent, bukan by abstract phase).
  // Single source of truth: lib/nav-config.ts. Labels & order mirror that file.
  const NI = {
    home:        { path: '/',          label: t('Home'),             caption: t('Executive overview of work programs'), icon: IconHome,        shortcut: 'G H' },
    roadmap:     { path: '/roadmap',   label: t('Roadmap'),          caption: t('Visual program timeline'),           icon: IconRoadmap    },
    programs:    { path: '/programs',  label: t('Programs'),         caption: t('Portfolio orchestration'),           icon: IconPrograms,    shortcut: 'G P' },
    execution:   { path: '/execution', label: t('Workboard'),        caption: t('Scheduled tasks from Programs'),     icon: IconExecution,   shortcut: 'G E', badge: () => tasksCount, badgeUrgent: true },
    penugasan:   { path: '/penugasan', label: t('Assignment'),       caption: t('Ad-hoc tasks outside Programs'),     icon: IconAssignments, shortcut: 'G A', badge: () => assignmentsCount, badgeUrgent: true },
    goals:       { path: '/goals',      label: t('Goals & KPI'),   caption: t('Manage org KPIs & achievement tracking'),  icon: IconGoals    },
    activity:    { path: '/activity',   label: t('Team Activity'), caption: t('Session leaderboard & daily team activity'), icon: IconActivity },
    reports:       { path: '/reports',         label: t('Analytics'),       caption: t('KPI, program health & leaderboard'),  icon: IconReports       },
    executive:     { path: '/executive',             label: t('Executive Summary'), caption: t('One-page executive snapshot'),      icon: IconScorecard    },
    perfScorecard: { path: '/performance/scorecard', label: t('Scorecard'),       caption: t('Directorate & division achievement ranking'), icon: IconScorecard    },
    perfDirektorat:{ path: '/performance/kolegial',  label: t('Directorate KPI'), caption: t('KPI achievement across the board'),     icon: IconKpiDirektorat },
    perfDivisi:    { path: '/performance/divisi',    label: t('Division KPI'),    caption: t('Division-level KPI achievement'),       icon: IconKpiDivisi    },
    perfSaya:      { path: '/performance/me',        label: t('My KPI'),          caption: t('My individual KPI'),                    icon: IconKpiIndividu  },
    perfIndividu:  { path: '/performance/individu',  label: t('Leaderboard'),     caption: t('Top performer per BOD level'),          icon: IconKpiIndividu  },
    schedule:    { path: '/jadwal',    label: t('Coordination'),     caption: t('Coordination meetings & team cadence'), icon: IconSchedule,    shortcut: 'G R' },
    channels:    { path: '/channels',  label: t('Channels'),         caption: t('Team collaboration'),                icon: IconChannels,    shortcut: 'G C', badge: () => totalUnreadChannels, badgeUrgent: true },
    presence:    { path: '/presence',  label: t('Presence'),         caption: t('Live team availability'),            icon: IconPresence   },
    profile:     { path: '/profile',   label: t('Profile'),          caption: t('Account & position hierarchy'),      icon: IconProfile    },
    settings:    { path: '/settings',  label: t('Settings'),         caption: t('Workspace preferences'),             icon: IconSettings   },
  } satisfies Record<string, NavItem>

  // ── Sidebar groups — intent-based (post 2026-05-25) ──────────────────────
  // Order (revisi 2026-05-26): Portfolio[& Performance] (jangkar strategis) →
  // My Work (eksekusi harian) → Admin. Programs diangkat ke atas karena ia
  // objek inti produk (PDCA Plan sebelum Do) + Home memfunnel ke sana; dulu
  // terkubur di dasar sebagai grup 1-item. PDCA framework masih hidup di
  // docs/playbook; sidebar dioptimasi untuk fast nav (group by intent).
  //
  // My Work = aktivitas harian: task terjadwal (Workboard), tugas ad-hoc
  // (Assignment), jadwal rapat, messaging, status kehadiran (Presence).
  //
  // Portfolio & Performance = Programs (kelola portfolio) + KPI dashboards
  // (SUPERADMIN-only sejak 2026-05-25 — sebelumnya role-based: BOD tanpa KPI
  // Saya, KASUBDIV hanya KPI Divisi+Saya, OFFICER/ASISTEN hanya KPI Saya).
  // Presence ditarik ke My Work (keputusan 2026-05-26): Presence = status
  // kehadiran/ketersediaan tim → operasional, bukan "akun". Sebelumnya salah
  // kategori di grup Account bersama Profile.
  // Label 'Work' (bukan 'My Work') 2026-05-26: isi grup juga mencakup kolaborasi
  // tim (Channels/Presence/Coordination), bukan murni tugas personal — 'Work'
  // lebih pas & tetap intent-based. 'Workspace' dihindari (tabrakan dgn .workspace
  // container + route /workspace/overview + tab Settings Workspace).
  const grpMyWork  = { label: t('Work'), tone: 'do', items: [NI.execution, NI.penugasan, NI.schedule, NI.channels, NI.presence] }
  // Settings & Profile eksklusif di user popover (sidebar footer) per keputusan
  // 2026-05-26 — eliminasi grup Account 1-item + duplikat entry point. Keduanya
  // personal/identity, sepasang natural dengan Mode gelap toggle di popover.

  // Performance items role-scoped (2026-05-29). SUPERADMIN: full portfolio grid.
  // DIR-KMR members (canAccessPerformance): Scorecard (overview direktorat) →
  // KPI Direktorat (19 KPI per perspektif; /performance/kolegial me-redirect
  // non-eksekutif ke detail direktoratnya) → KPI Divisi (detail divisinya;
  // controller mengunci unit-level user ke divisinya sendiri). Leaderboard/
  // executive tetap SUPERADMIN-only. Lain-lain hanya Programs.
  const portfolioItems: NavItem[] = isSuperAdmin
    ? [NI.programs, NI.executive, NI.perfScorecard, NI.perfDirektorat, NI.perfDivisi, NI.perfIndividu, NI.perfSaya]
    : canAccessPerformance
      ? [NI.programs, NI.perfScorecard, NI.perfDirektorat, NI.perfDivisi]
      : [NI.programs]
  // Label jujur ke isi: "Performance" hanya saat item Performance benar hadir.
  const grpPortfolio = {
    label: isSuperAdmin || canAccessPerformance ? t('Portfolio & Performance') : t('Portfolio'),
    tone: 'check',
    items: portfolioItems,
  }
  const grpAdmin = {
    label: t('Admin'),
    tone: 'admin',
    items: [
      { path: '/admin/orgs',           label: t('Companies'),      caption: t('Org entities & hierarchy'),   icon: IconOrg       },
      { path: '/admin/positions',      label: t('Positions'),      caption: t('Position management'),        icon: IconPositions },
      { path: '/admin/users',          label: t('Users'),          caption: t('User management'),            icon: IconUsers     },
      { path: '/admin/roles',          label: t('Roles'),          caption: t('Roles & permission matrix'),  icon: IconRoles     },
      { path: '/admin/pilot-metrics',  label: t('Pilot Metrics'),  caption: t('Pilot DKM dashboard (Sprint 4)'), icon: IconReports },
      ...(role === 'SUPERADMIN' ? [
        { path: '/admin/thresholds',   label: t('Thresholds'),     caption: t('Live system number tuning'),      icon: IconSettings },
      ] : []),
    ],
  }

  // ── Sidebar composition (intent-based, role-aware via portfolioItems) ──────
  // 3 group: My Work → Portfolio & Performance → Account. Programs always
  // hadir di Portfolio; Performance items role-gated di portfolioItems above.
  //
  // NOTE: grup "Pelaporan" dihilangkan dari semua surface navigasi utama
  // (sidebar + Command Palette + breadcrumb) per permintaan user 2026-05-10.
  // Halaman /laporan-bulanan tetap hidup: accessible via direct URL & notif deep-link.
  // Dashboard Risiko standalone (/laporan-risiko) DIHILANGKAN dari discovery 2026-06-02
  // (ATLAS bukan app manajemen risiko); API /risk-reports tetap untuk Monthly Report DIMR.
  const navGroups: { label: string; tone: string; items: NavItem[] }[] = [
    grpPortfolio,
    grpMyWork,
    ...(isAdmin ? [grpAdmin] : []),
  ]

  // Page name for breadcrumb
  const PAGE_NAMES: Record<string, string> = {
    '/': t('Home'), '/programs': t('Programs'),
    '/goals': t('Goals & KPI'), '/activity': t('Team Activity'), '/execution': t('Workboard'), '/penugasan': t('Assignment'), '/reports': t('Analytics'), '/laporan-bulanan': t('Monthly Reports'),
    '/fokus': t('Focus'), '/channels': t('Channels'), '/jadwal': t('Coordination'), '/search': t('Search'),
    '/presence': t('Presence'), '/profile': t('Profile'), '/settings': t('Settings'),
    '/executive': t('Executive Summary'),
    '/admin/users': t('Users'), '/admin/positions': t('Positions'),
    '/admin/orgs': t('Companies'), '/admin/roles': t('Roles & Permissions'),
    '/playbook': t('Playbook'),
    '/performance/scorecard': t('Scorecard'),
    '/performance/kolegial': t('Directorate KPI'),
    '/performance/divisi': t('Division KPI'),
    '/performance/me': t('My KPI'),
    '/performance/individu': t('Leaderboard'),
  }
  const _currentPage = PAGE_NAMES[activePath] ?? PAGE_NAMES[pathname] ?? 'ATLAS'

  return (
    <div className={`app-shell${effectiveCollapsed ? ' app-shell--collapsed' : ''}${hasContextPanel ? ' app-shell--with-panel' : ''}${authStatus === 'logging_out' ? ' app-shell--exiting' : ''}${viewportPhone ? ' app-shell--mobile' : ''}`} ref={shellRef}>
      {/* ── Sidebar (disembunyikan di phone via shell.css; navigasi = MobileMenuSheet) ── */}
      <aside className="sidebar">
        <div className="sidebar__header" ref={wsMenuRef}>
          {/* Workspace switcher chip (2026-06-26): brand jadi clickable.
              Collapsed → klik = expand sidebar. Expanded → klik = popover scope. */}
          <button
            type="button"
            className={`sidebar__brand sidebar__wschip${wsMenuOpen ? ' sidebar__wschip--open' : ''}`}
            onClick={sidebarCollapsedView ? toggleSidebar : () => setWsMenuOpen(o => !o)}
            aria-haspopup={sidebarCollapsedView ? undefined : 'menu'}
            aria-expanded={sidebarCollapsedView ? undefined : wsMenuOpen}
            aria-label={sidebarCollapsedView ? t('Expand sidebar') : t('Workspace menu')}
            title={sidebarCollapsedView ? t('Expand sidebar (⌘\\)') : t('Workspace')}
          >
            <span className="sidebar__brand-mark">
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="2.5" y1="18.5" x2="10" y2="2.5"/>
                <line x1="17.5" y1="18.5" x2="10" y2="2.5"/>
                <line x1="6.3" y1="11.5" x2="13.7" y2="11.5"/>
              </svg>
            </span>
            <span className="sidebar__brand-name">
              <span className="sidebar__brand-titlerow">
                <span className="sidebar__brand-title" title="Advanced Transformation &amp; Leadership Alignment System">ATLAS</span>
                <span className="sidebar__brand-chip">{t('Holding')}</span>
              </span>
              <span className="sidebar__brand-tagline" aria-label={t('PTPN III Holding workspace')}>PTPN III · {wsScope}</span>
            </span>
            <span className="sidebar__brand-chev" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5.5 7 8.5l3-3" />
              </svg>
            </span>
          </button>
          <button
            className="sidebar__collapse-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsedView ? t('Expand sidebar (⌘\\)') : t('Collapse sidebar (⌘\\)')}
            aria-label={sidebarCollapsedView ? t('Expand sidebar') : t('Collapse sidebar')}
            type="button"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="10" height="8" rx="1.5" />
              <path d="M5.5 3v8" />
              <path d="m9 5.5-1.5 1.5L9 8.5" />
            </svg>
          </button>

          {wsMenuOpen && !sidebarCollapsedView ? (
            <div className="sidebar__ws-popover" role="menu">
              <div className="sidebar__ws-popover-head">
                <span className="sidebar__ws-popover-mark" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="2.5" y1="18.5" x2="10" y2="2.5"/>
                    <line x1="17.5" y1="18.5" x2="10" y2="2.5"/>
                    <line x1="6.3" y1="11.5" x2="13.7" y2="11.5"/>
                  </svg>
                </span>
                <div className="sidebar__ws-popover-id">
                  <strong>ATLAS</strong>
                  <span>{t('PTPN III Holding workspace')}</span>
                </div>
              </div>
              {currentUser?.directorate?.name || currentUser?.unit?.name ? (
                <div className="sidebar__ws-popover-scope">
                  <span className="sidebar__ws-popover-scope-label">{t('Your scope')}</span>
                  <span className="sidebar__ws-popover-scope-value">
                    {currentUser?.directorate?.name ?? currentUser?.unit?.name}
                  </span>
                </div>
              ) : null}
              <div className="sidebar__ws-popover-divider" />
              <Link className="sidebar__ws-popover-item" href="/settings" onClick={() => setWsMenuOpen(false)}>
                <IconSettings />
                <span>{t('Workspace settings')}</span>
              </Link>
              {isAdmin ? (
                <Link className="sidebar__ws-popover-item" href="/admin/orgs" onClick={() => setWsMenuOpen(false)}>
                  <IconOrg />
                  <span>{t('Organization')}</span>
                </Link>
              ) : null}
            </div>
          ) : null}
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
            const pdcaTone = group.tone === 'do' || group.tone === 'check' ? group.tone : ''
            return (
            <div
              className={`sidebar__group sidebar__group--separated${pdcaTone ? ` sidebar__group--${pdcaTone}` : ''}${group.tone === 'admin' ? ' sidebar__group--admin' : ''}`}
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

        {/* Anchor "Butuh aksi" (2026-06-26): mengisi ruang kosong bawah rail
            dengan sintesis sinyal aksi (sama sumber dgn badge Focus). Disembunyikan
            saat collapsed — Focus nav item sudah membawa badge-nya. */}
        {!sidebarCollapsedView ? (
          <Link
            className={`sidebar__anchor${anchorTotal === 0 ? ' sidebar__anchor--clear' : ''}`}
            href="/fokus"
            onMouseEnter={() => prefetchRoute('/fokus')}
            aria-label={anchorTotal > 0
              ? t('{{count}} items need your action — open Focus', { count: anchorTotal })
              : t('Nothing waiting — open Focus')}
          >
            {anchorTotal > 0 ? (
              <>
                <div className="sidebar__anchor-top">
                  <span className="sidebar__anchor-dot" aria-hidden="true" />
                  <span className="sidebar__anchor-title">{t('Needs action')}</span>
                  <span className="sidebar__anchor-n">{anchorTotal > 99 ? '99+' : anchorTotal}</span>
                </div>
                {anchorTopRows.map(row => (
                  <div className="sidebar__anchor-row" key={row.key}>
                    <span className={`sidebar__anchor-pip sidebar__anchor-pip--${row.tone}`} aria-hidden="true" />
                    <b>{row.count}</b>&nbsp;{row.label}
                  </div>
                ))}
                <span className="sidebar__anchor-cta">
                  {t('Open Focus')}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
                  </svg>
                </span>
              </>
            ) : (
              <div className="sidebar__anchor-clear">
                <span className="sidebar__anchor-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div className="sidebar__anchor-clear-copy">
                  <strong>{t('All clear')}</strong>
                  <span>{t('Nothing needs your action')}</span>
                </div>
              </div>
            )}
          </Link>
        ) : null}

        {/* Footer — rak utilitas (2026-06-26): seimbang dua-sisi — Playbook (kiri)
            + toggle tema (kanan). Bantuan/Panduan tetap di topbar (help-btn).
            Collapsed = tumpuk vertikal. */}
        <div className="sidebar__footer sidebar__footer--balanced">
          <Link
            className="sidebar__util-btn"
            href="/playbook"
            title={t('Playbook')}
            aria-label={t('Playbook')}
            onMouseEnter={() => prefetchRoute('/playbook')}
            aria-current={activePath === '/playbook' ? 'page' : undefined}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.5 4.5A1.5 1.5 0 0 1 5 3h6v13H5a1.5 1.5 0 0 0-1.5 1.5Z" />
              <path d="M16.5 4.5A1.5 1.5 0 0 0 15 3h-4v13h4a1.5 1.5 0 0 1 1.5 1.5Z" />
            </svg>
          </Link>
          <button
            type="button"
            className="sidebar__util-btn"
            onClick={toggleTheme}
            title={resolvedTheme === 'dark' ? t('Light mode') : t('Dark mode')}
            aria-label={resolvedTheme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
          >
            {resolvedTheme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="10" cy="10" r="4" />
                <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.9 3.9l1.4 1.4M14.7 14.7l1.4 1.4M3.9 16.1l1.4-1.4M14.7 5.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 11.5A7.5 7.5 0 0 1 8.5 3a7.5 7.5 0 1 0 8.5 8.5Z" />
              </svg>
            )}
          </button>
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
          {/* Wordmark brand — hanya tampil di app-bar mobile (≤640), mengisi sisi
              kiri yang dulu kosong/rusak. Hidden di desktop via CSS. */}
          <div className="topbar__brand-mobile" aria-hidden="true">
            <span className="topbar__brand-mobile-mark">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
                <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
                <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
              </svg>
            </span>
            <span className="topbar__brand-mobile-name">ATLAS</span>
          </div>
          {/* Navigasi phone = bottom tab "Menu" → All-menu sheet (hamburger lama
              dihapus; entri menu tunggal lewat tab bar jangkauan-jempol). */}
          {/* ── Slim utility bar — date/period/live + sticky title + actions ──
           * Pure System: no breadcrumb, no full-width search input. Topbar is
           * a thin context strip sharing the sidebar's canvas. Sticky page
           * title fades in once user scrolls past the page heading. */}
          {/* Meta kiri (rev 2026-06-01): Live + periode ringkas (Q · W · tahun).
           * Dikembalikan ke kiri agar cluster kanan tidak terlalu padat. Spacer
           * di bawah mendorong actions ke kanan. Periode di-hide di ≤1024. */}
          {(() => {
            const now = new Date()
            const quarter = Math.floor(now.getMonth() / 3) + 1
            // Minggu-dalam-bulan (Mon-aligned): pekan ke berapa di bulan ini.
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            const firstISO = firstOfMonth.getDay() || 7 // Mon=1 … Sun=7
            const weekOfMonth = Math.ceil((now.getDate() + firstISO - 1) / 7)
            const monthName = now.toLocaleDateString('en-US', { month: 'long' })
            const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1)
            const periodLabel = `Q${quarter} · W${weekOfMonth} ${monthLabel} ${now.getFullYear()}`
            const liveLabel = realtimeStatus === 'connected' ? t('Live')
              : realtimeStatus === 'connecting' ? t('Syncing')
              : realtimeStatus === 'disconnected' ? t('Offline')
              : ''
            const liveClass = realtimeStatus === 'connected' ? 'topbar__live--connected'
              : realtimeStatus === 'disconnected' ? 'topbar__live--disconnected'
              : 'topbar__live--connecting'
            return (
              <div className="topbar__meta">
                {liveLabel ? (
                  <span
                    className={`topbar__live ${liveClass}`}
                    title={
                      realtimeStatus === 'connected' ? t('Real-time active — data in sync')
                      : realtimeStatus === 'connecting' ? t('Connecting to real-time server…')
                      : realtimeStatus === 'disconnected' ? t('Real-time connection lost — reconnecting')
                      : ''
                    }
                  >
                    <span className="topbar__live-dot" aria-hidden="true" />
                    {liveLabel}
                  </span>
                ) : null}
                <span className="topbar__meta-period">{periodLabel}</span>
              </div>
            )
          })()}

          <div className="topbar__spacer" />

          {/* Contextual page action (route-aware, primary CTA when defined) */}
          {TOPBAR_ACTIONS[activePath] ? (
            <TopbarAction action={TOPBAR_ACTIONS[activePath]} page={activePath} />
          ) : null}

          {/* Global Quick-Create "+" dihapus 2026-06-01: redundan dengan ⌘K
              palette (grup "Aksi" mengekspos task/meeting/assignment.new yang
              sama) + contextual CTA di work-pages. Create kini lewat ⌘K atau
              tombol contextual; Program via CTA di ProgramsView. */}

          {/* ⌘K command palette — prominent search pill */}
          <button
            type="button"
            className="topbar__cmdk"
            onClick={() => setPaletteOpen(true)}
            aria-label={t('Open command palette (⌘K)')}
            title={t('Search (⌘K)')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" />
              <path d="m9.5 9.5 3 3" />
            </svg>
            <span className="topbar__cmdk-placeholder">{t('Search programs, tasks…')}</span>
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
                title={t('Notifications')}
                type="button"
              >
                <svg className="topbar__notif-icon" fill="none" height="20" viewBox="0 0 20 20" width="20" aria-hidden="true">
                  <path d="M10 3.2c-2.25 0-4.05 1.73-4.05 4.08v1.68c0 .78-.26 1.53-.74 2.14l-.68.85c-.3.37-.03.93.44.93h10.06c.47 0 .74-.56.44-.93l-.68-.85a3.42 3.42 0 0 1-.74-2.14V7.28c0-2.35-1.8-4.08-4.05-4.08Z" />
                  <path d="M8.25 15.05c.3.76.95 1.25 1.75 1.25s1.45-.49 1.75-1.25" />
                </svg>
                {unreadGroupCount > 0 && (
                  <span className={`topbar__notif-badge${urgentCount > 0 ? ' topbar__notif-badge--urgent' : ' topbar__notif-badge--info'}`}>
                    {unreadGroupCount > 9 ? '9+' : unreadGroupCount}
                  </span>
                )}
              </button>

              {notifDropOpen && (
                <div className="topbar__notif-popover" role="menu">
                  <div className="topbar__notif-popover-head">
                    <span className="topbar__notif-popover-title">{t('Notifications')}</span>
                    {unreadCount > 0 && (
                      <button
                        className="topbar__notif-mark-all"
                        disabled={markingAllRead}
                        onClick={() => void handleMarkAllReadDrop()}
                        type="button"
                      >
                        {markingAllRead ? t('Marking…') : t('Mark all read')}
                      </button>
                    )}
                  </div>

                  <div className="topbar__notif-filter" aria-label={t('Filter notifications')}>
                    {notifViewOptions.map(option => (
                      <button
                        aria-pressed={notifDropView === option.view}
                        className={`topbar__notif-filter-btn${notifDropView === option.view ? ' is-active' : ''}`}
                        // Tab kosong diredupkan (bukan disembunyikan — posisi tetap stabil).
                        style={option.count === 0 && notifDropView !== option.view ? { opacity: 0.45 } : undefined}
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
                        {t('No notifications')}
                      </div>
                    ) : (
                      <>
                        {dropActionGroups.length > 0 && (
                          <div className="topbar__notif-priority">
                            <div>
                                <span className="topbar__notif-priority-label">{t('Needs action')}</span>
                                <span className="topbar__notif-priority-copy">{t('Tasks, approvals, blockers, revisions, or conversations needing a response.')}</span>
                            </div>
                            <strong>{dropActionGroups.length}</strong>
                          </div>
                        )}
                        {notifDropView === 'all' ? (
                          <>
                            {visibleDropActionGroups.map(group => renderNotifDropGroup(group, group.actionItem ?? group.latest))}
                            {visibleDropContextGroups.length > 0 && (
                              <div className="topbar__notif-section-label">
                                {visibleDropActionGroups.length > 0 ? t('Other updates') : t('Latest updates')}
                              </div>
                            )}
                            {visibleDropContextGroups.map(group => renderNotifDropGroup(group))}
                          </>
                        ) : visibleFilteredGroups.length > 0 ? (
                          visibleFilteredGroups.map(group => renderNotifDropGroup(group, notifDropView === 'action' ? group.actionItem ?? group.latest : group.latest))
                        ) : (
                          <div className="topbar__notif-empty topbar__notif-empty--compact">
                            {t('No notifications for this filter')}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="topbar__notif-footer">
                    {/* Footer kontekstual: chat (Communication) rumahnya Channels —
                        Focus tak lagi menampilkan DM/mention. Tab lain → Focus. */}
                    {notifDropView === 'communication' ? (
                      <button
                        className="topbar__notif-view-all"
                        onClick={() => { setNotifDropOpen(false); navigate('/channels') }}
                        type="button"
                      >
                        {t('Open Channels →')}
                      </button>
                    ) : (
                      <button
                        className="topbar__notif-view-all"
                        onClick={() => { setNotifDropOpen(false); navigate('/fokus') }}
                        type="button"
                      >
                        {t('View all in Focus →')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Help & Guide — dipindah dari footer sidebar 2026-06-25, di antara bell & avatar */}
            <Link
              className={`topbar__notif-btn topbar__help-btn${activePath === '/panduan' ? ' topbar__help-btn--active' : ''}`}
              href="/panduan"
              title={t('Help & Guide')}
              aria-label={t('Help & Guide')}
              onMouseEnter={() => prefetchRoute('/panduan')}
              onFocus={() => prefetchRoute('/panduan')}
              aria-current={activePath === '/panduan' ? 'page' : undefined}
            >
              {helpIcon()}
            </Link>

            {/* Account avatar + menu — kanan-atas (Gmail/Linear pattern).
                Popover positioned absolut di dalam .topbar__user-menu; backdrop
                menangani click-outside. Menu pindah dari footer sidebar 2026-06-01. */}
            <div className="topbar__user-menu">
              <button
                className="topbar__avatar-btn"
                onClick={() => toggleUserMenu('topbar')}
                aria-expanded={userMenuSurface === 'topbar'}
                aria-haspopup="menu"
                title={currentUser?.positionTitle ? `${currentUser?.name} — ${currentUser.positionTitle}` : (currentUser?.name ?? t('User menu'))}
                type="button"
              >
                <span className="topbar__avatar">
                  {looksLikeAvatarUrl(currentUser?.avatarUrl)
                    ? <img className="topbar__avatar-photo" src={currentUser.avatarUrl} alt="" />
                    : <span className="topbar__avatar-initials">{userInitials || 'AU'}</span>}
                </span>
                <span className="topbar__avatar-text">
                  <span className="topbar__avatar-name">{currentUser?.name ?? 'Atlas User'}</span>
                  {currentUser?.positionTitle && (
                    <span className="topbar__avatar-title">{currentUser.positionTitle}</span>
                  )}
                </span>
                <svg className="topbar__avatar-chev" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m3 4.5 3 3 3-3" />
                </svg>
              </button>

              {userMenuSurface === 'topbar' && (
                <>
                  <div className="topbar__menu-backdrop" onClick={closeUserMenu} />
                  <div className="topbar__user-popover" role="menu">
                    <div className="topbar__user-popover-identity">
                      {looksLikeAvatarUrl(currentUser?.avatarUrl)
                        ? <img className="topbar__user-popover-avatar topbar__user-popover-avatar--photo" src={currentUser.avatarUrl} alt="" />
                        : <div className="topbar__user-popover-avatar">{userInitials || 'AU'}</div>}
                      <div>
                        <strong>{currentUser?.name}</strong>
                        {currentUser?.positionTitle && (
                          <span className="topbar__user-popover-title">{currentUser.positionTitle}</span>
                        )}
                        <span>{currentUser?.unit?.name ?? formatRoleLabel(currentUser?.roleType)}</span>
                      </div>
                    </div>
                    <div className="topbar__user-popover-divider" />
                    <Link
                      className="topbar__user-popover-item"
                      href="/playbook"
                      onClick={closeUserMenu}
                      onFocus={() => prefetchRoute('/playbook')}
                      onMouseEnter={() => prefetchRoute('/playbook')}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="1" width="10" height="12" rx="1" />
                        <path d="M5 4h4M5 7h4M5 10h2" />
                      </svg>
                      {t('Playbook')}
                    </Link>
                    <Link
                      className="topbar__user-popover-item"
                      href="/profile"
                      onClick={closeUserMenu}
                      onFocus={() => prefetchRoute('/profile')}
                      onMouseEnter={() => prefetchRoute('/profile')}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="7" cy="4.5" r="2.5" />
                        <path d="M2.5 12a4.5 4.5 0 0 1 9 0" />
                      </svg>
                      {t('Profile')}
                    </Link>
                    <Link
                      className="topbar__user-popover-item"
                      href="/settings"
                      onClick={closeUserMenu}
                      onFocus={() => prefetchRoute('/settings')}
                      onMouseEnter={() => prefetchRoute('/settings')}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 4.5h7M12 4.5h1.5" />
                        <circle cx="10.5" cy="4.5" r="1.5" />
                        <path d="M2.5 8h3M8 8h5.5" />
                        <circle cx="6.5" cy="8" r="1.5" />
                        <path d="M2.5 11.5h8M13 11.5h.5" />
                        <circle cx="11.5" cy="11.5" r="1.5" />
                      </svg>
                      {t('Settings')}
                    </Link>
                    <div className="topbar__user-popover-divider" />
                    <button
                      className="topbar__user-popover-item"
                      onClick={() => { void loadOverview('refresh'); closeUserMenu() }}
                      type="button"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                        <path d="M12.5 7A5.5 5.5 0 1 1 7 1.5a5.5 5.5 0 0 1 4.5 2.3" />
                        <path d="M10 1.5h3v3" />
                      </svg>
                      {overviewStatus.refreshing ? t('Refreshing…') : t('Refresh data')}
                    </button>
                    <div className="topbar__user-popover-divider" />
                    <button
                      className="topbar__user-popover-item topbar__user-popover-item--danger"
                      onClick={() => { requestLogout(); closeUserMenu() }}
                      type="button"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 7h7M9.5 4.5 12 7l-2.5 2.5" />
                        <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" />
                      </svg>
                      {t('Sign out')}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </header>

        {/* PWA install nudge — self-gating: hanya tampil di phone yang belum
            memasang app & belum di-dismiss. Lihat components/InstallBanner.tsx. */}
        <InstallBanner />

        {/* Home runs flush so its greeting shares the floating cluster's row;
            all pages (incl. Home) reserve the cluster band; Home's greeting then
            sits as a sticky tier BELOW the topbar instead of fused into its row. */}
        <main className="workspace__content">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar (phone ≤640) — navigasi utama jangkauan-jempol.
           4 destinasi inti + "Menu" yang membuka drawer lengkap. Hanya phone. */}
      {viewportPhone ? (
        <nav className="mobile-tabbar" aria-label={t('Main navigation')}>
          {/* Badge bottom-nav HANYA untuk sinyal unread/butuh-aksi. Workboard kini
           * pakai count task overdue/blokir (bukan lagi total antrian katalog yang
           * dulu selalu nyala) → konsisten dgn makna badge di sidebar. Programs
           * tetap 0 (total portofolio = stok, bukan sinyal). 2026-06-26. */}
          {[
            { path: '/',           label: t('Home'),      icon: IconHome,      badge: 0 },
            { path: '/execution',  label: t('Workboard'), icon: IconExecution, badge: tasksCount, urgent: true },
            { path: '/programs',   label: t('Programs'),  icon: IconPrograms,  badge: 0 },
            { path: '/channels',   label: t('Channels'),  icon: IconChannels,  badge: totalUnreadChannels, urgent: true },
          ].map((tab) => {
            const active = activePath === tab.path
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={`mobile-tabbar__item${active ? ' mobile-tabbar__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onMouseEnter={() => prefetchRoute(tab.path)}
              >
                <span className="mobile-tabbar__icon">
                  {tab.icon()}
                  {tab.badge > 0 ? (
                    <span className={`mobile-tabbar__badge${tab.urgent ? ' mobile-tabbar__badge--urgent' : ''}`}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="mobile-tabbar__label">{tab.label}</span>
              </Link>
            )
          })}
          <button
            type="button"
            className={`mobile-tabbar__item${menuSheetOpen ? ' mobile-tabbar__item--active' : ''}`}
            onClick={() => setMenuSheetOpen(true)}
            aria-expanded={menuSheetOpen}
            aria-label={t('Full menu')}
          >
            <span className="mobile-tabbar__icon">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="4" y1="6.5" x2="18" y2="6.5" />
                <line x1="4" y1="11" x2="18" y2="11" />
                <line x1="4" y1="15.5" x2="18" y2="15.5" />
              </svg>
            </span>
            <span className="mobile-tabbar__label">{t('Menu')}</span>
          </button>
        </nav>
      ) : null}

      {/* ── Sign-out confirmation modal ── */}
      {logoutPending && (
        <div className="modal-backdrop" onClick={cancelLogout}>
          <div aria-describedby={logoutDescId} aria-labelledby={logoutTitleId} aria-modal="true" className="modal" ref={logoutDialogRef} role="dialog" style={{ maxWidth: 380 }} tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{t('Session')}</span>
                <h3 className="modal__title" id={logoutTitleId}>{t('Sign out?')}</h3>
                <p className="modal-subtitle" id={logoutDescId}>{t('End the current session and return to the login screen.')}</p>
              </div>
              <button className="modal__close" onClick={cancelLogout} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
                  <path d="m1 1 10 10M11 1 1 11" />
                </svg>
              </button>
            </div>
            <div className="modal__body">
              <div className="modal-helper-note modal-helper-note--danger">
                {t("You'll return to the login screen. Unsaved changes will be lost.")}
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={cancelLogout} type="button">
                {t('Cancel')}
              </button>
              <button
                className="btn btn--primary"
                onClick={() => void handleLogout()}
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                type="button"
              >
                {t('Sign out')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notification toast stack (kanan bawah) ── */}
      {notifToasts.length > 0 && (
        <div className="notif-toast-stack" aria-live="polite" aria-label={t('New notifications')}>
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

      {/* All-menu sheet (phone) — marketplace grid; dibuka hamburger + tab Menu. */}
      {viewportPhone ? (
        <MobileMenuSheet
          open={menuSheetOpen}
          onClose={() => setMenuSheetOpen(false)}
          gates={{ isAdmin, isSuperAdmin, canAccessPerformance }}
          badges={{ channels: totalUnreadChannels, focus: focusBadgeCount, workboard: tasksCount, assignment: assignmentsCount }}
          activePath={activePath}
        />
      ) : null}
    </div>
  )
}
