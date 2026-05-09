export type ResolvedTheme = 'light' | 'dark'
export type ThemePreference = ResolvedTheme | 'system'

export const THEME_STORAGE_KEY = 'atlas.theme'
export const THEME_ATTRIBUTE = 'data-theme'
export const THEME_PREFERENCE_ATTRIBUTE = 'data-theme-preference'
export const THEME_CHANGE_EVENT = 'atlas:themechange'

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

type ThemeSnapshot = {
  preference: ThemePreference
  resolved: ResolvedTheme
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

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function getSystemTheme(): ResolvedTheme {
  if (!canUseDom() || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light'
}

export function resolveThemePreference(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference
}

export function getStoredThemePreference(): ThemePreference {
  const stored = safeLocalStorage()?.getItem(THEME_STORAGE_KEY)
  return isThemePreference(stored) ? stored : 'system'
}

function getResolvedThemeFromDom(root: HTMLElement): ResolvedTheme | null {
  const value = root.getAttribute(THEME_ATTRIBUTE)
  return value === 'light' || value === 'dark' ? value : null
}

function updateThemeColorMeta(_resolved: ResolvedTheme) {
  if (!canUseDom()) return
  const meta = document.querySelector('meta[name="theme-color"]')
  const root = document.documentElement
  const computed = window.getComputedStyle(root).getPropertyValue('--app-bg').trim()
  if (computed) meta?.setAttribute('content', computed)
}

function dispatchThemeChange(snapshot: ThemeSnapshot) {
  if (!canUseDom()) return
  window.dispatchEvent(new CustomEvent<ThemeSnapshot>(THEME_CHANGE_EVENT, { detail: snapshot }))
}

/* Coordinate global theme transition: while the swap happens, every
 * element animates at the same duration/easing (160ms cubic-bezier).
 * The CSS rule .theme-transitioning * { transition: ... !important }
 * activates only while this class is on <html>. Class auto-removed
 * after 180ms — normal per-element transitions resume for hover. */
const THEME_TRANSITIONING_CLASS = 'theme-transitioning'
const THEME_TRANSITION_DURATION_MS = 180
let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined

function scheduleThemeTransition(root: HTMLElement) {
  if (!canUseDom()) return
  root.classList.add(THEME_TRANSITIONING_CLASS)
  if (themeTransitionTimer !== undefined) clearTimeout(themeTransitionTimer)
  themeTransitionTimer = setTimeout(() => {
    root.classList.remove(THEME_TRANSITIONING_CLASS)
    themeTransitionTimer = undefined
  }, THEME_TRANSITION_DURATION_MS)
}

export function getThemeSnapshot(root: HTMLElement = document.documentElement): ThemeSnapshot {
  const preferenceAttr = root.getAttribute(THEME_PREFERENCE_ATTRIBUTE)
  const preference = isThemePreference(preferenceAttr) ? preferenceAttr : getStoredThemePreference()
  const resolved = getResolvedThemeFromDom(root) ?? resolveThemePreference(preference)
  return { preference, resolved }
}

export function applyThemePreference(
  preference: ThemePreference,
  options?: { persist?: boolean; dispatch?: boolean; root?: HTMLElement },
): ThemeSnapshot {
  const root = options?.root ?? document.documentElement
  const resolved = resolveThemePreference(preference)
  const snapshot = { preference, resolved }

  /* Schedule unified transition BEFORE attribute swap. Skip on hydration
   * (dispatch: false) — page load shouldn't animate from a non-existent
   * previous state. */
  if (options?.dispatch !== false) {
    scheduleThemeTransition(root)
  }

  root.setAttribute(THEME_ATTRIBUTE, resolved)
  root.setAttribute(THEME_PREFERENCE_ATTRIBUTE, preference)
  root.style.colorScheme = resolved
  updateThemeColorMeta(resolved)

  if (options?.persist !== false) {
    safeLocalStorage()?.setItem(THEME_STORAGE_KEY, preference)
  }

  if (options?.dispatch !== false) {
    dispatchThemeChange(snapshot)
  }

  return snapshot
}

export function hydrateThemePreference(): ThemeSnapshot {
  return applyThemePreference(getStoredThemePreference(), { persist: false, dispatch: false })
}

export function subscribeThemeChange(listener: (snapshot: ThemeSnapshot) => void) {
  if (!canUseDom()) return () => {}

  const media = typeof window.matchMedia === 'function' ? window.matchMedia(SYSTEM_THEME_QUERY) : null
  const handleThemeEvent = (event: Event) => {
    const snapshot = (event as CustomEvent<ThemeSnapshot>).detail ?? getThemeSnapshot()
    listener(snapshot)
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyThemePreference(getStoredThemePreference(), { persist: false })
    }
  }
  const handleMedia = () => {
    if (getStoredThemePreference() === 'system') {
      applyThemePreference('system', { persist: false })
    }
  }

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeEvent)
  window.addEventListener('storage', handleStorage)

  if (media) {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', handleMedia)
    else if (typeof media.addListener === 'function') media.addListener(handleMedia)
  }

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeEvent)
    window.removeEventListener('storage', handleStorage)
    if (media) {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', handleMedia)
      else if (typeof media.removeListener === 'function') media.removeListener(handleMedia)
    }
  }
}
