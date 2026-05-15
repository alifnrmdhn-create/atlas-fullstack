import React from 'react'
import type { ReactNode } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { SkeletonBlock, SectionState } from '../components/ui'
import './HomeView.css'

/* ─── Inertia props ─────────────────────────────────────────── */

type ScorecardSnapshot = {
  /** 'portfolio' (DIRUT/Admin) | 'directorate' (Direktur fungsional/KADIV) | 'unit' (KASUBDIV/below) */
  level: 'portfolio' | 'directorate' | 'unit' | string
  periode: string
  /** Label noun for items shown — 'direktorat' for portfolio, 'divisi' for directorate level. */
  itemLabel: string
  /** Avg KPI of items shown. */
  avgItem: number
  /** Total items shown. */
  totalItem: number
  /** Top 3 items (direktorat for DIRUT, divisi for Direktur fungsional). */
  topItems: Array<{ rank: number; nama: string; kode: string; nilai: number }>
  /** Items below 80% target threshold. */
  belowTarget: Array<{ nama: string; kode: string; nilai: number }>
  /** User's own direktorat — header context for directorate-level views.
   * Null for portfolio (DIRUT oversees all, no singular "own"). */
  ownItem: { kode: string; nama: string; nilai: number } | null
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
  // ISO 8601 week — week 1 is the week containing the first Thursday.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function direkturSlug(kode: string): string {
  return kode.toLowerCase()
}

/* Tone: green ≥100, amber 80–99, red <80. */
function scorecardTone(v: number): 'green' | 'amber' | 'red' {
  if (v >= 100) return 'green'
  if (v >= 80) return 'amber'
  return 'red'
}

/* ─── Count-up hook ─────────────────────────────────────────
 * Animates a number from 0 → target on mount with cubic ease-out.
 * Subsequent target changes (e.g. SSE updates) snap instantly — flash
 * highlight is handled separately so we don't re-trigger full count-up.
 * Respects prefers-reduced-motion. */
function useCountUp(target: number, opts: { duration?: number; delay?: number } = {}): number {
  const { duration = 700, delay = 240 } = opts
  const reducedMotion = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [value, setValue] = React.useState(reducedMotion ? target : 0)
  const animatedRef = React.useRef(false)

  React.useEffect(() => {
    if (reducedMotion || animatedRef.current) {
      setValue(target)
      return
    }
    animatedRef.current = true
    let raf = 0
    const startTime = performance.now() + delay
    const tick = (now: number) => {
      if (now < startTime) {
        raf = requestAnimationFrame(tick)
        return
      }
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay, reducedMotion])

  return value
}

/* ─── Flash-on-change hook ──────────────────────────────────
 * Triggers a one-shot CSS animation on the target element when its
 * tracked value changes (post-mount only — first render is skipped so
 * count-up animation owns the initial reveal).
 *
 * Implementation: DOM ref + classList toggle + forced reflow. This is
 * required because re-applying the same class doesn't restart a CSS
 * animation; we have to remove → reflow → re-add to retrigger when
 * the value changes again before the previous flash finishes. */
function useFlashOnChange(
  ref: React.RefObject<HTMLElement | null>,
  value: number,
  duration = 1500,
) {
  const prevRef = React.useRef(value)
  const firstRenderRef = React.useRef(true)

  React.useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      prevRef.current = value
      return
    }
    if (prevRef.current === value) return
    prevRef.current = value

    const el = ref.current
    if (!el) return

    el.classList.remove('hv-flashing')
    /* force reflow so re-adding the class restarts the animation */
    void el.offsetHeight
    el.classList.add('hv-flashing')

    const t = setTimeout(() => el.classList.remove('hv-flashing'), duration)
    return () => clearTimeout(t)
  }, [value, duration, ref])
}

/* ─── Priority ranking ──────────────────────────────────────
 * Score = base(tone) + magnitude + proximity + ownership.
 *   base:        red 1000, amber 500
 *   magnitude:   per-type multiplier × count (more items = more urgent)
 *   proximity:   tlm only — how many days overdue the worst program is,
 *                capped to avoid one ancient program dominating forever
 *   ownership:   needsAction = always user's queue, small constant boost
 *
 * Highest score = hero. Sort descending; secondaries take the rest. */

type PriorityCtx = {
  tlm: number
  belowTargetCount: number
  needsActionCount: number
  criticalControlCount: number
  /** Most negative daysRemaining among overdue/terlambat programs (0 if none). */
  mostOverdueDays: number
}

function priorityScore(p: { id: string; tone: 'red' | 'amber' }, ctx: PriorityCtx): number {
  let score = p.tone === 'red' ? 1000 : 500

  switch (p.id) {
    case 'tlm':
      score += ctx.tlm * 50
      if (ctx.mostOverdueDays < 0) {
        score += Math.min(Math.abs(ctx.mostOverdueDays) * 2, 100)
      }
      break
    case 'belowTarget':
      score += ctx.belowTargetCount * 30
      break
    case 'needsAction':
      score += ctx.needsActionCount * 20 + 30 /* ownership boost */
      break
    case 'criticalControl':
      score += ctx.criticalControlCount * 25
      break
  }

  return score
}

