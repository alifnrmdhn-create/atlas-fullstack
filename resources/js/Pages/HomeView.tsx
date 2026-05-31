import { useState, Fragment } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useAuth } from '../hooks/useAuth'
import { SkeletonBlock, SectionState } from '../components/ui'
import { EscalationButton } from '../components/Escalation'
import { PortfolioAnalytics } from '../components/PortfolioAnalytics'
import { Card, Pill, Sparkline, Meter, Delta, Donut, Bars, Tooltip } from '../design-system'
import { scoreTone, healthTone, type Tone } from '../lib/tone'
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

/* Decorative isometric motif for the hero — stacked translucent planes evoke
 * the "platform/structure" of the mockup. Static (no transform-in-scroll),
 * theme-aware via currentColor. PLACEHOLDER pending design refinement. */
function HeroMotif() {
  return (
    <svg className="hvc__motif" viewBox="0 0 200 160" aria-hidden focusable="false">
      <defs>
        <linearGradient id="hvc-motif-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ds-green-600)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--ds-green-600)" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map(i => {
        const dy = i * 26
        return (
          <g key={i} opacity={0.85 - i * 0.22}>
            <path
              d={`M100 ${26 + dy} L172 ${62 + dy} L100 ${98 + dy} L28 ${62 + dy} Z`}
              fill="url(#hvc-motif-g)"
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
          </g>
        )
      })}
    </svg>
  )
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

/* Program status row — label + proportional Meter + count (reused for the
 * "Overdue per divisi" panel). */
