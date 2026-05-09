/* Topbar action configuration — adaptive contextual button per route.
 *
 * Nav data (sections, items, normalizer) lives in lib/nav-config.ts now.
 *
 * Pages opt-in to handle actions by listening for TOPBAR_ACTION_EVENT:
 *   useEffect(() => {
 *     const handler = (e: CustomEvent<{ id: string; page: string }>) => {
 *       if (e.detail.id === 'program.new') openCreateModal()
 *     }
 *     window.addEventListener('atlas:topbar-action', handler as EventListener)
 *     return () => window.removeEventListener('atlas:topbar-action', handler as EventListener)
 *   }, [])
 *
 * Both the topbar action button and the command palette dispatch this
 * same event, so a single page-level listener serves both entry points.
 */

export type TopbarAction = {
  id: string
  label: string
  /** Optional href — when set, the button is a Link instead of dispatching an event. */
  href?: string
  /** Optional icon name from Lucide. */
  icon?: 'Plus' | 'Download' | 'Share2' | 'Filter'
}

/** Map active route → contextual action.
 *
 * NOTE: Pages can also render their own primary CTA in their page header
 * (e.g., ProgramsView). When a page owns its CTA, omit the route here. */
export const TOPBAR_ACTIONS: Record<string, TopbarAction> = {
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

export const TOPBAR_ACTION_EVENT = 'atlas:topbar-action'
