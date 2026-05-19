/**
 * Sprint 6 — Banner pemulihan draf.
 *
 * Muncul sekali saat form mount kalau ada draft tersimpan (server atau
 * sessionStorage). Tidak auto-merge ke form — user explicit: "Pulihkan" atau
 * "Buang draf". Banner dismiss tidak menghapus draft (user masih bisa restore
 * di interaksi berikutnya — draft tetap di server sampai TTL).
 *
 * Undo discard: tombol "Buang" tidak langsung hapus. Toast 5 detik muncul,
 * tombol "Urungkan" → batalkan delete. Setelah 5 detik habis, baru
 * benar-benar discard di BE.
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
    savedAt: Date
    source?: 'server' | 'local'
    onRestore: () => void
    onDiscard: () => void
    onDismiss?: () => void
    undoTimeoutMs?: number
}

function formatTime(d: Date): string {
    const minutes = Math.floor((Date.now() - d.getTime()) / 60_000)
    if (minutes < 1)  return 'beberapa detik lalu'
    if (minutes < 60) return `${minutes} menit lalu`
    const hours = Math.floor(minutes / 60)
    if (hours < 24)   return `${hours} jam lalu`
    const days = Math.floor(hours / 24)
    return `${days} hari lalu`
}

export function DraftRestoreBanner({
    savedAt,
    source = 'server',
    onRestore,
    onDiscard,
    onDismiss,
    undoTimeoutMs = 5000,
}: Props) {
    const [discardPending, setDiscardPending] = useState(false)
    const [remainingMs, setRemainingMs] = useState(undoTimeoutMs)
    const timerRef = useRef<number | null>(null)

    useEffect(() => {
        if (!discardPending) return
        const startedAt = Date.now()
        const tick = () => {
            const elapsed = Date.now() - startedAt
            const remain = Math.max(0, undoTimeoutMs - elapsed)
            setRemainingMs(remain)
            if (remain === 0) {
                onDiscard()
                setDiscardPending(false)
            } else {
                timerRef.current = window.setTimeout(tick, 100)
            }
        }
        timerRef.current = window.setTimeout(tick, 100)
        return () => {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current)
                timerRef.current = null
            }
        }
    }, [discardPending, undoTimeoutMs, onDiscard])

    if (discardPending) {
        const seconds = Math.ceil(remainingMs / 1000)
        return (
            <div className="draft-restore-banner draft-restore-banner--undo" role="alert">
                <span className="draft-restore-banner__text">
                    Draf akan dihapus dalam {seconds} detik…
                </span>
                <div className="draft-restore-banner__actions">
                    <button
                        type="button"
                        className="draft-restore-banner__btn draft-restore-banner__btn--primary"
                        onClick={() => setDiscardPending(false)}
                    >
                        Urungkan
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="draft-restore-banner" role="status">
            <span className="draft-restore-banner__icon" aria-hidden="true">↺</span>
            <span className="draft-restore-banner__text">
                Pulih draf dari <strong>{formatTime(savedAt)}</strong>
                {source === 'local' ? ' (backup lokal)' : ''}.
            </span>
            <div className="draft-restore-banner__actions">
                <button
                    type="button"
                    className="draft-restore-banner__btn draft-restore-banner__btn--primary"
                    onClick={onRestore}
                >
                    Pulihkan
                </button>
                <button
                    type="button"
                    className="draft-restore-banner__btn draft-restore-banner__btn--ghost"
                    onClick={() => setDiscardPending(true)}
                >
                    Buang draf
                </button>
                {onDismiss && (
                    <button
                        type="button"
                        className="draft-restore-banner__dismiss"
                        onClick={onDismiss}
                        aria-label="Tutup"
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    )
}
