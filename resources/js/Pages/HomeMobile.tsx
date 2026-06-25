import { Link } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../hooks/useWorkspace'
import { useAuth } from '../hooks/useAuth'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { buildMobileMenu, type MenuTile } from '../lib/mobile-menu'
import '../styles/mobile-native.css'

/** Buka All-menu sheet milik AppShell (satu sumber) — bukan mount sheet sendiri. */
const openAllMenu = () => window.dispatchEvent(new CustomEvent('atlas:open-menu'))

/* Subset struktural dari ScorecardSnapshot (type lokal HomeView) — hanya field
   yang dipakai launcher. Diteruskan apa adanya dari HomeView. */
type ScorecardLite = {
  totalItem: number
  avgItem: number
  ownItem?: { nilai: number } | null
}
interface Props { scorecard: ScorecardLite }

/* Salam menurut jam lokal — runtime FE (bukan workflow), `new Date()` aman. */
function greetingKey(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Good morning'
  if (h < 15) return 'Good afternoon'
  if (h < 19) return 'Good evening'
  return 'Good night'
}
function firstName(name?: string): string {
  if (!name) return ''
  return name.trim().split(/\s+/)[0]
}
function scoreTone(v: number): 'green' | 'amber' | 'red' {
  if (v >= 100) return 'green'
  if (v >= 90) return 'amber'
  return 'red'
}

/**
 * HomeMobile — Home launcher mobile-native (≤640) ala marketplace.
 * Render oleh HomeView saat phone; DESKTOP tetap dashboard kokpit.
 * Membaca payload yang SUDAH ada (programSummary + scorecardSnapshot) — nol
 * perubahan server, nol angka baru. Komponen ini hanya MENAMPILKAN.
 */
