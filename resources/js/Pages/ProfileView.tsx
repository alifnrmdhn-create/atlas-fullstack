import { useState, useEffect } from 'react'
import { useWorkspace } from '../context/workspace'
import { api } from '../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

type PersonNode = {
  id: number
  name: string
  roleType: string
  positionTitle?: string | null
  avatarUrl?: string | null
}

type ChainEntry = {
  positionId: number
  positionName: string
  users: PersonNode[]
}

type HistoryEntry = {
  id: number
  startDate: string
  endDate?: string
  mutationType: string
  mutationReason?: string
  skNumber?: string
  position?: { id: number; code: string; name: string; levelCode: string }
}

type ProfileUser = {
  id: number
  userId?: string
  nik?: string
  name: string
  email: string
  roleType: string
  positionTitle?: string
  avatarUrl?: string
  isActive: boolean
  availableRoles?: string[]
  directorate?: { id: number; code: string; name: string }
  unit?: { id: number; code: string; name: string }
  position?: { id: number; code: string; name: string; levelCode: string; roleType: string; reportsToPositionId?: number }
  manager?: PersonNode | null
}

type ProfileResponse = {
  user: ProfileUser
  supervisorChain: ChainEntry[]
  subordinates: ChainEntry[]
  positionHistory: HistoryEntry[]
}

type ActivityRange = '7d' | '30d'

type DailyBreakdown = { date: string; durationMs: number }

type ActivityData = {
  totalDurationMs: number
  sessionCount: number
  avgSessionDurationMs: number
  lastActiveAt: string | null
  dailyBreakdown: DailyBreakdown[]
  from: string
  to: string
  range: string
}

type RoleTone = 'red' | 'yellow' | 'green' | 'blue' | 'gray'

const ROLE_TONE: Record<string, RoleTone> = {
  SUPERADMIN: 'red',
  ADMIN: 'blue',
  BOD: 'red',
  KADIV: 'yellow',
  KASUBDIV: 'yellow',
  ASISTEN: 'green',
  OFFICER: 'green',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDuration(ms: number): string {
  if (ms === 0) return '0m'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 1) return `${h}j ${m}m`
  return `${m}m`
}

