import { Bars, Meter, Delta, Tooltip } from '../design-system'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import type { Tone } from '../lib/tone'
import type { ProgramSummaryPayload } from '../types'

/**
 * Portfolio analytics — surfaces program-execution signals that the backend
 * (`programSummary`) already computes but Home never showed: deadline horizon,
 * momentum/velocity, and team task capacity. Pure FE; no new data. On-identity
 * for a work-program platform (PDCA), not risk.
 */
export function PortfolioAnalytics({ data }: { data: ProgramSummaryPayload }) {
  const navigate = useInertiaNavigate()
  const { summary, momentum, velocity, taskLoad, programsForChart } = data
  const tlm = summary.terlambat + summary.overdue
  const activeProgramCount = summary.onTrack + summary.atRisk + tlm

  // Deadline horizon — derived from per-program daysRemaining (surfaces overdue,
  // which the coarse deadlineClusters folds away).
  const dr = programsForChart.map(p => p.daysRemaining).filter((d): d is number => d != null)
  const horizon = [
    { label: 'Lewat',  value: dr.filter(d => d < 0).length,             tone: 'red' as Tone },
    { label: '≤30 hr', value: dr.filter(d => d >= 0 && d <= 30).length, tone: 'amber' as Tone },
    { label: '31–60',  value: dr.filter(d => d > 30 && d <= 60).length, tone: 'amber' as Tone },
    { label: '61–90',  value: dr.filter(d => d > 60 && d <= 90).length, tone: 'green' as Tone },
    { label: '90+',    value: dr.filter(d => d > 90).length,            tone: 'green' as Tone },
  ]
  const hasHorizon = dr.length > 0

  // Team capacity — per-unit task load (done vs total, overdue flag).
  const units = taskLoad
    .filter(t => t.kind === 'unit' && !t.isRollup && t.total > 0)
    .sort((a, b) => b.overdue - a.overdue || b.total - a.total)
    .slice(0, 6)
  const hasCapacity = units.length > 0

  return (
    <section className="hv__section">
      <header className="hv__sec-head">
        <h2 className="hv__sec-title">Portfolio program</h2>
        <span className="hv__sec-meta">{summary.total} program · {activeProgramCount} aktif</span>
      </header>
      <div className="hv__analisis-grid">

        {hasHorizon && (
          <div className="hv__chart-card">
            <div className="hv__chart-title">
              <Tooltip content="Jumlah program AKTIF per sisa-hari ke tenggat akhir. 'Lewat' = sudah melewati tenggat — beda dari status 'Terlambat' yang berbasis kesehatan/milestone.">
                <span className="hv__has-tip">Horizon tenggat</span>
              </Tooltip>
            </div>
            <Bars bars={horizon} height={132} onBarClick={() => navigate('/programs')} />
          </div>
        )}

        <div className="hv__chart-card">
          <div className="hv__chart-title">Momentum · 30 hari</div>
          <div className="hv__momentum">
            <div className="hv__mom-stat">
              <span className="hv__mom-val">{momentum.programsCompletedLast30d}</span>
              <span className="hv__mom-lbl">program selesai</span>
            </div>
            <div className="hv__mom-stat">
              <span className="hv__mom-val">{momentum.newProgramsLast30d}</span>
              <span className="hv__mom-lbl">program baru</span>
            </div>
            <div className="hv__mom-stat">
              <span className="hv__mom-val">{momentum.tasksCompletedThisWeek}</span>
              <span className="hv__mom-lbl">task minggu ini</span>
            </div>
            <div className="hv__mom-stat">
              <span className="hv__mom-val">{momentum.activeRate}<span className="hv__mom-unit">%</span></span>
              <span className="hv__mom-lbl">tingkat aktif</span>
            </div>
          </div>
          {velocity && (
            <div className="hv__velocity">
              <span className="hv__velocity-label">vs {Math.abs(velocity.daysAgo)} hari lalu</span>
              <span className="hv__velocity-item">On track <Delta value={velocity.onTrack} /></span>
              <span className="hv__velocity-item">Selesai <Delta value={velocity.selesai} /></span>
            </div>
          )}
        </div>

        {hasCapacity && (
          <div className="hv__chart-card">
            <div className="hv__chart-title">Kapasitas tim · per divisi</div>
            <div className="hv__cap-list">
              {units.map(u => (
                <div key={u.unit?.code ?? u.unit?.id} className="hv__cap-row">
                  <span className="hv__cap-name" title={u.unit?.name}>{u.unit?.code ?? '—'}</span>
                  <Meter
                    className="hv__cap-meter"
                    value={u.done}
                    max={u.total}
                    tone={u.overdue > 0 ? 'amber' : 'green'}
                    height={7}
                    aria-label={`${u.unit?.code}: ${u.done}/${u.total} task selesai`}
                  />
                  <span className="hv__cap-meta">
                    {u.done}/{u.total}
                    {u.overdue > 0 && <em className="hv__cap-overdue"> · {u.overdue} telat</em>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
