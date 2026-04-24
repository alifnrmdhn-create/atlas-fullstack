import { useForm, Head } from '@inertiajs/react'
import { FormEvent } from 'react'

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
    })

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        post('/login')
    }

    return (
        <>
            <Head title="Masuk ke ATLAS" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg, #f7f8fa)' }}>
                <form onSubmit={onSubmit} style={{ background: '#fff', padding: '32px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', minWidth: '360px' }}>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>ATLAS</h1>
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>Masuk dengan email PTPN Anda</p>

                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Email</label>
                    <input
                        type="email"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        required
                        autoFocus
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '16px' }}
                    />
                    {errors.email && <div style={{ color: '#c33', fontSize: '12px', marginTop: '-12px', marginBottom: '12px' }}>{errors.email}</div>}

                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Password</label>
                    <input
                        type="password"
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '20px' }}
                    />

                    <button
                        type="submit"
                        disabled={processing}
                        style={{ width: '100%', padding: '10px', background: '#2d7a4a', color: '#fff', border: 0, borderRadius: '6px', fontWeight: 500, cursor: processing ? 'not-allowed' : 'pointer' }}
                    >
                        {processing ? 'Memverifikasi...' : 'Masuk'}
                    </button>
                </form>
            </div>
        </>
    )
}
