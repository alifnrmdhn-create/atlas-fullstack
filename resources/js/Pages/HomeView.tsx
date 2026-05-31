import { useState } from 'react'
import type { ReactNode } from 'react'
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

/* ─── Command-strip tile (status, at a glance — no prose) ───── */

function CmdTile({
  label, tone = 'neutral', value, unit, delta, deltaSuffix, caption, verdict = false, tip,
}: {
  label: string
  tone?: Tone
  value: ReactNode
  unit?: ReactNode
  delta?: number | null
  deltaSuffix?: string
  caption?: ReactNode
  /** Verdict tiles show a word (smaller) rather than a number (BAN size). */
  verdict?: boolean
  /** Definition/formula shown on hover — makes the number self-explaining (trust). */
  tip?: ReactNode
}) {
  return (
    <Card padding="md" className={`hv__tile${verdict ? ' hv__tile--verdict' : ''}`} data-tone={tone}>
      <span className="hv__tile-label">
        <span className="hv__tile-glyph" data-tone={tone} aria-hidden><ToneGlyph tone={tone} /></span>
        {tip
          ? <Tooltip content={tip} side="bottom"><span className="hv__has-tip">{label}</span></Tooltip>
          : label}
      </span>
      <span className="hv__tile-value-row">
        <span className="hv__tile-value">
          {value}
          {unit ? <span className="hv__tile-unit">{unit}</span> : null}
        </span>
        {delta != null ? <Delta value={delta} suffix={deltaSuffix} /> : null}
      </span>
      {caption ? <span className="hv__tile-caption">{caption}</span> : null}
    </Card>
  )
}

