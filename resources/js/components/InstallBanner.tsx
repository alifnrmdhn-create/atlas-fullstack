import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { InstallGuide } from './InstallGuide'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import './InstallGuide.css'

const DISMISS_KEY = 'atlas.installBannerDismissed'

/** InstallSheet — modal (desktop) / bottom-sheet (phone) berisi InstallGuide. */
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className="install-sheet__scrim" onClick={onClose} aria-hidden="true" />
      <div className="install-sheet__panel" role="dialog" aria-modal="true" aria-label={t('Install ATLAS')}>
        <div className="install-sheet__head">
          <h2 className="install-sheet__title">{t('Install ATLAS')}</h2>
          <button className="install-sheet__close" onClick={onClose} type="button" aria-label={t('Close')}>
            <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="install-sheet__body">
          <InstallGuide />
        </div>
      </div>
    </>,
    document.body,
  )
}

/**
 * InstallBanner — nudge dismissible di shell, HANYA di phone yang belum memasang
 * app. Membuka InstallSheet saat ditekan. Di-render di AppShell.
 */
export function InstallBanner() {
  const { t } = useTranslation()
  const { platform, isStandalone } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === 'true' } catch { return false }
  })
  const [sheetOpen, setSheetOpen] = useState(false)

  const isPhonePlatform = platform === 'android' || platform === 'ios-safari' || platform === 'ios-other'
  const visible = isPhonePlatform && !isStandalone && !dismissed

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* noop */ }
  }

  if (!visible) return <InstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />

  return (
    <>
      <div className="install-banner" role="region" aria-label={t('Install ATLAS')}>
        <span className="install-banner__icon" aria-hidden="true">
          <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
            <rect height="18" rx="3" width="12" x="6" y="3" /><path d="M11 18h2" />
          </svg>
        </span>
        <span className="install-banner__text">
          <span className="install-banner__title">{t('Install ATLAS')}</span>
          <span className="install-banner__sub">{t('Add to your home screen for quick, full-screen access.')}</span>
        </span>
        <button className="install-banner__cta" onClick={() => setSheetOpen(true)} type="button">{t('Install')}</button>
        <button className="install-banner__dismiss" onClick={dismiss} type="button" aria-label={t('Dismiss')}>
          <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <InstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
