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

                        <div className="auth-panel__org">
                            <div>
                                <strong>PTPN III (Persero)</strong>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right panel — form */}
                <div className="auth-form-side">
                    <img className="auth-form-side__map" src={indonesiaMap} alt="" aria-hidden="true" />
                    <div className="auth-form-container">
                        <div className="auth-mobile-brand" aria-hidden="true">
                            <div className="auth-panel__mark">
                                <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                                    <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
                                    <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
                                    <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
                                </svg>
                            </div>
                            <div className="auth-mobile-brand__copy">
                                <strong className="auth-panel__wordmark">ATLAS</strong>
                                <span>Advanced Transformation &amp; Leadership Alignment System</span>
                            </div>
                        </div>

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

                        <p className="auth-legal">
                            © 2026 PTPN III (Persero)
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