/* Program status row — label + proportional Meter + count. */
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

  const { summary, byDivisi, controls, needsAction, trendSeries, programsForChart, velocity } = programSummary
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
  const kpiContextLabel = scorecard.ownItem
    ? scorecard.ownItem.nama
    : (scorecard.grid && scorecard.grid.length === 1)
      ? scorecard.grid[0].nama
      : `Rata-rata ${scorecard.totalItem} ${scorecard.itemLabel}`

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
  const statusCaption =
    tlm > 0 ? `${tlm} program terlambat`
    : belowTargetCount > 0 ? `${belowTargetCount} KPI di bawah target`
    : criticalControlCount > 0 ? `${criticalControlCount} kontrol kritis`
    : summary.atRisk > 0 ? `${summary.atRisk} program berisiko`
    : needsAction.length > 0 ? `${needsAction.length} menunggu keputusan`
    : 'Semua dalam target'

  const aksiParts = [
    tlm > 0 ? `${tlm} terlambat` : null,
    belowTargetCount > 0 ? `${belowTargetCount} KPI` : null,
    needsAction.length > 0 ? `${needsAction.length} approval` : null,
    criticalControlCount > 0 ? `${criticalControlCount} kontrol` : null,
  ].filter(Boolean)
  const aksiTone: Tone = exceptionCount === 0 ? 'green'
    : (tlm > 0 || belowTargetCount > 0 || criticalControlCount > 0) ? 'red' : 'amber'

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

  /* ── Below-the-fold detail data (unchanged sources) ──────────── */
  const divisiDelay = byDivisi
    .filter(d => d.unit.id !== null && (d.terlambat ?? 0) > 0)
    .sort((a, b) => (b.terlambat ?? 0) - (a.terlambat ?? 0))

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
        <div className="hv">

          {/* ─── Greeting (one line — no narrative) ────────── */}
          <header className="hv__head">
            <h1 className="hv__greeting">
              {getGreeting()},{' '}
              <span className="hv__greeting-name">{currentUser?.name ?? 'Anda'}</span>
            </h1>
          </header>

          {/* ─── Command strip — BAN tiles, 3-second verdict ─── */}
          <section className="hv__strip" aria-label="Ringkasan">
            <CmdTile
              label="Status"
              tone={statusTone}
              verdict
              value={statusLabel}
              caption={statusCaption}
              tip="Verdict keseluruhan. Merah = ada terlambat / KPI<target / kontrol kritis. Kuning = ada risiko / approval. Hijau = semua dalam target."
            />
            {canSeePerformance && (
              <CmdTile
                label={`KPI · ${scorecard.periodeLabel}`}
                tone={kpiTone}
                value={hasKpi ? kpiHeadline.toFixed(1) : '—'}
                unit={hasKpi ? '%' : undefined}
                delta={hasKpi ? scorecard.avgDelta : null}
                caption={hasKpi ? 'achievement vs target 100' : 'belum tersedia'}
                tip="Skor KPI resmi direktorat vs target 100. ▼/▲ = vs bulan lalu. Bukan rata-rata divisi."
              />
            )}
            <CmdTile
              label="On track"
              tone={tlm > 0 ? 'red' : summary.onTrack === activeProgramCount ? 'green' : 'amber'}
              value={summary.onTrack}
              unit={`/${activeProgramCount}`}
              delta={onTrackDelta}
              caption={`${onTrackPct}% program on track`}
              tip="Program sehat (On Track) ÷ program aktif. ▲/▼ = vs minggu lalu. Aktif = On Track + At Risk + Terlambat."
            />
            <CmdTile
              label="Perlu aksi"
              tone={aksiTone}
              value={exceptionCount}
              caption={exceptionCount > 0 ? aksiParts.join(' · ') : 'semua tertangani'}
              tip="Terlambat + KPI<target + approval + kontrol kritis. 'Terlambat' = kesehatan/milestone, beda dari 'Lewat tenggat' (tanggal akhir)."
            />
          </section>

          {/* ─── Insight: keselarasan Hasil (lagging) ↔ Eksekusi (leading) ─── */}
          {hasKpi && (
            <div className="hv__align" data-tone={alignTone}>
              <span className="hv__align-eyebrow">Hasil ↔ Eksekusi</span>
              <div className="hv__align-pair">
                <span className="hv__align-num" data-tone={kpiTone}>{kpiHeadline.toFixed(1)}%</span>
                <span className="hv__align-cap">hasil · KPI</span>
              </div>
              <span className="hv__align-vs" aria-hidden>↔</span>
              <div className="hv__align-pair">
                <span className="hv__align-num" data-tone={leadingTone}>{onTrackPct}%</span>
                <span className="hv__align-cap">eksekusi · on-track</span>
              </div>
              <Tooltip
                side="bottom"
                className="hv__align-tip"
                content={kpiDiverges
                  ? 'KPI (hasil/lagging) jauh di atas tingkat eksekusi program (leading). Hasil belum mencerminkan perlambatan eksekusi — bila tren berlanjut, KPI berisiko turun periode depan.'
                  : 'Hasil KPI dan tingkat eksekusi program relatif selaras.'}
              >
                <span className="hv__align-pill" data-tone={alignTone}>
                  <ToneGlyph tone={alignTone} />
                  {alignText}
                  {kpiDiverges && <span className="hv__align-gap">· selisih {alignGap} poin</span>}
                </span>
              </Tooltip>
            </div>
          )}

          {/* ─── Balanced panels — KPI (lagging) ⟷ Program (leading) ─── */}
          <section className={`hv__balance${canSeePerformance ? '' : ' hv__balance--single'}`}>

            {/* HASIL · KPI — lagging / outcomes */}
            {canSeePerformance && (
              <Card padding="lg" className="hv__panel" data-tone={hasKpi ? kpiTone : 'neutral'}>
                <header className="hv__panel-head">
                  <span className="hv__panel-eyebrow">Hasil · KPI</span>
                  <div className="hv__panel-head-right">
                    <Pill tone="neutral" variant="soft">{scorecard.periodeLabel}</Pill>
                    <button type="button" className="hv__panel-link" onClick={() => navigate('/performance/scorecard')}>
                      Scorecard <span aria-hidden>→</span>
                    </button>
                  </div>
                </header>

                <div className="hv__panel-headline">
                  <div className="hv__panel-metric">
                    <span className="hv__panel-big" data-tone={hasKpi ? kpiTone : 'neutral'}>
                      {hasKpi ? kpiHeadline.toFixed(1) : '—'}
                      {hasKpi && <span className="hv__panel-unit">%</span>}
                    </span>
                    {hasKpi && scorecard.avgDelta != null && <Delta value={scorecard.avgDelta} />}
                  </div>
                  {hasKpi && kpiSpark.length >= 2 && (
                    <Sparkline values={kpiSpark} tone={kpiTone} width={150} height={42} />
                  )}
                </div>
                <div className="hv__panel-sub">{hasKpi ? kpiContextLabel : 'KPI periode ini belum tersedia'}</div>

                {hasKpi && (
                  <div className="hv__kpi-list">
                    {kpiRows.map(d => {
                      const t = scoreTone(d.nilai)
                      return (
                        <button key={d.kode} type="button" className="hv__kpi-row" onClick={() => navigate(kpiRowUrl(d.kode))}>
                          <span className="hv__kpi-name" title={d.nama}>{d.nama}</span>
                          <Meter className="hv__kpi-meter" value={d.nilai} max={120} target={100} tone={t} height={8} aria-label={`${d.nama}: ${d.nilai.toFixed(1)}%`} />
                          <span className="hv__kpi-val" data-tone={t}>{d.nilai.toFixed(1)}%</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* EKSEKUSI · Program — leading / drivers */}
            <Card padding="lg" className="hv__panel" data-tone={programTone}>
              <header className="hv__panel-head">
                <span className="hv__panel-eyebrow">Eksekusi · Program</span>
                <div className="hv__panel-head-right">
                  <Pill tone="neutral" variant="soft">Q{getQuarter(now)} · W{getISOWeek(now)}</Pill>
                  <button type="button" className="hv__panel-link" onClick={() => navigate('/programs')}>
                    Programs <span aria-hidden>→</span>
                  </button>
                </div>
              </header>

              <div className="hv__panel-headline">
                <div className="hv__panel-metric">
                  <span className="hv__panel-big">
                    {summary.onTrack}<span className="hv__panel-unit">/{activeProgramCount}</span>
                  </span>
                  {onTrackDelta != null && <Delta value={onTrackDelta} />}
                </div>
                {trendValues.length >= 2 && (
                  <Sparkline values={trendValues} tone={trendDelta != null && trendDelta < 0 ? 'red' : 'green'} width={150} height={42} />
                )}
              </div>
              <div className="hv__panel-sub">
                {onTrackPct}% program on track{draftPipeline > 0 ? ` · ${draftPipeline} pipeline` : ''}
              </div>

              <div className="hv__status-list">
                <StatusBar label="On Track"        value={summary.onTrack} total={statusTotal} tone="green"   onClick={() => navigate('/programs')} />
                <StatusBar label="At Risk"         value={summary.atRisk}  total={statusTotal} tone="amber"   onClick={() => navigate('/programs')} />
                <StatusBar label="Terlambat"       value={tlm}             total={statusTotal} tone="red"     onClick={() => navigate('/programs')} />
                <StatusBar label="Draft / pipeline" value={draftPipeline}  total={statusTotal} tone="neutral" onClick={() => navigate('/programs')} />
              </div>
            </Card>
          </section>

          {/* ─── Perlu aksi — exceptions only ───────────────── */}
          <section className="hv__section hv__exceptions">
            <header className="hv__sec-head">
              <h2 className="hv__sec-title">Perlu aksi</h2>
              <span className="hv__sec-meta">{exceptions.length > 0 ? `${exceptions.length} hal` : 'terkendali'}</span>
            </header>
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
              <p className="hv__all-clear">Semua terkendali — tidak ada yang menunggu keputusan.</p>
            )}
          </section>

          {/* ─── Portfolio program — analitik eksekusi (data sudah dihitung backend) ─── */}
          <PortfolioAnalytics data={programSummary} />

          {/* ─── Analisis — chart untuk telaah (batang + lingkaran) ───── */}
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

          {/* ════════════ Below the fold — drill-down detail ════════════ */}

          {/* ─── Divisi dengan delay ──────────────── */}
          {canSeePerformance && (
            <section className="hv__section">
              <header className="hv__sec-head">
                <h2 className="hv__sec-title">Divisi dengan delay</h2>
                {divisiDelay.length > 0 && (
                  <button type="button" className="hv__sec-link" onClick={() => navigate('/performance/divisi')}>
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
                  <span className="hv__divisi-empty">Semua divisi on track. Pertahankan kontrol mingguan.</span>
                )}
              </div>
            </section>
          )}

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
          {attentionPrograms.length > 0 && (
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
          {isSuperAdmin && scorecard.grid && scorecard.grid.length > 0 && (
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
