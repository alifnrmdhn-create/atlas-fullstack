import { useEffect, useState } from 'react'

import { applyLocale, getStoredLocale, subscribeLocaleChange, type AppLocale } from './locale'

/**
 * Reactive locale preference hook for the switcher UI. Mirrors useDarkMode.
 * Returns the current locale and a setter that persists + broadcasts it.
 */
export function useLocale(): [AppLocale, (locale: AppLocale) => void] {
  const [locale, setLocale] = useState<AppLocale>(() => getStoredLocale())

  useEffect(() => subscribeLocaleChange((snapshot) => setLocale(snapshot.locale)), [])

  return [locale, (next) => void applyLocale(next)]
}
