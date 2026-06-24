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
 * KONVENSI (2026-06-25): KOSONG dengan sengaja. Setiap halaman MEMILIKI CTA-nya
 * sendiri di page header/toolbar (pola "page owns its CTA", lihat ProgramsView /
 * WorkboardView / AssignmentsView / ScheduleView). Tombol kontekstual yang
 * persistent di topbar terasa lepas dari konten — itulah cacat desain yang
 * dibereskan di sini. Sebelumnya peta ini juga menampung:
 *   - create (penugasan/jadwal/laporan/admin): sebagian besar MATI (tak ada
 *     listener) atau ganda dengan tombol in-page → dipindah/dihapus.
 *   - performance export (scorecard/kolegial/divisi): MATI total (tak pernah
 *     ada handler `*.export`) → dihapus. Bila export dibutuhkan, render tombol
 *     in-page yang benar-benar tersambung, jangan kembalikan ke topbar.
 *
 * Jangan tambah entri baru di sini tanpa alasan kuat — default = page owns CTA. */
export const TOPBAR_ACTIONS: Record<string, TopbarAction> = {}

export const TOPBAR_ACTION_EVENT = 'atlas:topbar-action'
