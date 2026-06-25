import type { ReactElement } from 'react'

/**
 * mobile-menu — satu sumber kebenaran untuk navigasi mobile-native:
 *   • Home launcher quick-access grid (HomeMobile)
 *   • "All menu" category grid (MobileMenuSheet)
 *
 * Pola marketplace (Livin/Grab/Shopee): tile ikon berwarna, dikelompokkan per
 * kategori intent, tap target lega. Label = Full English (glossary kanonik),
 * di-translate via `t()` di komponen — di sini simpan natural-key saja.
 *
 * Ikon = garis kustom (currentColor, no emoji — anti "AI slop") seperti
 * PanduanView; accent = palet kategori terkurasi (1 hue per intent, ~level 600
 * Tailwind — kaya tapi tidak neon). Tile menampilkan ikon ber-tint accent di
 * atas chip lembut accent@12%.
 */

const BOX = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

// ── Icon set ────────────────────────────────────────────────────────────────
const Icons: Record<string, () => ReactElement> = {
  home:       () => <svg {...BOX}><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V19a1 1 0 0 0 1 1H10v-5h4v5h3.5a1 1 0 0 0 1-1V9.5" /></svg>,
  focus:      () => <svg {...BOX}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 1.8v2.2M12 20v2.2M22.2 12H20M4 12H1.8" /></svg>,
  workboard:  () => <svg {...BOX}><rect x="3.5" y="4" width="5" height="16" rx="1.2" /><rect x="10" y="4" width="5" height="10" rx="1.2" /><rect x="16.5" y="4" width="5" height="6.5" rx="1.2" /></svg>,
  assignment: () => <svg {...BOX}><path d="M21 11.5 11 21l-6.5-2.5L2 12 12 2l6.5 2.5z" opacity="0" /><path d="M20.5 3.5 11 13" /><path d="M20.5 3.5 14 20.5l-3-7-7-3z" /></svg>,
  programs:   () => <svg {...BOX}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M8 8.5h8M8 12h8M8 15.5h5" /></svg>,
  coordination: () => <svg {...BOX}><rect x="3.5" y="5" width="17" height="15" rx="2.2" /><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" /><path d="M7.5 13h2.5M7.5 16.5h6" /></svg>,
  channels:   () => <svg {...BOX}><path d="M20.5 11.5a7.5 7.5 0 0 1-10.7 6.8L4 19.5l1.3-4.4A7.5 7.5 0 1 1 20.5 11.5z" /><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" /></svg>,
  presence:   () => <svg {...BOX}><circle cx="9" cy="8" r="3.3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M16.5 6.2a3 3 0 0 1 0 5.6M18.5 19.5a5 5 0 0 0-3-4.6" /></svg>,
  scorecard:  () => <svg {...BOX}><path d="M4 20V10M9.5 20V5M15 20v-7M20.5 20V8" /></svg>,
  kpiDir:     () => <svg {...BOX}><path d="M3.5 12a8.5 8.5 0 1 1 8.5 8.5" /><path d="M12 12l5-3.5" /><circle cx="12" cy="12" r="1.6" /></svg>,
  kpiDiv:     () => <svg {...BOX}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v8.5l6 3.5" /></svg>,
  kpiMe:      () => <svg {...BOX}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="m9.5 8 1.7 1.7 3-3.4" opacity="0" /></svg>,
  leaderboard:() => <svg {...BOX}><path d="M8 9a4 4 0 1 0 8 0V3H8z" /><path d="M8 5H5.5v2A3.5 3.5 0 0 0 8 10M16 5h2.5v2A3.5 3.5 0 0 1 16 10M9 21h6M12 13v8" /></svg>,
  executive:  () => <svg {...BOX}><rect x="3.5" y="3.5" width="17" height="13" rx="2" /><path d="M7 21h10M12 16.5V21" /><path d="M7.5 12 10 9l2.5 2 3.5-4" /></svg>,
  analytics:  () => <svg {...BOX}><path d="M4 4v16h16" /><path d="M8 14l3-3 2.5 2.5L20 7" /></svg>,
  profile:    () => <svg {...BOX}><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  settings:   () => <svg {...BOX}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></svg>,
  companies:  () => <svg {...BOX}><path d="M4 20V6.5L11 4v16M11 20h8.5V10L11 7.5" /><path d="M14 11h2.5M14 14h2.5M7 9h1M7 12h1M7 15h1" /></svg>,
  positions:  () => <svg {...BOX}><rect x="9" y="3" width="6" height="4" rx="1" /><rect x="3.5" y="16.5" width="6" height="4" rx="1" /><rect x="14.5" y="16.5" width="6" height="4" rx="1" /><path d="M12 7v4M6.5 16.5V13h11v3.5" /></svg>,
  users:      () => <svg {...BOX}><circle cx="8.5" cy="8" r="3" /><path d="M3 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.5a3 3 0 0 1 0 5.6M16 19a5 5 0 0 0-2.5-4.3" /></svg>,
  roles:      () => <svg {...BOX}><path d="M12 2.5 5 5v5.5c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V5z" /><path d="m9 11.5 2 2 3.5-4" /></svg>,
  pilot:      () => <svg {...BOX}><circle cx="12" cy="12" r="8.5" /><path d="m9 12 2 2 4-4.5" /></svg>,
  thresholds: () => <svg {...BOX}><path d="M5 6h14M5 12h14M5 18h14" /><circle cx="9" cy="6" r="2" fill="var(--ds-bg-card,#fff)" /><circle cx="15" cy="12" r="2" fill="var(--ds-bg-card,#fff)" /><circle cx="8" cy="18" r="2" fill="var(--ds-bg-card,#fff)" /></svg>,
  more:       () => <svg {...BOX}><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>,
}

