import { useContext, useEffect, useRef } from 'react'
import { RealtimeDispatcherContext } from '../contexts/RealtimeDispatcher'

export type RealtimeHandler = (data: unknown, event: MessageEvent | null) => void

export type RealtimeHandlers = Partial<{
    'workspace:update': RealtimeHandler
    'workspace:ready': RealtimeHandler
    'workspace:reconnect': RealtimeHandler
    'program:changed': RealtimeHandler
    'workstream:changed': RealtimeHandler
    'phase:changed': RealtimeHandler
    'task:changed': RealtimeHandler
    'subtask:changed': RealtimeHandler
    'blocker:changed': RealtimeHandler
    'kpi:changed': RealtimeHandler
    'risk:changed': RealtimeHandler
    'meeting:changed': RealtimeHandler
    'meeting:rsvp-changed': RealtimeHandler
    'meeting:action-changed': RealtimeHandler
    'meeting:decision-changed': RealtimeHandler
    'report:changed': RealtimeHandler
    'assignment:changed': RealtimeHandler
    'comment:changed': RealtimeHandler
    'notification:created': RealtimeHandler
    'reminder:due': RealtimeHandler
    'presence:updated': RealtimeHandler
    'presence:activity': RealtimeHandler
    'channel:message:created': RealtimeHandler
    'channel:message:updated': RealtimeHandler
    'channel:message:deleted': RealtimeHandler
    'channel:reaction:changed': RealtimeHandler
    'channel:message:pinned': RealtimeHandler
    'channel:thread:reply': RealtimeHandler
    'channel:channel:created': RealtimeHandler
    'channel:channel:updated': RealtimeHandler
    'channel:channel:archived': RealtimeHandler
    'channel:typing:start': RealtimeHandler
    'channel:typing:stop': RealtimeHandler
}>

export type RealtimeEventType = keyof RealtimeHandlers

/**
 * Subscribe ke event real-time. Handler yang match event type akan dipanggil.
 * Hook ini TIDAK bikin EventSource sendiri — share dari RealtimeProvider.
 *
 * Contoh:
 *   useRealtimeEvents({
 *     'program:changed': () => refetchPrograms(),
 *     'task:changed': (data) => {
 *       if (data.id === currentTaskId) refetchTask()
 *     },
 *     'notification:created': (data) => showToast(data.notification.message),
 *   })
 */
export function useRealtimeEvents(handlers: RealtimeHandlers): void {
    const dispatcher = useContext(RealtimeDispatcherContext)
    const handlersRef = useRef(handlers)
    handlersRef.current = handlers

    const eventTypesKey = Object.keys(handlers).sort().join('|')

    useEffect(() => {
        if (!dispatcher) return

        const types = Object.keys(handlersRef.current) as RealtimeEventType[]
        const unsubs = types.map(type =>
            dispatcher.on(type, (data, ev) => {
                const current = handlersRef.current[type]
                current?.(data, ev)
            })
        )

        return () => unsubs.forEach(fn => fn())
    }, [dispatcher, eventTypesKey])
}
