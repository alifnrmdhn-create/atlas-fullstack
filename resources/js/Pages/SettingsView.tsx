import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import {
  type ResolvedTheme,
  type ThemePreference,
  applyThemePreference,
  getThemeSnapshot,
  getStoredThemePreference,
  subscribeThemeChange,
} from '../lib/theme'
import './SettingsView.css'

// ── Nav items ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    id: 'Notifications',
    icon: (
      <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
        <path d="M8 2a4.5 4.5 0 0 1 4.5 4.5V9l1 2H2.5l1-2V6.5A4.5 4.5 0 0 1 8 2z" />
        <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
      </svg>
    ),
  },
  {
    id: 'Appearance',
    icon: (
      <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 2.5V8l3 3" />
      </svg>
    ),
  },
  {
    id: 'Security',
    icon: (
      <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
        <rect height="8" rx="1.5" width="10" x="3" y="7" />
        <path d="M5 7V5.5a3 3 0 0 1 6 0V7" />
      </svg>
    ),
  },
  {
    id: 'Workspace',
    icon: (
      <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
        <rect height="12" rx="1.5" width="12" x="2" y="2" />
        <path d="M2 6h12M6 6v8" />
      </svg>
    ),
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function InfoValue({ label, value }: { label: string; value: string }) {
  if (label === 'Database' && value.includes('PostgreSQL')) {
    return <span className="status-badge on-track">{value}</span>
  }
  if (label === 'Environment' && value === 'Production') {
    return <span className="status-badge at-risk">{value}</span>
  }
  return <span className="settings-value-text">{value}</span>
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input checked={checked} onChange={e => onChange(e.target.checked)} type="checkbox" />
      <span className="toggle-switch__track" />
    </label>
  )
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
        <path d="M1.5 8s2.2-4 6.5-4 6.5 4 6.5 4-2.2 4-6.5 4-6.5-4-6.5-4Z" />
        <circle cx="8" cy="8" r="2.2" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
      <path d="M2 2l12 12" />
      <path d="M6.1 4.5A6.7 6.7 0 0 1 8 4c4.3 0 6.5 4 6.5 4a11.2 11.2 0 0 1-2.4 2.8" />
      <path d="M9.9 11.5A6.7 6.7 0 0 1 8 12c-4.3 0-6.5-4-6.5-4A11.2 11.2 0 0 1 3.9 5.2" />
      <path d="M6.4 6.4A2.2 2.2 0 0 0 8 10.2" />
    </svg>
  )
}

// ── Security section with change-password form ─────────────────────────────

