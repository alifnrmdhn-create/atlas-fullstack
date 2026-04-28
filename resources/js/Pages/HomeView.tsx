import { useState, useEffect } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { HealthPill, SectionState, SkeletonBlock } from '../components/ui'
import type {
  EarlyWarningProgram, DivisiProgramSummary, DivisiTaskLoad,
  ScorecardHealth, DeadlineCluster, StagnantProgram,
  BlockerSignal, KpiHealthPayload, MomentumPayload, VelocityPayload,
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

// ── Situation Hero — narrative lede, replaces StatusBanner ────────────
function SituationHero({ summary, tlm, velocity, needsActionCount, stagnantCount, trendSeries, scopeName }: {
  summary: { total: number; onTrack: number; atRisk: number; selesai: number; pctOnTrack: number }
  tlm: number
  velocity?: VelocityPayload | null
  needsActionCount: number
  stagnantCount: number
  trendSeries: Array<{ date: string; pctOnTrack: number }>
  scopeName: string | null
}) {
  const needsAttention = summary.atRisk + tlm
  const isAlert = tlm > 0
  const isWarn  = !isAlert && summary.atRisk > 0
  const tone    = isAlert ? 'alert' : isWarn ? 'warn' : 'ok'

  const headline = tlm > 0
    ? `${tlm} program terlambat`
    : summary.atRisk > 0
    ? `${summary.atRisk} program berisiko`
    : 'Portfolio sehat'

  const subParts = [
    tlm > 0 ? `${tlm} terlambat` : null,
    summary.atRisk > 0 ? `${summary.atRisk} at risk` : null,
  ].filter(Boolean)
  const scopeSuffix = scopeName ? ` di ${scopeName}` : ''
  const sub = summary.total === 0
    ? `Tidak ada program aktif${scopeSuffix}`
    : needsAttention > 0
    ? `${subParts.join(', ')} dari ${summary.total} program${scopeSuffix} · ${summary.pctOnTrack}% on track`
    : `Semua ${summary.total} program${scopeSuffix} dalam kondisi baik`

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
          <strong className="hd-hero__headline">{headline}</strong>
          <span className="hd-hero__sub">{sub}</span>
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

      {/* Row 2: Full-width bar */}
      <AnimBar h={4} segs={[
        { v: summary.onTrack, color: 'var(--green)',     label: `On Track: ${summary.onTrack}` },
        { v: summary.atRisk,  color: 'var(--yellow)',    label: `At Risk: ${summary.atRisk}` },
        { v: tlm,             color: 'var(--red)',       label: `Terlambat: ${tlm}` },
        { v: summary.selesai, color: 'var(--text-muted)', label: `Selesai: ${summary.selesai}` },
      ]} />

      {/* Row 3: Signals — only rendered when there's at least one signal */}
      {(velText || stagnantCount > 0 || needsActionCount === 0) && (
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
          {needsActionCount === 0 && (
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
  const t = row.terlambat + row.overdue
  const code = row.unit.code.replace('-HLD', '')
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
  return (
    <IntelPanel title="KPI Outcomes" badge={`${kpi.total} KPI`} badgeRed={kpi.red > 0}
      accent={kpi.red >= 2 ? 'alert' : kpi.red === 1 || kpi.yellow > 0 ? 'warn' : 'ok'}>
      <AnimBar h={6} segs={[
        { v: kpi.green,  color: 'var(--green)',  label: `Atas target: ${kpi.green}` },
        { v: kpi.yellow, color: 'var(--yellow)', label: `At risk: ${kpi.yellow}` },
        { v: kpi.red,    color: 'var(--red)',    label: `Bawah target: ${kpi.red}` },
      ]} />
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
function DeadlinePanel({ clusters }: { clusters: DeadlineCluster[] }) {
  const max  = Math.max(...clusters.map(c => c.total), 1)
  const soon = clusters.find(c => c.label === '≤ 30 hari')
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
type ChartProgram = { id: number; code: string; name: string; progressPercent: number; daysRemaining: number | null; healthTone: string; divisi: string }

const TONE_COLOR: Record<string, string> = {
  on_track: 'var(--green)', at_risk: 'var(--yellow)',
  terlambat: 'var(--red)', overdue: 'var(--red)', selesai: 'var(--blue)',
}
const TONE_LABEL: Record<string, string> = {
  on_track: 'On Track', at_risk: 'At Risk',
  terlambat: 'Terlambat', overdue: 'Lewat Tenggat', selesai: 'Selesai',
}
const urgencyRank: Record<string, number> = { overdue: 0, terlambat: 1, at_risk: 2, on_track: 3, selesai: 4 }

function ProgramListPanel({ programs, onOpen }: { programs: ChartProgram[]; onOpen: (id: number) => void }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 100); return () => clearTimeout(t) }, [])
  if (programs.length === 0) return null

  const sorted = [...programs].sort((a, b) => (urgencyRank[a.healthTone] ?? 5) - (urgencyRank[b.healthTone] ?? 5))

  return (
    <div className="panel hd-pl-panel">
      <div className="panel__header">
        <h3 className="panel__title">Posisi Portfolio Program</h3>
        <div className="panel__header-meta">
          <span className="section-badge">{programs.length} program</span>
          <span className="hd-scatter-legend">
            <span style={{ color: TONE_COLOR.on_track }}>● On Track</span>
            <span style={{ color: TONE_COLOR.at_risk }}>● At Risk</span>
            <span style={{ color: TONE_COLOR.terlambat }}>● Terlambat</span>
          </span>
        </div>
      </div>
      <div className="hd-pl-list">
        {sorted.map(p => {
          const color  = TONE_COLOR[p.healthTone] ?? 'var(--text-muted)'
          const label  = TONE_LABEL[p.healthTone] ?? p.healthTone
          const code   = p.divisi?.replace('-HLD', '') ?? ''
          const days   = p.daysRemaining
          const dLabel = days === null ? null
            : days < 0 ? `${Math.abs(days)} hari lewat`
            : days === 0 ? 'Hari ini' : `${days} hari`
          const isOver   = days !== null && days < 0
          const isUrgent = !isOver && days !== null && days <= 30
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
                  {code && <span className="hd-pl-row__div">{code}</span>}
                  <span className="hd-pl-row__status" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                    {label}
                  </span>
                </div>
              </div>
              <div className="hd-pl-row__bar">
                <div className="hd-pl-row__track">
                  <div className="hd-pl-row__fill" style={{
                    width: drawn ? `${p.progressPercent}%` : '0%',
                    background: color,
                    transition: drawn ? 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
                  }} />
                </div>
                <span className="hd-pl-row__pct">{p.progressPercent}%</span>
              </div>
              {dLabel && (
                <span className={`hd-pl-row__days${isOver ? ' hd-pl-row__days--over' : isUrgent ? ' hd-pl-row__days--urgent' : ''}`}>
                  {dLabel}
                </span>
              )}
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

// ── EW Card ────────────────────────────────────────────────────────────
function EWCard({ p, onClick }: { p: EarlyWarningProgram; onClick: () => void }) {
  const days = p.daysRemaining
  const isOver   = (days !== null && days < 0) || p.healthTone === 'overdue'
  const isUrgent = !isOver && days !== null && days <= 14
  const tone     = isOver ? 'over' : isUrgent ? 'hot' : 'risk'
  const pill: 'GREEN' | 'YELLOW' | 'RED' | 'OVERDUE' =
    p.healthTone === 'overdue' ? 'OVERDUE' : p.healthTone === 'terlambat' ? 'RED' : 'YELLOW'
  const dLabel = days === null ? null
    : days < 0 ? `${Math.abs(days)} hari lewat`
    : days === 0 ? 'Hari ini' : `${days} hari`

  return (
    <button className={`ew ew--${tone}`} onClick={onClick} type="button">
      <div className="ew__hd">
        <div className="ew__tags">
          {p.divisi && p.divisi !== '-' && <span className="ew__div">{p.divisi}</span>}
          {p.kelompok === 'SCORECARD' && <span className="ew__sc">SC</span>}
        </div>
        <HealthPill status={pill} />
      </div>
      <p className="ew__name">{p.name}</p>
      <div className="ew__prog">
        <div className="ew__track"><div className={`ew__fill ew__fill--${tone}`} style={{ width: `${p.progressPercent}%` }} /></div>
        <span className="ew__pct">{p.progressPercent}%</span>
      </div>
      {dLabel && (
        <div className="ew__ft">
          <span className={`ew__days ew__days--${tone}`}>{dLabel}</span>
          {p.dukunganDibutuhkan && <span className="ew__sup">↑ dukungan</span>}
        </div>
      )}
      {p.progresTerkini && <p className="ew__note">{p.progresTerkini}</p>}
    </button>
  )
}

// ── Main ───────────────────────────────────────────────────────────────
export function HomeView() {
  const { currentUser, programSummary, overviewStatus, openProgramWorkspace } = useWorkspace()
  const navigate = useInertiaNavigate()
  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const isStrategic = ['BOD', 'KADIV', 'ADMIN', 'SUPERADMIN'].includes(role)
  const [fDiv, setFDiv] = useState('')
  const [fStatus, setFStatus] = useState('')

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
      <SectionState title="Data tidak tersedia" text="Periksa koneksi dan coba refresh." />
    </div>
  )

  const {
    scope, summary, byDivisi, earlyWarning, taskLoad,
    scorecardHealth, deadlineClusters, needsAction,
    blockerSignal, kpiHealth, momentum, velocity,
    trendSeries, programsForChart,
  } = programSummary

  const tlm = summary.terlambat + summary.overdue
  const namedDivisi = byDivisi.filter(d => d.unit.id !== null)

  // ── Role-aware view configuration ──
  // showCrossDivisi = panel yang membandingkan antar-divisi (Profil Divisi, Status Per Divisi).
  // Hanya bermakna saat user mengawasi ≥2 divisi (BOD/ADMIN, atau KADIV dgn multi-unit).
  const showCrossDivisi = scope?.level === 'portfolio' || (scope?.level === 'directorate' && namedDivisi.length > 1)

  // Sort by urgency: overdue → terlambat → at_risk, then days remaining ASC, then progress ASC
  const urgencyRank: Record<string, number> = { overdue: 0, terlambat: 1, at_risk: 2 }
  const sortedWarning = [...earlyWarning].sort((a, b) => {
    const ra = urgencyRank[a.healthTone] ?? 3
    const rb = urgencyRank[b.healthTone] ?? 3
    if (ra !== rb) return ra - rb
    const ad = a.daysRemaining ?? Infinity
    const bd = b.daysRemaining ?? Infinity
    if (ad !== bd) return ad - bd
    return a.progressPercent - b.progressPercent
  })

  const filtered = sortedWarning.filter(p =>
    (!fDiv || p.divisi === fDiv) && (!fStatus || p.healthTone === fStatus)
  )
  const divOpts = [...new Set(earlyWarning.map(p => p.divisi).filter(d => d && d !== '-'))].sort()

  // Watch list urgency breakdown for header
  const ewTerlambat = earlyWarning.filter(p => p.healthTone === 'terlambat' || p.healthTone === 'overdue').length
  const ewAtRisk    = earlyWarning.filter(p => p.healthTone === 'at_risk').length

  const velParts = velocity ? [
    velocity.onTrack   > 0 ? `↑${velocity.onTrack} on track`       : velocity.onTrack   < 0 ? `↓${Math.abs(velocity.onTrack)} on track`   : null,
    velocity.terlambat > 0 ? `↑${velocity.terlambat} terlambat`    : velocity.terlambat < 0 ? `↓${Math.abs(velocity.terlambat)} terlambat` : null,
    velocity.selesai   > 0 ? `+${velocity.selesai} selesai`        : null,
  ].filter(Boolean) : []

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
              {' · '}
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
            onClick={() => window.print()}
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
        scopeName={scope?.name ?? null} />

      {/* Watch List — program yang perlu perhatian */}
      {earlyWarning.length > 0 && (
        <div className="panel" style={ewTerlambat > 0 ? { borderColor: 'color-mix(in srgb, var(--red) 35%, var(--panel-border))' } : undefined}>
          <div className="panel__header">
            <h3 className="panel__title">Program Perlu Dipantau</h3>
            <div className="panel__header-meta">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {ewTerlambat > 0 && (
                  <span className="section-badge section-badge--red">{ewTerlambat} terlambat</span>
                )}
                {ewAtRisk > 0 && (
                  <span className="section-badge section-badge--yellow">{ewAtRisk} at risk</span>
                )}
                {earlyWarning.length > 5 && (
                  <>
                    <select className="hd-sel" value={fDiv} onChange={e => setFDiv(e.target.value)}>
                      <option value="">Semua Divisi</option>
                      {divOpts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className="hd-sel" value={fStatus} onChange={e => setFStatus(e.target.value)}>
                      <option value="">Semua Status</option>
                      <option value="at_risk">At Risk</option>
                      <option value="terlambat">Terlambat</option>
                      <option value="overdue">Lewat Tenggat</option>
                    </select>
                    {(fDiv || fStatus) && (
                      <button className="hd-sel-x" type="button" onClick={() => { setFDiv(''); setFStatus('') }}>×</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          {filtered.length === 0
            ? <p className="hd-panel-empty">Tidak ada program yang cocok.</p>
            : <div className="hd-ew-grid">
                {filtered.map(p => <EWCard key={p.id} p={p} onClick={() => openProgramWorkspace(p.id)} />)}
              </div>
          }
        </div>
      )}

      {/* Status per divisi — hanya muncul saat scope mencakup >1 divisi */}
      {showCrossDivisi && namedDivisi.length > 1 && (
        <div className="panel">
          <div className="panel__header">
            <h3 className="panel__title">Status Per Divisi</h3>
            <div className="panel__header-meta">
              <span className="section-badge">{namedDivisi.length} divisi · {summary.total} program</span>
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

      {/* Portfolio program list — compact, scannable, replaces scatter */}
      <ProgramListPanel programs={programsForChart} onOpen={openProgramWorkspace} />

      {/* Intelligence — row 1: KPI + Profil Divisi (kalau cross-divisi) */}
      <div className={`hd-intel-row ${showCrossDivisi ? 'hd-intel-row--55-45' : 'hd-intel-row--single'}`}>
        <KpiPanel kpi={kpiHealth} />
        {showCrossDivisi && <DivisionProfile divisi={namedDivisi} taskLoad={taskLoad} blockerSignal={blockerSignal} />}
      </div>

      {/* Intelligence — row 2: Momentum + Deadline + Scorecard */}
      <div className={`hd-intel-row ${deadlineClusters.length > 0 ? 'hd-intel-row--3col' : 'hd-intel-row--2col'}`}>
        <MomentumPanel m={momentum} onOpen={openProgramWorkspace} />
        {deadlineClusters.length > 0 && <DeadlinePanel clusters={deadlineClusters} />}
        <ScorecardPanel rows={scorecardHealth} />
      </div>

    </div>
  )
}

export default HomeView
