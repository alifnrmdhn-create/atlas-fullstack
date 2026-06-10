import { Head, Link, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Card, Pill, Gauge } from '../../design-system'
import { useState } from 'react'
import { scoreTone, realisasiPercent, formatNumber, formatPercent, formatPeriod } from './_shared'
import { KpiScoreTable, DeviationBar, type ScoreGroup } from './KpiScoreTable'
import { InsightPanel, type InsightPayload } from './InsightPanel'
import './Performance.css'

type KpiItem = {
  no: number
  kode: string
  nama: string
  bobot: number
  satuan: string
  polaritas: 'maximize' | 'minimize'
  sasaran: string
  realisasi: string
  skor: number
  definisi: string | null
  perspektif: string
}

type Divisi = {
  kode: string
  nama: string
  nilai: number
  rank: number
  totalDivisi: number
}

type Direktorat = {
  kode: string
  nama: string
  nilai: number
}

type Peer = {
  kode: string
  nama: string
  nilai: number
}

type Performer = {
  rank: number
  nama: string
  jabatan: string
  nilai: number
}

type PerspektifRow = {
  nama: string
  bobot: number
  pct: number | null
}

type DivisiCompare = {
  kode: string
  nama: string
  nilai: number
  rank: number
  totalDivisi: number
  kpiCount: number
  onTarget: number
  atRisk: number
  perspektif: PerspektifRow[]
}

type SingleProps = {
  mode: 'single'
  divisi: Divisi
  direktorat: Direktorat
  peers: Peer[]
  kpiItems: KpiItem[]
  topPerformers: Performer[]
  insight: InsightPayload
  periode: string
}

type ComparisonProps = {
  mode: 'comparison'
  direktorat: Direktorat
  divisiList: DivisiCompare[]
  periode: string
}

type PageProps = SingleProps | ComparisonProps

// Balanced Scorecard quadrant order + accent colors (distinct from the kolegial
// taxonomy in KolegialDetailView). KPI divisi dikelompokkan ke 4 perspektif ini.
const PERSPEKTIF_ORDER = ['Financial', 'Customer', 'Internal Business Process', 'L&G']
const PERSPEKTIF_COLOR: Record<string, string> = {
  Financial: 'var(--ds-green-500)',
  Customer: '#6366F1',
  'Internal Business Process': '#06B6D4',
  'L&G': 'var(--ds-amber-500)',
}

type KpiGroup = { perspektif: string; items: KpiItem[]; bobot: number; pct: number }

/** Group KPI items into the 4 BSC perspectives, ordered, with weighted subtotal.
 *  pct = Σskor·100/Σbobot — skor sudah bobot-weighted (bobot_fraction × Nilai),
 *  jadi ini = rata-rata Nilai tertimbang dalam perspektif. */