function SecuritySection({ onLogout }: { onLogout: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (next !== confirm) { setError('Konfirmasi kata sandi tidak cocok.'); return }
    if (next.length < 6) { setError('Kata sandi baru minimal 6 karakter.'); return }
    setSaving(true)
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next })
      setSuccess(true)
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah kata sandi.')
    } finally {
      setSaving(false)
    }
  }

  const uaDevice = (() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Unknown'
    const browser = /Chrome\//.test(ua) && !/Edg\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'Safari' : /Edg\//.test(ua) ? 'Edge' : 'Browser'
    return `${browser} · ${os}`
  })()

  const infoRows = [
    { label: 'Metode Autentikasi', value: 'Kata Sandi Workspace' },
    { label: 'Autentikasi 2 Faktor', value: 'Belum aktif' },
    { label: 'Perangkat Saat Ini', value: uaDevice },
    { label: 'Login Terakhir', value: new Date().toLocaleString('id-ID') },
  ]

  // Password strength heuristic (0–4)
  const pwStrength = (() => {
    if (!next) return 0
    let score = 0
    if (next.length >= 6) score += 1
    if (next.length >= 10) score += 1
    if (/[A-Z]/.test(next) && /[a-z]/.test(next)) score += 1
    if (/\d/.test(next) && /[^A-Za-z0-9]/.test(next)) score += 1
    return Math.min(4, score)
  })()
  const pwLabel = ['—', 'Lemah', 'Cukup', 'Baik', 'Kuat'][pwStrength]

  return (
    <div className="section-block">
      <div className="section-header">
        <div>
          <h3 className="section-title">Security</h3>
          <p className="section-subtitle">Informasi sesi dan keamanan akun.</p>
        </div>
      </div>

      <div className="settings-list settings-list--compact">
        {infoRows.map(({ label, value }) => (
          <div className="list-row settings-list-row" key={label}>
            <span className="settings-list-row__label">{label}</span>
            <span className="settings-value-text">{value}</span>
          </div>
        ))}
      </div>

      <div className="settings-security-card">
        <div className="settings-security-card__title">Ganti Kata Sandi</div>
        <p className="settings-security-card__subtitle">
          Gunakan kata sandi unik yang belum dipakai di tempat lain.
        </p>

        {success && (
          <div className="settings-feedback settings-feedback--success">
            ✓ Kata sandi berhasil diubah.
          </div>
        )}
        {error && (
          <div className="settings-feedback settings-feedback--error">
            {error}
          </div>
        )}

        <form className="settings-password-form" onSubmit={handleSubmit}>
          <div className="settings-password-field">
            <label className="settings-password-label">
              Kata Sandi Saat Ini
            </label>
            <div className="settings-password-input-wrap">
              <input
                autoComplete="current-password"
                className="profile-input settings-password-input settings-password-input--with-toggle"
                onChange={e => setCurrent(e.target.value)}
                placeholder="Masukkan kata sandi saat ini"
                required
                type={showCurrent ? 'text' : 'password'}
                value={current}
              />
              <button
                aria-label={showCurrent ? 'Sembunyikan kata sandi saat ini' : 'Tampilkan kata sandi saat ini'}
                className="settings-password-toggle"
                onClick={() => setShowCurrent(v => !v)}
                type="button"
              >
                <PasswordVisibilityIcon visible={showCurrent} />
              </button>
            </div>
          </div>

          <div className="settings-password-field">
            <label className="settings-password-label">
              Kata Sandi Baru
            </label>
            <div className="settings-password-input-wrap">
              <input
                autoComplete="new-password"
                className="profile-input settings-password-input settings-password-input--with-toggle"
                onChange={e => setNext(e.target.value)}
                placeholder="Minimal 6 karakter"
                required
                type={showNext ? 'text' : 'password'}
                value={next}
              />
              <button
                aria-label={showNext ? 'Sembunyikan kata sandi baru' : 'Tampilkan kata sandi baru'}
                className="settings-password-toggle"
                onClick={() => setShowNext(v => !v)}
                type="button"
              >
                <PasswordVisibilityIcon visible={showNext} />
              </button>
            </div>
            {next && (
              <div className="settings-pw-strength" data-level={pwStrength}>
                <div className="settings-pw-strength__bar" aria-hidden="true">
                  <span className="settings-pw-strength__seg" />
                  <span className="settings-pw-strength__seg" />
                  <span className="settings-pw-strength__seg" />
                  <span className="settings-pw-strength__seg" />
                </div>
                <span className="settings-pw-strength__label">{pwLabel}</span>
              </div>
            )}
          </div>

          <div className="settings-password-field">
            <label className="settings-password-label">
              Konfirmasi Kata Sandi Baru
            </label>
            <input
              autoComplete="new-password"
              className={`profile-input settings-password-input${confirm && confirm !== next ? ' settings-password-input--error' : ''}`}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Ulangi kata sandi baru"
              required
              type="password"
              value={confirm}
            />
            {confirm && confirm !== next && (
              <span className="settings-password-hint settings-password-hint--error">Kata sandi tidak cocok.</span>
            )}
          </div>

          <div className="settings-password-actions">
            <button
              className="btn-primary settings-btn--compact"
              disabled={saving || !current || !next || !confirm}
              type="submit"
            >
              {saving ? 'Menyimpan…' : 'Simpan Kata Sandi'}
            </button>
            <button
              className="btn-secondary settings-btn--compact"
              onClick={onLogout}
              type="button"
            >
              Keluar &amp; Login Ulang
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

const NOTIF_PREFS_KEY = 'atlas.notif.prefs'

function loadNotifPrefs() {
  try { return JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) ?? '{}') } catch { return {} }
}