export type MenuTile = {
  path: string
  /** Natural-key label (English) — di-translate via `t()` di komponen. */
  label: string
  icon: () => ReactElement
  /** Accent hue (hex). Tint chip + warna ikon. */
  accent: string
  /** Badge dinamis opsional — di-resolve di komponen (mis. unread Channels). */
  badgeKey?: 'channels' | 'focus'
}

export type MenuSection = { label: string; items: MenuTile[] }

export type MenuGates = {
  isAdmin: boolean
  isSuperAdmin: boolean
  canAccessPerformance: boolean
}

// Palet accent terkurasi — 1 hue per intent (cool→warm), harmonis, ~Tailwind 600.
const A = {
  brand: '#2E8B4E', amber: '#D97706', sky: '#0284C7', indigo: '#4F46E5',
  violet: '#7C3AED', teal: '#0D9488', blue: '#2563EB', cyan: '#0891B2',
  rose: '#E11D48', emerald: '#059669', slate: '#475569', gray: '#64748B',
  zinc: '#52525B', fuchsia: '#A21CAF',
}

/** Seluruh menu mobile, dikelompokkan per kategori intent & di-gate per role. */
export function buildMobileMenu(g: MenuGates): MenuSection[] {
  const sections: MenuSection[] = []

  sections.push({
    label: 'Today',
    items: [
      { path: '/',      label: 'Home',  icon: Icons.home,  accent: A.brand },
      { path: '/fokus', label: 'Focus', icon: Icons.focus, accent: A.amber, badgeKey: 'focus' },
    ],
  })

  sections.push({
    label: 'Work',
    items: [
      { path: '/execution', label: 'Workboard',    icon: Icons.workboard,    accent: A.sky },
      { path: '/penugasan', label: 'Assignment',   icon: Icons.assignment,   accent: A.indigo },
      { path: '/jadwal',    label: 'Coordination', icon: Icons.coordination, accent: A.teal },
      { path: '/channels',  label: 'Channels',     icon: Icons.channels,     accent: A.blue, badgeKey: 'channels' },
      { path: '/presence',  label: 'Presence',     icon: Icons.presence,     accent: A.cyan },
    ],
  })

  const portfolio: MenuTile[] = [
    { path: '/programs', label: 'Programs', icon: Icons.programs, accent: A.violet },
  ]
  if (g.isSuperAdmin || g.canAccessPerformance) {
    portfolio.push(
      { path: '/performance/scorecard', label: 'Scorecard',     icon: Icons.scorecard, accent: A.rose },
      { path: '/performance/kolegial',  label: 'Directorate KPI', icon: Icons.kpiDir,  accent: A.emerald },
      { path: '/performance/divisi',    label: 'Division KPI',  icon: Icons.kpiDiv,    accent: A.teal },
    )
  }
  if (g.isSuperAdmin) {
    portfolio.push(
      { path: '/executive',            label: 'Executive Summary', icon: Icons.executive, accent: A.indigo },
      { path: '/performance/individu', label: 'Leaderboard',       icon: Icons.leaderboard, accent: A.amber },
      { path: '/performance/me',       label: 'My KPI',            icon: Icons.kpiMe,     accent: A.sky },
    )
  }
  sections.push({
    label: g.isSuperAdmin || g.canAccessPerformance ? 'Portfolio & Performance' : 'Portfolio',
    items: portfolio,
  })

  sections.push({
    label: 'Account',
    items: [
      { path: '/profile',  label: 'Profile',  icon: Icons.profile,  accent: A.slate },
      { path: '/settings', label: 'Settings', icon: Icons.settings, accent: A.gray },
    ],
  })

  if (g.isAdmin) {
    const admin: MenuTile[] = [
      { path: '/admin/orgs',          label: 'Companies',     icon: Icons.companies, accent: A.zinc },
      { path: '/admin/positions',     label: 'Positions',     icon: Icons.positions, accent: A.slate },
      { path: '/admin/users',         label: 'Users',         icon: Icons.users,     accent: A.blue },
      { path: '/admin/roles',         label: 'Roles',         icon: Icons.roles,     accent: A.emerald },
      { path: '/admin/pilot-metrics', label: 'Pilot Metrics', icon: Icons.pilot,     accent: A.fuchsia },
    ]
    if (g.isSuperAdmin) {
      admin.push({ path: '/admin/thresholds', label: 'Thresholds', icon: Icons.thresholds, accent: A.gray })
    }
    sections.push({ label: 'Admin', items: admin })
  }

  return sections
}

export { Icons as MenuIcons }
