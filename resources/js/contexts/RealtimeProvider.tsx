import { createContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { usePresencePing } from '../hooks/usePresencePing'
import { api, realtime } from '../lib/api'
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

const POLL_INTERVAL_MS = 2000          // polling fallback cadence — pendek supaya typing & message terasa realtime saat SSE buffered
const POLL_SEED_SENTINEL = 2_147_483_647 // max int — seeds lastEventId tanpa fetch event lama

type PollResponse = { events?: { id: number; eventType: string; payload: unknown }[]; lastEventId?: number }

/**
 * Single-owner SSE EventSource + polling fallback + ticks aggregator + presence ping.
 * Inject di `app.tsx` supaya seluruh aplikasi punya akses ke real-time state
 * via `useRealtime()` (coarse-grained ticks) atau `useRealtimeEvents()` (spesifik).
 *
 * Dua jalur delivery jalan paralel:
 *   - SSE: long-lived stream, low latency (<1s).
 *   - Polling: HTTP GET /realtime/poll setiap 4 detik. Catch-up kalau SSE
 *     gagal/buffered (umum di belakang reverse proxy seperti Railway edge).
 *
 * Dedup berbasis event id (`seenIdsRef`) supaya handler tidak fire dua kali.
 *
 * Guard: saat user belum login (`auth.user === null`), skip semua connection.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
    const user = useAuth()
    const enabled = user !== null

    const [ticks, setTicks] = useState<RefreshTicks>(DEFAULT_TICKS)
    const [status, setStatus] = useState<RealtimeStatus>('idle')
    const dispatcherRef = useRef<RealtimeDispatcher | null>(null)
    if (!dispatcherRef.current) dispatcherRef.current = new RealtimeDispatcher()

    const lastEventIdRef = useRef<number>(0)
    const seenIdsRef = useRef<Set<number>>(new Set())

    usePresencePing(enabled)

    // Inti delivery: SATU pipeline yang dipakai SSE & polling. Idempoten.
    const processEvent = (id: number | null, type: string, payload: unknown, msgEv: MessageEvent | null) => {
        if (id != null) {
            if (seenIdsRef.current.has(id)) return
            seenIdsRef.current.add(id)
            // Bound supaya tidak unbounded grow
            if (seenIdsRef.current.size > 2000) {
                seenIdsRef.current = new Set(Array.from(seenIdsRef.current).slice(-1000))
            }
            if (id > lastEventIdRef.current) lastEventIdRef.current = id
        }

        dispatcherRef.current!.emit(type, payload, msgEv)

        const tickKey = TICK_MAP[type]
        if (tickKey) {
            setTicks(prev => ({ ...prev, [tickKey]: prev[tickKey] + 1 }))
        }
    }

    // SSE ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!enabled || !realtime.enabled()) {
            setStatus('idle')
            return
        }

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
                    const id = msgEv.lastEventId ? parseInt(msgEv.lastEventId, 10) : NaN
                    processEvent(Number.isFinite(id) ? id : null, type, parsed, msgEv)
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

    // Polling fallback ─────────────────────────────────────────────────────
    // Jalan ALWAYS saat user login. Lengkapi SSE — kalau SSE delivered duluan,
    // poll tinggal skip via seenIdsRef. Kalau SSE blocked (proxy buffering,
    // `php artisan serve` worker exhaustion), poll yang deliver.
    useEffect(() => {
        if (!enabled) return

        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null

        // Seed lastEventId ke current max — supaya poll pertama tidak banjir
        // event historis (broadcast_events bisa berisi ribuan presence pings).
        const seed = async () => {
            try {
                const res = await api.get<PollResponse>(`/realtime/poll?since=${POLL_SEED_SENTINEL}`)
                if (res?.lastEventId && res.lastEventId > lastEventIdRef.current) {
                    lastEventIdRef.current = res.lastEventId
                }
            } catch { /* offline / 401 — biarkan saja */ }
        }

        const tick = async () => {
            if (cancelled) return
            try {
                const res = await api.get<PollResponse>(`/realtime/poll?since=${lastEventIdRef.current}`)
                if (cancelled) return
                for (const ev of res?.events ?? []) {
                    processEvent(ev.id, ev.eventType, ev.payload, null)
                }
                if (res?.lastEventId && res.lastEventId > lastEventIdRef.current) {
                    lastEventIdRef.current = res.lastEventId
                }
            } catch { /* silent retry */ }
            timer = setTimeout(tick, POLL_INTERVAL_MS)
        }

        void seed().then(() => { if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS) })

        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
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
