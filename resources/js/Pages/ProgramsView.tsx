import { useState, useEffect, useCallback, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import { usePage, router } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { getProgramDisplayStatus } from '../lib/programStatus'
import {
  Avatar,
  HealthPill,
  SectionState,
  SkeletonStack,
} from '../components/ui'
import { TimelineGantt } from '../components/TimelineGantt'
import type { TimelineGanttProgram } from '../components/TimelineGantt'
import { api, extractErrorMessage } from '../lib/api'
import type { CharterPayload } from '../types/charter'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { useStrategicPillars } from '../hooks/useStrategicPillars'
import { TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import { MonitoringMatrix } from '../components/MonitoringMatrix'
import { useInlineToast } from '../components/InlineToast'
import { UserPicker } from '../components/UserPicker'
import { PageHeader } from '../design-system'
import './ProgramsView.css'

// ── Types ──────────────────────────────────────────────────────────────────

type ProgramTab = 'portfolio' | 'timeline' | 'monitoring' | 'pulse' | 'archive'
type PortfolioView = 'list' | 'kanban' | 'table' | 'map'
type TimelineView = 'lanes' | 'gantt'
type LaneGrouping = 'status' | 'priority' | 'health'

type PulseBlocker = {
  id: number; code: string; title: string; severity: string; status: string
  createdAt: string; daysOpen: number; assignedTo: number | null
  task: {
    id: number; code: string; title: string
    workstream: { id: number; name: string; program: { id: number; code: string; name: string } }
  }
}

type PulseWorkstream = {
  id: number; code: string; name: string; status: string
  progressPercent: number; healthStatus: string
  targetCompletion: string; daysRemaining: number
  program: { id: number; code: string; name: string }
  owner: { id: number; name: string } | null
}

type PulseTask = {
  id: number; code: string; title: string; status: string
  percentComplete: number; updatedAt: string; stagnantDays: number
  assignee: { id: number; name: string } | null
  workstream: { id: number; name: string; program: { id: number; code: string; name: string } }
}

type ExecutionPulse = {
  activeBlockers: PulseBlocker[]
  atRiskWorkstreams: PulseWorkstream[]
  stagnantItems: PulseTask[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_ORDER = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
const VALID_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
// Paginasi List & Table — 97 program di-render sekaligus = DOM berat + scroll
// melelahkan. Hanya 1 halaman dirender pada satu waktu.
const PORTFOLIO_PAGE_SIZE = 20

// Label chip filter window tenggat (deep-link ?deadline=), selaras bar "Deadlines" di Home.
const DEADLINE_LABEL: Record<string, string> = {
  overdue: 'Overdue', le30: '≤30 days', le60: '31–60 days', le90: '61–90 days', gt90: '90+ days',
}

const approvalBadge = (prog: { approvalStatus?: string | null; rejectionNote?: string | null }) => {
  // Rejected = DRAFT + rejectionNote populated. The literal 'REJECTED' status
  // never persists (BE reverts to DRAFT) — must check the compound or the
  // badge never renders. Check FIRST so DRAFT case below doesn't shadow it.
  if (prog.approvalStatus === 'DRAFT' && prog.rejectionNote) {
    return { label: 'Rejected', tone: 'red' as const }
  }
  switch (prog.approvalStatus) {
    case 'DRAFT':
      return { label: 'Draft', tone: 'yellow' as const }
    case 'PENDING_KASUB':
      return { label: 'Pend. Kasub', tone: 'blue' as const }
    case 'PENDING_KADIV':
      return { label: 'Pend. Kadiv', tone: 'blue' as const }
    case 'ACTIVE':
      // "Berjalan" badge konsisten dengan Board/Table tab yang pakai
      // getProgramDisplayStatus helper. Memberi sinyal jelas "ini sudah lewat
      // approval phase" — tanpa ini row ACTIVE tampil identik dengan PENDING
      // (kedua-duanya cuma punya health pill).
      return { label: 'Active', tone: 'green' as const }
    default:
      return null
  }
}

const healthStatusLabel = (status: 'GREEN' | 'YELLOW' | 'RED') => {
  if (status === 'GREEN') return 'On Track'
  if (status === 'YELLOW') return 'At Risk'
  return 'Delayed'
}

const workstreamSummaryLabel = (count: number | undefined | null) => {
  if (!count || count <= 0) return 'No workstreams yet'
  return `${count} workstream`
}

// ── Peta Programs — portfolio scatter ────────────────────────────────────
// Setiap program = satu titik di bidang dua-sumbu: X = progres (0→100%),
// Y = tekanan waktu (atas = paling mendesak). Warna titik = health asli —
// jadi mismatch langsung kelihatan (titik merah di zona "Aman", titik hijau
// di "Zona Bahaya"). Empat kuadran memberi baca cepat: pojok kiri-atas
// (mendesak + progres rendah) = klaster yang butuh perhatian. Pure SVG,
// dipindah dari peta portfolio Home — di sini fokusnya memang seluruh
// portofolio, bukan ringkasan. */
type ScatterProg = {
  id: number; code: string; name: string
  progressPercent: number
  health: 'GREEN' | 'YELLOW' | 'RED'
  days: number | null
  completed: boolean
  owner?: string | null
}

const SCATTER_HEX: Record<'GREEN' | 'YELLOW' | 'RED' | 'SELESAI', string> = {
  GREEN: 'var(--ds-green-500)',
  YELLOW: 'var(--ds-amber-500)',
  RED: 'var(--ds-red-500)',
  SELESAI: '#94A3B8',
}

function ProgramScatter({ programs, onOpen }: {
  programs: ScatterProg[]
  onOpen: (id: number) => void
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  // Geometri plot — viewBox tetap, scale 100% via CSS.
  const W = 960, H = 520
  const ML = 60, MR = 28, MT = 30, MB = 54
  const plotW = W - ML - MR
  const plotH = H - MT - MB
  const xAt = (frac: number) => ML + frac * plotW
  const yAt = (frac: number) => (H - MB) - frac * plotH // frac=pressure → top mendesak

  // Tekanan waktu → fraksi vertikal [0..1]. Overdue di rim atas, tanpa tenggat
  // & selesai di dasar. Continuous biar sebaran lebih jujur dari sekadar bucket.
  const pressureFrac = (days: number | null, completed: boolean): number => {
    if (completed) return 0.05
    if (days == null) return 0.12
    if (days < 0) return 0.97
    return 0.12 + 0.78 * (1 - Math.min(days, 270) / 270)
  }

  const dots = useMemo(() => programs.map(p => {
    // Jitter deterministik dari id supaya titik bertumpuk tidak saling tutup.
    const h1 = ((p.id * 2654435761) % 97) / 97
    const h2 = ((p.id * 40503) % 89) / 89
    let fx: number, fy: number
    if (p.completed) {
      // Program selesai (100%) ditata jadi pita rapi di zona "Aman" (kanan-bawah)
      // memakai hash id — bukan tumpukan keras di satu titik pojok.
      fx = 0.86 + h1 * 0.09
      fy = 0.05 + h2 * 0.13
    } else {
      fx = p.progressPercent / 100 + (h1 - 0.5) * 0.03
      fy = pressureFrac(p.days, p.completed) + (h2 - 0.5) * 0.06
    }
    // Clamp di dalam frame dengan margin — titik & glow tak menyentuh tepi.
    fx = Math.min(0.965, Math.max(0.03, fx))
    fy = Math.min(0.95, Math.max(0.035, fy))
    const tone = p.completed ? 'SELESAI' : p.health
    return { ...p, fx, fy, x: xAt(fx), y: yAt(fy), fill: SCATTER_HEX[tone], tone }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [programs])

  // Hitung populasi per kuadran (batas di progres 50% & tekanan 50%).
  const zoneCounts = useMemo(() => {
    const c = { danger: 0, push: 0, early: 0, safe: 0 }
    dots.forEach(d => {
      const hi = d.fy >= 0.5
      const adv = d.fx >= 0.5
      if (hi && !adv) c.danger++
      else if (hi && adv) c.push++
      else if (!hi && !adv) c.early++
      else c.safe++
    })
    return c
  }, [dots])

  const midX = xAt(0.5)
  const midY = yAt(0.5)
  const hovered = dots.find(d => d.id === hoveredId) ?? null

  // Label hover — flip ke kiri bila titik dekat tepi kanan.
  const labelW = 196
  const flip = hovered ? hovered.x > W - MR - labelW - 12 : false

  return (
    <div className="program-scatter">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="program-scatter__svg"
        role="img"
        aria-label={`Map of ${programs.length} programs: ${zoneCounts.danger} in danger zone, ${zoneCounts.push} push to finish, ${zoneCounts.early} early stage, ${zoneCounts.safe} safe`}
        onMouseLeave={() => setHoveredId(null)}
      >
        <defs>
          <linearGradient id="scatter-danger" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ds-red-500)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--ds-red-500)" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="scatter-safe" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--ds-green-500)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--ds-green-500)" stopOpacity="0.01" />
          </linearGradient>
          <filter id="scatter-dotglow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Zona shading — bahaya (kiri-atas) & aman (kanan-bawah) */}
        <rect x={ML} y={MT} width={midX - ML} height={midY - MT} fill="url(#scatter-danger)" />
        <rect x={midX} y={midY} width={W - MR - midX} height={(H - MB) - midY} fill="url(#scatter-safe)" />

        {/* Frame + garis kuadran */}
        <rect x={ML} y={MT} width={plotW} height={plotH} className="program-scatter__frame" />
        <line x1={midX} y1={MT} x2={midX} y2={H - MB} className="program-scatter__div" />
        <line x1={ML} y1={midY} x2={W - MR} y2={midY} className="program-scatter__div" />

        {/* Sumbu */}
        <text x={ML} y={H - MB + 30} className="program-scatter__axt">0%</text>
        <text x={midX} y={H - MB + 30} textAnchor="middle" className="program-scatter__axt">50%</text>
        <text x={W - MR} y={H - MB + 30} textAnchor="end" className="program-scatter__axt">100%</text>
        <text x={(ML + W - MR) / 2} y={H - 8} textAnchor="middle" className="program-scatter__axlabel">Execution progress →</text>
        <text x={18} y={(MT + H - MB) / 2} className="program-scatter__axlabel" transform={`rotate(-90 18 ${(MT + H - MB) / 2})`} textAnchor="middle">↑ Time pressure</text>

        {/* Titik program */}
        {dots.map(d => {
          const dim = hoveredId != null && hoveredId !== d.id
          const active = hoveredId === d.id
          return (
            <circle
              key={d.id}
              cx={d.x} cy={d.y}
              r={active ? 8.5 : 6}
              fill={d.fill}
              fillOpacity={dim ? 0.16 : 0.62}
              stroke={d.fill}
              strokeWidth={active ? 2 : 1.4}
              strokeOpacity={dim ? 0.3 : 1}
              className="program-scatter__dot"
              filter={active ? 'url(#scatter-dotglow)' : undefined}
              onMouseEnter={() => setHoveredId(d.id)}
              onClick={() => onOpen(d.id)}
              tabIndex={0}
              role="button"
              aria-label={`${d.code} ${d.name}, progress ${d.progressPercent}%`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(d.id) } }}
            >
              <title>{d.code} · {d.name} — {d.progressPercent}%</title>
            </circle>
          )
        })}

        {/* Label kuadran + populasi — di atas titik, halo (paint-order) biar terbaca */}
        <g pointerEvents="none">
          <text x={ML + 12} y={MT + 20} className="program-scatter__zone program-scatter__zone--danger">
            Danger Zone <tspan className="program-scatter__zone-n">{zoneCounts.danger}</tspan>
          </text>
          <text x={W - MR - 12} y={MT + 20} textAnchor="end" className="program-scatter__zone program-scatter__zone--push">
            <tspan className="program-scatter__zone-n">{zoneCounts.push}</tspan> Push to Finish
          </text>
          <text x={ML + 12} y={H - MB - 12} className="program-scatter__zone program-scatter__zone--early">
            Early Stage <tspan className="program-scatter__zone-n">{zoneCounts.early}</tspan>
          </text>
          <text x={W - MR - 12} y={H - MB - 12} textAnchor="end" className="program-scatter__zone program-scatter__zone--safe">
            <tspan className="program-scatter__zone-n">{zoneCounts.safe}</tspan> Safe
          </text>
        </g>

        {/* Kartu hover — dirender terakhir agar di atas semua titik */}
        {hovered && (() => {
          const lx = flip ? hovered.x - labelW - 12 : hovered.x + 12
          const ly = Math.min(Math.max(hovered.y - 30, MT + 4), H - MB - 70)
          const daysTxt = hovered.completed
            ? 'Completed'
            : hovered.days == null ? 'No deadline'
            : hovered.days < 0 ? `${Math.abs(hovered.days)} days overdue`
            : hovered.days === 0 ? 'Due today'
            : `${hovered.days} days left`
          const name = hovered.name.length > 42 ? hovered.name.slice(0, 41) + '…' : hovered.name
          return (
            <g className="program-scatter__tip" pointerEvents="none">
              <rect x={lx} y={ly} width={labelW} height={64} rx={9} className="program-scatter__tip-bg" />
              <text x={lx + 12} y={ly + 19} className="program-scatter__tip-code">{hovered.code}</text>
              <text x={lx + 12} y={ly + 37} className="program-scatter__tip-name">{name}</text>
              <text x={lx + 12} y={ly + 54} className="program-scatter__tip-meta">
                {hovered.progressPercent}% · {daysTxt}
              </text>
            </g>
          )
        })()}
      </svg>

      <div className="program-scatter__legend">
        <span className="program-scatter__legend-item"><i style={{ background: SCATTER_HEX.GREEN }} /> On Track</span>
        <span className="program-scatter__legend-item"><i style={{ background: SCATTER_HEX.YELLOW }} /> At Risk</span>
        <span className="program-scatter__legend-item"><i style={{ background: SCATTER_HEX.RED }} /> Delayed</span>
        <span className="program-scatter__legend-item"><i style={{ background: SCATTER_HEX.SELESAI }} /> Completed</span>
        <span className="program-scatter__legend-hint">Click a point to open the program</span>
      </div>
    </div>
  )
}

// ── Pager — paginasi diskrit untuk List/Table ────────────────────────────
// Window nomor halaman dengan ellipsis (1 … 3 4 5 … 9) supaya tetap ringkas
// walau jumlah halaman banyak. Sembunyikan saat hanya 1 halaman.
function Pager({ page, pageCount, total, pageSize, onPage }: {
  page: number; pageCount: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  if (pageCount <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const win = 1
  const nums: (number | 'gap')[] = []
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - win && i <= page + win)) nums.push(i)
    else if (nums[nums.length - 1] !== 'gap') nums.push('gap')
  }
  return (
    <nav className="programs-pager" aria-label="Program pagination">
      <span className="programs-pager__range">
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> programs
      </span>
      <div className="programs-pager__nav">
        <button
          type="button" className="programs-pager__btn"
          disabled={page <= 1} onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3 5 7l4 4" /></svg>
        </button>
        {nums.map((n, i) => n === 'gap'
          ? <span key={`gap${i}`} className="programs-pager__gap" aria-hidden="true">…</span>
          : (
            <button
              key={n} type="button"
              className={`programs-pager__num${n === page ? ' programs-pager__num--active' : ''}`}
              aria-current={n === page ? 'page' : undefined}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          )
        )}
        <button
          type="button" className="programs-pager__btn"
          disabled={page >= pageCount} onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 3 4 4-4 4" /></svg>
        </button>
      </div>
    </nav>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

export function ProgramsView() {
  const {
    programs, kpis: _kpis, dashboard: _dashboard, selectedProgramId,
    loadOverview,
    normalizeHealthStatus, formatStatusLabel,
    currentUser, apmsKpis, programSummary,
  } = useWorkspace()

  const navigate = useInertiaNavigate()
  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const roleAccess = useRoleAccess()
  const isStrategic = role === 'BOD' || role === 'KADIV'
  const toast = useInlineToast()
  // Pilar strategis di-scope per direktorat (config pillar_directorates). Map
  // kosong → direktorat user tak memakai pilar → sembunyikan dropdown supaya
  // tidak diisi asal saat aplikasi di-expand ke direktorat lain.
  const pillarOptions = useStrategicPillars()
  const showPillarField = Object.keys(pillarOptions).length > 0

  // Pop stashed approval-success toast — di-set oleh ProgramDetailView saat
  // KADIV final-approve sebelum redirect. Lihat submitApprove() di detail.
  // Pakai sessionStorage karena toast state inline tidak survive navigasi page.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = sessionStorage.getItem('atlas:program-approved')
    if (!raw) return
    sessionStorage.removeItem('atlas:program-approved')
    try {
      const payload = JSON.parse(raw) as { id: number; name: string; at: number }
      // Stale guard: kalau set-nya >30 detik lalu, user mungkin navigated
      // lewat jalan lain — skip supaya tidak muncul toast nyasar.
      if (Date.now() - payload.at > 30_000) return
      toast.show(`Program "${payload.name}" approved · the PIC has been notified`, 'success')
    } catch { /* malformed payload — silent skip */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Tab state ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<ProgramTab>('portfolio')
  const [portfolioView, setPortfolioView] = useState<PortfolioView>('list')
  const [timelineView, setTimelineView] = useState<TimelineView>('lanes')
  const [laneGrouping, setLaneGrouping] = useState<LaneGrouping>(isStrategic ? 'health' : 'status')
  // Per-lane collapse override (key → collapsed?). Low-attention lanes (On
  // Track / Completed) start collapsed by default so exceptions surface first.
  const [laneOverrides, setLaneOverrides] = useState<Record<string, boolean>>({})
  const [laneSearch, setLaneSearch] = useState('')
  const [portfolioSearch, setPortfolioSearch] = useState('')
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'needs_action'>('all')
  const [portfolioPage, setPortfolioPage] = useState(1)

  // ── URL-driven filters from Context Panel (M6.1) ───────────────────────────
  // Status values in the URL stay human-readable (on_track | at_risk | terlambat)
  // for shareable links; we map to the internal GREEN/YELLOW/RED here.
  const { url } = usePage()
  const urlStatusFilter = useMemo<Set<'GREEN' | 'YELLOW' | 'RED'>>(() => {
    const qs = url.split('?')[1] ?? ''
    const raw = new URLSearchParams(qs).get('status') ?? ''
    const map: Record<string, 'GREEN' | 'YELLOW' | 'RED'> = {
      on_track: 'GREEN',
      at_risk: 'YELLOW',
      terlambat: 'RED',
    }
    const out = new Set<'GREEN' | 'YELLOW' | 'RED'>()
    for (const v of raw.split(',').filter(Boolean)) {
      const mapped = map[v]
      if (mapped) out.add(mapped)
    }
    return out
  }, [url])

  const urlStaleOnly = useMemo<boolean>(() => {
    const qs = url.split('?')[1] ?? ''
    return new URLSearchParams(qs).get('stale') === '1'
  }, [url])

  // ── Deep-link filters dari Home (param ortogonal — TIDAK mengubah logika
  // ?status/?stale yang sudah ada). Semua di-render sebagai chip yang bisa
  // di-clear (transparansi: user tahu kenapa list ter-filter & bisa membuangnya).
  //   ?completed=1            → program selesai (approvalStatus/status COMPLETED)
  //   ?division=DKSA[,DAPN]   → kode divisi pemilik (shortcode, dari ownerUnitId)
  //   ?deadline=overdue|le30|le60|le90|gt90  → window tenggat (Tier 2)
  //   ?progress=early|mid|final              → bucket progress (Tier 3)
  const qParam = useCallback((key: string) => new URLSearchParams(url.split('?')[1] ?? '').get(key) ?? '', [url])
  const urlCompletedOnly = useMemo<boolean>(() => qParam('completed') === '1', [qParam])
  const urlDivisionFilter = useMemo<Set<string>>(() =>
    new Set(qParam('division').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)), [qParam])
  const urlDeadlineFilter = useMemo<Set<string>>(() =>
    new Set(qParam('deadline').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)), [qParam])
  const urlProgressFilter = useMemo<Set<string>>(() =>
    new Set(qParam('progress').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)), [qParam])

  // unitId → kode divisi (shortcode), dari programSummary.byDivisi (sumber yang
  // sama dengan heatmap Home), jadi filter divisi konsisten lintas halaman.
  const unitCodeById = useMemo<Map<number, string>>(() => {
    const m = new Map<number, string>()
    for (const d of programSummary?.byDivisi ?? []) {
      if (d.unit?.id != null) m.set(d.unit.id, (d.unit.code ?? '').split('-')[0].toUpperCase())
    }
    return m
  }, [programSummary])

  // Toggle/clear satu nilai pada param multi-nilai (division/deadline/progress).
  const toggleMultiParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    const cur = new Set((params.get(key) ?? '').split(',').filter(Boolean))
    if (cur.has(value)) cur.delete(value); else cur.add(value)
    if (cur.size > 0) params.set(key, Array.from(cur).join(',')); else params.delete(key)
    router.visit(`/programs${params.toString() ? '?' + params.toString() : ''}`, { preserveState: true, preserveScroll: true, replace: true })
  }, [url])
  const clearParam = useCallback((key: string) => {
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    params.delete(key)
    router.visit(`/programs${params.toString() ? '?' + params.toString() : ''}`, { preserveState: true, preserveScroll: true, replace: true })
  }, [url])

  const toggleStatusFilter = useCallback((tone: 'GREEN' | 'YELLOW' | 'RED') => {
    const map = { GREEN: 'on_track', YELLOW: 'at_risk', RED: 'terlambat' } as const
    const qs = url.split('?')[1] ?? ''
    const params = new URLSearchParams(qs)
    const cur = new Set((params.get('status') ?? '').split(',').filter(Boolean))
    const v = map[tone]
    if (cur.has(v)) cur.delete(v)
    else cur.add(v)
    if (cur.size > 0) params.set('status', Array.from(cur).join(','))
    else params.delete('status')
    const target = `/programs${params.toString() ? '?' + params.toString() : ''}`
    router.visit(target, { preserveState: true, preserveScroll: true, replace: true })
  }, [url])

  const toggleStaleFilter = useCallback(() => {
    const qs = url.split('?')[1] ?? ''
    const params = new URLSearchParams(qs)
    if (params.get('stale') === '1') params.delete('stale')
    else params.set('stale', '1')
    const target = `/programs${params.toString() ? '?' + params.toString() : ''}`
    router.visit(target, { preserveState: true, preserveScroll: true, replace: true })
  }, [url])

  const resetFilters = useCallback(() => {
    router.visit('/programs', { preserveState: true, preserveScroll: true, replace: true })
  }, [])

  // ── Timeline data ──────────────────────────────────────────────────────
  const [timelineData, setTimelineData] = useState<TimelineGanttProgram[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)

  const loadTimeline = useCallback(() => {
    setTimelineLoading(true)
    setTimelineError(null)
    api.get<{ data: TimelineGanttProgram[] }>('/programs/timeline-all')
      .then(res => setTimelineData(res.data ?? []))
      .catch((err) => {
        console.error('[Atlas] Gagal memuat timeline program:', err)
        setTimelineData([])
        setTimelineError(err instanceof Error ? err.message : 'Failed to load program timeline')
      })
      .finally(() => setTimelineLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'timeline' && timelineView === 'gantt' && timelineData.length === 0) loadTimeline()
  }, [tab, timelineView, timelineData.length, loadTimeline])

  // ── Execution pulse data ───────────────────────────────────────────────
  const [pulse, setPulse] = useState<ExecutionPulse | null>(null)
  const [pulseLoading, setPulseLoading] = useState(false)
  const [_pulseError, setPulseError] = useState<string | null>(null)

  const loadPulse = useCallback(() => {
    setPulseLoading(true)
    setPulseError(null)
    api.get<{ data: ExecutionPulse }>('/programs/execution-pulse')
      .then(res => setPulse(res.data ?? null))
      .catch((err) => {
        console.error('[Atlas] Gagal memuat execution pulse:', err)
        setPulse(null)
        setPulseError(err instanceof Error ? err.message : 'Failed to load execution data')
      })
      .finally(() => setPulseLoading(false))
  }, [])

  // Load pulse on mount so blocker badges are available in all tabs
  useEffect(() => { loadPulse() }, [loadPulse])

  // Declare modal-open flags early so useEscKey priority can reference them
  const [showCreateProgram, setShowCreateProgram] = useState(false)

  // ── Batch Charter Export (Isu #5) ─────────────────────────────────────
  // Modal: pilih N program → fetch /programs/{id}/charter (JSON) parallel
  // → exportProgramsCharterBatch composes 1 deck multi-slide → download.
  // Use case: Pak Dirkeu rapat MRC → 1 file PPTX untuk semua program direktorat.
  const [showBatchExport, setShowBatchExport] = useState(false)
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(new Set())
  const [batchSearch, setBatchSearch] = useState('')
  const [batchExporting, setBatchExporting] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const closeBatchExport = () => {
    if (batchExporting) return
    setShowBatchExport(false)
    setBatchSelectedIds(new Set())
    setBatchSearch('')
    setBatchError(null)
  }
  useEscKey(closeBatchExport, showBatchExport)
  const batchDialogRef = useDialogFocus<HTMLDivElement>(showBatchExport)
  const batchTitleId = useId()
  const batchFilteredPrograms = useMemo(() => {
    const q = batchSearch.trim().toLowerCase()
    if (!q) return programs
    return programs.filter(p =>
      p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    )
  }, [programs, batchSearch])
  const batchAllVisibleSelected = batchFilteredPrograms.length > 0
    && batchFilteredPrograms.every(p => batchSelectedIds.has(p.id))
  const toggleBatchAll = () => {
    if (batchAllVisibleSelected) {
      // Deselect just the visible ones (keep selection of non-visible).
      setBatchSelectedIds(prev => {
        const next = new Set(prev)
        batchFilteredPrograms.forEach(p => next.delete(p.id))
        return next
      })
    } else {
      setBatchSelectedIds(prev => {
        const next = new Set(prev)
        batchFilteredPrograms.forEach(p => next.add(p.id))
        return next
      })
    }
  }
  const toggleBatchOne = (id: number) => {
    setBatchSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const handleBatchExport = async () => {
    if (batchSelectedIds.size === 0 || batchExporting) return
    setBatchExporting(true)
    setBatchError(null)
    try {
      const ids = Array.from(batchSelectedIds)
      // Fetch payload parallel — Charter route returns JSON when Accept header
      // is application/json (api lib sets this by default).
      const payloads = await Promise.all(
        ids.map(id => api.get<{ data: CharterPayload }>(`/programs/${id}/charter`)
          .then(r => r.data))
      )
      // Lazy import — pptxgenjs bundle (~377 KB) hanya dimuat saat user
      // benar-benar export. Sama dengan single-export ExportButton.
      const { exportProgramsCharterBatch } = await import('../lib/exporters/programCharterPptx')
      await exportProgramsCharterBatch(payloads)
      closeBatchExport()
    } catch (e: unknown) {
      setBatchError(extractErrorMessage(e, 'Failed to generate batch PPTX.'))
    } finally {
      setBatchExporting(false)
    }
  }

  // ── Overlay animation helper (must be defined before any modal that uses it) ──
  const [closingOverlay, setClosingOverlay] = useState<string | null>(null)
  const closeOverlay = useCallback((name: string, action: () => void) => {
    setClosingOverlay(name)
    setTimeout(() => { action(); setClosingOverlay(null) }, 150)
  }, [])

  // ── Kebab menu state ──────────────────────────────────────────────────
  type KebabMenuData = {
    progId: number; progName: string; isOwner: boolean
    prog: { id: number; name: string; description?: string; status: string; priority: string; startDate?: string; targetEndDate?: string }
    top: number; right: number
  }
  const [kebabMenu, setKebabMenu] = useState<KebabMenuData | null>(null)
  const openKebabId = kebabMenu?.progId ?? null
  const closeKebab = useCallback(() => setKebabMenu(null), [])

  // ── Edit Program modal ────────────────────────────────────────────────
  type EditProgram = { id: number; name: string; description: string; status: string; priority: string; startDate: string; targetEndDate: string; ownerId: number | null; approvalStatus: string | null; kelompok: string; pilarStrategis: string; progresTerkini: string; dukunganDibutuhkan: string }
  const [editProgram, setEditProgram] = useState<EditProgram | null>(null)
  const [epSaving, setEpSaving] = useState(false)
  const [epError, setEpError] = useState<string | null>(null)
  const [epUserDirectory, setEpUserDirectory] = useState<Array<{ id: number; name: string; positionTitle?: string | null }>>([])
  const [epDirLoading, setEpDirLoading] = useState(false)
  const editProgramTitleId = useId()
  const editProgramDialogRef = useDialogFocus<HTMLDivElement>(!!editProgram)
  const closeEditProgram = useCallback(() => closeOverlay('edit-program', () => { setEditProgram(null); setEpError(null); setEpUserDirectory([]) }), [closeOverlay])
  useEscKey(closeEditProgram, !!editProgram)

  const openEditProgram = (prog: { id: number; name: string; description?: string; status: string; priority: string; startDate?: string; targetEndDate?: string; ownerId?: number | null; approvalStatus?: string | null; kelompok?: string | null; pilarStrategis?: string | null; progresTerkini?: string | null; dukunganDibutuhkan?: string | null }) => {
    setEditProgram({
      id: prog.id,
      name: prog.name,
      description: prog.description ?? '',
      status: prog.status,
      priority: prog.priority,
      startDate: prog.startDate ? prog.startDate.slice(0, 10) : '',
      targetEndDate: prog.targetEndDate ? prog.targetEndDate.slice(0, 10) : '',
      ownerId: prog.ownerId ?? null,
      approvalStatus: prog.approvalStatus ?? null,
      kelompok: prog.kelompok ?? '',
      pilarStrategis: prog.pilarStrategis ?? '',
      progresTerkini: prog.progresTerkini ?? '',
      dukunganDibutuhkan: prog.dukunganDibutuhkan ?? '',
    })
    setKebabMenu(null)
    // Pre-load user directory so it's ready when form opens
    setEpDirLoading(true)
    void api.get<{ data: Array<{ id: number; name: string; positionTitle?: string | null }> }>('/users/directory')
      .then(r => setEpUserDirectory(r.data ?? []))
      .catch((err) => console.error('[Atlas] Gagal memuat user directory (EP):', err))
      .finally(() => setEpDirLoading(false))
  }

  const submitEditProgram = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editProgram) return
    setEpSaving(true); setEpError(null)
    try {
      await api.put(`/programs/${editProgram.id}`, {
        name: editProgram.name.trim(),
        // null (bukan undefined) supaya field nullable BISA dikosongkan — undefined
        // di-drop klien sehingga nilai lama bertahan (audit 2026-06-17).
        description: editProgram.description.trim() || null,
        status: editProgram.status,
        priority: editProgram.priority,
        startDate: editProgram.startDate,
        targetEndDate: editProgram.targetEndDate,
        ...(editProgram.ownerId != null ? { ownerId: editProgram.ownerId } : {}),
        kelompok: editProgram.kelompok || null,
        pilarStrategis: editProgram.pilarStrategis || null,
        progresTerkini: editProgram.progresTerkini.trim() || null,
        dukunganDibutuhkan: editProgram.dukunganDibutuhkan.trim() || null,
      })
      closeEditProgram()
      await loadOverview('refresh')
    } catch (err: unknown) {
      setEpError((err as { message?: string })?.message ?? 'Failed to save changes.')
    } finally {
      setEpSaving(false)
    }
  }

  // ── Archive Program modal ─────────────────────────────────────────────
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string } | null>(null)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const archiveTitleId = useId()
  const archiveDialogRef = useDialogFocus<HTMLDivElement>(!!archiveTarget)
  const closeArchiveModal = useCallback(() => closeOverlay('archive-program', () => { setArchiveTarget(null); setArchiveError(null) }), [closeOverlay])
  useEscKey(closeArchiveModal, !!archiveTarget)

  const submitArchive = async () => {
    if (!archiveTarget) return
    setArchiveSaving(true); setArchiveError(null)
    try {
      await api.patch(`/programs/${archiveTarget.id}/archive`, {})
      closeArchiveModal()
      await loadOverview('refresh')
    } catch (err: unknown) {
      setArchiveError((err as { message?: string })?.message ?? 'Failed to archive program.')
    } finally {
      setArchiveSaving(false)
    }
  }

  // ── Restore Program modal ─────────────────────────────────────────────
  type ArchivedProgram = { id: number; name: string; code: string; archivedAt: string; archivedByName?: string | null; workstreamCount: number }
  const [archivedPrograms, setArchivedPrograms] = useState<ArchivedProgram[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<{ id: number; name: string } | null>(null)
  const [restoreSaving, setRestoreSaving] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const restoreTitleId = useId()
  const restoreDialogRef = useDialogFocus<HTMLDivElement>(!!restoreTarget)
  const closeRestoreModal = useCallback(() => closeOverlay('restore-program', () => { setRestoreTarget(null); setRestoreError(null) }), [closeOverlay])
  useEscKey(closeRestoreModal, !!restoreTarget)

  const [archivedError, setArchivedError] = useState<string | null>(null)
  const loadArchivedPrograms = useCallback(() => {
    setArchivedLoading(true)
    setArchivedError(null)
    api.get<{ data: ArchivedProgram[] }>('/programs/archived')
      .then(res => setArchivedPrograms(res.data ?? []))
      .catch((err) => {
        console.error('[Atlas] Gagal memuat program arsip:', err)
        setArchivedPrograms([])
        setArchivedError(err instanceof Error ? err.message : 'Failed to load archived programs')
      })
      .finally(() => setArchivedLoading(false))
  }, [])

  useEffect(() => { if (tab === 'archive') loadArchivedPrograms() }, [tab, loadArchivedPrograms])

  const submitRestore = async () => {
    if (!restoreTarget) return
    setRestoreSaving(true); setRestoreError(null)
    try {
      await api.patch(`/programs/${restoreTarget.id}/restore`, {})
      closeRestoreModal()
      loadArchivedPrograms()
      await loadOverview('refresh')
    } catch (err: unknown) {
      setRestoreError((err as { message?: string })?.message ?? 'Failed to restore program.')
    } finally {
      setRestoreSaving(false)
    }
  }

  // ── Buat Program modal ────────────────────────────────────────────────
  const [cpCodeManuallyEdited, setCpCodeManuallyEdited] = useState(false)
  const [cpForm, setCpForm] = useState({
    code: '', name: '', description: '',
    status: 'IN_PROGRESS', priority: 'MEDIUM',
    startDate: '', targetEndDate: '',
    kelompok: '' as string,
    pilarStrategis: '' as string,
  })
  const [cpOwnerId, setCpOwnerId] = useState<number | null>(null)
  const [cpOwnerUnitId, setCpOwnerUnitId] = useState<number | null>(null)
  const [cpUnits, setCpUnits] = useState<Array<{ id: number; name: string; code: string }>>([])
  const [cpStep, setCpStep] = useState<1 | 2>(1)
  const [cpKpiCodes, setCpKpiCodes] = useState<string[]>([])
  const [cpKpiSearch, setCpKpiSearch] = useState('')
  const [cpKpiDropdownOpen, setCpKpiDropdownOpen] = useState(false)
  const [cpHasNoApmsKpi, setCpHasNoApmsKpi] = useState(false)
  const [cpSaving, setCpSaving] = useState(false)
  const [cpError, setCpError] = useState<string | null>(null)
  const [cpUserDirectory, setCpUserDirectory] = useState<Array<{ id: number; name: string; positionTitle?: string | null }>>([])

  const closeCpModal = useCallback(() => closeOverlay('create-program', () => {
    setShowCreateProgram(false)
    setCpError(null)
    setCpStep(1)
    setCpKpiCodes([])
    setCpKpiSearch('')
    setCpKpiDropdownOpen(false)
    setCpHasNoApmsKpi(false)
    setCpOwnerId(null)
    setCpOwnerUnitId(null)
    setCpUnits([])
    setCpForm({ code: '', name: '', description: '', status: 'IN_PROGRESS', priority: 'MEDIUM', startDate: '', targetEndDate: '', kelompok: '', pilarStrategis: '' })
    setCpCodeManuallyEdited(false)
  }), [closeOverlay])

  useEscKey(closeCpModal, showCreateProgram)
  const createProgramDialogRef = useDialogFocus<HTMLDivElement>(showCreateProgram || closingOverlay === 'create-program')
  const createProgramTitleId = useId()
  const createProgramDescId = useId()

  // Single entrypoint for "buka modal Program Baru" — dipakai oleh tombol di
  // page header DAN listener TOPBAR_ACTION_EVENT (global "+" di topbar +
  // command palette). Tanpa listener ini, klik "Program" di popover "+" jadi
  // no-op karena /programs sengaja tidak terdaftar di TOPBAR_ACTIONS map
  // (page mengelola CTA-nya sendiri).
  const openCreateProgramModal = useCallback(() => {
    if (!roleAccess.canCreateProgram) return
    setShowCreateProgram(true)
    if (cpUnits.length === 0) {
      void api.get<{ data: Array<{ id: number; name: string; code: string }> }>('/organization/units')
        .then(r => setCpUnits(r.data ?? []))
        .catch((err) => console.error('[Atlas] Gagal memuat unit list:', err))
    }
  }, [roleAccess.canCreateProgram, cpUnits.length])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; page: string }>).detail
      if (detail?.id === 'program.new') openCreateProgramModal()
    }
    window.addEventListener(TOPBAR_ACTION_EVENT, handler)
    return () => window.removeEventListener(TOPBAR_ACTION_EVENT, handler)
  }, [openCreateProgramModal])

  const submitCpStep1 = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCpStep(2)
  }

  const submitCreateProgram = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!currentUser) return
    setCpSaving(true)
    setCpError(null)
    try {
      const programName = cpForm.name.trim()
      const res = await api.post<{ data: { id: number } }>('/programs', {
        code: cpForm.code.trim(),
        name: programName,
        description: cpForm.description.trim() || undefined,
        status: cpForm.status,
        priority: cpForm.priority,
        startDate: cpForm.startDate,
        targetEndDate: cpForm.targetEndDate,
        ownerId: cpOwnerId ?? currentUser.id,
        ownerUnitId: cpOwnerUnitId ?? currentUser.unit?.id ?? undefined,
        apmsKpiCodes: cpKpiCodes.length > 0 ? cpKpiCodes : undefined,
        hasNoApmsKpi: cpHasNoApmsKpi || undefined,
        kelompok: cpForm.kelompok || undefined,
        pilarStrategis: cpForm.pilarStrategis || undefined,
      })
      const newId = res?.data?.id
      closeCpModal()
      toast.show(`Program "${programName}" created — open the detail page to continue setup`, 'success')
      // Refresh sidebar context + program list di belakang, lalu navigasi user
      // ke detail page untuk lanjut setup checklist.
      void loadOverview('refresh')
      if (newId) {
        navigate(`/programs/${newId}`)
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to create program.'
      setCpError(msg)
      toast.show(msg, 'error')
    } finally {
      setCpSaving(false)
    }
  }

  // ── Auto-suggest program code ──────────────────────────────────────────
  // Format: PRG-<KODE_DIVISI>-<SINGKATAN_NAMA>-<URUTAN>
  // Segmen DIVISI di-omit jika tidak ada (user tanpa unit dan belum pilih Divisi Pemilik).
  const resolveDivisiCode = (ownerUnitId: number | null): string | null => {
    const rawCode = ownerUnitId
      ? cpUnits.find(u => u.id === ownerUnitId)?.code
      : currentUser?.unit?.code
    if (!rawCode) return null
    // Strip locale suffix: "DIMR-HLD" → "DIMR", "DKSA-HLD" → "DKSA". Kode tanpa suffix dilewati.
    return rawCode.split('-')[0]?.toUpperCase() ?? null
  }
  const suggestCode = (name: string, divisiCode: string | null): string => {
    const STOP = new Set(['dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'the', 'of', 'and'])
    const words = name.trim().split(/\s+/).filter(w => w.length > 1 && !STOP.has(w.toLowerCase()))
    const abbr = words.slice(0, 3).map(w => w[0].toUpperCase()).join('')
    const seq = String(programs.length + 1).padStart(3, '0')
    const segments = ['PRG']
    if (divisiCode) segments.push(divisiCode)
    segments.push(abbr || 'X')
    segments.push(seq)
    return segments.join('-')
  }

  // ── Computed values ────────────────────────────────────────────────────
  const healthMix = {
    green:  programs.filter(p => normalizeHealthStatus(p.healthStatus) === 'GREEN').length,
    yellow: programs.filter(p => normalizeHealthStatus(p.healthStatus) === 'YELLOW').length,
    red:    programs.filter(p => normalizeHealthStatus(p.healthStatus) === 'RED').length,
  }


  const daysUntil = (dateStr: string) =>
    Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  const formatDaysLabel = (days: number) => {
    if (days < 0) return { label: `${Math.abs(days)} days overdue`, color: 'var(--red)', tone: 'critical' as const }
    if (days === 0) return { label: 'today', color: 'var(--red)', tone: 'critical' as const }
    if (days <= 14) return { label: `${days} days left`, color: 'var(--yellow)', tone: 'warning' as const }
    if (days <= 30) return { label: `${days} days left`, color: 'var(--blue)', tone: 'notice' as const }
    return { label: `${days} days left`, color: 'var(--text-muted)', tone: 'muted' as const }
  }

  // Programs where the current user needs to take action (approve or submit)
  const needsActionPrograms = programs.filter(p => {
    if (role === 'KASUBDIV') return p.approvalStatus === 'PENDING_KASUB'
    if (['KADIV', 'ADMIN', 'SUPERADMIN'].includes(role)) return p.approvalStatus === 'PENDING_KADIV'
    // ASISTEN/others: their own DRAFT programs still need to be submitted
    return p.approvalStatus === 'DRAFT' && p.submittedById === currentUser?.id
  })

  const matchesUrlStatus = (p: typeof programs[number]) =>
    urlStatusFilter.size === 0 || urlStatusFilter.has(normalizeHealthStatus(p.healthStatus) as 'GREEN' | 'YELLOW' | 'RED')

  // Deep-link filters (ortogonal, AND antar-jenis; OR di dalam satu jenis).
  const deadlineBucket = (p: typeof programs[number]): string | null => {
    if (!p.targetEndDate) return null
    const d = Math.round((new Date(p.targetEndDate).getTime() - Date.now()) / 86_400_000)
    if (d < 0) return 'overdue'
    if (d <= 30) return 'le30'
    if (d <= 60) return 'le60'
    if (d <= 90) return 'le90'
    return 'gt90'
  }
  const progressBucket = (p: typeof programs[number]): string =>
    p.progressPercent < 34 ? 'early' : p.progressPercent < 67 ? 'mid' : 'final'
  const matchesDeepFilters = (p: typeof programs[number]) => {
    if (urlCompletedOnly && p.approvalStatus !== 'COMPLETED' && p.status !== 'COMPLETED') return false
    if (urlDivisionFilter.size > 0) {
      const code = p.ownerUnitId != null ? unitCodeById.get(p.ownerUnitId) ?? null : null
      if (!code || !urlDivisionFilter.has(code)) return false
    }
    if (urlDeadlineFilter.size > 0) {
      const b = deadlineBucket(p)
      if (!b || !urlDeadlineFilter.has(b)) return false
    }
    if (urlProgressFilter.size > 0 && !urlProgressFilter.has(progressBucket(p))) return false
    return true
  }

  const filteredPortfolio = programs.filter(p => {
    const matchesSearch = !portfolioSearch ||
      p.name.toLowerCase().includes(portfolioSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(portfolioSearch.toLowerCase())
    const matchesApproval = approvalFilter === 'all' || needsActionPrograms.some(n => n.id === p.id)
    return matchesSearch && matchesApproval && matchesUrlStatus(p) && matchesDeepFilters(p)
  })

  // ── Paginasi (List & Table) ───────────────────────────────────────────
  const portfolioPageCount = Math.max(1, Math.ceil(filteredPortfolio.length / PORTFOLIO_PAGE_SIZE))
  // Clamp render-time: filter yang menyusut bisa membuat page > pageCount.
  const portfolioPageSafe = Math.min(portfolioPage, portfolioPageCount)
  const pagedPortfolio = filteredPortfolio.slice(
    (portfolioPageSafe - 1) * PORTFOLIO_PAGE_SIZE,
    portfolioPageSafe * PORTFOLIO_PAGE_SIZE,
  )
  // Reset ke halaman 1 saat filter/search/URL berubah supaya tidak nyangkut di
  // halaman kosong. `url` mencakup chip status & stale.
  useEffect(() => { setPortfolioPage(1) }, [portfolioSearch, approvalFilter, url])
  const goToPage = useCallback((p: number) => {
    setPortfolioPage(p)
    // Naik ke atas daftar saat ganti halaman — tanpa ini fokus tetap di pager bawah.
    if (typeof document !== 'undefined') {
      document.querySelector('.workspace__content')?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const filteredLane = programs.filter(p =>
    (!laneSearch || p.name.toLowerCase().includes(laneSearch.toLowerCase()) ||
     p.code.toLowerCase().includes(laneSearch.toLowerCase())) &&
    matchesUrlStatus(p) && matchesDeepFilters(p)
  )
  const filteredTimeline = timelineData.filter(p =>
    !laneSearch || p.name.toLowerCase().includes(laneSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(laneSearch.toLowerCase())
  )

  // Lane grouping
  type Group = { key: string; label: string; tone: string; items: typeof programs }
  // Surface exceptions first: nearest deadline, then lowest progress.
  const byUrgency = (a: (typeof programs)[number], b: (typeof programs)[number]) => {
    const da = a.targetEndDate ? Date.parse(a.targetEndDate) : Number.POSITIVE_INFINITY
    const db = b.targetEndDate ? Date.parse(b.targetEndDate) : Number.POSITIVE_INFINITY
    if (da !== db) return da - db
    return a.progressPercent - b.progressPercent
  }
  let laneGroups: Group[]
  if (laneGrouping === 'status') {
    laneGroups = STATUS_ORDER.map(s => ({
      key: s, label: formatStatusLabel(s), tone: s.toLowerCase(),
      items: filteredLane.filter(p => p.status === s).sort(byUrgency),
    })).filter(g => g.items.length > 0)
  } else if (laneGrouping === 'priority') {
    laneGroups = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(pri => ({
      key: pri, label: pri,
      tone: pri.toLowerCase(),
      items: filteredLane.filter(p => p.priority === pri).sort(byUrgency),
    })).filter(g => g.items.length > 0)
  } else {
    laneGroups = ['GREEN', 'YELLOW', 'RED'].map(h => ({
      key: h,
      label: h === 'GREEN' ? 'On Track' : h === 'YELLOW' ? 'At Risk' : 'Delayed',
      tone: h.toLowerCase(),
      items: filteredLane.filter(p => normalizeHealthStatus(p.healthStatus) === h).sort(byUrgency),
    })).filter(g => g.items.length > 0)
  }
  // Low-attention lanes (healthy / done / low priority) collapse by default.
  const defaultLaneCollapsed = (g: Group) =>
    g.tone === 'green' || g.key === 'COMPLETED' || g.key === 'CANCELLED' || g.key === 'LOW'
  const isLaneCollapsed = (g: Group) => laneOverrides[g.key] ?? defaultLaneCollapsed(g)
  const toggleLane = (g: Group) =>
    setLaneOverrides(prev => ({ ...prev, [g.key]: !(prev[g.key] ?? defaultLaneCollapsed(g)) }))

  // ── Pulse filter state ─────────────────────────────────────────────────
  const [pulseFilter, setPulseFilter] = useState<'all' | number>('all')

  // Filter blockers with valid task→workstream→program chain.
  // Orphan blockers (task deleted/null) would crash downstream accesses.
  const validBlockers = (pulse?.activeBlockers ?? []).filter(b =>
    b.task?.workstream?.program?.id != null
  )

  // ── Blocker counts per program (for detail panel badge) ───────────────
  const blockerCountByProgram = validBlockers.reduce<Record<number, number>>((acc, b) => {
    const pid = b.task!.workstream.program.id
    acc[pid] = (acc[pid] ?? 0) + 1
    return acc
  }, {})

  const blockers = validBlockers.filter(b =>
    pulseFilter === 'all' || b.task!.workstream.program.id === pulseFilter
  )
  const atRisk = pulse?.atRiskWorkstreams.filter(i =>
    pulseFilter === 'all' || i.program.id === pulseFilter
  ) ?? []
  const stagnant = pulse?.stagnantItems.filter(w =>
    pulseFilter === 'all' || w.workstream.program.id === pulseFilter
  ) ?? []

  const totalIssues = (pulse?.activeBlockers.length ?? 0) +
    (pulse?.atRiskWorkstreams.length ?? 0) + (pulse?.stagnantItems.length ?? 0)

  return (
    <div className="ds programs-v2 view-programs">
      {/* `ds-stagger`: Phase 3 motion standardization. Modals di page ini
          semua portal-mounted (createPortal ke document.body) — modal-safe. */}
      <div className="programs-v2__inner ds-stagger">
      {/* ── Page header (design-system PageHeader) ─────────────────────────── */}
      <PageHeader
        title="Programs"
        subtitle={programs.length === 0 ? 'No programs yet' : 'Work program portfolio & health'}
        actions={
          <>
            {roleAccess.isMonitoringOnly && (
              <span className="role-monitoring-badge">Monitoring</span>
            )}
            {programs.length > 0 && (
              <button
                className="programs-v2__cta programs-v2__cta--secondary"
                onClick={() => setShowBatchExport(true)}
                type="button"
                title="Export Charter PPTX for several programs at once (MRC / board meetings)"
              >
                Export Charter PPTX
              </button>
            )}
            {roleAccess.canCreateProgram && (
              <button
                className="programs-v2__cta"
                onClick={openCreateProgramModal}
                type="button"
              >
                New Program
              </button>
            )}
          </>
        }
      />


      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <nav className="programs-v2__tabs scroll-tabs" role="tablist" aria-label="Program views">
        {([
          ['portfolio', 'Portfolio'],
          ['timeline',  'Timeline'],
          ['monitoring', 'Monitoring'],
          ['pulse',     'Pulse'],
        ] as [ProgramTab, string][]).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`programs-v2__tab${tab === t ? ' programs-v2__tab--active' : ''}`}
            onClick={() => setTab(t)}
            type="button"
          >
            <span>{label}</span>
            {t === 'pulse' && totalIssues > 0 && (
              <span className="programs-v2__tab-count">{totalIssues}</span>
            )}
          </button>
        ))}
        {roleAccess.canViewArchive && (
          <button
            role="tab"
            aria-selected={tab === 'archive'}
            className={`programs-v2__tab programs-v2__tab--muted${tab === 'archive' ? ' programs-v2__tab--active' : ''}`}
            onClick={() => setTab('archive')}
            type="button"
          >
            <span>Archive</span>
          </button>
        )}
      </nav>

      {/* ── Controls bar — filters left, view+search right ──────────────── */}
      {(tab === 'portfolio' || tab === 'timeline') && (
        <div className="programs-controls">
          <div className="programs-controls__filters" role="group" aria-label="Filter program">
            {([
              ['GREEN',  'On Track',  'green',  healthMix.green],
              ['YELLOW', 'At Risk',   'amber',  healthMix.yellow],
              ['RED',    'Delayed',   'red',    healthMix.red],
            ] as const).map(([tone, label, toneClass, count]) => {
              const active = urlStatusFilter.has(tone)
              return (
                <button
                  key={tone}
                  type="button"
                  className={`programs-filter-chip programs-filter-chip--${toneClass}${active ? ' programs-filter-chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleStatusFilter(tone)}
                >
                  <span className="programs-filter-chip__dot" aria-hidden="true" />
                  {label}
                  <span className="programs-filter-chip__count">{count}</span>
                </button>
              )
            })}
            <button
              type="button"
              className={`programs-filter-chip programs-filter-chip--stale${urlStaleOnly ? ' programs-filter-chip--active' : ''}`}
              aria-pressed={urlStaleOnly}
              onClick={toggleStaleFilter}
            >
              Stale &gt;30 days
            </button>
            {tab === 'portfolio' && needsActionPrograms.length > 0 && (
              <button
                type="button"
                className={`programs-filter-chip programs-filter-chip--amber${approvalFilter === 'needs_action' ? ' programs-filter-chip--active' : ''}`}
                aria-pressed={approvalFilter === 'needs_action'}
                onClick={() => setApprovalFilter(f => f === 'needs_action' ? 'all' : 'needs_action')}
              >
                <span className="programs-filter-chip__dot" aria-hidden="true" />
                Needs Approval
                <span className="programs-filter-chip__count">{needsActionPrograms.length}</span>
              </button>
            )}
            {/* Completed — toggle persisten (lifecycle), setara Stale */}
            <button
              type="button"
              className={`programs-filter-chip programs-filter-chip--neutral${urlCompletedOnly ? ' programs-filter-chip--active' : ''}`}
              aria-pressed={urlCompletedOnly}
              onClick={() => (urlCompletedOnly ? clearParam('completed') : router.visit(`/programs?${(() => { const pr = new URLSearchParams(url.split('?')[1] ?? ''); pr.set('completed', '1'); return pr.toString() })()}`, { preserveState: true, preserveScroll: true, replace: true }))}
            >
              <span className="programs-filter-chip__dot" aria-hidden="true" />
              Completed
              <span className="programs-filter-chip__count">
                {programs.filter(p => p.status === 'COMPLETED' || p.approvalStatus === 'COMPLETED').length}
              </span>
            </button>
            {/* Chip deep-link aktif (division/deadline/progress) — bisa di-clear per nilai */}
            {Array.from(urlDivisionFilter).map(code => (
              <button key={`div-${code}`} type="button" className="programs-filter-chip programs-filter-chip--active programs-filter-chip--removable"
                aria-pressed onClick={() => toggleMultiParam('division', code)}>
                Division: {code} <span className="programs-filter-chip__x" aria-hidden>×</span>
              </button>
            ))}
            {Array.from(urlDeadlineFilter).map(b => (
              <button key={`dl-${b}`} type="button" className="programs-filter-chip programs-filter-chip--active programs-filter-chip--removable"
                aria-pressed onClick={() => toggleMultiParam('deadline', b)}>
                {DEADLINE_LABEL[b] ?? b} <span className="programs-filter-chip__x" aria-hidden>×</span>
              </button>
            ))}
            {Array.from(urlProgressFilter).map(b => (
              <button key={`pg-${b}`} type="button" className="programs-filter-chip programs-filter-chip--active programs-filter-chip--removable"
                aria-pressed onClick={() => toggleMultiParam('progress', b)}>
                {b === 'early' ? 'Early' : b === 'mid' ? 'Mid' : 'Final'} progress <span className="programs-filter-chip__x" aria-hidden>×</span>
              </button>
            ))}
            {(urlStatusFilter.size > 0 || urlStaleOnly || approvalFilter === 'needs_action' || urlCompletedOnly || urlDivisionFilter.size > 0 || urlDeadlineFilter.size > 0 || urlProgressFilter.size > 0) && (
              <button
                type="button"
                className="programs-filter-reset"
                onClick={() => {
                  setApprovalFilter('all')
                  resetFilters()
                }}
              >
                Reset
              </button>
            )}
          </div>

          <div className="programs-controls__view">
            {tab === 'portfolio' && (
              <>
                <div className="view-toggle">
                  {(['list', 'kanban', 'table', 'map'] as PortfolioView[]).map(mode => (
                    <button key={mode} className={`view-toggle-btn${portfolioView === mode ? ' active' : ''}`}
                      onClick={() => setPortfolioView(mode)}>
                      {mode === 'list' ? 'List' : mode === 'kanban' ? 'Board' : mode === 'table' ? 'Table' : 'Map'}
                    </button>
                  ))}
                </div>
                <div className="programs-search">
                  <svg className="programs-search__icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="4.5" />
                    <path d="m9.5 9.5 3 3" />
                  </svg>
                  <input className="programs-search__input" value={portfolioSearch}
                    onChange={e => setPortfolioSearch(e.target.value)} placeholder="Search programs…" />
                </div>
              </>
            )}
            {tab === 'timeline' && (
              <>
                <div className="view-toggle">
                  <button className={`view-toggle-btn${timelineView === 'lanes' ? ' active' : ''}`} onClick={() => setTimelineView('lanes')}>Lanes</button>
                  <button className={`view-toggle-btn${timelineView === 'gantt' ? ' active' : ''}`} onClick={() => setTimelineView('gantt')}>Gantt</button>
                </div>
                {timelineView === 'lanes' && (
                  <div className="view-toggle">
                    {(['status', 'priority', 'health'] as LaneGrouping[]).map(g => (
                      <button key={g} className={`view-toggle-btn${laneGrouping === g ? ' active' : ''}`} onClick={() => setLaneGrouping(g)}>
                        {g === 'status' ? 'Status' : g === 'priority' ? 'Priority' : 'Health'}
                      </button>
                    ))}
                  </div>
                )}
              <div className="programs-search">
                <svg className="programs-search__icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" />
                  <path d="m9.5 9.5 3 3" />
                </svg>
                <input className="programs-search__input" value={laneSearch}
                  onChange={e => setLaneSearch(e.target.value)} placeholder="Search programs…" />
              </div>
            </>
          )}
          </div>
        </div>
      )}

      <div className="programs-workspace">
        {/* ── Main area ─────────────────────────────────────────────────── */}
        <div className="programs-main">
          <div key={tab} className="programs-tab-content">

          {/* ── TAB: PORTOFOLIO ─────────────────────────────────────────── */}
          {tab === 'portfolio' && (
            <>
              {portfolioView === 'list' && (
                <div className="section-block section-block--bare">
                  {filteredPortfolio.length > 0 ? (
                    <>
                    <div className="program-roster">
                      <div className="program-roster__header" aria-hidden="true">
                        <div className="program-roster__header-main">
                          <span>Program</span>
                          <span>Status</span>
                          <span>Progress</span>
                          <span>PIC</span>
                        </div>
                        {/* Spacer mengikuti area Charter btn + kebab di row, supaya
                            kolom header benar-benar align dengan kolom konten. */}
                        <span className="program-roster__header-actions-spacer" aria-hidden="true" />
                      </div>
                      {pagedPortfolio.map((prog) => {
                        const health = normalizeHealthStatus(prog.healthStatus)
                        const sc = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
                        const healthLabel = healthStatusLabel(health)
                        const bCount = blockerCountByProgram[prog.id] ?? 0
                        const days = prog.targetEndDate ? daysUntil(prog.targetEndDate) : null
                        const deadlineInfo = days !== null ? formatDaysLabel(days) : null
                        const approvalInfo = approvalBadge(prog)
                        const healthTone = sc === 'on-track' ? 'green' : sc === 'at-risk' ? 'yellow' : 'red'
                        const progStatus = (prog as { status?: string }).status
                        const isCompleted = progStatus === 'COMPLETED'
                        const isOwner = (prog as { ownerId?: number }).ownerId === currentUser?.id
                        const showActions = roleAccess.canEditProgram(isOwner) || roleAccess.canArchiveProgram(isOwner)
                        return (
                          <div
                            key={prog.id}
                            className={`list-row list-row--${sc} list-row--with-actions${prog.id === selectedProgramId ? ' program-row--active' : ''}`}
                          >
                            <button
                              className="program-row__main"
                              onClick={() => navigate(`/programs/${prog.id}`)}
                              type="button"
                            >
                              <div className="program-row__identity">
                                <span className="code-badge program-row__code">{prog.code}</span>
                                <div className="program-row__info">
                                  <strong>{prog.name}</strong>
                                  <div className="program-row__meta">
                                    <span className="program-row__meta-primary">{workstreamSummaryLabel(prog.workstreamCount)}</span>
                                    {deadlineInfo && !isCompleted && (
                                      <span className={`program-deadline program-deadline--${deadlineInfo.tone}`}>
                                        {deadlineInfo.label}
                                      </span>
                                    )}
                                    {bCount > 0 && (
                                      <span className="program-row__badge program-row__badge--blocker">
                                        {bCount} blocker
                                      </span>
                                    )}
                                    {approvalInfo && (
                                      <span className={`program-row__approval-tag program-row__approval-tag--${approvalInfo.tone}`}>
                                        {approvalInfo.label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="program-row__state">
                                <span className={`program-row__status-pill program-row__status-pill--${isCompleted ? 'green' : healthTone}`}>
                                  {isCompleted ? 'Completed' : healthLabel}
                                </span>
                              </div>
                              <div className="program-row__progress">
                                {prog.progressPercent > 0 ? (
                                  <div className="program-row__progress-main">
                                    <div className="progress-bar-track program-row__progress-track">
                                      <div className={`progress-bar-fill ${sc}`} style={{ width: `${prog.progressPercent}%` }} />
                                    </div>
                                    <span className="program-row__progress-value">
                                      {prog.progressPercent}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="program-row__progress-empty">{progStatus === 'PLANNING' ? 'Not started' : 'In progress'}</span>
                                )}
                              </div>
                              <div className="program-row__owner-block">
                                {prog.owner ? (
                                  <>
                                    <Avatar name={prog.owner.name} size={24} />
                                    <span className="program-row__owner" title={prog.owner.name}>
                                      {prog.owner.name}
                                    </span>
                                  </>
                                ) : (
                                  <span className="program-row__owner program-row__owner--empty">
                                    Not assigned
                                  </span>
                                )}
                                {(prog.picPersons ?? []).length > 0 && (
                                  <span className="program-row__copics" title={(prog.picPersons ?? []).map(p => p.name).join(', ')}>
                                    +{(prog.picPersons ?? []).length}
                                  </span>
                                )}
                              </div>
                            </button>
                            {/* Charter quick-view button — direct shortcut ke
                                /programs/{id}/charter tanpa drill-in ke edit
                                view. Selalu visible untuk discoverability. */}
                            <button
                              className="program-row__charter-btn"
                              onClick={e => { e.stopPropagation(); navigate(`/programs/${prog.id}/charter`) }}
                              type="button"
                              title="View as Charter (single-page, read-only)"
                              aria-label={`View ${prog.code} as Charter`}
                            >
                              Charter
                              <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10" aria-hidden="true">
                                <path d="M3 6h6M6 3l3 3-3 3" />
                              </svg>
                            </button>
                            {/* Kebab wrap SELALU dirender dengan width tetap (44px) agar
                                semua baris identik — button di-hide via visibility:hidden
                                bila tidak ada aksi, bukan conditional render. */}
                            <div className={`program-row__kebab-wrap${openKebabId === prog.id ? ' program-row__kebab-wrap--open' : ''}`}>
                              <button
                                className="program-row__kebab-btn"
                                style={!showActions ? { visibility: 'hidden' } : undefined}
                                onClick={e => {
                                  if (!showActions) return
                                  e.stopPropagation()
                                  if (openKebabId === prog.id) { closeKebab(); return }
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                  setKebabMenu({
                                    progId: prog.id, progName: prog.name, isOwner,
                                    prog,
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right,
                                  })
                                }}
                                type="button"
                                aria-label="Program actions"
                                tabIndex={!showActions ? -1 : undefined}
                              >
                                ···
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <Pager
                      page={portfolioPageSafe}
                      pageCount={portfolioPageCount}
                      total={filteredPortfolio.length}
                      pageSize={PORTFOLIO_PAGE_SIZE}
                      onPage={goToPage}
                    />
                    </>
                  ) : portfolioSearch ? (
                    <SectionState
                      tone="info" compact
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-4-4" />
                        </svg>
                      }
                      title="No results"
                      text={`No programs match "${portfolioSearch}".`}
                    />
                  ) : (
                    <SectionState
                      tone="info"
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      }
                      title="Portfolio empty"
                      text="Programs appear once data loads."
                    />
                  )}
                </div>
              )}

              {portfolioView === 'kanban' && (
                <div className="program-kanban">
                  {STATUS_ORDER.map(status => {
                    const items = filteredPortfolio.filter(p => p.status === status)
                    return (
                      <div className="kanban-col" key={status}>
                        <div className="kanban-col__header">
                          <span className="kanban-col__label">{formatStatusLabel(status)}</span>
                          <span className="kanban-col__count">{items.length}</span>
                        </div>
                        <div className="kanban-col__body">
                          {items.map(prog => {
                            const h = normalizeHealthStatus(prog.healthStatus)
                            const sc = h === 'GREEN' ? 'on-track' : h === 'YELLOW' ? 'at-risk' : 'off-track'
                            const hClass = h === 'GREEN' ? 'health-green' : h === 'YELLOW' ? 'health-yellow' : 'health-red'
                            const approvalInfo = approvalBadge(prog)
                            const bCount = blockerCountByProgram[prog.id] ?? 0
                            const days = prog.targetEndDate ? daysUntil(prog.targetEndDate) : null
                            const deadlineInfo = days !== null ? formatDaysLabel(days) : null
                            return (
                              <button key={prog.id}
                                className={`kanban-card kanban-card--${hClass}${prog.id === selectedProgramId ? ' kanban-card--active' : ''}`}
                                onClick={() => navigate(`/programs/${prog.id}`)}
                                type="button">
                                <div className="work-card__head">
                                  <span className={`work-card__dot work-card__dot--${prog.priority.toLowerCase()}`} />
                                  <h4 className="kanban-card__title">{prog.name}</h4>
                                </div>
                                <div className="progress-bar-track kanban-card__progress-track">
                                  <div className={`progress-bar-fill ${sc}`} style={{ width: `${prog.progressPercent}%` }} />
                                </div>
                                <div className="kanban-card__footer">
                                  <span className="code-badge">{prog.code}</span>
                                  <HealthPill status={h} />
                                  {approvalInfo && (
                                    <span className={`program-tone-chip program-tone-chip--${approvalInfo.tone} program-tone-chip--compact`}>
                                      {approvalInfo.label}
                                    </span>
                                  )}
                                  {bCount > 0 && (
                                    <span className="program-tone-chip program-tone-chip--red program-tone-chip--compact">
                                      {bCount}⚠
                                    </span>
                                  )}
                                  <span className="kanban-card__progress-value">{prog.progressPercent}%</span>
                                </div>
                                {deadlineInfo && (
                                  <div className={`kanban-card__deadline program-deadline program-deadline--${deadlineInfo.tone}`}>
                                    {deadlineInfo.label}
                                  </div>
                                )}
                              </button>
                            )
                          })}
                          {items.length === 0 && <div className="kanban-col__empty">No programs</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {portfolioView === 'table' && (
                <div className="panel">
                  <div className="panel__header">
                    <div>
                      <h3 className="panel__title">Portfolio Table</h3>
                      <p className="panel__sub">Status, progress, blockers, and health per program.</p>
                    </div>
                  </div>
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Status</th>
                        <th>Progress</th>
                        <th>Deadline</th>
                        <th>Blocker</th>
                        <th>Health</th>
                        <th>KPI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPortfolio.map(prog => {
                        const bCount = blockerCountByProgram[prog.id] ?? 0
                        const days = prog.targetEndDate ? daysUntil(prog.targetEndDate) : null
                        const deadlineInfo = days !== null ? formatDaysLabel(days) : null
                        return (
                          <tr key={prog.id}
                            className={`gov-table__row${prog.id === selectedProgramId ? ' gov-table__row--active' : ''}`}
                            onClick={() => navigate(`/programs/${prog.id}`)}>
                            <td>
                              <div className="gov-table__name">
                                <span className="code-badge">{prog.code}</span>
                                <strong>{prog.name}</strong>
                              </div>
                            </td>
                            <td>{(() => { const d = getProgramDisplayStatus(prog); return <span className={`badge badge--${d.tone}`}>{d.label}</span> })()}</td>
                            <td>
                              <div className="gov-table__progress">
                                <div className="progress-bar progress-bar--inline">
                                  <div className="progress-bar__fill" style={{ width: `${prog.progressPercent}%` }} />
                                </div>
                                <span>{prog.progressPercent}%</span>
                              </div>
                            </td>
                            <td>
                              {deadlineInfo ? (
                                <span className={`program-deadline program-deadline--${deadlineInfo.tone}`}>{deadlineInfo.label}</span>
                              ) : <span className="text-muted">—</span>}
                            </td>
                            <td>
                              {bCount > 0 ? (
                                <span className="program-table-count program-table-count--blockers">{bCount}</span>
                              ) : <span className="program-table-count program-table-count--empty">—</span>}
                            </td>
                            <td><HealthPill status={normalizeHealthStatus(prog.healthStatus)} /></td>
                            <td>
                              {(prog.kpiCount ?? 0) === 0 ? (
                                <span className="program-tone-chip program-tone-chip--yellow program-tone-chip--compact">
                                  No KPI
                                </span>
                              ) : (
                                <span className="program-table-count program-table-count--empty">{prog.kpiCount}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <Pager
                    page={portfolioPageSafe}
                    pageCount={portfolioPageCount}
                    total={filteredPortfolio.length}
                    pageSize={PORTFOLIO_PAGE_SIZE}
                    onPage={goToPage}
                  />
                </div>
              )}

              {portfolioView === 'map' && (
                <div className="section-block section-block--bare">
                  {filteredPortfolio.length > 0 ? (
                    <ProgramScatter
                      programs={filteredPortfolio.map(prog => {
                        const days = prog.targetEndDate ? daysUntil(prog.targetEndDate) : null
                        return {
                          id: prog.id,
                          code: prog.code,
                          name: prog.name,
                          progressPercent: prog.progressPercent,
                          health: normalizeHealthStatus(prog.healthStatus) as 'GREEN' | 'YELLOW' | 'RED',
                          days,
                          completed: (prog as { status?: string }).status === 'COMPLETED',
                          owner: prog.owner?.name ?? null,
                        }
                      })}
                      onOpen={(id) => navigate(`/programs/${id}`)}
                    />
                  ) : (
                    <SectionState
                      tone="info" compact
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-4-4" />
                        </svg>
                      }
                      title={portfolioSearch ? 'No results' : 'Portfolio empty'}
                      text={portfolioSearch
                        ? `No programs match "${portfolioSearch}".`
                        : 'Programs appear once data loads.'}
                    />
                  )}
                </div>
              )}

              {/* KPI Watch dipindah ke Home — lihat tab Home untuk analisis KPI */}
            </>
          )}

          {/* ── TAB: TIMELINE ───────────────────────────────────────────── */}
          {tab === 'timeline' && (
            <>
              {timelineView === 'lanes' && (
                <div className="roadmap-body">
                  {laneGroups.length === 0 ? (
                    <p className="text-sm text-muted roadmap-empty">No matching programs.</p>
                  ) : (
                    <>
                      <div className="roadmap-head" aria-hidden="true">
                        <span className="roadmap-head__code" />
                        <span className="roadmap-head__title">Program</span>
                        <span className="roadmap-head__progress">Progress</span>
                        <span className="roadmap-head__pct">%</span>
                        <span className="roadmap-head__risk" />
                        <span className="roadmap-head__owner">Owner</span>
                      </div>
                      {laneGroups.map(group => {
                        const collapsed = isLaneCollapsed(group)
                        return (
                        <div className={`roadmap-lane${collapsed ? ' roadmap-lane--collapsed' : ''}`} key={group.key}>
                          <button
                            type="button"
                            className={`roadmap-lane__header${group.key === 'ON_HOLD' ? ' roadmap-lane__header--on-hold' : ''}`}
                            onClick={() => toggleLane(group)}
                            aria-expanded={!collapsed}
                          >
                            <svg className="roadmap-lane__chevron" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                              <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className={`roadmap-lane__dot roadmap-lane__dot--${group.tone}`} />
                            <span className="roadmap-lane__label">{group.label}</span>
                            <span className="section-badge">{group.items.length}</span>
                          </button>
                          {!collapsed && (
                          <div className="roadmap-lane__body">
                            {group.items.map(prog => {
                              const health = normalizeHealthStatus(prog.healthStatus)
                              const sc = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
                              return (
                                <button key={prog.id} className="roadmap-bar list-row"
                                  onClick={() => navigate(`/programs/${prog.id}`)}>
                                  <span className="code-badge roadmap-bar__code">{prog.code}</span>
                                  <div className="roadmap-bar__title">
                                    <span className="roadmap-bar__name" title={prog.name}>{prog.name}</span>
                                  </div>
                                  <div className="progress-bar-track roadmap-bar__progress">
                                    <div className={`progress-bar-fill ${sc}`} style={{ width: `${Math.max(prog.progressPercent, 2)}%` }} />
                                  </div>
                                  <span className="roadmap-bar__pct">
                                    {prog.progressPercent}%
                                  </span>
                                  <span className="roadmap-bar__risk-placeholder" />
                                  {prog.owner ? (
                                    <span className="roadmap-bar__owner text-muted text-xs">{prog.owner.name}</span>
                                  ) : <span className="roadmap-bar__owner-placeholder" />}
                                  {(prog.kpiCount ?? 0) === 0 && (
                                    <span className="program-tone-chip program-tone-chip--yellow program-tone-chip--compact">
                                      No KPI
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                          )}
                        </div>
                        )
                      })}

                    </>
                  )}
                </div>
              )}

              {timelineView === 'gantt' && (
                <div className="roadmap-body roadmap-body--timeline">
                  {timelineLoading ? (
                    <p className="text-sm text-muted roadmap-empty">Loading timeline…</p>
                  ) : timelineError ? (
                    <div className="roadmap-empty roadmap-empty--error" role="alert">
                      <p className="text-sm">Failed to load program timeline.</p>
                      <p className="text-xs text-muted">{timelineError}</p>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={loadTimeline}>
                        Try again
                      </button>
                    </div>
                  ) : (
                    <TimelineGantt
                      programs={filteredTimeline}
                      emptyText="No programs to display."
                      onOpenProgram={(id) => navigate(`/programs/${id}`)}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* ── TAB: MONITORING MATRIX ──────────────────────────────────── */}
          {tab === 'monitoring' && (
            <div className="programs-section-stack">
              <MonitoringMatrix />
            </div>
          )}

          {/* ── TAB: PULSE ──────────────────────────────────────────────── */}
          {tab === 'pulse' && (
            <div className="pulse-body">
              {/* Program filter pill row */}
              {programs.length > 0 && (
                <div className="program-filter-pills">
                  <button
                    className={`program-filter-pill${pulseFilter === 'all' ? ' program-filter-pill--active' : ''}`}
                    onClick={() => setPulseFilter('all')}
                    type="button">All Programs</button>
                  {programs.map(p => (
                    <button key={p.id}
                      className={`program-filter-pill${pulseFilter === p.id ? ' program-filter-pill--active' : ''}`}
                      onClick={() => setPulseFilter(p.id)}
                      type="button">{p.code}</button>
                  ))}
                </div>
              )}

              {pulseLoading ? (
                <div className="section-block"><SkeletonStack lines={[90, 75, 60, 80]} /></div>
              ) : !pulse ? (
                <SectionState icon="⚡" title="Unable to load pulse data" text="Try refreshing the page." />
              ) : (
                <div className="pulse-stack">

                  {/* A: Active Blockers */}
                  <div className="section-block">
                    <div className="section-header">
                      <div>
                        <h3 className="section-title">Active Blockers</h3>
                        <p className="section-subtitle">All open blockers halting execution.</p>
                      </div>
                      <span className={`section-badge${blockers.length > 0 ? ' section-badge--red' : ''}`}>
                        {blockers.length} open
                      </span>
                    </div>
                    {blockers.length === 0 ? (
                      <SectionState
  tone="success" compact
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  }
  title="No active blockers"
  text="All blockers resolved."
/>
                    ) : (
                      <div className="program-list-stack program-list-stack--tight">
                        {blockers.map(b => {
                          const severity = VALID_SEVERITIES.has(b.severity) ? b.severity : 'LOW'
                          return (
                            <div key={b.id} className={`blocker-item blocker-item--${severity}`}>
                              <span className={`severity-badge severity-badge--${severity}`}>
                                {severity}
                              </span>
                              <div className="blocker-item__body">
                                <div className="blocker-item__title">
                                  {b.title}
                                </div>
                                <div className="blocker-item__meta">
                                  {b.task!.workstream.program.code} › {b.task!.workstream.name} › {b.task!.title}
                                </div>
                              </div>
                              <span className="blocker-item__age">
                                {Math.round(b.daysOpen) === 0 ? 'Today' : `${Math.round(b.daysOpen)}d`}
                              </span>
                              <button
                                className="btn btn--ghost blocker-item__action"
                                onClick={() => navigate(`/execution/tasks/${b.task!.id}`)}
                                type="button"
                              >
                                Open →
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* B: At-risk workstreams */}
                  <div className="section-block">
                    <div className="section-header">
                      <div>
                        <h3 className="section-title">At-Risk Workstreams</h3>
                        <p className="section-subtitle">Deadline ≤30 days with progress below 70%.</p>
                      </div>
                      <span className={`section-badge${atRisk.length > 0 ? ' section-badge--yellow' : ''}`}>
                        {atRisk.length} workstream
                      </span>
                    </div>
                    {atRisk.length === 0 ? (
                      <SectionState
  tone="success" compact
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  }
  title="No at-risk workstreams"
  text="All workstreams on target."
/>
                    ) : (
                      <div className="program-list-stack program-list-stack--tight">
                        {atRisk.map(ini => {
                          const h = normalizeHealthStatus(ini.healthStatus)
                          const sc = h === 'GREEN' ? 'on-track' : h === 'YELLOW' ? 'at-risk' : 'off-track'
                          const urgencyTone = ini.daysRemaining <= 7 ? 'critical' : ini.daysRemaining <= 14 ? 'warning' : 'muted'
                          return (
                            <div key={ini.id} className="pulse-item">
                              <HealthPill status={h} />
                              <div className="pulse-item__body">
                                <div className="pulse-item__title">
                                  {ini.name}
                                </div>
                                <div className="pulse-item__meta">
                                  {ini.program.code} · {ini.owner?.name ?? '—'}
                                </div>
                              </div>
                              <div className="pulse-item__progress">
                                <div className="progress-bar-track">
                                  <div className={`progress-bar-fill ${sc}`} style={{ width: `${ini.progressPercent}%` }} />
                                </div>
                                <span className="pulse-item__progress-value">{ini.progressPercent}%</span>
                              </div>
                              <span className={`pulse-item__state pulse-item__state--${urgencyTone}`}>
                                {Math.round(ini.daysRemaining) <= 0 ? 'Overdue' : `${Math.round(ini.daysRemaining)}d left`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* C: Stagnant items */}
                  <div className="section-block">
                    <div className="section-header">
                      <div>
                        <h3 className="section-title">Stagnant Tasks</h3>
                        <p className="section-subtitle">Active tasks with no update in the last 7 days.</p>
                      </div>
                      <span className="section-badge">{stagnant.length} item</span>
                    </div>
                    {stagnant.length === 0 ? (
                      <SectionState
  tone="success" compact
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  }
  title="Nothing stagnant"
  text="All tasks moving."
/>
                    ) : (
                      <div className="program-list-stack program-list-stack--tight">
                        {stagnant.map(w => {
                          const staleTone = w.stagnantDays >= 14 ? 'critical' : w.stagnantDays >= 10 ? 'warning' : 'muted'
                          return (
                            <div key={w.id} className="pulse-item">
                              <span className="badge pulse-item__status">{formatStatusLabel(w.status)}</span>
                              <div className="pulse-item__body">
                                <div className="pulse-item__title">
                                  {w.title}
                                </div>
                                <div className="pulse-item__meta">
                                  {w.workstream.program.code} › {w.workstream.name} · {w.assignee?.name ?? 'Unassigned'}
                                </div>
                              </div>
                              <span className="pulse-item__metric">
                                {w.percentComplete}%
                              </span>
                              <span className={`pulse-item__state pulse-item__state--${staleTone}`}>
                                Stagnant {Math.round(w.stagnantDays)}d
                              </span>
                              <button
                                className="btn btn--ghost blocker-item__action"
                                onClick={() => navigate(`/execution/tasks/${w.id}`)}
                                type="button"
                              >
                                Open →
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: RISIKO ─────────────────────────────────────────────── */}
          </div>{/* end .programs-tab-content */}
        </div>
      </div>

      {/* ── Modal: Buat Program ───────────────────────────────────────── */}
      {(showCreateProgram || closingOverlay === 'create-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'create-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !cpSaving && closeCpModal()}
        >
          <div aria-describedby={createProgramDescId} aria-labelledby={createProgramTitleId} aria-modal="true" className="modal modal--wide" ref={createProgramDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="program-modal-head">
                <span className="program-modal-kicker">Program Settings</span>
                <h3 className="modal__title program-modal-title" id={createProgramTitleId}>{cpStep === 1 ? 'New Program' : 'KPI Impact'}</h3>
                <p className="program-modal-subtitle" id={createProgramDescId}>
                  {cpStep === 1
                    ? 'Set the identity, initial status, and timeline so the program reads clearly in the roster.'
                    : 'Link the program to the most-affected APMS KPIs, or mark it as an internal target if there is no APMS reference yet.'}
                </p>
                <div className="program-modal-stepper">
                  {[1, 2].map(s => (
                    <span key={s} className={`program-modal-step${cpStep >= s ? ' program-modal-step--active' : ''}`} />
                  ))}
                  <span className="program-modal-step-label">
                    Step {cpStep} of 2
                  </span>
                </div>
              </div>
              <button
                aria-label="Close"
                className="modal__close"
                disabled={cpSaving}
                onClick={closeCpModal}
                type="button"
              >
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
                  <path d="m1 1 10 10M11 1 1 11" />
                </svg>
              </button>
            </div>

            {/* ── Step 1: Identitas Program ── */}
            {cpStep === 1 && (
              <form onSubmit={submitCpStep1}>
                <div className="modal__body program-modal-body">
                  <section className="program-modal-section">
                    <div className="program-modal-section__intro">
                      <h4>Core identity</h4>
                      <p>This information appears in the portfolio roster and on the program detail page.</p>
                    </div>
                    <div className="program-form-grid program-form-grid--title">
                      <div className="form-field">
                        <label>Code <span className="form-field__required">*</span></label>
                        <input
                          maxLength={40}
                          minLength={3}
                          onChange={e => {
                            setCpCodeManuallyEdited(true)
                            setCpForm(f => ({ ...f, code: e.target.value.toUpperCase() }))
                          }}
                          placeholder="Auto-generated from the name"
                          required
                          type="text"
                          value={cpForm.code}
                        />
                        <p className="form-field__hint">
                          {cpForm.code
                            ? <span className="form-field__hint--preview">{cpForm.code}</span>
                            : 'Filled in automatically as you type the name'}
                        </p>
                      </div>
                      <div className="form-field">
                        <label>Program Name <span className="form-field__required">*</span></label>
                        <input
                          maxLength={120}
                          minLength={3}
                          onChange={e => {
                            const name = e.target.value
                            const divisiCode = resolveDivisiCode(cpOwnerUnitId)
                            setCpForm(f => ({
                              ...f,
                              name,
                              code: cpCodeManuallyEdited ? f.code : suggestCode(name, divisiCode),
                            }))
                          }}
                          placeholder="Program name"
                          required
                          type="text"
                          value={cpForm.name}
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Description</label>
                      <textarea
                        className="composer__input program-modal-textarea"
                        maxLength={400}
                        onChange={e => setCpForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Brief description (optional)"
                        rows={2}
                        value={cpForm.description}
                      />
                    </div>
                  </section>

                  <section className="program-modal-section">
                    <div className="program-modal-section__intro">
                      <h4>Execution rhythm</h4>
                      <p>Set priority and timing so progress can be tracked from the start.</p>
                    </div>
                    <div className="form-field">
                      <label>Priority</label>
                      <select
                        className="form-input"
                        onChange={e => setCpForm(f => ({ ...f, priority: e.target.value }))}
                        value={cpForm.priority}
                      >
                        <option value="CRITICAL">Critical</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </div>
                    <div className="program-form-grid program-form-grid--equal">
                      <div className="form-field">
                        <label>Start Date <span className="form-field__required">*</span></label>
                        <input
                          onChange={e => {
                            const newStart = e.target.value
                            setCpForm(f => {
                              // Re-validate: kalau targetEndDate sudah diisi dan
                              // sekarang start > end, clear targetEndDate supaya
                              // user explicit re-pilih. Mencegah submit dengan
                              // tanggal invalid yang lolos HTML5 min check saat
                              // urutan input start-after-end terjadi.
                              const next = { ...f, startDate: newStart }
                              if (next.targetEndDate && newStart && next.targetEndDate < newStart) {
                                next.targetEndDate = ''
                              }
                              return next
                            })
                          }}
                          required
                          type="date"
                          value={cpForm.startDate}
                        />
                      </div>
                      <div className="form-field">
                        <label>Target Completion <span className="form-field__required">*</span></label>
                        <input
                          min={cpForm.startDate || undefined}
                          onChange={e => setCpForm(f => ({ ...f, targetEndDate: e.target.value }))}
                          required
                          type="date"
                          value={cpForm.targetEndDate}
                        />
                        {cpForm.startDate && cpForm.targetEndDate && cpForm.targetEndDate < cpForm.startDate && (
                          <p className="form-field__hint" style={{ color: 'var(--red)' }}>
                            Target Completion must be after Start Date.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Section ke-3: Konteks strategis & owner. Sebelumnya field-field
                      ini orphan (tanpa section header) langsung di-render setelah
                      Ritme eksekusi — bikin user bingung mana group apa. Section
                      explicit memberi struktur visual yang konsisten dengan 2 section
                      sebelumnya. */}
                  <section className="program-modal-section">
                    <div className="program-modal-section__intro">
                      <h4>Strategic context &amp; owner</h4>
                      <p>Map the program to AGHRIS pillars and who is responsible. Editable later from the detail page.</p>
                    </div>
                    <div className="program-form-grid program-form-grid--equal">
                      <div className="form-field">
                        <label>Group</label>
                        <select
                          className="form-input"
                          onChange={e => setCpForm(f => ({ ...f, kelompok: e.target.value }))}
                          value={cpForm.kelompok}
                        >
                          <option value="">— Select group —</option>
                          <option value="SCORECARD">Scorecard</option>
                          <option value="NON_SCORECARD">Non Scorecard</option>
                        </select>
                      </div>
                      {showPillarField && (
                        <div className="form-field">
                          <label>Strategic Pillar</label>
                          <select
                            className="form-input"
                            onChange={e => setCpForm(f => ({ ...f, pilarStrategis: e.target.value }))}
                            value={cpForm.pilarStrategis}
                          >
                            <option value="">— Select pillar —</option>
                            {Object.entries(pillarOptions).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                  <div className="form-field">
                    <label>Lead PIC</label>
                    {cpUserDirectory.length === 0 ? (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          void api.get<{ data: Array<{ id: number; name: string; positionTitle?: string | null }> }>('/users/directory')
                            .then(r => setCpUserDirectory(r.data ?? []))
                            .catch((err) => console.error('[Atlas] Gagal memuat user directory (CP):', err))
                        }}
                        type="button"
                      >
                        Select lead PIC…
                      </button>
                    ) : (
                      <select
                        className="form-input"
                        onChange={e => setCpOwnerId(Number(e.target.value))}
                        value={cpOwnerId ?? currentUser?.id ?? ''}
                      >
                        {cpUserDirectory.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name}{u.positionTitle ? ` — ${u.positionTitle}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {cpUnits.length > 0 && (
                    <div className="form-field">
                      <label>Owner Division</label>
                      <select
                        className="form-input"
                        onChange={e => {
                          const newId = e.target.value ? Number(e.target.value) : null
                          setCpOwnerUnitId(newId)
                          if (!cpCodeManuallyEdited && cpForm.name.trim()) {
                            const divisiCode = resolveDivisiCode(newId)
                            setCpForm(f => ({ ...f, code: suggestCode(f.name, divisiCode) }))
                          }
                        }}
                        value={cpOwnerUnitId ?? currentUser?.unit?.id ?? ''}
                      >
                        <option value="">— Auto (from your unit) —</option>
                        {cpUnits.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.code} — {u.name}
                          </option>
                        ))}
                      </select>
                      <p className="form-field__hint">
                        Default: your division ({currentUser?.unit?.code ?? 'unknown'})
                      </p>
                    </div>
                  )}
                  </section>
                </div>
                <div className="modal__footer">
                  <button
                    className="btn btn--ghost"
                    disabled={cpSaving}
                    onClick={closeCpModal}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="profile-save-btn"
                    disabled={!cpForm.code.trim() || !cpForm.name.trim() || !cpForm.startDate || !cpForm.targetEndDate}
                    type="submit"
                  >
                    Next →
                  </button>
                </div>
              </form>
            )}

            {/* ── Step 2: KPI Impact ── */}
            {cpStep === 2 && (() => {
              const alreadyAdded = new Set(cpKpiCodes)
              const cpKpiResults = apmsKpis.filter(k =>
                !alreadyAdded.has(k.kode) &&
                (cpKpiSearch === '' || k.kode.toLowerCase().includes(cpKpiSearch.toLowerCase()) || k.nama.toLowerCase().includes(cpKpiSearch.toLowerCase()))
              ).slice(0, 8)
              return (
                <form onSubmit={submitCreateProgram}>
                  <div className="modal__body program-modal-body">
                    {cpError && (
                      <div className="program-modal-error">
                        {cpError}
                      </div>
                    )}
                    <section className="program-modal-section program-modal-section--soft">
                      <div className="program-modal-section__intro">
                        <h4>KPI Mapping</h4>
                        <p className="program-modal-copy">
                          Which APMS KPIs does the <strong>{cpForm.name}</strong> program affect?
                          This helps track the program's contribution to AGHRIS targets.
                        </p>
                      </div>

                      {/* Mutually exclusive choice — radio group lebih akurat dari
                          checkbox optional. User pilih sumber KPI dulu, baru lihat
                          UI yang relevan (search atau note). */}
                      <div className="program-kpi-mode" role="radiogroup" aria-label="Program KPI source">
                        <label className={`program-kpi-mode__opt${!cpHasNoApmsKpi ? ' is-active' : ''}`}>
                          <input
                            type="radio"
                            name="kpi-mode"
                            checked={!cpHasNoApmsKpi}
                            onChange={() => setCpHasNoApmsKpi(false)}
                          />
                          <div className="program-kpi-mode__body">
                            <span className="program-kpi-mode__title">Link to APMS KPI</span>
                            <span className="program-kpi-mode__hint">Select one or more APMS KPIs that this program directly affects.</span>
                          </div>
                        </label>
                        <label className={`program-kpi-mode__opt${cpHasNoApmsKpi ? ' is-active' : ''}`}>
                          <input
                            type="radio"
                            name="kpi-mode"
                            checked={cpHasNoApmsKpi}
                            onChange={() => {
                              setCpHasNoApmsKpi(true)
                              setCpKpiCodes([])
                            }}
                          />
                          <div className="program-kpi-mode__body">
                            <span className="program-kpi-mode__title">Set your own internal KPI</span>
                            <span className="program-kpi-mode__hint">No APMS reference for this program — define an internal target later.</span>
                          </div>
                        </label>
                      </div>

                      {!cpHasNoApmsKpi && (
                        <div className="prog-kpi-picker">
                          <input
                            className="kpi-link-input"
                            type="text"
                            placeholder="Search APMS KPI by code or name…"
                            value={cpKpiSearch}
                            onChange={e => { setCpKpiSearch(e.target.value); setCpKpiDropdownOpen(true) }}
                            onFocus={() => setCpKpiDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setCpKpiDropdownOpen(false), 150)}
                            autoComplete="off"
                          />
                          {cpKpiDropdownOpen && cpKpiResults.length > 0 && (
                            <div className="prog-kpi-dropdown">
                              {cpKpiResults.map(k => (
                                <button
                                  key={k.kode}
                                  type="button"
                                  className="prog-kpi-dropdown__item"
                                  onMouseDown={() => {
                                    setCpKpiCodes(prev => [...prev, k.kode])
                                    setCpKpiSearch('')
                                    setCpKpiDropdownOpen(false)
                                  }}
                                >
                                  <span className="code-badge prog-kpi-dropdown__code">{k.kode}</span>
                                  <span className="prog-kpi-dropdown__name">{k.nama}</span>
                                  <span className="prog-kpi-dropdown__weight">weight {k.bobot}%</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {cpKpiDropdownOpen && cpKpiSearch.length > 0 && cpKpiResults.length === 0 && (
                            <div className="prog-kpi-dropdown prog-kpi-dropdown--empty">
                              No matching KPIs.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="program-modal-selection-meta">
                        <span>{cpKpiCodes.length} KPI selected</span>
                        {!cpHasNoApmsKpi && <span>Select at least 1 primary KPI before creating the program.</span>}
                      </div>

                      {cpKpiCodes.length > 0 ? (
                        <div className="program-kpi-chip-list">
                          {cpKpiCodes.map(code => {
                            const meta = apmsKpis.find(k => k.kode === code)
                            return (
                              <span key={code} className="program-kpi-chip">
                                <span className="code-badge program-kpi-chip__code">{code}</span>
                                {meta && <span className="program-kpi-chip__name">{meta.nama.slice(0, 30)}{meta.nama.length > 30 ? '…' : ''}</span>}
                                <button
                                  type="button"
                                  className="program-kpi-chip__remove"
                                  onClick={() => setCpKpiCodes(prev => prev.filter(c => c !== code))}
                                >×</button>
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="program-modal-empty">
                          No KPI selected yet. Use the search above to link the most relevant APMS KPIs.
                        </div>
                      )}
                    </section>

                    {cpHasNoApmsKpi && (
                      <div className="program-kpi-note">
                        After the program is created, define internal KPIs from the <strong>APMS KPI</strong> tab on the detail page.
                      </div>
                    )}
                  </div>
                  <div className="modal__footer">
                    <button
                      className="btn btn--ghost"
                      disabled={cpSaving}
                      onClick={() => setCpStep(1)}
                      type="button"
                    >
                      ← Back
                    </button>
                    <button
                      className="profile-save-btn"
                      disabled={cpSaving || (!cpHasNoApmsKpi && cpKpiCodes.length === 0)}
                      type="submit"
                    >
                      {cpSaving ? 'Saving…' : 'Create Program'}
                    </button>
                  </div>
                </form>
              )
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ── Archive tab ─────────────────────────────────────────────────────── */}
      {tab === 'archive' && (
        <div className="view-tab-body">
          <div className="section-block">
            <div className="section-header">
              <div>
                <h3 className="section-title">Archived Programs</h3>
                <p className="section-subtitle">Archived programs. Data stays intact and can be restored anytime.</p>
              </div>
              <span className="section-badge">{archivedPrograms.length} program</span>
            </div>
            {archivedLoading ? (
              <SkeletonStack lines={[90, 75, 60]} />
            ) : archivedError ? (
              <div className="roadmap-empty roadmap-empty--error" role="alert">
                <p className="text-sm">Failed to load archived programs.</p>
                <p className="text-xs text-muted">{archivedError}</p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={loadArchivedPrograms}>
                  Try again
                </button>
              </div>
            ) : archivedPrograms.length === 0 ? (
              <SectionState
  tone="info"
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </svg>
  }
  title="No archive"
  text="No programs archived yet."
/>
            ) : (
              <div className="program-roster">
                {archivedPrograms.map(prog => (
                  <div key={prog.id} className="list-row list-row--archived">
                    <div className="program-row__main program-row__main--static">
                      <div className="program-row__identity">
                        <span className="code-badge program-row__code">{prog.code}</span>
                        <div className="program-row__info">
                          <strong>{prog.name}</strong>
                          <div className="program-row__meta">
                            <span className="program-row__meta-primary">{prog.workstreamCount} workstream</span>
                            <span className="program-row__meta-sep">•</span>
                            <span className="program-row__meta-primary">
                              Archived {new Date(prog.archivedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {prog.archivedByName ? ` by ${prog.archivedByName}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn--ghost archive-restore-btn"
                      onClick={() => setRestoreTarget({ id: prog.id, name: prog.name })}
                      type="button"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Edit Program ────────────────────────────────────────────── */}
      {(!!editProgram || closingOverlay === 'edit-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'edit-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !epSaving && closeEditProgram()}
        >
          <div aria-labelledby={editProgramTitleId} aria-modal="true" className="modal" ref={editProgramDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={editProgramTitleId}>Edit Program</h3>
                <p className="modal-subtitle">Update program details. Changes save immediately.</p>
              </div>
              <button aria-label="Close" className="modal__close" disabled={epSaving} onClick={closeEditProgram} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            {editProgram && (
              <form onSubmit={(e) => void submitEditProgram(e)}>
                <div className="modal__body">
                  {epError && <div className="prog-modal-error">{epError}</div>}
                  <div className="form-field">
                    <label>Program Name <span className="form-field__required">*</span></label>
                    <input autoFocus maxLength={120} minLength={3} onChange={e => setEditProgram(p => p ? { ...p, name: e.target.value } : p)} required type="text" value={editProgram.name} />
                  </div>
                  <div className="form-field">
                    <label>Description</label>
                    <textarea className="composer__input prog-modal-textarea" maxLength={400} onChange={e => setEditProgram(p => p ? { ...p, description: e.target.value } : p)} rows={2} value={editProgram.description} />
                  </div>
                  {editProgram.approvalStatus === 'ACTIVE' && (
                    <div className="form-field">
                      <label>Operational status</label>
                      <select className="form-input" onChange={e => setEditProgram(p => p ? { ...p, status: e.target.value } : p)} value={editProgram.status}>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="ON_HOLD">On Hold</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>
                  )}
                  <div className="form-field">
                    <label>Priority</label>
                    <select className="form-input" onChange={e => setEditProgram(p => p ? { ...p, priority: e.target.value } : p)} value={editProgram.priority}>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                  <div className="prog-form-grid prog-form-grid--equal">
                    <div className="form-field">
                      <label>Start Date</label>
                      <input onChange={e => setEditProgram(p => p ? { ...p, startDate: e.target.value } : p)} type="date" value={editProgram.startDate} />
                    </div>
                    <div className="form-field">
                      <label>Target Completion</label>
                      <input onChange={e => setEditProgram(p => p ? { ...p, targetEndDate: e.target.value } : p)} type="date" value={editProgram.targetEndDate} />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Lead PIC</label>
                    {epDirLoading ? (
                      <p className="form-hint text-muted">Loading user directory…</p>
                    ) : epUserDirectory.length === 0 ? (
                      <p className="form-hint text-muted">Failed to load user directory.</p>
                    ) : (
                      <UserPicker
                        currentUserId={currentUser?.id}
                        onChange={id => setEditProgram(p => p ? { ...p, ownerId: id } : p)}
                        options={epUserDirectory}
                        placeholder="Select lead PIC…"
                        value={editProgram.ownerId ?? currentUser?.id ?? null}
                      />
                    )}
                  </div>

                  <div className="prog-form-grid prog-form-grid--equal">
                    <div className="form-field">
                      <label>Group</label>
                      <select
                        className="form-input"
                        onChange={e => setEditProgram(p => p ? { ...p, kelompok: e.target.value } : p)}
                        value={editProgram.kelompok}
                      >
                        <option value="">— Select group —</option>
                        <option value="SCORECARD">Scorecard</option>
                        <option value="NON_SCORECARD">Non Scorecard</option>
                      </select>
                    </div>
                    {showPillarField && (
                      <div className="form-field">
                        <label>Strategic Pillar</label>
                        <select
                          className="form-input"
                          onChange={e => setEditProgram(p => p ? { ...p, pilarStrategis: e.target.value } : p)}
                          value={editProgram.pilarStrategis}
                        >
                          <option value="">— Select pillar —</option>
                          {Object.entries(pillarOptions).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="form-field">
                    <label>Current Progress</label>
                    <textarea
                      className="composer__input prog-modal-textarea"
                      maxLength={2000}
                      onChange={e => setEditProgram(p => p ? { ...p, progresTerkini: e.target.value } : p)}
                      placeholder="What is done or in progress?"
                      rows={3}
                      value={editProgram.progresTerkini}
                    />
                  </div>

                  <div className="form-field">
                    <label>Support Needed</label>
                    <textarea
                      className="composer__input prog-modal-textarea"
                      maxLength={2000}
                      onChange={e => setEditProgram(p => p ? { ...p, dukunganDibutuhkan: e.target.value } : p)}
                      placeholder="Support, escalation, or decisions needed"
                      rows={2}
                      value={editProgram.dukunganDibutuhkan}
                    />
                  </div>
                </div>
                <div className="modal__footer">
                  <button className="btn btn--ghost" disabled={epSaving} onClick={closeEditProgram} type="button">Cancel</button>
                  <button className="profile-save-btn" disabled={epSaving || !editProgram.name.trim()} type="submit">
                    {epSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal: Konfirmasi Archive ─────────────────────────────────────── */}
      {(!!archiveTarget || closingOverlay === 'archive-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'archive-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !archiveSaving && closeArchiveModal()}
        >
          <div aria-labelledby={archiveTitleId} aria-modal="true" className="modal modal--warning" ref={archiveDialogRef} role="alertdialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={archiveTitleId}>Archive Program?</h3>
              </div>
            </div>
            <div className="modal__body">
              {archiveError && <div className="prog-modal-error">{archiveError}</div>}
              <div className="confirm-warning-box">
                <svg className="confirm-warning-box__icon" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                <div>
                  <p className="confirm-warning-box__title">This program will be hidden from all views.</p>
                  <p className="confirm-warning-box__body">
                    <strong>{archiveTarget?.name}</strong> and all its workstreams, tasks, and related data are <em>not deleted</em> — only archived. Superadmin and KADIV can restore it anytime.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" disabled={archiveSaving} onClick={closeArchiveModal} type="button">Cancel</button>
              <button className="btn btn--danger" disabled={archiveSaving} onClick={() => void submitArchive()} type="button">
                {archiveSaving ? 'Archiving…' : 'Yes, Archive'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal: Konfirmasi Restore ─────────────────────────────────────── */}
      {(!!restoreTarget || closingOverlay === 'restore-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'restore-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !restoreSaving && closeRestoreModal()}
        >
          <div aria-labelledby={restoreTitleId} aria-modal="true" className="modal" ref={restoreDialogRef} role="alertdialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={restoreTitleId}>Restore Program?</h3>
              </div>
            </div>
            <div className="modal__body">
              {restoreError && <div className="prog-modal-error">{restoreError}</div>}
              <p>Program <strong>{restoreTarget?.name}</strong> will be restored and reappear in all views.</p>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" disabled={restoreSaving} onClick={closeRestoreModal} type="button">Cancel</button>
              <button className="profile-save-btn" disabled={restoreSaving} onClick={() => void submitRestore()} type="button">
                {restoreSaving ? 'Restoring…' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Kebab dropdown + backdrop — di-render via portal ke document.body
          agar tidak ter-clip oleh overflow:hidden/auto di ancestor mana pun */}
      </div>
      {showBatchExport && createPortal(
        <div
          className="modal-backdrop"
          onClick={() => !batchExporting && closeBatchExport()}
        >
          <div
            ref={batchDialogRef}
            className="modal batch-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={batchTitleId}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={batchTitleId}>Export Charter PPTX</h3>
                <p className="modal__subtitle">
                  Select several programs — 1 PPTX file, 1 slide per program.
                </p>
              </div>
              <button
                type="button"
                className="modal__close"
                onClick={closeBatchExport}
                disabled={batchExporting}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal__body">
              <input
                type="search"
                className="form-input batch-export__search"
                placeholder="Search by program code or name…"
                value={batchSearch}
                onChange={e => setBatchSearch(e.target.value)}
                disabled={batchExporting}
                autoFocus
              />
              <div className="batch-export__list">
                <label className="batch-export__row batch-export__row--head">
                  <input
                    type="checkbox"
                    checked={batchAllVisibleSelected}
                    onChange={toggleBatchAll}
                    disabled={batchExporting || batchFilteredPrograms.length === 0}
                    aria-label="Select all visible programs"
                  />
                  <span className="batch-export__head-label">
                    {batchAllVisibleSelected ? 'Clear' : 'Select all'}
                    {' '}({batchFilteredPrograms.length})
                  </span>
                  <span className="batch-export__head-counter">
                    {batchSelectedIds.size} selected
                  </span>
                </label>
                {batchFilteredPrograms.length === 0 ? (
                  <div className="batch-export__empty">
                    {batchSearch
                      ? `No programs match "${batchSearch}".`
                      : 'No programs yet.'}
                  </div>
                ) : batchFilteredPrograms.map(p => {
                  const selected = batchSelectedIds.has(p.id)
                  return (
                    <label key={p.id} className={`batch-export__row${selected ? ' batch-export__row--selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleBatchOne(p.id)}
                        disabled={batchExporting}
                      />
                      <span className="batch-export__code">{p.code}</span>
                      <span className="batch-export__name">{p.name}</span>
                      <span className={`batch-export__health batch-export__health--${normalizeHealthStatus(p.healthStatus).toLowerCase()}`}>
                        {healthStatusLabel(normalizeHealthStatus(p.healthStatus))}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="modal__footer">
              {batchError && (
                <span className="batch-export__error" role="alert">{batchError}</span>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeBatchExport}
                disabled={batchExporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleBatchExport}
                disabled={batchSelectedIds.size === 0 || batchExporting}
              >
                {batchExporting
                  ? `Preparing ${batchSelectedIds.size} programs…`
                  : batchSelectedIds.size === 0
                    ? 'Select at least 1 program'
                    : `Export ${batchSelectedIds.size} programs →`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {kebabMenu !== null && createPortal(
        <>
          <div className="kebab-close-backdrop" onClick={closeKebab} />
          <div
            className="program-row__kebab-menu"
            style={{ position: 'fixed', top: kebabMenu.top, right: kebabMenu.right, zIndex: 9001 }}
            onClick={e => e.stopPropagation()}
          >
            {roleAccess.canEditProgram(kebabMenu.isOwner) && (
              <button className="kebab-menu__item" onClick={() => { openEditProgram(kebabMenu.prog); closeKebab() }} type="button">
                <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><path d="M11.5 2.5a2.121 2.121 0 1 1 3 3L6 14H2v-4L11.5 2.5Z"/></svg>
                Edit
              </button>
            )}
            {roleAccess.canArchiveProgram(kebabMenu.isOwner) && (
              <button className="kebab-menu__item kebab-menu__item--danger" onClick={() => { setArchiveTarget({ id: kebabMenu.progId, name: kebabMenu.progName }); closeKebab() }} type="button">
                <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><rect height="3" rx="0.5" width="12" x="2" y="2"/><path d="M3.5 5v8a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5M6.5 8h3"/></svg>
                Archive
              </button>
            )}
          </div>
        </>,
        document.body
      )}
      <toast.View />
    </div>
  )
}

export default ProgramsView
