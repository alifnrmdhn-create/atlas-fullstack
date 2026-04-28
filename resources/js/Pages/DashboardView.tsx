import { useState, useEffect, useMemo } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import {
  Avatar,
  EmptyState,
  HealthPill,
  MiniDonut,
  SectionState,
  SkeletonBlock,
  SkeletonStack,
  StatCard,
  SvgIcon,
  effectivePresenceSlug,
} from '../components/ui'
import { formatKpiValue, getKpiFillPercent } from '../lib/kpi'
import { getProgramHealthDisplay } from '../lib/programStatus'
import { api } from '../lib/api'

type ActivityUser = {
  rank: number
  userId: number
  name: string
  positionTitle: string | null
  unit: { id: number; name: string } | null
  totalDurationMs: number
  sessionCount: number
  lastActiveAt: string | null
  isOnline: boolean
}

function fmtDuration(ms: number): string {
  if (ms === 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 1) return `${h}j ${m}m`
  return `${m}m`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 19) return 'Selamat sore'
  return 'Selamat malam'
}

function getBlockerTone(count: number): 'muted' | 'warn' | 'critical' {
  if (count === 0) return 'muted'
  if (count >= 3) return 'critical'
  return 'warn'
}

function getSeverityIcon(severity: string): 'alert' | 'shield' | 'trend' {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'alert'
  if (severity === 'MEDIUM') return 'trend'
  return 'shield'
}

function getActionTone(action: string): 'positive' | 'warn' | 'info' | 'accent' | 'default' {
  const a = action.toUpperCase()
  if (a === 'CREATED') return 'positive'
  if (a === 'STATUS_CHANGED') return 'warn'
  if (a === 'MEASURED') return 'info'
  if (a === 'REACTION_ADDED') return 'accent'
  return 'default'
}

function getCheckpointTone(status: string): 'critical' | 'warn' | 'positive' | 'default' {
  const normalized = status.toUpperCase()

  if (normalized.includes('DELAY') || normalized.includes('LATE') || normalized.includes('OVERDUE')) return 'critical'
  if (normalized.includes('RISK') || normalized.includes('HOLD') || normalized.includes('PENDING')) return 'warn'
  if (normalized.includes('DONE') || normalized.includes('COMPLETE') || normalized.includes('TRACK')) return 'positive'
  return 'default'
}

function formatMetricValue(value?: number, unit?: string, dataType?: string) {
  return formatKpiValue(value, unit, dataType)
}


