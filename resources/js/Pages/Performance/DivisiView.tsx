import { Head, Link, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Card, Pill } from '../../design-system'
import { ForecastBadge } from '../../components/ui'
import { computeForecastFromStrings } from '../../lib/forecast'
import { scoreTone, fillRatio, realisasiPercent } from './_shared'
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

type KeyKpi = {
  kode: string
  nama: string
  bobot: number
  satuan: string
  polaritas: 'maximize' | 'minimize'
  sasaran: string
  realisasi: string
  skor: number
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
  keyKpis: KeyKpi[]
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

  return (
    <>
      <Head title={`KPI Divisi · ${direktorat.nama}`} />
      <div className="ds perf">
        <div className="perf__inner">
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/scorecard')} type="button">
                <IconBack />
                Scorecard
              </button>
              <h1 className="perf__title">KPI Divisi</h1>
              <span className="perf__subtitle">{direktorat.nama}</span>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periode}
              </span>
            </div>
          </header>

          {/* Direktorat overview — flat inline header, no nested card (Pattern A) */}
          <section className="perf-compare__hero">
            <div className="perf-compare__hero-meta">
              <span className="perf-compare__hero-eyebrow">Direktorat</span>
              <h2 className="perf-compare__hero-name">{direktorat.nama}</h2>
              <div className="perf-compare__hero-sub">
                <span className="perf-compare__hero-code">{direktorat.kode}</span>
                <span>·</span>
                <span>{divisiList.length} divisi</span>
                <span>·</span>
                <span>rata-rata divisi {avgNilai.toFixed(2)}%</span>
              </div>
            </div>
            <div className="perf-compare__hero-score">
              <span className="perf-compare__hero-score-val" data-tone={tone}>
                {direktorat.nilai.toFixed(2)}%
              </span>
              <span className="perf-compare__hero-score-lbl">Nilai direktorat · {periode}</span>
            </div>
          </section>

          {divisiList.length === 0 ? (
            <Card padding="md" className="perf-empty">
              <div className="perf-empty__title">Belum ada divisi</div>
              <div>Direktorat ini belum punya data divisi di periode {periode}.</div>
            </Card>
          ) : (
            <div className="perf-compare-grid">
              {divisiList.map(div => (
                <DivisiCompareCard key={div.kode} div={div} />
              ))}
            </div>
          )}

          <p className="perf-footnote">Capaian KPI Divisi maksimal: 110%</p>
        </div>
      </div>
    </>
  )
}