function groupByPerspektif(items: KpiItem[]): KpiGroup[] {
  const map = new Map<string, KpiItem[]>()
  for (const it of items) {
    const key = it.perspektif?.trim() || 'Other'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(it)
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      const ia = PERSPEKTIF_ORDER.indexOf(a)
      const ib = PERSPEKTIF_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    .map(([perspektif, groupItems]) => {
      const bobot = groupItems.reduce((s, i) => s + i.bobot, 0)
      const skor = groupItems.reduce((s, i) => s + i.skor, 0)
      return { perspektif, items: groupItems, bobot, pct: bobot > 0 ? (skor * 100) / bobot : 0 }
    })
}

export default function DivisiView() {
  const props = usePage<PageProps>().props
  if (props.mode === 'comparison') {
    return <ComparisonView {...props} />
  }
  return <SingleView {...props} />
}

function ComparisonView({ direktorat, divisiList, periode }: ComparisonProps) {
  const navigate = useInertiaNavigate()
  const avgNilai = divisiList.length > 0
    ? divisiList.reduce((s, d) => s + d.nilai, 0) / divisiList.length
    : 0
  const tone = scoreTone(direktorat.nilai)
  const periodeLabel = formatPeriod(periode)

  return (
    <>
      <Head title={`KPI Division · ${direktorat.nama}`} />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/scorecard')} type="button">
                <IconBack />
                Scorecard
              </button>
              <h1 className="perf__title">KPI Division</h1>
              <span className="perf__subtitle">{direktorat.nama}</span>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periodeLabel}
              </span>
            </div>
          </header>

          {/* Direktorat overview — flat inline header, no nested card (Pattern A) */}
          <section className="perf-compare__hero">
            <div className="perf-compare__hero-meta">
              <span className="perf-compare__hero-eyebrow">Directorate</span>
              <h2 className="perf-compare__hero-name">{direktorat.nama}</h2>
              <div className="perf-compare__hero-sub">
                <span className="perf-compare__hero-code">{direktorat.kode}</span>
                <span>·</span>
                <span>{divisiList.length} divisions</span>
                <span>·</span>
                <span>division average {formatPercent(avgNilai)}</span>
              </div>
            </div>
            <div className="perf-compare__hero-score">
              <span className="perf-compare__hero-score-val" data-tone={tone}>
                {formatPercent(direktorat.nilai)}
              </span>
              <span className="perf-compare__hero-score-lbl">Directorate score · {periodeLabel}</span>
            </div>
          </section>

          {divisiList.length === 0 ? (
            <Card padding="md" className="perf-empty">
              <div className="perf-empty__title">No divisions yet</div>
              <div>This directorate has no division data for the {periodeLabel} period.</div>
            </Card>
          ) : (
            <div className="perf-compare-grid">
              {divisiList.map(div => (
                <DivisiCompareCard key={div.kode} div={div} />
              ))}
            </div>
          )}

          <p className="perf-footnote">Maximum KPI Division achievement: 110%</p>
        </div>
      </div>
    </>
  )
}