function StatusBar({
  label, value, total, tone, onClick,
}: {
  label: string
  value: number
  total: number
  tone: Tone
  onClick: () => void
}) {
  return (
    <button type="button" className="hv__status-row" onClick={onClick}>
      <span className="hv__status-label">
        <span className="hv__dot" data-tone={tone} aria-hidden />
        {label}
      </span>
      <Meter className="hv__status-meter" value={value} max={total} tone={tone} height={6} aria-label={`${label}: ${value}`} />
      <span className="hv__status-val">{value}</span>
    </button>
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

  // Inline "✓ Tereskalasi" confirmation for the below-the-fold action tables.
  const [recentlyEscalated, setRecentlyEscalated] = useState<Set<number>>(new Set())
  const [tab, setTab] = useState<'program' | 'analisis' | 'divisi'>('program')
  const markEscalated = (programId: number) => {
    setRecentlyEscalated(prev => new Set(prev).add(programId))
    setTimeout(() => {
      setRecentlyEscalated(prev => {
        const next = new Set(prev)
        next.delete(programId)
        return next
      })
    }, 5000)
  }

  if (overviewStatus.loading && !programSummary) {
    return (
      <div className="ds home-v2">
        <div className="hv">
          <SkeletonBlock height={18} width="220px" />
          <div style={{ height: 20 }} />
          <SkeletonBlock height={96} width="100%" />
          <div style={{ height: 24 }} />
          <SkeletonBlock height={220} width="100%" />
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

  const {
    summary, byDivisi, controls, needsAction, trendSeries, programsForChart,
    velocity, momentum, recentActivity, deadlineClusters, scope,
  } = programSummary
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
  const statusTone: Tone =
    (tlm > 0 || belowTargetCount > 0 || criticalControlCount > 0) ? 'red'
    : (summary.atRisk > 0 || needsAction.length > 0) ? 'amber'
    : 'green'
  const statusLabel = statusTone === 'green' ? 'Terkendali' : statusTone === 'amber' ? 'Perhatian' : 'Tindakan'

  /* ── Exception list (only what needs a decision) ─────────────── */
  type Exc = { id: string; tone: Tone; label: ReactNode; meta?: string; onClick: () => void }
  const exceptions: Exc[] = []
  if (tlm > 0) {
    exceptions.push({
      id: 'tlm', tone: 'red',
      label: <><strong>{tlm} program</strong> terlambat</>,
      meta: 'Butuh intervensi', onClick: () => navigate('/programs'),
    })
  }
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
  const trendValues = (trendSeries ?? []).slice(-14).map(t => t.pctOnTrack)
  const trendDelta = trendValues.length >= 2
    ? trendValues[trendValues.length - 1] - trendValues[0]
    : null

  /* ── Analisis charts (Pak Iswahyudi: diagram batang + lingkaran) ───── */
  const shortCode = (kode: string) => kode.split('-')[0]
  const statusSegments = [
    { value: summary.onTrack, tone: 'green' as Tone,   label: 'On Track' },
    { value: summary.atRisk,  tone: 'amber' as Tone,   label: 'At Risk' },
    { value: tlm,             tone: 'red' as Tone,     label: 'Terlambat' },
    { value: draftPipeline,   tone: 'neutral' as Tone, label: 'Draft / pipeline' },
  ]
  const kpiTrendBars = scorecard.kpiTrend.map(t => ({
    label: t.label,
    value: t.avg,
    tone: (t.avg != null ? scoreTone(t.avg) : 'neutral') as Tone,
  }))
  const hasKpiTrend = canSeePerformance && kpiTrendBars.some(b => b.value != null)
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

  /* ── Command-center: Momentum ────────────────────────────────── */
  const activeRatePct = momentum ? Math.round((momentum.activeRate ?? 0) * (momentum.activeRate <= 1 ? 100 : 1)) : 0
  const momentumStats = momentum ? [
    { label: 'Program selesai · 30 hari', value: momentum.programsCompletedLast30d, tone: 'green' as Tone },
    { label: 'Program baru · 30 hari', value: momentum.newProgramsLast30d, tone: 'neutral' as Tone },
    { label: 'Task selesai · pekan ini', value: momentum.tasksCompletedThisWeek, tone: 'green' as Tone },
    { label: 'Program mandek', value: momentum.stagnantCount, tone: (momentum.stagnantCount > 0 ? 'red' : 'green') as Tone },
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

  /* ── Mid: Top 5 program terlambat ────────────────────────────── */
  const top5Terlambat = [...programsForChart]
    .filter(p => p.healthTone === 'terlambat' || p.healthTone === 'overdue')
    .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
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
    .filter(p => p.approvalStatus === 'ACTIVE' && p.daysRemaining != null)
    .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
    .slice(0, 10)

  return (
    <>
      <Head title="Home" />
      <div className="ds home-v2">
        <div className="hv hv--cockpit">

          {/* ─── Greeting + period context ─────────────────── */}
          <header className="hv__head hvc__head">
            <h1 className="hv__greeting">
              {getGreeting()},{' '}
              <span className="hv__greeting-name">{currentUser?.name ?? 'Anda'}</span>
            </h1>
            <div className="hvc__head-meta">
              <Pill tone={statusTone} variant="soft"><ToneGlyph tone={statusTone} />{statusLabel}</Pill>
              <Pill tone="neutral" variant="soft">Q{getQuarter(now)} · W{getISOWeek(now)}</Pill>
            </div>
          </header>

          {/* ═══════════════ HERO band ═══════════════ */}
          <section className="hvc__hero" aria-label="Ringkasan utama">

            {/* % Achievement — lagging headline */}
            {canSeePerformance && (
              <Card padding="lg" className="hvc__hero-kpi" data-tone={hasKpi ? kpiTone : 'neutral'}>
                <span className="hvc__eyebrow">% Achievement · {scorecard.periodeLabel}</span>
                <div className="hvc__hero-kpi-row">
                  <span className="hvc__bignum" data-tone={hasKpi ? kpiTone : 'neutral'}>
                    {hasKpi ? kpiHeadline.toFixed(1) : '—'}
                    {hasKpi && <span className="hvc__bignum-unit">%</span>}
                  </span>
                  {hasKpi && scorecard.avgDelta != null && <Delta value={scorecard.avgDelta} />}
                </div>
                <div className="hvc__hero-kpi-foot">
                  <span className="hvc__sub">
                    {scorecard.ownItem ? scorecard.ownItem.nama : `Rata-rata ${scorecard.totalItem} ${scorecard.itemLabel}`}
                  </span>
                  {hasKpi && kpiSpark.length >= 2 && (
                    <Sparkline values={kpiSpark} tone={kpiTone} width={140} height={36} />
                  )}
                </div>
              </Card>
            )}

            {/* Execution rate — leading donut */}
            <Card padding="lg" className="hvc__hero-donut" data-tone={programTone}>
              <span className="hvc__eyebrow">Execution rate</span>
              <div className="hvc__donut-wrap">
                <Donut
                  segments={statusSegments}
                  centerValue={`${onTrackPct}%`}
                  centerLabel="on track"
                  size={132}
                  thickness={15}
                  onSliceClick={() => navigate('/programs')}
                />
              </div>
              <span className="hvc__sub">{summary.onTrack}/{activeProgramCount} program aktif on track</span>
            </Card>

            {/* Stat tiles */}
            <div className="hvc__hero-stats">
              <button type="button" className="hvc__stat" data-tone={tlm > 0 ? 'red' : 'green'} onClick={() => navigate('/programs')}>
                <span className="hvc__stat-val" data-tone={tlm > 0 ? 'red' : 'green'}>{tlm}</span>
                <span className="hvc__stat-label">Program terlambat</span>
              </button>
              <button type="button" className="hvc__stat" data-tone="green" onClick={() => navigate('/programs')}>
                <span className="hvc__stat-val" data-tone="green">{summary.selesai}</span>
                <span className="hvc__stat-label">Selesai</span>
              </button>
              <button type="button" className="hvc__stat" data-tone="neutral" onClick={() => navigate('/programs')}>
                <span className="hvc__stat-val">{summary.total}</span>
                <span className="hvc__stat-label">Total program</span>
              </button>
              <button type="button" className="hvc__stat" data-tone={exceptionCount > 0 ? 'amber' : 'green'} onClick={() => navigate('/fokus')}>
                <span className="hvc__stat-val" data-tone={exceptionCount > 0 ? 'amber' : 'green'}>{exceptionCount}</span>
                <span className="hvc__stat-label">Perlu aksi</span>
              </button>
            </div>

            {/* Decorative hero visual (placeholder — refine) */}
            <Card padding="lg" className="hvc__hero-visual" data-tone="green">
              <HeroMotif />
              <div className="hvc__hero-visual-cap">
                <span className="hvc__eyebrow">ATLAS · Command Center</span>
                <span className="hvc__sub">{summary.total} program · {scope?.name ?? 'Portfolio'}</span>
              </div>
            </Card>
          </section>

          {/* ═══════════════ EXECUTION COMMAND CENTER ═══════════════ */}
          <section className="hvc__section" aria-label="Execution Command Center">
            <header className="hvc__sec-head">
              <h2 className="hvc__sec-title">Execution Command Center</h2>
            </header>
            <div className="hvc__grid hvc__grid--cmd">

              {/* Horizon — workload by deadline window */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Horizon · beban tenggat</span></header>
                {horizonBars.length > 0
                  ? <Bars bars={horizonBars} height={150} />
                  : <p className="hvc__empty">Tidak ada program aktif bertenggat.</p>}
              </Card>

              {/* Momentum */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Momentum</span></header>
                <div className="hvc__mhead">
                  <span className="hvc__bignum hvc__bignum--sm" data-tone={activeRatePct >= 60 ? 'green' : activeRatePct >= 30 ? 'amber' : 'red'}>
                    {activeRatePct}<span className="hvc__bignum-unit">%</span>
                  </span>
                  <span className="hvc__sub">program aktif bergerak</span>
                </div>
                <div className="hvc__mstats">
                  {momentumStats.map(s => (
                    <div key={s.label} className="hvc__mstat">
                      <span className="hvc__mstat-val" data-tone={s.tone}>{s.value}</span>
                      <span className="hvc__mstat-label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Overdue per divisi */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Overdue per divisi</span></header>
                {overdueRows.length > 0 ? (
                  <div className="hv__status-list">
                    {overdueRows.map(d => (
                      <StatusBar
                        key={d.unit.code}
                        label={d.unit.code}
                        value={d.value}
                        total={overdueMax}
                        tone="red"
                        onClick={() => navigate(canSeePerformance ? `/performance/divisi/${d.unit.code.toLowerCase()}` : '/programs')}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="hvc__empty">Tidak ada program terlambat di divisi mana pun. 🎯</p>
                )}
              </Card>

              {/* Alert & Insight */}
              <Card padding="lg" className="hvc__panel" data-tone={alignTone}>
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Alert &amp; Insight</span></header>

                {hasKpi && (
                  <Tooltip
                    side="bottom"
                    content={kpiDiverges
                      ? 'KPI (hasil/lagging) jauh di atas tingkat eksekusi program (leading). Bila tren berlanjut, KPI berisiko turun periode depan.'
                      : 'Hasil KPI dan tingkat eksekusi program relatif selaras.'}
                  >
                    <div className="hvc__align" data-tone={alignTone}>
                      <span className="hvc__align-pair"><b data-tone={kpiTone}>{kpiHeadline.toFixed(1)}%</b> hasil</span>
                      <span className="hvc__align-vs" aria-hidden>↔</span>
                      <span className="hvc__align-pair"><b data-tone={leadingTone}>{onTrackPct}%</b> eksekusi</span>
                      <span className="hvc__align-verdict" data-tone={alignTone}><ToneGlyph tone={alignTone} />{alignText}{kpiDiverges ? ` · ${alignGap}p` : ''}</span>
                    </div>
                  </Tooltip>
                )}

                {exceptions.length > 0 ? (
                  <div className="hv__exc-list">
                    {exceptions.map(e => (
                      <button key={e.id} type="button" className="hv__exc-row" data-tone={e.tone} onClick={e.onClick}>
                        <span className="hv__dot" data-tone={e.tone} aria-hidden />
                        <span className="hv__exc-label">{e.label}</span>
                        {e.meta && <span className="hv__exc-meta">{e.meta}</span>}
                        <span className="hv__exc-arrow" aria-hidden>→</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hvc__empty">Semua terkendali — tidak ada yang menunggu keputusan.</p>
                )}
              </Card>
            </div>
          </section>

          {/* ═══════════════ Mid grid ═══════════════ */}
          <section className="hvc__section">
            <div className="hvc__grid hvc__grid--mid">

              {/* Heatmap rekap program (divisi × status) */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Heatmap rekap program · per divisi</span></header>
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
                            <span className="hvc__topmeta">{p.divisi || '—'} · {p.code}</span>
                          </span>
                          <span className="hvc__topdays" data-tone="red">{daysLabel}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="hvc__empty">Tidak ada program terlambat. 🎯</p>
                )}
              </Card>

              {/* Activity timeline */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Aktivitas terbaru</span></header>
                {activity.length > 0 ? (
                  <ul className="hvc__activity">
                    {activity.map(a => (
                      <li key={a.id} className="hvc__act-row">
                        <span className="hvc__act-dot" aria-hidden />
                        <span className="hvc__act-text">{activityText(a)}</span>
                        <span className="hvc__act-time">{relativeTime(a.changeTimestamp)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hvc__empty">Belum ada aktivitas tercatat.</p>
                )}
              </Card>
            </div>
          </section>

          {/* ═══════════════ Bottom: deadline timeline + shortcut ═══════════════ */}
          <section className="hvc__section">
            <div className="hvc__grid hvc__grid--foot">

              {/* Timeline deadline program */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head">
                  <span className="hvc__eyebrow">Timeline deadline · program aktif</span>
                  <button type="button" className="hvc__link" onClick={() => navigate('/programs')}>Semua <span aria-hidden>→</span></button>
                </header>
                {topDeadlinePrograms.length > 0 ? (
                  <div className="hvc__timeline">
                    {topDeadlinePrograms.slice(0, 6).map(p => {
                      const days = p.daysRemaining ?? 0
                      const urgency: Tone = days < 0 ? 'red' : days <= 30 ? 'red' : days <= 90 ? 'amber' : 'green'
                      const daysLabel = days < 0 ? `${Math.abs(days)} hr lewat` : days === 0 ? 'Hari ini' : `${days} hari`
                      return (
                        <button key={p.id} type="button" className="hvc__tcard" data-tone={urgency} onClick={() => openProgramWorkspace(p.id)}>
                          <span className="hvc__tcard-days" data-tone={urgency}>{daysLabel}</span>
                          <span className="hvc__tcard-name" title={p.name}>{p.name}</span>
                          <span className="hvc__tcard-meta">{p.divisi || '—'} · {p.targetEndDate ?? '—'}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="hvc__empty">Tidak ada program aktif bertenggat.</p>
                )}
              </Card>

              {/* Shortcut */}
              <Card padding="lg" className="hvc__panel">
                <header className="hvc__panel-head"><span className="hvc__eyebrow">Shortcut</span></header>
                <div className="hvc__shortcuts">
                  {shortcuts.map(s => (
                    <button key={s.label} type="button" className="hvc__shortcut" data-tone={s.tone} onClick={s.onClick}>
                      <span className="hvc__shortcut-icon" data-tone={s.tone}><ShortcutIcon name={s.icon} /></span>
                      <span className="hvc__shortcut-label">{s.label}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </section>

          {/* ════════════ Detail lengkap (drill-down per tab) ════════════ */}
          <div className="hv__tabs" role="tablist" aria-label="Detail">
            <button type="button" role="tab" aria-selected={tab === 'program'} className="hv__tab" data-active={tab === 'program'} onClick={() => setTab('program')}>Program</button>
            <button type="button" role="tab" aria-selected={tab === 'analisis'} className="hv__tab" data-active={tab === 'analisis'} onClick={() => setTab('analisis')}>Analisis</button>
            <button type="button" role="tab" aria-selected={tab === 'divisi'} className="hv__tab" data-active={tab === 'divisi'} onClick={() => setTab('divisi')}>Divisi</button>
          </div>

          {/* ─── Tab Program: portfolio analytics ─── */}
          {tab === 'program' && <PortfolioAnalytics data={programSummary} />}

          {/* ─── Tab Analisis — chart untuk telaah (batang + lingkaran) ───── */}
          {tab === 'analisis' && (
          <section className="hv__section hv__analisis">
            <header className="hv__sec-head">
              <h2 className="hv__sec-title">Analisis</h2>
              {canSeePerformance && <span className="hv__sec-meta">KPI per {scorecard.periodeLabel}</span>}
            </header>
            <div className="hv__analisis-grid">
              {hasKpiTrend && (
                <div className="hv__chart-card">
                  <div className="hv__chart-title">Tren KPI · 6 bulan</div>
                  <Bars bars={kpiTrendBars} target={100} height={132} onBarClick={() => navigate('/performance/scorecard')} />
                </div>
              )}

              <div className="hv__chart-card">
                <div className="hv__chart-title">Komposisi status program</div>
                <div className="hv__donut-row">
                  <Donut
                    segments={statusSegments}
                    centerValue={`${onTrackPct}%`}
                    centerLabel="on track"
                    size={132}
                    thickness={16}
                    onSliceClick={() => navigate('/programs')}
                  />
                  <ul className="hv__legend">
                    {statusSegments.map(s => (
                      <li key={s.label} className="hv__legend-item">
                        <span className="hv__dot" data-tone={s.tone} aria-hidden />
                        <span className="hv__legend-label">{s.label}</span>
                        <span className="hv__legend-val">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {hasKpiDivisi && (
                <div className="hv__chart-card">
                  <div className="hv__chart-title">KPI per divisi</div>
                  <Bars bars={kpiDivisiBars} target={100} height={132} onBarClick={(_, i) => navigate(kpiRowUrl(kpiRows[i].kode))} />
                </div>
              )}
            </div>
          </section>
          )}

          {/* ─── Program ketat deadline ──────────── */}
          {tab === 'program' && topDeadlinePrograms.length > 0 && (
            <section className="hv__section">
              <header className="hv__sec-head">
                <h2 className="hv__sec-title">Program ketat deadline</h2>
                <span className="hv__sec-meta">Top {topDeadlinePrograms.length} · sort by hari tersisa</span>
              </header>
              <div className="hv__deadline-table">
                <div className="hv__deadline-row hv__deadline-row--head">
                  <span>Program</span>
                  <span>Divisi</span>
                  <span>Deadline</span>
                  <span>Hari tersisa</span>
                  <span>Progres terkini</span>
                  <span>Dukungan dibutuhkan</span>
                </div>
                {topDeadlinePrograms.map(p => {
                  const days = p.daysRemaining ?? 0
                  const urgency: 'critical' | 'urgent' | 'soon' | 'ok' =
                    days < 0 ? 'critical' : days <= 30 ? 'urgent' : days <= 90 ? 'soon' : 'ok'
                  const daysLabel = days < 0
                    ? `${Math.abs(days)} hari lewat`
                    : days === 0 ? 'Hari ini'
                    : `${days} hari lagi`
                  const canEscalate = urgency === 'critical' || urgency === 'urgent'
                  return (
                    <div key={p.id} className="hv__deadline-row-wrap">
                      <button type="button" className="hv__deadline-row" onClick={() => openProgramWorkspace(p.id)}>
                        <span className="hv__deadline-program">
                          <span className="hv__deadline-code">{p.code}</span>
                          <span className="hv__deadline-name">{p.name}</span>
                        </span>
                        <span className="hv__deadline-divisi">{p.divisi || '—'}</span>
                        <span className="hv__deadline-date">{p.targetEndDate ?? '—'}</span>
                        <span className="hv__deadline-countdown" data-urgency={urgency}>{daysLabel}</span>
                        <span className="hv__deadline-progress" title={p.progresTerkini ?? ''}>
                          {p.progresTerkini ? p.progresTerkini : <em className="hv__deadline-empty">—</em>}
                        </span>
                        <span className="hv__deadline-support" title={p.dukunganDibutuhkan ?? ''}>
                          {p.dukunganDibutuhkan ? p.dukunganDibutuhkan : <em className="hv__deadline-empty">—</em>}
                        </span>
                      </button>
                      {canEscalate && (
                        <div className="hv__row-action">
                          {recentlyEscalated.has(p.id) ? (
                            <span className="hv__row-escalated" role="status">✓ Tereskalasi</span>
                          ) : (
                            <EscalationButton
                              sourceType="AD_HOC"
                              prefillTitle={`Deadline ketat: ${p.code} — ${p.name}`}
                              prefillDescription={[
                                `${daysLabel} dari deadline ${p.targetEndDate ?? '—'}.`,
                                p.progresTerkini ? `\nProgres terkini: ${p.progresTerkini}` : '',
                                p.dukunganDibutuhkan ? `\nCatatan PIC: ${p.dukunganDibutuhkan}` : '',
                              ].join('').trim()}
                              linkedProgramId={p.id}
                              size="sm"
                              onCreated={() => markEscalated(p.id)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ─── Program butuh perhatian ──────────── */}
          {tab === 'program' && attentionPrograms.length > 0 && (
            <section className="hv__section">
              <header className="hv__sec-head">
                <h2 className="hv__sec-title">Program butuh perhatian</h2>
                <span className="hv__sec-meta">{summary.total} total</span>
              </header>
              <div className="hv__list">
                {attentionPrograms.map(p => {
                  const tone = healthTone(p.healthTone)
                  const label = tone === 'red' ? 'Terlambat'
                              : tone === 'amber' ? 'At Risk'
                              : tone === 'green' ? 'On Track'
                              : 'Idle / Draft'
                  const canEscalate = tone === 'red' || tone === 'amber'
                  return (
                    <div key={p.id} className="hv__list-row-wrap">
                      <button type="button" className="hv__list-row" onClick={() => openProgramWorkspace(p.id)}>
                        <span className="hv__list-code">{p.code}</span>
                        <span className="hv__list-name">{p.name}</span>
                        <span className="hv__list-divisi">{p.divisi || '—'}</span>
                        <span className="hv__list-bar" aria-hidden>
                          <span
                            className="hv__list-bar-fill"
                            data-tone={tone}
                            style={{ width: `${Math.min(Math.max(p.progressPercent, 0), 100)}%` }}
                          />
                        </span>
                        <span className="hv__list-pct">{Math.round(p.progressPercent)}%</span>
                        <span className="hv__list-status">
                          <span className="hv__dot" data-tone={tone} aria-hidden />
                          {label}
                        </span>
                      </button>
                      {canEscalate && (
                        <div className="hv__row-action">
                          {recentlyEscalated.has(p.id) ? (
                            <span className="hv__row-escalated" role="status">✓ Tereskalasi</span>
                          ) : (
                            <EscalationButton
                              sourceType="AD_HOC"
                              prefillTitle={`Butuh dukungan: ${p.code} — ${p.name}`}
                              prefillDescription={`Program berstatus ${label}, progress ${Math.round(p.progressPercent)}%.`}
                              linkedProgramId={p.id}
                              size="sm"
                              onCreated={() => markEscalated(p.id)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="hv__list-foot">
                <button type="button" className="hv__sec-link" onClick={() => navigate('/programs')}>
                  Lihat semua program ({summary.total}) <span aria-hidden>→</span>
                </button>
              </div>
            </section>
          )}

          {/* ─── Matrix Direktorat (cross-direktorat scorecard) ─── */}
          {tab === 'divisi' && isSuperAdmin && scorecard.grid && scorecard.grid.length > 0 && (
            <section className="hv__section">
              <header className="hv__sec-head">
                <h2 className="hv__sec-title">Matrix Direktorat</h2>
                <span className="hv__sec-meta">{scorecard.grid.length} direktorat · {scorecard.periodeLabel}</span>
              </header>
              <div className="hv__direktorat-grid">
                {scorecard.grid.map(d => {
                  const tone = scoreTone(d.nilai)
                  return (
                    <button
                      key={d.kode}
                      className="hv__direktorat-card"
                      data-tone={tone}
                      onClick={() => navigate(`/performance/scorecard?periode=${scorecard.periode}`)}
                      type="button"
                    >
                      <div className="hv__direktorat-card__head">
                        <div className="hv__direktorat-card__title">
                          <span className="hv__direktorat-card__code">{d.kode}</span>
                          <span className="hv__direktorat-card__name">{d.nama}</span>
                        </div>
                        <span className="hv__direktorat-card__nilai" data-tone={tone}>{d.nilai.toFixed(1)}%</span>
                      </div>
                      {d.divisi.length > 0 && (
                        <ul className="hv__direktorat-card__divisi">
                          {d.divisi.map(div => {
                            const divTone = scoreTone(div.nilai)
                            return (
                              <li key={div.kode} className="hv__direktorat-card__divisi-row">
                                <span className="hv__direktorat-card__divisi-code">{div.kode}</span>
                                <span className="hv__direktorat-card__divisi-name">{div.nama}</span>
                                <span className="hv__direktorat-card__divisi-nilai" data-tone={divTone}>{div.nilai.toFixed(1)}%</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* ─── Status per Divisi (slide 17 PPT — rollup) ───── */}
          {tab === 'divisi' && byDivisi.length > 0 && (
            <section className="hv__section">
              <header className="hv__sec-head">
                <h2 className="hv__sec-title">Status per divisi</h2>
                <span className="hv__sec-meta">{byDivisi.length} divisi · rollup health</span>
              </header>
              <div className="hv__rollup-table">
                <div className="hv__rollup-row hv__rollup-row--head">
                  <span>Divisi</span>
                  <span className="hv__rollup-num">On Track</span>
                  <span className="hv__rollup-num">At Risk</span>
                  <span className="hv__rollup-num">Terlambat</span>
                  <span className="hv__rollup-num">Completed</span>
                  <span className="hv__rollup-num">Total</span>
                  <span className="hv__rollup-num">% On Track</span>
                </div>
                {[...byDivisi]
                  .filter(d => d.unit.id !== null)
                  .sort((a, b) => a.pctOnTrack - b.pctOnTrack)
                  .map(d => {
                    const rowTlm = (d.terlambat ?? 0) + (d.overdue ?? 0)
                    const pctTone: Tone = d.pctOnTrack < 50 ? 'red' : d.pctOnTrack < 80 ? 'amber' : 'green'
                    return (
                      <button
                        key={d.unit.code}
                        type="button"
                        className="hv__rollup-row"
                        onClick={() => navigate(canSeePerformance ? `/performance/divisi/${d.unit.code.toLowerCase()}` : '/programs')}
                        title={d.unit.name}
                      >
                        <span className="hv__rollup-divisi">
                          <span className="hv__rollup-code">{d.unit.code}</span>
                          <span className="hv__rollup-name">{d.unit.name}</span>
                        </span>
                        <span className="hv__rollup-num" data-tone="green">{d.onTrack ?? 0}</span>
                        <span className="hv__rollup-num" data-tone="amber">{d.atRisk ?? 0}</span>
                        <span className="hv__rollup-num" data-tone="red">{rowTlm}</span>
                        <span className="hv__rollup-num" data-tone="neutral">{d.selesai ?? 0}</span>
                        <span className="hv__rollup-num hv__rollup-total">{d.total}</span>
                        <span className="hv__rollup-pct" data-tone={pctTone}>{Math.round(d.pctOnTrack)}%</span>
                      </button>
                    )
                  })}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
