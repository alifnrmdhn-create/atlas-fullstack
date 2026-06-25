import { useCallback, useEffect, useState } from 'react'

/**
 * useInstallPrompt — deteksi kelayakan & cara pemasangan PWA (Add to Home Screen).
 *
 * Tiga jalur instalasi berbeda total:
 *   - Android/Chromium → event `beforeinstallprompt` → prompt native (`promptInstall()`).
 *   - iOS (Safari)     → TIDAK ada prompt; harus manual Share → Add to Home Screen.
 *   - iOS non-Safari   → tidak bisa install sama sekali (Chrome/Firefox iOS pakai
 *                        WebKit tapi tanpa API home-screen) → arahkan buka di Safari.
 *
 * `beforeinstallprompt` ditangkap lebih dulu di app.tsx (boot) karena menembak
 * sekali sebelum komponen mount; hook ini membacanya dari window + event sintetis.
 */

export type InstallPlatform = 'android' | 'ios-safari' | 'ios-other' | 'desktop' | 'unknown'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  // iPadOS 13+ menyamar sebagai Mac — kenali via touch point.
  const isIpadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const isIOS = /iphone|ipad|ipod/i.test(ua) || isIpadOS
  if (isIOS) {
    // Browser non-Safari di iOS membawa token sendiri (CriOS/FxiOS/EdgiOS/OPiOS).
    const isOtherBrowser = /crios|fxios|edgios|opios|mercury/i.test(ua)
    return isOtherBrowser ? 'ios-other' : 'ios-safari'
  }
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mm = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return Boolean(mm || iosStandalone)
}

export interface InstallState {
  /** Sudah dibuka sebagai app terpasang (home screen / standalone). */
  isStandalone: boolean
  /** Platform terdeteksi, menentukan instruksi yang ditampilkan. */
  platform: InstallPlatform
  /** Tersedia prompt install native (Android/Chromium). */
  canPromptNative: boolean
  /** Picu prompt install native; resolve true bila user menerima. */
  promptInstall: () => Promise<boolean>
}

export function useInstallPrompt(): InstallState {
  const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone)
  const [platform] = useState<InstallPlatform>(detectPlatform)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => ((typeof window !== 'undefined'
      ? (window as unknown as { __atlasInstallPrompt?: BeforeInstallPromptEvent }).__atlasInstallPrompt
      : null) ?? null),
  )

  useEffect(() => {
    const onInstallable = () => {
      const e = (window as unknown as { __atlasInstallPrompt?: BeforeInstallPromptEvent }).__atlasInstallPrompt
      setDeferred(e ?? null)
    }
    const onInstalled = () => {
      setDeferred(null)
      setIsStandalone(true)
    }
    window.addEventListener('atlas:installable', onInstallable)
    window.addEventListener('atlas:installed', onInstalled)

    // Sinkron bila display-mode berubah (mis. user baru memasang lalu kembali).
    const mql = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null
    const onModeChange = () => setIsStandalone(detectStandalone())
    mql?.addEventListener?.('change', onModeChange)

    return () => {
      window.removeEventListener('atlas:installable', onInstallable)
      window.removeEventListener('atlas:installed', onInstalled)
      mql?.removeEventListener?.('change', onModeChange)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    // Event hanya bisa dipakai sekali.
    setDeferred(null)
    ;(window as unknown as { __atlasInstallPrompt?: BeforeInstallPromptEvent | null }).__atlasInstallPrompt = null
    return choice.outcome === 'accepted'
  }, [deferred])

  return {
    isStandalone,
    platform,
    canPromptNative: Boolean(deferred),
    promptInstall,
  }
}
