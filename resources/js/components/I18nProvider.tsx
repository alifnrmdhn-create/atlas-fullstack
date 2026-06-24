import { useEffect, useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'

import i18n from '../lib/i18n'

/**
 * Wraps the whole app so useTranslation() works everywhere AND so that every
 * component re-renders when the language flips — including those that read
 * labels from plain helper functions (lib/programStatus.ts, lib/nav-config.ts)
 * which call i18n.t() outside of any hook and would otherwise not react.
 *
 * The counter bump forces a re-render of the entire subtree on each
 * 'languageChanged'. We deliberately re-render rather than remount (no key
 * swap) so page-local state — scroll, form drafts, open panels — survives a
 * language toggle.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [, bump] = useState(0)

  useEffect(() => {
    const onChange = () => bump((n) => n + 1)
    i18n.on('languageChanged', onChange)
    return () => {
      i18n.off('languageChanged', onChange)
    }
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
