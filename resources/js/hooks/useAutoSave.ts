/**
 * Sprint 6 — Form autosave / draft persistence.
 *
 * Pakai pattern:
 *   const autosave = useAutoSave({
 *     formKey: `program:${programId}:progressLog`,
 *     state: progressForm,
 *     enabled: showProgressForm,
 *     entityType: 'Program',
 *     entityId: programId,
 *     flushOnSSEEvents: ['program:changed'],
 *     onRestore: (payload) => setProgressForm({ ...defaults, ...payload }),
 *   })
 *
 *   // Saat submit success:
 *   await autosave.flush()
 *   await api.post('/programs/.../progress-logs', body)
 *   await autosave.discard()
 *
 * State machine:
 *   idle → typing (user mengetik) → saving (PUT in-flight) → saved
 *   saving → offline (network fail) → retry → saved
 *   saving → error (413/422) → idle (no auto-retry untuk terminal error)
 *   mount → restored (server punya draft) → user decide → idle
 *
 * Network fail: backup ke sessionStorage, retry exponential 1s..30s.
 * SSE-aware: subscribe ke event yang akan trigger reload, flush dulu.
 */

import { usePage } from '@inertiajs/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiRequestError } from '../lib/api'
import {
    type RealtimeEventType,
    type RealtimeHandlers,
    useRealtimeEvents,
} from './useRealtimeEvents'

export type AutoSaveStatus =
    | 'idle'
    | 'typing'
    | 'saving'
    | 'saved'
    | 'offline'
    | 'error'
    | 'restored'

export interface UseAutoSaveOptions<T> {
    formKey: string
    state: T
    enabled?: boolean
    debounceMs?: number
    entityType?: string
    entityId?: number | string
    serialize?: (state: T) => unknown
    isDirty?: (state: T) => boolean
    flushOnSSEEvents?: RealtimeEventType[]
    onRestore?: (payload: unknown, savedAt: Date) => void
    onSaveSuccess?: () => void
    onSaveFail?: (err: unknown) => void
}

export interface UseAutoSaveReturn {
    status: AutoSaveStatus
    lastSavedAt: Date | null
    hasDraft: boolean
    restoredPayload: unknown | null
    flush: () => Promise<void>
    discard: () => Promise<void>
    acceptRestore: () => void
}

interface DraftResponse {
    data: {
        payload: unknown
        version: number
        lastEditedAt: string
        clientId: string | null
    } | null
}

interface UpsertResponse {
    data: { version: number; lastEditedAt: string; expiresAt: string }
}

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000]
const MIN_INTERVAL_BETWEEN_SAVES_MS = 600

function localStorageKey(formKey: string): string {
    return `atlas:draft:${formKey}`
}

function safeStableStringify(value: unknown): string {
    try {
        return JSON.stringify(value)
    } catch {
        return String(Math.random())
    }
}

