import { createContext } from 'react'

export type RealtimeListener = (data: unknown, event: MessageEvent | null) => void

/**
 * Simple event-bus untuk real-time events. Satu instance di-share via
 * RealtimeProvider; semua `useRealtimeEvents()` subscribe ke sini.
 *
 * Event sumber: SSE EventSource (real MessageEvent) atau polling fallback
 * (event === null). Handler tidak perlu peduli sumbernya.
 */
export class RealtimeDispatcher {
    private listeners = new Map<string, Set<RealtimeListener>>()

    on(type: string, handler: RealtimeListener): () => void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set())
        const set = this.listeners.get(type)!
        set.add(handler)
        return () => { set.delete(handler) }
    }

    emit(type: string, data: unknown, event: MessageEvent | null = null): void {
        const set = this.listeners.get(type)
        if (!set) return
        for (const handler of set) {
            try { handler(data, event) } catch (e) { console.error('[realtime] handler error:', e) }
        }
    }
}

export const RealtimeDispatcherContext = createContext<RealtimeDispatcher | null>(null)
