import { useState, useEffect } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { formatRoleLabel } from '../lib/roleLabel'
import './ProfileView.css'

// ── Types ──────────────────────────────────────────────────────────────────

type PersonNode = {
  id: number
  name: string
  roleType: string
  positionTitle?: string | null
  avatarUrl?: string | null
}

// Backend returns flat User[] for both supervisor chain and subordinates.
// supervisorChain[0] = atasan langsung, [1] = atasan dari atasan, etc.

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
  supervisorChain: PersonNode[]
  subordinates: PersonNode[]
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

// PTPN role hierarchy weight — higher = more senior. Used to sort
// subordinate / supervisor lists from senior to junior.
const ROLE_RANK: Record<string, number> = {
  SUPERADMIN: 100,
  ADMIN: 90,
  BOD: 80,
  KADIV: 70,
  KASUBDIV: 60,
  ASISTEN: 50,
  OFFICER: 40,
}

function roleRank(role?: string | null): number {
  return ROLE_RANK[role?.toUpperCase() ?? ''] ?? 0
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
  if (h >= 1) return `${h}h ${m}m`
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
          {person ? name : <em className="org-node__empty-name">Vacant</em>}
        </div>
        <div className="org-node__pos">{positionName}</div>
        {role && (
          <span className="profile-role-badge org-node__role-badge" data-tone={tone}>{formatRoleLabel(role)}</span>
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
  const [showEditForm, setShowEditForm] = useState(false)

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
      .catch((err) => { console.error('[Atlas] Silent failure in ProfileView.tsx:', err); setActivityData(null) })
      .finally(() => setActivityLoading(false))
  }, [currentUser?.id, activityRange])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveError(null)
    try {
      await api.put('/profile', { name: formName, email: formEmail })
      setProfileData(prev => prev ? { ...prev, user: { ...prev.user, name: formName, email: formEmail } } : prev)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  const user = profileData?.user ?? (currentUser as unknown as ProfileUser | null)
  const supervisorChain = profileData?.supervisorChain ?? []
  // Sort subordinates by role rank (senior first), then by name within same rank.
  const subordinates = [...(profileData?.subordinates ?? [])].sort((a, b) => {
    const rankDiff = roleRank(b.roleType) - roleRank(a.roleType)
    if (rankDiff !== 0) return rankDiff
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
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
    <div className="ds profile-v2 view-profile">
      <div className="section-block profile-loading">
        <span className="profile-empty-note">Loading profile…</span>
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
    ? 'Reports directly to the Board of Directors.'
    : 'No supervisor on record.'

  return (
    <div className="ds profile-v2 view-profile">
      {/* `ds-stagger` di inner wrapper — content sections cascade fade-up.
          Migrasi dari pv-section-enter ke utility shared (Phase 2 motion
          standardization). Inner column stagger (pv-body__col > *) di-drop
          — column children muncul bersamaan dengan parent column. */}
      <div className="profile-v2__inner ds-stagger">
        <div className="view-toolbar">
          <h2 className="view-toolbar__title">My Profile</h2>
          <div className="view-toolbar__sep" />
          <span className="view-toolbar__subtitle">View and update your account information and preferences.</span>
        </div>

        {/* ─── HERO BAND ─────────────────────────────────────── */}
        <section className="pv-hero" aria-label="Identity">
          <div className={`pv-hero__avatar`} data-tone={userRoleTone}>
            {user ? initials(user.name) : '?'}
          </div>
          <div className="pv-hero__body">
            <h2 className="pv-hero__name">{user?.name ?? '—'}</h2>
            <p className="pv-hero__pos">{user?.position?.name ?? user?.positionTitle ?? 'Position not assigned'}</p>
            <div className="pv-hero__badges">
              {user?.roleType && (
                <span className="profile-role-badge" data-tone={userRoleTone}>{formatRoleLabel(user.roleType)}</span>
              )}
              {user?.position?.levelCode && (
                <span className="profile-role-badge profile-role-badge--level" data-tone="gray">{user.position.levelCode}</span>
              )}
              <span className="profile-role-badge profile-role-badge--completeness" data-tone={profileCompleteness === 100 ? 'green' : 'yellow'}>
                {profileCompleteness === 100 ? '✓ Complete' : `${profileCompleteness}%`}
              </span>
            </div>
          </div>
          <button
            className={`pv-hero__edit-btn${showEditForm ? ' is-open' : ''}`}
            onClick={() => setShowEditForm(v => !v)}
            type="button"
          >
            {showEditForm ? 'Close editor' : '✏ Edit profile'}
          </button>
        </section>

        {/* ─── EDIT FORM (collapsible) ────────────────────────── */}
        {showEditForm && (
          <section className="pv-section pv-form-section" aria-label="Edit profile">
            <form className="pv-form" onSubmit={handleSave}>
              <div className="pv-form__row">
                <div className="pv-form__field">
                  <label className="pv-form__label" htmlFor="p-name">Name</label>
                  <input
                    className="pv-input"
                    disabled={saving}
                    id="p-name"
                    onChange={e => setFormName(e.target.value)}
                    type="text"
                    value={formName}
                  />
                </div>
                <div className="pv-form__field">
                  <label className="pv-form__label" htmlFor="p-email">Email</label>
                  <div className="pv-input-wrap">
                    <input
                      className="pv-input pv-input--with-action"
                      disabled={saving}
                      id="p-email"
                      onChange={e => setFormEmail(e.target.value)}
                      type="email"
                      value={formEmail}
                    />
                    <button
                      aria-label="Copy email"
                      className="pv-input-action"
                      onClick={copyEmail}
                      title={emailCopied ? 'Copied!' : 'Copy email'}
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
              <div className="pv-form__actions">
                <span className={`pv-form__state${hasDirtyProfile ? ' is-dirty' : ''}`}>
                  {saved ? '✓ Saved' : saveError ? saveError : hasDirtyProfile ? 'You have unsaved changes' : 'Data in sync'}
                </span>
                <button className="pv-form__save" disabled={saving || !hasDirtyProfile} type="submit">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ─── BODY GRID (2-column to fill workspace width per pakem) ─── */}
        <div className="pv-body">

        {/* LEFT column */}
        <div className="pv-body__col pv-body__col--main">

        {/* ─── IDENTITAS ORGANISASI ──────────────────────────── */}
        <section className="pv-section" aria-label="Organization identity">
          <h3 className="pv-section__title">Organization Identity</h3>
          <dl className="pv-data-list">
            <div className="pv-data-row">
              <dt>NIK</dt>
              <dd>{user?.nik ?? <span className="pv-empty-inline">— Not available</span>}</dd>
            </div>
            <div className="pv-data-row">
              <dt>Email</dt>
              <dd>{user?.email ?? <span className="pv-empty-inline">— Not available</span>}</dd>
            </div>
            <div className="pv-data-row">
              <dt>Unit</dt>
              <dd>{user?.unit?.code ?? <span className="pv-empty-inline">—</span>}</dd>
            </div>
            <div className="pv-data-row">
              <dt>Directorate</dt>
              <dd>{user?.directorate?.name ?? <span className="pv-empty-inline">—</span>}</dd>
            </div>
            <div className="pv-data-row">
              <dt>Division</dt>
              <dd>{user?.unit?.name ?? <span className="pv-empty-inline">—</span>}</dd>
            </div>
            <div className="pv-data-row">
              <dt>Direct supervisor</dt>
              <dd>
                {supervisorChain[0]?.name
                  ? <>{supervisorChain[0].name} <span className="pv-data-row__sub">· {supervisorChain[0].positionTitle ?? formatRoleLabel(supervisorChain[0].roleType)}</span></>
                  : <span className="pv-empty-inline">{atasanEmptyText}</span>}
              </dd>
            </div>
            <div className="pv-data-row">
              <dt>Direct team</dt>
              <dd>
                {directReportsCount > 0
                  ? <>{directReportsCount} {directReportsCount === 1 ? 'person reports' : 'people report'} directly</>
                  : <span className="pv-empty-inline">No direct reports</span>}
              </dd>
            </div>
          </dl>
        </section>

        {/* ─── HIERARKI ──────────────────────────────────────── */}
        {user?.position && (
          <section className="pv-section" aria-label="Position hierarchy">
            <div className="pv-section__head">
              <h3 className="pv-section__title">Position Hierarchy</h3>
              <span className="pv-section__meta">{supervisorChain.length} supervisors · {directReportsCount} reports</span>
            </div>
            <div className="pv-org-map">
              <div className="pv-org-lane">
                <div className="pv-org-lane__head">Supervisors</div>
                <div className="pv-org-lane__nodes">
                  {supervisorChain.length > 0 ? (
                    [...supervisorChain].reverse().map(person => (
                      <OrgNode key={person.id} person={person} positionName={person.positionTitle ?? formatRoleLabel(person.roleType)} />
                    ))
                  ) : <span className="pv-empty-inline">{atasanEmptyText}</span>}
                </div>
              </div>
              <div className="pv-org-lane pv-org-lane--self">
                <div className="pv-org-lane__head">My position</div>
                <div className="pv-org-lane__nodes">
                  <OrgNode person={user as PersonNode} positionName={user.position.name} isSelf />
                </div>
              </div>
              <div className="pv-org-lane">
                <div className="pv-org-lane__head">Direct reports</div>
                <div className="pv-org-lane__nodes">
                  {subordinates.length > 0 ? (
                    subordinates.map(person => (
                      <OrgNode key={person.id} person={person} positionName={person.positionTitle ?? formatRoleLabel(person.roleType)} />
                    ))
                  ) : <span className="pv-empty-inline">No direct reports</span>}
                </div>
              </div>
            </div>
          </section>
        )}

        </div> {/* /pv-body__col--main */}

        {/* RIGHT column */}
        <div className="pv-body__col pv-body__col--rail">

        {/* ─── AKTIVITAS ─────────────────────────────────────── */}
        <section className="pv-section" aria-label="Activity">
          <div className="pv-section__head">
            <div>
              <h3 className="pv-section__title">My Activity</h3>
              <p className="pv-section__sub">
                Last active: {activityLast}
                {activityData?.dailyBreakdown.length ? ` · ${activeDaysCount}/${activityData.dailyBreakdown.length} active days` : ''}
              </p>
            </div>
            <div className="pv-range-toggle">
              {(['7d', '30d'] as ActivityRange[]).map(r => (
                <button
                  className={`pv-range-chip${activityRange === r ? ' is-active' : ''}`}
                  key={r}
                  onClick={() => setActivityRange(r)}
                  type="button"
                >{r}</button>
              ))}
            </div>
          </div>
          {activityLoading ? (
            <p className="pv-empty-inline">Loading activity data…</p>
          ) : !activityData ? (
            <p className="pv-empty-inline">Activity data not available.</p>
          ) : (
            <>
              <div className="pv-kpi-row">
                <div className="pv-kpi">
                  <span className="pv-kpi__value">{fmtDuration(activityData.totalDurationMs)}</span>
                  <span className="pv-kpi__label">Total active</span>
                </div>
                <div className="pv-kpi">
                  <span className="pv-kpi__value">{activityData.sessionCount}</span>
                  <span className="pv-kpi__label">Sessions</span>
                </div>
                <div className="pv-kpi">
                  <span className="pv-kpi__value">{fmtDuration(activityData.avgSessionDurationMs)}</span>
                  <span className="pv-kpi__label">Avg. session</span>
                </div>
                <div className="pv-kpi">
                  <span className="pv-kpi__value">{activeDaysCount}</span>
                  <span className="pv-kpi__label">Active days</span>
                </div>
              </div>
              {activityData.dailyBreakdown.length > 0 && (() => {
                const maxMs = Math.max(...activityData.dailyBreakdown.map(d => d.durationMs), 1)
                const peakDay = activityData.dailyBreakdown.reduce((a, b) => b.durationMs > a.durationMs ? b : a)
                return (
                  <div className="pv-chart-wrap">
                    <div className="pv-chart-meta">
                      <span className="pv-chart-meta__label">Peak</span>
                      <span className="pv-chart-meta__value">
                        {fmtDuration(peakDay.durationMs)} · {fmtDayLabel(peakDay.date)}
                      </span>
                    </div>
                    <div className="pv-chart">
                      {activityData.dailyBreakdown.map(day => (
                        <div className="pv-chart-col" key={day.date} title={`${fmtDayLabel(day.date)}: ${fmtDuration(day.durationMs)}`}>
                          <span className="pv-chart-col__val">{day.durationMs > 0 ? fmtDuration(day.durationMs) : ''}</span>
                          <div className="pv-chart-bar" style={{ height: `${Math.max(4, Math.round((day.durationMs / maxMs) * 100))}%` }} />
                          <span className="pv-chart-col__label">{new Date(day.date).getDate()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </section>

        {/* ─── RIWAYAT JABATAN (timeline) ──────────────────── */}
        <section className="pv-section" aria-label="Position history">
          <div className="pv-section__head">
            <div>
              <h3 className="pv-section__title">Position History</h3>
              <p className="pv-section__sub">
                {latestHistoryEntry ? `Last change ${fmtDate(latestHistoryEntry.startDate)}.` : 'Timeline of position changes and transfers.'}
              </p>
            </div>
            {positionHistory.length > 0 && <span className="pv-section__badge">{positionHistory.length}</span>}
          </div>
          {historyEntries.length > 0 ? (
            <ul className="pv-timeline">
              {historyEntries.map(entry => (
                <li key={entry.id} className={`pv-timeline__item${!entry.endDate ? ' is-current' : ''}`}>
                  <span className="pv-timeline__dot" aria-hidden="true" />
                  <div className="pv-timeline__content">
                    <div className="pv-timeline__head">
                      {entry.position?.code && <span className="code-badge">{entry.position.code}</span>}
                      <span className="pv-timeline__title">{entry.position?.name ?? '—'}</span>
                      <span className="code-badge">{entry.mutationType}</span>
                      {!entry.endDate && <span className="pv-timeline__active">Active</span>}
                    </div>
                    <div className="pv-timeline__date">
                      {fmtDate(entry.startDate)}
                      {entry.endDate ? ` — ${fmtDate(entry.endDate)}` : ' — present'}
                    </div>
                    {entry.mutationReason && <div className="pv-timeline__note">{entry.mutationReason}</div>}
                    {entry.skNumber && <div className="pv-timeline__sk">SK: <span className="code-badge">{entry.skNumber}</span></div>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pv-empty-inline">No transfers recorded yet. Position history will appear here after a position change.</p>
          )}
        </section>

        </div> {/* /pv-body__col--rail */}
        </div> {/* /pv-body */}

      </div>
    </div>
  )
}

export default ProfileView
