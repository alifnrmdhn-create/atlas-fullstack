import { Head, router } from '@inertiajs/react'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useFlash } from '../hooks/useFlash'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'
import { useRealtime } from '../contexts/RealtimeProvider'

export default function Dashboard() {
    const user = useAuth()
    const { ticks } = useRealtime()
    const [lastEvent, setLastEvent] = useState<string | null>(null)

    useFlash({
        onSuccess: (msg) => console.log('Flash success:', msg),
        onError: (msg) => console.error('Flash error:', msg),
    })

    useRealtimeEvents({
        'workspace:ready': () => setLastEvent('workspace:ready'),
        'program:changed': (data: any) => setLastEvent(`program:${data?.action} #${data?.id}`),
        'task:changed':    (data: any) => setLastEvent(`task:${data?.action} #${data?.id}`),
        'notification:created': () => setLastEvent('notification received'),
    })

    return (
        <>
            <Head title="Dashboard" />
            <div style={{ padding: '32px', fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 600 }}>ATLAS — Dashboard</h1>
                <p style={{ color: '#666', fontSize: '13px', marginTop: '4px' }}>
                    Fase 10 — infrastruktur real-time + Inertia hooks aktif.
                </p>

                <div style={{ marginTop: '24px', padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #eee' }}>
                    <strong>Halo, {user?.name}</strong>
                    <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                        Role: {user?.roleType} · Unit ID: {user?.unitId ?? '—'} · Direktorat ID: {user?.directorateId ?? '—'}
                    </div>
                    <button
                        onClick={() => router.post('/logout')}
                        style={{ marginTop: '12px', padding: '6px 12px', background: '#c33', color: '#fff', border: 0, borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Keluar
                    </button>
                </div>

                <div style={{ marginTop: '16px', padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #eee' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, marginBottom: '8px' }}>Real-time status (live ticks)</h3>
                    <div style={{ fontSize: '12px', color: '#666', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                        <div>program: {ticks.program}</div>
                        <div>task: {ticks.task}</div>
                        <div>assignment: {ticks.assignment}</div>
                        <div>meeting: {ticks.meeting}</div>
                        <div>notification: {ticks.notification}</div>
                        <div>channel: {ticks.channel}</div>
                        <div>presence: {ticks.presence}</div>
                        <div>comment: {ticks.comment}</div>
                    </div>
                    <div style={{ marginTop: '12px', fontSize: '12px', color: '#888' }}>
                        Last event: <code>{lastEvent ?? '(waiting...)'}</code>
                    </div>
                </div>
            </div>
        </>
    )
}
