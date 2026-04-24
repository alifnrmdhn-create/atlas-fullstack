import { useEffect, useRef } from 'react'
import { api } from '../lib/api'

/**
 * Auto-ping `/realtime/ping` setiap 60 detik saat tab aktif.
 *
 * Fungsi ping di backend (RealtimeController::ping):
 *   - Update UserStatus.lastActivityAt
 *   - Track UserSession (contiguous activity vs idle gap)
 *   - Broadcast presence:activity event
 *
 * Pakai di root layout sekali supaya seluruh session auto-tracked.
 */
export function usePresencePing(enabled: boolean = true): void {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (!enabled) return

        const ping = () => {
            if (document.visibilityState !== 'visible') return
            api.post('/realtime/ping').catch(() => { /* non-fatal */ })
        }

        // Ping pertama langsung, lalu tiap 60 detik
        ping()
        timerRef.current = setInterval(ping, 60_000)

        // Ping saat tab jadi visible lagi
        const onVisibility = () => {
            if (document.visibilityState === 'visible') ping()
        }
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [enabled])
}
