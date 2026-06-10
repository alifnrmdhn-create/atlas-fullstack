import { Head, Link, usePage } from '@inertiajs/react'
import { Card, Pill } from '../../design-system'
import { scoreTone, fillRatio, formatNumber, formatPercent, formatPeriod } from './_shared'
import { KpiTrendChart, type KpiTrendPayload } from './KpiTrendChart'
import './Performance.css'

type RankItem = { rank: number; nama: string; kode?: string; sub?: string; nilai: number }
type Divisi = { kode: string; nama: string; nilai: number }
type DirektoratCard = { kode: string; nama: string; nilai: number; divisi: Divisi[] }

type PageProps = {
  topDirektorat: RankItem[]
  topDivisi: RankItem[]
  direktoratGrid: DirektoratCard[]
  trend: KpiTrendPayload
  periode: string
}

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
  const { topDirektorat, topDivisi, direktoratGrid, trend, periode } = usePage<PageProps>().props

  // Header summary stat — computed from grid for symmetry
  const totalDirektorat = direktoratGrid.length
  const avgScore = totalDirektorat > 0
    ? direktoratGrid.reduce((s, d) => s + d.nilai, 0) / totalDirektorat
    : 0
  const belowTargetCount = direktoratGrid.filter(d => d.nilai < 80).length

  // Mode adaptif: pilot saat ini = 1 direktorat (DIR-KMR). Ranking antar-
  // direktorat & "average dari 1" tidak bermakna — cerita yang ada justru
  // antar-DIVISI. Layout solo: ranking semua divisi, tanpa pengulangan grid.
  const soloDir = totalDirektorat === 1 ? direktoratGrid[0] : null
  const soloDivisi: RankItem[] = soloDir
    ? [...soloDir.divisi]
        .sort((a, b) => b.nilai - a.nilai)
        .map((d, i) => ({ rank: i + 1, nama: d.kode, kode: d.kode, sub: d.nama, nilai: d.nilai }))
    : []
  const soloBelow100 = soloDir ? soloDir.divisi.filter(d => d.nilai < 100).length : 0

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
              {soloDir ? (
                <>
                  {/* Solo: "average dari 1 direktorat" menyesatkan — tampilkan
                      skor direktorat + ringkasan divisinya. */}
                  <span className="perf__header-stat">
                    <strong data-tone={scoreTone(soloDir.nilai)} data-num>{formatPercent(soloDir.nilai, 1)}</strong>
                    <span>directorate score</span>
                  </span>
                  <span className="perf__header-divider" aria-hidden />
                  <span className="perf__header-stat">
                    <strong data-num>{soloDir.divisi.length}</strong>
                    <span>divisions</span>
                  </span>
                  {soloBelow100 > 0 && (
                    <>
                      <span className="perf__header-divider" aria-hidden />
                      <span className="perf__header-stat">
                        <strong data-tone="amber" data-num>{soloBelow100}</strong>
                        <span>below 100%</span>
                      </span>
                    </>
                  )}
                </>
              ) : (
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

          {/* ─── Podium ───────────────────────────────
              Solo (1 direktorat): satu kartu ranking SEMUA divisi — ranking
              antar-direktorat & duplikasi Top-3-divisi tidak ada gunanya.
              Multi: dua kartu Top 3 berdampingan seperti semula. */}
          {soloDir ? (
            <Card padding="md" className="perf__section">
              <div className="perf-card-head">
                <h2 className="perf-card-head__title">Division Ranking — {soloDir.nama}</h2>
                <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
              </div>
              <div className="perf-rank-bar-list">
                {soloDivisi.map(item => (
                  <RankWithBar
                    key={item.kode || item.nama}
                    item={item}
                    href={`/performance/divisi/${(item.kode ?? '').toLowerCase()}`}
                  />
                ))}
              </div>
            </Card>
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

          {/* ─── Tren skor KPI 6 bulan terakhir ────── */}
          {trend && trend.series.length > 0 && (
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

function IconCalendar() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="1" y="2" width="12" height="11" rx="1.5" />
      <path d="M1 6h12M5 2v2M9 2v2" />
    </svg>
  )
}
