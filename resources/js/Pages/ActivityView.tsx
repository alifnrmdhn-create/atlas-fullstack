import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, formatRelativeTime, effectivePresenceSlug } from '../components/ui'
import { api } from '../lib/api'
import { useWorkspace } from '../hooks/useWorkspace'

// ── Types ────────────────────────────────────────────────────
type RangeOption = '7d' | '30d' | '90d'

type ActivityUser = {
  rank: number
  userId: number
  name: string
  positionTitle: string | null
  avatarUrl: string | null
  unit: { id: number; name: string } | null
  directorate: { id: number; name: string } | null
  totalDurationMs: number
  sessionCount: number
  lastActiveAt: string | null
  isOnline?: boolean
}

type SessionEntry = {
  id: number
  startedAt: string
  endedAt: string | null
  durationMs: number
  endReason: string | null
}

type DailyEntry = { date: string; durationMs: number }

type ActivityDetail = {
  user: {
    userId: number
    name: string
    positionTitle: string | null
    unit: { id: number; name: string } | null
    directorate: { id: number; name: string } | null
  }
  totalDurationMs: number
  sessionCount: number
  avgSessionDurationMs: number
  lastActiveAt: string | null
  sessions: SessionEntry[]
  dailyBreakdown: DailyEntry[]
  from: string
  to: string
}

