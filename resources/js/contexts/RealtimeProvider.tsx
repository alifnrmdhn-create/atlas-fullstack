import { createContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { usePresencePing } from '../hooks/usePresencePing'
import { api } from '../lib/api'
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

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'idle'

export type RealtimeContextValue = { ticks: RefreshTicks; status: RealtimeStatus }

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const POLL_INTERVAL_MS = 2000          // polling cadence — 2s cukup realtime untuk notifikasi & presence; ribuan user tetap aman di FrankenPHP
const HIDDEN_POLL_INTERVAL_MS = 30_000 // tab tersembunyi (background, terutama mobile): heartbeat lambat — hemat baterai/kuota, catch-up via onVisibility saat kembali
const POLL_SEED_SENTINEL = 2_147_483_647 // max int — seeds lastEventId tanpa fetch event lama

type PollResponse = { events?: { id: number; eventType: string; payload: unknown }[]; lastEventId?: number }

/**
 * Polling-based realtime dispatcher + ticks aggregator + presence ping.
 *
 * SSE pernah dipakai paralel dengan polling, tapi di FrankenPHP `php-server` mode
 * tiap koneksi SSE menahan 1 PHP thread sampai TTL — jadi thread starvation
 * dengan beberapa user simultan. Polling murni: tiap request <100ms, thread
 * cepat balik, throughput jauh lebih tinggi di shared hosting / Railway.
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

    // Polling pipeline ─────────────────────────────────────────────────────
    // Satu-satunya jalur delivery event. Tiap poll request short-lived (<100ms),
    // jadi thread PHP cepat balik ke pool — ribuan user simultan tetap aman.
    useEffect(() => {
        if (!enabled) {
            setStatus('idle')
            return
        }

        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        let consecutiveErrors = 0
        let wasDisconnected = false
        let hiddenAt: number | null = null
        const RESYNC_AFTER_HIDDEN_MS = 10 * 60 * 1000 // selaras-aman dgn retensi 15m server

        setStatus('connecting')

        // Bump SEMUA tick bucket → setiap consumer (Workspace context dsb) refetch
        // datanya. Dipakai saat reconnect / kembali dari background lama: event yang
        // terjadi selama gap bisa sudah di-GC dari broadcast_events (retensi server),
        // jadi cursor `since` maju melewatinya tanpa kita tahu. Full refetch =
        // jaring pengaman anti event-loss.
        const resyncAll = () => {
            setTicks(prev => {
                const next = { ...prev }
                for (const k of Object.keys(next) as (keyof RefreshTicks)[]) next[k] += 1
                return next
            })
        }

        // Seed lastEventId ke current max — supaya poll pertama tidak banjir
        // event historis (broadcast_events bisa berisi ribuan presence pings).
        const seed = async () => {
            try {
                const res = await api.get<PollResponse>(`/realtime/poll?since=${POLL_SEED_SENTINEL}`)
                if (res?.lastEventId && res.lastEventId > lastEventIdRef.current) {
                    lastEventIdRef.current = res.lastEventId
                }
                setStatus('connected')
                // Emit synthetic workspace:ready supaya consumer (mis. WorkspaceContext)
                // bisa set initial lastSyncedAt timestamp. Dulu di-emit oleh SSE controller
                // saat koneksi terbuka — sekarang FE yang sintesis setelah seed sukses.
                processEvent(null, 'workspace:ready', { connectedAt: new Date().toISOString() }, null)
            } catch { /* offline / 401 — biarkan saja, status akan flip di tick pertama */ }
        }

        const tick = async () => {
            if (cancelled) return
            // Mobile/baterai: saat tab tersembunyi jangan tarik /realtime/poll tiap 2s.
            // Lewati fetch & reschedule heartbeat lambat (jaga loop tetap hidup walau
            // visibilitychange terlewat); begitu tab kembali terlihat, onVisibility
            // memicu tick() langsung + resyncAll bila hidden lama, jadi data tetap
            // catch-up via cursor `since`. Status dibiarkan apa adanya (bukan disconnected).
            if (document.hidden) {
                timer = setTimeout(tick, HIDDEN_POLL_INTERVAL_MS)
                return
            }
            try {
                const res = await api.get<PollResponse>(`/realtime/poll?since=${lastEventIdRef.current}`)
                if (cancelled) return
                for (const ev of res?.events ?? []) {
                    processEvent(ev.id, ev.eventType, ev.payload, null)
                }
                if (res?.lastEventId && res.lastEventId > lastEventIdRef.current) {
                    lastEventIdRef.current = res.lastEventId
                }
                consecutiveErrors = 0
                setStatus('connected')
                // Baru pulih dari disconnect → event selama gap mungkin sudah ter-GC.
                // Refetch semua supaya tidak ada update yang hilang diam-diam.
                if (wasDisconnected) {
                    wasDisconnected = false
                    resyncAll()
                }
            } catch {
                consecutiveErrors++
                // 2x gagal beruntun = jaringan / server bermasalah → tunjukkan offline indicator
                if (consecutiveErrors >= 2) {
                    setStatus('disconnected')
                    wasDisconnected = true
                }
            }
            // Exponential backoff saat error (max 30s) supaya tidak hammer server
            const delay = consecutiveErrors > 0
                ? Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1), 30_000)
                : POLL_INTERVAL_MS
            timer = setTimeout(tick, delay)
        }

        // Saat tab kembali terlihat: segera poll (jangan tunggu timer, yang bisa
        // di-throttle browser saat hidden), dan kalau sempat hidden lama (> ambang
        // aman retensi) resync penuh karena event selama suspend bisa sudah ter-GC.
        const onVisibility = () => {
            if (document.hidden) { hiddenAt = Date.now(); return }
            const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
            hiddenAt = null
            if (hiddenFor > RESYNC_AFTER_HIDDEN_MS) resyncAll()
            if (timer) clearTimeout(timer)
            if (!cancelled) void tick()
        }
        document.addEventListener('visibilitychange', onVisibility)

        void seed().then(() => { if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS) })

        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
            document.removeEventListener('visibilitychange', onVisibility)
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
