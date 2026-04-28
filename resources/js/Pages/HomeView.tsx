import { useState, useEffect } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { HealthPill, SectionState, SkeletonBlock } from '../components/ui'
import type {
  DivisiProgramSummary, DivisiTaskLoad,
  ScorecardHealth, DeadlineCluster,
  BlockerSignal, KpiHealthPayload, MomentumPayload, VelocityPayload,
  ControlAlert, TopBlockerProgram, CheckpointItem, ActivityItem,
} from '../types'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 19) return 'Selamat sore'
  return 'Selamat malam'
}

// ── SVG Icons ──────────────────────────────────────────────────────────
const Ico = {
  check:    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>,
  clock:    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="6" cy="6" r="5"/><path d="M6 3.5V6l1.5 1.5"/></svg>,
  trend:    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 9l3.5-3.5 2.5 2.5L11 3"/><path d="M8 3h3v3"/></svg>,
  print:    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6V2h8v4M4 12H2v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4h-2M4 10h8v4H4z"/></svg>,
  link:     <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 9a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1M9 7a3 3 0 0 0-4 0L3 9a3 3 0 0 0 4 4l1-1"/></svg>,
  alert:    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 1L11 10H1L6 1z"/><path d="M6 5v2.5"/><circle cx="6" cy="9" r=".5" fill="currentColor" stroke="none"/></svg>,
  shield:   <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 1l4 1.5V6c0 2.5-2 4-4 5C4 10 2 8.5 2 6V2.5L6 1z"/></svg>,
  blocker:  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6" cy="6" r="5"/><path d="M3 3l6 6"/></svg>,
  activity: <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="1,6 3,3 5,8 7,4 9,7 11,5"/></svg>,
}

function getActionTone(action: string): string {
  const a = action.toUpperCase()
  if (a === 'CREATED') return 'positive'
  if (a === 'STATUS_CHANGED') return 'warn'
  if (a === 'MEASURED') return 'info'
  if (a === 'BLOCKER_ADDED') return 'alert'
  return 'default'
}

function getActionLabel(action: string): string {
  const a = action.toUpperCase()
  if (a === 'CREATED') return 'Dibuat'
  if (a === 'STATUS_CHANGED') return 'Diperbarui'
  if (a === 'MEASURED') return 'Diukur'
  if (a === 'BLOCKER_ADDED') return 'Blocker'
  return action
}

function getCheckpointTone(status: string): 'critical' | 'warn' | 'positive' | 'default' {
  const s = status.toUpperCase()
  if (s.includes('DELAY') || s.includes('LATE') || s.includes('OVERDUE') || s.includes('BLOCKED')) return 'critical'
  if (s.includes('RISK') || s.includes('HOLD') || s.includes('PENDING') || s.includes('IN_PROGRESS')) return 'warn'
  if (s.includes('DONE') || s.includes('COMPLETE') || s.includes('TRACK') || s.includes('READY')) return 'positive'
  return 'default'
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch { return iso }
}

function fmtRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m lalu`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}j lalu`
    return `${Math.floor(hrs / 24)}h lalu`
  } catch { return '' }
}

// ── Animated Ring ──────────────────────────────────────────────────────
function AnimatedRing({ segs, size = 200, cv, cl }: {
  segs: Array<{ v: number; color: string; label?: string }>
  size?: number; cv: string; cl?: string
}) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 80); return () => clearTimeout(t) }, [])

  const r = size * 0.34; const cx = size / 2
  const circ = 2 * Math.PI * r
  const total = segs.reduce((s, x) => s + x.v, 0)
  let off = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke="var(--surface-overlay-strong)" strokeWidth={size * 0.1} />
      {total > 0 && segs.map((s, i) => {
        const frac = s.v / total
        const len  = drawn ? frac * circ * 0.983 : 0
        const rot  = off * 360 - 90
        off += frac
        return (
          <circle key={i} cx={cx} cy={cx} r={r} fill="none"
            stroke={s.color} strokeWidth={size * 0.1}
            strokeDasharray={`${len} ${circ}`}
            style={{
              transform: `rotate(${rot}deg)`,
              transformOrigin: `${cx}px ${cx}px`,
              transition: drawn ? `stroke-dasharray ${0.5 + i * 0.12}s cubic-bezier(0.34,1.56,0.64,1)` : 'none',
            }}
          />
        )
      })}
      <text x={cx} y={cx - 12} textAnchor="middle"
        style={{ fontSize: size * 0.24, fontWeight: 800, fill: 'var(--text-strong)', fontFamily: 'inherit', letterSpacing: '-0.02em' }}>
        {cv}
      </text>
      {cl && <text x={cx} y={cx + 14} textAnchor="middle"
        style={{ fontSize: size * 0.08, fill: 'var(--text-muted)', fontFamily: 'inherit', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {cl}
      </text>}
    </svg>
  )
}

// ── Animated Bar ───────────────────────────────────────────────────────
function AnimBar({ segs, h = 8 }: { segs: Array<{ v: number; color: string; label?: string }>; h?: number }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 120); return () => clearTimeout(t) }, [])
  const total = segs.reduce((s, x) => s + x.v, 0)
  if (!total) return <div style={{ height: h, borderRadius: 99, background: 'var(--surface-overlay-strong)', width: '100%' }} />
  return (
    <div style={{ display: 'flex', height: h, borderRadius: 99, overflow: 'hidden', width: '100%', gap: 1.5 }}>
      {segs.filter(s => s.v > 0).map((s, i) => (
        <div key={i} title={s.label} style={{
          flex: s.v / total, background: s.color, minWidth: 4,
          transform: drawn ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: 'left',
          transition: drawn ? `transform ${0.4 + i * 0.08}s cubic-bezier(0.34,1.56,0.64,1)` : 'none',
        }} />
      ))}
    </div>
  )
}

// ── Sparkline — inline 14-day trend ────────────────────────────────────
function Sparkline({ values, w = 96, h = 28, color = 'var(--green)' }: {
  values: number[]; w?: number; h?: number; color?: string
}) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const stepX = w / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * stepX
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const area = `0,${h} ${points} ${w},${h}`
  const last = values[values.length - 1]
  const lastX = (values.length - 1) * stepX
  const lastY = h - ((last - min) / range) * h
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="hd-spark" aria-hidden="true">
      <polygon points={area} fill={color} fillOpacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  )
}

// ── Personal insight — most pressing one-line situation for this user ──
function buildPersonalInsight(
  summary: { total: number; onTrack: number; atRisk: number; selesai: number },
  tlm: number,
  momentum: MomentumPayload,
  byDivisi: DivisiProgramSummary[],
  velocity: VelocityPayload | null | undefined,
  criticalControlCount: number,
): string | null {
  // 1. Divisi dengan terlambat terbanyak — sinyal paling kritis
  const worstDiv = [...byDivisi]
    .filter(d => d.unit.id !== null && d.total > 0)
    .sort((a, b) => (b.terlambat + (b.overdue ?? 0)) - (a.terlambat + (a.overdue ?? 0)))[0]
  if (worstDiv && (worstDiv.terlambat + (worstDiv.overdue ?? 0)) > 0) {
    const code = worstDiv.unit.code.replace('-HLD', '')
    const n = worstDiv.terlambat + (worstDiv.overdue ?? 0)
    return `${code} punya ${n} program terlambat — perlu intervensi segera.`
  }
  // 2. Velocity memburuk sejak snapshot terakhir
  if (velocity && velocity.terlambat > 0) {
    return `+${velocity.terlambat} program baru terlambat sejak ${Math.abs(velocity.daysAgo)} jam lalu.`
  }
  // 3. Stagnant — hanya program at risk/terlambat yang stagnan yang layak jadi alert utama
  // (program On Track yang stagnan tidak sepenting program bermasalah yang stagnan)
  if (momentum.stagnantPrograms.length > 0 && (tlm > 0 || summary.atRisk > 0)) {
    const p = momentum.stagnantPrograms[0]
    return `"${p.name}" tanpa aktivitas ${p.daysIdle} hari — perlu tindak lanjut.`
  }
  // 4. Kontrol kritis
  if (criticalControlCount > 0) {
    return `${criticalControlCount} kontrol kritis masih terbuka — butuh keputusan.`
  }
  // 5. Semua sehat — positif
  if (tlm === 0 && summary.atRisk === 0 && summary.total > 0) {
    return `Semua ${summary.total} program dalam kondisi baik. Pertahankan momentum.`
  }
  return null
}


