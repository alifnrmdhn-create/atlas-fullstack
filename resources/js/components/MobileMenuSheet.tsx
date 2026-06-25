import { useEffect } from 'react'
import { Link } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import { buildMobileMenu, type MenuGates, type MenuTile } from '../lib/mobile-menu'
import '../styles/mobile-native.css'

/**
 * MobileMenuSheet — "All menu" grid kategori (pola marketplace) untuk phone.
 * Menggantikan drawer sidebar-desktop yang lama terasa "desktop dikecilkan".
 * Full-screen sheet slide-up; tile ikon berwarna dikelompokkan per kategori.
 *
 * Single source: `buildMobileMenu()` (sama dengan quick-access grid di Home).
 * Reuse gates dari AppShell (isAdmin/isSuperAdmin/canAccessPerformance).
 */
export type MobileMenuBadges = { channels?: number; focus?: number }

interface Props {
  open: boolean
  onClose: () => void
  gates: MenuGates
  badges?: MobileMenuBadges
  activePath: string
}

export function MobileMenuSheet({ open, onClose, gates, badges, activePath }: Props) {
  const { t } = useTranslation()
  const sections = buildMobileMenu(gates)

  // Esc tutup + lock scroll body saat terbuka.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  const badgeFor = (tile: MenuTile): number => {
    if (tile.badgeKey === 'channels') return badges?.channels ?? 0
    if (tile.badgeKey === 'focus') return badges?.focus ?? 0
    return 0
  }

  return (
    <div className={`mm-sheet${open ? ' mm-sheet--open' : ''}`} aria-hidden={!open}>
      <div className="mm-sheet__scrim" onClick={onClose} aria-hidden="true" />
      <div className="mm-sheet__panel" role="dialog" aria-modal="true" aria-label={t('All menu')}>
        <div className="mm-sheet__handle" aria-hidden="true" />
        <div className="mm-sheet__head">
          <h2 className="mm-sheet__title">{t('All menu')}</h2>
          <button type="button" className="mm-sheet__close" onClick={onClose} aria-label={t('Close menu')}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </button>
        </div>

        <div className="mm-sheet__body">
          {sections.map((section) => (
            <section key={section.label} className="mm-cat">
              <p className="mm-cat__label">{t(section.label)}</p>
              <div className="mm-grid">
                {section.items.map((tile) => {
                  const badge = badgeFor(tile)
                  const active = tile.path === activePath
                  return (
                    <Link
                      key={tile.path}
                      href={tile.path}
                      className={`mm-tile${active ? ' mm-tile--active' : ''}`}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span
                        className="mm-tile__chip"
                        style={{ color: tile.accent, background: `color-mix(in srgb, ${tile.accent} 13%, transparent)` }}
                      >
                        {tile.icon()}
                        {badge > 0 ? <span className="mm-tile__badge">{badge > 99 ? '99+' : badge}</span> : null}
                      </span>
                      <span className="mm-tile__label">{t(tile.label)}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
          <div className="mm-sheet__foot-space" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