export function DashboardView() {
  const {
    dashboard,
    programs,
    kpis,
    workGroups,
    currentUser,
    presence,
    overviewStatus,
    normalizeHealthStatus,
    formatStatusLabel,
    formatDate,
    openProgramWorkspace,
    openTaskWorkspace,
  } = useWorkspace()

  const presenceMap = useMemo(
    () => new Map(presence.map(p => [p.userId, { status: p.status, lastActivityAt: p.lastActivityAt }])),
    [presence],
  )

  const role = currentUser?.roleType?.toUpperCase() ?? ''
  // Strategic view: BOD, KADIV, ADMIN, SUPERADMIN see the full portfolio + steering panels
  const isStrategic = ['BOD', 'KADIV', 'ADMIN', 'SUPERADMIN'].includes(role)
  // Individual contributors: KASUBDIV, ASISTEN, OFFICER
  const isIndividual = !isStrategic

  const [teamActivity, setTeamActivity] = useState<ActivityUser[] | null>(null)
  const [activityRange, setActivityRange] = useState<'7d' | '30d'>('7d')

  useEffect(() => {
    if (!isStrategic) return
    setTeamActivity(null)
    api.get<{ data: { users: ActivityUser[] } }>(`/analytics/user-activity?range=${activityRange}`)
      .then(r => setTeamActivity(r.data.users.slice(0, 8)))
      .catch(() => setTeamActivity([]))
  }, [isStrategic, activityRange])

  const greeting = getGreeting()
  const firstName = (() => {
    const name = currentUser?.name
    if (!name) return 'Anda'
    if (role === 'BOD') return name
    const parts = name.split(' ')
    if (parts[0].length <= 2 || parts[0].endsWith('.')) return name
    return parts[0]
  })()

  const topRisk = dashboard
    ? [...dashboard.dimensions.programs].sort((a, b) => b.blockerCount - a.blockerCount).slice(0, 4)
    : []
  const timeCritical = dashboard ? dashboard.dimensions.timeIntelligence.slice(0, 5) : []
  const collab = dashboard
    ? (dashboard.mentions.length > 0 ? dashboard.mentions : dashboard.dimensions.collaboration).slice(0, 4)
    : []

  if (overviewStatus.loading && !dashboard) {
    return (
      <div className="view-dashboard">
        <div className="dashboard-loading">
          <div className="dashboard-loading__hero">
            <SkeletonBlock height={32} width="40%" />
            <SkeletonStack lines={[72, 56]} />
          </div>
          <div className="dashboard-loading__grid">
            {[0, 1, 2, 3].map((i) => (
              <div className="stat-card stat-card--skeleton" key={i}>
                <SkeletonBlock height={12} width="50%" />
                <SkeletonBlock height={36} width="30%" />
                <SkeletonBlock height={10} width="65%" />
              </div>
            ))}
          </div>
          <div className="dashboard-loading__panels">
            {[0, 1, 2].map((i) => (
              <div className="panel" key={i}>
                <SkeletonBlock height={18} width="40%" />
                <SkeletonStack lines={[90, 82, 70]} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="view-dashboard">
        <SectionState title="Dashboard tidak tersedia" text="Periksa koneksi ke backend dan coba refresh." />
      </div>
    )
  }

  const { summary, dimensions, recentActivity } = dashboard
  const healthMix = programs.reduce(
    (acc, p) => {
      const { tone } = getProgramHealthDisplay(p)
      if (tone === 'on-track')  acc.onTrack++
      else if (tone === 'at-risk')   acc.atRisk++
      else if (tone === 'terlambat') acc.terlambat++
      else if (tone === 'overdue')   acc.overdue++
      else if (tone === 'selesai')   acc.selesai++
      return acc
    },
    { onTrack: 0, atRisk: 0, terlambat: 0, overdue: 0, selesai: 0 },
  )
  const avgProgress = programs.length
    ? Math.round(programs.reduce((sum, program) => sum + program.progressPercent, 0) / programs.length)
    : 0
  const kpisAtRisk = dimensions.leadingIndicators.filter((ind) => {
    const actual = kpis.find((k) => k.id === ind.id)?.actualValue ?? ind.actualValue ?? 0
    return getKpiFillPercent(actual, ind.targetValue) < 80
  }).length

  // ── Task Progress: by status ──────────────────────────────────
  const allTasks = workGroups.flatMap((g) => g.items)
  const taskByStatus = {
    done:       allTasks.filter((wi) => wi.status === 'COMPLETED' || wi.status === 'IN_REVIEW').length,
    inProgress: allTasks.filter((wi) => wi.status === 'IN_PROGRESS' || wi.status === 'READY').length,
    stuck:      allTasks.filter((wi) => wi.status === 'BLOCKED').length,
    backlog:    allTasks.filter((wi) => wi.status === 'BACKLOG').length,
  }
  const totalTasks = allTasks.length

  // ── Task Progress: by unit (dynamic, derived from work item data) ──────────
  const taskByUnit = (() => {
    // Group by workstream.program — gives meaningful cross-unit breakdown
    const byProgram: Record<number, { uid: number; label: string; full: string; total: number; done: number; inProgress: number; stuck: number }> = {}
    for (const wi of allTasks) {
      const prog = wi.workstream?.program
      if (!prog) continue
      if (!byProgram[prog.id]) {
        byProgram[prog.id] = { uid: prog.id, label: prog.code, full: prog.name, total: 0, done: 0, inProgress: 0, stuck: 0 }
      }
      byProgram[prog.id].total++
      if (wi.status === 'COMPLETED' || wi.status === 'IN_REVIEW') byProgram[prog.id].done++
      if (wi.status === 'IN_PROGRESS' || wi.status === 'READY') byProgram[prog.id].inProgress++
      if (wi.status === 'BLOCKED') byProgram[prog.id].stuck++
    }
    return Object.values(byProgram).filter((u) => u.total > 0).sort((a, b) => b.total - a.total)
  })()
  const maxUnitTotal = Math.max(...taskByUnit.map((u) => u.total), 1)

  return (
    <div className="view-dashboard">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Dashboard</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__greeting">{greeting}, {firstName}!</span>
        <div className="view-toolbar__right">
          <div className="view-toolbar__stats">
            <span>{summary.activePrograms} <em>programs</em></span>
            <span className="text-green">{avgProgress}% <em>avg progress</em></span>
            {summary.criticalBlockers > 0 && (
              <span className="text-red">{summary.criticalBlockers} <em>blockers</em></span>
            )}
            <span>{summary.onlineUsers} <em>online</em></span>
          </div>
          <div className="dashboard-health-strip">
            <div className="dashboard-health-chip dashboard-health-chip--green">
              <strong>{healthMix.onTrack}</strong>
              <span>On Track</span>
            </div>
            <div className="dashboard-health-chip dashboard-health-chip--yellow">
              <strong>{healthMix.atRisk}</strong>
              <span>At Risk</span>
            </div>
            <div className="dashboard-health-chip dashboard-health-chip--red">
              <strong>{healthMix.terlambat + healthMix.overdue}</strong>
              <span>Terlambat</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-stats">
        <StatCard icon="stack" label="Programs Aktif" value={summary.activePrograms} hint={`${summary.totalPrograms} total`} />
        <StatCard icon="trend" label="Avg Progress" value={avgProgress} hint="Rata-rata progress portfolio" tone="positive" />
        <StatCard
          icon="alert"
          label="Critical Blockers"
          value={summary.criticalBlockers}
          hint="Perlu perhatian steering"
          tone={summary.criticalBlockers > 0 ? 'critical' : 'positive'}
        />
        <StatCard
          icon="shield"
          label="Program Terlambat"
          value={healthMix.terlambat + healthMix.overdue}
          hint={(healthMix.terlambat + healthMix.overdue) > 0 ? 'Memerlukan eskalasi' : 'Semua program aman'}
          tone={(healthMix.terlambat + healthMix.overdue) > 0 ? 'critical' : 'positive'}
        />
        {kpisAtRisk > 0 && (
          <StatCard icon="target" label="KPI Below Target" value={kpisAtRisk} hint="KPI di bawah 80% target" tone="warn" />
        )}
        {summary.unreadNotifications > 0 && (
          <StatCard icon="mail" label="Unread Alerts" value={summary.unreadNotifications} hint="Mentions, blockers, KPI alerts" tone="warn" />
        )}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col">
          <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">Portfolio Overview</h3>
              </div>
              <div className="panel__header-meta">
                <span className="section-badge">{programs.length} programs</span>
                <span className="section-badge">Avg {avgProgress}%</span>
              </div>
            </div>
            <div className="program-grid">
              {dimensions.programs.map((prog) => {
                const { tone, slug } = getProgramHealthDisplay(prog)

                return (
                  <button
                    className="program-card"
                    data-health={tone}
                    key={prog.id}
                    onClick={() => openProgramWorkspace(prog.id)}
                  >
                    <div className="program-card__top">
                      <h4 className="program-card__name">{prog.name}</h4>
                      <span className="program-card__dot" data-status={slug} />
                    </div>
                    <div className="program-card__progress">
                      <div className="progress-bar-track program-card__progress-track">
                        <div className={`progress-bar-fill ${slug}`} style={{ width: `${prog.progressPercent}%` }} />
                      </div>
                      <span className="program-card__pct">{prog.progressPercent}%</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {isStrategic && <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">KPI & Signal Watch</h3>
              </div>
            </div>
            <div className="kpi-grid">
              {dimensions.leadingIndicators.slice(0, 6).map((indicator) => {
                const fullKpi = kpis.find((item) => item.id === indicator.id)
                const actualValue = fullKpi?.actualValue ?? indicator.actualValue ?? 0
                const unit = fullKpi?.unitOfMeasure
                const pct = getKpiFillPercent(actualValue, indicator.targetValue)
                const boundedPct = Math.min(Math.max(pct, 0), 999)
                const fillClass = pct >= 100 ? 'on-track' : pct >= 80 ? 'at-risk' : 'off-track'
                const trend = fullKpi?.trend?.slice(-8) ?? []
                const maxTrendValue = Math.max(...trend.map((entry) => entry.actualValue), indicator.targetValue, 1)
                const polylinePoints = trend
                  .map((entry, index) => {
                    const x = trend.length === 1 ? 50 : (index / (trend.length - 1)) * 100
                    const y = 32 - (entry.actualValue / maxTrendValue) * 26
                    return `${x},${Math.max(4, Math.min(y, 32))}`
                  })
                  .join(' ')

                return (
                  <div className="kpi-tile" key={indicator.id}>
                    <div className="kpi-tile__top">
                      <span className="kpi-tile__name">{indicator.name}</span>
                      <HealthPill status={normalizeHealthStatus(indicator.status)} />
                    </div>

                    <div className="kpi-tile__values">
                      <div className="kpi-tile__value">{formatMetricValue(actualValue, unit, fullKpi?.dataType)}</div>
                      <span className={`status-badge ${fillClass}`}>{boundedPct}% target</span>
                    </div>

                    <div className="progress-bar-track">
                      <div className={`progress-bar-fill ${fillClass}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
                    </div>

                    {trend.length > 1 ? (
                      <div className="kpi-sparkline" title="KPI trend (8 periode terakhir)">
                        <svg viewBox="0 0 100 36" preserveAspectRatio="none">
                          <polyline className="kpi-sparkline__line" fill="none" points={polylinePoints} />
                        </svg>
                      </div>
                    ) : trend.length === 1 ? (
                      <div className="kpi-sparkline kpi-sparkline--single"
                        title={`1 data point: ${trend[0]!.measurementDate.slice(0, 10)}`}>
                        <svg viewBox="0 0 100 36" preserveAspectRatio="none">
                          <circle cx="50" cy="18" r="4" className="kpi-sparkline__dot" />
                        </svg>
                        <span className="kpi-sparkline__single-label">1 periode</span>
                      </div>
                    ) : (
                      <div className="kpi-sparkline kpi-sparkline--empty">
                        <span>Belum ada data historis</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>}

          {/* ── Task Progress by Status ── */}
          <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">Task Progress by Status</h3>
              </div>
              <span className="badge badge--sm">{totalTasks} tasks</span>
            </div>
            <div className="task-status-panel">
              <MiniDonut
                label="Tasks"
                value={`${totalTasks}`}
                segments={[
                  { label: 'Selesai',       value: taskByStatus.done,       color: 'var(--green)'  },
                  { label: 'In Progress',   value: taskByStatus.inProgress, color: 'var(--blue)'   },
                  { label: 'Stuck',         value: taskByStatus.stuck,      color: 'var(--red)'    },
                  { label: 'Backlog',       value: taskByStatus.backlog,    color: 'var(--text-muted)' },
                ]}
              />
              <div className="task-status-legend">
                {[
                  { key: 'done',       label: 'Selesai',     count: taskByStatus.done,       tone: 'done' },
                  { key: 'inProgress', label: 'In Progress', count: taskByStatus.inProgress, tone: 'progress' },
                  { key: 'stuck',      label: 'Stuck',       count: taskByStatus.stuck,      tone: 'stuck' },
                  { key: 'backlog',    label: 'Backlog',     count: taskByStatus.backlog,    tone: 'backlog' },
                ].map(({ key, label, count, tone }) => (
                  <div className={`task-status-row task-status-row--${tone}`} key={key}>
                    <div className="task-status-row__bar-wrap">
                      <div className="task-status-row__label">
                        <span className="task-status-row__dot" />
                        <span>{label}</span>
                      </div>
                      <strong>{count}</strong>
                    </div>
                    <div className="task-status-row__track">
                      <div
                        className={`task-status-row__fill${count > 0 ? ' task-status-row__fill--active' : ''}`}
                        style={{ width: totalTasks > 0 ? `${Math.round((count / totalTasks) * 100)}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Task Progress by Sub-Divisi — strategic roles only ── */}
          {isStrategic && taskByUnit.length > 0 && (
            <div className="panel">
              <div className="panel__header">
                <div className="dashboard-panel-title">
                  <h3 className="panel__title">Task Progress by Program</h3>
                </div>
              </div>
              <div className="task-subdiv-list">
                {taskByUnit.map((unit) => (
                  <div className="task-subdiv-row" key={unit.uid}>
                    <div className="task-subdiv-row__header">
                      <div>
                        <strong className="task-subdiv-row__label">{unit.label}</strong>
                        <span className="task-subdiv-row__full">{unit.full}</span>
                      </div>
                      <span className="badge badge--sm">{unit.total} tasks</span>
                    </div>
                    <div className="task-subdiv-row__bars">
                      <div
                        className="task-subdiv-bar task-subdiv-bar--done"
                        style={{ width: `${Math.round((unit.done / maxUnitTotal) * 100)}%` }}
                        title={`Selesai: ${unit.done}`}
                      />
                      <div
                        className="task-subdiv-bar task-subdiv-bar--progress"
                        style={{ width: `${Math.round((unit.inProgress / maxUnitTotal) * 100)}%` }}
                        title={`In Progress: ${unit.inProgress}`}
                      />
                      {unit.stuck > 0 && (
                        <div
                          className="task-subdiv-bar task-subdiv-bar--stuck"
                          style={{ width: `${Math.round((unit.stuck / maxUnitTotal) * 100)}%` }}
                          title={`Stuck: ${unit.stuck}`}
                        />
                      )}
                    </div>
                    <div className="task-subdiv-row__meta">
                      <span className="task-subdiv-meta task-subdiv-meta--done">{unit.done} selesai</span>
                      <span className="task-subdiv-meta task-subdiv-meta--progress">{unit.inProgress} in progress</span>
                      {unit.stuck > 0 && (
                        <span className="task-subdiv-meta task-subdiv-meta--stuck">{unit.stuck} stuck</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="task-subdiv-legend">
                <span className="task-subdiv-legend__item task-subdiv-legend__item--done">Selesai</span>
                <span className="task-subdiv-legend__item task-subdiv-legend__item--progress">In Progress</span>
                <span className="task-subdiv-legend__item task-subdiv-legend__item--stuck">Stuck</span>
              </div>
            </div>
          )}

          {/* ── Recent Activity (max 5) ── */}
          <div className="dashboard-section-sep"><span>Aktivitas Terbaru</span></div>
          <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">Recent Activity</h3>
              </div>
            </div>
            <div className="activity-feed">
              {recentActivity.slice(0, 5).map((act) => (
                <button
                  className="activity-row"
                  key={act.id}
                  onClick={() => {
                    if (act.entityType === 'PROGRAM') openProgramWorkspace(act.entityId)
                    if (act.entityType === 'TASK') openTaskWorkspace(act.entityId)
                  }}
                >
                  <div className="activity-row__dot" />
                  <div className="activity-row__body">
                    <span className={`activity-row__action activity-row__action--${getActionTone(act.action)}`}>{act.action}</span>
                    <span className="activity-row__desc">{act.description ?? `${act.entityType} #${act.entityId}`}</span>
                  </div>
                  <time className="activity-row__time">{formatDate(act.changeTimestamp)}</time>
                </button>
              ))}
            </div>
            {recentActivity.length > 5 && (
              <div className="panel__see-all">Lihat semua aktivitas →</div>
            )}
          </div>
        </div>

        <div className="dashboard-col">
          {/* ── My Work — individual contributors only ── */}
          {isIndividual && (() => {
            const myItems = workGroups.flatMap(g => g.items).filter(i => i.assignee?.id === currentUser?.id)
            const myDone = myItems.filter(i => i.status === 'COMPLETED' || i.status === 'IN_REVIEW').length
            const myInProgress = myItems.filter(i => i.status === 'IN_PROGRESS' || i.status === 'READY').length
            const myBlocked = myItems.filter(i => i.isBlocked || i.status === 'BLOCKED').length
            return (
              <div className="panel">
                <div className="panel__header">
                  <div className="dashboard-panel-title">
                    <h3 className="panel__title">My Work</h3>
                  </div>
                  <span className="badge badge--sm">{myItems.length} tasks</span>
                </div>
                {myItems.length === 0 ? (
                  <EmptyState compact icon="stack" title="Belum ada tugas" text="Belum ada tugas yang ditugaskan kepada Anda." />
                ) : (
                  <div className="task-status-panel">
                    <MiniDonut
                      label="Tasks"
                      value={`${myItems.length}`}
                      segments={[
                        { label: 'Selesai',     value: myDone,       color: 'var(--green)' },
                        { label: 'In Progress', value: myInProgress, color: 'var(--blue)'  },
                        { label: 'Blocked',     value: myBlocked,    color: 'var(--red)'   },
                        { label: 'Backlog',     value: myItems.length - myDone - myInProgress - myBlocked, color: 'var(--text-muted)' },
                      ]}
                    />
                    <div className="task-status-legend">
                      {[
                        { label: 'Selesai',     count: myDone,       tone: 'done' },
                        { label: 'In Progress', count: myInProgress, tone: 'progress' },
                        { label: 'Blocked',     count: myBlocked,    tone: 'stuck' },
                        { label: 'Backlog',     count: myItems.length - myDone - myInProgress - myBlocked, tone: 'backlog' },
                      ].map(({ label, count, tone }) => (
                        <div className={`task-status-row task-status-row--${tone}`} key={label}>
                          <div className="task-status-row__bar-wrap">
                            <div className="task-status-row__label">
                              <span className="task-status-row__dot" />
                              <span>{label}</span>
                            </div>
                            <strong>{count}</strong>
                          </div>
                          <div className="task-status-row__track">
                            <div
                              className={`task-status-row__fill${count > 0 ? ' task-status-row__fill--active' : ''}`}
                              style={{ width: myItems.length > 0 ? `${Math.round((count / myItems.length) * 100)}%` : '0%' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Steering Radar — strategic roles only */}
          {isStrategic && (
          <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">Steering Radar</h3>
              </div>
            </div>
            <div className="signal-list">
              {topRisk.map((prog) => {
                const blockerTone = getBlockerTone(prog.blockerCount)

                return (
                  <button
                    className={`signal-row signal-row--risk signal-row--risk-${blockerTone}`}
                    key={prog.id}
                    onClick={() => openProgramWorkspace(prog.id)}
                  >
                    <div className="signal-row__score">
                      <span className="signal-row__score-value">{prog.blockerCount}</span>
                      <span className="signal-row__score-label">blockers</span>
                    </div>
                    <div className="signal-row__body">
                      <strong>{prog.name}</strong>
                      <span>{prog.progressPercent}% progress</span>
                    </div>
                    <div className="signal-row__right">
                      <HealthPill status={getProgramHealthDisplay(prog).tone === 'overdue' ? 'OVERDUE' : normalizeHealthStatus(prog.healthStatus)} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          )}

          {/* Control Alerts — all roles */}
          <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">Control Alerts</h3>
              </div>
              {summary.criticalBlockers > 0 ? (
                <span className="status-badge critical">{summary.criticalBlockers} kritis</span>
              ) : null}
            </div>
            <div className="signal-list">
              {dimensions.controls.length > 0 ? (
                [...dimensions.controls]
                  .sort((a, b) => {
                    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
                    return (order[a.severity.toUpperCase()] ?? 9) - (order[b.severity.toUpperCase()] ?? 9)
                  })
                  .map((item) => (
                  <div className="signal-row signal-row--static" key={item.id}>
                    <div className={`severity-icon severity-icon--${item.severity.toLowerCase()}`}>
                      <SvgIcon name={getSeverityIcon(item.severity)} />
                    </div>
                    <div className="signal-row__body">
                      <strong>{item.code}</strong>
                      <span>{item.title}</span>
                    </div>
                    <div className="signal-row__right">
                      <span className={`severity-badge severity-badge--${item.severity.toUpperCase()}`}>{item.severity}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState compact icon="shield" text="Tidak ada blocker penting yang membutuhkan eskalasi saat ini." title="Kontrol aman" />
              )}
            </div>
          </div>

          {/* Delivery Checkpoints */}
          <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">Delivery Checkpoints</h3>
              </div>
            </div>
            {timeCritical.length > 0 ? (
              <div className="checkpoint-timeline">
                {timeCritical.map((item) => {
                  const tone = getCheckpointTone(item.status)

                  return (
                    <div className={`checkpoint-row checkpoint-row--${tone}`} key={item.id}>
                      <div className="checkpoint-row__rail">
                        <span className="checkpoint-row__dot" />
                      </div>
                      <div className="checkpoint-row__body">
                        <div>
                          <strong>{item.code}</strong>
                          <p>{item.title}</p>
                        </div>
                        <div className="checkpoint-row__meta">
                          <time>{formatDate(item.targetCompletion)}</time>
                          <span className="badge badge--sm">{formatStatusLabel(item.status)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState compact icon="calendar" text="Belum ada checkpoint terjadwal di horizon dekat." title="No upcoming checkpoints" />
            )}
          </div>

          {/* Collaboration Pulse — moved to bottom */}
          <div className="panel">
            <div className="panel__header">
              <div className="dashboard-panel-title">
                <h3 className="panel__title">Collaboration Pulse</h3>
              </div>
            </div>
            {collab.length > 0 ? (
              <div className="signal-list">
                {collab.map((msg) => (
                  <div className="collab-row" key={msg.id}>
                    <Avatar name={msg.authorName ?? 'Workspace update'} />
                    <div className="collab-row__body">
                      <div className="collab-row__meta">
                        <strong>{msg.authorName ?? 'Workspace update'}</strong>
                        <time>{formatDate(msg.createdAt)}</time>
                      </div>
                      <p>{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="message" text="Belum ada aktivitas kolaborasi yang masuk ke dashboard." title="Collaboration is quiet" />
            )}
          </div>

          {/* Team Activity — strategic roles only */}
          {isStrategic && (
            <div className="panel">
              <div className="panel__header">
                <div className="dashboard-panel-title">
                  <h3 className="panel__title">Team Activity</h3>
                </div>
                <div className="panel__header-meta">
                  <button
                    className={`range-chip${activityRange === '7d' ? ' range-chip--active' : ''}`}
                    onClick={() => setActivityRange('7d')}
                    type="button"
                  >7d</button>
                  <button
                    className={`range-chip${activityRange === '30d' ? ' range-chip--active' : ''}`}
                    onClick={() => setActivityRange('30d')}
                    type="button"
                  >30d</button>
                </div>
              </div>
              {teamActivity === null ? (
                <div style={{ padding: '8px 0' }}><SkeletonStack lines={[85, 75, 65, 55]} /></div>
              ) : teamActivity.length === 0 ? (
                <EmptyState compact icon="users" title="Belum ada data sesi" text="Data aktivitas pengguna akan tampil di sini." />
              ) : (
                <div className="team-activity-list">
                  {teamActivity.map(u => {
                    const p = presenceMap.get(u.userId)
                    const isOnline = p ? effectivePresenceSlug(p.status, p.lastActivityAt) === 'online' : false
                    return (
                    <div className="team-activity-row" key={u.userId}>
                      <div className="team-activity-row__avatar">
                        <Avatar name={u.name} size={26} />
                        {isOnline && <span className="team-activity-row__online-dot" />}
                      </div>
                      <div className="team-activity-row__body">
                        <span className="team-activity-row__name">{u.name}</span>
                        <span className="team-activity-row__unit">{u.unit?.name ?? u.positionTitle ?? '—'}</span>
                      </div>
                      <div className="team-activity-row__stat">
                        <span className="team-activity-row__duration">{fmtDuration(u.totalDurationMs)}</span>
                        <span className="team-activity-row__sessions">{u.sessionCount} sesi</span>
                      </div>
                    </div>
                  )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardView
