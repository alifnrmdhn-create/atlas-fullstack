import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { TimelineGantt } from '../components/TimelineGantt'
import type { TimelineGanttProgram } from '../components/TimelineGantt'
import { api } from '../lib/api'
import './SmallPagesViews.css'

type RoadmapGrouping = 'status' | 'priority' | 'health'
type ViewMode = 'lanes' | 'timeline'

const STATUS_ORDER = ['IN_PROGRESS', 'PLANNING', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
// ── Main view ──────────────────────────────────────────────────────────────

export function RoadmapView() {
  const {
    programs, dashboard, overviewStatus,
    openProgramWorkspace,
    normalizeHealthStatus, formatStatusLabel,
    currentUser,
  } = useWorkspace()

  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const isStrategic = role === 'BOD' || role === 'KADIV'

  const [viewMode, setViewMode] = useState<ViewMode>('lanes')
  const [groupBy, setGroupBy] = useState<RoadmapGrouping>(isStrategic ? 'health' : 'status')
  const [search, setSearch] = useState('')

  // Timeline data
  const [timelineData, setTimelineData] = useState<TimelineGanttProgram[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  const loadTimeline = useCallback(() => {
    setTimelineLoading(true)
    api.get<{ data: TimelineGanttProgram[] }>('/programs/timeline-all')
      .then(res => setTimelineData(res.data ?? []))
      .catch((err) => { console.error('[Atlas] Silent failure in RoadmapView.tsx:', err); setTimelineData([]) })
      .finally(() => setTimelineLoading(false))
  }, [])

  useEffect(() => {
    if (viewMode === 'timeline' && timelineData.length === 0) loadTimeline()
  }, [viewMode, timelineData.length, loadTimeline])

  const filtered = programs.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
  )

  // Build lane groups
  type Group = { key: string; label: string; tone: string; items: typeof programs }
  let groups: Group[] = []

  if (groupBy === 'status') {
    groups = STATUS_ORDER.map(status => ({
      key: status, label: formatStatusLabel(status), tone: status.toLowerCase(),
      items: filtered.filter(p => p.status === status),
    })).filter(g => g.items.length > 0)
  } else if (groupBy === 'priority') {
    groups = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(pri => ({
      key: pri, label: pri,
      tone: pri.toLowerCase(),
      items: filtered.filter(p => p.priority === pri),
    })).filter(g => g.items.length > 0)
  } else {
    groups = ['GREEN', 'YELLOW', 'RED'].map(h => ({
      key: h,
      label: h === 'GREEN' ? 'On Track' : h === 'YELLOW' ? 'At Risk' : 'Delayed',
      tone: h.toLowerCase(),
      items: filtered.filter(p => normalizeHealthStatus(p.healthStatus) === h),
    })).filter(g => g.items.length > 0)
  }

  // Summary metrics
  const total = programs.length
  const inProgress = programs.filter(p => p.status === 'IN_PROGRESS').length
  const avgProgress = total > 0
    ? Math.round(programs.reduce((s, p) => s + p.progressPercent, 0) / total)
    : 0
  const atRiskOrOff = programs.filter(p => ['YELLOW', 'RED'].includes(normalizeHealthStatus(p.healthStatus))).length

  const filteredTimeline = timelineData.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="ds roadmap-v2 view-roadmap">
      {/* `ds-stagger`: motion standardization (no inline modal). */}
      <div className="roadmap-v2__inner ds-stagger">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Program Roadmap</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">
          {isStrategic ? 'Health and progress across the entire program portfolio.' : 'Schedule and progress of programs in your unit.'}
        </span>

        {/* View mode toggle */}
        <div className="view-toggle">
          <button className={`view-toggle-btn${viewMode === 'lanes' ? ' active' : ''}`} onClick={() => setViewMode('lanes')}>
            Lanes
          </button>
          <button className={`view-toggle-btn${viewMode === 'timeline' ? ' active' : ''}`} onClick={() => setViewMode('timeline')}>
            Timeline
          </button>
        </div>

        {/* Lane grouping — only in lanes mode */}
        {viewMode === 'lanes' && (
          <div className="view-toggle roadmap-toolbar-offset">
            {(['status', 'priority', 'health'] as RoadmapGrouping[]).map(g => (
              <button className={`view-toggle-btn${groupBy === g ? ' active' : ''}`} key={g} onClick={() => setGroupBy(g)}>
                {g === 'status' ? 'Status' : g === 'priority' ? 'Priority' : 'Health'}
              </button>
            ))}
          </div>
        )}

        <input className="view-toolbar__search roadmap-toolbar-offset" onChange={e => setSearch(e.target.value)} placeholder="Filter programs…" value={search} />

        <div className="view-toolbar__right">
          <div className="view-toolbar__stats">
            <span>{total} <em>programs</em></span>
            <span>{inProgress} <em>active</em></span>
            <span>{avgProgress}% <em>avg</em></span>
            {atRiskOrOff > 0 && <span className="roadmap-stat-alert">{atRiskOrOff} <em>need attention</em></span>}
          </div>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <div className="roadmap-body roadmap-body--timeline">
          {timelineLoading ? (
            <p className="text-sm text-muted roadmap-empty">Loading timeline…</p>
          ) : (
            <TimelineGantt
              programs={filteredTimeline}
              emptyText="No programs to show."
              onOpenProgram={openProgramWorkspace}
            />
          )}
        </div>
      ) : (
        <div className="roadmap-body">
          {overviewStatus.loading ? (
            <p className="text-sm text-muted roadmap-empty">Loading roadmap…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted roadmap-empty">No matching programs.</p>
          ) : (
            <>
              {groups.map(group => (
                <div className="roadmap-lane" key={group.key}>
                  <div className={`roadmap-lane__header${group.key === 'ON_HOLD' ? ' roadmap-lane__header--on-hold' : ''}`}>
                    <span className={`roadmap-lane__dot roadmap-lane__dot--${group.tone}`} />
                    <span className="roadmap-lane__label">{group.label}</span>
                    <span className="section-badge">{group.items.length}</span>
                  </div>
                  <div className="roadmap-lane__body">
                    {group.items.map(prog => {
                      const health = normalizeHealthStatus(prog.healthStatus)
                      const statusClass = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
                      const riskTone = prog.riskScore >= 15 ? 'critical' : 'warn'
                      return (
                        <button className="roadmap-bar list-row" key={prog.id} onClick={() => openProgramWorkspace(prog.id)}>
                          <span className="code-badge roadmap-bar__code">{prog.code}</span>
                          <div className="roadmap-bar__title">
                            <span className="roadmap-bar__name">{prog.name}</span>
                          </div>
                          <div className="progress-bar-track roadmap-bar__progress">
                            <div className={`progress-bar-fill ${statusClass}`}
                              style={{ width: `${Math.max(prog.progressPercent, 2)}%` }} />
                          </div>
                          <span className="roadmap-bar__pct">
                            {prog.progressPercent}%
                          </span>
                          {prog.riskScore >= 10 ? (
                            <span className={`risk-chip risk-chip--${riskTone} roadmap-bar__risk`}>
                              Risk {prog.riskScore}
                            </span>
                          ) : <span className="roadmap-bar__risk-placeholder" />}
                          {prog.owner ? (
                            <span className="roadmap-bar__owner text-muted text-xs">{prog.owner.name}</span>
                          ) : <span className="roadmap-bar__owner-placeholder" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Program alignment matrix */}
              {dashboard?.dimensions.strategic && dashboard.dimensions.strategic.length > 0 && (
                <div className="roadmap-alignment">
                  <div className="section-block">
                    <div className="section-header">
                      <h3 className="section-title">Program Alignment</h3>
                    </div>
                    <div className="alignment-grid">
                      {dashboard.dimensions.strategic.slice(0, 8).map(s => (
                        <div className="alignment-cell" key={s.programId} title={`${s.program} — ${s.strategicAlignment ?? 0}%`}>
                          <div className="alignment-cell__bar">
                            <div
                              className={`alignment-cell__fill alignment-cell__fill--${normalizeHealthStatus(s.healthStatus).toLowerCase()}`}
                              style={{ height: `${s.strategicAlignment ?? 0}%` }}
                            >
                              <span className={`alignment-cell__fill-label${(s.strategicAlignment ?? 0) >= 20 ? ' alignment-cell__fill-label--visible' : ''}`}>
                                {s.program}
                              </span>
                            </div>
                          </div>
                          <span className="alignment-cell__label text-muted">{s.program}</span>
                          <span className="alignment-cell__val">{s.strategicAlignment}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

export default RoadmapView
