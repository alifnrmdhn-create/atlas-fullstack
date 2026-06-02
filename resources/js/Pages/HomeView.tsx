import { Fragment, useState, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useAuth } from '../hooks/useAuth'
import { SkeletonBlock, SectionState } from '../components/ui'
import { Card, Sparkline, Meter, Delta, Bars, Gauge } from '../design-system'
import { scoreTone, type Tone } from '../lib/tone'
import { resolveMonthIndex } from '../lib/forecast'
import './HomeView.css'

/* ─── Inertia props ─────────────────────────────────────────── */

type ScorecardSnapshot = {
  /** 'portfolio' (DIRUT/Admin) | 'directorate' (Direktur fungsional/KADIV) | 'unit' (KASUBDIV/below) */
  level: 'portfolio' | 'directorate' | 'unit' | string
  periode: string
  /** Human label of the resolved period, e.g. "April 2026". */
  periodeLabel: string
  /** Label noun for items shown — 'direktorat' for portfolio, 'divisi' for directorate level. */
  itemLabel: string
  /** Avg KPI of items shown. */
  avgItem: number
  /** Change in avgItem vs the previous period with data (null if unknown). */
  avgDelta: number | null
  /** Total items shown. */
  totalItem: number
  /** Top 3 items (direktorat for DIRUT, divisi for Direktur fungsional). */
  topItems: Array<{ rank: number; nama: string; kode: string; nilai: number }>
  /** Items below the 80% target threshold. */
  belowTarget: Array<{ nama: string; kode: string; nilai: number }>
  /** User's own direktorat — header context for directorate-level views. Null for portfolio. */
  ownItem: { kode: string; nama: string; nilai: number } | null
  /** Avg KPI per month (last 6), oldest → newest; avg=null for months without data. */
  kpiTrend: Array<{ label: string; avg: number | null }>
  /** Full direktorat × divisi grid — portfolio level only. */
  grid?: Array<{
    kode: string
    nama: string
    nilai: number
    divisi: Array<{ kode: string; nama: string; nilai: number }>
  }>
}

/* ─── Helpers ───────────────────────────────────────────────── */

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat pagi'
  if (h < 15) return 'Selamat siang'
  if (h < 19) return 'Selamat sore'
  return 'Selamat malam'
}

function getQuarter(d: Date): number {
  return Math.floor(d.getMonth() / 3) + 1
}

/* Proyeksi KPI akhir tahun — regresi linear tren bulanan → nilai Desember.
 * Compact (mengembalikan angka saja, bukan chart) untuk dipakai di intelligence strip. */
function projectKpi(trend: Array<{ avg: number | null }>, periode: string, target = 100): { value: number; deltaVsTarget: number; tone: Tone } | null {
  const pts = trend.map((t, i) => ({ i, v: t.avg })).filter((p): p is { i: number; v: number } => p.v != null)
  if (pts.length < 2) return null
  const n = pts.length
  const sx = pts.reduce((s, p) => s + p.i, 0)
  const sy = pts.reduce((s, p) => s + p.v, 0)
  const sxx = pts.reduce((s, p) => s + p.i * p.i, 0)
  const sxy = pts.reduce((s, p) => s + p.i * p.v, 0)
  const slope = (n * sxy - sx * sy) / Math.max(n * sxx - sx * sx, 1e-6)
  const intercept = (sy - slope * sx) / n
  const lastI = trend.length - 1
  const curMonth = resolveMonthIndex(periode)
  const projI = lastI + (curMonth ? Math.max(12 - curMonth, 0) : 0)
  const value = intercept + slope * projI
  const tone: Tone = value >= target ? 'green' : value >= target * 0.9 ? 'amber' : 'red'
  return { value, deltaVsTarget: value - target, tone }
}

/* Count-up — angka menghitung naik saat mount (easeOutCubic). Hormati
 * prefers-reduced-motion (langsung tampil nilai final). */
function CountUp({ value, decimals = 0, duration = 900 }: { value: number; decimals?: number; duration?: number }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [n, setN] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) { setN(value); return }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setN(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduced])
  return <>{n.toFixed(decimals)}</>
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function direkturSlug(kode: string): string {
  return kode.toLowerCase()
}

/* Relative time for the activity feed — "baru saja / 3 jam lalu / 2 hr lalu". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const m = Math.floor((Date.now() - then) / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hr lalu`
  return `${Math.floor(d / 30)} bln lalu`
}

const ENTITY_LABEL: Record<string, string> = {
  Program: 'program', WorkItem: 'task', Task: 'task', Meeting: 'rapat',
  ProgressLog: 'progres', Blocker: 'hambatan', Assignment: 'penugasan',
  EscalationRequest: 'eskalasi', MeetingActionItem: 'tindak lanjut',
}

function activityText(a: { action: string; entityType: string; description?: string }): string {
  if (a.description) return a.description
  const ent = ENTITY_LABEL[a.entityType] ?? a.entityType
  return `${a.action} ${ent}`.trim()
}

/* Activity feed marker — ikon JENIS aktivitas (bukan inisial nama yang
 * menyamar jadi avatar orang; feed ini sintetis tanpa data aktor). */