/* ─── Narrative summary ─────────────────────────────────────
 * Rule-based template engine. Generates a 1-2 sentence summary line
 * shown below the greeting. Aligned with hero priority (same item that
 * leads the hero card also leads the narrative) so the page reads as
 * one coherent voice.
 *
 * Tone: formal-warm Indonesian (BUMN-appropriate). Always ends with a
 * subtle posture suggestion ("perlu intervensi", "siap ditelaah") so
 * the reader gets *meaning*, not just numbers. */

type NarrativeCtx = {
  dayOfWeek: number /* 0=Sunday, 6=Saturday */
  tlm: number
  belowTargetCount: number
  belowTargetWorst: { nama: string; nilai: number; periode: string } | null
  needsActionCount: number
  criticalControlCount: number
}

function NarrativeNum({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'amber' | 'green' }) {
  return <span className="hv__narrative-num" data-tone={tone}>{children}</span>
}

function buildNarrative(ctx: NarrativeCtx, heroId: string | null): ReactNode {
  const {
    dayOfWeek, tlm, belowTargetCount, belowTargetWorst,
    needsActionCount, criticalControlCount,
  } = ctx

  /* Variant: zero-state (weekday vs weekend) */
  if (heroId === null) {
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return <>Akhir pekan tenang — semua direktorat hijau dan tidak ada inisiatif tertunda.</>
    }
    return <>Hari ini terkendali — semua direktorat dalam target dan tidak ada keputusan tertunda.</>
  }

  /* Build "selain itu" mentions of non-hero open items, in priority order.
   * Each mention is a short ReactNode fragment with tone-colored numbers. */
  const otherMentions: ReactNode[] = []
  if (heroId !== 'tlm' && tlm > 0) {
    otherMentions.push(
      <><NarrativeNum tone="red">{tlm} program</NarrativeNum> terlambat</>
    )
  }
  if (heroId !== 'belowTarget' && belowTargetCount > 0 && belowTargetWorst) {
    otherMentions.push(
      <>KPI <strong>{belowTargetWorst.nama}</strong> turun</>
    )
  }
  if (heroId !== 'needsAction' && needsActionCount > 0) {
    otherMentions.push(
      <><NarrativeNum tone="amber">{needsActionCount} keputusan</NarrativeNum> menunggu</>
    )
  }
  if (heroId !== 'criticalControl' && criticalControlCount > 0) {
    otherMentions.push(
      <><NarrativeNum tone="amber">{criticalControlCount} kontrol kritis</NarrativeNum> terbuka</>
    )
  }

  /* Render "Selain itu, X, Y, dan Z." with formal Indonesian conjunctions:
   *   2 items  → "A dan B"          (no comma before "dan")
   *   3+ items → "A, B, dan C"      (Oxford comma — formal BUMN preference) */
  const others: ReactNode = otherMentions.length > 0 ? (
    <>
      {' Selain itu, '}
      {otherMentions.map((item, i) => {
        let separator = ''
        if (i > 0) {
          if (i === otherMentions.length - 1) {
            separator = otherMentions.length === 2 ? ' dan ' : ', dan '
          } else {
            separator = ', '
          }
        }
        return (
          <React.Fragment key={i}>
            {separator}
            {item}
          </React.Fragment>
        )
      })}
      .
    </>
  ) : null

  /* Hero-led narrative bodies */
  switch (heroId) {
    case 'tlm':
      return (
        <>
          <NarrativeNum tone="red">{tlm} program</NarrativeNum> sudah melewati tenggat — perlu intervensi sebelum eskalasi lebih lanjut.{others}
        </>
      )
    case 'belowTarget':
      if (belowTargetWorst) {
        return (
          <>
            KPI <strong>{belowTargetWorst.nama}</strong> turun ke{' '}
            <NarrativeNum tone="red">{belowTargetWorst.nilai.toFixed(2)}%</NarrativeNum>{' '}
            pada periode {belowTargetWorst.periode} — di bawah target.{others}
          </>
        )
      }
      return (
        <>
          <NarrativeNum tone="red">{belowTargetCount} direktorat</NarrativeNum> di bawah target periode ini — perlu telaah lebih dalam.{others}
        </>
      )
    case 'needsAction':
      return (
        <>
          <NarrativeNum tone="amber">{needsActionCount} hal</NarrativeNum> menunggu keputusan Anda di Fokus — approval dan eskalasi siap ditelaah.{others}
        </>
      )
    case 'criticalControl':
      return (
        <>
          <NarrativeNum tone="amber">{criticalControlCount} kontrol kritis</NarrativeNum> terbuka — risiko CRITICAL/HIGH belum tertutup.{others}
        </>
      )
    default:
      return null
  }
}

/* ─── Page ──────────────────────────────────────────────────── */

type PriorityIcon = 'alert' | 'trend-down' | 'approval' | 'shield' | 'check'

type Priority = {
  id: string
  tone: 'red' | 'amber'
  icon: PriorityIcon
  primary: ReactNode
  secondary: ReactNode
  onClick: () => void
  /** Hero-only: up to 3 related items shown as a compact context list inside
   * the hero card. Secondary rows ignore this field. */
  contextList?: Array<{ code: string; name: string; meta: string }>
  /** Hero-only: CTA button label shown bottom-right. Default: "Buka detail". */
  ctaLabel?: string
}

/* Inline stroke icons — match the eyebrow tone color via currentColor.
 * 18×18, stroke-width 1.6 — visually consistent with the rail accents. */
