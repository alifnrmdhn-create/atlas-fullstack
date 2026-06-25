import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../design-system'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import './InstallGuide.css'

/**
 * InstallGuide — instruksi memasang ATLAS sebagai aplikasi (Add to Home Screen),
 * sadar-platform. Dipakai dua tempat:
 *   - di dalam <InstallSheet> yang dipicu banner mobile (AppShell)
 *   - sebagai konten inline di Settings → Install
 *
 * iOS tidak punya prompt install otomatis (harus manual Share→Add to Home Screen),
 * Android/Chromium punya prompt native. Komponen menampilkan keduanya + tab pemilih
 * agar user bisa lihat instruksi platform lain. Lihat useInstallPrompt.ts.
 */

const ShareIcon = () => (
  <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="16">
    <path d="M12 3v13M12 3l-4 4M12 3l4 4" />
    <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
  </svg>
)
const PlusSquareIcon = () => (
  <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="16">
    <rect height="16" rx="3" width="16" x="4" y="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)
const DotsIcon = () => (
  <svg aria-hidden="true" fill="currentColor" height="16" viewBox="0 0 24 24" width="16">
    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
  </svg>
)

interface Step {
  text: string
  icon?: React.ReactNode
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="install-guide__steps">
      {steps.map((s, i) => (
        <li className="install-guide__step" key={i}>
          <span className="install-guide__step-num">{i + 1}</span>
          <span className="install-guide__step-text">
            {s.text}
            {s.icon && <span className="install-guide__step-icon">{s.icon}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function InstallGuide() {
  const { t } = useTranslation()
  const { platform, isStandalone, canPromptNative, promptInstall } = useInstallPrompt()

  // Tab default = platform terdeteksi (selain desktop/unknown → default iOS).
  const initialTab: 'ios' | 'android' =
    platform === 'android' ? 'android' : 'ios'
  const [tab, setTab] = useState<'ios' | 'android'>(initialTab)
  const [nativeResult, setNativeResult] = useState<'idle' | 'accepted' | 'dismissed'>('idle')

  if (isStandalone) {
    return (
      <div className="install-guide install-guide--done">
        <div className="install-guide__done-mark" aria-hidden="true">
          <svg fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <p className="install-guide__done-text">{t('ATLAS is already installed on this device.')}</p>
      </div>
    )
  }

  const iosSteps: Step[] = [
    { text: t('Open this page in Safari.') },
    { text: t('Tap the Share button.'), icon: <ShareIcon /> },
    { text: t('Scroll and tap "Add to Home Screen".'), icon: <PlusSquareIcon /> },
    { text: t('Tap "Add" in the top-right corner.') },
  ]
  const androidManualSteps: Step[] = [
    { text: t('Open this page in Chrome.') },
    { text: t('Tap the menu (three dots) at the top-right.'), icon: <DotsIcon /> },
    { text: t('Tap "Install app" or "Add to Home screen".'), icon: <PlusSquareIcon /> },
    { text: t('Confirm with "Install".') },
  ]

  const showIosOtherNote = platform === 'ios-other' && tab === 'ios'

  const handleNative = async () => {
    const accepted = await promptInstall()
    setNativeResult(accepted ? 'accepted' : 'dismissed')
  }

  return (
    <div className="install-guide">
      <p className="install-guide__intro">
        {t('Install ATLAS to your home screen for an app-like, full-screen experience.')}
      </p>

      <div className="install-guide__tabs" role="tablist" aria-label={t('Platform')}>
        <button
          className={`install-guide__tab${tab === 'ios' ? ' install-guide__tab--active' : ''}`}
          onClick={() => setTab('ios')} role="tab" aria-selected={tab === 'ios'} type="button"
        >iPhone / iPad</button>
        <button
          className={`install-guide__tab${tab === 'android' ? ' install-guide__tab--active' : ''}`}
          onClick={() => setTab('android')} role="tab" aria-selected={tab === 'android'} type="button"
        >Android</button>
      </div>

      {tab === 'ios' && (
        <div className="install-guide__panel">
          {showIosOtherNote && (
            <p className="install-guide__warn">
              {t('On iPhone, only Safari can add apps to the home screen. Please open this page in Safari first.')}
            </p>
          )}
          <StepList steps={iosSteps} />
        </div>
      )}

      {tab === 'android' && (
        <div className="install-guide__panel">
          {canPromptNative ? (
            <>
              <Button variant="primary" size="md" onClick={handleNative} className="install-guide__cta">
                {t('Install ATLAS')}
              </Button>
              {nativeResult === 'dismissed' && (
                <p className="install-guide__hint">{t('Installation was cancelled. You can install manually with the steps below.')}</p>
              )}
              <p className="install-guide__or">{t('or install manually:')}</p>
              <StepList steps={androidManualSteps} />
            </>
          ) : (
            <StepList steps={androidManualSteps} />
          )}
        </div>
      )}
    </div>
  )
}