function activityTone(action: string): Tone {
  return action === 'BLOCKER_ADDED' ? 'amber' : action === 'MEASURED' ? 'green' : 'neutral'
}
function ActivityGlyph({ action }: { action: string }) {
  const p = {
    width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.9,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (action) {
    case 'MEASURED':       // KPI diukur — garis tren
      return <svg {...p}><path d="M4 18 L9 12 L13 15 L20 6" /><polyline points="15 6 20 6 20 11" /></svg>
    case 'BLOCKER_ADDED':  // hambatan — segitiga waspada
      return <svg {...p}><path d="M12 3 L22 20 L2 20 Z" /><line x1="12" y1="10" x2="12" y2="14" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></svg>
    case 'CREATED':        // program baru — dokumen
      return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="14" y2="13" /></svg>
    default:               // STATUS_CHANGED — diperbarui (refresh)
      return <svg {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><polyline points="21 3 21 8 16 8" /></svg>
  }
}

/* Status glyph — check (aman) / triangle (hati-hati) / cross (bahaya). Tone
 * carried by currentColor; neutral falls back to a dot. */
function ToneGlyph({ tone }: { tone: Tone }) {
  const p = {
    width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2.4,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  if (tone === 'green') return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>
  if (tone === 'amber') return <svg {...p}><path d="M12 3 L22 20 L2 20 Z" /><line x1="12" y1="10" x2="12" y2="14" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></svg>
  if (tone === 'red') return <svg {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
  return <span className="hv__dot" data-tone="neutral" />
}

/* Shortcut icon — minimal line glyphs keyed by name. */
function ShortcutIcon({ name }: { name: string }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'programs': return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="14" x2="14" y2="14" /></svg>
    case 'workboard': return <svg {...p}><rect x="3" y="4" width="6" height="16" rx="1" /><rect x="11" y="4" width="6" height="10" rx="1" /><line x1="20" y1="4" x2="20" y2="20" /></svg>
    case 'meeting': return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>
    case 'performance': return <svg {...p}><path d="M4 19 L9 12 L13 15 L20 6" /><polyline points="15 6 20 6 20 11" /></svg>
    default: return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>
  }
}

/* ─── Execution Map — compact 3×3 grid: progress band × time-pressure band,
 * each cell = program count (mockup "Execution Map"). A digest of the scatter
 * Peta Portfolio: same two axes, bucketed for at-a-glance density. */
function ExecutionMap({ programs, onOpen }: {
  programs: Array<{ progressPercent: number; daysRemaining: number | null; healthTone: string }>
  onOpen: () => void
}) {
  // rows = time-pressure (Tinggi/Sedang/Rendah), cols = progress (Awal/Tengah/Akhir)
  const grid = [0, 1, 2].map(() => [0, 0, 0])
  const pressRow = (d: number | null) => d == null ? 2 : d < 0 || d <= 30 ? 0 : d <= 90 ? 1 : 2
  const progCol = (p: number) => p < 34 ? 0 : p < 67 ? 1 : 2
  programs.forEach(p => { grid[pressRow(p.daysRemaining)][progCol(p.progressPercent)]++ })
  const max = Math.max(1, ...grid.flat())
  const rowLabels = ['Tinggi', 'Sedang', 'Rendah']
  // tone: high-pressure + low-progress (top-left) = danger; low-pressure + high-progress = safe
  const cellTone = (r: number, c: number): Tone => {
    const score = (2 - r) + c // 0..4
    return r === 0 && c === 0 ? 'red' : score <= 1 ? 'red' : score === 2 ? 'amber' : 'green'
  }
  return (
    <div className="hvc__xmap">
      <div className="hvc__xmap-grid">
        {grid.map((row, r) => (
          <Fragment key={r}>
            <span className="hvc__xmap-rowh">{rowLabels[r]}</span>
            {row.map((count, c) => (
              <button key={c} type="button" className="hvc__xmap-cell" data-tone={cellTone(r, c)} data-empty={count === 0 ? '' : undefined}
                style={{ ['--i' as string]: count === 0 ? 0.05 : 0.18 + 0.82 * (count / max) } as CSSProperties}
                title={`Tekanan ${rowLabels[r].toLowerCase()} · progres ${['awal','tengah','akhir'][c]}: ${count} program`}
                onClick={onOpen}>
                {count > 0
                  ? <span className="hvc__xmap-count">{count}<span className="hvc__xmap-cap">Program</span></span>
                  : <span className="hvc__xmap-count hvc__xmap-count--zero">0<span className="hvc__xmap-cap">Program</span></span>}
              </button>
            ))}
          </Fragment>
        ))}
        <span className="hvc__xmap-corner" aria-hidden />
        <span className="hvc__xmap-colh">Awal</span>
        <span className="hvc__xmap-colh">Tengah</span>
        <span className="hvc__xmap-colh">Akhir</span>
      </div>
    </div>
  )
}

/* Initials from a label (for activity avatars without backend user data). */
function initials(text: string): string {
  const words = text.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '•'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/* ─── Eksekusi per divisi — toggle KPI / Eksekusi, 6 rows + sparkline
 * (mockup "Eksekusi per divisi"). KPI view = score vs 100; Eksekusi view =
 * overdue count. Each row: icon dot + name + bar + trend sparkline + value. */
type DivRow = { code: string; name: string; kpi: number | null; overdue: number; total: number; pctOnTrack: number }
function DivisiPanel({ rows, onRow }: { rows: DivRow[]; onRow: (code: string) => void }) {
  const [mode, setMode] = useState<'kpi' | 'exec'>('exec')
  const showKpi = mode === 'kpi' && rows.some(r => r.kpi != null)
  const sorted = [...rows].sort((a, b) =>
    showKpi ? (b.kpi ?? -1) - (a.kpi ?? -1) : b.overdue - a.overdue
  ).slice(0, 6)
  return (
    <div className="hvc__divp">
      <div className="hvc__divp-toggle" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'kpi'} data-active={mode === 'kpi'} onClick={() => setMode('kpi')}>KPI</button>
        <button type="button" role="tab" aria-selected={mode === 'exec'} data-active={mode === 'exec'} onClick={() => setMode('exec')}>Eksekusi</button>
      </div>
      <div className="hvc__divlist">
        {sorted.map(r => {
          const t: Tone = showKpi
            ? scoreTone(r.kpi ?? 0)
            : (r.overdue === 0 ? 'green' : r.pctOnTrack < 50 ? 'red' : 'amber')
          const val = showKpi ? (r.kpi != null ? `${r.kpi.toFixed(1)}%` : '—') : String(r.overdue)
          const meterVal = showKpi ? (r.kpi ?? 0) : r.overdue
          const meterMax = showKpi ? 120 : Math.max(1, ...sorted.map(x => x.overdue))
          return (
            <button key={r.code} type="button" className="hvc__divrow" onClick={() => onRow(r.code)}>
              <span className="hvc__divrow-dot" data-tone={t} aria-hidden />
              <span className="hvc__divrow-code" title={r.name}>{r.code}</span>
              <Meter className="hvc__divrow-meter" value={meterVal} max={meterMax} target={showKpi ? 100 : undefined} tone={t} height={10} aria-label={`${r.code}: ${val}`} />
              <span className="hvc__divrow-val" data-tone={t}>{val}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Horizontal deadline timeline — date axis with stop markers (mockup
 * "Timeline Deadline Kritis"). Programs plotted as nodes on a baseline,
 * spaced by sequence; each node = date + program label, colored by urgency. */
type TLProg = { id: number; code: string; name: string; daysRemaining: number | null; targetEndDate?: string | null; divisi: string; healthTone: string }
const TL_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function DeadlineTimeline({ programs, onOpen }: { programs: TLProg[]; onOpen: (id: number) => void }) {
  const items = programs.slice(0, 8)
  if (items.length === 0) return <p className="hvc__empty">Tidak ada program aktif bertenggat.</p>
  const fmt = (iso?: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.getDate()} ${TL_MON[d.getMonth()]}`
  }
  const toneOf = (days: number): Tone => days < 0 ? 'red' : days <= 14 ? 'red' : days <= 30 ? 'amber' : 'green'
  const daysLabelOf = (days: number) => days < 0 ? `${Math.abs(days)} hr lewat` : days === 0 ? 'Hari ini' : `${days} hr lagi`

  // Sumbu PROPORSIONAL: tiap penanda diposisikan menurut tanggal aslinya (bukan
  // urutan), jadi tenggat yang berdempetan terbaca jujur sebagai tumpukan — bukan
  // disamaratakan seolah jaraknya seragam. Butuh ≥2 tanggal valid; jika tidak,
  // fallback ke spasi rata.
  const stamped = items.map(p => ({ p, t: p.targetEndDate ? new Date(p.targetEndDate).getTime() : NaN }))
  const valid = stamped.filter(s => !Number.isNaN(s.t)).map(s => s.t)
  const scaled = valid.length >= 2
  const min = scaled ? Math.min(...valid) : 0
  const max = scaled ? Math.max(...valid) : 1
  const span = Math.max(1, max - min)
  const posOf = (t: number, i: number) =>
    scaled && !Number.isNaN(t)
      ? 4 + 92 * ((t - min) / span)
      : (items.length === 1 ? 50 : 4 + 92 * (i / (items.length - 1)))
  const positions = stamped.map(({ t }, i) => posOf(t, i))

  // Stagger penanda yang berhimpit secara vertikal (lane) supaya klaster jadi
  // tumpukan yang terbaca, bukan blob. Urut by posisi lalu beri lane bertingkat.
  const lanes = new Array<number>(items.length).fill(0)
  const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b])
  let prevPos = -Infinity, prevLane = 0
  for (const idx of order) {
    prevLane = positions[idx] - prevPos < 4 ? Math.min(prevLane + 1, 3) : 0
    lanes[idx] = prevLane
    prevPos = positions[idx]
  }

  // Tick bulan sepanjang rentang — penambat skala nyata.
  const ticks: Array<{ pos: number; label: string }> = []
  if (scaled) {
    const dMin = new Date(min)
    let y = dMin.getFullYear(), m = dMin.getMonth()
    for (let k = 0; k < 14; k++) {
      const tt = new Date(y, m, 1).getTime()
      if (tt > max) break
      if (tt >= min) ticks.push({ pos: 4 + 92 * ((tt - min) / span), label: TL_MON[m] })
      m++; if (m > 11) { m = 0; y++ }
    }
  }

  return (
    <div className="hvc__tl2">
      <div className="hvc__tl2-axis" role="img" aria-label="Sebaran tenggat program">
        <span className="hvc__tl2-line" aria-hidden />
        {ticks.map((tk, i) => (
          <span key={i} className="hvc__tl2-tick" style={{ left: `${tk.pos}%` } as CSSProperties}>{tk.label}</span>
        ))}
        {stamped.map(({ p, t }, i) => {
          const days = p.daysRemaining ?? 0
          const tone = toneOf(days)
          return (
            <button key={p.id} type="button" className="hvc__tl2-dot" data-tone={tone}
              style={{ left: `${positions[i]}%`, ['--lane' as string]: lanes[i] } as CSSProperties}
              title={`${p.name} · ${fmt(p.targetEndDate)} · ${daysLabelOf(days)}`}
              aria-label={`${p.name}, ${daysLabelOf(days)}`}
              onClick={() => onOpen(p.id)}>
              <span className="hvc__tl2-num">{i + 1}</span>
            </button>
          )
        })}
      </div>
      <ol className="hvc__tl2-list">
        {stamped.map(({ p }, i) => {
          const days = p.daysRemaining ?? 0
          const tone = toneOf(days)
          return (
            <li key={p.id}>
              <button type="button" className="hvc__tl2-row" onClick={() => onOpen(p.id)}>
                <span className="hvc__tl2-rnum" data-tone={tone}>{i + 1}</span>
                <span className="hvc__tl2-rdate" data-tone={tone}>{fmt(p.targetEndDate)}</span>
                <span className="hvc__tl2-rname" title={p.name}>{p.name}</span>
                <span className="hvc__tl2-rmeta">{p.divisi || '—'}</span>
                <span className="hvc__tl2-rdays" data-tone={tone}>{daysLabelOf(days)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────── */

export default function HomeView() {
  const { currentUser, programSummary, overviewStatus, openProgramWorkspace } = useWorkspace()
  const navigate = useInertiaNavigate()
  const { props } = usePage<{ scorecardSnapshot: ScorecardSnapshot }>()
  const scorecard = props.scorecardSnapshot
  const auth = useAuth()

  // Performance role-scoped (2026-05-29): KPI panel + KPI links only for those
  // with access (SUPERADMIN portfolio, or a directorate member with data).
  const isSuperAdmin = (currentUser?.roleType ?? '').toUpperCase() === 'SUPERADMIN'
  const canSeePerformance = isSuperAdmin || (auth?.canAccessPerformance ?? false)

  if (overviewStatus.loading && !programSummary) {
    return (
      <div className="ds home-v2 home-v2--cockpit">
        <div className="hv hv--cockpit hvc__sk" aria-busy="true" aria-label="Memuat dashboard">
          <div className="hvc__sk-line" style={{ width: 260, height: 20 }} />
          <div className="hvc__sk-bar" />
          <div className="hvc__sk-grid hvc__sk-grid--hud">
            {[0, 1, 2, 3].map(i => <div key={i} className="hvc__sk-card" />)}
          </div>
          <div className="hvc__sk-line" style={{ width: 230, height: 24, marginTop: 4 }} />
          <div className="hvc__sk-grid hvc__sk-grid--cmd">
            {[0, 1, 2, 3].map(i => <div key={i} className="hvc__sk-panel" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!programSummary) {
    return (
      <div className="ds home-v2">
        <div className="hv">
          <SectionState
            title="Data dashboard tidak tersedia"
            text="Tidak dapat memuat ringkasan portfolio. Coba refresh — jika berlanjut, periksa koneksi server."
          />
        </div>
      </div>
    )
  }

  const { summary, velocity, momentum, scope } = programSummary
  // Defensive: PHP json_encode men-serialize array KOSONG sebagai `{}` (objek), bukan
  // `[]`. Kalau itu terjadi, `.filter`/`.map`/`[...spread]` di bawah meledak & Home
  // white-screen lewat AppErrorBoundary (kena di user berdata-tipis). Paksa ke array.
  const byDivisi = Array.isArray(programSummary.byDivisi) ? programSummary.byDivisi : []
  const controls = Array.isArray(programSummary.controls) ? programSummary.controls : []
  const needsAction = Array.isArray(programSummary.needsAction) ? programSummary.needsAction : []
  const trendSeries = Array.isArray(programSummary.trendSeries) ? programSummary.trendSeries : []
  const programsForChart = Array.isArray(programSummary.programsForChart) ? programSummary.programsForChart : []
  const recentActivity = Array.isArray(programSummary.recentActivity) ? programSummary.recentActivity : []
  const deadlineClusters = Array.isArray(programSummary.deadlineClusters) ? programSummary.deadlineClusters : []
  const now = new Date()

  /* ── Derived figures (all from existing payload) ─────────────── */
  const tlm = summary.terlambat + summary.overdue
  const criticalControlCount = (controls ?? []).filter(
    c => c.severity === 'CRITICAL' || c.severity === 'HIGH'
  ).length
  const draftPipeline = Math.max(summary.total - summary.onTrack - summary.atRisk - tlm - summary.selesai, 0)
  const activeProgramCount = summary.onTrack + summary.atRisk + tlm
  const onTrackPct = activeProgramCount > 0 ? Math.round((summary.onTrack / activeProgramCount) * 100) : 0
  const statusTotal = Math.max(summary.onTrack + summary.atRisk + tlm + draftPipeline, 1)
  const onTrackDelta = velocity?.onTrack ?? null
  const programTone: Tone = tlm > 0 ? 'red' : summary.atRisk > 0 ? 'amber' : 'green'

  // Headline KPI = the viewer's OWN directorate score (ownItem) at
  // directorate/unit level — the official, weighted figure they report up —
  // falling back to the portfolio average. NOT the simple divisi-average
  // (avgItem), which would misstate the directorate's official scorecard.
  const kpiHeadline = scorecard.ownItem?.nilai ?? scorecard.avgItem
  const hasKpi = canSeePerformance && (scorecard.totalItem > 0 || scorecard.ownItem != null)
  const belowTargetCount = canSeePerformance ? scorecard.belowTarget.length : 0
  const kpiTone: Tone = hasKpi ? scoreTone(kpiHeadline) : 'neutral'
  const kpiSpark = scorecard.kpiTrend.filter(t => t.avg != null).map(t => t.avg as number)

  // KPI breakdown rows: at portfolio with a single directorate, expand it into
  // its divisi (more informative than one row echoing the headline); otherwise
  // show the ranked items as-is (directorates for portfolio, divisi for KADIV).
  const kpiRowsAreDivisi = (!!scorecard.grid && scorecard.grid.length === 1) || scorecard.itemLabel === 'divisi'
  const kpiRows = (scorecard.grid && scorecard.grid.length === 1)
    ? scorecard.grid[0].divisi
    : scorecard.topItems.map(d => ({ kode: d.kode, nama: d.nama, nilai: d.nilai }))
  const kpiRowUrl = (kode: string) => kpiRowsAreDivisi
    ? `/performance/divisi/${kode.toLowerCase()}`
    : `/performance/kolegial/${direkturSlug(kode)}`

  // Insight — lagging (KPI result) vs leading (execution on-track%). The most
  // valuable executive signal: a green KPI sitting on top of red execution means
  // the result hasn't caught up to the slowdown yet (KPI at risk next period).
  const leadingTone: Tone = onTrackPct >= 80 ? 'green' : onTrackPct >= 50 ? 'amber' : 'red'
  const kpiDiverges = hasKpi && kpiHeadline >= 100 && leadingTone === 'red'
  const alignTone: Tone = kpiDiverges ? 'red'
    : (hasKpi && kpiHeadline >= 100 && leadingTone === 'green') ? 'green'
    : 'amber'
  const alignText = kpiDiverges ? 'Tidak selaras' : alignTone === 'green' ? 'Selaras' : 'Perhatikan'
  const alignGap = hasKpi ? Math.round(kpiHeadline - onTrackPct) : 0

  /* ── Overall verdict (management by exception) ───────────────── */
  const exceptionCount = tlm + belowTargetCount + needsAction.length + criticalControlCount
  // Decision inbox (kartu ④) = keputusan murni: approval/eskalasi + KPI di bawah
  // target + kontrol kritis. Sengaja TANPA 'terlambat' — itu sudah punya kartu ③
  // + disebut di verdict; ikut menghitungnya bikin badge inflate (mis. 43) & angka
  // keterlambatan muncul ke-4 kalinya. (review redundansi Home, Jun 2026)
  const decisionCount = belowTargetCount + needsAction.length + criticalControlCount
  const statusTone: Tone =
    (tlm > 0 || belowTargetCount > 0 || criticalControlCount > 0) ? 'red'
    : (summary.atRisk > 0 || needsAction.length > 0) ? 'amber'
    : 'green'
  const statusLabel = statusTone === 'green' ? 'Terkendali' : statusTone === 'amber' ? 'Perhatian' : 'Tindakan'
  const aksiTone: Tone = decisionCount > 0 ? (belowTargetCount > 0 ? 'red' : 'amber')
    : tlm > 0 ? 'amber' : 'green'

  /* ── Exception list (only what needs a decision) ─────────────── */
  type Exc = { id: string; tone: Tone; label: ReactNode; meta?: string; onClick: () => void }
  const exceptions: Exc[] = []
  if (canSeePerformance && belowTargetCount > 0) {
    const f = scorecard.belowTarget[0]
    exceptions.push({
      id: 'kpi', tone: 'red',
      label: <><strong>{belowTargetCount} KPI</strong> di bawah target</>,
      meta: `${f.nama} · ${f.nilai.toFixed(1)}%`, onClick: () => navigate(kpiRowUrl(f.kode)),
    })
  }
  if (needsAction.length > 0) {
    exceptions.push({
      id: 'na', tone: 'amber',
      label: <><strong>{needsAction.length} hal</strong> menunggu keputusan</>,
      meta: 'Approval & eskalasi', onClick: () => navigate('/fokus'),
    })
  }
  if (criticalControlCount > 0) {
    exceptions.push({
      id: 'cc', tone: 'amber',
      label: <><strong>{criticalControlCount} kontrol kritis</strong> terbuka</>,
      meta: 'Risiko CRITICAL/HIGH', onClick: () => navigate('/programs'),
    })
  }

  /* ── Program trend sparkline (% on track, 14d) ───────────────── */
  // Buang snapshot "bootstrap" — hari saat portfolio masih ~kosong (total ≪ sekarang,
  // mis. baru 1 program di-snapshot, pctOnTrack=100) lalu terjun ke nilai riil. Tanpa
  // filter ini, delta first→last jadi artefak seed (mis. −71 poin), bukan momentum
  // nyata. Bandingkan hanya periode dengan skala portfolio sebanding. (Jun 2026)
  const latestTotal = trendSeries.length ? trendSeries[trendSeries.length - 1].total : 0
  const trendStable = trendSeries.filter(t => t.total >= Math.max(2, latestTotal * 0.5))
  const trendValues = (trendStable.length >= 2 ? trendStable : trendSeries).slice(-14).map(t => t.pctOnTrack)
  const trendDelta = trendValues.length >= 2
    ? trendValues[trendValues.length - 1] - trendValues[0]
    : null

  /* ── KPI divisi breakdown (hero card ①) ─────────────────────── */
  const shortCode = (kode: string) => kode.split('-')[0]
  const kpiDivisiBars = kpiRows.map(d => ({
    label: shortCode(d.kode),
    value: d.nilai,
    tone: scoreTone(d.nilai) as Tone,
    valueLabel: d.nilai.toFixed(1),
  }))
  const hasKpiDivisi = canSeePerformance && kpiDivisiBars.length > 0

  /* ── Command-center: Horizon (deadline workload) ─────────────── */
  const horizonBars = (deadlineClusters ?? []).map(c => ({
    label: c.label,
    value: c.total,
    tone: (c.atRisk > 0 ? (c.atRisk >= c.onTrack ? 'red' : 'amber') : 'green') as Tone,
    valueLabel: String(c.total),
  }))

  /* ── Command-center: Overdue per divisi ──────────────────────── */
  const overdueRows = [...byDivisi]
    .filter(d => d.unit.id !== null)
    .map(d => ({ unit: d.unit, value: (d.terlambat ?? 0) + (d.overdue ?? 0) }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  const overdueMax = Math.max(1, ...overdueRows.map(d => d.value))

  /* ── Eksekusi per divisi (KPI + execution merged) ────────────── */
  const kpiByCode = new Map<string, number>()
  ;(scorecard.grid && scorecard.grid.length === 1 ? scorecard.grid[0].divisi : scorecard.topItems.map(d => ({ kode: d.kode, nilai: d.nilai })))
    .forEach(d => kpiByCode.set(d.kode.split('-')[0], d.nilai))
  const divRows = [...byDivisi]
    .filter(d => d.unit.id !== null && d.total > 0)
    .map(d => ({
      code: d.unit.code.split('-')[0],
      name: d.unit.name,
      kpi: kpiByCode.get(d.unit.code.split('-')[0]) ?? null,
      overdue: (d.terlambat ?? 0) + (d.overdue ?? 0),
      total: d.total,
      pctOnTrack: d.pctOnTrack,
    }))

  /* ── Command-center: Momentum ────────────────────────────────── */
  const activeRatePct = momentum ? Math.round((momentum.activeRate ?? 0) * (momentum.activeRate <= 1 ? 100 : 1)) : 0
  const activeRateTone: Tone = activeRatePct >= 60 ? 'green' : activeRatePct >= 30 ? 'amber' : 'red'
  // Stat pendukung kartu Momentum. Active-rate (dulu gauge dominan yang nyaris
  // selalu 100% → low-signal) diturunkan jadi satu stat; kartu kini fokus ke
  // tren On Track yang nyata. 'suffix' di semua entri agar tipe array seragam.
  const momentumStats = momentum ? [
    { label: 'Program bergerak', value: activeRatePct, suffix: '%', tone: activeRateTone },
    { label: 'Selesai · 30 hari', value: momentum.programsCompletedLast30d, suffix: '', tone: 'green' as Tone },
    { label: 'Task selesai · pekan ini', value: momentum.tasksCompletedThisWeek, suffix: '', tone: 'green' as Tone },
    { label: 'Tertahan', value: momentum.stagnantCount, suffix: '', tone: (momentum.stagnantCount > 0 ? 'red' : 'green') as Tone },
  ] : []

  /* ── Mid: Heatmap rekap program (divisi × status) ────────────── */
  const heatRows = [...byDivisi]
    .filter(d => d.unit.id !== null && d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
  const heatCols: Array<{ key: 'onTrack' | 'atRisk' | 'tlm' | 'selesai'; label: string; tone: Tone }> = [
    { key: 'onTrack', label: 'On Track', tone: 'green' },
    { key: 'atRisk', label: 'At Risk', tone: 'amber' },
    { key: 'tlm', label: 'Terlambat', tone: 'red' },
    { key: 'selesai', label: 'Selesai', tone: 'neutral' },
  ]
  const heatVal = (d: typeof heatRows[number], key: string) =>
    key === 'tlm' ? (d.terlambat ?? 0) + (d.overdue ?? 0)
    : key === 'onTrack' ? d.onTrack ?? 0
    : key === 'atRisk' ? d.atRisk ?? 0
    : d.selesai ?? 0
  const heatMax = Math.max(1, ...heatRows.flatMap(d => heatCols.map(c => heatVal(d, c.key))))

  /* ── Mid: Top 5 program terlambat — TRIAGE BY IMPACT (prioritas × keterlambatan),
   * bukan waktu saja. Catatan: efektif begitu prioritas diisi; saat ini sebagian
   * data masih seragam MEDIUM → urutan ≈ keterlambatan. */
  const priorityWeight = (pr?: string | null): number =>
    ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<string, number>)[(pr ?? 'MEDIUM').toUpperCase()] ?? 2
  const top5Terlambat = [...programsForChart]
    .filter(p => p.healthTone === 'terlambat' || p.healthTone === 'overdue')
    .sort((a, b) => {
      const w = priorityWeight(b.priority) - priorityWeight(a.priority)
      if (w !== 0) return w
      return (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999)
    })
    .slice(0, 5)

  /* ── Mid: Activity timeline ──────────────────────────────────── */
  const activity = (recentActivity ?? []).slice(0, 7)

  /* ── Shortcuts ───────────────────────────────────────────────── */
  const shortcuts: Array<{ icon: string; label: string; tone: Tone; onClick: () => void }> = [
    { icon: 'programs', label: 'Programs', tone: 'green', onClick: () => navigate('/programs') },
    { icon: 'workboard', label: 'Workboard', tone: 'amber', onClick: () => navigate('/execution') },
    { icon: 'meeting', label: 'Rapat', tone: 'neutral', onClick: () => navigate('/jadwal') },
    canSeePerformance
      ? { icon: 'performance', label: 'Performance', tone: 'green', onClick: () => navigate('/performance/scorecard') }
      : { icon: 'workboard', label: 'Assignment', tone: 'neutral', onClick: () => navigate('/penugasan') },
  ]

  /* ── Hero stat chips ─────────────────────────────────────────── */
  const heroStats: Array<{ val: number; label: string; tone: Tone; onClick: () => void }> = [
    { val: tlm, label: 'Program terlambat', tone: tlm > 0 ? 'red' : 'green', onClick: () => navigate('/programs') },
    { val: summary.selesai, label: 'Selesai', tone: 'green', onClick: () => navigate('/programs') },
    { val: summary.total, label: 'Total program', tone: 'neutral', onClick: () => navigate('/programs') },
    { val: exceptionCount, label: 'Perlu aksi', tone: exceptionCount > 0 ? 'amber' : 'green', onClick: () => navigate('/fokus') },
  ]

  /* ── Below-the-fold detail data (unchanged sources) ──────────── */
  const attentionPrograms = [...programsForChart]
    .sort((a, b) => {
      const order: Record<string, number> = { overdue: 0, terlambat: 1, at_risk: 2, on_track: 3, selesai: 4 }
      const ao = order[a.healthTone] ?? 5
      const bo = order[b.healthTone] ?? 5
      if (ao !== bo) return ao - bo
      return (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999)
    })
    .slice(0, 6)

  const topDeadlinePrograms = [...programsForChart]
    .filter(p => p.daysRemaining != null && p.healthTone !== 'selesai')
    .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
    .slice(0, 10)

  /* ── Verdict — editorial lead: the one-line state + WHY (reframes a green
   * lagging KPI against the leading execution risk). All from existing data. */
  const verdictLabel = statusTone === 'red' ? 'Perlu Tindakan' : statusTone === 'amber' ? 'Perhatian' : 'Terkendali'
  const verdictSub: ReactNode = kpiDiverges
    ? <>Hasil di atas target (<b>{kpiHeadline.toFixed(1)}%</b>), tapi eksekusi tertinggal (<b>{onTrackPct}%</b>) — <b>{tlm} program terlambat</b> berisiko menekan KPI kuartal depan.</>
    : tlm > 0
      ? <><b>{tlm} program terlambat</b>{belowTargetCount > 0 ? <> &amp; <b>{belowTargetCount} KPI</b> di bawah target</> : null} butuh perhatian — sisanya bergerak sesuai rencana.</>
      : exceptionCount > 0
        ? <><b>{exceptionCount} hal</b> butuh keputusan Anda; portofolio lainnya terkendali.</>
        : <>Semua indikator terkendali — tidak ada yang perlu tindakan khusus.</>
  const verdictCta = tlm > 0 ? `Tinjau ${tlm} program` : exceptionCount > 0 ? 'Buka Focus' : 'Lihat program'
  const verdictHref = tlm > 0 ? '/programs' : exceptionCount > 0 ? '/fokus' : '/programs'

  /* ── Portofolio scope — jawab "apa yang saya kelola & berapa" (data: scope+summary,
   * sebelumnya tak dirender). Active = berjalan (on-track+at-risk+telat), bukan selesai/draft. */
  const scopeName = scope?.level === 'portfolio' ? 'Portofolio PTPN III' : (scope?.name ?? 'Portofolio Anda')
  const scopeUnitLabel = scope?.level === 'portfolio' ? 'direktorat' : 'divisi'
  const activeCount = summary.onTrack + summary.atRisk + tlm

  /* ── P1: intelligence strip (1 baris padat) — forecast · insight · delta ── */
  const forecast = canSeePerformance && hasKpi ? projectKpi(scorecard.kpiTrend, scorecard.periode) : null
  // Insight: divisi penahan keterlambatan terbesar (di mana harus fokus)
  const overByDiv = [...byDivisi]
    .filter(d => d.unit.id !== null)
    .map(d => ({ code: d.unit.code.split('-')[0], over: (d.terlambat ?? 0) + (d.overdue ?? 0) }))
  const totalOverAll = overByDiv.reduce((s, d) => s + d.over, 0)
  const topOver = [...overByDiv].sort((a, b) => b.over - a.over)[0]
  const insightText = topOver && totalOverAll > 0 && topOver.over > 0 && overByDiv.length > 1 && topOver.over / totalOverAll >= 0.34
    ? `${topOver.code} menyumbang ${Math.round((topOver.over / totalOverAll) * 100)}% keterlambatan`
    : null
  // Delta vs periode pembanding (velocity): Δtelat (naik = buruk), Δon-track (naik = baik)
  const velLate = velocity?.terlambat ?? null
  const velOn = velocity?.onTrack ?? null
  const velDays = velocity?.daysAgo ?? null
  const hasDelta = velocity != null && velDays != null && ((velLate ?? 0) !== 0 || (velOn ?? 0) !== 0)

  return (
    <>
      <Head title="Home" />
      <div className="ds home-v2 home-v2--cockpit">
        <div className="hv hv--cockpit">

          {/* ─── Sapaan ringkas (nama saja — periode di topbar, tanggal KPI di kartu KPI;
                hindari duplikasi/konflik minggu) ── */}
          <header className="hv__head hvc__head hvc__head--slim">
            <h1 className="hv__greeting">
              {getGreeting()},{' '}
              <span className="hv__greeting-name">{currentUser?.name ?? 'Anda'}</span>
            </h1>
            <span className="hvc__scope">
              {scopeName} · <b>{summary.total} program</b>
              {scope?.unitCount ? <> · {scope.unitCount} {scopeUnitLabel}</> : null}
              {' · '}<b>{activeCount}</b> berjalan
              {draftPipeline > 0 ? <> · {draftPipeline} draft</> : null}
            </span>
          </header>

          {/* ═══════════════ VERDICT — editorial lead (state + why + action) + intel ═══════════════ */}
          <div className="hvc__verdict-card" data-tone={statusTone}>
          <button type="button" className="hvc__verdict-main" data-tone={statusTone} onClick={() => navigate(verdictHref)}>
            <span className="hvc__verdict-icon" data-tone={statusTone}><ToneGlyph tone={statusTone} /></span>
            <span className="hvc__verdict-body">
              <span className="hvc__verdict-label" data-tone={statusTone}>{verdictLabel}</span>
              <span className="hvc__verdict-sub">{verdictSub}</span>
            </span>
            <span className="hvc__verdict-cta">{verdictCta}<span className="hvc__arrow" aria-hidden>→</span></span>
          </button>

          {/* Intelligence row (di dalam banner): insight · forecast · delta */}
          {(insightText || forecast || hasDelta) && (
            <div className="hvc__intel">
              {insightText && (
                <span className="hvc__intel-seg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></svg>
                  {insightText}
                </span>
              )}
              {forecast && (
                <span className="hvc__intel-seg" data-tone={forecast.tone}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 18 L9 11 L13 14 L20 5" /><polyline points="15 5 20 5 20 10" /></svg>
                  Proyeksi KPI Des <b>≈{forecast.value.toFixed(1)}%</b> <span className="hvc__intel-delta" data-tone={forecast.tone}>({forecast.deltaVsTarget >= 0 ? '+' : ''}{forecast.deltaVsTarget.toFixed(1)} vs target)</span>
                </span>
              )}
              {hasDelta && (
                <span className="hvc__intel-seg hvc__intel-seg--delta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a9 9 0 1 1-2.6-6.4" /><polyline points="21 3 21 8 16 8" /></svg>
                  <span className="hvc__intel-deltawrap">vs {Math.abs(velDays!)} hr lalu:{velLate != null && velLate !== 0 && <b data-tone={velLate > 0 ? 'red' : 'green'}>{velLate > 0 ? '+' : ''}{velLate} terlambat</b>}{velOn != null && velOn !== 0 && <b data-tone={velOn > 0 ? 'green' : 'red'}>{velOn > 0 ? '+' : ''}{velOn} On Track</b>}</span>
                </span>
              )}
            </div>
          )}
          </div>

          {/* ═══════════════ HERO — KPI dominan · Eksekusi · Tertinggal · Keputusan ═══════════════ */}
          <section className="hvc__maphero" aria-label="Ringkasan">
            <div className="hvc__hud">
              {/* ① KPI achievement — big number + delta + embedded flowing trend */}
              {canSeePerformance && hasKpi && (
                <Card padding="none" className="hvc__hcard hvc__hcard--kpi" data-tone={kpiTone}>
                  <div className="hvc__hcard-body">
                    <span className="hvc__hcard-eyebrow">Capaian KPI · {scorecard.periodeLabel}</span>
                    <div className="hvc__kpi-split">
                      <div className="hvc__kpi-left">
                        <div className="hvc__hcard-figure">
                          <span className="hvc__hcard-big" data-tone={kpiTone}><CountUp value={kpiHeadline} decimals={1} /><span className="hvc__hcard-unit">%</span></span>
                          {scorecard.avgDelta != null && <Delta value={scorecard.avgDelta} suffix=" poin" />}
                        </div>
                        <span className="hvc__hcard-foot">vs target 100</span>
                      </div>
                      {hasKpiDivisi && (
                        <ul className="hvc__kpi-divbars">
                          {kpiRows.slice(0, 3).map(d => {
                            const t = scoreTone(d.nilai)
                            return (
                              <li key={d.kode} className="hvc__kpi-divbar">
                                <span className="hvc__kpi-divbar-name" title={d.nama}>{shortCode(d.kode)}</span>
                                <Meter className="hvc__kpi-divbar-meter" value={d.nilai} max={120} target={100} tone={t} height={6} aria-label={`${d.nama}: ${d.nilai.toFixed(1)}%`} />
                                <span className="hvc__kpi-divbar-val" data-tone={t}>{d.nilai.toFixed(1)}</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                  {/* Embedded trend only when genuinely multi-month — a 2–3 point
                      monthly KPI series renders as a stray diagonal "slash" that
                      reads as an error. Sparse data → no spark (divisi bars carry it). */}
                  {kpiSpark.length >= 4 && (
                    <div className="hvc__hcard-spark"><Sparkline values={kpiSpark} tone={kpiTone} width={340} height={48} smooth lastDot={false} /></div>
                  )}
                  <button type="button" className="hvc__hcard-link" onClick={() => navigate('/performance/scorecard')}>Lihat scorecard <span className="hvc__arrow" aria-hidden>→</span></button>
                </Card>
              )}

              {/* ② Execution health — arc gauge + legend */}
              <Card padding="none" className="hvc__hcard hvc__hcard--exec" data-tone={programTone}>
                <div className="hvc__hcard-body">
                  <span className="hvc__hcard-eyebrow">Kesehatan Eksekusi</span>
                  <div className="hvc__hcard-exec-row">
                    <Gauge value={onTrackPct} max={100} tone={leadingTone} size={84} thickness={9} valueText={`${onTrackPct}`} unit="%" label="on track" rich className="hvc__execgauge" />
                    <ul className="hvc__hcard-legend">
                      <li><i className="hvc__dot" data-tone="green" />On Track<b>{summary.onTrack}</b></li>
                      <li><i className="hvc__dot" data-tone="amber" />At Risk<b>{summary.atRisk}</b></li>
                      <li><i className="hvc__dot" data-tone="red" />Terlambat<b>{tlm}</b></li>
                      <li><i className="hvc__dot" data-tone="neutral" />Selesai<b>{summary.selesai}</b></li>
                    </ul>
                  </div>
                </div>
                <button type="button" className="hvc__hcard-link" onClick={() => navigate('/programs')}>Lihat detail <span className="hvc__arrow" aria-hidden>→</span></button>
              </Card>

              {/* ③ Program tertinggal — big number + embedded area trend */}
              <button type="button" className="ds-card hvc__hcard hvc__hcard--late" data-tone={tlm > 0 ? 'red' : 'green'} onClick={() => navigate('/programs')}>
                <div className="hvc__hcard-body">
                  <span className="hvc__hcard-eyebrow">Program Terlambat</span>
                  <span className="hvc__hcard-big" data-tone={tlm > 0 ? 'red' : 'green'}><CountUp value={tlm} /></span>
                  <span className="hvc__hcard-foot">{needsAction.length} menunggu keputusan</span>
                </div>
                {(() => {
                  const lt = (trendSeries ?? []).slice(-14).map(t => t.terlambat)
                  return lt.length >= 4
                    ? <div className="hvc__hcard-spark"><Sparkline values={lt} tone="red" width={340} height={48} smooth lastDot={false} /></div>
                    : null
                })()}
                <span className="hvc__hcard-link hvc__hcard-link--static">Lihat daftar <span className="hvc__arrow" aria-hidden>→</span></span>
              </button>

              {/* ④ Decision Inbox — keputusan yang menunggu Anda (naik dari command center
                  ke hero: ini pekerjaan inti direktur). Mengganti kartu Selisih; ceritanya
                  kini dibawa Verdict di atas. */}
              <Card padding="none" className="hvc__hcard hvc__hcard--inbox" data-tone={aksiTone}>
                <div className="hvc__hcard-body hvc__inbox-body">
                  <div className="hvc__inbox-head">
                    <span className="hvc__hcard-eyebrow">Butuh Keputusan Anda</span>
                    {decisionCount > 0 && <span className="hvc__count-badge" data-tone={aksiTone}>{decisionCount}</span>}
                  </div>
                  {exceptions.length > 0 ? (
                    <div className="hvc__inbox-list">
                      {exceptions.slice(0, 4).map(e => (
                        <button key={e.id} type="button" className="hvc__inbox-row" data-tone={e.tone} onClick={e.onClick}>
                          <span className="hv__dot" data-tone={e.tone} aria-hidden />
                          <span className="hvc__inbox-label">{e.label}</span>
                          {e.meta && <span className="hvc__inbox-meta">{e.meta}</span>}
                          <span className="hvc__inbox-arrow" aria-hidden>→</span>
                        </button>
                      ))}
                    </div>
                  ) : tlm > 0 ? (
                    /* Tak ada keputusan diskret (approval/eskalasi/KPI/kontrol), tapi ada
                       program terlambat → tunjuk ke intervensi; JANGAN "all-clear" hijau. */
                    <div className="hvc__inbox-list">
                      <button type="button" className="hvc__inbox-row" data-tone="red" onClick={() => navigate('/programs')}>
                        <span className="hv__dot" data-tone="red" aria-hidden />
                        <span className="hvc__inbox-label"><strong>{tlm} program</strong> terlambat</span>
                        <span className="hvc__inbox-meta">Tinjau &amp; intervensi</span>
                        <span className="hvc__inbox-arrow" aria-hidden>→</span>
                      </button>
                    </div>
                  ) : (
                    <p className="hvc__inbox-empty"><ToneGlyph tone="green" /> Tidak ada keputusan tertunda.</p>
                  )}
                </div>
                <button type="button" className="hvc__hcard-link" onClick={() => navigate('/fokus')}>Buka Focus <span className="hvc__arrow" aria-hidden>→</span></button>
              </Card>
            </div>
          </section>

          {/* ════════════ Cockpit lengkap — semua insight, satu halaman (tanpa tab) ════════════ */}
          {<>

          {/* ═══════════════ EXECUTION COMMAND CENTER (+ rail keputusan) ═══════════════ */}
          <section className="hvc__section" aria-label="Pusat Kendali Eksekusi">
            <header className="hvc__sec-head">
              <h2 className="hvc__sec-title">Pusat Kendali Eksekusi</h2>
            </header>
            <div className="hvc__grid hvc__grid--cmd">

              {/* Horizon — workload by deadline window */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Beban tenggat</span></header>
                {horizonBars.length > 0
                  ? <Bars bars={horizonBars} height={112} rich />
                  : <p className="hvc__empty">Tidak ada program aktif bertenggat.</p>}
              </Card>

              {/* Execution Map — 3×3 progres × tekanan (digest peta) */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head">
                  <span className="hvc__eyebrow">Peta Eksekusi</span>
                  <span className="hvc__panel-hint">baris = tekanan tenggat · kolom = progres</span>
                </header>
                <ExecutionMap programs={programsForChart} onOpen={() => navigate('/programs')} />
              </Card>

              {/* Momentum — fokus ke arah tren On Track 14 hari (sinyal leading nyata);
                  gauge active-rate (dulu ~100% trivial) diturunkan jadi stat. */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head">
                  <span className="hvc__eyebrow">Momentum eksekusi</span>
                  <span className="hvc__panel-hint">tren On Track</span>
                </header>
                <div className="hvc__mtrend hvc__mtrend--hero">
                  {(() => {
                    const tv = trendValues
                    if (tv.length < 2) return <p className="hvc__empty">Tren belum cukup data.</p>
                    return (
                      <>
                        <div className="hvc__mtrend-head">
                          <span className="hvc__sub">Arah on-track</span>
                          {trendDelta != null
                            ? <Delta value={Math.round(trendDelta)} suffix=" poin" />
                            : <span className="hvc__mtrend-flat">stabil</span>}
                        </div>
                        <Sparkline values={tv} tone={leadingTone} width={300} height={52} smooth areaFill lastDot className="hvc__mtrend-spark" />
                      </>
                    )
                  })()}
                </div>
                <div className="hvc__mstats">
                  {momentumStats.map(s => (
                    <div key={s.label} className="hvc__mstat">
                      <span className="hvc__mstat-val" data-tone={s.value === 0 ? 'neutral' : s.tone} data-zero={s.value === 0 ? '' : undefined}>{s.value}{s.suffix}</span>
                      <span className="hvc__mstat-label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Eksekusi per divisi — toggle KPI/Eksekusi, 6 baris + sparkline (mockup) */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Eksekusi per divisi</span></header>
                {divRows.length > 0 ? (
                  <DivisiPanel rows={divRows} onRow={(code) => navigate(canSeePerformance ? `/performance/divisi/${code.toLowerCase()}` : '/programs')} />
                ) : (
                  <p className="hvc__empty">Belum ada data divisi.</p>
                )}
              </Card>

              {/* Decision rail dipindah ke HERO (kartu ④ "Butuh Keputusan Anda") — command
                  center kini 4 panel (tidak sesak). */}

            </div>
          </section>

          {/* ═══════════════ Mid grid ═══════════════ */}
          <section className="hvc__section">
            <div className="hvc__grid hvc__grid--mid">

              {/* Heatmap rekap program (divisi × status) */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Rekap program · per divisi</span></header>
                {heatRows.length > 0 ? (
                  <div className="hvc__heat" style={{ '--cols': heatCols.length } as CSSProperties}>
                    <span className="hvc__heat-corner" aria-hidden />
                    {heatCols.map(c => <span key={c.key} className="hvc__heat-colh">{c.label}</span>)}
                    {heatRows.map(d => (
                      <Fragment key={d.unit.code}>
                        <span className="hvc__heat-rowh" title={d.unit.name}>{d.unit.code}</span>
                        {heatCols.map(c => {
                          const v = heatVal(d, c.key)
                          return (
                            <button
                              key={`${d.unit.code}-${c.key}`}
                              type="button"
                              className="hvc__heat-cell"
                              data-tone={c.tone}
                              data-col={c.key}
                              style={{ '--i': v === 0 ? 0 : 0.18 + 0.82 * (v / heatMax) } as CSSProperties}
                              title={`${d.unit.name} · ${c.label}: ${v}`}
                              onClick={() => navigate('/programs')}
                            >
                              {v > 0 ? v : ''}
                            </button>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <p className="hvc__empty">Belum ada program untuk direkap.</p>
                )}
              </Card>

              {/* Top 5 program terlambat */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head">
                  <span className="hvc__eyebrow">Top 5 program terlambat</span>
                  <button type="button" className="hvc__link" onClick={() => navigate('/programs')}>Semua <span aria-hidden>→</span></button>
                </header>
                {top5Terlambat.length > 0 ? (
                  <div className="hvc__toplist">
                    {top5Terlambat.map((p, i) => {
                      const days = p.daysRemaining ?? 0
                      const daysLabel = days < 0 ? `${Math.abs(days)} hr lewat` : days === 0 ? 'Hari ini' : `${days} hr lagi`
                      return (
                        <button key={p.id} type="button" className="hvc__toprow" onClick={() => openProgramWorkspace(p.id)}>
                          <span className="hvc__toprank">{i + 1}</span>
                          <span className="hvc__topbody">
                            <span className="hvc__topname" title={p.name}>{p.name}</span>
                            <span className="hvc__topmeta">{p.divisi || '—'} · {p.code}{(p.priority === 'HIGH' || p.priority === 'CRITICAL') ? <span className="hvc__topprio" data-prio={p.priority}>{p.priority === 'CRITICAL' ? 'Kritis' : 'Prioritas tinggi'}</span> : null}</span>
                          </span>
                          {p.ownerName ? <span className="hvc__topowner" title={`PIC: ${p.ownerName}`} aria-label={`PIC: ${p.ownerName}`}>{initials(p.ownerName)}</span> : null}
                          <span className="hvc__topdays" data-tone="red">{daysLabel}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="hvc__empty">Tidak ada program terlambat.</p>
                )}
              </Card>

              {/* Activity timeline */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Aktivitas terbaru</span></header>
                {activity.length > 0 ? (
                  <ul className="hvc__activity">
                    {activity.map(a => {
                      const txt = activityText(a)
                      return (
                        <li key={a.id} className="hvc__act-row">
                          <span className="hvc__act-icon" data-tone={activityTone(a.action)} aria-hidden><ActivityGlyph action={a.action} /></span>
                          <span className="hvc__act-text">{txt}</span>
                          <span className="hvc__act-time" title={new Date(a.changeTimestamp).toLocaleString('id-ID')}>{relativeTime(a.changeTimestamp)}</span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="hvc__empty">Belum ada aktivitas tercatat.</p>
                )}
              </Card>
            </div>
          </section>

          {/* ═══════════════ Bottom: deadline timeline + shortcut ═══════════════ */}
          {/* Timeline kritis — horizontal date axis (mockup) */}
          <section className="hvc__section">
            <Card padding="lg" className="hvc__panel hvc__tl-card">
              <header className="hvc__panel-head">
                <span className="hvc__eyebrow">Tenggat kritis · program aktif</span>
                <button type="button" className="hvc__link" onClick={() => navigate('/programs')}>Semua <span aria-hidden>→</span></button>
              </header>
              <DeadlineTimeline programs={topDeadlinePrograms} onOpen={openProgramWorkspace} />
            </Card>
          </section>

          {/* Shortcut — chip ringkas (bukan kartu besar; pelengkap, bukan duplikat sidebar) */}
          <section className="hvc__section">
            <div className="hvc__shortcuts hvc__shortcuts--chips">
              <span className="hvc__shortcuts-lead">Pintasan</span>
              {shortcuts.map(s => (
                <button key={s.label} type="button" className="hvc__shortcut" data-tone={s.tone} onClick={s.onClick}>
                  <span className="hvc__shortcut-icon" data-tone={s.tone}><ShortcutIcon name={s.icon} /></span>
                  <span className="hvc__shortcut-label">{s.label}</span>
                </button>
              ))}
            </div>
          </section>

          </>}

        </div>
      </div>
    </>
  )
}