// ── Formatters ───────────────────────────────────────────────
export function formatDuration(ms: number, level: 'full' | 'compact' = 'full'): string {
  const totalSec = Math.floor(ms / 1000)
  const s = totalSec % 60
  const totalMin = Math.floor(totalSec / 60)
  const m = totalMin % 60
  const h = Math.floor(totalMin / 60) % 24
  const d = Math.floor(totalMin / 60 / 24)

  if (level === 'compact') {
    if (d > 0) return `${d}h ${h}j`
    if (h > 0) return `${h}j ${m}m`
    if (m > 0) return `${m}m ${s}d`
    return `${s}d`
  }

  const parts: string[] = []
  if (d > 0) parts.push(`${d}h`)
  if (h > 0) parts.push(`${h}j`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}d`)
  return parts.join(' ')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDateShort(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function endReasonLabel(reason: string | null): string {
  if (reason === 'logout')         return 'Logout'
  if (reason === 'disconnect')     return 'Tutup tab'
  if (reason === 'idle')           return 'Idle'
  if (reason === 'server_restart') return 'Server restart'
  return reason ?? '—'
}

// ── Daily bar chart ───────────────────────────────────────────
function DailyBars({ data, maxMs }: { data: DailyEntry[]; maxMs: number }) {
  if (data.length === 0) return <div className="activity-daily-empty">Belum ada data harian</div>
  return (
    <div className="activity-daily-bars">
      {data.map(entry => {
        const pct = maxMs > 0 ? Math.max(2, Math.round((entry.durationMs / maxMs) * 100)) : 0
        return (
          <div className="activity-daily-bar-col" key={entry.date} title={`${formatDateShort(entry.date)}: ${formatDuration(entry.durationMs)}`}>
            <div className="activity-daily-bar-track">
              <div className="activity-daily-bar-fill" style={{ height: `${pct}%` }} />
            </div>
            <div className="activity-daily-bar-label">{formatDateShort(entry.date)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Detail panel ─────────────────────────────────────────────
function DetailPanel({ userId, range }: { userId: number; range: RangeOption }) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<{ data: ActivityDetail }>(`/analytics/user-activity/${userId}?range=${range}`)
      .then(res => setDetail(res.data))
      .catch((err) => { console.error('[Atlas] Silent failure in ActivityView.tsx:', err); setDetail(null) })
      .finally(() => setLoading(false))
  }, [userId, range])

  if (loading) return (
    <div className="activity-detail-panel">
      <div className="activity-detail-skeleton">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="activity-detail-skeleton__line" />)}
      </div>
    </div>
  )

  if (!detail) return (
    <div className="activity-detail-panel activity-detail-panel--empty">
      <span>Gagal memuat data</span>
    </div>
  )

  const maxDailyMs = Math.max(...detail.dailyBreakdown.map(d => d.durationMs), 1)
  const { text: lastActiveText } = detail.lastActiveAt ? formatRelativeTime(detail.lastActiveAt) : { text: '—' }

  return (
    <div className="activity-detail-panel">
      {/* Header */}
      <div className="activity-detail-header">
        <Avatar name={detail.user.name} size={36} />
        <div className="activity-detail-header__meta">
          <div className="activity-detail-header__name">{detail.user.name}</div>
          {detail.user.positionTitle && (
            <div className="activity-detail-header__pos">{detail.user.positionTitle}</div>
          )}
          {detail.user.unit && (
            <div className="activity-detail-header__unit">{detail.user.unit.name}</div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="activity-detail-stats">
        <div className="activity-detail-stat">
          <div className="activity-detail-stat__label">Total aktif</div>
          <div className="activity-detail-stat__value activity-detail-stat__value--primary">
            {formatDuration(detail.totalDurationMs)}
          </div>
        </div>
        <div className="activity-detail-stat">
          <div className="activity-detail-stat__label">Jumlah sesi</div>
          <div className="activity-detail-stat__value">{detail.sessionCount}</div>
        </div>
        <div className="activity-detail-stat">
          <div className="activity-detail-stat__label">Rata-rata sesi</div>
          <div className="activity-detail-stat__value">{formatDuration(detail.avgSessionDurationMs)}</div>
        </div>
        <div className="activity-detail-stat">
          <div className="activity-detail-stat__label">Terakhir aktif</div>
          <div className="activity-detail-stat__value">{lastActiveText}</div>
        </div>
      </div>

      {/* Daily breakdown */}
      {detail.dailyBreakdown.length > 0 && (
        <div className="activity-detail-section">
          <div className="activity-detail-section__title">Aktivitas harian</div>
          <DailyBars data={detail.dailyBreakdown} maxMs={maxDailyMs} />
        </div>
      )}

      {/* Recent sessions */}
      {detail.sessions.length > 0 && (
        <div className="activity-detail-section">
          <div className="activity-detail-section__title">Riwayat sesi</div>
          <div className="activity-sessions-list">
            {detail.sessions.slice(0, 20).map(s => (
              <div className="activity-session-row" key={s.id}>
                <div className="activity-session-row__times">
                  <span className="activity-session-row__date">{formatDate(s.startedAt)}</span>
                  <span className="activity-session-row__range">
                    {formatTime(s.startedAt)}
                    {' → '}
                    {s.endedAt ? formatTime(s.endedAt) : <em>aktif</em>}
                  </span>
                </div>
                <div className="activity-session-row__right">
                  <span className="activity-session-row__dur">{formatDuration(s.durationMs, 'compact')}</span>
                  {s.endReason && (
                    <span className="activity-session-row__reason">{endReasonLabel(s.endReason)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Leaderboard row ───────────────────────────────────────────
function LeaderRow({
  user, maxMs, isSelected, onClick, presenceMap,
}: {
  user: ActivityUser
  maxMs: number
  isSelected: boolean
  onClick: () => void
  presenceMap: Map<number, { status: string; lastActivityAt: string }>
}) {
  const barPct = maxMs > 0 && user.totalDurationMs > 0
    ? Math.max(2, Math.round((user.totalDurationMs / maxMs) * 100))
    : 0
  const { text: lastText } = user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : { text: '—' }
  const rankClass = user.rank === 1 ? 'gold' : user.rank === 2 ? 'silver' : user.rank === 3 ? 'bronze' : ''

  const p = presenceMap.get(user.userId)
  const isOnline = p ? effectivePresenceSlug(p.status, p.lastActivityAt) === 'online' : false

  return (
    <button
      className={`activity-leader-row${isSelected ? ' is-selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      <span className={`activity-leader-row__rank${rankClass ? ` activity-leader-row__rank--${rankClass}` : ''}`}>
        {user.rank}
      </span>
      <span className="activity-leader-row__avatar">
        <span className="activity-leader-row__avatar-wrap">
          <Avatar name={user.name} size={28} />
          {isOnline && <span className="activity-leader-row__online-dot" />}
        </span>
      </span>
      <span className="activity-leader-row__info">
        <span className="activity-leader-row__name">{user.name}</span>
        <span className="activity-leader-row__sub">
          {user.unit?.name ?? user.directorate?.name ?? '—'}
        </span>
      </span>
      <span className="activity-leader-row__dur">
        {user.totalDurationMs > 0 ? formatDuration(user.totalDurationMs, 'compact') : <em className="activity-leader-row__no-data">Baru online</em>}
      </span>
      <span className="activity-leader-row__bar-wrap">
        <span className="activity-leader-row__bar" style={{ width: `${barPct}%` }} />
      </span>
      <span className="activity-leader-row__sessions">{user.sessionCount > 0 ? `${user.sessionCount}×` : '—'}</span>
      <span className="activity-leader-row__last">{lastText}</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────
export function ActivityView() {
  const { presence } = useWorkspace()
  const [range, setRange]               = useState<RangeOption>('7d')
  const [users, setUsers]               = useState<ActivityUser[]>([])
  const [loading, setLoading]           = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [lastFetched, setLastFetched]   = useState<Date | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rangeRef = useRef(range)
  rangeRef.current = range

  const presenceMap = useMemo(
    () => new Map(presence.map(p => [p.userId, { status: p.status, lastActivityAt: p.lastActivityAt }])),
    [presence],
  )

  const fetchLeaderboard = useCallback((r: RangeOption, silent = false) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    if (!silent) setLoading(true)
    api.get<{ data: { users: ActivityUser[] } }>(`/analytics/user-activity?range=${r}`)
      .then(res => {
        setUsers(res.data.users)
        setLastFetched(new Date())
      })
      .catch((err) => console.error('[Atlas] Silent failure in ActivityView.tsx:', err))
      .finally(() => { if (!silent) setLoading(false) })
  }, [])

  useEffect(() => {
    fetchLeaderboard(range)
  }, [range, fetchLeaderboard])

  // Periodic refresh every 60s so duration values stay current without needing status changes
  useEffect(() => {
    const id = setInterval(() => fetchLeaderboard(rangeRef.current, true), 60_000)
    return () => clearInterval(id)
  }, [fetchLeaderboard])

  // Auto-refresh leaderboard when any user's presence changes (debounced 2s)
  const prevPresenceRef = useRef<typeof presence>([])
  useEffect(() => {
    const prev = prevPresenceRef.current
    prevPresenceRef.current = presence
    if (prev.length === 0) return // skip initial population

    const changed = presence.some((p) => {
      const old = prev.find(o => o.userId === p.userId)
      return !old || old.status !== p.status
    })
    if (!changed) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchLeaderboard(rangeRef.current, true)
    }, 2000)
  }, [presence, fetchLeaderboard])

  const maxMs = Math.max(...users.map(u => u.totalDurationMs), 1)

  const rangeLabels: Record<RangeOption, string> = { '7d': '7 Hari', '30d': '30 Hari', '90d': '90 Hari' }

  return (
    // Phase 6 motion consistency: tambah ds + view-* + ds-stagger ke wrapper
    // utama. Sebelumnya .activity-view tanpa pattern standard → halaman muncul
    // instant tanpa transisi. Sekarang dapat view-enter + cascade.
    <div className="ds activity-v2 view-activity activity-view ds-stagger">
      {/* Controls */}
      <div className="activity-controls">
        <div className="activity-range-tabs">
          {(['7d', '30d', '90d'] as RangeOption[]).map(r => (
            <button
              key={r}
              className={`activity-range-tab${range === r ? ' is-active' : ''}`}
              onClick={() => { setRange(r); setSelectedUserId(null) }}
              type="button"
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
        <div className="activity-controls__right">
          {lastFetched && (
            <span className="activity-controls__updated">
              Diperbarui {lastFetched.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            className="activity-refresh-btn"
            onClick={() => fetchLeaderboard(range)}
            title="Refresh data"
            type="button"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 2.5A7 7 0 1 0 15 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M13.5 2.5V6.5H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="activity-workspace">
        {/* ── Leaderboard ── */}
        <div className="activity-main">
          {/* Column headers */}
          <div className="activity-leader-header">
            <span className="activity-leader-header__rank">#</span>
            <span className="activity-leader-header__avatar" />
            <span className="activity-leader-header__info">Pengguna</span>
            <span className="activity-leader-header__dur">Durasi aktif</span>
            <span className="activity-leader-header__bar-wrap" />
            <span className="activity-leader-header__sessions">Sesi</span>
            <span className="activity-leader-header__last">Terakhir aktif</span>
          </div>

          {loading && (
            <div className="activity-skeleton-list">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="activity-skeleton-row">
                  <div className="activity-skeleton-rank" />
                  <div className="activity-skeleton-avatar" />
                  <div className="activity-skeleton-info">
                    <div className="activity-skeleton-name" />
                    <div className="activity-skeleton-sub" />
                  </div>
                  <div className="activity-skeleton-dur" />
                  <div className="activity-skeleton-bar" />
                </div>
              ))}
            </div>
          )}

          {!loading && users.length === 0 && (
            <div className="activity-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" strokeLinecap="round" />
              </svg>
              <p>Belum ada data aktivitas untuk periode ini.</p>
              <span>Data mulai terekam setelah pengguna aktif menggunakan ATLAS.</span>
            </div>
          )}

          {!loading && users.map(u => (
            <LeaderRow
              key={u.userId}
              user={u}
              maxMs={maxMs}
              isSelected={selectedUserId === u.userId}
              onClick={() => setSelectedUserId(prev => prev === u.userId ? null : u.userId)}
              presenceMap={presenceMap}
            />
          ))}
        </div>

        {/* ── Detail panel ── */}
        <aside className="activity-sidebar right-rail">
          {selectedUserId ? (
            <DetailPanel userId={selectedUserId} range={range} />
          ) : (
            <div className="activity-detail-panel activity-detail-panel--placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>Klik nama pengguna<br />untuk melihat detail aktivitas</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default ActivityView
