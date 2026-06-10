import { Fragment, useState, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useAuth } from '../hooks/useAuth'
import {  SectionState } from '../components/ui'
import { Card, Sparkline, Meter, Delta, Bars, Gauge, Tooltip } from '../design-system'
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
  if (h < 11) return 'Good morning'
  if (h < 15) return 'Good afternoon'
  return 'Good evening'
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

function direkturSlug(kode: string): string {
  return kode.toLowerCase()
}

/* Relative time for the activity feed — "just now / 3h ago / 2d ago". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const m = Math.floor((Date.now() - then) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

const ENTITY_LABEL: Record<string, string> = {
  Program: 'program', WorkItem: 'task', Task: 'task', Meeting: 'meeting',
  ProgressLog: 'progress', Blocker: 'blocker', Assignment: 'assignment',
  EscalationRequest: 'escalation', MeetingActionItem: 'action item',
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

/* Status glyph — check (aman) / triangle-! (hati-hati) / circle-! (kritis). Tone
 * carried by currentColor; neutral falls back to a dot.
 * Merah PAKAI lingkaran-seru (alert), BUKAN silang "X" — "X" telanjang
 * dibaca sbg tombol "close/tutup", bukan tanda bahaya. (fix Jun 2026) */
function ToneGlyph({ tone }: { tone: Tone }) {
  const p = {
    width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2.4,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  if (tone === 'green') return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>
  if (tone === 'amber') return <svg {...p}><path d="M12 3 L22 20 L2 20 Z" /><line x1="12" y1="10" x2="12" y2="14" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></svg>
  if (tone === 'red') return <svg {...p}><circle cx="12" cy="12" r="9" /><line x1="12" y1="7.5" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.6" fill="currentColor" /></svg>
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

/* ─── InfoHint — ikon info kecil + tooltip; menggantikan legend inline yang
 * memadati panel-head. Penjelasan simbol/sumbu muncul saat hover/focus. */
function InfoHint({ content }: { content: string }) {
  return (
    <Tooltip content={content} className="hvc__infohint">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="4.7" r="0.95" fill="currentColor" />
        <rect x="7.28" y="6.6" width="1.44" height="5" rx="0.72" fill="currentColor" />
      </svg>
    </Tooltip>
  )
}

/* ─── Execution Map — compact 3×3 grid: progress band × time-pressure band,
 * each cell = program count (mockup "Execution Map"). A digest of the scatter
 * Peta Portfolio: same two axes, bucketed for at-a-glance density. */
function ExecutionMap({ programs, onOpen }: {
  programs: Array<{ progressPercent: number; daysRemaining: number | null; healthTone: string }>
  onOpen: (href: string) => void
}) {
  // rows = time-pressure (Tinggi/Sedang/Rendah), cols = progress (Awal/Tengah/Akhir)
  const grid = [0, 1, 2].map(() => [0, 0, 0])
  const pressRow = (d: number | null) => d == null ? 2 : d < 0 || d <= 30 ? 0 : d <= 90 ? 1 : 2
  const progCol = (p: number) => p < 34 ? 0 : p < 67 ? 1 : 2
  programs.forEach(p => { grid[pressRow(p.daysRemaining)][progCol(p.progressPercent)]++ })
  const max = Math.max(1, ...grid.flat())
  const rowLabels = ['High', 'Medium', 'Low']
  // Composite deep-link (Tier 3): baris pressure → token ?deadline (bisa >1),
  // kolom progress → token ?progress. Selaras bucket di ProgramsView.
  // Catatan: baris Low juga mencakup program tanpa tenggat (pressRow null→2); filter
  // gt90 tak menyertakannya → hitungan Low bisa sedikit beda bila ada program no-deadline.
  const PRESSURE_DEADLINE = [['overdue', 'le30'], ['le60', 'le90'], ['gt90']]
  const PROGRESS_TOKEN = ['early', 'mid', 'final']
  const cellHref = (r: number, c: number) =>
    `/programs?deadline=${PRESSURE_DEADLINE[r].join(',')}&progress=${PROGRESS_TOKEN[c]}`
  // tone: high-pressure + low-progress (top-left) = danger; low-pressure + high-progress = safe
  const cellTone = (r: number, c: number): Tone => {
    const score = (2 - r) + c // 0..4
    return r === 0 && c === 0 ? 'red' : score <= 1 ? 'red' : score === 2 ? 'amber' : 'green'
  }
  return (
    <div className="hvc__xmap">
      <span className="hvc__xmap-yaxis">Deadline pressure</span>
      <div className="hvc__xmap-grid">
        {grid.map((row, r) => (
          <Fragment key={r}>
            <span className="hvc__xmap-rowh">{rowLabels[r]}</span>
            {row.map((count, c) => (
              <button key={c} type="button" className="hvc__xmap-cell" data-tone={cellTone(r, c)} data-empty={count === 0 ? '' : undefined}
                style={{ ['--i' as string]: count === 0 ? 0.05 : 0.18 + 0.82 * (count / max) } as CSSProperties}
                title={`${rowLabels[r]} pressure · ${['early','mid','final'][c]} progress: ${count} programs`}
                onClick={() => onOpen(cellHref(r, c))}>
                {count > 0
                  ? <span className="hvc__xmap-count">{count}<span className="hvc__xmap-cap">Programs</span></span>
                  : <span className="hvc__xmap-count hvc__xmap-count--zero">0<span className="hvc__xmap-cap">Programs</span></span>}
              </button>
            ))}
          </Fragment>
        ))}
        <span className="hvc__xmap-corner" aria-hidden />
        <span className="hvc__xmap-colh">Early</span>
        <span className="hvc__xmap-colh">Mid</span>
        <span className="hvc__xmap-colh">Final</span>
        <span className="hvc__xmap-xaxis">Progress</span>
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
/* ─── Horizontal deadline timeline — date axis with stop markers (mockup
 * "Timeline Deadline Kritis"). Programs plotted as nodes on a baseline,
 * spaced by sequence; each node = date + program label, colored by urgency. */
type TLProg = { id: number; code: string; name: string; daysRemaining: number | null; targetEndDate?: string | null; divisi: string; healthTone: string }
const TL_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Deep-link ke /programs ter-filter. ProgramsView mengenal (sejak Tier 1–3 2026-06-02):
//   ?status=on_track|at_risk|terlambat (health), ?completed=1 (lifecycle),
//   ?division=CODE, ?deadline=overdue|le30|le60|le90|gt90, ?progress=early|mid|final.
// Tiap filter tampil sbg chip clearable di ProgramsView.
const PROGRAM_STATUS_PART: Record<string, string> = {
  onTrack: 'status=on_track',
  atRisk: 'status=at_risk',
  tlm: 'status=terlambat',
  terlambat: 'status=terlambat',
  selesai: 'completed=1',
}
// key = kolom status/health (atau 'selesai'); divisionCode opsional (mis. "DKSA-HLD").
const programsHref = (key?: string, divisionCode?: string) => {
  const parts: string[] = []
  const statusPart = key ? PROGRAM_STATUS_PART[key] : undefined
  if (statusPart) parts.push(statusPart)
  const div = divisionCode ? divisionCode.split('-')[0] : ''
  if (div) parts.push(`division=${div}`)
  return parts.length ? `/programs?${parts.join('&')}` : '/programs'
}
// Label bar Deadlines → token ?deadline. Cocokkan prefix (tak bentrok:
// "61–90"→61, "90+"→90). "No deadline" → null (tanpa filter).
const DEADLINE_PREFIX: Array<[string, string]> = [['Overdue', 'overdue'], ['≤', 'le30'], ['31', 'le60'], ['61', 'le90'], ['90', 'gt90']]
const deadlineToken = (label: string) => DEADLINE_PREFIX.find(([p]) => label.startsWith(p))?.[1] ?? null

function DeadlineTimeline({ programs, onOpen }: { programs: TLProg[]; onOpen: (id: number) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (t: number) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(t) ? next.delete(t) : next.add(t)
    return next
  })
  const dated = programs.filter(p => p.targetEndDate && p.daysRemaining != null)
  if (dated.length === 0) return <p className="hvc__empty">No active programs with deadlines.</p>
  const fmt = (t: number) => { const d = new Date(t); return `${d.getDate()} ${TL_MON[d.getMonth()]}` }
  // Overdue = merah; upcoming dekat (≤30h) = amber; jauh = hijau. Membedakan
  // "terlambat" dari "akan jatuh tempo" di sumbu yang sama.
  const toneOf = (days: number): Tone => days < 0 ? 'red' : days <= 30 ? 'amber' : 'green'
  const daysLabelOf = (days: number) => days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`
  // Ringkasan divisi untuk baris tanggal padat — kode pendek unik, cap 4.
  const shortDiv = (d: string) => (d || '').split('-')[0]
  const divSummary = (items: TLProg[]) => {
    const uniq = [...new Set(items.map(p => shortDiv(p.divisi)).filter(Boolean))]
    return uniq.length <= 4 ? uniq.join(' · ') : `${uniq.slice(0, 4).join(' · ')} +${uniq.length - 4}`
  }

  // Kelompokkan per TANGGAL (granularity hari). Banyak program berbagi tenggat
  // akhir-bulan → tanpa grouping, pin menumpuk jadi menara. Satu tanggal = satu
  // penanda dengan badge jumlah. Pilih tanggal TER-DEKAT hari ini (kedua arah),
  // lalu tampilkan kronologis. Sumbu selalu mencakup hari ini sebagai penambat,
  // jadi cluster overdue terbaca "di kiri (lewat)", upcoming "di kanan".
  const byDay = new Map<number, { t: number; days: number; items: TLProg[] }>()
  for (const p of dated) {
    const d = new Date(p.targetEndDate as string)
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const g = byDay.get(t)
    if (g) g.items.push(p)
    else byDay.set(t, { t, days: p.daysRemaining as number, items: [p] })
  }
  const groups = [...byDay.values()]
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))
    .slice(0, 8)
    .sort((a, b) => a.t - b.t)

  const todayT = Date.now()
  const domain = [...groups.map(g => g.t), todayT]
  const min = Math.min(...domain)
  const max = Math.max(...domain)
  const span = Math.max(1, max - min)
  const scaleX = (t: number) => 4 + 92 * ((t - min) / span)
  const todayPos = scaleX(todayT)
  const positions = groups.map(g => scaleX(g.t))

  // Stagger vertikal hanya saat dua tanggal terlalu berhimpit posisinya.
  const lanes = new Array<number>(groups.length).fill(0)
  const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b])
  let prevPos = -Infinity, prevLane = 0
  for (const idx of order) {
    prevLane = positions[idx] - prevPos < 5 ? Math.min(prevLane + 1, 2) : 0
    lanes[idx] = prevLane
    prevPos = positions[idx]
  }

  // Tick bulan sepanjang rentang — penambat skala nyata.
  const ticks: Array<{ pos: number; label: string }> = []
  { const dMin = new Date(min); let y = dMin.getFullYear(), m = dMin.getMonth()
    for (let k = 0; k < 14; k++) {
      const tt = new Date(y, m, 1).getTime()
      if (tt > max) break
      if (tt >= min) ticks.push({ pos: scaleX(tt), label: TL_MON[m] })
      m++; if (m > 11) { m = 0; y++ }
    } }

  return (
    <div className="hvc__tl2">
      <div className="hvc__tl2-axis" role="img" aria-label="Program deadline distribution relative to today">
        <span className="hvc__tl2-line" aria-hidden />
        {ticks.map((tk, i) => (
          <span key={i} className="hvc__tl2-tick" style={{ left: `${tk.pos}%` } as CSSProperties}>{tk.label}</span>
        ))}
        <span className="hvc__tl2-today" style={{ left: `${todayPos}%` } as CSSProperties} aria-hidden>
          <span className="hvc__tl2-today-label">Today</span>
        </span>
        {groups.map((g, i) => {
          const tone = toneOf(g.days)
          const n = g.items.length
          const label = `${fmt(g.t)} · ${daysLabelOf(g.days)} · ${n > 1 ? `${n} programs` : g.items[0].name}`
          return (
            <button key={g.t} type="button" className="hvc__tl2-dot" data-tone={tone}
              style={{ left: `${positions[i]}%`, ['--lane' as string]: lanes[i] } as CSSProperties}
              title={label} aria-label={label}
              onClick={() => onOpen(g.items[0].id)}>
              <span className="hvc__tl2-num">{n}</span>
            </button>
          )
        })}
      </div>
      {/* List collapsible PER-TANGGAL. Tanggal isi-1 = baris program langsung.
          Tanggal padat = baris ringkas "N programs · divisi · Xd overdue" yg di-expand
          on-demand → ringkas (30+ baris → ~8) tapi komprehensif: jumlah, divisi, &
          tingkat keterlambatan selalu terlihat; nama lengkap sekali klik. Pin "N" di
          sumbu = jumlah program di klaster itu (1:1 dgn baris). */}
      <ol className="hvc__tl2-list">
        {groups.map(g => {
          const tone = toneOf(g.days)
          const n = g.items.length
          if (n === 1) {
            const p = g.items[0]
            return (
              <li key={g.t} className="hvc__tl2-grp">
                <button type="button" className="hvc__tl2-row" onClick={() => onOpen(p.id)}>
                  <span className="hvc__tl2-rdot" data-tone={tone} aria-hidden />
                  <span className="hvc__tl2-rdate" data-tone={tone}>{fmt(g.t)}</span>
                  <span className="hvc__tl2-rname" title={p.name}>{p.name}</span>
                  <span className="hvc__tl2-rmeta">{p.divisi || '—'}</span>
                  <span className="hvc__tl2-rdays" data-tone={tone}>{daysLabelOf(g.days)}</span>
                </button>
              </li>
            )
          }
          const open = expanded.has(g.t)
          return (
            <Fragment key={g.t}>
              <li className="hvc__tl2-grp">
                <button type="button" className="hvc__tl2-row hvc__tl2-row--group" aria-expanded={open}
                  onClick={() => toggle(g.t)}>
                  <span className="hvc__tl2-rdot" data-tone={tone} aria-hidden />
                  <span className="hvc__tl2-rdate" data-tone={tone}>{fmt(g.t)}</span>
                  <span className="hvc__tl2-rgroup">
                    <span className="hvc__tl2-rcount">{n} programs</span>
                    <span className="hvc__tl2-rdiv" title={divSummary(g.items)}>{divSummary(g.items)}</span>
                  </span>
                  <span className="hvc__tl2-rdays" data-tone={tone}>{daysLabelOf(g.days)}</span>
                  <span className={`hvc__tl2-chev${open ? ' is-open' : ''}`} aria-hidden>›</span>
                </button>
              </li>
              {open && g.items.map(p => (
                <li key={p.id} className="hvc__tl2-sub">
                  <button type="button" className="hvc__tl2-row hvc__tl2-row--sub" onClick={() => onOpen(p.id)}>
                    <span className="hvc__tl2-rdot" aria-hidden style={{ visibility: 'hidden' }} />
                    <span className="hvc__tl2-rdate" />
                    <span className="hvc__tl2-rname" title={p.name}>{p.name}</span>
                    <span className="hvc__tl2-rmeta">{p.divisi || '—'}</span>
                    <span className="hvc__tl2-rdays" />
                  </button>
                </li>
              ))}
            </Fragment>
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
        <div className="hv hv--cockpit hvc__sk" aria-busy="true" aria-label="Loading dashboard">
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
            title="Dashboard data unavailable"
            text="Couldn't load the portfolio summary. Try refreshing — if it persists, check the server connection."
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

  /* ── Derived figures (all from existing payload) ─────────────── */
  const tlm = summary.terlambat + summary.overdue
  const criticalControlCount = (controls ?? []).filter(
    c => c.severity === 'CRITICAL' || c.severity === 'HIGH'
  ).length
  const draftPipeline = Math.max(summary.total - summary.onTrack - summary.atRisk - tlm - summary.selesai, 0)
  const activeProgramCount = summary.onTrack + summary.atRisk + tlm
  const onTrackPct = activeProgramCount > 0 ? Math.round((summary.onTrack / activeProgramCount) * 100) : 0
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
  const _kpiDiverges = hasKpi && kpiHeadline >= 100 && leadingTone === 'red'

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
  const _statusLabel = statusTone === 'green' ? 'Under Control' : statusTone === 'amber' ? 'Attention' : 'Action'
  const aksiTone: Tone = decisionCount > 0 ? (belowTargetCount > 0 ? 'red' : 'amber')
    : tlm > 0 ? 'amber' : 'green'

  /* ── Exception list (only what needs a decision) ─────────────── */
  type Exc = { id: string; tone: Tone; label: ReactNode; meta?: string; onClick: () => void }
  const exceptions: Exc[] = []
  if (canSeePerformance && belowTargetCount > 0) {
    const f = scorecard.belowTarget[0]
    exceptions.push({
      id: 'kpi', tone: 'red',
      label: <><strong>{belowTargetCount} KPI</strong> below target</>,
      meta: `${f.nama} · ${f.nilai.toFixed(1)}%`, onClick: () => navigate(kpiRowUrl(f.kode)),
    })
  }
  if (needsAction.length > 0) {
    exceptions.push({
      id: 'na', tone: 'amber',
      label: <><strong>{needsAction.length} items</strong> awaiting decision</>,
      meta: 'Approvals, escalations & support', onClick: () => navigate('/fokus'),
    })
  }
  if (criticalControlCount > 0) {
    exceptions.push({
      id: 'cc', tone: 'amber',
      label: <><strong>{criticalControlCount} critical controls</strong> open</>,
      meta: 'CRITICAL/HIGH risk', onClick: () => navigate('/programs'),
    })
  }

  /* ── Stable snapshot series (drop bootstrap days) ────────────── */
  // Buang snapshot "bootstrap" — hari saat portfolio masih ~kosong (total ≪ sekarang,
  // mis. baru 1 program di-snapshot, pctOnTrack=100) lalu terjun ke nilai riil. Tanpa
  // filter ini, delta first→last jadi artefak seed (mis. −71 poin), bukan tren nyata.
  // Bandingkan hanya periode dengan skala portfolio sebanding. (Jun 2026)
  // `stableSeries` dipakai sparkline terlambat di hero KPI card.
  const latestTotal = trendSeries.length ? trendSeries[trendSeries.length - 1].total : 0
  const stableSeries = trendSeries.filter(t => t.total >= Math.max(2, latestTotal * 0.5))

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
  const _overdueMax = Math.max(1, ...overdueRows.map(d => d.value))

  /* ── Command-center: Momentum = THROUGHPUT NYATA ─────────────────
   * Momentum kini menjawab SATU pertanyaan: seberapa cepat kerja selesai.
   * Sumber = weeklyThroughput (task selesai per minggu ISO, keyed `actualCompletion`),
   * BUKAN updatedAt. Versi lama mencampur 3 sinyal tak nyambung & menyesatkan:
   *  • Sparkline on-track% → itu STATUS/health, sudah ada di HUD ring + heatmap,
   *    dan ke-render merah-flat = kesan "error" (sinyal salah).
   *  • 'Completed · 30d' (programsCompletedLast30d) → ARTEFAK: seluruh program
   *    COMPLETED di-bulk-stamp updatedAt di satu tanggal seed → angka jendela 30d
   *    bisa loncat 30↔0 tanpa progres riil. Cacat sama dgn 'Programs moving'/'Stalled'
   *    yang sudah dibuang dulu.
   * Hasil: 1 cerita = bar throughput mingguan + angka pekan ini + delta vs pekan lalu. */
  const throughput = momentum?.weeklyThroughput ?? []
  const thisWeekDone = throughput.length ? throughput[throughput.length - 1].count : 0
  const lastWeekDone = throughput.length >= 2 ? throughput[throughput.length - 2].count : 0
  const throughputDelta = throughput.length >= 2 ? thisWeekDone - lastWeekDone : null
  const throughputTotal = throughput.reduce((s, w) => s + w.count, 0)
  const throughputBars = throughput.map(w => ({
    label: w.label,
    value: w.count,
    tone: 'green' as Tone,
    valueLabel: String(w.count),
  }))

  /* ── Mid: Heatmap rekap program (divisi × status) ────────────── */
  const heatRows = [...byDivisi]
    .filter(d => d.unit.id !== null && d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
  const heatCols: Array<{ key: 'onTrack' | 'atRisk' | 'tlm' | 'selesai'; label: string; tone: Tone }> = [
    { key: 'onTrack', label: 'On Track', tone: 'green' },
    { key: 'atRisk', label: 'At Risk', tone: 'amber' },
    { key: 'tlm', label: 'Delayed', tone: 'red' },
    { key: 'selesai', label: 'Completed', tone: 'neutral' },
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
    { icon: 'meeting', label: 'Meetings', tone: 'neutral', onClick: () => navigate('/jadwal') },
    canSeePerformance
      ? { icon: 'performance', label: 'Performance', tone: 'green', onClick: () => navigate('/performance/scorecard') }
      : { icon: 'workboard', label: 'Assignment', tone: 'neutral', onClick: () => navigate('/penugasan') },
  ]

  /* ── Hero stat chips ─────────────────────────────────────────── */
  const _heroStats: Array<{ val: number; label: string; tone: Tone; onClick: () => void }> = [
    { val: tlm, label: 'Delayed programs', tone: tlm > 0 ? 'red' : 'green', onClick: () => navigate('/programs') },
    { val: summary.selesai, label: 'Completed', tone: 'green', onClick: () => navigate('/programs') },
    { val: summary.total, label: 'Total programs', tone: 'neutral', onClick: () => navigate('/programs') },
    { val: exceptionCount, label: 'Needs action', tone: exceptionCount > 0 ? 'amber' : 'green', onClick: () => navigate('/fokus') },
  ]

  /* ── Below-the-fold detail data (unchanged sources) ──────────── */
  const datedPrograms = programsForChart
    .filter(p => p.daysRemaining != null && p.healthTone !== 'selesai')
  // Usia tertinggal terburuk — konteks severity untuk kartu Delayed. Sumber baru
  // (bukan dup "awaiting decision" yang sudah dibawa kartu ④ Needs Your Decision).
  const minDays = datedPrograms.length ? Math.min(...datedPrograms.map(p => p.daysRemaining as number)) : 0
  const oldestOverdueDays = minDays < 0 ? Math.abs(minDays) : null
  // Feed timeline = semua program bertanggal; DeadlineTimeline yang mengelompokkan
  // per tanggal + memilih tanggal ter-dekat hari ini (kedua arah). Lihat komponen.

  /* ── Verdict — editorial lead: the one-line state + WHY (reframes a green
   * lagging KPI against the leading execution risk). All from existing data. */
  const verdictLabel = statusTone === 'red' ? 'Action needed' : statusTone === 'amber' ? 'Attention' : 'Under control'
  // Compact metric-led layout (pilihan user 2026-06-02): judul ringkas + count,
  // lalu baris metrik kontras (KPI lagging ⟷ eksekusi leading) menggantikan
  // kalimat naratif panjang yang dulu sulit dibaca di layar sempit.
  const verdictHeadDetail = tlm > 0
    ? `${tlm} programs delayed`
    : exceptionCount > 0
      ? `${exceptionCount} items to decide`
      : 'all on plan'
  const verdictCta = tlm > 0 ? `Review ${tlm} programs` : exceptionCount > 0 ? 'Open Focus' : 'View programs'
  const verdictHref = tlm > 0 ? '/programs' : exceptionCount > 0 ? '/fokus' : '/programs'
  // Metric contrast signs — lagging (KPI result) vs leading (execution on-track%).
  const kpiSign = kpiTone === 'green' ? '✓ above target' : kpiTone === 'amber' ? 'near target' : '↓ below target'
  const execSign = leadingTone === 'green' ? '✓ on track' : leadingTone === 'amber' ? 'steady' : '↓ lagging'

  /* ── Portofolio scope — jawab "apa yang saya kelola & berapa" (data: scope+summary,
   * sebelumnya tak dirender). Active = berjalan (on-track+at-risk+telat), bukan selesai/draft. */
  const scopeName = scope?.level === 'portfolio' ? 'PTPN III Portfolio' : (scope?.name ?? 'Your Portfolio')
  const scopeUnitLabel = scope?.level === 'portfolio' ? 'directorates' : 'divisions'
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
    ? `${topOver.code} accounts for ${Math.round((topOver.over / totalOverAll) * 100)}% of delays`
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
              <span className="hv__greeting-name">{currentUser?.name ?? 'there'}</span>
            </h1>
            <span className="hvc__scope">
              {scopeName} · <b>{summary.total} programs</b>
              {scope?.unitCount ? <> · {scope.unitCount} {scopeUnitLabel}</> : null}
              {' · '}<b>{activeCount}</b> active
              {draftPipeline > 0 ? <> · {draftPipeline} draft</> : null}
            </span>
          </header>

          {/* ═══════════════ VERDICT — editorial lead (state + why + action) + intel ═══════════════ */}
          <div className="hvc__verdict-card" data-tone={statusTone}>
          <button type="button" className="hvc__verdict-main" data-tone={statusTone} onClick={() => navigate(verdictHref)}>
            <span className="hvc__verdict-icon" data-tone={statusTone}><ToneGlyph tone={statusTone} /></span>
            <span className="hvc__verdict-headline">
              <span className="hvc__verdict-label" data-tone={statusTone}>{verdictLabel}</span>
              <span className="hvc__verdict-detail">— {verdictHeadDetail}</span>
            </span>
            <span className="hvc__verdict-cta">{verdictCta}<span className="hvc__arrow" aria-hidden>→</span></span>
          </button>

          {/* Metric contrast — lagging (KPI result) ⟷ leading (execution on-track%) */}
          {(hasKpi || activeProgramCount > 0) && (
            <div className="hvc__verdict-metrics">
              {hasKpi && (
                <span className="hvc__vmetric" data-tone={kpiTone}>
                  <span className="hvc__vmetric-k">KPI</span> <b>{kpiHeadline.toFixed(1)}%</b> <span className="hvc__vmetric-s">{kpiSign}</span>
                </span>
              )}
              {activeProgramCount > 0 && (
                <span className="hvc__vmetric" data-tone={leadingTone}>
                  <span className="hvc__vmetric-k">Execution</span> <b>{onTrackPct}%</b> <span className="hvc__vmetric-s">{execSign}</span>
                </span>
              )}
            </div>
          )}

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
                  Dec KPI forecast <b>≈{forecast.value.toFixed(1)}%</b> <span className="hvc__intel-delta" data-tone={forecast.tone}>({forecast.deltaVsTarget >= 0 ? '+' : ''}{forecast.deltaVsTarget.toFixed(1)} vs target)</span>
                </span>
              )}
              {hasDelta && (
                <span className="hvc__intel-seg hvc__intel-seg--delta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a9 9 0 1 1-2.6-6.4" /><polyline points="21 3 21 8 16 8" /></svg>
                  <span className="hvc__intel-deltawrap">vs {Math.abs(velDays!)}d ago:{velLate != null && velLate !== 0 && <b data-tone={velLate > 0 ? 'red' : 'green'}>{velLate > 0 ? '+' : ''}{velLate} delayed</b>}{velOn != null && velOn !== 0 && <b data-tone={velOn > 0 ? 'green' : 'red'}>{velOn > 0 ? '+' : ''}{velOn} On Track</b>}</span>
                </span>
              )}
            </div>
          )}
          </div>

          {/* ═══════════════ HERO — KPI dominan · Eksekusi · Tertinggal · Keputusan ═══════════════ */}
          <section className="hvc__maphero" aria-label="Summary">
            <div className="hvc__hud">
              {/* ① KPI achievement — big number + delta + embedded flowing trend */}
              {canSeePerformance && hasKpi && (
                <Card padding="none" className="hvc__hcard hvc__hcard--kpi" data-tone={kpiTone}>
                  <div className="hvc__hcard-body">
                    <span className="hvc__hcard-eyebrow">KPI Achievement · {scorecard.periodeLabel} <InfoHint content="Latest available scorecard period — KPI is reported roughly one month in arrears, so this trails the current month." /></span>
                    <div className="hvc__kpi-split">
                      <div className="hvc__kpi-left">
                        <div className="hvc__hcard-figure">
                          <span className="hvc__hcard-big" data-tone={kpiTone}><CountUp value={kpiHeadline} decimals={1} /><span className="hvc__hcard-unit">%</span></span>
                          {scorecard.avgDelta != null && <Delta value={scorecard.avgDelta} suffix=" pts" />}
                        </div>
                        <span className="hvc__hcard-foot">vs target 100</span>
                      </div>
                      {hasKpiDivisi && (
                        <div className="hvc__kpi-divbars">
                          {kpiRows.slice(0, 3).map(d => {
                            const t = scoreTone(d.nilai)
                            return (
                              <button key={d.kode} type="button" className="hvc__kpi-divbar hvc__kpi-divbar--btn"
                                title={`${d.nama}: ${d.nilai.toFixed(1)}% — buka KPI divisi`}
                                onClick={() => navigate(`/performance/divisi/${shortCode(d.kode).toLowerCase()}`)}>
                                <span className="hvc__kpi-divbar-name" title={d.nama}>{shortCode(d.kode)}</span>
                                <Meter className="hvc__kpi-divbar-meter" value={d.nilai} max={120} target={100} tone={t} height={6} aria-label={`${d.nama}: ${d.nilai.toFixed(1)}%`} />
                                <span className="hvc__kpi-divbar-val" data-tone={t}>{d.nilai.toFixed(1)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Embedded trend only when genuinely multi-month — a 2–3 point
                      monthly KPI series renders as a stray diagonal "slash" that
                      reads as an error. Sparse data → no spark (divisi bars carry it). */}
                  {kpiSpark.length >= 4 && (
                    <div className="hvc__hcard-spark"><Sparkline values={kpiSpark} tone={kpiTone} width={340} height={48} smooth lastDot={false} /></div>
                  )}
                  <button type="button" className="hvc__hcard-link" onClick={() => navigate('/performance/scorecard')}>View scorecard <span className="hvc__arrow" aria-hidden>→</span></button>
                </Card>
              )}

              {/* ② Execution health — arc gauge + legend */}
              <Card padding="none" className="hvc__hcard hvc__hcard--exec" data-tone={programTone}>
                <div className="hvc__hcard-body">
                  <span className="hvc__hcard-eyebrow">Execution Health</span>
                  <div className="hvc__hcard-exec-row">
                    <Gauge value={onTrackPct} max={100} tone={leadingTone} size={84} thickness={9} valueText={`${onTrackPct}`} unit="%" label="on track" rich className="hvc__execgauge" />
                    <ul className="hvc__hcard-legend">
                      <li><button type="button" className="hvc__legend-btn" onClick={() => navigate(programsHref('onTrack'))}><i className="hvc__dot" data-tone="green" />On Track<b>{summary.onTrack}</b></button></li>
                      <li><button type="button" className="hvc__legend-btn" onClick={() => navigate(programsHref('atRisk'))}><i className="hvc__dot" data-tone="amber" />At Risk<b>{summary.atRisk}</b></button></li>
                      <li><button type="button" className="hvc__legend-btn" onClick={() => navigate(programsHref('tlm'))}><i className="hvc__dot" data-tone="red" />Delayed<b>{tlm}</b></button></li>
                      <li><button type="button" className="hvc__legend-btn" onClick={() => navigate(programsHref('selesai'))}><i className="hvc__dot" data-tone="neutral" />Completed<b>{summary.selesai}</b></button></li>
                    </ul>
                  </div>
                </div>
                <button type="button" className="hvc__hcard-link" onClick={() => navigate('/programs')}>View details <span className="hvc__arrow" aria-hidden>→</span></button>
              </Card>

              {/* ③ Program tertinggal — big number + embedded area trend */}
              <button type="button" className="ds-card hvc__hcard hvc__hcard--late" data-tone={tlm > 0 ? 'red' : 'green'} onClick={() => navigate('/programs?status=terlambat')}>
                <div className="hvc__hcard-body">
                  <span className="hvc__hcard-eyebrow">Delayed Programs</span>
                  <span className="hvc__hcard-big" data-tone={tlm > 0 ? 'red' : 'green'}><CountUp value={tlm} /></span>
                  <span className="hvc__hcard-foot">{oldestOverdueDays != null ? `oldest ${oldestOverdueDays}d overdue` : `${summary.atRisk} at risk`}</span>
                </div>
                {(() => {
                  const lt = stableSeries.slice(-14).map(t => t.terlambat)
                  return lt.length >= 4
                    ? <div className="hvc__hcard-spark"><Sparkline values={lt} tone="red" width={340} height={48} smooth lastDot={false} /></div>
                    : null
                })()}
                <span className="hvc__hcard-link hvc__hcard-link--static">View list <span className="hvc__arrow" aria-hidden>→</span></span>
              </button>

              {/* ④ Decision Inbox — keputusan yang menunggu Anda (naik dari command center
                  ke hero: ini pekerjaan inti direktur). Mengganti kartu Selisih; ceritanya
                  kini dibawa Verdict di atas. */}
              <Card padding="none" className="hvc__hcard hvc__hcard--inbox" data-tone={aksiTone}>
                <div className="hvc__hcard-body hvc__inbox-body">
                  <div className="hvc__inbox-head">
                    <span className="hvc__hcard-eyebrow">Needs Your Decision</span>
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
                        <span className="hvc__inbox-label"><strong>{tlm} programs</strong> delayed</span>
                        <span className="hvc__inbox-meta">Review &amp; act</span>
                        <span className="hvc__inbox-arrow" aria-hidden>→</span>
                      </button>
                    </div>
                  ) : (
                    <p className="hvc__inbox-empty"><ToneGlyph tone="green" /> No pending decisions.</p>
                  )}
                </div>
                <button type="button" className="hvc__hcard-link" onClick={() => navigate('/fokus')}>Open Focus <span className="hvc__arrow" aria-hidden>→</span></button>
              </Card>
            </div>
          </section>

          {/* ════════════ Cockpit lengkap — semua insight, satu halaman (tanpa tab) ════════════ */}
          {<>

          {/* ═══════════════ EXECUTION COMMAND CENTER (+ rail keputusan) ═══════════════ */}
          <section className="hvc__section" aria-label="Execution Command Center">
            <header className="hvc__sec-head">
              <h2 className="hvc__sec-title">Execution Command Center</h2>
            </header>
            <div className="hvc__grid hvc__grid--cmd">

              {/* Horizon — workload by deadline window */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head">
                  <span className="hvc__panel-title">
                    <span className="hvc__eyebrow">Deadlines</span>
                    <InfoHint content="Red bar = past due · rest = upcoming" />
                  </span>
                </header>
                {horizonBars.length > 0
                  ? <Bars bars={horizonBars} height={112} rich onBarClick={(b) => { const dl = deadlineToken(b.label); navigate(dl ? `/programs?deadline=${dl}` : '/programs') }} />
                  : <p className="hvc__empty">No active programs with deadlines.</p>}
              </Card>

              {/* Execution Map — 3×3 progres × tekanan (digest peta) */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head">
                  <span className="hvc__eyebrow">Execution Map</span>
                </header>
                <ExecutionMap programs={programsForChart} onOpen={(href) => navigate(href)} />
              </Card>

              {/* Momentum = THROUGHPUT NYATA — task selesai per minggu (8 minggu,
                  dari actualCompletion). Span 2 kolom: ruang untuk bar time-series,
                  sambil align 4-kolom dgn HUD di atas. Sinyal on-track% (status) sengaja
                  TIDAK di sini — sudah ada di HUD ring + heatmap; di sini = kecepatan. */}
              <Card padding="lg" className="hvc__panel hvc__panel--wide">
                <header className="hvc__panel-head">
                  <span className="hvc__panel-title">
                    <span className="hvc__eyebrow">Momentum</span>
                    <InfoHint content="Tasks completed per week — real execution throughput over the last 8 weeks" />
                  </span>
                </header>
                {throughputTotal > 0 ? (
                  <>
                    <div className="hvc__mtrend-head">
                      <span className="hvc__mthead-val">
                        <span className="hvc__mthead-num" data-zero={thisWeekDone === 0 ? '' : undefined}>{thisWeekDone}</span>
                        <span className="hvc__sub">tasks done · this week</span>
                      </span>
                      {throughputDelta != null && throughputDelta !== 0
                        ? <Delta value={throughputDelta} suffix=" vs last wk" />
                        : <span className="hvc__mtrend-flat">no change vs last wk</span>}
                    </div>
                    <Bars
                      bars={throughputBars}
                      height={96}
                      rich
                      className="hvc__mbars"
                      onBarClick={() => navigate('/execution')}
                    />
                    <p className="hvc__mcaption">Tasks completed per week · last 8 weeks</p>
                  </>
                ) : (
                  <p className="hvc__empty">No tasks completed in the last 8 weeks.</p>
                )}
              </Card>

              {/* Panel "By Division" (toggle KPI/Eksekusi) DIHAPUS 2026-06-02: kolom
                  Delayed-nya identik dengan heatmap Program Summary di bawah (sumber
                  redundansi "45 delayed"). Heatmap menang — 4 status, bukan 1.
                  Command Center kini 3 panel: Deadlines · Execution Map · Momentum. */}

              {/* Decision rail dipindah ke HERO (kartu ④ "Butuh Keputusan Anda") — command
                  center kini 4 panel (tidak sesak). */}

            </div>
          </section>

          {/* ═══════════════ Mid grid ═══════════════ */}
          <section className="hvc__section">
            <div className="hvc__grid hvc__grid--mid">

              {/* Heatmap rekap program (divisi × status) */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Program Summary · by Division</span></header>
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
                              onClick={() => navigate(programsHref(c.key, d.unit.code))}
                            >
                              {v > 0 ? v : ''}
                            </button>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <p className="hvc__empty">No programs to summarize yet.</p>
                )}
              </Card>

              {/* Top 5 program terlambat */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head">
                  <span className="hvc__eyebrow">Top 5 Delayed Programs</span>
                  <button type="button" className="hvc__link" onClick={() => navigate('/programs')}>All <span aria-hidden>→</span></button>
                </header>
                {top5Terlambat.length > 0 ? (
                  <div className="hvc__toplist">
                    {top5Terlambat.map((p, i) => {
                      const days = p.daysRemaining ?? 0
                      const daysLabel = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`
                      return (
                        <button key={p.id} type="button" className="hvc__toprow" onClick={() => openProgramWorkspace(p.id)}>
                          <span className="hvc__toprank">{i + 1}</span>
                          <span className="hvc__topbody">
                            <span className="hvc__topname" title={p.name}>{p.name}</span>
                            <span className="hvc__topmeta">{p.divisi || '—'} · {p.code}{(p.priority === 'HIGH' || p.priority === 'CRITICAL') ? <span className="hvc__topprio" data-prio={p.priority}>{p.priority === 'CRITICAL' ? 'Critical' : 'High priority'}</span> : null}</span>
                          </span>
                          {p.ownerName ? <span className="hvc__topowner" title={`PIC: ${p.ownerName}`} aria-label={`PIC: ${p.ownerName}`}>{initials(p.ownerName)}</span> : null}
                          <span className="hvc__topdays" data-tone="red">{daysLabel}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="hvc__empty">No delayed programs.</p>
                )}
              </Card>

              {/* Activity timeline */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Recent Activity</span></header>
                {activity.length > 0 ? (
                  <ul className="hvc__activity">
                    {activity.map(a => {
                      const txt = activityText(a)
                      // PROGRAM (update/KPI-measured) → bisa dibuka ke workspace program.
                      // BLOCKER/TASK entityId ≠ program id → biarkan non-interaktif.
                      const canOpen = a.entityType === 'PROGRAM' && a.entityId > 0
                      const inner = (
                        <>
                          <span className="hvc__act-icon" data-tone={activityTone(a.action)} aria-hidden><ActivityGlyph action={a.action} /></span>
                          <span className="hvc__act-text">{txt}</span>
                          <span className="hvc__act-time" title={new Date(a.changeTimestamp).toLocaleString('en-US')}>{relativeTime(a.changeTimestamp)}</span>
                        </>
                      )
                      return (
                        <li key={a.id}>
                          {canOpen
                            ? <button type="button" className="hvc__act-row hvc__act-row--link" onClick={() => openProgramWorkspace(a.entityId)}>{inner}</button>
                            : <div className="hvc__act-row">{inner}</div>}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="hvc__empty">No activity recorded yet.</p>
                )}
              </Card>
            </div>
          </section>

          {/* ═══════════════ Bottom: deadline timeline + shortcut ═══════════════ */}
          {/* Timeline kritis — horizontal date axis (mockup) */}
          <section className="hvc__section">
            <Card padding="lg" className="hvc__panel hvc__tl-card">
              <header className="hvc__panel-head">
                <span className="hvc__eyebrow">Critical Deadlines · Active Programs</span>
                <button type="button" className="hvc__link" onClick={() => navigate('/programs')}>All <span aria-hidden>→</span></button>
              </header>
              <DeadlineTimeline programs={datedPrograms} onOpen={openProgramWorkspace} />
            </Card>
          </section>

          {/* Shortcut — chip ringkas (bukan kartu besar; pelengkap, bukan duplikat sidebar) */}
          <section className="hvc__section">
            <div className="hvc__shortcuts hvc__shortcuts--chips">
              <span className="hvc__shortcuts-lead">Shortcuts</span>
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