function fmtDayLabel(date: string): string {
  return new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function roleTone(role?: string | null): RoleTone {
  return ROLE_TONE[role?.toUpperCase() ?? ''] ?? 'gray'
}

// ── OrgNode component ──────────────────────────────────────────────────────

function OrgNode({ person, positionName, isSelf = false }:
  { person?: PersonNode | null; positionName: string; isSelf?: boolean }) {
  const name = person?.name ?? '—'
  const role = person?.roleType ?? ''
  const tone = roleTone(role)

  return (
    <div className={`org-node${isSelf ? ' org-node--self' : ''}`} data-tone={tone}>
      <div className={`org-node__avatar${isSelf ? ' org-node__avatar--self' : ''}`} data-tone={isSelf ? 'yellow' : tone}>
        {person ? initials(name) : '?'}
      </div>
      <div className="org-node__info">
        <div className="org-node__name">
          {person ? name : <em className="org-node__empty-name">Lowongan</em>}
        </div>
        <div className="org-node__pos">{positionName}</div>
        {role && (
          <span className="profile-role-badge org-node__role-badge" data-tone={tone}>{role}</span>
        )}
      </div>
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

export function ProfileView() {
  const { currentUser } = useWorkspace()

  const [profileData, setProfileData] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activityData, setActivityData] = useState<ActivityData | null>(null)
  const [activityRange, setActivityRange] = useState<ActivityRange>('7d')
  const [activityLoading, setActivityLoading] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get<ProfileResponse>('/profile').then((data) => {
      if (cancelled) return
      setProfileData(data)
      setFormName(data.user?.name ?? '')
      setFormEmail(data.user?.email ?? '')
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!currentUser?.id) return
    setActivityLoading(true)
    api.get<{ data: ActivityData }>(`/analytics/user-activity/${currentUser.id}?range=${activityRange}`)
      .then(r => setActivityData(r.data))
      .catch(() => setActivityData(null))
      .finally(() => setActivityLoading(false))
  }, [currentUser?.id, activityRange])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveError(null)
    try {
      await api.put('/profile', { name: formName, email: formEmail })
      setProfileData(prev => prev ? { ...prev, user: { ...prev.user, name: formName, email: formEmail } } : prev)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (err) { setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const user = profileData?.user ?? (currentUser as unknown as ProfileUser | null)
  const supervisorChain = profileData?.supervisorChain ?? []
  const subordinates = profileData?.subordinates ?? []
  const positionHistory = profileData?.positionHistory ?? []
  const directReportsCount = subordinates.length
  const hierarchyCount = supervisorChain.length + (user?.position ? 1 : 0) + directReportsCount
  const hasDirtyProfile = Boolean(user) && (formName !== (user?.name ?? '') || formEmail !== (user?.email ?? ''))
  const profileFields = [user?.name, user?.email, user?.nik, user?.unit, user?.directorate, user?.position]
  const profileCompleteness = user ? Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100) : 0
  const historyEntries = [...positionHistory].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
  const latestHistoryEntry = historyEntries[0] ?? null
  const activityLast = activityData?.lastActiveAt ? fmtDate(activityData.lastActiveAt) : '—'
  const activeDaysCount = activityData?.dailyBreakdown.filter(day => day.durationMs > 0).length ?? 0

  if (loading) return (
    <div className="view-profile">
      <div className="section-block profile-loading">
        <span className="profile-empty-note">Memuat profil…</span>
      </div>
    </div>
  )

  const userRoleTone = roleTone(user?.roleType)
  const copyEmail = async () => {
    if (!user?.email) return
    try {
      await navigator.clipboard.writeText(user.email)
      setEmailCopied(true)
      setTimeout(() => setEmailCopied(false), 1600)
    } catch { /* ignore */ }
  }
  const atasanEmptyText = user?.position?.levelCode === 'BOD' || user?.position?.levelCode === 'BOD-1'
    ? 'Melapor langsung ke Direksi.'
    : 'Tidak ada atasan terdaftar.'

  return (
    <div className="view-profile">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Profil Saya</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Lihat dan perbarui informasi akun serta preferensi Anda.</span>
      </div>

      <div className="profile-layout profile-layout--dashboard">
        <section className="section-block profile-panel profile-panel--identity" aria-label="Informasi pribadi">
          <div className="profile-identity-hero">
            <div className="profile-identity-hero__avatar" data-tone={userRoleTone}>
              {user ? initials(user.name) : '?'}
            </div>
            <div className="profile-identity-hero__body">
              <h2 className="profile-identity-hero__name">{user?.name ?? '—'}</h2>
              <p className="profile-identity-hero__pos">{user?.position?.name ?? user?.positionTitle ?? 'Jabatan belum ditetapkan'}</p>
              <div className="profile-identity-hero__badges">
                {user?.roleType && (
                  <span className="profile-role-badge" data-tone={userRoleTone}>{user.roleType}</span>
                )}
                {user?.position?.levelCode && (
                  <span className="profile-role-badge profile-role-badge--level" data-tone="gray">{user.position.levelCode}</span>
                )}
                <span className="profile-role-badge profile-role-badge--completeness" data-tone={profileCompleteness === 100 ? 'green' : 'yellow'}>
                  {profileCompleteness === 100 ? '✓ Profil lengkap' : `Profil ${profileCompleteness}%`}
                </span>
              </div>
            </div>
          </div>

          <div className="profile-identity-body">
            <form className="profile-form" onSubmit={handleSave}>
              <div className="profile-form__row">
                <div className="profile-form__field">
                  <label className="profile-form__label" htmlFor="p-name">Nama</label>
                  <input
                    className="profile-input"
                    disabled={saving}
                    id="p-name"
                    onChange={e => setFormName(e.target.value)}
                    type="text"
                    value={formName}
                  />
                </div>
                <div className="profile-form__field">
                  <label className="profile-form__label" htmlFor="p-email">Email</label>
                  <div className="profile-input-wrap">
                    <input
                      className="profile-input profile-input--with-action"
                      disabled={saving}
                      id="p-email"
                      onChange={e => setFormEmail(e.target.value)}
                      type="email"
                      value={formEmail}
                    />
                    <button
                      aria-label="Salin email"
                      className="profile-input-action"
                      onClick={copyEmail}
                      title={emailCopied ? 'Tersalin!' : 'Salin email'}
                      type="button"
                    >
                      {emailCopied ? (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 8.5 6.5 12 13 4.5" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="5" y="5" width="9" height="9" rx="1.6" />
                          <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="profile-form__actions">
                <div className={`profile-save-state${hasDirtyProfile ? ' is-dirty' : ''}`}>
                  <span>{hasDirtyProfile ? 'Ada perubahan belum disimpan' : 'Data tersinkron'}</span>
                  {saved && <strong>Tersimpan</strong>}
                  {saveError && <strong className="profile-save-state__error">{saveError}</strong>}
                </div>
                <button className="profile-save-btn" disabled={saving || !hasDirtyProfile} type="submit">
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </form>

            <div className="profile-fact-grid" aria-label="Detail organisasi">
              <div className="profile-fact">
                <span>NIK</span>
                <strong>{user?.nik ?? '—'}</strong>
              </div>
              <div className="profile-fact">
                <span>Unit</span>
                <strong>{user?.unit?.code ?? '—'}</strong>
              </div>
              <div className="profile-fact profile-fact--wide">
                <span>Direktorat</span>
                <strong>{user?.directorate?.name ?? '—'}</strong>
              </div>
              <div className="profile-fact profile-fact--wide">
                <span>Divisi</span>
                <strong>{user?.unit?.name ?? '—'}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block profile-panel profile-panel--hierarchy">
              <div className="section-header">
                <div>
                  <h3 className="section-title">Hierarki Jabatan</h3>
                  <p className="section-subtitle">Struktur posisi dan lini pelaporan saat ini.</p>
                </div>
              </div>

              {!user?.position ? (
                <p className="profile-empty-note">Belum ada jabatan yang ditetapkan.</p>
              ) : (
                <div className="profile-hierarchy-body">
                  <div className="profile-structure-stats" aria-label="Ringkasan struktur">
                    <div className="profile-structure-stat">
                      <strong>{supervisorChain.length}</strong>
                      <span>lapis atasan</span>
                    </div>
                    <div className="profile-structure-stat">
                      <strong>{hierarchyCount}</strong>
                      <span>titik relasi</span>
                    </div>
                    <div className="profile-structure-stat">
                      <strong>{directReportsCount}</strong>
                      <span>tim langsung</span>
                    </div>
                  </div>

                  <div className="profile-org-map" aria-label="Peta relasi jabatan">
                    <section className="profile-org-lane">
                      <div className="profile-org-lane__header">
                        <span>Atasan</span>
                        <strong>{supervisorChain.length}</strong>
                      </div>
                      <div className="profile-org-lane__nodes">
                        {supervisorChain.length > 0 ? (
                          [...supervisorChain].reverse().map(entry => (
                            <OrgNode key={entry.positionId} person={entry.users[0] ?? null} positionName={entry.positionName} />
                          ))
                        ) : (
                          <p className="profile-empty-note profile-org-empty">{atasanEmptyText}</p>
                        )}
                      </div>
                    </section>

                    <section className="profile-org-lane profile-org-lane--self">
                      <div className="profile-org-lane__header">
                        <span>Posisi saat ini</span>
                        <strong>{user.position.levelCode}</strong>
                      </div>
                      <div className="profile-org-lane__nodes">
                        <OrgNode person={user as PersonNode} positionName={user.position.name} isSelf />
                      </div>
                    </section>

                    <section className="profile-org-lane">
                      <div className="profile-org-lane__header">
                        <span>Bawahan</span>
                        <strong>{subordinates.length}</strong>
                      </div>
                      <div className="profile-org-lane__nodes profile-org-lane__nodes--subordinates">
                        {subordinates.length > 0 ? (
                          subordinates.map(entry => (
                            <OrgNode key={entry.positionId} person={entry.users[0] ?? null} positionName={entry.positionName} />
                          ))
                        ) : (
                          <p className="profile-empty-note profile-org-empty">Tidak ada bawahan langsung.</p>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </section>

            <section className="section-block profile-panel profile-panel--activity">
                <div className="section-header">
                  <div>
                    <h3 className="section-title">Aktivitas Saya</h3>
                    <p className="section-subtitle">
                      Terakhir aktif: {activityLast}
                      {activityData?.dailyBreakdown.length ? ` · ${activeDaysCount}/${activityData.dailyBreakdown.length} hari aktif` : ''}
                    </p>
                  </div>
                  <div className="profile-range-toggle">
                    {(['7d', '30d'] as ActivityRange[]).map(r => (
                      <button
                        className={`range-chip${activityRange === r ? ' range-chip--active' : ''}`}
                        key={r}
                        onClick={() => setActivityRange(r)}
                        type="button"
                      >{r}</button>
                    ))}
                  </div>
                </div>

                {activityLoading ? (
                  <div className="profile-activity-loading">Memuat data aktivitas…</div>
                ) : !activityData ? (
                  <div className="profile-empty-note">Data aktivitas tidak tersedia.</div>
                ) : (
                  <div className="profile-activity-body">
                    <div className="profile-activity-stats">
                      <div className="profile-activity-stat">
                        <span className="profile-activity-stat__value">{fmtDuration(activityData.totalDurationMs)}</span>
                        <span className="profile-activity-stat__label">Total aktif</span>
                      </div>
                      <div className="profile-activity-stat">
                        <span className="profile-activity-stat__value">{activityData.sessionCount}</span>
                        <span className="profile-activity-stat__label">Sesi</span>
                      </div>
                      <div className="profile-activity-stat">
                        <span className="profile-activity-stat__value">{fmtDuration(activityData.avgSessionDurationMs)}</span>
                        <span className="profile-activity-stat__label">Rata-rata sesi</span>
                      </div>
                    </div>

                    {activityData.dailyBreakdown.length > 0 && (() => {
                      const maxMs = Math.max(...activityData.dailyBreakdown.map(d => d.durationMs), 1)
                      const peakDay = activityData.dailyBreakdown.reduce((a, b) => b.durationMs > a.durationMs ? b : a)
                      return (
                        <div className="profile-activity-chart-wrap">
                          <div className="profile-activity-chart-meta">
                            <span className="profile-activity-chart-meta__label">Puncak</span>
                            <span className="profile-activity-chart-meta__value">
                              {fmtDuration(peakDay.durationMs)} · {fmtDayLabel(peakDay.date)}
                            </span>
                          </div>
                          <div className="profile-activity-chart">
                            <div className="profile-activity-chart__grid" aria-hidden="true">
                              <span /><span /><span /><span />
                            </div>
                            {activityData.dailyBreakdown.map(day => (
                              <div className="profile-activity-bar-col" key={day.date} title={`${fmtDayLabel(day.date)}: ${fmtDuration(day.durationMs)}`}>
                                <span className="profile-activity-bar-col__val">{day.durationMs > 0 ? fmtDuration(day.durationMs) : ''}</span>
                                <div
                                  className="profile-activity-bar"
                                  style={{ height: `${Math.max(4, Math.round((day.durationMs / maxMs) * 78))}%` }}
                                />
                                <span className="profile-activity-bar__label">{new Date(day.date).getDate()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </section>

              <section className="section-block profile-panel profile-panel--history">
                <div className="section-header">
                  <div>
                    <h3 className="section-title">Riwayat Jabatan</h3>
                    <p className="section-subtitle">
                      {latestHistoryEntry ? `Perubahan terakhir ${fmtDate(latestHistoryEntry.startDate)}.` : 'Perubahan posisi dan mutasi terakhir.'}
                    </p>
                  </div>
                  <span className="section-badge">{positionHistory.length}</span>
                </div>
                {historyEntries.length > 0 ? (
                  <ul className="position-history-list position-history-list--timeline">
                    {historyEntries.map(entry => (
                      <li key={entry.id} className={`position-history-item${!entry.endDate ? ' is-current' : ''}`}>
                        <span className="position-history__dot" aria-hidden="true" />
                        <div className="position-history__content">
                          <div className="profile-history__head">
                            {entry.position?.code && <span className="code-badge profile-history__code">{entry.position.code}</span>}
                            <span className="profile-history__title">{entry.position?.name ?? '—'}</span>
                            <span className="code-badge profile-history__type">{entry.mutationType}</span>
                            {!entry.endDate && <span className="profile-history__current">Aktif</span>}
                          </div>
                          <div className="profile-history__date">
                            {fmtDate(entry.startDate)}
                            {entry.endDate ? ` — ${fmtDate(entry.endDate)}` : ' — sekarang'}
                          </div>
                          {entry.mutationReason && <div className="profile-history__note">{entry.mutationReason}</div>}
                          {entry.skNumber && <div className="profile-history__sk">SK: <span className="code-badge">{entry.skNumber}</span></div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="profile-history-empty">
                    <div className="profile-history-empty__icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </div>
                    <div className="profile-history-empty__body">
                      <strong>Belum ada mutasi</strong>
                      <span>Riwayat jabatan akan muncul di sini setelah ada perubahan posisi.</span>
                    </div>
                  </div>
                )}
        </section>
      </div>
    </div>
  )
}

export default ProfileView