function DivisiCompareCard({ div }: { div: DivisiCompare }) {
  const tone = scoreTone(div.nilai)
  const allOnTarget = div.atRisk === 0 && div.kpiCount > 0
  const statusTone = allOnTarget ? 'green' : (div.atRisk > div.onTarget ? 'red' : 'amber')

  return (
    <Link href={`/performance/divisi/${div.kode.toLowerCase()}`} className="perf-compare-card" data-rank={div.rank}>
      <div className="perf-compare-card__top">
        <span className="perf-compare-card__rank-pill">Rank #{div.rank} / {div.totalDivisi}</span>
        <span className="perf-compare-card__arrow" aria-hidden="true">→</span>
      </div>

      <div className="perf-compare-card__hero">
        <h3 className="perf-compare-card__name">{div.nama}</h3>
        <div className="perf-compare-card__sub">
          <span className="perf-compare-card__code">{div.kode}</span>
          <span className="perf-compare-card__sep">·</span>
          <span>{div.kpiCount} KPI</span>
        </div>
        <div className="perf-compare-card__score-row">
          <span className="perf-compare-card__score" data-tone={tone}>
            {formatNumber(div.nilai)}<span className="perf-compare-card__score-pct">%</span>
          </span>
          <span className="perf-compare-card__status" data-tone={statusTone}>
            {allOnTarget
              ? `All ${div.kpiCount} KPIs on target`
              : `${div.onTarget}/${div.kpiCount} on target`}
          </span>
        </div>
      </div>

      <div className="perf-compare-card__divider" />

      {/* Mini-scorecard per perspektif BSC (redesain 2026-06-10) — dulu "top
          KPI by bobot" yang bar-nya meng-encode bobot (selalu mirip), bukan
          kinerja. Deviation bar = sama dgn tabel detail (jangkar 100%). */}
      <div className="perf-compare-card__kpis">
        <span className="perf-compare-card__kpis-label">Achievement by perspective</span>
        {div.perspektif.length === 0 ? (
          <span className="perf-compare-card__kpi-empty">No KPIs yet</span>
        ) : (
          div.perspektif.map(p => (
            <div key={p.nama} className="perf-compare-card__kpi">
              <span className="perf-compare-card__kpi-name" title={`${p.nama} · weight ${formatNumber(p.bobot, 0)}%`}>
                {p.nama}
              </span>
              {p.pct == null ? (
                <span className="perf-compare-card__kpi-empty">—</span>
              ) : (
                <>
                  <DeviationBar pct={p.pct} />
                  <span className="perf-compare-card__kpi-skor" data-tone={scoreTone(p.pct)}>
                    {formatPercent(p.pct, 1)}
                  </span>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </Link>
  )
}

function SingleView({ divisi, direktorat, peers, kpiItems, topPerformers, insight, periode }: SingleProps) {
  const navigate = useInertiaNavigate()
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [lowestFirst, setLowestFirst] = useState(false)

  const tone = scoreTone(divisi.nilai)
  const periodeLabel = formatPeriod(periode)

  const itemPct = (i: KpiItem) => realisasiPercent(i.sasaran, i.realisasi, i.polaritas)
  const attentionCount = kpiItems.filter(i => itemPct(i) < 100).length

  // Triage pipeline → bentuk tabel scorecard (KpiScoreTable, sama dgn
  // Directorate KPI). Grup kosong di-drop.
  const tableGroups: ScoreGroup[] = groupByPerspektif(kpiItems)
    .map(g => {
      let items = attentionOnly ? g.items.filter(i => itemPct(i) < 100) : g.items
      if (lowestFirst) items = [...items].sort((a, b) => itemPct(a) - itemPct(b))
      return {
        key: g.perspektif,
        label: g.perspektif,
        color: PERSPEKTIF_COLOR[g.perspektif] ?? 'var(--ds-text-tertiary)',
        bobot: items.reduce((s, i) => s + i.bobot, 0),
        pct: g.pct,
        items: items.map(i => ({
          no: i.no,
          kode: i.kode,
          nama: i.nama,
          definisi: i.definisi,
          satuan: i.satuan,
          polaritas: i.polaritas,
          bobot: i.bobot,
          target: i.sasaran,
          realisasi: i.realisasi,
          skor: i.skor,
        })),
      }
    })
    .filter(g => g.items.length > 0)

  return (
    <>
      <Head title={`KPI Division — ${divisi.nama}`} />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/divisi')} type="button">
                <IconBack />
                Divisions
              </button>
              <h1 className="perf__title">{divisi.nama}</h1>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periodeLabel}
              </span>
            </div>
          </header>

          {/* ─── Subject card (instrumen: meta + gauge) ───────────── */}
          <Card padding="lg" className="perf__section perf-subject perf-subject--gauge" data-tone={tone}>
            <div className="perf-subject__meta">
              <span className="perf-subject__eyebrow">Division</span>
              <div className="perf-subject__name">{divisi.nama}</div>
              <div className="perf-subject__jabatan">
                Part of{' '}
                <Link
                  href={`/performance/kolegial/${direktorat.kode.toLowerCase()}`}
                  style={{ color: 'inherit', textDecoration: 'underline' }}
                >
                  {direktorat.nama}
                </Link>
              </div>
              <div className="perf-subject__chips">
                <Pill variant="mono">{divisi.kode}</Pill>
                <Pill tone="neutral" variant="soft">{kpiItems.length} KPI items</Pill>
                <Pill tone="neutral" variant="soft">Rank #{divisi.rank} of {divisi.totalDivisi} divisions</Pill>
                <Pill tone="neutral" variant="soft">Directorate {formatPercent(direktorat.nilai)}</Pill>
                {attentionCount > 0 && (
                  <Pill tone="amber" variant="soft">{attentionCount} below target</Pill>
                )}
              </div>
            </div>
            <Gauge
              value={Math.min(divisi.nilai, 110)}
              max={110}
              target={100}
              tone={tone}
              size={168}
              thickness={15}
              valueText={formatNumber(divisi.nilai, 1)}
              unit="%"
              label={`Score · ${periodeLabel}`}
            />
          </Card>

          {/* ─── Insight Utama (auto-derived) ───── */}
          <section className="perf__section">
            <InsightPanel insight={insight} />
          </section>

          {/* ─── KPI list ─────────────────────────── */}
          <section className="perf__section">
            <span className="perf__section-label">KPI Division Breakdown</span>
            {kpiItems.length === 0 ? (
              <Card padding="md" className="perf-empty">
                <div className="perf-empty__title">No KPIs yet</div>
                <div>No KPIs are registered for this division in the {periodeLabel} period.</div>
              </Card>
            ) : (
              <>
              {/* Triage toolbar + penjelasan skala skor */}
              <div className="perf-filter-row">
                <button
                  type="button"
                  className="perf-filter perf-filter--triage"
                  data-active={attentionOnly}
                  onClick={() => setAttentionOnly(v => !v)}
                  title="Show only KPIs below 100% achievement"
                >
                  <span className="perf-filter__dot" style={{ background: 'var(--tone-amber)' }} />
                  Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
                </button>
                <button
                  type="button"
                  className="perf-filter perf-filter--triage"
                  data-active={lowestFirst}
                  onClick={() => setLowestFirst(v => !v)}
                  title="Sort lowest achievement first"
                >
                  ↓ Lowest first
                </button>
              </div>
              <p className="perf-scale-note">
                Score = weight × achievement (capped 110%). The achievement bar is anchored at the 100% line —
                right of the line = above target, left = below (zoomed ±).
              </p>

              {tableGroups.length === 0 ? (
                <Card padding="md" className="perf-empty">
                  <div className="perf-empty__title">Nothing needs attention</div>
                  <div>All KPIs in this view meet 100% of target. Clear the filter to see everything.</div>
                </Card>
              ) : (
                <Card padding="none" className="perf-table-card">
                  <KpiScoreTable groups={tableGroups} />
                </Card>
              )}
              </>
            )}
          </section>

          {/* ─── Footer two-column ────────────────── */}
          <div className="perf__cols-2 perf__section">
            <Card padding="md">
              <div className="perf-card-head">
                <h2 className="perf-card-head__title">Other divisions in {direktorat.nama}</h2>
              </div>
              {peers.length === 0 ? (
                <div className="perf-empty">No peer divisions.</div>
              ) : (
                peers.map(p => {
                  const pt = scoreTone(p.nilai)
                  return (
                    <Link key={p.kode} href={`/performance/divisi/${p.kode.toLowerCase()}`} className="perf-rank">
                      <span className="perf-rank__num">·</span>
                      <div className="perf-rank__info">
                        <div className="perf-rank__name">{p.nama}</div>
                        <div className="perf-rank__sub">{p.kode}</div>
                      </div>
                      <span className="perf-rank__value" data-tone={pt}>
                        {formatPercent(p.nilai)}
                      </span>
                    </Link>
                  )
                })
              )}
            </Card>

            <Card padding="md">
              <div className="perf-card-head">
                <h2 className="perf-card-head__title">Top performers in the division</h2>
              </div>
              {topPerformers.length === 0 ? (
                <div className="perf-empty">No performer data yet.</div>
              ) : (
                topPerformers.map(p => {
                  const pt = scoreTone(p.nilai)
                  return (
                    <div key={p.rank} className="perf-rank perf-rank--static">
                      <span className="perf-rank__num" data-rank={p.rank}>{p.rank}</span>
                      <div className="perf-rank__info">
                        <div className="perf-rank__name">{p.nama}</div>
                        <div className="perf-rank__sub">{p.jabatan}</div>
                      </div>
                      <span className="perf-rank__value" data-tone={pt}>
                        {formatPercent(p.nilai)}
                      </span>
                    </div>
                  )
                })
              )}
            </Card>
          </div>

          <p className="perf-footnote">Maximum KPI Division achievement: 110%</p>
        </div>
      </div>
    </>
  )
}

function IconBack() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 2-4 4 4 4" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="1" y="2" width="12" height="11" rx="1.5" />
      <path d="M1 6h12M5 2v2M9 2v2" />
    </svg>
  )
}
