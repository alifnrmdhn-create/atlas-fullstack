import { createContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { usePresencePing } from '../hooks/usePresencePing'
import { realtime } from '../lib/api'
import { RealtimeDispatcher, RealtimeDispatcherContext } from './RealtimeDispatcher'

export type RefreshTicks = {
    program: number
    workstream: number
    phase: number
    task: number
    subtask: number
    blocker: number
    kpi: number
    meeting: number
    report: number
    assignment: number
    comment: number
    notification: number
    presence: number
    channel: number
}

const DEFAULT_TICKS: RefreshTicks = {
    program: 0, workstream: 0, phase: 0, task: 0, subtask: 0,
    blocker: 0, kpi: 0, meeting: 0, report: 0, assignment: 0,
    comment: 0, notification: 0, presence: 0, channel: 0,
}

// Mapping event type → tick bucket yang di-bump
const TICK_MAP: Record<string, keyof RefreshTicks> = {
    'program:changed':            'program',
    'workstream:changed':         'workstream',
    'phase:changed':              'phase',
    'task:changed':               'task',
    'subtask:changed':            'subtask',
    'blocker:changed':            'blocker',
    'kpi:changed':                'kpi',
    'risk:changed':               'report',
    'meeting:changed':            'meeting',
    'meeting:rsvp-changed':       'meeting',
    'meeting:action-changed':     'meeting',
    'meeting:decision-changed':   'meeting',
    'report:changed':             'report',
    'assignment:changed':         'assignment',
    'comment:changed':            'comment',
    'notification:created':       'notification',
    'reminder:due':               'notification',
    'presence:updated':           'presence',
    'presence:activity':          'presence',
    'channel:message:created':    'channel',
    'channel:message:updated':    'channel',
    'channel:message:deleted':    'channel',
    'channel:reaction:changed':   'channel',
    'channel:message:pinned':     'channel',
    'channel:thread:reply':       'channel',
    'channel:channel:created':    'channel',
    'channel:channel:updated':    'channel',
    'channel:channel:archived':   'channel',
}

// Semua event types yang di-listen dari SSE stream
const EVENT_TYPES = Object.keys(TICK_MAP).concat([
    'workspace:update',
    'channel:typing:start', 'channel:typing:stop',
    'workspace:ready', 'workspace:reconnect',
])

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'idle'

export type RealtimeContextValue = { ticks: RefreshTicks; status: RealtimeStatus }

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

/**
 * Single-owner SSE EventSource + ticks aggregator + presence ping.
 * Inject di `app.tsx` supaya seluruh aplikasi punya akses ke real-time state
 * via `useRealtime()` (coarse-grained ticks) atau `useRealtimeEvents()` (spesifik).
 *
 * Guard: saat user belum login (`auth.user === null`), skip semua connection.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
    const user = useAuth()
    const enabled = user !== null && realtime.enabled()

    const [ticks, setTicks] = useState<RefreshTicks>(DEFAULT_TICKS)
    const [status, setStatus] = useState<RealtimeStatus>('idle')
    const dispatcherRef = useRef<RealtimeDispatcher | null>(null)
    if (!dispatcherRef.current) dispatcherRef.current = new RealtimeDispatcher()

    usePresencePing(enabled)

    useEffect(() => {
        if (!enabled) {
            setStatus('idle')
            return
        }

        const dispatcher = dispatcherRef.current!
        let source: EventSource | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let reconnectDelay = 1000
        let cancelled = false

        const connect = () => {
            if (cancelled) return
            setStatus('connecting')
            source = new EventSource(realtime.streamUrl(), { withCredentials: true })

            for (const type of EVENT_TYPES) {
                source.addEventListener(type, (ev) => {
                    const msgEv = ev as MessageEvent
                    let parsed: unknown = msgEv.data
                    try { parsed = JSON.parse(msgEv.data) } catch { /* keep raw */ }
                    dispatcher.emit(type, parsed, msgEv)

                    // Bump tick saat event type termasuk di TICK_MAP
                    const tickKey = TICK_MAP[type]
                    if (tickKey) {
                        setTicks(prev => ({ ...prev, [tickKey]: prev[tickKey] + 1 }))
                    }
                })
            }

            source.onopen = () => { reconnectDelay = 1000; setStatus('connected') }
            source.onerror = () => {
                source?.close()
                source = null
                if (cancelled) return
                setStatus('disconnected')
                reconnectTimer = setTimeout(connect, reconnectDelay)
                reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
            }
        }

        connect()

        return () => {
            cancelled = true
            if (reconnectTimer) clearTimeout(reconnectTimer)
            source?.close()
            setStatus('idle')
        }
    }, [enabled])

    const value = useMemo(() => ({ ticks, status }), [ticks, status])

    return (
        <RealtimeDispatcherContext.Provider value={dispatcherRef.current!}>
            <RealtimeContext.Provider value={value}>
                {children}
            </RealtimeContext.Provider>
        </RealtimeDispatcherContext.Provider>
    )
}