export function useAutoSave<T>(opts: UseAutoSaveOptions<T>): UseAutoSaveReturn {
    const {
        formKey,
        state,
        enabled = true,
        entityType,
        entityId,
        serialize = (s) => s,
        isDirty,
        flushOnSSEEvents,
        onRestore,
        onSaveSuccess,
        onSaveFail,
    } = opts

    const pageProps = usePage<{
        thresholds?: { autosave?: { debounceMs?: number } }
        features?: Record<string, boolean>
    }>().props
    const debounceMs = opts.debounceMs ?? pageProps.thresholds?.autosave?.debounceMs ?? 1500
    const featureEnabled = pageProps.features?.autosave !== false
    const active = enabled && featureEnabled

    const [status, setStatus] = useState<AutoSaveStatus>('idle')
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
    const [hasDraft, setHasDraft] = useState(false)
    const [restoredPayload, setRestoredPayload] = useState<unknown | null>(null)

    const timerRef = useRef<number | null>(null)
    const retryTimerRef = useRef<number | null>(null)
    const retryAttemptRef = useRef(0)
    const inFlightRef = useRef<AbortController | null>(null)
    const lastSavedSnapRef = useRef<string | null>(null)
    const lastSaveStartedAtRef = useRef<number>(0)
    const versionRef = useRef<number>(0)
    const clientIdRef = useRef<string>('')
    const restoreShownRef = useRef(false)
    const mountedRef = useRef(true)
    const stateRef = useRef<T>(state)
    stateRef.current = state

    // Single per-mount GUID. crypto.randomUUID tersedia di semua browser modern;
    // fallback ke Math.random untuk safety (jangan crash kalau env aneh).
    if (!clientIdRef.current) {
        clientIdRef.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `c-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
    }

    const clearAllTimers = useCallback(() => {
        if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null }
        if (retryTimerRef.current) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    }, [])

    // ── Core save logic ──────────────────────────────────────────────────────
    const performSave = useCallback(async (): Promise<void> => {
        if (!active || !mountedRef.current) return

        // Cancel sebelumnya kalau ada
        inFlightRef.current?.abort()
        const controller = new AbortController()
        inFlightRef.current = controller

        // Rate limit: jangan terlalu rapat antar save
        const now = Date.now()
        const sinceLast = now - lastSaveStartedAtRef.current
        if (sinceLast < MIN_INTERVAL_BETWEEN_SAVES_MS) {
            await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_BETWEEN_SAVES_MS - sinceLast))
            if (controller.signal.aborted) return
        }
        lastSaveStartedAtRef.current = Date.now()

        const payload = serialize(stateRef.current)
        const body = {
            payload,
            entityType,
            entityId,
            clientId: clientIdRef.current,
            version: versionRef.current,
        }

        setStatus('saving')

        try {
            const resp = await api.put<UpsertResponse>(
                `/drafts/${encodeURIComponent(formKey)}`,
                body,
            )
            if (!mountedRef.current || controller.signal.aborted) return

            versionRef.current = resp.data.version
            lastSavedSnapRef.current = safeStableStringify(payload)
            setLastSavedAt(new Date(resp.data.lastEditedAt))
            setStatus('saved')
            retryAttemptRef.current = 0
            // Clear sessionStorage backup karena server sudah punya
            try { window.sessionStorage.removeItem(localStorageKey(formKey)) } catch { /* quota / private mode */ }
            onSaveSuccess?.()
        } catch (err) {
            if (controller.signal.aborted || !mountedRef.current) return
            handleSaveError(err)
        }
    }, [active, formKey, entityType, entityId, serialize, onSaveSuccess])

    const handleSaveError = useCallback((err: unknown) => {
        // 409 — version conflict. Fetch latest, bump version, retry sekali.
        if (err instanceof ApiRequestError && err.status === 409) {
            const detail = err.details as { version?: number } | undefined
            // Server detail diembed di `details`? — kita tidak parse error body
            // (api.ts hanya expose `details` dari `errors`). Cara aman: re-fetch
            // server state via show endpoint.
            void api.get<DraftResponse>(`/drafts/${encodeURIComponent(formKey)}`)
                .then((resp) => {
                    if (resp.data) {
                        versionRef.current = resp.data.version
                    }
                    // Retry sekali silently
                    void performSave()
                })
                .catch(() => {
                    setStatus('error')
                    onSaveFail?.(err)
                })
            return
        }

        // 413 — terminal. Tidak retry. FE bisa downgrade ke sessionStorage-only.
        if (err instanceof ApiRequestError && err.status === 413) {
            setStatus('error')
            try {
                window.sessionStorage.setItem(
                    localStorageKey(formKey),
                    JSON.stringify({
                        payload: serialize(stateRef.current),
                        savedAt: new Date().toISOString(),
                        clientId: clientIdRef.current,
                        version: versionRef.current,
                        reason: 'payload-too-large',
                    }),
                )
            } catch { /* ignore quota */ }
            onSaveFail?.(err)
            return
        }

        // 4xx lain (422 validation, 503 disabled, dll) — error terminal.
        if (err instanceof ApiRequestError && err.status >= 400 && err.status < 500 && err.status !== 408) {
            setStatus('error')
            onSaveFail?.(err)
            return
        }

        // Network fail (status 0/408/5xx) — backup ke sessionStorage, jadwal retry.
        try {
            window.sessionStorage.setItem(
                localStorageKey(formKey),
                JSON.stringify({
                    payload: serialize(stateRef.current),
                    savedAt: new Date().toISOString(),
                    clientId: clientIdRef.current,
                    version: versionRef.current,
                }),
            )
        } catch { /* ignore quota */ }

        setStatus('offline')
        scheduleRetry()
        onSaveFail?.(err)
    }, [formKey, serialize, onSaveFail])

    const scheduleRetry = useCallback(() => {
        if (retryTimerRef.current) return
        const idx = Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)
        const delay = RETRY_DELAYS_MS[idx]
        retryAttemptRef.current += 1
        retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null
            if (!mountedRef.current) return
            void performSave()
        }, delay)
    }, [performSave])

    const performSaveRef = useRef(performSave)
    performSaveRef.current = performSave

    // ── Public flush (bypass debounce — for SSE pre-reload + submit) ─────────
    const flush = useCallback(async (): Promise<void> => {
        if (!active) return
        if (timerRef.current) {
            window.clearTimeout(timerRef.current)
            timerRef.current = null
        }
        // Hanya save kalau memang ada perubahan tertunda
        const currentSnap = safeStableStringify(serialize(stateRef.current))
        if (currentSnap === lastSavedSnapRef.current) return
        await performSaveRef.current()
    }, [active, serialize])

    // ── Public discard ────────────────────────────────────────────────────────
    const discard = useCallback(async (): Promise<void> => {
        clearAllTimers()
        inFlightRef.current?.abort()
        try { window.sessionStorage.removeItem(localStorageKey(formKey)) } catch { /* ignore */ }
        try {
            await api.delete(`/drafts/${encodeURIComponent(formKey)}`)
        } catch { /* idempotent — silent */ }
        if (!mountedRef.current) return
        setStatus('idle')
        setLastSavedAt(null)
        setHasDraft(false)
        setRestoredPayload(null)
        versionRef.current = 0
        restoreShownRef.current = true // prevent re-show
        lastSavedSnapRef.current = safeStableStringify(serialize(stateRef.current))
    }, [formKey, serialize, clearAllTimers])

    const acceptRestore = useCallback(() => {
        restoreShownRef.current = true
        if (restoredPayload !== null && lastSavedAt && onRestore) {
            onRestore(restoredPayload, lastSavedAt)
        }
        setStatus('idle')
        // Setelah accept, jangan trigger save lagi sampai user benar-benar mengedit
        if (restoredPayload !== null) {
            lastSavedSnapRef.current = safeStableStringify(restoredPayload)
        }
    }, [restoredPayload, lastSavedAt, onRestore])

    // ── Mount: fetch existing draft ──────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true
        if (!active) return

        let cancelled = false
        void api.get<DraftResponse>(`/drafts/${encodeURIComponent(formKey)}`)
            .then((resp) => {
                if (cancelled || !mountedRef.current) return
                if (resp.data) {
                    versionRef.current = resp.data.version
                    setHasDraft(true)
                    setRestoredPayload(resp.data.payload)
                    setLastSavedAt(new Date(resp.data.lastEditedAt))
                    setStatus('restored')
                    return
                }
                // No server draft — cek sessionStorage fallback
                try {
                    const raw = window.sessionStorage.getItem(localStorageKey(formKey))
                    if (raw) {
                        const parsed = JSON.parse(raw)
                        if (parsed?.payload) {
                            setHasDraft(true)
                            setRestoredPayload(parsed.payload)
                            setLastSavedAt(new Date(parsed.savedAt))
                            setStatus('restored')
                        }
                    }
                } catch { /* ignore */ }
            })
            .catch(() => { /* GET failed — ignore, don't block form */ })

        return () => { cancelled = true }
    }, [active, formKey])

    // ── State change → debounce → save ───────────────────────────────────────
    useEffect(() => {
        if (!active) return
        if (status === 'restored' && !restoreShownRef.current) return // wait for user

        const snap = safeStableStringify(serialize(state))
        if (lastSavedSnapRef.current === null) {
            // First time — establish baseline tanpa save
            lastSavedSnapRef.current = snap
            return
        }
        const dirty = isDirty ? isDirty(state) : snap !== lastSavedSnapRef.current
        if (!dirty) return

        setStatus('typing')
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null
            void performSaveRef.current()
        }, debounceMs)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, active, debounceMs])

    // ── SSE-aware flush ───────────────────────────────────────────────────────
    const sseHandlers = useMemo<RealtimeHandlers>(() => {
        if (!flushOnSSEEvents?.length) return {}
        const handlers: RealtimeHandlers = {}
        for (const eventType of flushOnSSEEvents) {
            handlers[eventType] = () => { void flush() }
        }
        return handlers
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flushOnSSEEvents?.join('|'), flush])
    useRealtimeEvents(sseHandlers)

    // ── Online listener — retry pending offline saves ────────────────────────
    useEffect(() => {
        if (!active) return
        const onOnline = () => {
            if (status === 'offline') {
                retryAttemptRef.current = 0
                if (retryTimerRef.current) {
                    window.clearTimeout(retryTimerRef.current)
                    retryTimerRef.current = null
                }
                void performSaveRef.current()
            }
        }
        window.addEventListener('online', onOnline)
        return () => window.removeEventListener('online', onOnline)
    }, [active, status])

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    useEffect(() => () => {
        mountedRef.current = false
        clearAllTimers()
        inFlightRef.current?.abort()
    }, [clearAllTimers])

    // ── Disable handling: kalau enabled flip false, batalin timer (tidak flush) ─
    useEffect(() => {
        if (active) return
        clearAllTimers()
        inFlightRef.current?.abort()
        if (status !== 'idle') setStatus('idle')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active])

    return {
        status,
        lastSavedAt,
        hasDraft,
        restoredPayload,
        flush,
        discard,
        acceptRestore,
    }
}
