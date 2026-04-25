import { useState, useEffect, type FormEvent } from 'react'
import { useForm, Head } from '@inertiajs/react'
import '../AuthEntryView.css'
import indonesiaMap from '../../assets/indonesia-map.png'

function CheckIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function EyeIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

function EyeOffIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    )
}

function SparkIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3 1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4L12 3Z" />
            <path d="m18.5 15 1 2.4 2.5.8-2.5.8-1 2.5-1-2.5-2.5-.8 2.5-.8 1-2.4Z" />
            <path d="M5 14.5 5.8 16l1.7.6-1.7.6L5 18.8l-.8-1.6-1.7-.6 1.7-.6L5 14.5Z" />
        </svg>
    )
}

function FlowIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="4" width="7" height="6" rx="2" />
            <rect x="13.5" y="4" width="7" height="6" rx="2" />
            <rect x="8.5" y="14" width="7" height="6" rx="2" />
            <path d="M10.5 7h3M12 10v4" />
        </svg>
    )
}

function PulseIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l2.2-4 3.6 8 2.2-4H21" />
            <path d="M21 6v6h-6" />
        </svg>
    )
}

function ShieldIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 5 6v6c0 4.5 2.9 7.8 7 9 4.1-1.2 7-4.5 7-9V6l-7-3Z" />
            <path d="m9.5 12 1.7 1.7 3.8-4.2" />
        </svg>
    )
}

type PageProps = {
    errors?: { identifier?: string; password?: string }
}

export default function Login({ errors: pageErrors }: PageProps) {
    const { data, setData, post, processing, errors } = useForm({
        identifier: '',
        password: '',
    })

    const [showPassword, setShowPassword] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [isExiting, setIsExiting] = useState(false)

    const authError = errors.identifier ?? null

    useEffect(() => {
        if (!isSuccess) return
        const t = setTimeout(() => setIsExiting(true), 650)
        return () => clearTimeout(t)
    }, [isSuccess])

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        post('/login', {
            onSuccess: () => setIsSuccess(true),
        })
    }

    return (
        <>
            <Head title="Masuk ke ATLAS" />
            <div className={`auth-shell${isExiting ? ' auth-shell--exiting' : ''}`}>
                {/* Left panel — brand */}
                <div className="auth-panel">
                    <img className="auth-panel__map" src={indonesiaMap} alt="" aria-hidden="true" />
                    <div className="auth-panel__inner">
                        <div className="auth-panel__brand">
                            <div className="auth-panel__mark">
                                <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                                    <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
                                    <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
                                    <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
                                </svg>
                            </div>
                            <strong className="auth-panel__wordmark">ATLAS</strong>
                        </div>

                        <div className="auth-panel__content">
                            <p className="auth-panel__eyebrow">Advanced Transformation &amp; Leadership Alignment System</p>
                            <h2 className="auth-panel__headline">Program, eksekusi, dan alignment — satu platform, satu tampilan.</h2>
                            <p className="auth-panel__desc">
                                ATLAS menyatukan program prioritas, kolaborasi lintas fungsi, dan keselarasan strategis dalam satu platform yang mudah dipantau dan nyaman digunakan setiap hari.
                            </p>
                        </div>

                        <div className="auth-panel__highlights" aria-hidden="true">
                            <div className="auth-panel__highlight auth-panel__highlight--primary">
                                <span className="auth-panel__highlight-label">Live workspace</span>
                                <strong>Portfolio, execution, dan insight bergerak dalam satu ritme.</strong>
                            </div>
                            <div className="auth-panel__highlight">
                                <span className="auth-panel__highlight-label">Status sinkron</span>
                                <strong>Status program dan sinyal performa dari APMS tersinkron di seluruh workspace.</strong>
                            </div>
                        </div>

                        <ul className="auth-panel__features">
                            <li>
                                <span className="auth-feat-icon"><SparkIcon /></span>
                                <span>Dashboard eksekutif real-time dengan sinyal yang lebih mudah dipindai.</span>
                            </li>
                            <li>
                                <span className="auth-feat-icon"><FlowIcon /></span>
                                <span>Pelacakan program strategis dan eksekusi dalam satu tempat.</span>
                            </li>
                            <li>
                                <span className="auth-feat-icon"><PulseIcon /></span>
                                <span>Kolaborasi lintas divisi yang lebih cepat dan terhubung.</span>
                            </li>
                        </ul>

                        <div className="auth-panel__org">
                            <div>
                                <strong>PTPN III (Persero)</strong>
                            </div>
                            <div className="auth-panel__org-pill">
                                <ShieldIcon />
                                <span>Akses internal aman</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right panel — form */}
                <div className="auth-form-side">
                    <div className="auth-form-container">
                        <div className="auth-form-header">
                            <span className="auth-form-header__eyebrow">Masuk ke ATLAS Workspace</span>
                            <p>Masuk dengan NIK atau User ID untuk membuka workspace kerja hari ini.</p>
                        </div>

                        {authError && (
                            <div className="auth-notice auth-notice--error" key={authError}>
                                {authError}
                            </div>
                        )}

                        <form className="auth-form" onSubmit={onSubmit}>
                            <div className="auth-float-group">
                                <input
                                    id="identifier"
                                    className="auth-float-input"
                                    autoComplete="username"
                                    onChange={(e) => setData('identifier', e.target.value)}
                                    placeholder=" "
                                    type="text"
                                    value={data.identifier}
                                    autoFocus
                                />
                                <label htmlFor="identifier" className="auth-float-label">NIK atau User ID</label>
                            </div>

                            <div className="auth-float-group">
                                <input
                                    id="password"
                                    className="auth-float-input"
                                    autoComplete="current-password"
                                    onChange={(e) => setData('password', e.target.value)}
                                    placeholder=" "
                                    type={showPassword ? 'text' : 'password'}
                                    value={data.password}
                                />
                                <label htmlFor="password" className="auth-float-label">Kata sandi</label>
                                <button
                                    className="auth-input-toggle"
                                    onClick={() => setShowPassword((v) => !v)}
                                    type="button"
                                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                                >
                                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>

                            <button
                                className={`auth-form__submit${processing ? ' auth-form__submit--loading' : ''}${isSuccess ? ' auth-form__submit--success' : ''}`}
                                disabled={processing || isSuccess}
                                type="submit"
                            >
                                <span className="auth-form__submit-text">Masuk</span>
                                <span className="auth-form__submit-loader">
                                    <span className="auth-spinner" />
                                    Memproses…
                                </span>
                                <span className="auth-form__submit-success">
                                    <CheckIcon />
                                    Berhasil masuk
                                </span>
                            </button>
                        </form>

                        <div className="auth-form__meta">
                            <span className="auth-form__meta-pill">Workspace terpadu</span>
                            <span className="auth-form__meta-pill">Akses internal</span>
                            <span className="auth-form__meta-pill">Program strategis</span>
                        </div>

                        <p className="auth-legal">
                            © 2026 PTPN III (Persero)
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
