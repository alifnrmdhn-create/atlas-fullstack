/**
 * i18next initialisation. Imported once for its side effect (app.tsx).
 *
 * Natural-key model: the source English string IS the key. We therefore turn
 * OFF key/namespace separators so keys may freely contain '.', ':' and other
 * punctuation found in real UI copy. Missing key → returns the key itself
 * (= the English text), which is exactly the behaviour we want for 'en' and
 * for not-yet-translated strings in 'id'.
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import id from '../locales/id.json'
import { getStoredLocale, subscribeLocaleChange } from './locale'

const debug =
  typeof window !== 'undefined' && window.location?.search?.includes('i18ndebug')

i18next.use(initReactI18next).init({
  lng: getStoredLocale(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'id'],
  resources: {
    id: { translation: id },
  },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  returnEmptyString: false,
  debug,
  saveMissing: debug, // fires the 'missingKey' event below; no backend write
})

// Bridge: when the locale preference changes (switcher, another tab, boot),
// flip i18next's active language. locale.ts stays ignorant of i18next.
subscribeLocaleChange(({ locale }) => {
  if (i18next.language !== locale) {
    void i18next.changeLanguage(locale)
  }
})

if (debug) {
  i18next.on('missingKey', (_lngs, _ns, key) => {
    // eslint-disable-next-line no-console
    console.warn('[i18n] missing key:', key)
  })
}

export default i18next
