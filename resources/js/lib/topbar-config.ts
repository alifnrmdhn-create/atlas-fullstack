/* Topbar configuration — adaptive per route.
 *
 * Each route can define:
 *   - action: contextual button rendered to the right of the search field.
 *     Implemented as a custom DOM event so pages can opt-in to handle it
 *     without AppShell importing any page-level state. If no page listens,
 *     the button still renders (visual proof of route-awareness) but does
 *     nothing — pages will be wired progressively.
 *
 * Quick-jump destinations are grouped by section, mirroring sidebar
 * structure. Used by the breadcrumb dropdown.
 */

export type TopbarAction = {
  id: string
  label: string
  /** Optional href — when set, the button is a Link instead of dispatching an event. */
  href?: string
  /** Optional icon name from Lucide (e.g., "Plus", "Download"). */
  icon?: 'Plus' | 'Download' | 'Share2' | 'Filter'
}

/** Map active route → contextual action. */
export const TOPBAR_ACTIONS: Record<string, TopbarAction> = {
  '/programs': { id: 'program.new', label: 'Program Baru', icon: 'Plus' },
  '/execution': { id: 'task.new', label: 'Task Baru', icon: 'Plus' },
  '/penugasan': { id: 'assignment.new', label: 'Penugasan Baru', icon: 'Plus' },
  '/jadwal': { id: 'meeting.new', label: 'Rapat Baru', icon: 'Plus' },
  '/laporan-bulanan': { id: 'report.new', label: 'Laporan Baru', icon: 'Plus' },
  '/performance/scorecard': { id: 'scorecard.export', label: 'Ekspor', icon: 'Download' },
  '/performance/kolegial': { id: 'kolegial.export', label: 'Ekspor', icon: 'Download' },
  '/performance/divisi': { id: 'divisi.export', label: 'Ekspor', icon: 'Download' },
  '/admin/users': { id: 'user.new', label: 'User Baru', icon: 'Plus' },
  '/admin/orgs': { id: 'org.new', label: 'Organisasi Baru', icon: 'Plus' },
  '/admin/positions': { id: 'position.new', label: 'Posisi Baru', icon: 'Plus' },
  '/admin/roles': { id: 'role.new', label: 'Role Baru', icon: 'Plus' },
}

export type QuickJumpItem = {
  path: string
  label: string
}

export type QuickJumpSection = {
  label: string
  items: QuickJumpItem[]
}

/** Sidebar-aligned quick-jump groups for breadcrumb dropdown. */
export const QUICK_JUMP_SECTIONS: QuickJumpSection[] = [
  {
    label: 'Today',
    items: [
      { path: '/', label: 'Home' },
      { path: '/fokus', label: 'Focus' },
    ],
  },
  {
    label: 'Perencanaan',
    items: [{ path: '/programs', label: 'Programs' }],
  },
  {
    label: 'Eksekusi',
    items: [
      { path: '/execution', label: 'Execution' },
      { path: '/penugasan', label: 'Penugasan' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { path: '/performance/scorecard', label: 'Scorecard' },
      { path: '/performance/kolegial', label: 'KPI Direktorat' },
      { path: '/performance/divisi', label: 'KPI Divisi' },
      { path: '/performance/me', label: 'KPI Saya' },
    ],
  },
  {
    label: 'Pelaporan',
    items: [
      { path: '/laporan-bulanan', label: 'Laporan Bulanan' },
      { path: '/laporan-risiko', label: 'Laporan Risiko' },
      { path: '/reports', label: 'Analytics' },
    ],
  },
  {
    label: 'Tindak Lanjut',
    items: [{ path: '/jadwal', label: 'Rapat Koordinasi' }],
  },
  {
    label: 'Komunikasi',
    items: [
      { path: '/channels', label: 'Channels' },
      { path: '/search', label: 'Search' },
    ],
  },
  {
    label: 'Akun',
    items: [
      { path: '/presence', label: 'Presence' },
      { path: '/profile', label: 'Profile' },
      { path: '/settings', label: 'Settings' },
    ],
  },
]

/**
 * Custom event name dispatched when contextual action is clicked.
 * Pages can listen via:
 *   useEffect(() => {
 *     const handler = (e: CustomEvent<{ id: string }>) => {
 *       if (e.detail.id === 'program.new') openCreateModal()
 *     }
 *     window.addEventListener('atlas:topbar-action', handler as EventListener)
 *     return () => window.removeEventListener('atlas:topbar-action', handler as EventListener)
 *   }, [])
 */
export const TOPBAR_ACTION_EVENT = 'atlas:topbar-action'
