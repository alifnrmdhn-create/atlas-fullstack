import { useState } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { HealthPill, SectionState } from '../components/ui'

type ReportTab = 'kpi' | 'leaderboard'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: i + 1, label: m }))
const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

function getApmsStatusClass(pct: number): 'on-track' | 'at-risk' | 'off-track' {
  if (pct >= 100) return 'on-track'
  if (pct >= 80) return 'at-risk'
  return 'off-track'
}

function getApmsStatusLabel(pct: number): string {
  if (pct >= 100) return 'On Track'
  if (pct >= 80) return 'At Risk'
  return 'Off Track'
}

export function ReportsView() {
  const {
    apmsKpis, apmsConnected, apmsLinkedPrograms,
    dashboard, normalizeHealthStatus, currentUser,
    openProgramWorkspace,
  } = useWorkspace()

  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const isStrategic = role === 'BOD' || role === 'KADIV'

  const [tab, setTab] = useState<ReportTab>('kpi')
  const [filterTahun, setFilterTahun] = useState(CURRENT_YEAR)
  const [filterBulan, setFilterBulan] = useState(new Date().getMonth() + 1)

  const leaderboard = dashboard?.dimensions.performance ?? []

  // Summary dari apmsKpis (ketika data tersedia)
  const totalBobot = apmsKpis.reduce((s, k) => s + k.bobot, 0)
  const totalSkor = apmsKpis.reduce((s, k) => s + k.skor, 0)
  const realisasiBulanIni = apmsKpis.length > 0
    ? (apmsKpis.reduce((s, k) => s + k.skor, 0)).toFixed(2)
    : null

  return (
    // Phase 6 motion: tambah ds + ds-stagger ke wrapper (view-reports → view-*
    // sudah dapat view-enter). Halaman sekarang konsisten dengan pages lain.
    <div className="ds reports-v2 view-reports ds-stagger">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Analytics</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">
          {isStrategic ? 'APMS KPI achievement and team performance scores.' : 'Individual KPI achievement and performance scores.'}
        </span>
        <div className="view-toggle">
          {([
            ['kpi', 'KPI', apmsKpis.length || null],
            ['leaderboard', 'Leaderboard', null],
          ] as [ReportTab, string, number | null][]).map(([key, label, count]) => (
            <button
              key={key}
              className={`view-toggle-btn${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
              {count !== null && (
                <span className="section-badge reports-toggle-count">{count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="view-toolbar__right">
          <div className="view-toolbar__stats">
            <span
              className={`text-xs reports-live-state ${apmsConnected ? 'reports-live-state--connected' : ''}`}
            >
              {apmsConnected ? '● Live AGHRIS' : '○ Not connected to AGHRIS'}
            </span>
          </div>
        </div>
      </div>

      <div className="reports-body">

        {/* ── KPI — sumber tunggal dari APMS/AGHRIS ── */}
        {tab === 'kpi' && (
          <div className="reports-apms">

            {/* Filter periode */}
            <div className="apms-filter-bar">
              <div className="apms-filter-group">
                <label className="apms-filter-label">Year</label>
                <select
                  className="apms-filter-select"
                  value={filterTahun}
                  onChange={e => setFilterTahun(Number(e.target.value))}
                >
                  {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="apms-filter-group">
                <label className="apms-filter-label">Month</label>
                <select
                  className="apms-filter-select"
                  value={filterBulan}
                  onChange={e => setFilterBulan(Number(e.target.value))}
                >
                  {MONTH_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <span className="text-xs text-muted reports-period-note">
                Period: {MONTHS[filterBulan - 1]} {filterTahun}
              </span>
            </div>

            {/* Summary cards */}
            {apmsKpis.length > 0 && (
              <div className="apms-summary-cards">
                <div className="apms-summary-card">
                  <span className="apms-summary-card__label">Actual {MONTHS[filterBulan - 1]}</span>
                  <span className="apms-summary-card__value">{realisasiBulanIni}</span>
                </div>
                <div className="apms-summary-card">
                  <span className="apms-summary-card__label">Total KPI</span>
                  <span className="apms-summary-card__value">{apmsKpis.length}</span>
                </div>
                <div className="apms-summary-card">
                  <span className="apms-summary-card__label">Total Weight</span>
                  <span className="apms-summary-card__value">{totalBobot}%</span>
                </div>
                <div className="apms-summary-card">
                  <span className="apms-summary-card__label">Total Score</span>
                  <span className="apms-summary-card__value apms-summary-card__value--success">
                    {totalSkor.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* KPI table */}
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">KPI Individual — {MONTHS[filterBulan - 1]} {filterTahun}</h3>
                <span className="text-xs text-muted">Source: AGHRIS / APMS</span>
              </div>

              {apmsKpis.length === 0 ? (
                <SectionState
                  icon="🔗"
                  title="Not connected to AGHRIS"
                  text="Individual KPI data will appear here once the AGHRIS integration is configured (APMS_BASE_URL + APMS_API_KEY)."
                />
              ) : (
                <table className="apms-kpi-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>KPI Name</th>
                      <th className="apms-kpi-table__head--center">Weight</th>
                      <th className="apms-kpi-table__head--right">Target</th>
                      <th className="apms-kpi-table__head--right">Actual</th>
                      <th className="apms-kpi-table__head--right">Score</th>
                      <th>Status</th>
                      <th>Related Program</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apmsKpis.map((item) => {
                      const pct = item.sasaran > 0
                        ? Math.round((item.realisasi / item.sasaran) * 100)
                        : 0
                      const statusClass = getApmsStatusClass(pct)
                      const statusLabel = getApmsStatusLabel(pct)
                      const linkedPrograms = apmsLinkedPrograms[item.kode] ?? []
                      return (
                        <tr key={item.kode}>
                          <td><span className="code-badge">{item.kode}</span></td>
                          <td><span className="apms-kpi-table__name">{item.nama}</span></td>
                          <td className="apms-kpi-table__num apms-kpi-table__num--center">
                            {item.bobot}%
                          </td>
                          <td className="apms-kpi-table__num apms-kpi-table__num--right">
                            {item.sasaran.toLocaleString('id-ID')}
                          </td>
                          <td className="apms-kpi-table__num apms-kpi-table__num--right">
                            {item.realisasi.toLocaleString('id-ID')}
                          </td>
                          <td className="apms-kpi-table__score">
                            {item.skor.toLocaleString('id-ID')}
                          </td>
                          <td><span className={`status-badge ${statusClass}`}>{statusLabel}</span></td>
                          <td>
                            <div className="apms-program-chips">
                              {linkedPrograms.length === 0 ? (
                                <span className="text-xs text-muted">—</span>
                              ) : linkedPrograms.map(p => (
                                <button
                                  key={p.id}
                                  className="apms-program-chip"
                                  onClick={() => openProgramWorkspace(p.id)}
                                  title={p.name}
                                >
                                  {p.code}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Leaderboard ── */}
        {tab === 'leaderboard' && (
          <div className="reports-leaderboard">
            <div className="panel">
              <div className="panel__header">
                <h3 className="panel__title">Score Leaderboard</h3>
                <span className="text-muted text-xs">Berdasarkan skor ownership & delivery program</span>
              </div>
              {leaderboard.length === 0 ? (
                <SectionState title="No leaderboard data yet" text="Scores will appear once data is loaded from the backend." compact />
              ) : (
                <div className="leaderboard-list">
                  {[...leaderboard]
                    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                    .map((entry, idx) => {
                      const health = normalizeHealthStatus(entry.status)
                      const score = entry.score ?? 0
                      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
                      return (
                        <div className="leaderboard-row" key={entry.id}>
                          <span className="leaderboard-row__rank">{medal}</span>
                          <div className="leaderboard-row__avatar">{entry.name[0]}</div>
                          <div className="leaderboard-row__info">
                            <span className="leaderboard-row__name">{entry.name}</span>
                            <div className="leaderboard-row__bar">
                              <div className="progress-bar-track leaderboard-row__track">
                                <div
                                  className={`progress-bar-fill leaderboard-row__fill ${health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'}`}
                                  style={{ width: `${Math.min(score, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted leaderboard-row__score">{score ?? '–'}</span>
                            </div>
                          </div>
                          <HealthPill status={health} />
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportsView
