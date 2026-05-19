/* Central navigation config — single source of truth for shell consumers
 * (breadcrumb dropdown, command palette, future rail in M5, context panel
 * resolver in M6).
 *
 * Sidebar in AppShell.tsx still keeps its own NavItem palette because it
 * has icons, badges, and role-aware filtering. M4 intentionally does NOT
 * fold those in — that refactor lands in M5 alongside the rail rebuild.
 */

export type NavItem = {
  path: string
  label: string
}

export type NavSection = {
  label: string
  items: NavItem[]
}

/** Sections mirror the sidebar's PDCA grouping. Order matters — used as
 *  display order in palette and breadcrumb dropdown. */
export const NAV_SECTIONS: NavSection[] = [
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
      { path: '/penugasan', label: 'Assignment' },
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
  // NOTE: grup "Pelaporan" dihilangkan dari Command Palette + breadcrumb
  // dropdown per permintaan user 2026-05-10. Sinkron dengan sidebar
  // (lihat AppShell.tsx navGroups). Halaman tetap hidup via direct URL,
  // notif deep-link, dan link di /reports analytics panel.
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

/** Collapse nested routes (e.g., /programs/42, /execution/tasks/5) to the
 *  top-level path that owns them. Mirrors the logic AppShell uses for its
 *  sidebar active state. */
export function normalizeNavPath(pathname: string): string {
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

export function findActiveSection(activePath: string): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.path === activePath))
}

export function findActiveItem(activePath: string): NavItem | undefined {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((i) => i.path === activePath)
    if (item) return item
  }
  return undefined
}
