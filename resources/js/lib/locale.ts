/**
 * Locale preference singleton — mirrors lib/theme.ts almost exactly.
 *
 * Responsibilities here are intentionally narrow: read/write the stored
 * preference, reflect it onto <html lang>, and broadcast a change event.
 * It knows NOTHING about i18next — that decoupling avoids a circular import
 * (i18n.ts imports getStoredLocale here; it also subscribes to the change
 * event and calls i18n.changeLanguage). See lib/i18n.ts.
 */

export type AppLocale = 'en' | 'id'

export const LOCALE_STORAGE_KEY = 'atlas.locale'
export const LOCALE_CHANGE_EVENT = 'atlas:localechange'

/** Default for first-time visitors. EN keeps parity with the pre-i18n baseline. */
export const DEFAULT_LOCALE: AppLocale = 'en'

export const SUPPORTED_LOCALES: AppLocale[] = ['en', 'id']

type LocaleSnapshot = {
  locale: AppLocale
}

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function safeLocalStorage(): Storage | null {
  if (!canUseDom()) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === 'en' || value === 'id'
}

export function getStoredLocale(): AppLocale {
  const stored = safeLocalStorage()?.getItem(LOCALE_STORAGE_KEY)
  return isAppLocale(stored) ? stored : DEFAULT_LOCALE
}

function dispatchLocaleChange(snapshot: LocaleSnapshot) {
  if (!canUseDom()) return
  window.dispatchEvent(new CustomEvent<LocaleSnapshot>(LOCALE_CHANGE_EVENT, { detail: snapshot }))
}

export function applyLocale(
  locale: AppLocale,
  options?: { persist?: boolean; dispatch?: boolean },
): LocaleSnapshot {
  const snapshot = { locale }

  if (canUseDom()) {
    document.documentElement.setAttribute('lang', locale)
  }

  if (options?.persist !== false) {
    safeLocalStorage()?.setItem(LOCALE_STORAGE_KEY, locale)
  }

  if (options?.dispatch !== false) {
    dispatchLocaleChange(snapshot)
  }

  return snapshot
}

/** Apply the stored preference without persisting or animating — used at boot. */
export function hydrateLocale(): LocaleSnapshot {
  return applyLocale(getStoredLocale(), { persist: false, dispatch: false })
}

export function subscribeLocaleChange(listener: (snapshot: LocaleSnapshot) => void) {
  if (!canUseDom()) return () => {}

  const handleLocaleEvent = (event: Event) => {
    const snapshot = (event as CustomEvent<LocaleSnapshot>).detail ?? { locale: getStoredLocale() }
    listener(snapshot)
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY) {
      applyLocale(getStoredLocale(), { persist: false })
    }
  }

  window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleEvent)
  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleEvent)
    window.removeEventListener('storage', handleStorage)
  }
}