function loadThemePreference(): ThemePreference {
  return getStoredThemePreference()
}

export function SettingsView() {
  const { currentUser, systemStatus, requestLogout } = useWorkspace()

  const [activeNav, setActiveNav] = useState('Notifications')

  // ── Notification preferences ──────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => ({
    inApp: true,
    mentions: true,
    approvals: true,
    statusUpdates: true,
    meetingReminders: true,
    ...loadNotifPrefs(),
  }))

  const saveNotifPref = (key: string, value: boolean) => {
    const next = { ...notifPrefs, [key]: value }
    setNotifPrefs(next)
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next))
  }

  // ── Appearance preferences ────────────────────────────────────────────
  const [fontSize, setFontSize] = useState<string>(() => localStorage.getItem('atlas.fontSize') ?? 'normal')
  const [sidebarCompact, setSidebarCompact] = useState(() => localStorage.getItem('atlas.sidebarCompact') === 'true')
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getThemeSnapshot().resolved)

  useEffect(() => {
    return subscribeThemeChange(({ preference, resolved }) => {
      setThemePreference(preference)
      setResolvedTheme(resolved)
    })
  }, [])

  const applyFontSize = (size: string) => {
    setFontSize(size)
    localStorage.setItem('atlas.fontSize', size)
    document.documentElement.style.fontSize = size === 'small' ? '13px' : size === 'large' ? '15px' : '14px'
  }

  const applySidebarCompact = (compact: boolean) => {
    setSidebarCompact(compact)
    localStorage.setItem('atlas.sidebarCompact', String(compact))
    document.documentElement.setAttribute('data-sidebar', compact ? 'compact' : 'normal')
  }

  const applyTheme = (next: ThemePreference) => {
    const snapshot = applyThemePreference(next)
    setThemePreference(snapshot.preference)
    setResolvedTheme(snapshot.resolved)
  }

  const workspaceRows = [
    { label: 'Workspace', value: 'PTPN III · KMR Directorate' },
    { label: 'Peran Anda', value: currentUser?.positionTitle ?? currentUser?.roleType ?? '—' },
    { label: 'Environment', value: 'Production' },
    { label: 'Database', value: systemStatus?.persistence.mode === 'database' ? 'PostgreSQL ✓' : 'Fallback Mode' },
    { label: 'API Service', value: systemStatus?.service ?? 'ATLAS Backend' },
    { label: 'Last Update', value: systemStatus?.timestamp ? new Date(systemStatus.timestamp).toLocaleString('id-ID') : '–' },
  ]

  return (
    <div className="ds settings-v2 view-settings">
      {/* `ds-stagger`: Phase 5 motion standardization. Page ini tidak punya
          modal sama sekali, jadi cukup tambah class — modal-safe by default. */}
      <div className="settings-v2__inner ds-stagger">

      {/* Page header */}
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Settings</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Kelola profil, preferensi, dan pengaturan workspace.</span>
      </div>

      <div className="settings-workspace">

        {/* ── Left nav ── */}
        <nav className="settings-nav">
          {NAV_ITEMS.map(({ id, icon }) => (
            <button
              className={`settings-nav__item${activeNav === id ? ' settings-nav__item--active' : ''}`}
              key={id}
              onClick={() => setActiveNav(id)}
              type="button"
            >
              <span className="settings-nav__icon">{icon}</span>
              <span>{id}</span>
            </button>
          ))}
        </nav>

        {/* ── Content ── */}
        <div className="settings-content">

          {/* Notifications */}
          {activeNav === 'Notifications' && (() => {
            const NOTIF_DEFAULTS: Record<string, boolean> = {
              inApp: true, mentions: true, approvals: true, statusUpdates: true, meetingReminders: true,
            }
            const NOTIF_GROUPS = [
              {
                title: 'Umum',
                items: [
                  { key: 'inApp', label: 'Notifikasi In-App', desc: 'Tampilkan badge dan panel notifikasi' },
                ],
              },
              {
                title: 'Komunikasi',
                items: [
                  { key: 'mentions', label: 'Mention & Balasan', desc: 'Saat seseorang menyebut nama Anda di pesan' },
                ],
              },
              {
                title: 'Program & Approval',
                items: [
                  { key: 'approvals', label: 'Permintaan Approval', desc: 'Persetujuan laporan dan tindak lanjut' },
                  { key: 'statusUpdates', label: 'Update Status Program', desc: 'Perubahan status program yang Anda ikuti' },
                ],
              },
              {
                title: 'Meeting',
                items: [
                  { key: 'meetingReminders', label: 'Pengingat Meeting', desc: 'Reminder 15 menit sebelum meeting' },
                ],
              },
            ]
            const resetDefaults = () => {
              setNotifPrefs({ ...NOTIF_DEFAULTS })
              localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(NOTIF_DEFAULTS))
            }
            const hasCustomPrefs = Object.entries(NOTIF_DEFAULTS).some(([k, v]) => (notifPrefs[k] ?? true) !== v)
            return (
              <div className="section-block">
                <div className="section-header">
                  <div>
                    <h3 className="section-title">Notifications</h3>
                    <p className="section-subtitle">Atur preferensi notifikasi dan alerts per kategori.</p>
                  </div>
                  <button
                    className="btn-secondary settings-btn--compact"
                    disabled={!hasCustomPrefs}
                    onClick={resetDefaults}
                    type="button"
                  >
                    Reset default
                  </button>
                </div>
                <div className="settings-notif-groups">
                  {NOTIF_GROUPS.map(group => (
                    <div className="settings-notif-group" key={group.title}>
                      <div className="settings-notif-group__title">{group.title}</div>
                      <div className="settings-list settings-list--spaced">
                        {group.items.map(({ key, label, desc }) => (
                          <div className="list-row settings-list-row" key={key}>
                            <div className="settings-list-row__meta">
                              <div className="settings-list-row__title">{label}</div>
                              <div className="settings-list-row__desc">{desc}</div>
                            </div>
                            <ToggleSwitch
                              checked={notifPrefs[key] ?? true}
                              onChange={v => saveNotifPref(key, v)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Appearance */}
          {activeNav === 'Appearance' && (
            <div className="section-block">
              <div className="section-header">
                <div>
                  <h3 className="section-title">Appearance</h3>
                  <p className="section-subtitle">Tampilan dan kenyamanan ATLAS workspace.</p>
                </div>
              </div>
              <div className="settings-list settings-list--spaced">

                <div className="list-row settings-list-row settings-list-row--stacked">
                  <div className="settings-list-row__meta">
                    <div className="settings-list-row__title">Tema</div>
                    <div className="settings-list-row__desc">
                      {themePreference === 'system'
                        ? `Ikuti pengaturan sistem. Tema aktif saat ini: ${resolvedTheme === 'dark' ? 'Gelap' : 'Terang'}.`
                        : `Tema aktif ditetapkan ke mode ${themePreference === 'dark' ? 'gelap' : 'terang'}.`}
                    </div>
                  </div>
                  <div className="settings-theme-cards" role="radiogroup" aria-label="Tema">
                    {([
                      {
                        key: 'light',
                        label: 'Terang',
                        hint: 'Default',
                        preview: 'light',
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="8" cy="8" r="3" />
                            <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5 3.4 3.4" />
                          </svg>
                        ),
                      },
                      {
                        key: 'dark',
                        label: 'Gelap',
                        hint: 'Low-light',
                        preview: 'dark',
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M13 10.5A5.5 5.5 0 0 1 5.5 3a0.4 0.4 0 0 0-0.5-0.5A6 6 0 1 0 13.5 11a0.4 0.4 0 0 0-0.5-0.5Z" />
                          </svg>
                        ),
                      },
                      {
                        key: 'system',
                        label: 'Sistem',
                        hint: 'Auto',
                        preview: 'system',
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="3" width="12" height="8.5" rx="1.2" />
                            <path d="M6 14h4M8 11.5V14" />
                          </svg>
                        ),
                      },
                    ] as const).map(card => (
                      <button
                        aria-pressed={themePreference === card.key}
                        className="settings-theme-card"
                        key={card.key}
                        onClick={() => applyTheme(card.key as ThemePreference)}
                        role="radio"
                        aria-checked={themePreference === card.key}
                        type="button"
                      >
                        <span className={`settings-theme-card__preview settings-theme-card__preview--${card.preview}`}>{card.icon}</span>
                        <span className="settings-theme-card__label">{card.label}</span>
                        <span className="settings-theme-card__hint">{card.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="list-row settings-list-row">
                  <div className="settings-list-row__meta">
                    <div className="settings-list-row__title">Ukuran Teks</div>
                    <div className="settings-list-row__desc">Sesuaikan ukuran teks antarmuka</div>
                  </div>
                  <div className="settings-segmented" role="radiogroup" aria-label="Ukuran Teks">
                    {(['small','normal','large'] as const).map(sz => (
                      <button
                        aria-checked={fontSize === sz}
                        className={`settings-segmented__btn${fontSize === sz ? ' is-active' : ''}`}
                        key={sz}
                        onClick={() => applyFontSize(sz)}
                        role="radio"
                        type="button"
                      >
                        {sz === 'small' ? 'Kecil' : sz === 'large' ? 'Besar' : 'Normal'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="list-row settings-list-row">
                  <div className="settings-list-row__meta">
                    <div className="settings-list-row__title">Sidebar Kompak</div>
                    <div className="settings-list-row__desc">Tampilkan sidebar dengan lebih padat</div>
                  </div>
                  <ToggleSwitch checked={sidebarCompact} onChange={applySidebarCompact} />
                </div>

              </div>

              <div className="settings-footnote">
                <strong>Pintasan:</strong> Tekan <kbd>⌘K</kbd> untuk membuka command palette. Perubahan tampilan tersimpan otomatis di perangkat ini.
              </div>
            </div>
          )}

          {/* Security */}
          {activeNav === 'Security' && (
            <>
              <SecuritySection onLogout={requestLogout} />
              <div className="settings-footnote">
                <strong>Tips keamanan:</strong> Gunakan kata sandi minimal 12 karakter dengan kombinasi huruf, angka, dan simbol. Jangan gunakan ulang kata sandi yang sudah dipakai di layanan lain.
              </div>
            </>
          )}

          {/* Workspace */}
          {activeNav === 'Workspace' && (
            <>
              <div className="section-block">
                <div className="section-header">
                  <div>
                  <h3 className="section-title">Workspace Info</h3>
                  <p className="section-subtitle">Informasi teknis ATLAS workspace.</p>
                </div>
              </div>
                <div className="settings-list settings-list--compact">
                  {workspaceRows.map(({ label, value }) => (
                    <div className="list-row settings-list-row" key={label}>
                      <span className="settings-list-row__label">{label}</span>
                      <InfoValue label={label} value={value} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger zone */}
              <div className="section-block settings-danger-zone">
                <div className="section-header">
                  <h3 className="section-title settings-danger-title">Danger Zone</h3>
                </div>
                <div className="settings-danger-row">
                  <div className="settings-list-row__meta">
                    <div className="settings-list-row__title">Keluar dari workspace</div>
                    <div className="settings-list-row__desc">
                      Sesi Anda akan diakhiri dan token dihapus.
                    </div>
                  </div>
                  <button
                    className="settings-danger-btn"
                    onClick={() => requestLogout()}
                    type="button"
                  >
                    Keluar
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
      </div>
    </div>
  )
}

export default SettingsView