export default function HomeMobile({ scorecard }: Props) {
  const { t } = useTranslation()
  const { currentUser, programSummary, totalUnreadChannels } = useWorkspace()
  const auth = useAuth()
  const navigate = useInertiaNavigate()

  const isSuperAdmin = (currentUser?.roleType ?? '').toUpperCase() === 'SUPERADMIN'
  const isAdmin = ['superadmin', 'admin'].includes((currentUser?.roleType ?? '').toLowerCase())
  const canAccessPerformance = isSuperAdmin || (auth?.canAccessPerformance ?? false)
  const gates = { isAdmin, isSuperAdmin, canAccessPerformance }

  const summary = programSummary?.summary
  const needsAction = Array.isArray(programSummary?.needsAction) ? programSummary!.needsAction : []
  const deadlineClusters = Array.isArray(programSummary?.deadlineClusters) ? programSummary!.deadlineClusters : []

  const tlm = (summary?.terlambat ?? 0) + (summary?.overdue ?? 0)
  const hasKpi = canAccessPerformance && (scorecard.totalItem > 0 || scorecard.ownItem != null)
  const kpiHeadline = scorecard.ownItem?.nilai ?? scorecard.avgItem

  // Quick-access: 7 tile utama lintas-kategori + tile "All menu".
  const quick: MenuTile[] = buildMobileMenu(gates).flatMap(s => s.items)
  const QUICK_PATHS = ['/fokus', '/execution', '/penugasan', '/programs', '/jadwal', '/channels', '/presence']
  const quickTiles = QUICK_PATHS.map(p => quick.find(q => q.path === p)).filter(Boolean) as MenuTile[]

  // Buka command palette (⌘K) lewat event yang didengar AppShell.
  const openSearch = () => window.dispatchEvent(new CustomEvent('atlas:open-palette'))

  const greetName = firstName(currentUser?.name)
  const subtitle = currentUser?.positionTitle || currentUser?.directorate?.name || currentUser?.unit?.name || ''
  const initials = greetName ? greetName.slice(0, 1).toUpperCase() : 'A'

  return (
    <div className="hm">
      {/* ── Header: salam + avatar + search pill ───────────────────────── */}
      <header className="hm__head">
        <div className="hm__greet">
          <p className="hm__greet-hi">{t(greetingKey())}{greetName ? ',' : ''}</p>
          <p className="hm__greet-name">{greetName || t('Welcome')}</p>
          {subtitle ? <p className="hm__greet-sub">{subtitle}</p> : null}
        </div>
        <Link href="/profile" className="hm__avatar" aria-label={t('Profile')}>
          {currentUser?.avatarUrl
            ? <img src={currentUser.avatarUrl} alt="" />
            : <span>{initials}</span>}
        </Link>
      </header>

      <button type="button" className="hm__search" onClick={openSearch}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="9" cy="9" r="6" /><path d="m17 17-3.2-3.2" />
        </svg>
        <span>{t('Search programs, tasks…')}</span>
      </button>

      {/* ── Status strip: ringkasan portofolio (horizontal-scroll) ──────── */}
      {summary ? (
        <div className="hm__strip" role="list" aria-label={t('Portfolio status')}>
          <StatCard tone="green" n={summary.onTrack} label={t('On Track')} href="/programs?status=on_track" />
          <StatCard tone="amber" n={summary.atRisk} label={t('At Risk')} href="/programs?status=at_risk" />
          <StatCard tone="red" n={tlm} label={t('Delayed')} href="/programs?status=terlambat" />
          {hasKpi
            ? <StatCard tone={scoreTone(kpiHeadline)} n={Math.round(kpiHeadline)} suffix="%" label={t('KPI Score')} href="/performance/scorecard" />
            : <StatCard tone="neutral" n={summary.selesai} label={t('Completed')} href="/programs?completed=1" />}
        </div>
      ) : null}

      {/* ── Quick-access menu grid (marketplace) ───────────────────────── */}
      <section className="hm__sect">
        <div className="hm__sect-head">
          <h2 className="hm__sect-title">{t('Quick access')}</h2>
          <button type="button" className="hm__sect-more" onClick={openAllMenu}>{t('All menu')}</button>
        </div>
        <div className="mm-grid mm-grid--quick">
          {quickTiles.map((tile) => {
            const badge = tile.badgeKey === 'channels' ? totalUnreadChannels : 0
            return (
              <Link key={tile.path} href={tile.path} className="mm-tile">
                <span className="mm-tile__chip" style={{ color: tile.accent, background: `color-mix(in srgb, ${tile.accent} 13%, transparent)` }}>
                  {tile.icon()}
                  {badge > 0 ? <span className="mm-tile__badge">{badge > 99 ? '99+' : badge}</span> : null}
                </span>
                <span className="mm-tile__label">{t(tile.label)}</span>
              </Link>
            )
          })}
          <button type="button" className="mm-tile" onClick={openAllMenu}>
            <span className="mm-tile__chip mm-tile__chip--more">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="5.5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18.5" cy="12" r="1.5" />
              </svg>
            </span>
            <span className="mm-tile__label">{t('All menu')}</span>
          </button>
        </div>
      </section>

      {/* ── Needs your decision ─────────────────────────────────────────── */}
      {needsAction.length > 0 ? (
        <section className="hm__sect">
          <div className="hm__sect-head">
            <h2 className="hm__sect-title">{t('Needs your decision')}</h2>
            <Link href="/fokus" className="hm__sect-more">{t('See all')}</Link>
          </div>
          <div className="hm__feed">
            {needsAction.slice(0, 4).map((item) => (
              <button key={item.id} type="button" className="hm__row" onClick={() => navigate('/fokus')}>
                <span className={`hm__row-tag hm__row-tag--${item.tag}`}>{t(item.tag === 'approval' ? 'Approval' : item.tag === 'blocker' ? 'Blocker' : 'Support')}</span>
                <span className="hm__row-main">
                  <span className="hm__row-title">{item.name}</span>
                  <span className="hm__row-sub">{item.reason}{item.divisi ? ` · ${item.divisi}` : ''}</span>
                </span>
                <svg className="hm__row-chev" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m7.5 4 6 6-6 6" /></svg>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Critical deadlines ──────────────────────────────────────────── */}
      {deadlineClusters.length > 0 ? (
        <section className="hm__sect">
          <div className="hm__sect-head">
            <h2 className="hm__sect-title">{t('Critical deadlines')}</h2>
            <Link href="/programs" className="hm__sect-more">{t('See all')}</Link>
          </div>
          <div className="hm__feed">
            {deadlineClusters.slice(0, 5).map((c, i) => (
              <Link key={i} href="/programs" className="hm__row hm__row--deadline">
                <span className={`hm__dl-dot${c.atRisk > 0 ? ' hm__dl-dot--hot' : ''}`} aria-hidden="true" />
                <span className="hm__row-main">
                  <span className="hm__row-title">{c.label}</span>
                  <span className="hm__row-sub">{t('{{count}} programs', { count: c.total })}{c.atRisk > 0 ? ` · ${t('{{count}} at risk', { count: c.atRisk })}` : ''}</span>
                </span>
                <span className="hm__dl-count">{c.total}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="hm__bottom-space" aria-hidden="true" />
    </div>
  )
}

function StatCard({ tone, n, suffix, label, href }: { tone: string; n: number; suffix?: string; label: string; href: string }) {
  return (
    <Link href={href} className={`hm__stat hm__stat--${tone}`} role="listitem">
      <span className="hm__stat-n">{n}{suffix ? <span className="hm__stat-suffix">{suffix}</span> : null}</span>
      <span className="hm__stat-label">{label}</span>
    </Link>
  )
}
