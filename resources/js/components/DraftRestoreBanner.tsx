/**
 * Sprint 6 — Banner pemulihan draf.
 *
 * Muncul sekali saat form mount kalau ada draft tersimpan (server atau
 * sessionStorage). Tidak auto-merge ke form — user explicit: "Pulihkan" atau
 * "Buang draf". Banner dismiss tidak menghapus draft (user masih bisa restore
 * di interaksi berikutnya — draft tetap di server sampai TTL).
 *
 * Undo discard: tombol "Buang" tidak langsung hapus. Countdown 5 detik muncul
 * dengan progress bar; user bisa klik "Urungkan" untuk batal. Setelah 5 detik
 * habis, baru benar-benar discard di BE.
 *
 * IMPORTANT (2026-05-19 fix): timer & pending state DI-LIFT ke parent. Versi
 * sebelumnya menyimpan timer di component-local useEffect — kalau banner
 * unmount (mis. user tutup modal mid-countdown), timer cancel, discard tidak
 * pernah fire, draft tetap di server. Reopen → banner muncul lagi.
 * Sekarang component pure presentational; parent yang track lifecycle.
 */

import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'

interface Props {
    savedAt: Date
    source?: 'server' | 'local'
    onRestore: () => void
    onStartDiscard: () => void
    onCancelDiscard: () => void
    onDismiss?: () => void
    discardPending: boolean
    discardRemainingMs: number
    discardTotalMs: number
}

function formatTime(d: Date): string {
    const minutes = Math.floor((Date.now() - d.getTime()) / 60_000)
    if (minutes < 1)  return i18n.t('a few seconds ago')
    if (minutes < 60) return i18n.t('{{count}}m ago', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24)   return i18n.t('{{count}}h ago', { count: hours })
    const days = Math.floor(hours / 24)
    return i18n.t('{{count}}d ago', { count: days })
}

export function DraftRestoreBanner({
    savedAt,
    source = 'server',
    onRestore,
    onStartDiscard,
    onCancelDiscard,
    onDismiss,
    discardPending,
    discardRemainingMs,
    discardTotalMs,
}: Props) {
    const { t } = useTranslation()
    if (discardPending) {
        const seconds = Math.ceil(discardRemainingMs / 1000)
        const progressPct = Math.max(0, Math.min(100, (discardRemainingMs / discardTotalMs) * 100))
        return (
            <div className="draft-restore-banner draft-restore-banner--undo" role="alert">
                <div className="draft-restore-banner__undo-track" aria-hidden="true">
                    <div
                        className="draft-restore-banner__undo-fill"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <span className="draft-restore-banner__text">
                    {t('Draft will be deleted in {{seconds}}s…', { seconds })}
                </span>
                <div className="draft-restore-banner__actions">
                    <button
                        type="button"
                        className="draft-restore-banner__btn draft-restore-banner__btn--primary"
                        onClick={onCancelDiscard}
                    >
                        {t('Undo')}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="draft-restore-banner" role="status">
            <span className="draft-restore-banner__icon" aria-hidden="true">↺</span>
            <span className="draft-restore-banner__text">
                {t('Recover draft from')} <strong>{formatTime(savedAt)}</strong>
                {source === 'local' ? t(' (local backup)') : ''}.
            </span>
            <div className="draft-restore-banner__actions">
                <button
                    type="button"
                    className="draft-restore-banner__btn draft-restore-banner__btn--primary"
                    onClick={onRestore}
                >
                    {t('Restore')}
                </button>
                <button
                    type="button"
                    className="draft-restore-banner__btn draft-restore-banner__btn--ghost"
                    onClick={onStartDiscard}
                >
                    {t('Discard draft')}
                </button>
                {onDismiss && (
                    <button
                        type="button"
                        className="draft-restore-banner__dismiss"
                        onClick={onDismiss}
                        aria-label={t('Close')}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    )
}
