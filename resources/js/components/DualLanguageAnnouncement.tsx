import { useState } from 'react'
import { usePage, router } from '@inertiajs/react'

import { api } from '../lib/api'

/**
 * One-time welcome modal announcing the new Bahasa Indonesia / English language
 * switcher. Shown once per user on the Home page, then never again.
 *
 * "Once" is enforced two ways:
 *  - DB (durable, cross-device): reuses the existing User.toursCompleted
 *    mechanism via POST /users/me/tours-completed with this announcement id.
 *    On the next page load auth.user.toursCompleted carries the flag, so it
 *    won't re-appear on any device.
 *  - localStorage (immediate): guards against a re-show within the same session
 *    before a full reload refreshes the Inertia auth props.
 *
 * Copy is intentionally in Bahasa Indonesia (not i18n-wrapped): the whole point
 * is to tell English-mode users, in Indonesian, that the Indonesian option now
 * exists.
 */
const ANNOUNCE_ID = 'announce-dual-language'
const LS_KEY = 'atlas.announce.dualLanguage'

type AuthUser = { toursCompleted?: Record<string, string> | null }

export function DualLanguageAnnouncement() {
  const { auth } = usePage<{ auth?: { user?: AuthUser | null } }>().props

  const completedInDb = !!auth?.user?.toursCompleted?.[ANNOUNCE_ID]
  const dismissedLocal =
    typeof window !== 'undefined' && window.localStorage.getItem(LS_KEY) === '1'

  const [open, setOpen] = useState(() => !completedInDb && !dismissedLocal)

  if (!open) return null

  const dismiss = (goToSettings: boolean) => {
    setOpen(false)
    try {
      window.localStorage.setItem(LS_KEY, '1')
    } catch {
      /* ignore quota/availability errors — DB flag below is the durable guard */
    }
    // Persist per-user so it never shows again on any device. Fire-and-forget;
    // a failed write just means it may show once more on the next device.
    void api.post('/users/me/tours-completed', { tourId: ANNOUNCE_ID }).catch(() => {})
    if (goToSettings) router.visit('/settings')
  }

  return (
    <div className="modal-backdrop" onClick={() => dismiss(false)}>
      <div
        aria-labelledby="dual-lang-title"
        aria-describedby="dual-lang-desc"
        aria-modal="true"
        className="modal"
        role="dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal__header">
          <div className="modal-headcopy">
            <span className="modal-kicker">Baru</span>
            <h3 className="modal__title" id="dual-lang-title">
              Kini Tersedia dalam Dua Bahasa
            </h3>
            <p className="modal-subtitle" id="dual-lang-desc">
              ATLAS sekarang mendukung Bahasa Indonesia, bukan hanya Bahasa Inggris.
              Anda bisa berpindah bahasa kapan saja sesuai kenyamanan.
            </p>
          </div>
          <button
            aria-label="Tutup"
            className="modal__close"
            onClick={() => dismiss(false)}
            type="button"
          >
            <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
              <path d="m1 1 10 10M11 1 1 11" />
            </svg>
          </button>
        </div>

        <div className="modal__body">
          <div className="dual-lang-announce__hero" aria-hidden="true">
            <svg fill="none" height="34" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="34">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M2.5 12h19M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5Z" />
            </svg>
          </div>

          <p className="dual-lang-announce__lead">
            Untuk beralih ke <strong>Bahasa Indonesia</strong>, buka:
          </p>
          <p className="dual-lang-announce__path">
            <strong>Pengaturan</strong> (Settings) → <strong>Tampilan</strong> (Appearance) → <strong>Bahasa</strong> (Language) → pilih <strong>Bahasa Indonesia</strong>.
          </p>
          <p className="dual-lang-announce__note">
            Pilihan Anda tersimpan otomatis di perangkat ini. Pesan ini hanya muncul satu kali.
          </p>
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={() => dismiss(false)} type="button">
            Nanti saja
          </button>
          <button className="btn btn--primary" onClick={() => dismiss(true)} type="button">
            Buka Pengaturan
          </button>
        </div>
      </div>
    </div>
  )
}