// ── Situation Hero — narrative lede, replaces StatusBanner ────────────
function SituationHero({ summary, tlm, velocity, needsActionCount, stagnantCount, trendSeries, scopeName, criticalControlCount, activeFilter, onFilterChange, insight }: {
  summary: { total: number; onTrack: number; atRisk: number; selesai: number; pctOnTrack: number; draft?: number }
  tlm: number
  velocity?: VelocityPayload | null
  needsActionCount: number
  stagnantCount: number
  trendSeries: Array<{ date: string; pctOnTrack: number }>
  scopeName: string | null
  criticalControlCount: number
  activeFilter?: string | null
  onFilterChange?: (f: string | null) => void
  insight?: string | null
}) {
  const isAlert = tlm > 0
  const isWarn  = !isAlert && summary.atRisk > 0
  const tone    = isAlert ? 'alert' : isWarn ? 'warn' : 'ok'

  const headline = tlm > 0
    ? `${tlm} program terlambat`
    : summary.atRisk > 0
    ? `${summary.atRisk} program berisiko`
    : 'Portfolio sehat'

  const scopeSuffix = scopeName ? ` · ${scopeName}` : ''

  const velBad  = velocity ? (velocity.terlambat > 0 || velocity.onTrack < 0) : false
  const velGood = velocity ? (!velBad && (velocity.terlambat < 0 || velocity.onTrack > 0)) : false
  const velText = velocity ? [
    velocity.terlambat > 0 ? `+${velocity.terlambat} terlambat`         : velocity.terlambat < 0 ? `${Math.abs(velocity.terlambat)} terlambat pulih` : null,
    velocity.onTrack   < 0 ? `↓${Math.abs(velocity.onTrack)} on track`  : null,
  ].filter(Boolean).join(' · ') : null

  return (
    <div className={`hd-hero hd-hero--${tone}`}>

      {/* Row 1: Verdict headline + 14-day trend sparkline */}
      <div className="hd-hero__row1">
        <div className="hd-hero__lede">
          <strong className="hd-hero__headline">
            {headline}
            {scopeSuffix && <span className="hd-hero__scope">{scopeSuffix}</span>}
          </strong>
          {insight && <p className="hd-hero__insight">{insight}</p>}
        </div>
        {trendSeries.length >= 2 && (() => {
          const series = trendSeries.map(t => t.pctOnTrack)
          const first = series[0], last = series[series.length - 1]
          const dir = last > first ? 'naik' : last < first ? 'turun' : 'stabil'
          const dirCol = last > first ? 'var(--green)' : last < first ? 'var(--red)' : 'var(--text-muted)'
          return (
            <div className="hd-hero__trend">
              <div className="hd-hero__trend-meta">
                <span className="hd-hero__trend-label">On-track 14 hari</span>
                <span className="hd-hero__trend-val" style={{ color: dirCol }}>
                  {last}% <em>{dir}</em>
                </span>
              </div>
              <Sparkline values={series} color={dirCol} />
            </div>
          )
        })()}
      </div>

      {/* Row 2: Portfolio stat chips — angka absolut + persentase + filter interaktif */}
      {(() => {
        const pct = (n: number) => summary.total > 0 ? Math.round(n / summary.total * 100) : 0
        const toggle = (key: string) => onFilterChange?.(activeFilter === key ? null : key)
        const isActive = (key: string) => activeFilter === key
        return (
          <div className="hd-hero__statrow">
            {/* Total — tidak bisa diklik, selalu tampilkan semua */}
            <div className="hd-hero__stat">
              <span className="hd-hero__stat-n">{summary.total}</span>
              {(summary.draft ?? 0) > 0 && (
                <span className="hd-hero__stat-pct" style={{ color: 'var(--text-muted)' }}>
                  {summary.draft} pipeline
                </span>
              )}
              <span className="hd-hero__stat-l">Program</span>
            </div>
            <div className="hd-hero__stat-sep" />
            <button type="button" aria-pressed={isActive('selesai')} aria-label={`Filter program selesai (${summary.selesai})`} className={`hd-hero__stat hd-hero__stat--btn${isActive('selesai') ? ' is-active' : ''}`} onClick={() => toggle('selesai')}>
              <span className="hd-hero__stat-n" style={{ color: summary.selesai > 0 ? 'var(--blue)' : 'var(--text-muted)' }}>{summary.selesai}</span>
              <span className="hd-hero__stat-pct" style={{ color: summary.selesai > 0 ? 'var(--blue)' : 'var(--text-muted)' }}>{pct(summary.selesai)}%</span>
              <span className="hd-hero__stat-l">Selesai</span>
            </button>
            <div className="hd-hero__stat-sep" aria-hidden="true" />
            <button type="button" aria-pressed={isActive('on_track')} aria-label={`Filter program on track (${summary.onTrack})`} className={`hd-hero__stat hd-hero__stat--btn${isActive('on_track') ? ' is-active' : ''}`} onClick={() => toggle('on_track')}>
              <span className="hd-hero__stat-n" style={{ color: summary.onTrack > 0 ? 'var(--green)' : 'var(--text-muted)' }}>{summary.onTrack}</span>
              <span className="hd-hero__stat-pct" style={{ color: summary.onTrack > 0 ? 'var(--green)' : 'var(--text-muted)' }}>{pct(summary.onTrack)}%</span>
              <span className="hd-hero__stat-l">On Track</span>
            </button>
            <div className="hd-hero__stat-sep" aria-hidden="true" />
            <button type="button" aria-pressed={isActive('at_risk')} aria-label={`Filter program at risk (${summary.atRisk})`} className={`hd-hero__stat hd-hero__stat--btn${isActive('at_risk') ? ' is-active' : ''}`} onClick={() => toggle('at_risk')}>
              <span className="hd-hero__stat-n" style={{ color: summary.atRisk > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>{summary.atRisk}</span>
              <span className="hd-hero__stat-pct" style={{ color: summary.atRisk > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>{pct(summary.atRisk)}%</span>
              <span className="hd-hero__stat-l">At Risk</span>
            </button>
            <div className="hd-hero__stat-sep" aria-hidden="true" />
            <button type="button" aria-pressed={isActive('terlambat')} aria-label={`Filter program terlambat (${tlm})`} className={`hd-hero__stat hd-hero__stat--btn${isActive('terlambat') ? ' is-active' : ''}`} onClick={() => toggle('terlambat')}>
              <span className="hd-hero__stat-n" style={{ color: tlm > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{tlm}</span>
              <span className="hd-hero__stat-pct" style={{ color: tlm > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{pct(tlm)}%</span>
              <span className="hd-hero__stat-l">Terlambat</span>
            </button>
          </div>
        )
      })()}

      {/* Row 3: Full-width bar */}
      <AnimBar h={4} segs={[
        { v: summary.onTrack, color: 'var(--green)',     label: `On Track: ${summary.onTrack}` },
        { v: summary.atRisk,  color: 'var(--yellow)',    label: `At Risk: ${summary.atRisk}` },
        { v: tlm,             color: 'var(--red)',       label: `Terlambat: ${tlm}` },
        { v: summary.selesai, color: 'var(--text-muted)', label: `Selesai: ${summary.selesai}` },
      ]} />

      {/* Row 4: Signals — only rendered when there's at least one signal */}
      {(velText || stagnantCount > 0 || criticalControlCount > 0 || needsActionCount === 0) && (
        <div className="hd-hero__signals">
          {velText && velocity && (
            <span className="hd-hero__vel"
              style={{ color: velBad ? 'var(--red)' : velGood ? 'var(--green)' : 'var(--text-muted)' }}>
              {velText} vs {Math.abs(velocity.daysAgo)}j lalu
            </span>
          )}
          {stagnantCount > 0 && (
            <span className="hd-hero__stag">{Ico.clock} {stagnantCount} program stagnan 7+ hari</span>
          )}
          {criticalControlCount > 0 && (
            <span className="hd-hero__stag" style={{ color: 'var(--red)' }}>
              {Ico.alert} {criticalControlCount} kontrol kritis/tinggi terbuka
            </span>
          )}
          {needsActionCount === 0 && criticalControlCount === 0 && (
            <span className="hd-hero__aman">{Ico.check} Tidak ada tindakan mendesak</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Division Row — tabular single-line ─────────────────────────────────
function DivRow({ row, vel }: {
  row: DivisiProgramSummary
  vel?: { onTrack: number; atRisk: number }
}) {
  const t = row.terlambat + (row.overdue ?? 0)
  const code = row.unit.code.replace('-HLD', '')
  const dotColor = t > 0 ? 'var(--red)' : row.atRisk > 0 ? 'var(--yellow)' : 'var(--green)'
  const nonZero = [
    row.onTrack  > 0 && { n: row.onTrack,  l: 'on track',  c: 'var(--green)'      },
    row.atRisk   > 0 && { n: row.atRisk,   l: 'at risk',   c: 'var(--yellow)'     },
    t            > 0 && { n: t,            l: 'terlambat', c: 'var(--red)'        },
    row.selesai  > 0 && { n: row.selesai,  l: 'selesai',   c: 'var(--text-muted)' },
  ].filter(Boolean) as Array<{ n: number; l: string; c: string }>

  const velNote = vel && (vel.onTrack !== 0 || vel.atRisk !== 0)
    ? [
        vel.onTrack  > 0 ? `↑${vel.onTrack} on track`   : vel.onTrack  < 0 ? `↓${Math.abs(vel.onTrack)} on track`   : null,
        vel.atRisk   > 0 ? `↑${vel.atRisk} at risk`     : vel.atRisk   < 0 ? `↓${Math.abs(vel.atRisk)} at risk`     : null,
      ].filter(Boolean).join(' · ')
    : null

  return (
    <div className="hd-divrow">
      <span className="hd-divrow__dot" style={{ background: dotColor }} />
      <span className="hd-divrow__code">{code}</span>
      <span className="hd-divrow__total">{row.total} <em>program</em></span>
      <div className="hd-divrow__bar">
        <AnimBar h={4} segs={[
          { v: row.onTrack, color: 'var(--green)',     label: `On Track: ${row.onTrack}` },
          { v: row.atRisk,  color: 'var(--yellow)',    label: `At Risk: ${row.atRisk}` },
          { v: t,           color: 'var(--red)',       label: `Terlambat: ${t}` },
          { v: row.selesai, color: 'var(--text-muted)', label: `Selesai: ${row.selesai}` },
        ]} />
      </div>
      <div className="hd-divrow__stats">
        {nonZero.map(s => (
          <span key={s.l} style={{ color: s.c }}>
            <strong>{s.n}</strong> {s.l}
          </span>
        ))}
        {velNote && <span className="hd-divrow__vel">{velNote}</span>}
      </div>
    </div>
  )
}

// ── Intel Panel (unified container) ───────────────────────────────────
function IntelPanel({ title, badge, badgeRed, accent, children }: {
  title: string; badge?: string | number; badgeRed?: boolean
  accent?: 'ok' | 'warn' | 'alert' | 'info'
  children: React.ReactNode
}) {
  return (
    <div className={`hd-intel${accent ? ` hd-intel--${accent}` : ''}`}>
      <div className="hd-intel__hd">
        <span className="hd-intel__title">{title}</span>
        {badge !== undefined && (
          <span className={`hd-intel__badge${badgeRed ? ' red' : ''}`}>{badge}</span>
        )}
      </div>
      <div className="hd-intel__bd">{children}</div>
    </div>
  )
}

// ── KPI Panel ─────────────────────────────────────────────────────────
function KpiPanel({ kpi }: { kpi: KpiHealthPayload }) {
  if (!kpi.total) return (
    <IntelPanel title="KPI Outcomes">
      <p className="hd-muted">Belum ada data KPI aktual</p>
    </IntelPanel>
  )
  const namedPilars = kpi.byPilar.filter(p => p.pilar !== 'LAINNYA' && p.total > 0)
  const pilarLabel: Record<string, string> = {
    ENABLER: 'Enabler', SPENDING_BETTER: 'Spending Better', INNOVATIVE_FINANCING: 'Innovative Fin.',
  }

  const trend = kpi.kpiTrend ?? []
  const trendValues = trend.map(t => t.pctGreen)
  const trendFirst = trendValues[0] ?? 0
  const trendLast  = trendValues[trendValues.length - 1] ?? 0
  const trendDir   = trendLast > trendFirst ? 'naik' : trendLast < trendFirst ? 'turun' : 'stabil'
  const trendColor = trendLast > trendFirst ? 'var(--green)' : trendLast < trendFirst ? 'var(--red)' : 'var(--text-muted)'

  return (
    <IntelPanel title="KPI Outcomes" badge={`${kpi.total} KPI`} badgeRed={kpi.red > 0}
      accent={kpi.red >= 2 ? 'alert' : kpi.red === 1 || kpi.yellow > 0 ? 'warn' : 'ok'}>
      <AnimBar h={6} segs={[
        { v: kpi.green,  color: 'var(--green)',  label: `Atas target: ${kpi.green}` },
        { v: kpi.yellow, color: 'var(--yellow)', label: `At risk: ${kpi.yellow}` },
        { v: kpi.red,    color: 'var(--red)',    label: `Bawah target: ${kpi.red}` },
      ]} />
      {trendValues.length >= 2 && (
        <div className="hd-kpi-trend">
          <div className="hd-kpi-trend__meta">
            <span className="hd-kpi-trend__label">Tren KPI sehat</span>
            <span className="hd-kpi-trend__val" style={{ color: trendColor }}>
              {trendLast}% <em>{trendDir}</em>
            </span>
          </div>
          <Sparkline values={trendValues} color={trendColor} w={80} h={24} />
        </div>
      )}
      {kpi.red >= 3 && (
        <p className="hd-kpi-verdict">
          {kpi.red} dari {kpi.total} KPI di bawah target — perlu perhatian
        </p>
      )}
      {namedPilars.length > 0 && (
        <div className="hd-kpi-pilars">
          {namedPilars.map(p => (
            <div key={p.pilar} className="hd-kpi-pilar">
              <span>{pilarLabel[p.pilar] ?? p.pilar}</span>
              <AnimBar h={6} segs={[
                { v: p.green,  color: 'var(--green)'  },
                { v: p.yellow, color: 'var(--yellow)' },
                { v: p.red,    color: 'var(--red)'    },
              ]} />
              <span className="hd-kpi-pilar__n">{p.total}</span>
            </div>
          ))}
        </div>
      )}
    </IntelPanel>
  )
}

// ── Scorecard Panel ────────────────────────────────────────────────────
function ScorecardPanel({ rows }: { rows: ScorecardHealth[] }) {
  const hasIssue = rows.some(r => (r.terlambat + r.overdue) > 0 || r.atRisk > 0)
  const hasAny   = rows.some(r => r.total > 0)
  return (
    <IntelPanel title="Kategori Program" badge={hasAny ? rows.reduce((s, r) => s + r.total, 0) : undefined} accent={hasIssue ? 'warn' : 'info'}>
      {!hasAny ? (
        <p className="hd-intel__empty">Isi field <em>Kelompok</em> di program untuk melihat analisis ini</p>
      ) : (
      <div className="hd-sc-list">
        {rows.map(row => {
          const t = row.terlambat + row.overdue
          const label = row.kelompok === 'SCORECARD' ? 'Scorecard' : 'Non Scorecard'
          const tone = t > 0 ? 'red' : row.atRisk > 0 ? 'yellow' : 'green'
          // Skip empty categories — don't waste space
          if (row.total === 0) return null
          return (
            <div key={row.kelompok} className={`hd-sc-row hd-sc-row--${tone}`}>
              <div className="hd-sc-row__hd">
                <span className="hd-sc-row__label">{label}</span>
                <span className="hd-sc-row__n">{row.total} program</span>
              </div>
              <AnimBar h={5} segs={[
                { v: row.onTrack, color: 'var(--green)'  },
                { v: row.atRisk,  color: 'var(--yellow)' },
                { v: t,           color: 'var(--red)'    },
                { v: row.selesai, color: 'var(--blue)'   },
              ]} />
              <div className="hd-sc-row__stats">
                {row.onTrack > 0 && <span>{row.onTrack} on track</span>}
                {row.atRisk  > 0 && <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{row.atRisk} at risk</span>}
                {t           > 0 && <span style={{ color: 'var(--red)',    fontWeight: 700 }}>{t} terlambat</span>}
                {row.selesai > 0 && <span style={{ color: 'var(--blue)' }}>{row.selesai} selesai</span>}
              </div>
            </div>
          )
        })}
      </div>
      )}
    </IntelPanel>
  )
}

// ── Deadline Panel ─────────────────────────────────────────────────────
function DeadlinePanel({ clusters, checkpoints }: { clusters: DeadlineCluster[]; checkpoints?: CheckpointItem[] }) {
  const max  = Math.max(...clusters.map(c => c.total), 1)
  const soon = clusters.find(c => c.label === '≤ 30 hari')
  const criticalCheckpoints = (checkpoints ?? []).filter(cp => {
    const tone = getCheckpointTone(cp.status)
    return tone === 'critical' || tone === 'warn'
  }).slice(0, 3)

  return (
    <IntelPanel title="Distribusi Tenggat"
      badge={soon && soon.total > 0 ? `${soon.total} segera` : undefined}
      badgeRed={!!(soon && soon.atRisk > 0)}
      accent={soon && soon.atRisk > 0 ? 'warn' : 'info'}>
      <div className="hd-dl-list">
        {clusters.map(c => (
          <div key={c.label} className="hd-dl-row">
            <span className="hd-dl-row__label">{c.label}</span>
            <div className="hd-dl-row__track">
              <div className="hd-dl-row__fill"
                style={{ width: `${(c.total / max) * 100}%`, background: c.atRisk > 0 ? 'var(--yellow)' : 'var(--blue-dim)' }} />
            </div>
            <span className="hd-dl-row__n">{c.total}</span>
            {c.atRisk > 0 && <span className="hd-dl-row__risk">{c.atRisk}⚠</span>}
          </div>
        ))}
      </div>
      {criticalCheckpoints.length > 0 && (
        <div className="hd-dl-checkpoints">
          <span className="hd-dl-checkpoints__label">Checkpoint kritis</span>
          {criticalCheckpoints.map(cp => {
            const tone = getCheckpointTone(cp.status)
            const color = tone === 'critical' ? 'var(--red)' : tone === 'warn' ? 'var(--yellow)' : 'var(--text-muted)'
            return (
              <div key={cp.id} className="hd-dl-cp">
                <span className="hd-dl-cp__dot" style={{ background: color }} />
                <div className="hd-dl-cp__body">
                  <span className="hd-dl-cp__code">{cp.code}</span>
                  <span className="hd-dl-cp__title">{cp.title}</span>
                </div>
                <time className="hd-dl-cp__date">{fmtDate(cp.targetCompletion)}</time>
              </div>
            )
          })}
        </div>
      )}
    </IntelPanel>
  )
}

// ── Momentum Panel ─────────────────────────────────────────────────────
function MomentumPanel({ m, onOpen }: { m: MomentumPayload; onOpen: (id: number) => void }) {
  return (
    <IntelPanel title="Momentum"
      badge={m.stagnantCount > 0 ? m.stagnantCount : undefined}
      badgeRed={m.stagnantCount > 0}
      accent={m.activeRate >= 70 ? 'ok' : m.activeRate >= 40 ? 'warn' : 'alert'}>
      <div className="hd-mom-rate">
        <strong style={{ color: m.activeRate >= 70 ? 'var(--green)' : m.activeRate >= 40 ? 'var(--yellow)' : 'var(--red)' }}>
          {m.activeRate}%
        </strong>
        <span>program aktif diperbarui</span>
      </div>
      <div className="hd-mom-items">
        {m.tasksCompletedThisWeek > 0 && (
          <div className="hd-mom-item good">{Ico.check}<span><b>{m.tasksCompletedThisWeek}</b> task selesai minggu ini</span></div>
        )}
        {m.programsCompletedLast30d > 0 && (
          <div className="hd-mom-item good">{Ico.check}<span><b>{m.programsCompletedLast30d}</b> program selesai bulan ini</span></div>
        )}
        {m.newProgramsLast30d > 0 && (
          <div className="hd-mom-item">{Ico.trend}<span><b>{m.newProgramsLast30d}</b> program baru bulan ini</span></div>
        )}
        {m.tasksCompletedThisWeek === 0 && m.programsCompletedLast30d === 0 && m.newProgramsLast30d === 0 && (
          <p className="hd-muted">Belum ada penyelesaian terbaru</p>
        )}
      </div>
      {m.stagnantCount > 0 && (
        <div className="hd-mom-stag">
          <p className="hd-mom-stag__title">{Ico.clock}{m.stagnantCount} program tanpa aktivitas 7+ hari</p>
          {m.stagnantPrograms.slice(0, 2).map(p => (
            <button key={p.id} type="button" className="hd-mom-stag__row" onClick={() => onOpen(p.id)}>
              <span>{p.name}</span>
              <span className={p.daysIdle >= 14 ? 'stale' : 'warn'}>{p.daysIdle} hari</span>
            </button>
          ))}
        </div>
      )}
    </IntelPanel>
  )
}

// ── Program List Panel ─────────────────────────────────────────────────
type ChartProgram = { id: number; code: string; name: string; progressPercent: number; daysRemaining: number | null; targetEndDate?: string | null; healthTone: string; divisi: string; timeElapsedPct?: number | null; daysIdle?: number | null; ownerName?: string | null; taskTotal?: number; taskDone?: number }

const TONE_COLOR: Record<string, string> = {
  on_track: 'var(--green)', at_risk: 'var(--yellow)',
  terlambat: 'var(--red)', overdue: 'var(--red)', selesai: 'var(--blue)',
}
const TONE_LABEL: Record<string, string> = {
  on_track: 'On Track', at_risk: 'At Risk',
  terlambat: 'Terlambat', overdue: 'Lewat Tenggat', selesai: 'Selesai',
}
const urgencyRank: Record<string, number> = { overdue: 0, terlambat: 1, at_risk: 2, on_track: 3, selesai: 4 }

function ProgramListPanel({ programs, onOpen, filter, onClearFilter, velocity }: { programs: ChartProgram[]; onOpen: (id: number) => void; filter?: string | null; onClearFilter?: () => void; velocity?: VelocityPayload | null }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 100); return () => clearTimeout(t) }, [])
  if (programs.length === 0) return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">Semua Program</h3>
      </div>
      <div className="hd-empty-programs">
        <p className="hd-empty-programs__title">Belum ada program aktif</p>
        <p className="hd-empty-programs__sub">Program yang sedang berjalan akan muncul di sini. Buat program baru dari halaman Programs.</p>
      </div>
    </div>
  )

  const sorted = [...programs].sort((a, b) => (urgencyRank[a.healthTone] ?? 5) - (urgencyRank[b.healthTone] ?? 5))
  const displayed = filter
    ? sorted.filter(p => filter === 'terlambat' ? (p.healthTone === 'terlambat' || p.healthTone === 'overdue') : p.healthTone === filter)
    : sorted

  return (
    <div className="panel hd-pl-panel">
      <div className="panel__header">
        <h3 className="panel__title">Semua Program</h3>
        <div className="panel__header-meta">
          {velocity && (() => {
            const chips: Array<{ text: string; color: string }> = []
            if (velocity.terlambat > 0) chips.push({ text: `+${velocity.terlambat} terlambat`, color: 'var(--red)' })
            if (velocity.terlambat < 0) chips.push({ text: `${Math.abs(velocity.terlambat)} pulih`, color: 'var(--green)' })
            if (velocity.onTrack > 0)   chips.push({ text: `+${velocity.onTrack} on track`, color: 'var(--green)' })
            if (velocity.onTrack < 0)   chips.push({ text: `↓${Math.abs(velocity.onTrack)} on track`, color: 'var(--red)' })
            if (velocity.selesai > 0)   chips.push({ text: `+${velocity.selesai} selesai`, color: 'var(--blue)' })
            if (chips.length === 0) return null
            const ago = Math.abs(velocity.daysAgo)
            const agoLabel = ago < 24 ? `${ago}j lalu` : `${Math.round(ago / 24)}h lalu`
            return (
              <span className="hd-pl-velocity">
                <span className="hd-pl-velocity__since">{agoLabel}:</span>
                {chips.map(c => (
                  <span key={c.text} className="hd-pl-velocity__chip" style={{ color: c.color }}>{c.text}</span>
                ))}
              </span>
            )
          })()}
          <span className="section-badge">
            {filter ? `${displayed.length} dari ${programs.length}` : `${programs.length}`} program
            {filter && <button className="hd-pl-clear" type="button" onClick={onClearFilter}>× reset</button>}
          </span>
        </div>
      </div>
      {displayed.length === 0 && (
        <p className="hd-panel-empty">Tidak ada program dengan status ini.</p>
      )}
      <div className="hd-pl-list">
        {displayed.map(p => {
          const color  = TONE_COLOR[p.healthTone] ?? 'var(--text-muted)'
          const label  = TONE_LABEL[p.healthTone] ?? p.healthTone
          const code   = p.divisi?.replace('-HLD', '') ?? ''
          const days   = p.daysRemaining
          const dLabel = days === null ? null
            : days < 0 ? `${Math.abs(days)} hari lewat`
            : days === 0 ? 'Hari ini' : `${days} hari`
          const isOver   = days !== null && days < 0
          const isUrgent = !isOver && days !== null && days <= 30
          const elapsed  = p.timeElapsedPct ?? null
          const isBehind = elapsed !== null && elapsed - p.progressPercent > 10
          // C: threshold idle berbeda — program bermasalah lebih sensitif
          const isProblematic = p.healthTone === 'at_risk' || p.healthTone === 'terlambat' || p.healthTone === 'overdue'
          const idleThreshold = isProblematic ? 5 : 14
          const showIdle = (p.daysIdle ?? 0) >= idleThreshold
          const scheduleGap = elapsed !== null ? p.progressPercent - elapsed : null

          return (
            <button
              key={p.id}
              type="button"
              className="hd-pl-row"
              style={{ '--pl-color': color } as React.CSSProperties}
              onClick={() => onOpen(p.id)}
              aria-label={`Buka program ${p.name}`}
            >
              <div className="hd-pl-row__meta">
                <span className="hd-pl-row__name">{p.name}</span>
                <div className="hd-pl-row__tags">
                  {code && code !== '-' && <span className="hd-pl-row__div">{code}</span>}
                  <span className="hd-pl-row__status" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                    {label}
                  </span>
                  {showIdle && (
                    <span className={`hd-pl-row__idle${(p.daysIdle ?? 0) >= 14 ? ' hd-pl-row__idle--stale' : ''}`}>
                      {Ico.clock} {p.daysIdle}h idle
                    </span>
                  )}
                </div>
                {/* F: hover preview — owner + schedule gap */}
                <div className="hd-pl-row__preview">
                  {p.ownerName && <span className="hd-pl-row__preview-owner">{p.ownerName}</span>}
                  {scheduleGap !== null && (
                    <span className={`hd-pl-row__preview-gap${scheduleGap < -10 ? ' behind' : scheduleGap > 10 ? ' ahead' : ''}`}>
                      {scheduleGap > 0 ? `+${scheduleGap}pp` : `${scheduleGap}pp`} vs jadwal
                    </span>
                  )}
                </div>
              </div>
              <div className="hd-pl-row__bar">
                <div className="hd-pl-row__tracks">
                  <div className="hd-pl-row__track">
                    <div className="hd-pl-row__fill" style={{
                      width: drawn ? `${p.progressPercent}%` : '0%',
                      background: color,
                      transition: drawn ? 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
                    }} />
                  </div>
                  {elapsed !== null && (
                    <div className="hd-pl-row__track hd-pl-row__track--time" title={`${elapsed}% waktu terpakai`}>
                      <div className="hd-pl-row__fill hd-pl-row__fill--time" style={{
                        width: drawn ? `${elapsed}%` : '0%',
                        background: isBehind ? 'var(--red)' : 'var(--text-muted)',
                        transition: drawn ? 'width 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s' : 'none',
                      }} />
                    </div>
                  )}
                </div>
                <div className="hd-pl-row__pcts">
                  <span className="hd-pl-row__pct">{p.progressPercent}%</span>
                  {(p.taskTotal ?? 0) > 0 && (
                    <span className="hd-pl-row__tasks">
                      {p.taskDone}/{p.taskTotal}
                    </span>
                  )}
                  {elapsed !== null && (
                    <span className={`hd-pl-row__pct-time${isBehind ? ' hd-pl-row__pct-time--behind' : ''}`}>
                      {elapsed}%<em>waktu</em>
                    </span>
                  )}
                </div>
              </div>
              {/* A: tanggal target konkret */}
              <div className="hd-pl-row__deadline">
                {dLabel && (
                  <span className={`hd-pl-row__days${isOver ? ' hd-pl-row__days--over' : isUrgent ? ' hd-pl-row__days--urgent' : ''}`}>
                    {dLabel}
                  </span>
                )}
                {p.targetEndDate && <span className="hd-pl-row__date">{p.targetEndDate}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}


// ── Division Profile (small-multiples bars, replaces radar) ────────────
function DivisionProfile({ divisi, taskLoad, blockerSignal }: {
  divisi: DivisiProgramSummary[]
  taskLoad: DivisiTaskLoad[]
  blockerSignal: BlockerSignal[]
}) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 200); return () => clearTimeout(t) }, [])

  const named = divisi.filter(d => d.unit.id !== null).slice(0, 4)
  if (named.length < 2) return null

  const METRICS = [
    { key: 'onTrack',  label: 'Program on track' },
    { key: 'onTime',   label: 'Task on-time' },
    { key: 'active',   label: 'Task aktif' },
    { key: 'noBlock',  label: 'Tanpa blocker' },
  ] as const

  const rows = named.map(d => {
    const tl = taskLoad.find(t => t.kind === 'unit' && t.unit?.id === d.unit.id && !t.isRollup)
    const bl = blockerSignal.find(b => b.unitId === d.unit.id)
    const onTrack  = d.total > 0 ? (d.onTrack + d.selesai) / d.total : 0
    const onTime   = tl ? ((tl.onTimeRate ?? 50) / 100) : 0.5
    const active   = tl && tl.total > 0 ? (tl.active / tl.total) : 0
    const noBlock  = bl ? Math.max(0, 1 - (bl.total / Math.max(tl?.total ?? 1, 1)) * 2) : 1
    const scores = { onTrack, onTime, active, noBlock }
    const avg = (onTrack + onTime + active + noBlock) / 4
    return { code: d.unit.code.replace('-HLD', ''), id: d.unit.id, scores, avg }
  })

  const worst = rows.reduce((w, r) => r.avg < w.avg ? r : w, rows[0])
  const showInsight = worst.avg < 0.6

  const barColor = (v: number) =>
    v >= 0.7 ? 'var(--green)' : v >= 0.4 ? 'var(--yellow)' : 'var(--red)'

  return (
    <IntelPanel title="Profil Divisi" accent="info">
      <div className="hd-dp">
        <div className="hd-dp__header">
          <span /> {/* spacer for code col */}
          {METRICS.map(m => (
            <span key={m.key} className="hd-dp__metric">{m.label}</span>
          ))}
          <span className="hd-dp__metric hd-dp__metric--avg">Rata-rata</span>
        </div>
        {rows.map(row => (
          <div key={row.id ?? row.code} className="hd-dp__row">
            <span className="hd-dp__code">{row.code}</span>
            {METRICS.map(m => {
              const v = row.scores[m.key]
              const pct = Math.round(v * 100)
              return (
                <div key={m.key} className="hd-dp__cell">
                  <div className="hd-dp__track">
                    <div className="hd-dp__fill" style={{
                      width: drawn ? `${pct}%` : '0%',
                      background: barColor(v),
                      transition: drawn ? 'width 0.5s cubic-bezier(0.16,1,0.3,1)' : 'none',
                    }} />
                  </div>
                  <span className="hd-dp__pct">{pct}%</span>
                </div>
              )
            })}
            <strong className="hd-dp__avg" style={{ color: barColor(row.avg) }}>
              {Math.round(row.avg * 100)}%
            </strong>
          </div>
        ))}
        {showInsight && (
          <p className="hd-dp__insight">
            <span className="hd-dp__insight-dot" />
            {worst.code} performa terendah — {Math.round(worst.avg * 100)}% rata-rata
          </p>
        )}
      </div>
    </IntelPanel>
  )
}

// ── Steering Radar Panel (top blocker programs) ───────────────────────
function SteeringRadarPanel({ programs, onOpen }: { programs: TopBlockerProgram[]; onOpen: (id: number) => void }) {
  const active = programs.filter(p => p.blockerCount > 0)
  if (active.length === 0) return null
  const maxBlockers = Math.max(...active.map(p => p.blockerCount), 1)
  return (
    <IntelPanel title="Program Blocker Tertinggi" badge={active.length} badgeRed accent="warn">
      <div className="hd-radar-list">
        {active.map(prog => {
          const tone = prog.blockerCount >= 3 ? 'critical' : 'warn'
          const color = tone === 'critical' ? 'var(--red)' : 'var(--yellow)'
          const width = Math.round((prog.blockerCount / maxBlockers) * 100)
          return (
            <button key={prog.id} type="button" className="hd-radar-row" onClick={() => onOpen(prog.id)}>
              <span className="hd-radar-row__count" style={{ color }}>{prog.blockerCount}</span>
              <div className="hd-radar-row__body">
                <span className="hd-radar-row__name">{prog.name}</span>
                <div className="hd-radar-row__bar">
                  <div className="hd-radar-row__fill" style={{ width: `${width}%`, background: color }} />
                </div>
              </div>
              <span className="hd-radar-row__pct">{prog.progressPercent}%</span>
            </button>
          )
        })}
      </div>
    </IntelPanel>
  )
}

// ── Controls Panel (governance alerts) ───────────────────────────────
function ControlsPanel({ controls, onOpenProgram }: { controls: ControlAlert[]; onOpenProgram: (id: number) => void }) {
  const hasCritical = controls.some(c => c.severity === 'CRITICAL')
  const hasHigh     = controls.some(c => c.severity === 'HIGH')
  if (controls.length === 0) return null
  return (
    <IntelPanel
      title="Kontrol & Governance"
      badge={controls.length}
      badgeRed={hasCritical || hasHigh}
      accent={hasCritical ? 'alert' : hasHigh ? 'warn' : 'info'}>
      <div className="hd-ctrl-list">
        {controls.map(item => {
          const sev = item.severity.toUpperCase()
          const color =
            sev === 'CRITICAL' ? 'var(--red)' :
            sev === 'HIGH'     ? 'var(--red)' :
            sev === 'MEDIUM'   ? 'var(--yellow)' : 'var(--text-muted)'
          const icon = (sev === 'CRITICAL' || sev === 'HIGH') ? Ico.alert : Ico.shield
          const clickable = !!item.programId
          const Wrapper: React.ElementType = clickable ? 'button' : 'div'
          return (
            <Wrapper
              key={item.id}
              type={clickable ? 'button' : undefined}
              className={`hd-ctrl-row${clickable ? ' hd-ctrl-row--clickable' : ''}`}
              onClick={clickable ? () => onOpenProgram(item.programId!) : undefined}
            >
              <span className="hd-ctrl-row__icon" style={{ color }}>{icon}</span>
              <div className="hd-ctrl-row__body">
                <span className="hd-ctrl-row__code">{item.code}</span>
                <span className="hd-ctrl-row__title">{item.title}</span>
                {item.programCode && (
                  <span className="hd-ctrl-row__prog">→ {item.programCode}</span>
                )}
              </div>
              <span className="hd-ctrl-row__sev" style={{ color }}>{item.severity}</span>
            </Wrapper>
          )
        })}
      </div>
    </IntelPanel>
  )
}

// ── Recent Activity Panel ─────────────────────────────────────────────
function RecentActivityPanel({ activities, onOpenProgram }: {
  activities: ActivityItem[]
  onOpenProgram: (id: number) => void
}) {
  if (activities.length === 0) return null
  return (
    <IntelPanel title="Aktivitas Terbaru" badge={activities.length} accent="info">
      <div className="hd-act-list">
        {activities.map(act => {
          const tone  = getActionTone(act.action)
          const label = getActionLabel(act.action)
          const clickable = act.entityType === 'PROGRAM' && act.entityId > 0
          const Wrapper: React.ElementType = clickable ? 'button' : 'div'
          return (
            <Wrapper
              key={`${act.id}-${act.action}`}
              type={clickable ? 'button' : undefined}
              className={`hd-act-row${clickable ? ' hd-act-row--clickable' : ''}`}
              onClick={clickable ? () => onOpenProgram(act.entityId) : undefined}
            >
              <span className={`hd-act-row__dot hd-act-row__dot--${tone}`} />
              <span className={`hd-act-row__chip hd-act-row__chip--${tone}`}>{label}</span>
              <span className="hd-act-row__desc">{act.description ?? `${act.entityType} #${act.entityId}`}</span>
              <time className="hd-act-row__time">{fmtRelative(act.changeTimestamp)}</time>
            </Wrapper>
          )
        })}
      </div>
    </IntelPanel>
  )
}

// ── Task Card ──────────────────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(p => !/^(bpk|bp|ibu|ir|drs|hj|h|st|se|mt|msi|phd|dr)\.?$/i.test(p))
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function isCriticalRow(row: DivisiTaskLoad): boolean {
  if (row.onTimeRate === null) return false
  if (row.done < row.minSampleForCritical) return false
  return row.onTimeRate < row.criticalThreshold
}

function TaskCard({ row, blocker, onClick }: { row: DivisiTaskLoad; blocker?: BlockerSignal; onClick?: () => void }) {
  const rate = row.onTimeRate
  // Visual tone respects per-row threshold (40 for person, 50 for unit) + min sample floor
  const critical = isCriticalRow(row)
  const rc = rate === null ? '' : critical ? 'bad' : rate >= 80 ? 'good' : 'warn'

  // Identity: unit-row uses unit code + KSUB head; person-row uses person directly
  const isPerson = row.kind === 'person' && row.person
  const isRollup = row.isRollup === true
  const code = row.unit?.code.replace('-HLD', '') ?? '—'
  const head = isPerson ? null : row.head
  const headerLabel = isPerson
    ? row.person!.name.split(' ')[0]
    : isRollup ? `${code} · Total` : code

  const Wrapper: React.ElementType = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`hd-tc${rc === 'bad' ? ' hd-tc--bad' : ''}${isRollup ? ' hd-tc--rollup' : ''}${onClick ? ' hd-tc--clickable' : ''}`}
    >
      <div className="hd-tc__hd">
        <span className="hd-tc__code">{headerLabel}</span>
        {rate !== null && <span className={`hd-tc__rate hd-tc__rate--${rc}`}>{rate}% <em>on-time</em></span>}
      </div>
      {isPerson && (
        <div className="hd-tc__head">
          <span className="hd-tc__head-mono" aria-label={row.person!.name}>{initials(row.person!.name)}</span>
          <div className="hd-tc__head-meta">
            <span className="hd-tc__head-name">{row.person!.name}</span>
            <span className="hd-tc__head-pos">{row.person!.positionTitle ?? roleLabel(row.person!.roleType)}</span>
          </div>
        </div>
      )}
      {!isPerson && head && (
        <div className="hd-tc__head">
          <span className="hd-tc__head-mono" aria-label={head.name}>{initials(head.name)}</span>
          <div className="hd-tc__head-meta">
            <span className="hd-tc__head-name">{head.name}</span>
            <span className="hd-tc__head-pos">{head.positionTitle ?? `Kepala Sub Divisi ${code}`}</span>
          </div>
        </div>
      )}
      <AnimBar h={6} segs={[
        { v: row.done,    color: 'var(--green)',                 label: `Selesai: ${row.done}` },
        { v: row.active,  color: 'var(--text)',                  label: `Aktif: ${row.active}` },
        { v: row.backlog, color: 'var(--surface-overlay-strong)', label: `Backlog: ${row.backlog}` },
        { v: row.overdue, color: 'var(--red)',                   label: `Terlambat: ${row.overdue}` },
      ]} />
      <div className="hd-tc__nums">
        <span><b>{row.total}</b> total</span>
        <span><b>{row.active}</b> aktif</span>
        <span style={{ color: 'var(--green)' }}><b>{row.done}</b> selesai</span>
        {row.overdue > 0 && <span style={{ color: 'var(--red)' }}><b>{row.overdue}</b> terlambat</span>}
      </div>
      {blocker && blocker.total > 0 && (
        <div className="hd-tc__blk">
          {blocker.critical > 0 && <span className="blk-c">{blocker.critical} kritis</span>}
          {blocker.high     > 0 && <span className="blk-h">{blocker.high} tinggi</span>}
          {blocker.medium   > 0 && <span className="blk-m">{blocker.medium} medium</span>}
          <span className="blk-lbl">blocker</span>
        </div>
      )}
      {row.subjectRole === 'pool' && row.assignerBreakdown && row.assignerBreakdown.length > 0 && (
        <div className="hd-tc__src">
          <span className="hd-tc__src-lbl">Dari:</span>
          {row.assignerBreakdown.map(a => (
            <span key={a.id} className="hd-tc__src-chip">
              <b>{a.count}</b> {a.name.split(' ')[0]}
            </span>
          ))}
        </div>
      )}
    </Wrapper>
  )
}

function roleLabel(roleType: string): string {
  const r = (roleType ?? '').toUpperCase()
  if (r === 'KASUBDIV') return 'Kepala Sub Divisi'
  if (r === 'ASISTEN') return 'Asisten'
  if (r === 'OFFICER') return 'Officer'
  if (r === 'KADIV') return 'Kepala Divisi'
  return roleType
}


// ── Main ───────────────────────────────────────────────────────────────
export function HomeView() {
  const { currentUser, programSummary, overviewStatus, openProgramWorkspace } = useWorkspace()
  const navigate = useInertiaNavigate()
  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const isStrategic = ['BOD', 'KADIV', 'ADMIN', 'SUPERADMIN'].includes(role)
  const [statFilter, setStatFilter] = useState<string | null>(null)
  const firstName = (() => {
    const n = currentUser?.name; if (!n) return 'Anda'
    if (role === 'BOD') return n
    const p = n.split(' ')
    return (p[0].length <= 2 || p[0].endsWith('.')) ? n : p[0]
  })()

  if (overviewStatus.loading && !programSummary) return (
    <div className="view-dashboard">
      <div className="view-toolbar"><SkeletonBlock height={18} width="200px" /></div>
      <div style={{ padding: '24px 40px' }}><SkeletonBlock height={300} width="100%" /></div>
    </div>
  )

  if (!programSummary) return (
    <div className="view-dashboard">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Home</h2>
      </div>
      <SectionState
        title="Data dashboard tidak tersedia"
        text="Tidak dapat memuat ringkasan portfolio. Coba refresh halaman — jika masalah berlanjut, periksa koneksi ke server."
      />
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        <button
          type="button"
          className="hd-tb-btn"
          onClick={() => window.location.reload()}
          style={{ padding: '8px 20px', fontSize: 13 }}
        >
          Refresh halaman
        </button>
      </div>
    </div>
  )

  const {
    scope, summary, byDivisi, taskLoad,
    scorecardHealth, deadlineClusters, needsAction,
    blockerSignal, kpiHealth, momentum, velocity,
    trendSeries, programsForChart,
    controls, topBlockerPrograms, checkpoints, recentActivity,
  } = programSummary

  const tlm = summary.terlambat + summary.overdue
  const namedDivisi = byDivisi.filter(d => d.unit.id !== null)
  const criticalControlCount = (controls ?? []).filter(c => c.severity === 'CRITICAL' || c.severity === 'HIGH').length

  // ── Role-aware view configuration ──
  // showCrossDivisi = panel yang membandingkan antar-divisi (Profil Divisi, Status Per Divisi).
  // Hanya bermakna saat user mengawasi ≥2 divisi (BOD/ADMIN, atau KADIV dgn multi-unit).
  const showCrossDivisi = scope?.level === 'portfolio' || (scope?.level === 'directorate' && namedDivisi.length > 1)
  const personalInsight = buildPersonalInsight(summary, tlm, momentum, namedDivisi, velocity, criticalControlCount)

  return (
    <div className="view-dashboard">

      {/* Toolbar — minimal, hero is the executive summary */}
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Home</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__greeting">
          {getGreeting()}, {firstName}!
          {needsAction.length > 0 && (
            <>
              <span className="view-toolbar__dot">·</span>
              <button
                type="button"
                className="view-toolbar__insight view-toolbar__insight--link"
                onClick={() => navigate('/fokus')}
              >
                {needsAction.length} hal perlu keputusan Anda → Fokus
              </button>
            </>
          )}
        </span>
        <div className="view-toolbar__right">
          <button
            type="button"
            className="hd-tb-btn"
            title="Salin tautan dashboard"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href)
            }}
          >
            {Ico.link}<span>Salin tautan</span>
          </button>
          <button
            type="button"
            className="hd-tb-btn"
            title="Cetak / ekspor PDF"
            onClick={() => {
              const toolbar = document.querySelector('.view-toolbar') as HTMLElement | null
              if (toolbar) {
                toolbar.dataset.printDate = new Date().toLocaleDateString('id-ID', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })
              }
              window.print()
            }}
          >
            {Ico.print}<span>Ekspor</span>
          </button>
          <span className="hd-fresh">
            <span className="hd-fresh__dot" />
            Live
          </span>
        </div>
      </div>

      {/* Situation Hero — narrative lede */}
      <SituationHero summary={summary} tlm={tlm} velocity={velocity}
        needsActionCount={needsAction.length} stagnantCount={momentum.stagnantCount}
        trendSeries={trendSeries ?? []}
        scopeName={scope?.name ?? null}
        criticalControlCount={criticalControlCount}
        activeFilter={statFilter}
        onFilterChange={setStatFilter}
        insight={personalInsight} />

      {/* Lapis 2 — Portfolio lengkap: semua program, sorted by urgency */}
      <ProgramListPanel programs={programsForChart} onOpen={openProgramWorkspace}
        filter={statFilter} onClearFilter={() => setStatFilter(null)} velocity={velocity} />

      {/* Steering Radar — program dengan blocker tertinggi */}
      <SteeringRadarPanel programs={topBlockerPrograms ?? []} onOpen={openProgramWorkspace} />

      {/* Status per divisi — hanya muncul saat scope mencakup >1 divisi */}
      {showCrossDivisi && namedDivisi.length > 1 && (
        <div className="panel">
          <div className="panel__header">
            <h3 className="panel__title">Status Per Divisi</h3>
            <div className="panel__header-meta">
              <span className="section-badge">{namedDivisi.length} divisi · {namedDivisi.reduce((s, d) => s + d.total, 0)} program</span>
            </div>
          </div>
          <div className="hd-cmd__divs">
            {namedDivisi.map(row => {
              const divVel = velocity?.byDivisi.find(d => d.code === row.unit.code)
              return <DivRow key={row.unit.id ?? 'u'} row={row} vel={divVel} />
            })}
          </div>
        </div>
      )}

      {/* Kapasitas Tim — sinyal kesehatan tim, sebelum analytics.
          Subjek baris menyesuaikan span of control viewer:
          KADIV → sub-divisi (+ roll-up); KASUBDIV → asisten/officer; leaf → hidden. */}
      {taskLoad.length > 0 && (() => {
        const criticalRows = taskLoad.filter(r => !r.isRollup && isCriticalRow(r))
        const hasCritical = criticalRows.length > 0
        const isPersonView = taskLoad.some(r => r.kind === 'person')
        const criticalLabel = isPersonView
          ? `${criticalRows.length} anggota perlu dukungan`
          : `${criticalRows.length} divisi kritis`
        // Total tasks excludes the roll-up row to avoid double-counting
        const totalTasks = taskLoad.filter(r => !r.isRollup).reduce((s, r) => s + r.total, 0)

        return (
        <div className="panel" style={hasCritical ? { borderColor: 'color-mix(in srgb, var(--red) 40%, var(--panel-border))' } : undefined}>
          <div className="panel__header">
            <h3 className="panel__title">Kapasitas Tim</h3>
            <div className="panel__header-meta">
              {hasCritical && (
                <span className="section-badge section-badge--red">{criticalLabel}</span>
              )}
              <span className="section-badge">{totalTasks} tasks</span>
            </div>
          </div>
          {(() => {
            // Split into roll-up + leaders + pool. Pool gets its own visual section
            // because OFFICER tasks come from multiple assigners (shared resource).
            const rollupRows = taskLoad.filter(r => r.isRollup)
            const leaderRows = taskLoad.filter(r => !r.isRollup && r.subjectRole !== 'pool')
            const poolRows   = taskLoad.filter(r => r.subjectRole === 'pool')

            const renderRow = (row: DivisiTaskLoad) => {
              const key = row.kind === 'person'
                ? `p-${row.person?.id}`
                : `u-${row.unit?.id ?? 'x'}${row.isRollup ? '-rollup' : ''}`
              const blockerMatch = row.kind === 'unit' && !row.isRollup
                ? blockerSignal.find(b => b.unitId === row.unit?.id)
                : undefined
              const handleClick = () => {
                if (row.isRollup) return
                if (row.kind === 'person' && row.person) {
                  navigate(`/execution?assigneeId=${row.person.id}`)
                } else if (row.kind === 'unit' && row.unit?.id) {
                  navigate(`/execution?ownerUnitId=${row.unit.id}`)
                }
              }
              return (
                <TaskCard
                  key={key}
                  row={row}
                  blocker={blockerMatch}
                  onClick={row.isRollup ? undefined : handleClick}
                />
              )
            }

            return (
              <>
                {rollupRows.length > 0 && (
                  <div className="hd-tc-grid">{rollupRows.map(renderRow)}</div>
                )}
                {(leaderRows.length > 0 || poolRows.length > 0) && (
                  <div className="hd-tc-grid">
                    {leaderRows.map(renderRow)}
                    {poolRows.map(renderRow)}
                  </div>
                )}
              </>
            )
          })()}
        </div>
        )
      })()}

      {/* Intelligence — row 1: KPI + Profil Divisi (kalau cross-divisi) */}
      <div className={`hd-intel-row ${showCrossDivisi ? 'hd-intel-row--55-45' : 'hd-intel-row--single'}`}>
        <KpiPanel kpi={kpiHealth} />
        {showCrossDivisi && <DivisionProfile divisi={namedDivisi} taskLoad={taskLoad} blockerSignal={blockerSignal} />}
      </div>

      {/* Controls Panel — full-width, hanya jika ada kontrol terbuka */}
      {(controls ?? []).length > 0 && (
        <div className="hd-intel-row hd-intel-row--single">
          <ControlsPanel controls={controls ?? []} onOpenProgram={openProgramWorkspace} />
        </div>
      )}

      {/* Intelligence — row 2: Momentum + Deadline + Scorecard */}
      <div className={`hd-intel-row ${deadlineClusters.length > 0 ? 'hd-intel-row--3col' : 'hd-intel-row--2col'}`}>
        <MomentumPanel m={momentum} onOpen={openProgramWorkspace} />
        {deadlineClusters.length > 0 && <DeadlinePanel clusters={deadlineClusters} checkpoints={checkpoints ?? []} />}
        <ScorecardPanel rows={scorecardHealth} />
      </div>

      {/* Recent Activity — feed terbaru, full-width */}
      {(recentActivity ?? []).length > 0 && (
        <div className="hd-intel-row hd-intel-row--single">
          <RecentActivityPanel activities={recentActivity ?? []} onOpenProgram={openProgramWorkspace} />
        </div>
      )}

    </div>
  )
}

export default HomeView
