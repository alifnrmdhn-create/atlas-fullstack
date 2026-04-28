import { useState, useEffect, useCallback, useRef } from 'react'
import './MonthlyReportDetailDIMR.css'
import { api } from '../lib/api'
import {
  type RiskReport, type RiskSnapshot, type RiskKRI,
  type RiskStrategy, type RiskGovernance, type RiskLossEvent,
  MON_FULL, STATUS,
  RISK_LEVEL_META, KRI_STATUS_META, SCORE_CHANGE_META, RECOVERY_META,
  fmtRisk, fmtPct, fmtMoney,
} from '../types/monthlyReports'

// ── Risk Heatmap ──────────────────────────────────────────────────────────────

const BUMN_M: number[][] = [[1,5,10,15,20],[2,6,11,16,21],[3,8,13,18,23],[4,9,14,19,24],[7,12,17,22,25]]
function cellZone(p: number, d: number) {
  const s = BUMN_M[p - 1]?.[d - 1] ?? 1
  if (s >= 20) return 'high'
  if (s >= 16) return 'mod-high'
  if (s >= 12) return 'moderate'
  if (s >= 6)  return 'low-moderate'
  return 'low'
}

function riskLevelTone(level: string | null | undefined) {
  switch (level) {
    case 'LOW': return 'low'
    case 'LOW_TO_MODERATE': return 'low-to-moderate'
    case 'MODERATE': return 'moderate'
    case 'MODERATE_TO_HIGH': return 'moderate-to-high'
    case 'HIGH': return 'high'
    default: return 'neutral'
  }
}

function kriStatusTone(status: string | null | undefined) {
  switch (status) {
    case 'NORMAL': return 'normal'
    case 'WARNING': return 'warning'
    case 'CRITICAL': return 'critical'
    default: return 'normal'
  }
}

function trendTone(trend: string | null | undefined) {
  switch (trend) {
    case 'IMPROVING': return 'improving'
    case 'WORSENING': return 'worsening'
    default: return 'stable'
  }
}

function scoreChangeTone(change: string | null | undefined) {
  switch (change) {
    case 'IMPROVED': return 'improved'
    case 'WORSENED': return 'worsened'
    default: return 'stable'
  }
}

function recoveryTone(status: string | null | undefined) {
  switch (status) {
    case 'UNRECOVERED': return 'unrecovered'
    case 'PARTIAL': return 'partial'
    case 'RECOVERED': return 'recovered'
    default: return 'neutral'
  }
}

function mitigationProgressTone(pct: number) {
  if (pct >= 80) return 'high'
  if (pct >= 50) return 'medium'
  return 'low'
}

function stanceTone(stance: string | null | undefined) {
  switch (stance) {
    case 'TIDAK_TOLERAN': return 'intolerant'
    case 'KONSERVATIF': return 'conservative'
    case 'MODERAT': return 'moderate'
    case 'STRATEGIS': return 'strategic'
    default: return 'neutral'
  }
}

function compositeRatingClass(rating: string | null | undefined) {
  return rating ? rating.toLowerCase().replace(/[^\w-]+/g, '') : ''
}

