import { Head, Link, usePage, router } from '@inertiajs/react'

type AuthUser = {
    id: number
    email: string
    name: string
    roleType: string
    positionTitle?: string | null
    unitId?: number | null
    directorateId?: number | null
}

export default function Dashboard() {
    const { auth } = usePage<{ auth: { user: AuthUser | null } }>().props
    const user = auth.user

    return (
        <>
            <Head title="Dashboard" />
            <div style={{ padding: '32px', fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 600 }}>ATLAS — Dashboard</h1>
                <p style={{ color: '#666', fontSize: '13px', marginTop: '4px' }}>Placeholder dashboard — akan di-port dari frontend/src/views/DashboardView.tsx di Fase 4.</p>

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
            </div>
        </>
    )
}
