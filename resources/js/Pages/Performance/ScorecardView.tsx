import { Head, Link, usePage } from '@inertiajs/react'
import { Card, Pill, Gauge, Meter } from '../../design-system'
import { scoreTone, fillRatio, formatNumber, formatPercent, formatPeriod } from './_shared'
import { KpiTrendChart, type KpiTrendPayload } from './KpiTrendChart'
import { ExceptionsCard, type ExceptionRow } from './ExceptionsCard'
import './Performance.css'

type RankItem = { rank: number; nama: string; kode?: string; sub?: string; nilai: number }
type Divisi = { kode: string; nama: string; nilai: number }
type DirektoratCard = { kode: string; nama: string; nilai: number; divisi: Divisi[] }

type MatrixRow = {
  kode: string
  nama: string
  nilai: number
  direktorat: string
  perspektif: Record<string, number | null>
  onTarget: number
  kpiTotal: number
}

type PageProps = {
  topDirektorat: RankItem[]
  topDivisi: RankItem[]
  direktoratGrid: DirektoratCard[]
  trend: KpiTrendPayload
  periode: string
  matrix: MatrixRow[]
  exceptions: ExceptionRow[]
  kpiTotals: { total: number; onTarget: number }
}

/**
 * Intensitas tint heatmap dari deviasi terhadap 100% — biar matriks "hidup"
 * walau semua hijau (110% jadi blok pekat, 100,5% nyaris bening, 97% amber
 * pekat). Tanpa ini semua sel ter-tint rata = kembali terasa "standard".
 */
function cellIntensity(v: number): number {
  return Math.min(Math.max(Math.abs(v - 100) / 12, 0.1), 0.85)
}

// Urutan + label pendek kolom perspektif BSC di matriks.
const MATRIX_COLS: Array<{ key: string; label: string }> = [
  { key: 'Financial', label: 'Financial' },
  { key: 'Customer', label: 'Customer' },
  { key: 'Internal Business Process', label: 'IBP' },
  { key: 'L&G', label: 'L&G' },
]

/** Rank row with inline proportion bar — fills wide-column whitespace
 *  with meaningful achievement % visualization. Bar capped at 110% (max scorecard). */
function RankWithBar({
  item,
  onClick,
  href,
}: {
  item: RankItem
  onClick?: () => void
  href?: string
}) {
  const tone = scoreTone(item.nilai)
  const barPct = fillRatio(item.nilai) * 100
  const RowTag = (href ? Link : 'div') as React.ElementType
  const interactive = Boolean(href || onClick)
  return (
    <RowTag
      href={href}
      onClick={onClick}
      className={`perf-rank-bar${interactive ? '' : ' perf-rank-bar--static'}`}
    >
      <span className="perf-rank-bar__num" data-rank={item.rank}>{item.rank}</span>
      <div className="perf-rank-bar__main">
        <div className="perf-rank-bar__name">{item.nama}</div>
        {item.sub && <div className="perf-rank-bar__sub">{item.sub}</div>}
      </div>
      <div className="perf-rank-bar__viz">
        <div className="perf-rank-bar__track">
          <div
            className="perf-rank-bar__fill"
            data-tone={tone}
            style={{ width: `${barPct}%` }}
          />
        </div>
        <span className="perf-rank-bar__value" data-tone={tone}>
          {formatPercent(item.nilai)}
        </span>
      </div>
    </RowTag>
  )
}

