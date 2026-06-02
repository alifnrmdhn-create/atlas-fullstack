import { Link } from '@inertiajs/react'
import { Activity, Trophy, FileText, Zap, ZapOff } from 'lucide-react'
import { useWorkspace } from '../../hooks/useWorkspace'

/**
 * Reports/Analytics context panel.
 *
 * Reads dashboard + APMS state from useWorkspace (same source as
 * ReportsView). Surfaces three things a user reading analytics tends
 * to want at a glance:
 *
 *   - Sumber data: is APMS/AGHRIS connected right now?
 *   - Top 3 leaderboard performers — quick "who's leading this period"
 *   - Quick links to the other report families (Lap Bulanan, Lap Risiko)
 *     so the panel doubles as a hub when the user actually came here
 *     looking for monthly/risk reports.
 *
 * Period filter (tahun/bulan) lives in ReportsView's main toolbar; we
 * deliberately don't duplicate it here.
 */
export function ReportsAnalyticsPanel() {
  const { dashboard, apmsConnected, normalizeHealthStatus } = useWorkspace()
  const leaderboard = dashboard?.dimensions.performance ?? []

  const top3 = [...leaderboard]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3)

  return (
    <>
      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <Activity size={13} />
          </span>
          <h3 className="context-panel__section-title">Data source</h3>
        </header>
        <div className="context-panel__section-body">
          <div
            className={`context-panel__source-chip${apmsConnected ? ' context-panel__source-chip--live' : ''}`}
          >
            {apmsConnected ? (
              <>
                <Zap size={12} aria-hidden="true" />
                <span>Live AGHRIS</span>
              </>
            ) : (
              <>
                <ZapOff size={12} aria-hidden="true" />
                <span>Not connected</span>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <Trophy size={13} />
          </span>
          <h3 className="context-panel__section-title">Top 3 Leaderboard</h3>
        </header>
        <div className="context-panel__section-body">
          {top3.length === 0 ? (
            <p className="context-panel__empty">No scores yet.</p>
          ) : (
            top3.map((entry, idx) => {
              const health = normalizeHealthStatus(entry.status)
              const tone = health === 'GREEN' ? 'green' : health === 'YELLOW' ? 'amber' : 'red'
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'
              const score = entry.score ?? 0
              return (
                <div className="context-panel__leaderboard-row" key={entry.id}>
                  <span className="context-panel__leaderboard-medal" aria-hidden="true">{medal}</span>
                  <div className="context-panel__leaderboard-info">
                    <span className="context-panel__leaderboard-name">{entry.name}</span>
                    <div className="context-panel__leaderboard-bar">
                      <div className={`context-panel__leaderboard-fill context-panel__leaderboard-fill--${tone}`}
                           style={{ width: `${Math.min(score, 100)}%` }} />
                    </div>
                  </div>
                  <span className="context-panel__leaderboard-score">{score}</span>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <h3 className="context-panel__section-title">Related reports</h3>
        </header>
        <div className="context-panel__section-body">
          <Link href="/laporan-bulanan" className="context-panel__focus-item">
            <span className="context-panel__focus-icon-inline" aria-hidden="true">
              <FileText size={13} />
            </span>
            <span className="context-panel__focus-label">Monthly Report</span>
          </Link>
        </div>
      </section>
    </>
  )
}