function DivisiCompareCard({ div }: { div: DivisiCompare }) {
  const tone = scoreTone(div.nilai)
  const allOnTarget = div.atRisk === 0 && div.kpiCount > 0
  const statusTone = allOnTarget ? 'green' : (div.atRisk > div.onTarget ? 'red' : 'amber')

  // Find max bobot for relative bar widths
  const maxBobot = div.keyKpis.length > 0
    ? Math.max(...div.keyKpis.map(k => k.bobot || 0))
    : 1

  return (
    <Link href={`/performance/divisi/${div.kode.toLowerCase()}`} className="perf-compare-card">
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
            {div.nilai.toFixed(2)}<span className="perf-compare-card__score-pct">%</span>
          </span>
          <span className="perf-compare-card__status" data-tone={statusTone}>
            {allOnTarget
              ? `Semua ${div.kpiCount} KPI on target`
              : `${div.onTarget}/${div.kpiCount} on target`}
          </span>
        </div>
      </div>

      <div className="perf-compare-card__divider" />

      <div className="perf-compare-card__kpis">
        <span className="perf-compare-card__kpis-label">Kontribusi terbesar · bobot</span>
        {div.keyKpis.length === 0 ? (
          <span className="perf-compare-card__kpi-empty">Belum ada KPI</span>
        ) : (
          div.keyKpis.map(k => {
            const pct = realisasiPercent(k.sasaran, k.realisasi, k.polaritas)
            const itemTone = scoreTone(pct)
            const barWidth = maxBobot > 0 ? (k.bobot / maxBobot) * 100 : 0
            return (
              <div key={k.kode} className="perf-compare-card__kpi">
                <span className="perf-compare-card__kpi-name" title={k.nama}>{k.nama}</span>
                <div className="perf-compare-card__kpi-bar" aria-hidden="true">
                  <div
                    className="perf-compare-card__kpi-bar-fill"
                    data-tone={itemTone}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="perf-compare-card__kpi-skor" data-tone={itemTone}>
                  {k.skor.toFixed(1)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </Link>
  )
}

function SingleView({ divisi, direktorat, peers, kpiItems, topPerformers, insight, periode }: SingleProps) {
  const navigate = useInertiaNavigate()

  const tone = scoreTone(divisi.nilai)
  const bar = fillRatio(divisi.nilai) * 100

  return (
    <>
      <Head title={`KPI Divisi — ${divisi.nama}`} />
      <div className="ds perf">
        <div className="perf__inner">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/divisi')} type="button">
                <IconBack />
                Divisi
              </button>
              <h1 className="perf__title">{divisi.nama}</h1>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periode}
              </span>
            </div>
          </header>

          {/* ─── Subject card ─────────────────────── */}
          <Card padding="lg" className="perf__section perf-subject">
            <div className="perf-subject__row">
              <div className="perf-subject__meta">
                <span className="perf-subject__eyebrow">Divisi</span>
                <div className="perf-subject__name">{divisi.nama}</div>
                <div className="perf-subject__jabatan">
                  Bagian dari{' '}
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
                  <Pill tone="neutral" variant="soft">Ranking #{divisi.rank} dari {divisi.totalDivisi} divisi</Pill>
                  <Pill tone="neutral" variant="soft">Direktorat {direktorat.nilai.toFixed(2)}%</Pill>
                </div>
              </div>
              <div className="perf-subject__score">
                <span className="perf-subject__score-value" data-tone={tone}>
                  {divisi.nilai.toFixed(2)}<span style={{ fontSize: 18, color: 'var(--ds-text-tertiary)', marginLeft: 4 }}>%</span>
                </span>
                <span className="perf-subject__score-label">Nilai {periode}</span>
              </div>
            </div>
            <div className="perf-subject__bar">
              <div className="perf-subject__bar-fill" data-tone={tone} style={{ width: `${bar}%` }} />
            </div>
          </Card>

          {/* ─── Insight Utama (auto-derived) ───── */}
          <section className="perf__section">
            <InsightPanel insight={insight} />
          </section>

          {/* ─── KPI list ─────────────────────────── */}
          <section className="perf__section">
            <span className="perf__section-label">Rincian KPI Divisi</span>
            {kpiItems.length === 0 ? (
              <Card padding="md" className="perf-empty">
                <div className="perf-empty__title">Belum ada KPI</div>
                <div>Tidak ada KPI terdaftar untuk divisi ini di periode {periode}.</div>
              </Card>
            ) : (
              <div className="perf-kpi-list">
                {kpiItems.map(item => {
                  const pct = realisasiPercent(item.sasaran, item.realisasi, item.polaritas)
                  const skorPct = item.bobot > 0 ? (item.skor / item.bobot) * 100 : 0
                  const itemTone = scoreTone(skorPct)
                  const barWidth = Math.min(pct, 100)
                  const forecast = computeForecastFromStrings({
                    periode, sasaran: item.sasaran, realisasi: item.realisasi, polaritas: item.polaritas,
                  })

                  return (
                    <article key={item.kode} className="perf-kpi">
                      <span className="perf-kpi__num">{item.no}</span>
                      <div className="perf-kpi__main">
                        <h3 className="perf-kpi__title">{item.nama}</h3>
                        <div className="perf-kpi__meta">
                          <Pill variant="mono">{item.kode}</Pill>
                          <span className={`perf-kpi__meta-chip perf-kpi__meta-chip--${item.polaritas === 'maximize' ? 'max' : 'min'}`}>
                            {item.polaritas === 'maximize' ? '↑ Maximize' : '↓ Minimize'}
                          </span>
                          <span className="perf-kpi__meta-chip">{item.satuan}</span>
                          {forecast && <ForecastBadge value={forecast.value} status={forecast.status} />}
                        </div>
                        <div className="perf-kpi__realisasi">
                          <div className="perf-kpi__realisasi-block">
                            <span className="perf-kpi__realisasi-label">Sasaran</span>
                            <span className="perf-kpi__realisasi-value">{item.sasaran}</span>
                          </div>
                          <span className="perf-kpi__realisasi-arrow">→</span>
                          <div className="perf-kpi__realisasi-block">
                            <span className="perf-kpi__realisasi-label">Realisasi</span>
                            <span className="perf-kpi__realisasi-value" data-tone={itemTone}>{item.realisasi}</span>
                          </div>
                        </div>
                        <div className="perf-kpi__bar">
                          <div className="perf-kpi__bar-fill" data-tone={itemTone} style={{ width: `${barWidth}%` }} />
                        </div>
                        {item.definisi && (
                          <p className="perf-kpi__definisi">{item.definisi}</p>
                        )}
                      </div>
                      <div className="perf-kpi__right">
                        <span className="perf-kpi__skor" style={{ color: `var(--ds-${itemTone}-600)` }}>
                          {item.skor.toFixed(2)}
                        </span>
                        <span className="perf-kpi__bobot">Bobot {item.bobot}%</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* ─── Footer two-column ────────────────── */}
          <div className="perf__cols-2 perf__section">
            <Card padding="md">
              <div className="perf-card-head">
                <h2 className="perf-card-head__title">Divisi lain di {direktorat.nama}</h2>
              </div>
              {peers.length === 0 ? (
                <div className="perf-empty">Tidak ada divisi peer.</div>
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
                        {p.nilai.toFixed(2)}%
                      </span>
                    </Link>
                  )
                })
              )}
            </Card>

            <Card padding="md">
              <div className="perf-card-head">
                <h2 className="perf-card-head__title">Top performer di divisi</h2>
              </div>
              {topPerformers.length === 0 ? (
                <div className="perf-empty">Belum ada data performer.</div>
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
                        {p.nilai.toFixed(2)}
                      </span>
                    </div>
                  )
                })
              )}
            </Card>
          </div>

          <p className="perf-footnote">Capaian KPI Divisi maksimal: 110%</p>
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
