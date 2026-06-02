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
  '/execution': { id: 'task.new', label: 'New Task', icon: 'Plus' },
  '/penugasan': { id: 'assignment.new', label: 'New Assignment', icon: 'Plus' },
  '/jadwal': { id: 'meeting.new', label: 'New Meeting', icon: 'Plus' },
  '/laporan-bulanan': { id: 'report.new', label: 'New Report', icon: 'Plus' },
  '/performance/scorecard': { id: 'scorecard.export', label: 'Export', icon: 'Download' },
  '/performance/kolegial': { id: 'kolegial.export', label: 'Export', icon: 'Download' },
  '/performance/divisi': { id: 'divisi.export', label: 'Export', icon: 'Download' },
  '/admin/users': { id: 'user.new', label: 'New User', icon: 'Plus' },
  '/admin/orgs': { id: 'org.new', label: 'New Company', icon: 'Plus' },
  '/admin/positions': { id: 'position.new', label: 'New Position', icon: 'Plus' },
  '/admin/roles': { id: 'role.new', label: 'New Role', icon: 'Plus' },
}

export const TOPBAR_ACTION_EVENT = 'atlas:topbar-action'