export default function ScorecardView() {
  const { topDirektorat, topDivisi, direktoratGrid, trend, periode, matrix, exceptions, kpiTotals } =
    usePage<PageProps>().props

  // Header summary stat — computed from grid for symmetry
  const totalDirektorat = direktoratGrid.length
  const avgScore = totalDirektorat > 0
    ? direktoratGrid.reduce((s, d) => s + d.nilai, 0) / totalDirektorat
    : 0
  const belowTargetCount = direktoratGrid.filter(d => d.nilai < 80).length

  // Mode kokpit (pilot = 1 direktorat): verdict → matriks divisi×perspektif
  // → pengecualian KPI lintas-divisi → trend. Ranking/grid lama nyaris tanpa
  // informasi saat semua skor ~100% — bentuk ini menjawab "mana yang
  // menyimpang & di mana" tanpa drill-down per divisi.
  const soloDir = totalDirektorat === 1 ? direktoratGrid[0] : null
  const _soloBelow100 = soloDir ? soloDir.divisi.filter(d => d.nilai < 100).length : 0

  // Delta vs bulan berisi sebelumnya (dari payload trend).
  const soloDelta = (() => {
    if (!soloDir || !trend?.series?.length) return null
    const s = trend.series.find(x => x.kode === soloDir.kode) ?? trend.series[0]
    const filled = s.values
      .map((v, i) => ({ v, label: trend.periodes[i]?.label ?? '' }))
      .filter((x): x is { v: number; label: string } => x.v != null)
    if (filled.length < 2) return null
    const last = filled[filled.length - 1], prev = filled[filled.length - 2]
    return { value: last.v - prev.v, vs: prev.label }
  })()

  const periodeLabel = formatPeriod(periode)

  return (
    <>
      <Head title="Scorecard" />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <h1 className="perf__title">Scorecard</h1>
              <span className="perf__subtitle">Directorate &amp; division ranking</span>
            </div>
            <div className="perf__header-summary">
              {soloDir ? null : (
                <>
                  <span className="perf__header-stat">
                    <strong data-tone={scoreTone(avgScore)} data-num>{formatPercent(avgScore, 1)}</strong>
                    <span>average</span>
                  </span>
                  <span className="perf__header-divider" aria-hidden />
                  <span className="perf__header-stat">
                    <strong data-num>{totalDirektorat}</strong>
                    <span>{totalDirektorat === 1 ? 'directorate' : 'directorates'}</span>
                  </span>
                  {belowTargetCount > 0 && (
                    <>
                      <span className="perf__header-divider" aria-hidden />
                      <span className="perf__header-stat">
                        <strong data-tone="red" data-num>{belowTargetCount}</strong>
                        <span>below target</span>
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periodeLabel}
              </span>
            </div>
          </header>

          {direktoratGrid.length === 0 && (
            <Card padding="lg" className="perf__section perf-empty">
              <div className="perf-empty__title">No scorecard data yet</div>
              <div>Directorate and division scores are not available for the {periodeLabel} period.</div>
            </Card>
          )}

          {/* ─── Kokpit solo: hero → matriks | aside ──────────────
              Heatmap menempatkan kelemahan secara spasial (divisi mana ×
              perspektif mana); hero = verdict ber-gradient ala Home. */}
          {soloDir ? (
            <>
            <Card padding="none" className="perf__section perf-hero perf-hero--rich" data-tone={scoreTone(soloDir.nilai)}>
              {/* Zona 1 — verdict: angka gradient + delta + per-divisi mini-bar
                  (mirror persis kartu "KPI Achievement" di Home). */}
              <div className="perf-hero__verdict">
                <span className="perf-hero__eyebrow">Directorate scorecard · {periodeLabel}</span>
                <h2 className="perf-hero__name">{soloDir.nama}</h2>
                <div className="perf-hero__numrow">
                  <span className="perf-hero__num" data-tone={scoreTone(soloDir.nilai)}>
                    {formatNumber(soloDir.nilai, 1)}<span className="perf-hero__num-unit">%</span>
                  </span>
                  {soloDelta && (
                    <span className="perf__header-delta" data-tone={soloDelta.value >= 0 ? 'green' : 'red'}>
                      {soloDelta.value >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(soloDelta.value), 1)} vs {soloDelta.vs}
                    </span>
                  )}
                </div>
                <span className="perf-hero__sub">vs target 100% · {periodeLabel}</span>
              </div>

              {/* Zona 2 — mini-bar per divisi (Meter, target tick 100). */}
              <div className="perf-hero__divisions">
                {[...soloDir.divisi].sort((a, b) => b.nilai - a.nilai).map(d => (
                  <Link
                    key={d.kode}
                    href={`/performance/divisi/${d.kode.toLowerCase()}`}
                    className="perf-hero__divrow"
                  >
                    <span className="perf-hero__divcode">{d.kode.replace('-HLD', '')}</span>
                    <Meter value={Math.min(d.nilai, 110)} max={110} target={100} tone={scoreTone(d.nilai)} height={7} className="perf-hero__divbar" />
                    <span className="perf-hero__divval" data-tone={scoreTone(d.nilai)}>{formatNumber(d.nilai, 1)}</span>
                  </Link>
                ))}
              </div>

              {/* Zona 3 — gauge speedometer cakupan KPI on-target. */}
              <div className="perf-hero__gauge">
                <Gauge
                  value={kpiTotals.onTarget}
                  max={kpiTotals.total || 1}
                  tone={kpiTotals.onTarget === kpiTotals.total ? 'green' : 'amber'}
                  size={148}
                  thickness={14}
                  valueText={`${kpiTotals.onTarget}`}
                  unit={`/${kpiTotals.total}`}
                  label="KPIs on target"
                />
              </div>
            </Card>

            <div className="perf-cockpit perf__section">
            <section>
              <div className="perf-section-head">
                <span className="perf__section-label">Division × BSC Perspective</span>
                <span className="perf-section-meta">click a row to drill down</span>
              </div>
              <Card padding="none" className="perf-matrix-card">
                <ScoreMatrix rows={matrix} />
              </Card>
            </section>

            {/* ─── Pengecualian lintas-divisi | Trend ───────────── */}
            <div className="perf-cockpit__aside">
              <div className="perf-section-head">
                <span className="perf__section-label">This month</span>
                <span className="perf-section-meta">across all divisions</span>
              </div>
              <ExceptionsCard exceptions={exceptions} total={kpiTotals.total} />

              {trend && trend.series.length > 0 && (
                <Card padding="md">
                  <div className="perf-card-head">
                    <h2 className="perf-card-head__title">Score trend</h2>
                    <Pill tone="neutral" variant="soft">
                      {trend.periodes[0]?.label} – {trend.periodes[trend.periodes.length - 1]?.label}
                    </Pill>
                  </div>
                  <KpiTrendChart trend={trend} height={220} />
                </Card>
              )}
            </div>
            </div>
            </>
          ) : direktoratGrid.length > 0 && (
          <div className="perf__cols-2 perf__section">
            <Card padding="md">
              <div className="perf-card-head">
                <h2 className="perf-card-head__title">Top 3 Directorates</h2>
                <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
              </div>
              <div className="perf-rank-bar-list">
                {topDirektorat.map(item => (
                  <RankWithBar key={item.nama} item={item} />
                ))}
              </div>
            </Card>

            <Card padding="md">
              <div className="perf-card-head">
                <h2 className="perf-card-head__title">Top 3 Divisions</h2>
                <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
              </div>
              <div className="perf-rank-bar-list">
                {topDivisi.map(item => (
                  <RankWithBar
                    key={item.kode || item.nama}
                    item={item}
                    href={`/performance/divisi/${(item.kode ?? '').toLowerCase()}`}
                  />
                ))}
              </div>
            </Card>
          </div>
          )}

          {/* ─── Tren skor KPI 6 bulan terakhir (multi-direktorat) ── */}
          {!soloDir && trend && trend.series.length > 0 && (
            <section className="perf__section">
              <div className="perf-section-head">
                <span className="perf__section-label">KPI Score Trend</span>
                <span className="perf-section-meta">
                  {trend.periodes[0]?.label} – {trend.periodes[trend.periodes.length - 1]?.label} · by directorate
                </span>
              </div>
              <Card padding="md">
                <KpiTrendChart trend={trend} />
              </Card>
            </section>
          )}

          {/* ─── Semua Direktorat grid ──────────────
              Disembunyikan saat solo — isinya identik dengan Division Ranking
              di atas (dulu info yang sama tampil 3–4× di satu layar). */}
          {!soloDir && direktoratGrid.length > 0 && (
          <section className="perf__section">
            <div className="perf-section-head">
              <span className="perf__section-label">All Directorates</span>
              <span className="perf-section-meta">{totalDirektorat} directorates · drill down for details</span>
            </div>
            <div className="perf-direktorat-grid">
              {direktoratGrid.map(d => {
                const tone = scoreTone(d.nilai)
                const barPct = fillRatio(d.nilai) * 100
                return (
                  <Card key={d.kode} padding="none" className="perf-direktorat">
                    <Link
                      href={`/performance/kolegial/${d.kode.toLowerCase()}`}
                      className="perf-direktorat__head"
                    >
                      <span className="perf-direktorat__name">{d.nama}</span>
                      <span className="perf-direktorat__total" data-tone={tone}>
                        {formatNumber(d.nilai)}<span className="perf-direktorat__unit">%</span>
                      </span>
                    </Link>
                    {/* Overall achievement bar — visualizes total in card head context */}
                    <div className="perf-direktorat__bar">
                      <div
                        className="perf-direktorat__bar-fill"
                        data-tone={tone}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="perf-direktorat__divisi">
                      {d.divisi.map(div => {
                        const dt = scoreTone(div.nilai)
                        return (
                          <Link
                            key={div.kode}
                            href={`/performance/divisi/${div.kode.toLowerCase()}`}
                            className="perf-divisi-row"
                            title={div.nama}
                          >
                            <span className="perf-divisi-row__code">{div.kode}</span>
                            <span className="perf-divisi-row__name">{div.nama}</span>
                            <span className="perf-divisi-row__value" data-tone={dt}>
                              {formatPercent(div.nilai)}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
          )}

          {/* Legend — replaces the orphan "Capaian maksimal 110%" footer */}
          <div className="perf-legend" role="note">
            <span className="perf-legend__item">
              <span className="perf-legend__dot" data-tone="red" />
              &lt; 80% below target
            </span>
            <span className="perf-legend__item">
              <span className="perf-legend__dot" data-tone="amber" />
              80–99% needs attention
            </span>
            <span className="perf-legend__item">
              <span className="perf-legend__dot" data-tone="green" />
              ≥ 100% meets target
            </span>
            <span className="perf-legend__item perf-legend__item--muted">
              Maximum scale 110%
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Matriks divisi × perspektif BSC — heatmap kecil yang menempatkan kelemahan
 * secara spasial. Sel = achievement tertimbang perspektif itu; tint mengikuti
 * tone (merah <80 · amber <100 · hijau ≥100). Baris klik → halaman divisi.
 */
function ScoreMatrix({ rows }: { rows: MatrixRow[] }) {
  const cols = MATRIX_COLS.filter(c => rows.some(r => r.perspektif[c.key] != null))
  return (
    <div
      className="perf-matrix"
      role="table"
      aria-label="Division by perspective achievement"
      // Jumlah kolom eksplisit — auto-fit membuat sel wrap ke baris implisit
      // saat sempit (mobile), bukan memicu scroll-x.
      style={{ ['--matrix-cols' as never]: cols.length + 2 }}
    >
      <div className="perf-matrix__row perf-matrix__row--head" role="row">
        <span className="perf-matrix__division" role="columnheader">Division</span>
        {cols.map(c => (
          <span key={c.key} className="perf-matrix__cell perf-matrix__cell--head" role="columnheader">{c.label}</span>
        ))}
        <span className="perf-matrix__cell perf-matrix__cell--head perf-matrix__cell--total" role="columnheader">Total</span>
        <span className="perf-matrix__cell perf-matrix__cell--head" role="columnheader">On target</span>
      </div>
      {rows.map(r => (
        <Link
          key={r.kode}
          href={`/performance/divisi/${r.kode.toLowerCase()}`}
          className="perf-matrix__row"
          role="row"
        >
          <span className="perf-matrix__division" role="cell">
            <span className="perf-matrix__division-code">{r.kode}</span>
            <span className="perf-matrix__division-name">{r.nama}</span>
          </span>
          {cols.map(c => {
            const v = r.perspektif[c.key]
            return (
              <span
                key={c.key}
                className="perf-matrix__cell"
                data-tone={v == null ? undefined : scoreTone(v)}
                style={v == null ? undefined : ({ ['--i' as never]: cellIntensity(v) })}
                role="cell"
              >
                {v == null ? '—' : formatPercent(v, 1)}
              </span>
            )
          })}
          <span
            className="perf-matrix__cell perf-matrix__cell--total"
            data-tone={scoreTone(r.nilai)}
            style={{ ['--i' as never]: cellIntensity(r.nilai) }}
            role="cell"
          >
            {formatPercent(r.nilai, 1)}
          </span>
          <span
            className="perf-matrix__cell perf-matrix__cell--kpis"
            data-tone={r.onTarget === r.kpiTotal ? 'green' : 'amber'}
            style={{ ['--i' as never]: r.onTarget === r.kpiTotal ? 0.1 : 0.25 }}
            role="cell"
          >
            {r.onTarget}/{r.kpiTotal}
          </span>
        </Link>
      ))}
    </div>
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