function PriorityGlyph({ name }: { name: PriorityIcon }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'alert':
      return (
        <svg {...common}>
          <path d="M12 3 L22 20 L2 20 Z" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      )
    case 'trend-down':
      return (
        <svg {...common}>
          <polyline points="3,7 9,13 13,9 21,17" />
          <polyline points="21,11 21,17 15,17" />
        </svg>
      )
    case 'approval':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <polyline points="8,12 11,15 16,9" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3 L20 6 V13 C20 17 16 20 12 21 C8 20 4 17 4 13 V6 Z" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <polyline points="4,12 10,18 20,7" />
        </svg>
      )
  }
}

export default function HomeView() {
  const { currentUser, programSummary, overviewStatus, openProgramWorkspace } = useWorkspace()
  const navigate = useInertiaNavigate()
  const { props } = usePage<{ scorecardSnapshot: ScorecardSnapshot }>()
  const scorecard = props.scorecardSnapshot

  if (overviewStatus.loading && !programSummary) {
    return (
      <div className="ds home-v2">
        <div className="hv__inner">
          <SkeletonBlock height={20} width="240px" />
          <div style={{ height: 24 }} />
          <SkeletonBlock height={56} width="60%" />
          <div style={{ height: 32 }} />
          <SkeletonBlock height={140} width="100%" />
        </div>
      </div>
    )
  }

  if (!programSummary) {
    return (
      <div className="ds home-v2">
        <div className="hv__inner">
          <SectionState
            title="Data dashboard tidak tersedia"
            text="Tidak dapat memuat ringkasan portfolio. Coba refresh — jika berlanjut, periksa koneksi server."
          />
        </div>
      </div>
    )
  }

  const { summary, byDivisi, controls, needsAction, trendSeries, programsForChart } = programSummary
  const tlm = summary.terlambat + summary.overdue
  const criticalControlCount = (controls ?? []).filter(
    c => c.severity === 'CRITICAL' || c.severity === 'HIGH'
  ).length
  const draftPipeline = Math.max(summary.total - summary.onTrack - summary.atRisk - tlm - summary.selesai, 0)

  const divisiDelay = byDivisi
    .filter(d => d.unit.id !== null && (d.terlambat ?? 0) > 0)
    .sort((a, b) => (b.terlambat ?? 0) - (a.terlambat ?? 0))

  /* Sort by health severity: overdue > terlambat > at_risk > on_track > selesai.
   * Within same tone, soonest deadline first (most negative daysRemaining for
   * overdue/terlambat = most urgent). */
  const attentionPrograms = [...programsForChart]
    .sort((a, b) => {
      const order: Record<string, number> = {
        overdue: 0, terlambat: 1, at_risk: 2, on_track: 3, selesai: 4,
      }
      const ao = order[a.healthTone] ?? 5
      const bo = order[b.healthTone] ?? 5
      if (ao !== bo) return ao - bo
      return (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999)
    })
    .slice(0, 6)

  /* Selaras dengan slide 18 PPT DKMR — TOP 10 program aktif yang deadline-nya
   * paling dekat, regardless of health. Filter: approvalStatus ACTIVE supaya
   * draft tidak surface. Sort by daysRemaining ASC. Strict on deadline,
   * berbeda dari attentionPrograms yang sort by health severity. */
  const topDeadlinePrograms = [...programsForChart]
    .filter(p => p.approvalStatus === 'ACTIVE' && p.daysRemaining != null)
    .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
    .slice(0, 10)

  /* "On track" stat — universal across roles. Was previously "X/Y direktorat
   * hijau" which only made sense for DIRUT (portfolio view); for everyone
   * else the metric was applied to the wrong scope. Now: programs on track
   * out of active programs (excludes selesai + draft/pipeline). Auto scope-
   * filtered via OrgScope on the programs side. */
  const activeProgramCount = summary.onTrack + summary.atRisk + tlm
  const onTrackProgramCount = summary.onTrack
  const actionCount = tlm + needsAction.length + criticalControlCount
  const now = new Date()

  /* Count-up — delays aligned with section stagger fade-in (stats=260ms,
   * portfolio=380ms). Numbers tick up just as their section settles in. */
  const onTrackAnim = useCountUp(onTrackProgramCount, { delay: 300, duration: 700 })
  const actionCountAnim = useCountUp(actionCount, { delay: 300, duration: 700 })
  const totalAnim = useCountUp(summary.total, { delay: 300, duration: 700 })
  const avgKpiAnim = useCountUp(scorecard.avgItem, { delay: 420, duration: 800 })
  const totalPortfolioAnim = useCountUp(summary.total, { delay: 420, duration: 700 })

  /* Real-time flash — when these values change (via SSE or partial Inertia
   * reload), the corresponding stat element flashes for 1.5s. First render
   * is skipped (count-up handles the initial entry). */
  const onTrackRef = React.useRef<HTMLSpanElement>(null)
  const actionCountRef = React.useRef<HTMLSpanElement>(null)
  const totalRef = React.useRef<HTMLSpanElement>(null)
  const avgKpiRef = React.useRef<HTMLSpanElement>(null)
  const totalPortfolioRef = React.useRef<HTMLSpanElement>(null)
  useFlashOnChange(onTrackRef, onTrackProgramCount)
  useFlashOnChange(actionCountRef, actionCount)
  useFlashOnChange(totalRef, summary.total)
  useFlashOnChange(avgKpiRef, scorecard.avgItem)
  useFlashOnChange(totalPortfolioRef, summary.total)

  const priorities: Priority[] = []
  if (tlm > 0) {
    const topOverdue = attentionPrograms
      .filter(p => p.healthTone === 'terlambat' || p.healthTone === 'overdue')
      .slice(0, 3)
      .map(p => ({
        code: p.code,
        name: p.name,
        meta: `${Math.round(p.progressPercent)}%`,
      }))
    priorities.push({
      id: 'tlm',
      tone: 'red',
      icon: 'alert',
      primary: <>Tinjau <strong>{tlm} program terlambat</strong></>,
      secondary: 'Butuh intervensi · buka portfolio',
      onClick: () => navigate('/programs'),
      contextList: topOverdue.length > 0 ? topOverdue : undefined,
      ctaLabel: 'Buka Programs',
    })
  }
  if (scorecard.belowTarget.length > 0) {
    const first = scorecard.belowTarget[0]
    const otherBelow = scorecard.belowTarget
      .slice(1, 4)
      .map(d => ({
        code: d.kode,
        name: d.nama,
        meta: `${d.nilai.toFixed(2)}%`,
      }))
    /* URL + CTA depend on level: divisi-level (Direktur fungsional viewing
     * his divisi) goes to /performance/divisi/[kode], else direktorat-level
     * goes to /performance/kolegial/[slug]. */
    const isDivisiLevel = scorecard.itemLabel === 'divisi'
    const targetUrl = isDivisiLevel
      ? `/performance/divisi/${first.kode.toLowerCase()}`
      : `/performance/kolegial/${direkturSlug(first.kode)}`
    priorities.push({
      id: 'belowTarget',
      tone: 'red',
      icon: 'trend-down',
      primary: <>Telaah penurunan <strong>{first.nama}</strong></>,
      secondary: `${first.nilai.toFixed(2)}% — di bawah target periode ${scorecard.periode}`,
      onClick: () => navigate(targetUrl),
      contextList: otherBelow.length > 0 ? otherBelow : undefined,
      ctaLabel: isDivisiLevel ? 'Buka Divisi' : 'Buka Kolegial',
    })
  }
  if (needsAction.length > 0) {
    priorities.push({
      id: 'needsAction',
      tone: 'amber',
      icon: 'approval',
      primary: <><strong>{needsAction.length} hal</strong> menunggu keputusan Anda</>,
      secondary: 'Approval, eskalasi, dan komitmen di Fokus',
      onClick: () => navigate('/fokus'),
      ctaLabel: 'Buka Fokus',
    })
  }
  if (criticalControlCount > 0) {
    priorities.push({
      id: 'criticalControl',
      tone: 'amber',
      icon: 'shield',
      primary: <>Cek <strong>{criticalControlCount} kontrol kritis</strong> terbuka</>,
      secondary: 'Risiko CRITICAL/HIGH belum tertutup',
      onClick: () => navigate('/programs'),
      ctaLabel: 'Buka Programs',
    })
  }

  /* Rank by composite score — hero = top, rest = secondaries.
   * Severity (tone) dominates; magnitude breaks ties within same tone. */
  const mostOverdueDays = attentionPrograms
    .filter(p => p.healthTone === 'overdue' || p.healthTone === 'terlambat')
    .reduce((min, p) => (
      p.daysRemaining !== null && p.daysRemaining < min ? p.daysRemaining : min
    ), 0)

  const priorityCtx: PriorityCtx = {
    tlm,
    belowTargetCount: scorecard.belowTarget.length,
    needsActionCount: needsAction.length,
    criticalControlCount,
    mostOverdueDays,
  }

  const ranked = [...priorities].sort(
    (a, b) => priorityScore(b, priorityCtx) - priorityScore(a, priorityCtx)
  )
  const heroPriority = ranked[0]
  const secondaryPriorities = ranked.slice(1)

  /* Narrative summary — aligned with hero so page voice stays coherent. */
  const narrative = buildNarrative({
    dayOfWeek: now.getDay(),
    tlm,
    belowTargetCount: scorecard.belowTarget.length,
    belowTargetWorst: scorecard.belowTarget.length > 0 ? {
      nama: scorecard.belowTarget[0].nama,
      nilai: scorecard.belowTarget[0].nilai,
      periode: scorecard.periode,
    } : null,
    needsActionCount: needsAction.length,
    criticalControlCount,
  }, heroPriority?.id ?? null)

  // Trend
  const trendValues = (trendSeries ?? []).slice(-14).map(t => t.pctOnTrack)
  const trendDelta = trendValues.length >= 2
    ? trendValues[trendValues.length - 1] - trendValues[0]
    : null

  // Status breakdown total — clamp to ≥1 for safe pct math
  const statusTotal = Math.max(summary.onTrack + summary.atRisk + tlm + draftPipeline, 1)

  return (
    <>
      <Head title="Home" />
      <div className="ds home-v2">
        <div className="hv__inner">

          {/* Page rail removed — date/period/live now lives in the global
           * slim topbar. Salin tautan / Ekspor moved to the actions row
           * next to greeting (kept available, just smaller footprint). */}

          {/* ─── Greeting + narrative summary ────────────── */}
          <div className="hv__greeting-block">
            <h1 className="hv__greeting">
              {getGreeting()},{' '}
              <span className="hv__greeting-name">
                {currentUser?.name ?? 'Anda'}
              </span>
              .
            </h1>
            {narrative && (
              <p className="hv__narrative">{narrative}</p>
            )}
          </div>

          {/* ─── Stats row — number + visual context ────── */}
          <div className="hv__stats">
            <div className="hv__stat" data-tone={onTrackProgramCount === activeProgramCount ? 'green' : 'amber'}>
              <span className="hv__eyebrow">
                <span className="hv__eyebrow-dot" aria-hidden /> On track
              </span>
              <span className="hv__big" ref={onTrackRef}>
                {Math.round(onTrackAnim)}<span className="hv__big-denom">/{activeProgramCount}</span>
              </span>
              {/* Discrete dots — one per active program, filled if on track.
               * Capped at 12 dots to prevent overflow on portfolios with many programs. */}
              {activeProgramCount > 0 && (
                <span className="hv__stat-dots" aria-hidden>
                  {Array.from({ length: Math.min(activeProgramCount, 12) }, (_, i) => (
                    <span key={i} className={i < onTrackProgramCount ? 'is-on' : ''} />
                  ))}
                </span>
              )}
              <span className="hv__sub">
                program on track · periode {scorecard.periode}
              </span>
            </div>

            <div
              className="hv__stat"
              data-tone={actionCount > 0 ? 'amber' : 'green'}
            >
              <span className="hv__eyebrow">
                <span className="hv__eyebrow-dot" aria-hidden /> Perlu aksi
              </span>
              <span className="hv__big" ref={actionCountRef}>{Math.round(actionCountAnim)}</span>
              {/* Breakdown chip row — visualizes what's inside the action count */}
              {actionCount > 0 && (
                <span className="hv__stat-chips" aria-hidden>
                  {tlm > 0 && <span data-tone="red">{tlm} terlambat</span>}
                  {scorecard.belowTarget.length > 0 && <span data-tone="red">{scorecard.belowTarget.length} KPI turun</span>}
                  {needsAction.length > 0 && <span data-tone="amber">{needsAction.length} approval</span>}
                  {criticalControlCount > 0 && <span data-tone="amber">{criticalControlCount} kontrol</span>}
                </span>
              )}
              <span className="hv__sub">
                {actionCount > 0 ? 'hari ini menunggu Anda' : 'semua tertangani — pertahankan momentum'}
              </span>
            </div>

            <div className="hv__stat" data-tone="indigo">
              <span className="hv__eyebrow">
                <span className="hv__eyebrow-dot" aria-hidden /> Program aktif
              </span>
              <span className="hv__big" ref={totalRef}>{Math.round(totalAnim)}</span>
              {/* Status composition track — one segment per program, colored by health */}
              <span className="hv__stat-track" aria-hidden>
                {summary.onTrack > 0 && <span data-tone="green" style={{ flex: summary.onTrack }} />}
                {summary.atRisk > 0 && <span data-tone="amber" style={{ flex: summary.atRisk }} />}
                {tlm > 0 && <span data-tone="red" style={{ flex: tlm }} />}
                {draftPipeline > 0 && <span data-tone="neutral" style={{ flex: draftPipeline }} />}
              </span>
              <span className="hv__sub">
                Q{getQuarter(now)} · minggu ke-{getISOWeek(now)}
              </span>
            </div>
          </div>

          {/* ─── Priorities — Hero + Secondaries (or empty-state) ─────── */}
          <section className="hv__section">
            <header className="hv__sec-head">
              <h2 className="hv__sec-title">
                {ranked.length > 0 ? 'Yang penting hari ini' : 'Status hari ini'}
              </h2>
              <span className="hv__sec-meta">
                {ranked.length > 0 ? `${ranked.length} hal` : 'terkendali'}
              </span>
            </header>

            {heroPriority ? (
              <div className="hv__pri-grid" data-count={ranked.length}>
                <button
                  type="button"
                  className="hv__pri-hero"
                  data-tone={heroPriority.tone}
                  onClick={heroPriority.onClick}
                >
                  <span className="hv__pri-hero-rail" aria-hidden />
                  <div className="hv__pri-hero-content">
                    <div className="hv__pri-hero-head">
                      <span className="hv__pri-hero-icon" aria-hidden>
                        <PriorityGlyph name={heroPriority.icon} />
                      </span>
                      <div className="hv__pri-hero-text">
                        <span className="hv__pri-hero-primary">{heroPriority.primary}</span>
                        <span className="hv__pri-hero-secondary">{heroPriority.secondary}</span>
                      </div>
                    </div>

                    {heroPriority.contextList && heroPriority.contextList.length > 0 && (
                      <div className="hv__pri-hero-list">
                        {heroPriority.contextList.map((item, idx) => (
                          <div key={idx} className="hv__pri-hero-list-row">
                            <span className="hv__pri-hero-list-code">{item.code}</span>
                            <span className="hv__pri-hero-list-name">{item.name}</span>
                            <span className="hv__pri-hero-list-meta">{item.meta}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="hv__pri-hero-cta">
                      <span>{heroPriority.ctaLabel ?? 'Buka detail'}</span>
                      <span aria-hidden className="hv__pri-hero-cta-arrow">→</span>
                    </div>
                  </div>
                </button>

                {secondaryPriorities.length > 0 && (
                  <div className="hv__pri-list">
                    {secondaryPriorities.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="hv__pri-row"
                        data-tone={p.tone}
                        onClick={p.onClick}
                      >
                        <span className="hv__pri-row-rail" aria-hidden />
                        <span className="hv__pri-row-icon" aria-hidden>
                          <PriorityGlyph name={p.icon} />
                        </span>
                        <span className="hv__pri-row-body">
                          <span className="hv__pri-row-primary">{p.primary}</span>
                          <span className="hv__pri-row-secondary">{p.secondary}</span>
                        </span>
                        <span className="hv__pri-row-arrow" aria-hidden>→</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Empty state — celebratory card. All clear, all green. */
              <button
                type="button"
                className="hv__pri-celebration"
                onClick={() => navigate('/performance/scorecard')}
              >
                <span className="hv__pri-celebration-rail" aria-hidden />
                <div className="hv__pri-celebration-content">
                  <span className="hv__pri-celebration-icon" aria-hidden>
                    <PriorityGlyph name="check" />
                  </span>
                  <div className="hv__pri-celebration-text">
                    <span className="hv__pri-celebration-primary">
                      Semua tertangani — pertahankan momentum
                    </span>
                    <span className="hv__pri-celebration-secondary">
                      Tidak ada program terlambat, KPI direktorat dalam target,
                      approval &amp; kontrol kritis kosong.
                    </span>
                  </div>
                  <span className="hv__pri-celebration-link" aria-hidden>
                    Lihat scorecard <span>→</span>
                  </span>
                </div>
              </button>
            )}
          </section>

          {/* ─── Kesehatan Portofolio (KPI + Program 2-col) ─ */}
          <section className="hv__section hv__portfolio">
            <div className="hv__portfolio-cols">

              {/* KPI Achievement column — adapts per scope level:
                * - portfolio (DIRUT): avg of 6 direktorat + top 3 ranked
                * - directorate (Direktur fungsional): own direktorat as headline
                *   + top 3 divisi within that direktorat ranked. Divisi rows
                *   navigate to /performance/divisi/[kode] (per-divisi page). */}
              <div className="hv__portfolio-col">
                <header className="hv__sec-head">
                  <h2 className="hv__sec-title">KPI Achievement</h2>
                  <button
                    type="button"
                    className="hv__sec-link"
                    onClick={() => navigate('/performance/scorecard')}
                  >
                    Buka Scorecard <span aria-hidden>→</span>
                  </button>
                </header>

                <div className="hv__col-headline">
                  {scorecard.ownItem ? (
                    <>
                      {/* Directorate/unit-level: user's own direktorat KPI as
                       * headline. For directorate-level, sub-meta also surfaces
                       * the divisi roll-up. For unit-level (KASUBDIV), no
                       * roll-up — just direktorat name as parent context. */}
                      <span className="hv__big" data-tone={scorecardTone(scorecard.ownItem.nilai)} ref={avgKpiRef}>
                        {scorecard.ownItem.nilai.toFixed(2)}<span className="hv__big-unit">%</span>
                      </span>
                      <span className="hv__sub">
                        {scorecard.ownItem.nama}
                        <span className="hv__sub-meta">
                          {scorecard.totalItem > 0 && (
                            <>{scorecard.totalItem} {scorecard.itemLabel} · rata-rata {scorecard.avgItem.toFixed(2)}% · </>
                          )}
                          periode {scorecard.periode}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      {/* Portfolio-level (DIRUT): avg across all direktorat. */}
                      <span className="hv__big" data-tone={scorecardTone(scorecard.avgItem)} ref={avgKpiRef}>
                        {avgKpiAnim.toFixed(2)}<span className="hv__big-unit">%</span>
                      </span>
                      <span className="hv__sub">
                        rata-rata achievement
                        <span className="hv__sub-meta">
                          {scorecard.totalItem} {scorecard.itemLabel} · periode {scorecard.periode}
                        </span>
                      </span>
                    </>
                  )}
                </div>

                {scorecard.topItems.length > 0 && (
                  <div className="hv__rank-list">
                    {scorecard.topItems.map(d => (
                      <button
                        key={d.kode}
                        type="button"
                        className="hv__rank"
                        onClick={() => navigate(
                          scorecard.itemLabel === 'divisi'
                            ? `/performance/divisi/${d.kode.toLowerCase()}`
                            : `/performance/kolegial/${direkturSlug(d.kode)}`
                        )}
                      >
                        <span className="hv__rank-num" data-rank={d.rank}>{d.rank}</span>
                        <span className="hv__rank-name">{d.nama}</span>
                        <span className="hv__rank-value" data-tone={scorecardTone(d.nilai)}>
                          {d.nilai.toFixed(2)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {scorecard.belowTarget.length > 0 && (
                  <div className="hv__alert">
                    <span className="hv__alert-eyebrow">
                      <span className="hv__eyebrow-dot" data-tone="red" aria-hidden /> Di bawah target
                    </span>
                    {scorecard.belowTarget.map(d => (
                      <button
                        key={d.kode}
                        type="button"
                        className="hv__alert-row"
                        onClick={() => navigate(
                          scorecard.itemLabel === 'divisi'
                            ? `/performance/divisi/${d.kode.toLowerCase()}`
                            : `/performance/kolegial/${direkturSlug(d.kode)}`
                        )}
                      >
                        <span className="hv__alert-name">{d.nama}</span>
                        <span className="hv__alert-value">{d.nilai.toFixed(2)}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Program Status column */}
              <div className="hv__portfolio-col">
                <header className="hv__sec-head">
                  <h2 className="hv__sec-title">Status Program</h2>
                  <button
                    type="button"
                    className="hv__sec-link"
                    onClick={() => navigate('/programs')}
                  >
                    Buka Programs <span aria-hidden>→</span>
                  </button>
                </header>

                <div className="hv__col-headline">
                  <span className="hv__big" data-tone={tlm > 0 ? 'red' : 'neutral'} ref={totalPortfolioRef}>
                    {Math.round(totalPortfolioAnim)}
                  </span>
                  <span className="hv__sub">
                    program aktif
                    {draftPipeline > 0 && (
                      <span className="hv__sub-meta">{draftPipeline} pipeline / draft</span>
                    )}
                  </span>
                </div>

                <div className="hv__breakdown">
                  <BreakRow tone="green"   label="On Track"         value={summary.onTrack} total={statusTotal} index={0} onClick={() => navigate('/programs')} />
                  <BreakRow tone="amber"   label="At Risk"          value={summary.atRisk}  total={statusTotal} index={1} emphasis={summary.atRisk > 0} onClick={() => navigate('/programs')} />
                  <BreakRow tone="red"     label="Terlambat"        value={tlm}             total={statusTotal} index={2} emphasis={tlm > 0}            onClick={() => navigate('/programs')} />
                  <BreakRow tone="neutral" label="Draft / pipeline" value={draftPipeline}   total={statusTotal} index={3} onClick={() => navigate('/programs')} />
                </div>

                {trendValues.length >= 2 && trendDelta !== null && (
                  <div className="hv__trend">
                    <div className="hv__trend-head">
                      <span className="hv__eyebrow">Trend 14 hari · % on track</span>
                      <span className="hv__trend-delta" data-tone={trendDelta >= 0 ? 'green' : 'red'}>
                        {trendDelta >= 0 ? '↑' : '↓'} {Math.abs(trendDelta).toFixed(0)}%
                      </span>
                    </div>
                    <Sparkline
                      values={trendValues}
                      color={trendDelta < 0 ? 'var(--red)' : 'var(--indigo)'}
                      w={520}
                      h={56}
                      areaFill
                    />
                    <div className="hv__trend-edges">
                      <span>{Math.round(trendValues[0])}%</span>
                      <span>14 hari lalu</span>
                      <span>hari ini · {Math.round(trendValues[trendValues.length - 1])}%</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </section>

          {/* ─── Divisi dengan delay ──────────────── */}
          <section className="hv__section">
            <header className="hv__sec-head">
              <h2 className="hv__sec-title">Divisi dengan delay</h2>
              {divisiDelay.length > 0 && (
                <button
                  type="button"
                  className="hv__sec-link"
                  onClick={() => navigate('/performance/divisi')}
                >
                  Lihat per divisi <span aria-hidden>→</span>
                </button>
              )}
            </header>
            <div className="hv__divisi-row">
              {divisiDelay.length > 0 ? (
                divisiDelay.map(d => (
                  <button
                    key={d.unit.code}
                    type="button"
                    className="hv__divisi-chip"
                    onClick={() => navigate(`/performance/divisi/${d.unit.code.toLowerCase()}`)}
                    title={d.unit.name}
                  >
                    <span className="hv__divisi-code">{d.unit.code}</span>
                    <span className="hv__divisi-count">{d.terlambat ?? 0}</span>
                  </button>
                ))
              ) : (
                <span className="hv__divisi-empty">
                  Semua divisi on track. Pertahankan kontrol mingguan.
                </span>
              )}
            </div>
          </section>

          {/* ─── Program ketat deadline (slide 18 PPT) ──────────── */}
          {topDeadlinePrograms.length > 0 && (
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
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="hv__deadline-row"
                      onClick={() => openProgramWorkspace(p.id)}
                    >
                      <span className="hv__deadline-program">
                        <span className="hv__deadline-code">{p.code}</span>
                        <span className="hv__deadline-name">{p.name}</span>
                      </span>
                      <span className="hv__deadline-divisi">{p.divisi || '—'}</span>
                      <span className="hv__deadline-date">{p.targetEndDate ?? '—'}</span>
                      <span className="hv__deadline-countdown" data-urgency={urgency}>
                        {daysLabel}
                      </span>
                      <span className="hv__deadline-progress" title={p.progresTerkini ?? ''}>
                        {p.progresTerkini ? p.progresTerkini : <em className="hv__deadline-empty">—</em>}
                      </span>
                      <span className="hv__deadline-support" title={p.dukunganDibutuhkan ?? ''}>
                        {p.dukunganDibutuhkan ? p.dukunganDibutuhkan : <em className="hv__deadline-empty">—</em>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* ─── Program butuh perhatian ──────────── */}
          {attentionPrograms.length > 0 && (
            <section className="hv__section">
              <header className="hv__sec-head">
                <h2 className="hv__sec-title">Program butuh perhatian</h2>
                <span className="hv__sec-meta">{summary.total} total</span>
              </header>
              <div className="hv__list">
                {attentionPrograms.map(p => {
                  /* Map domain health tone → visual tone. terlambat & overdue
                   * both surface as red; selesai = neutral (shouldn't normally
                   * appear here since attentionPrograms filters to non-completed). */
                  const tone: 'red' | 'amber' | 'green' | 'neutral' =
                    p.healthTone === 'overdue' || p.healthTone === 'terlambat' ? 'red'
                  : p.healthTone === 'at_risk' ? 'amber'
                  : p.healthTone === 'on_track' ? 'green'
                  : 'neutral'
                  const label = tone === 'red' ? 'Terlambat'
                              : tone === 'amber' ? 'At Risk'
                              : tone === 'green' ? 'On Track'
                              : 'Idle / Draft'
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="hv__list-row"
                      onClick={() => openProgramWorkspace(p.id)}
                    >
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
                        <span className="hv__eyebrow-dot" data-tone={tone} aria-hidden />
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="hv__list-foot">
                <button
                  type="button"
                  className="hv__sec-link"
                  onClick={() => navigate('/programs')}
                >
                  Lihat semua program ({summary.total}) <span aria-hidden>→</span>
                </button>
              </div>
            </section>
          )}

          {/* ─── Status per Divisi (slide 17 PPT — rollup eksekutif) ─────── */}
          {byDivisi.length > 0 && (
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
                    const tlm = (d.terlambat ?? 0) + (d.overdue ?? 0)
                    const pctTone: 'red' | 'amber' | 'green' =
                      d.pctOnTrack < 50 ? 'red' : d.pctOnTrack < 80 ? 'amber' : 'green'
                    return (
                      <button
                        key={d.unit.code}
                        type="button"
                        className="hv__rollup-row"
                        onClick={() => navigate(`/performance/divisi/${d.unit.code.toLowerCase()}`)}
                        title={d.unit.name}
                      >
                        <span className="hv__rollup-divisi">
                          <span className="hv__rollup-code">{d.unit.code}</span>
                          <span className="hv__rollup-name">{d.unit.name}</span>
                        </span>
                        <span className="hv__rollup-num" data-tone="green">{d.onTrack ?? 0}</span>
                        <span className="hv__rollup-num" data-tone="amber">{d.atRisk ?? 0}</span>
                        <span className="hv__rollup-num" data-tone="red">{tlm}</span>
                        <span className="hv__rollup-num" data-tone="neutral">{d.selesai ?? 0}</span>
                        <span className="hv__rollup-num hv__rollup-total">{d.total}</span>
                        <span className="hv__rollup-pct" data-tone={pctTone}>
                          {Math.round(d.pctOnTrack)}%
                        </span>
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

/* ─── Local sub-components ─────────────────────────────────── */

function BreakRow({
  tone, label, value, total, emphasis, onClick, index = 0,
}: {
  tone: 'green' | 'amber' | 'red' | 'neutral'
  label: string
  value: number
  total: number
  emphasis?: boolean
  onClick: () => void
  /** Used to stagger bar-fill animation across the 4 rows (80ms per index). */
  index?: number
}) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  const reducedMotion = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [animatedPct, setAnimatedPct] = React.useState(reducedMotion ? pct : 0)
  const firstMountRef = React.useRef(true)

  React.useEffect(() => {
    if (reducedMotion) {
      setAnimatedPct(pct)
      return
    }
    /* On first mount: stagger delay aligned with portfolio col fade-in.
     * On subsequent updates (SSE): no delay — let the CSS transition (480ms)
     * carry the animation immediately so live data feels responsive. */
    const delay = firstMountRef.current ? 460 + index * 80 : 0
    firstMountRef.current = false
    const t = setTimeout(() => setAnimatedPct(pct), delay)
    return () => clearTimeout(t)
  }, [pct, index, reducedMotion])

  return (
    <button
      type="button"
      className="hv__break-row"
      onClick={onClick}
      data-emphasis={emphasis ? 'true' : 'false'}
    >
      <span className="hv__eyebrow-dot" data-tone={tone} aria-hidden />
      <span className="hv__break-label">{label}</span>
      <div className="hv__break-bar" aria-hidden>
        <div className="hv__break-bar-fill" data-tone={tone} style={{ width: `${animatedPct}%` }} />
      </div>
      <span className="hv__break-value">{value}</span>
    </button>
  )
}

function Sparkline({ values, color, w, h, areaFill = false }: {
  values: number[]
  color: string
  w: number
  h: number
  /** Render a soft area below the line for visual prominence. */
  areaFill?: boolean
}) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const padY = 4
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * (h - padY * 2) - padY
    return [x, y] as const
  })
  const linePoints = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  // Area polygon = line + bottom-right + bottom-left, closed
  const areaPoints =
    `${linePoints} ${w.toFixed(1)},${h.toFixed(1)} 0,${h.toFixed(1)}`
  // Stable id for gradient (so multiple sparklines on the page don't collide)
  const gradId = React.useId().replace(/:/g, '')
  return (
    // SVG stroke attribute does not resolve CSS custom properties, so apply
    // theme-aware color via inline style (which does).
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block', flexShrink: 0, color }}
    >
      {areaFill && (
        <>
          <defs>
            <linearGradient id={`spark-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill={`url(#spark-${gradId})`} stroke="none" />
        </>
      )}
      <polyline
        points={linePoints}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