function RiskHeatmap({ snapshots }: { snapshots: RiskSnapshot[] }) {
  const P_ROWS = [5, 4, 3, 2, 1]
  const D_COLS = [1, 2, 3, 4, 5]

  return (
    <div className="dimr-heatmap">
      <div className="dimr-heatmap__y-label">Probabilitas ↑</div>
      <div className="dimr-heatmap__main">
        <div className="dimr-heatmap__grid-wrap">
          <div className="dimr-heatmap__y-axis">
            {P_ROWS.map(p => (
              <div key={p} className="dimr-heatmap__y-tick">{p}</div>
            ))}
          </div>
          <div className="dimr-heatmap__cells-wrap">
            <div className="dimr-heatmap__cells">
              {P_ROWS.map(p =>
                D_COLS.map(d => {
                  const risks = snapshots.filter(s => s.probabilitas === p && s.dampak === d)
                  return (
                    <div key={`${p}-${d}`} className={`dimr-heatmap__cell zone-${cellZone(p, d)}`}>
                      {risks.map(r => (
                        <span
                          key={r.id}
                          className="dimr-heatmap__dot"
                          data-level={riskLevelTone(r.riskLevel)}
                          title={`${r.riskCode} — ${r.riskName}`}
                        >
                          {r.order + 1}
                        </span>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
            <div className="dimr-heatmap__x-axis">
              {D_COLS.map(d => <div key={d} className="dimr-heatmap__x-tick">{d}</div>)}
            </div>
            <div className="dimr-heatmap__x-label">Dampak →</div>
          </div>
        </div>
        <div className="dimr-heatmap__legend">
          {Object.entries(RISK_LEVEL_META).map(([key, m]) => (
            <span key={key} className="dimr-heatmap__legend-item">
              <span className="dimr-heatmap__legend-dot" data-level={riskLevelTone(key)} />
              {m.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── RAS Panel ─────────────────────────────────────────────────────────────────

function RasPanel({ strategy }: { strategy: RiskStrategy }) {
  const capacity  = Number(strategy.riskCapacity)
  const appetite  = Number(strategy.riskAppetite)
  const tolerance = Number(strategy.riskTolerance)
  const exposure  = Number(strategy.totalExposure)

  const toBarPct = (v: number) => Math.min((v / capacity) * 100, 100)
  const exposurePct = toBarPct(exposure)

  return (
    <div>
      <div className="dimr-ras__header">
        <span className="dimr-ras__stance">
          Stance:&nbsp;<strong className="dimr-ras__stance-value" data-stance={stanceTone(strategy.riskStance)}>
            {strategy.riskStance.replace('_', ' ')}
          </strong>
        </span>
        <span className={`dimr-ras__compliant ${strategy.rasCompliant ? 'yes' : 'no'}`}>
          {strategy.rasCompliant ? '✓ Compliant' : '✗ Breach'}
        </span>
      </div>

      <div className="dimr-ras__gauge-wrap">
        <div className="dimr-ras__gauge-labels">
          <span>0</span>
          <span>Eksposur: {(exposurePct).toFixed(0)}% dari Kapasitas</span>
        </div>
        <div className="dimr-ras__gauge-track">
          <div
            className={`dimr-ras__gauge-fill ${strategy.rasCompliant ? 'ok' : 'breach'}`}
            style={{ width: `${exposurePct}%` }}
          />
          <div
            className="dimr-ras__gauge-marker appetite"
            data-label="Appetite"
            style={{ left: `${toBarPct(appetite)}%` }}
          />
          <div
            className="dimr-ras__gauge-marker tolerance"
            data-label="Toleransi"
            style={{ left: `${toBarPct(tolerance)}%` }}
          />
        </div>
      </div>

      <div className="dimr-ras__nums">
        {[
          { label: 'Kapasitas',  val: fmtMoney(strategy.riskCapacity) },
          { label: 'Appetite',   val: fmtMoney(strategy.riskAppetite) },
          { label: 'Toleransi',  val: fmtMoney(strategy.riskTolerance) },
          { label: 'Eksposur',   val: fmtMoney(strategy.totalExposure) },
        ].map(({ label, val }) => (
          <div key={label} className="dimr-ras__num">
            <div className="dimr-ras__num-label">{label}</div>
            <div className="dimr-ras__num-val">{val}</div>
          </div>
        ))}
      </div>

      {strategy.notes && <div className="dimr-ras__notes">{strategy.notes}</div>}
    </div>
  )
}

// ── KRI Card ──────────────────────────────────────────────────────────────────

function KriCard({ kri, ytd }: { kri: RiskKRI; ytd?: number[] }) {
  const actual   = Number(kri.actualValue)
  const target   = Number(kri.targetValue)
  const warning  = Number(kri.thresholdWarning)
  const critical = Number(kri.thresholdCritical)
  const meta     = KRI_STATUS_META[kri.status] ?? KRI_STATUS_META.NORMAL!
  const prev     = kri.prevMonthValue != null ? Number(kri.prevMonthValue) : null

  // threshold bar fill %
  const lo = kri.higherIsBetter ? critical : 0
  const hi = kri.higherIsBetter ? target   : critical
  const fillPct = hi !== lo ? Math.min(Math.max(((actual - lo) / (hi - lo)) * 100, 0), 100) : 50

  const TREND_ICON:  Record<string, string> = { IMPROVING: '↑', STABLE: '→', WORSENING: '↓' }

  const SparkLine = () => {
    if (!ytd || ytd.length < 2) return null
    const min = Math.min(...ytd)
    const max = Math.max(...ytd)
    const range = max - min || 1
    const W = 60, H = 22
    const pts = ytd.map((v, i) => {
      const x = (i / (ytd.length - 1)) * W
      const y = H - ((v - min) / range) * (H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    const last   = ytd[ytd.length - 1]!
    const lastX  = W
    const lastY  = H - ((last - min) / range) * (H - 4) - 2
    return (
      <svg width={W} height={H} className="dimr-kri-card__spark">
        <polyline points={pts} fill="none" stroke={meta.color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.6" />
        <circle cx={lastX} cy={lastY} r="2.5" fill={meta.color} />
      </svg>
    )
  }

  return (
    <div className={`dimr-kri-card status-${kriStatusTone(kri.status)}`}>
      <div className="dimr-kri-card__header">
        <span className="dimr-kri-card__code">{kri.kriCode}</span>
        <span className={`dimr-kri-card__badge ${kriStatusTone(kri.status)}`}>{meta.label}</span>
      </div>

      <div className="dimr-kri-card__name">{kri.kriName}</div>

      <div className="dimr-kri-card__main">
        <div className="dimr-kri-card__value-row">
          <span className="dimr-kri-card__actual" data-status={kriStatusTone(kri.status)}>
            {fmtRisk(kri.actualValue, 2)}
          </span>
          <span className="dimr-kri-card__unit">{kri.unit}</span>
        </div>
        <SparkLine />
      </div>

      <div className="dimr-kri-card__threshold-bar">
        <div className="dimr-kri-card__threshold-track">
          <div
            className="dimr-kri-card__threshold-fill"
            data-status={kriStatusTone(kri.status)}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="dimr-kri-card__threshold-labels">
          <span>Crit: {fmtRisk(critical, 1)}</span>
          <span>Warn: {fmtRisk(warning, 1)}</span>
          <span>Target: {fmtRisk(target, 1)}</span>
        </div>
      </div>

      <div className="dimr-kri-card__meta-row">
        {prev !== null && (
          <span className="dimr-kri-card__meta">Prev: {fmtRisk(prev, 2)}</span>
        )}
        <span
          className="dimr-kri-card__trend"
          data-trend={trendTone(kri.trend)}
        >
          {TREND_ICON[kri.trend]} {kri.trend}
        </span>
      </div>

      {kri.notes && <div className="dimr-kri-card__notes">{kri.notes}</div>}
    </div>
  )
}

// ── Mitigation Card ───────────────────────────────────────────────────────────

function MitigationCard({ snapshot }: { snapshot: RiskSnapshot }) {
  const m = snapshot.mitigation
  if (!m) return null

  const pct      = Math.round(Number(m.completionRate) * 100)
  const absRate  = m.budgetAbsorption ? Math.round(Number(m.budgetAbsorption) * 100) : null
  const levelTone = riskLevelTone(snapshot.riskLevel)

  return (
    <div className="dimr-mitig-card">
      <div className="dimr-mitig-card__stripe" data-level={levelTone} />
      <div className="dimr-mitig-card__body">
        <div className="dimr-mitig-card__header">
          <div className="dimr-mitig-card__risk-info">
            <div className="dimr-mitig-card__code-line">
              <span className="dimr-mitig-card__level-dot" data-level={levelTone} />
              <span className="dimr-mitig-card__code">{snapshot.riskCode}</span>
            </div>
            <div className="dimr-mitig-card__name">{snapshot.riskName}</div>
          </div>
          {m.isOverdue && (
            <span className="dimr-mitig-card__overdue">
              ⚠ Overdue{m.overdueDays ? ` ${m.overdueDays}h` : ''}
            </span>
          )}
        </div>

        <div className="dimr-mitig-card__progress">
          <div className="dimr-mitig-card__prog-row">
            <span>Aksi Mitigasi</span>
            <span className="dimr-mitig-card__prog-count">
              {m.completedActions}/{m.plannedActions} selesai &middot; {pct}%
            </span>
          </div>
          <div className="dimr-mitig-card__prog-track">
            <div className="dimr-mitig-card__prog-fill"
              data-progress={mitigationProgressTone(pct)}
              style={{ width: `${pct}%` }} />
          </div>
        </div>

        {m.budgetAllocated && (
          <div className="dimr-mitig-card__budget">
            <div className="dimr-mitig-card__budget-item">
              <span className="dimr-mitig-card__budget-label">Anggaran</span>
              <span className="dimr-mitig-card__budget-val">{fmtMoney(m.budgetAllocated)}</span>
            </div>
            {m.budgetRealized && (
              <div className="dimr-mitig-card__budget-item">
                <span className="dimr-mitig-card__budget-label">Realisasi</span>
                <span className="dimr-mitig-card__budget-val">{fmtMoney(m.budgetRealized)}</span>
              </div>
            )}
            {absRate !== null && (
              <div className="dimr-mitig-card__budget-item">
                <span className="dimr-mitig-card__budget-label">Serapan</span>
                <span className="dimr-mitig-card__budget-val">{absRate}%</span>
              </div>
            )}
          </div>
        )}

        {m.notes && <div className="dimr-mitig-card__notes">{m.notes}</div>}
      </div>
    </div>
  )
}

// ── Loss Events Table ─────────────────────────────────────────────────────────

function LossEventsTable({ events }: { events: RiskLossEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="dimr-empty">
        <span className="dimr-empty__icon">✓</span>
        <span className="dimr-empty__text">Tidak ada loss event pada periode ini.</span>
      </div>
    )
  }

  const totalImpact    = events.reduce((s, e) => s + Number(e.impactAmount ?? 0), 0)
  const totalRecovered = events.reduce((s, e) => s + Number(e.recoveredAmount ?? 0), 0)

  return (
    <div>
      <div className="dimr-loss__summary-row">
        {[
          { label: 'Total Dampak',    val: fmtMoney(String(totalImpact)),               cls: 'red'   },
          { label: 'Total Dipulihkan', val: fmtMoney(String(totalRecovered)),            cls: 'green' },
          { label: 'Net Kerugian',    val: fmtMoney(String(totalImpact - totalRecovered)), cls: ''    },
        ].map(({ label, val, cls }) => (
          <div key={label} className="dimr-loss__summary-card">
            <div className="dimr-loss__summary-label">{label}</div>
            <div className={`dimr-loss__summary-val ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      <div className="dimr-loss__table-wrap">
        <table className="dimr-loss__table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Kategori</th>
              <th>Deskripsi</th>
              <th>Dampak</th>
              <th>Status</th>
              <th>PIC</th>
            </tr>
          </thead>
          <tbody>
            {events.map(ev => {
              const rec = RECOVERY_META[ev.recoveryStatus]
              return (
                <tr key={ev.id}>
                  <td className="dimr-loss__cell-nowrap">
                    {new Date(ev.eventDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td><span className="dimr-loss__cat-badge">{ev.category}</span></td>
                  <td className="dimr-loss__cell-desc">{ev.description}</td>
                  <td className="dimr-loss__cell-impact">{fmtMoney(ev.impactAmount)}</td>
                  <td>
                    <span className="dimr-loss__recovery" data-recovery={recoveryTone(ev.recoveryStatus)}>
                      {rec?.label ?? ev.recoveryStatus}
                    </span>
                  </td>
                  <td className="dimr-loss__cell-nowrap">{ev.pic}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Governance Scorecard ──────────────────────────────────────────────────────

function GovernanceScorecard({ gov }: { gov: RiskGovernance }) {
  const items = [
    { label: 'Cakupan Risk Register',    val: fmtPct(gov.riskRegisterCoverage),   ok: Number(gov.riskRegisterCoverage) >= 0.9 },
    { label: 'Risiko Tanpa PIC',         val: String(gov.risksWithoutOwner),       ok: gov.risksWithoutOwner === 0 },
    { label: 'Tingkat Pelaporan',        val: fmtPct(gov.reportSubmissionRate),    ok: Number(gov.reportSubmissionRate) >= 0.9 },
    { label: 'Kelengkapan Organ',        val: fmtPct(gov.organCompletenessRate),   ok: Number(gov.organCompletenessRate) >= 0.9 },
    { label: 'Realisasi Program Kerja',  val: fmtPct(gov.workProgramRealization),  ok: Number(gov.workProgramRealization) >= 0.8 },
    { label: 'Tindak Lanjut Audit',      val: fmtPct(gov.auditFollowUpRate),       ok: Number(gov.auditFollowUpRate) >= 0.8 },
    { label: 'Pemutakhiran ERIN',        val: fmtPct(gov.erinUpdateRate),          ok: Number(gov.erinUpdateRate) >= 0.9 },
    { label: 'Temuan Internal Control',  val: String(gov.internalControlFindings), ok: gov.internalControlFindings < 5 },
    { label: 'Temuan Kritis Terbuka',    val: String(gov.criticalFindingsOpen),    ok: gov.criticalFindingsOpen === 0 },
  ]

  return (
    <div className="dimr-gov-grid">
      {items.map(item => (
        <div key={item.label} className={`dimr-gov-card ${item.ok ? 'ok' : 'warn'}`}>
          <div className="dimr-gov-card__label">{item.label}</div>
          <div className="dimr-gov-card__val">{item.val}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

type Section = 'top-risks' | 'exposure' | 'kri' | 'mitigasi' | 'led' | 'governance' | 'narasi'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'top-risks',  label: 'Top Risks' },
  { id: 'exposure',   label: 'Eksposur & RAS' },
  { id: 'kri',        label: 'KRI' },
  { id: 'mitigasi',   label: 'Mitigasi' },
  { id: 'led',        label: 'Loss Events' },
  { id: 'governance', label: 'Governance' },
  { id: 'narasi',     label: 'Narasi' },
]

interface Props {
  report: RiskReport
  onBack: () => void
  onRefresh: () => void
  userId: number
  userRole: string
}

export function MonthlyReportDetailDIMR({ report, onBack, onRefresh, userRole }: Props) {
  const [activeSection, setActiveSection] = useState<Section>('top-risks')
  const [ytdSeries, setYtdSeries]         = useState<Record<string, { month: number; value: number }[]>>({})
  const [busy, setBusy]                   = useState(false)
  const [editModal, setEditModal]         = useState<'kri' | 'loss' | 'rating' | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Safe arrays
  const snapshots  = report.riskSnapshots ?? []
  const lossEvents = report.lossEvents    ?? []
  const narratives = report.narratives    ?? []

  const st = STATUS[report.status] ?? STATUS['APPROVED']!
  const isDraft = report.status === 'DRAFT'

  // Summary strip
  const highCritCount  = snapshots.filter(s => s.riskLevel === 'MODERATE_TO_HIGH' || s.riskLevel === 'HIGH').length
  const openCount      = snapshots.filter(s => s.status === 'OPEN' || s.status === 'WATCHLIST').length
  const allKri         = snapshots.flatMap(s => s.kris ?? [])
  const kriBreachCount = allKri.filter(k => k.status === 'WARNING' || k.status === 'CRITICAL').length
  const exposurePct    = report.strategy ? (Number(report.strategy.exposureVsAppetite) * 100) : null
  const lossCount      = lossEvents.length
  const totalLoss      = lossEvents.reduce((s, e) => s + Number(e.impactAmount ?? 0), 0)

  const canApprove =
    (userRole === 'KASUBDIV' && report.status === 'PENDING_KASUB') ||
    (userRole === 'KADIV'    && report.status === 'PENDING_KADIV')

  // Fetch YTD
  useEffect(() => {
    if (!report.id) return
    api.get<{ data: typeof ytdSeries }>(`/risk-reports/${report.id}/ytd`)
      .then(d => { if (d?.data) setYtdSeries(d.data) })
      .catch((err) => console.error('[Atlas] Silent failure in MonthlyReportDetailDIMR.tsx:', err))
  }, [report.id])

  // Scroll spy
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const sections = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          )
          setActiveSection(top.target.id as Section)
        }
      },
      { threshold: 0.2 }
    )
    sections.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [snapshots])

  const getYtd = useCallback((kriCode: string) => {
    const s = ytdSeries[kriCode]
    return s ? s.sort((a, b) => a.month - b.month).map(x => x.value) : undefined
  }, [ytdSeries])

  return (
    <div className="dimr-view" ref={bodyRef}>

      {/* ── Top bar (reuse mrd-topbar) ── */}
      <div className="mrd-topbar">
        <button className="mrd-back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2 4 7l5 5" />
          </svg>
          Monthly Reports
        </button>
        <div className="mrd-topbar__divider" />
        <div className="mrd-topbar__title">
          <span className="mrd-topbar__period">Laporan Risiko — {MON_FULL[report.month - 1]} {report.year}</span>
          <span className="mrd-topbar__unit">{report.unit.name}</span>
        </div>
        <span className={`mrd-topbar__badge ${st.cls}`}>{st.label}</span>
        <div className="mrd-topbar__actions">
          {isDraft && (
            <>
              <button className="mrd-btn" onClick={() => setEditModal('rating')}>
                ✎ Rating
              </button>
              <button className="mrd-btn" onClick={() => setEditModal('kri')}>
                ✎ KRI
              </button>
              <button className="mrd-btn" onClick={() => setEditModal('loss')}>
                ✎ Loss Events
              </button>
              <button
                className="mrd-btn primary"
                disabled={busy}
                onClick={async () => {
                  if (!confirm('Submit laporan ini untuk direview?')) return
                  setBusy(true)
                  try {
                    await api.post(`/risk-reports/${report.id}/submit`, {})
                    onRefresh()
                  } catch (e) { alert(e instanceof Error ? e.message : 'Gagal submit') }
                  finally { setBusy(false) }
                }}
              >
                {busy ? '…' : 'Submit →'}
              </button>
            </>
          )}
          {canApprove && (
            <button
              className="mrd-btn green"
              disabled={busy}
              onClick={async () => {
                if (!confirm('Setujui laporan risiko ini?')) return
                setBusy(true)
                try {
                  await api.post(`/risk-reports/${report.id}/approve`, { action: 'APPROVED' })
                  onRefresh()
                } catch (e) { alert(e instanceof Error ? e.message : 'Gagal approve') }
                finally { setBusy(false) }
              }}
            >
              {busy ? '…' : '✓ Approve'}
            </button>
          )}
          <button className="mrd-btn" onClick={() => window.print()}>⎙ Cetak</button>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="dimr-header">
        <div className="dimr-header__inner">
          <div className="dimr-header__left">
            {report.submittedBy && (
              <span className="dimr-header__meta-item">
                Diajukan oleh <strong>{report.submittedBy.name}</strong>
                {report.submittedAt && (
                  <> · {new Date(report.submittedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                )}
              </span>
            )}
            {report.approvedAt && (
              <span className="dimr-header__meta-green">
                · Disetujui {new Date(report.approvedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            )}
          </div>

          <div className="dimr-header__right">
            {report.compositeRating && (
              <div className="dimr-header__stat">
                <div className="dimr-header__stat-label">Peringkat Komposit</div>
                <div className={`dimr-header__stat-val ${compositeRatingClass(report.compositeRating)}`}>{report.compositeRating}</div>
              </div>
            )}
            {report.rmiScore && (
              <div className="dimr-header__stat">
                <div className="dimr-header__stat-label">RMI Score</div>
                <div className="dimr-header__stat-val">
                  {Number(report.rmiScore).toFixed(1)}
                  <span className="dimr-header__stat-of"> / 5.0</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Summary strip ── */}
      <div className="dimr-strip">
        <div className={`dimr-strip__card ${highCritCount > 0 ? 'danger' : 'ok'}`}>
          <div className="dimr-strip__card-inner">
            <div className="dimr-strip__icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1.5 L14.5 13.5 H1.5 Z" /><line x1="8" y1="6" x2="8" y2="9.5" /><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="dimr-strip__num">
              {highCritCount}
            </div>
            <div className="dimr-strip__label">Risiko High / Critical</div>
            <div className="dimr-strip__sub">{openCount} risiko aktif total</div>
          </div>
        </div>

        <div className={`dimr-strip__card ${kriBreachCount > 0 ? 'warning' : 'ok'}`}>
          <div className="dimr-strip__card-inner">
            <div className="dimr-strip__icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="9" width="3" height="5" rx="0.5" /><rect x="6.5" y="5.5" width="3" height="8.5" rx="0.5" /><rect x="11" y="2" width="3" height="12" rx="0.5" />
              </svg>
            </div>
            <div className="dimr-strip__num">
              {kriBreachCount}
            </div>
            <div className="dimr-strip__label">KRI Breach</div>
            <div className="dimr-strip__sub">Warning + Critical dari {allKri.length} KRI</div>
          </div>
        </div>

        {exposurePct !== null ? (
          <div className={`dimr-strip__card ${exposurePct > 100 ? 'danger' : exposurePct > 90 ? 'warning' : 'ok'}`}>
            <div className="dimr-strip__card-inner">
              <div className="dimr-strip__icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6.5" /><circle cx="8" cy="8" r="3.5" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="dimr-strip__num">
                {exposurePct.toFixed(1)}%
              </div>
              <div className="dimr-strip__label">Eksposur vs Appetite</div>
              <div className="dimr-strip__sub">
                {report.strategy?.rasCompliant ? 'Dalam batas risk appetite' : 'Melampaui risk appetite'}
              </div>
            </div>
          </div>
        ) : (
          <div className="dimr-strip__card info">
            <div className="dimr-strip__card-inner">
              <div className="dimr-strip__icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6.5" /><circle cx="8" cy="8" r="3.5" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="dimr-strip__num">—</div>
              <div className="dimr-strip__label">Eksposur vs Appetite</div>
              <div className="dimr-strip__sub">Data RAS belum tersedia</div>
            </div>
          </div>
        )}

        <div className={`dimr-strip__card ${lossCount > 0 ? 'attention' : 'info'}`}>
          <div className="dimr-strip__card-inner">
            <div className="dimr-strip__icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1.5,3.5 5.5,8 8.5,5.5 14.5,12.5" /><polyline points="11,12.5 14.5,12.5 14.5,9" />
              </svg>
            </div>
            <div className="dimr-strip__num">
              {lossCount}
            </div>
            <div className="dimr-strip__label">Loss Events</div>
            <div className="dimr-strip__sub">
              {lossCount > 0 ? `Total dampak ${fmtMoney(String(totalLoss))}` : 'Nihil pada periode ini'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section anchors ── */}
      <div className="dimr-anchors">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`dimr-anchor ${activeSection === s.id ? 'active' : ''}`}
            onClick={e => {
              e.preventDefault()
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {s.label}
          </a>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="dimr-content">

        {/* ─ Section 1: Top Risks ─ */}
        <div id="top-risks" className="dimr-section">
          <div className="dimr-section-header">
            <h2 className="dimr-section-header__title">Top Risks Perusahaan</h2>
            <span className="dimr-section-header__count">{snapshots.length} risiko</span>
          </div>
          <div className="dimr-risk-list">
            {snapshots.map(snap => {
              const lm = RISK_LEVEL_META[snap.riskLevel] ?? RISK_LEVEL_META.LOW!
              const cm = snap.scoreChange ? SCORE_CHANGE_META[snap.scoreChange] : null
              return (
                <div key={snap.id} className={`dimr-risk-card level-${snap.riskLevel}`}>
                  <div className="dimr-risk-card__num">{snap.order + 1}</div>

                  <div className="dimr-risk-card__body">
                    <div className="dimr-risk-card__top">
                      <span className="dimr-risk-card__code">{snap.riskCode}</span>
                      <span className="dimr-risk-card__category">{snap.category}</span>
                      <span className="dimr-risk-card__level-tag">
                        <span className="dimr-risk-card__level-dot" data-level={riskLevelTone(snap.riskLevel)} />
                        {lm.label}
                      </span>
                      <span className={`dimr-risk-card__status-text ${snap.status.toLowerCase()}`}>
                        {snap.status}
                      </span>
                    </div>
                    <div className="dimr-risk-card__name">{snap.riskName}</div>
                    {snap.notes && <div className="dimr-risk-card__notes">{snap.notes}</div>}
                    <div className="dimr-risk-card__owner">{snap.ownerName}</div>
                  </div>

                  <div className="dimr-risk-card__score-col">
                    <div className="dimr-risk-card__score" data-level={riskLevelTone(snap.riskLevel)}>
                      {snap.riskScore}
                    </div>
                    <div className="dimr-risk-card__pd">K{snap.probabilitas}×D{snap.dampak}</div>
                    {cm && snap.prevMonthScore != null && (
                      <div className="dimr-risk-card__change" data-change={scoreChangeTone(snap.scoreChange)}>
                        {cm.icon} dari {snap.prevMonthScore}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─ Section 2: Heatmap + RAS ─ */}
        <div id="exposure" className="dimr-section">
          <div className="dimr-section-header">
            <h2 className="dimr-section-header__title">Risk Exposure Overview</h2>
          </div>
          <div className="dimr-exposure-grid">
            <div className="dimr-panel">
              <div className="dimr-panel__title">Risk Heatmap — Top Risks</div>
              <RiskHeatmap snapshots={snapshots} />
            </div>
            {report.strategy ? (
              <div className="dimr-panel">
                <div className="dimr-panel__title">Risk Appetite Statement</div>
                <RasPanel strategy={report.strategy} />
              </div>
            ) : (
              <div className="dimr-panel">
                <div className="dimr-panel__title">Risk Appetite Statement</div>
                <div className="dimr-empty">
                  <span className="dimr-empty__text">Data RAS belum tersedia.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─ Section 3: KRI ─ */}
        <div id="kri" className="dimr-section">
          <div className="dimr-kri-section-header">
            <h2 className="dimr-section-header__title">KRI Dashboard</h2>
            <div className="dimr-kri-legend">
              {Object.entries(KRI_STATUS_META).map(([k, v]) => (
                <span key={k} className="dimr-kri-legend__item">
                  <span className="dimr-kri-legend__dot" data-status={kriStatusTone(k)} />
                  {v.label}
                </span>
              ))}
            </div>
          </div>
          <div className="dimr-kri-groups">
            {snapshots.map(snap => {
              const kris = snap.kris ?? []
              if (kris.length === 0) return null
              return (
                <div key={snap.id}>
                  <div className="dimr-kri-group__header">
                    <span className="dimr-kri-group__dot"
                      data-level={riskLevelTone(snap.riskLevel)} />
                    <span className="dimr-kri-group__code">{snap.riskCode}</span>
                    <span className="dimr-kri-group__name">{snap.riskName}</span>
                    <span className="dimr-section-header__count dimr-kri-group__count">
                      {kris.length} KRI
                    </span>
                  </div>
                  <div className="dimr-kri-grid">
                    {kris.map(kri => (
                      <KriCard key={kri.id} kri={kri} ytd={getYtd(kri.kriCode)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─ Section 4: Mitigasi ─ */}
        <div id="mitigasi" className="dimr-section">
          <div className="dimr-section-header">
            <h2 className="dimr-section-header__title">Perlakuan Risiko &amp; Mitigasi</h2>
          </div>
          <div className="dimr-mitig-list">
            {snapshots.map(snap => <MitigationCard key={snap.id} snapshot={snap} />)}
          </div>
        </div>

        {/* ─ Section 5: LED ─ */}
        <div id="led" className="dimr-section">
          <div className="dimr-section-header">
            <h2 className="dimr-section-header__title">Loss Event Database</h2>
            <span className="dimr-section-header__count">{lossEvents.length} event</span>
          </div>
          <LossEventsTable events={lossEvents} />
        </div>

        {/* ─ Section 6: Governance ─ */}
        <div id="governance" className="dimr-section">
          <div className="dimr-section-header">
            <h2 className="dimr-section-header__title">Governance Scorecard</h2>
          </div>
          {report.governance
            ? <GovernanceScorecard gov={report.governance} />
            : <div className="dimr-empty"><span className="dimr-empty__text">Data governance belum tersedia.</span></div>
          }
        </div>

        {/* ─ Section 7: Narasi ─ */}
        <div id="narasi" className="dimr-section">
          <div className="dimr-section-header">
            <h2 className="dimr-section-header__title">Narasi Eksekutif</h2>
          </div>
          {narratives.length === 0
            ? <div className="dimr-empty"><span className="dimr-empty__text">Belum ada narasi.</span></div>
            : (
              <div className="dimr-narratives">
                {narratives.map(n => (
                  <div key={n.id} className="dimr-narrative">
                    <div className="dimr-narrative__section">{n.section.replace(/_/g, ' ')}</div>
                    <div className="dimr-narrative__content">{n.content}</div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

      </div>

      {/* ── Edit Modals ──────────────────────────────────────────────────── */}
      {editModal === 'rating' && (
        <RatingModal
          report={report}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); onRefresh() }}
        />
      )}
      {editModal === 'kri' && (
        <KriEditModal
          report={report}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); onRefresh() }}
        />
      )}
      {editModal === 'loss' && (
        <LossEventModal
          report={report}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Rating Modal ──────────────────────────────────────────────────────────────

const COMPOSITE_OPTS = ['LOW', 'LOW_TO_MODERATE', 'MODERATE', 'MODERATE_TO_HIGH', 'HIGH']
const COMPOSITE_LABELS: Record<string, string> = {
  LOW: 'Low', LOW_TO_MODERATE: 'Low–Moderate', MODERATE: 'Moderate',
  MODERATE_TO_HIGH: 'Moderate–High', HIGH: 'High',
}

function RatingModal({ report, onClose, onSaved }: {
  report: RiskReport
  onClose: () => void
  onSaved: () => void
}) {
  const [compositeRating, setCompositeRating] = useState(report.compositeRating ?? '')
  const [rmiScore, setRmiScore]               = useState(report.rmiScore ? String(report.rmiScore) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      await api.put(`/risk-reports/${report.id}`, {
        compositeRating: compositeRating || undefined,
        rmiScore: rmiScore ? Number(rmiScore) : undefined,
      })
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="dimr-modal-backdrop" onClick={onClose}>
      <div className="dimr-modal" onClick={e => e.stopPropagation()}>
        <div className="dimr-modal__header">
          <span className="dimr-modal__title">Edit Rating Komposit</span>
          <button className="dimr-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="dimr-modal__body">
          <label className="dimr-form-label">Peringkat Komposit</label>
          <select className="dimr-form-select" value={compositeRating} onChange={e => setCompositeRating(e.target.value)}>
            <option value="">— Pilih —</option>
            {COMPOSITE_OPTS.map(o => (
              <option key={o} value={o}>{COMPOSITE_LABELS[o]}</option>
            ))}
          </select>

          <label className="dimr-form-label" style={{ marginTop: 12 }}>RMI Score (0–5)</label>
          <input
            className="dimr-form-input"
            type="number" min="0" max="5" step="0.1"
            value={rmiScore}
            onChange={e => setRmiScore(e.target.value)}
            placeholder="mis. 3.5"
          />
          {err && <p className="dimr-form-error">{err}</p>}
        </div>
        <div className="dimr-modal__footer">
          <button className="mrd-btn" onClick={onClose} disabled={saving}>Batal</button>
          <button className="mrd-btn primary" onClick={save} disabled={saving}>
            {saving ? '…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── KRI Edit Modal ────────────────────────────────────────────────────────────

type KriDraft = {
  snapshotIdx: number
  riskCode: string
  riskName: string
  probabilitas: number
  dampak: number
  kris: Array<{
    kriCode: string
    kriName: string
    unit: string
    actualValue: string
    targetValue: string
    thresholdWarning: string
    thresholdCritical: string
    higherIsBetter: boolean
    notes: string
  }>
}

function KriEditModal({ report, onClose, onSaved }: {
  report: RiskReport
  onClose: () => void
  onSaved: () => void
}) {
  const [drafts, setDrafts] = useState<KriDraft[]>(
    (report.riskSnapshots ?? []).map((snap, si) => ({
      snapshotIdx: si,
      riskCode: snap.riskCode,
      riskName: snap.riskName,
      probabilitas: snap.probabilitas,
      dampak: snap.dampak,
      kris: (snap.kris ?? []).map(k => ({
        kriCode: k.kriCode,
        kriName: k.kriName,
        unit: k.unit,
        actualValue: String(k.actualValue),
        targetValue: String(k.targetValue),
        thresholdWarning: String(k.thresholdWarning),
        thresholdCritical: String(k.thresholdCritical),
        higherIsBetter: k.higherIsBetter,
        notes: k.notes ?? '',
      })),
    }))
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  const updateKri = (si: number, ki: number, field: string, val: string | boolean) => {
    setDrafts(prev => prev.map((d, i) =>
      i !== si ? d : {
        ...d,
        kris: d.kris.map((k, j) => j !== ki ? k : { ...k, [field]: val }),
      }
    ))
  }

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const riskSnapshots = (report.riskSnapshots ?? []).map((snap, si) => ({
        riskCode:      snap.riskCode,
        riskName:      snap.riskName,
        category:      snap.category,
        probabilitas:  drafts[si]?.probabilitas ?? snap.probabilitas,
        dampak:        drafts[si]?.dampak ?? snap.dampak,
        status:        snap.status,
        prevMonthScore: snap.prevMonthScore,
        ownerName:     snap.ownerName,
        notes:         snap.notes,
        kris: (drafts[si]?.kris ?? []).map(k => ({
          kriCode:           k.kriCode,
          kriName:           k.kriName,
          unit:              k.unit,
          actualValue:       Number(k.actualValue),
          targetValue:       Number(k.targetValue),
          thresholdWarning:  Number(k.thresholdWarning),
          thresholdCritical: Number(k.thresholdCritical),
          higherIsBetter:    k.higherIsBetter,
          notes:             k.notes || null,
        })),
        mitigation: snap.mitigation ? {
          plannedActions:   snap.mitigation.plannedActions,
          completedActions: snap.mitigation.completedActions,
          budgetAllocated:  snap.mitigation.budgetAllocated,
          budgetRealized:   snap.mitigation.budgetRealized,
          isOverdue:        snap.mitigation.isOverdue,
          overdueDays:      snap.mitigation.overdueDays,
          notes:            snap.mitigation.notes,
        } : undefined,
      }))
      await api.put(`/risk-reports/${report.id}`, { riskSnapshots })
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="dimr-modal-backdrop" onClick={onClose}>
      <div className="dimr-modal dimr-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="dimr-modal__header">
          <span className="dimr-modal__title">Edit KRI Aktual</span>
          <button className="dimr-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="dimr-modal__body dimr-modal__body--scroll">
          {drafts.length === 0 && (
            <p className="dimr-form-hint">Belum ada risk snapshot. Data risiko ditetapkan via template import.</p>
          )}
          {drafts.map((d, si) => (
            <div key={d.riskCode} className="dimr-kri-edit-group">
              <div className="dimr-kri-edit-group__header">
                <span className="dimr-kri-edit-group__code">{d.riskCode}</span>
                <span className="dimr-kri-edit-group__name">{d.riskName}</span>
                <span className="dimr-kri-edit-group__matrix">K{d.probabilitas}×D{d.dampak}</span>
              </div>
              {d.kris.length === 0 ? (
                <p className="dimr-form-hint" style={{ margin: '6px 0' }}>Tidak ada KRI untuk risiko ini.</p>
              ) : (
                <div className="dimr-kri-edit-table">
                  <div className="dimr-kri-edit-table__head">
                    <span>Kode</span><span>Nama KRI</span><span>Aktual</span>
                    <span>Target</span><span>Warning</span><span>Critical</span>
                  </div>
                  {d.kris.map((k, ki) => (
                    <div key={k.kriCode} className="dimr-kri-edit-table__row">
                      <span className="dimr-kri-edit-table__code">{k.kriCode}</span>
                      <span className="dimr-kri-edit-table__name">
                        {k.kriName} <em className="dimr-kri-edit-table__unit">({k.unit})</em>
                      </span>
                      <input
                        className="dimr-kri-edit-table__input dimr-kri-edit-table__input--aktual"
                        type="number" step="any"
                        value={k.actualValue}
                        onChange={e => updateKri(si, ki, 'actualValue', e.target.value)}
                      />
                      <input
                        className="dimr-kri-edit-table__input"
                        type="number" step="any"
                        value={k.targetValue}
                        onChange={e => updateKri(si, ki, 'targetValue', e.target.value)}
                      />
                      <input
                        className="dimr-kri-edit-table__input"
                        type="number" step="any"
                        value={k.thresholdWarning}
                        onChange={e => updateKri(si, ki, 'thresholdWarning', e.target.value)}
                      />
                      <input
                        className="dimr-kri-edit-table__input"
                        type="number" step="any"
                        value={k.thresholdCritical}
                        onChange={e => updateKri(si, ki, 'thresholdCritical', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {err && <p className="dimr-form-error">{err}</p>}
        </div>
        <div className="dimr-modal__footer">
          <button className="mrd-btn" onClick={onClose} disabled={saving}>Batal</button>
          <button className="mrd-btn primary" onClick={save} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan Semua KRI'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Loss Event Modal ──────────────────────────────────────────────────────────

type LossDraft = {
  eventDate: string
  category: string
  description: string
  impactAmount: string
  isRecurring: boolean
  recoveryStatus: string
  recoveredAmount: string
  pic: string
  notes: string
}

const EMPTY_LOSS: LossDraft = {
  eventDate: '', category: 'OPERASIONAL', description: '', impactAmount: '',
  isRecurring: false, recoveryStatus: 'UNRECOVERED', recoveredAmount: '', pic: '', notes: '',
}

const LOSS_CATEGORIES = ['OPERASIONAL', 'KREDIT', 'PASAR', 'LIKUIDITAS', 'HUKUM', 'REPUTASI', 'KEPATUHAN', 'LAINNYA']
const RECOVERY_STATUSES = ['UNRECOVERED', 'PARTIAL', 'RECOVERED']

function LossEventModal({ report, onClose, onSaved }: {
  report: RiskReport
  onClose: () => void
  onSaved: () => void
}) {
  const [events, setEvents] = useState<LossDraft[]>(
    (report.lossEvents ?? []).map(e => ({
      eventDate: e.eventDate.slice(0, 10),
      category: e.category,
      description: e.description,
      impactAmount: e.impactAmount ?? '',
      isRecurring: e.isRecurring,
      recoveryStatus: e.recoveryStatus,
      recoveredAmount: e.recoveredAmount ?? '',
      pic: e.pic,
      notes: e.notes ?? '',
    }))
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  const update = (idx: number, field: keyof LossDraft, val: string | boolean) => {
    setEvents(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }
  const addRow = () => setEvents(prev => [...prev, { ...EMPTY_LOSS }])
  const removeRow = (idx: number) => setEvents(prev => prev.filter((_, i) => i !== idx))

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const lossEvents = events
        .filter(e => e.eventDate && e.description)
        .map(e => ({
          eventDate:       new Date(e.eventDate).toISOString(),
          category:        e.category,
          description:     e.description,
          impactAmount:    e.impactAmount ? Number(e.impactAmount) : null,
          isRecurring:     e.isRecurring,
          recoveryStatus:  e.recoveryStatus,
          recoveredAmount: e.recoveredAmount ? Number(e.recoveredAmount) : null,
          pic:             e.pic,
          notes:           e.notes || null,
        }))
      await api.put(`/risk-reports/${report.id}`, { lossEvents })
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <div className="dimr-modal-backdrop" onClick={onClose}>
      <div className="dimr-modal dimr-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="dimr-modal__header">
          <span className="dimr-modal__title">Edit Loss Events</span>
          <button className="dimr-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="dimr-modal__body dimr-modal__body--scroll">
          {events.map((ev, idx) => (
            <div key={idx} className="dimr-loss-edit-row">
              <div className="dimr-loss-edit-row__grid">
                <div>
                  <label className="dimr-form-label">Tanggal</label>
                  <input className="dimr-form-input" type="date" value={ev.eventDate}
                    onChange={e => update(idx, 'eventDate', e.target.value)} />
                </div>
                <div>
                  <label className="dimr-form-label">Kategori</label>
                  <select className="dimr-form-select" value={ev.category}
                    onChange={e => update(idx, 'category', e.target.value)}>
                    {LOSS_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="dimr-form-label">Status Pemulihan</label>
                  <select className="dimr-form-select" value={ev.recoveryStatus}
                    onChange={e => update(idx, 'recoveryStatus', e.target.value)}>
                    {RECOVERY_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="dimr-form-label">Dampak (IDR)</label>
                  <input className="dimr-form-input" type="number" step="any" value={ev.impactAmount}
                    onChange={e => update(idx, 'impactAmount', e.target.value)}
                    placeholder="mis. 500000000" />
                </div>
                <div>
                  <label className="dimr-form-label">Jumlah Pulih (IDR)</label>
                  <input className="dimr-form-input" type="number" step="any" value={ev.recoveredAmount}
                    onChange={e => update(idx, 'recoveredAmount', e.target.value)} />
                </div>
                <div>
                  <label className="dimr-form-label">PIC</label>
                  <input className="dimr-form-input" type="text" value={ev.pic}
                    onChange={e => update(idx, 'pic', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="dimr-form-label">Deskripsi</label>
                <input className="dimr-form-input" type="text" value={ev.description}
                  onChange={e => update(idx, 'description', e.target.value)}
                  placeholder="Deskripsi singkat kejadian…" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="mrd-btn" style={{ color: 'var(--red)' }} onClick={() => removeRow(idx)}>
                  Hapus baris ini
                </button>
              </div>
              {idx < events.length - 1 && <hr className="dimr-loss-edit-divider" />}
            </div>
          ))}
          <button className="mrd-btn" style={{ marginTop: 8 }} onClick={addRow}>+ Tambah Loss Event</button>
          {err && <p className="dimr-form-error">{err}</p>}
        </div>
        <div className="dimr-modal__footer">
          <button className="mrd-btn" onClick={onClose} disabled={saving}>Batal</button>
          <button className="mrd-btn primary" onClick={save} disabled={saving}>
            {saving ? 'Menyimpan…' : `Simpan ${events.length} Event`}
          </button>
        </div>
      </div>
    </div>
  )
}
