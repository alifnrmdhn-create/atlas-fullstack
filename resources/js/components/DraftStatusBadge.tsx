/**
 * Sprint 6 — Indicator subtle untuk status autosave.
 *
 * Visual mapping (Indonesian copy):
 *   idle / saved    → "Tersimpan • Nd lalu"           (green)
 *   typing          → "Sedang mengetik…"                (muted)
 *   saving          → "Menyimpan…"                      (blue)
 *   offline         → "Offline — backup lokal"          (yellow)
 *   error           → "Gagal menyimpan"                 (red)
 *   restored        → (badge hidden — RestoreBanner)    —
 */

import { useEffect, useState } from 'react'
import type { AutoSaveStatus } from '../hooks/useAutoSave'

interface Props {
    status: AutoSaveStatus
    lastSavedAt: Date | null
    className?: string
}

function relativeTime(from: Date): string {
    const seconds = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000))
    if (seconds < 5)   return 'just now'
    if (seconds < 60)  return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60)  return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24)    return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

export function DraftStatusBadge({ status, lastSavedAt, className = '' }: Props) {
    // Force re-render setiap 30 detik supaya relative time tidak basi
    const [, setTick] = useState(0)
    useEffect(() => {
        if (status !== 'idle' && status !== 'saved') return
        const id = window.setInterval(() => setTick((t) => t + 1), 30000)
        return () => window.clearInterval(id)
    }, [status])

    if (status === 'restored') return null

    let tone: 'muted' | 'blue' | 'green' | 'yellow' | 'red' = 'muted'
    let label = ''

    switch (status) {
        case 'idle':
            if (!lastSavedAt) return null
            tone = 'green'
            label = `Saved • ${relativeTime(lastSavedAt)}`
            break
        case 'saved':
            tone = 'green'
            label = lastSavedAt ? `Saved • ${relativeTime(lastSavedAt)}` : 'Saved'
            break
        case 'typing':
            tone = 'muted'
            label = 'Typing…'
            break
        case 'saving':
            tone = 'blue'
            label = 'Saving…'
            break
        case 'offline':
            tone = 'yellow'
            label = 'Offline — local backup'
            break
        case 'error':
            tone = 'red'
            label = 'Save failed'
            break
    }

    return (
        <span
            className={`draft-status-badge draft-status-badge--${tone} ${className}`.trim()}
            role="status"
            aria-live="polite"
        >
            <span className="draft-status-badge__dot" aria-hidden="true" />
            <span className="draft-status-badge__label">{label}</span>
        </span>
    )
}
