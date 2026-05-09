import { Head, Link, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Card, Pill } from '../../design-system'
import { ForecastBadge } from '../../components/ui'
import { computeForecastFromStrings } from '../../lib/forecast'
import { scoreTone, fillRatio, realisasiPercent } from './_shared'
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

type PageProps = {
  divisi: Divisi
  direktorat: Direktorat
  peers: Peer[]
  kpiItems: KpiItem[]
  topPerformers: Performer[]
  periode: string
}

export default function DivisiView() {
  const { divisi, direktorat, peers, kpiItems, topPerformers, periode } = usePage<PageProps>().props
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
              <button className="perf__back" onClick={() => navigate('/performance/scorecard')} type="button">
                <IconBack />
                Scorecard
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
