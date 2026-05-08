import { Link, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { DataSourceBadge } from '../../components/ui'

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

function scoreColor(val: number): 'green' | 'yellow' | 'red' {
  if (val >= 100) return 'green'
  if (val >= 80) return 'yellow'
  return 'red'
}

function realisasiFillPct(sasaran: string, realisasi: string, polaritas: 'maximize' | 'minimize'): number {
  const t = parseFloat(sasaran.replace(',', '.'))
  const r = parseFloat(realisasi.replace(',', '.'))
  if (isNaN(t) || isNaN(r)) return 0
  if (t === 0) return r === 0 ? 100 : 0
  const ratio = polaritas === 'maximize' ? r / t : t / Math.max(Math.abs(r), 0.0001)
  return Math.min(Math.abs(ratio) * 100, 110)
}

export default function DivisiView() {
  const { divisi, direktorat, peers, kpiItems, topPerformers, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()

  const nilaiColor = scoreColor(divisi.nilai)
  const headerBarWidth = Math.min((divisi.nilai / 110) * 100, 100)

  return (
    <div className="view-performance">
      {/* Toolbar */}
      <div className="perf-toolbar">
        <button
          className="perf-toolbar__back"
          onClick={() => navigate('/performance/scorecard')}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m8 2-4 4 4 4" />
          </svg>
          Kembali ke Scorecard
        </button>
        <div className="perf-toolbar__sep" />
        <span className="perf-toolbar__title">{divisi.nama}</span>
        <DataSourceBadge type="dummy" />
        <div className="perf-toolbar__right">
          <span className={`badge badge--${nilaiColor}`} style={{ fontSize: 12, fontWeight: 700 }}>
            Nilai {periode}: {divisi.nilai.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="perf-content">
        {/* Header */}
        <div className="perf-detail-header">
          <div className="perf-detail-header__top">
            <div className="perf-detail-header__meta">
              <div className="perf-detail-header__name">{divisi.nama}</div>
              <div className="perf-detail-header__jabatan">
                Bagian dari{' '}
                <Link href={`/performance/kolegial/${direktorat.kode.toLowerCase()}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                  {direktorat.nama}
                </Link>
              </div>
              <span className="perf-detail-header__unit">{divisi.kode}</span>
            </div>
            <div className="perf-detail-header__score-badge">
              <div className={`perf-detail-header__score-value perf-detail-header__score-value--${nilaiColor}`}>
                {divisi.nilai.toFixed(2)}
              </div>
              <div className="perf-detail-header__score-label">Nilai {periode}</div>
            </div>
          </div>
          <div className="perf-detail-header__progress">
            <div className="perf-detail-header__progress-bar">
              <div
                className={`perf-detail-header__progress-fill perf-detail-header__progress-fill--${nilaiColor}`}
                style={{ width: `${headerBarWidth}%` }}
              />
            </div>
          </div>
          <div className="perf-detail-header__meta-row">
            <span className="perf-detail-header__chip">{kpiItems.length} KPI items</span>
            <span className="perf-detail-header__chip">Ranking #{divisi.rank} dari {divisi.totalDivisi} divisi</span>
            <span className="perf-detail-header__chip">Direktorat {direktorat.nilai.toFixed(2)}%</span>
          </div>
        </div>

        {/* KPI items — pakai pola perf-kpi-card dari IndividuDetail */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Rincian KPI Divisi
          </div>
          {kpiItems.length === 0 ? (
            <div className="perf-empty">
              <div className="perf-empty__title">Belum ada KPI</div>
              <div className="perf-empty__sub">Tidak ada KPI terdaftar untuk divisi ini di periode {periode}.</div>
            </div>
          ) : (
            kpiItems.map((item) => {
              const pct = realisasiFillPct(item.sasaran, item.realisasi, item.polaritas)
              const itemColor = scoreColor(pct > 0 ? (item.skor / item.bobot) * 100 : 0)
              const barWidth = Math.min(pct, 100)
              return (
                <div key={item.kode} className="perf-kpi-card">
                  <div className="perf-kpi-card__header">
                    <span className="perf-kpi-card__num">{item.no}</span>
                    <span className="perf-kpi-card__kode">{item.kode}</span>
                    <span className="perf-kpi-card__bobot">Bobot {item.bobot}%</span>
                    <span className="perf-kpi-card__title">{item.nama}</span>
                    <span className="perf-kpi-card__skor">{item.skor.toFixed(2)}</span>
                  </div>
                  <div className="perf-kpi-card__body">
                    <div className="perf-kpi-card__pills">
                      <span className="perf-kpi-card__pill perf-kpi-card__pill--satuan">{item.satuan}</span>
                      <span className={`perf-kpi-card__pill perf-kpi-card__pill--${item.polaritas === 'maximize' ? 'max' : 'min'}`}>
                        {item.polaritas === 'maximize' ? '↑ Maximize' : '↓ Minimize'}
                      </span>
                      <span className="perf-kpi-card__pill perf-kpi-card__pill--periode">{periode}</span>
                    </div>
                    <div className="perf-kpi-card__realisasi">
                      <div className="perf-kpi-card__val-block">
                        <span className="perf-kpi-card__val-label">Sasaran</span>
                        <span className="perf-kpi-card__val">{item.sasaran}</span>
                      </div>
                      <span className="perf-kpi-card__arrow">→</span>
                      <div className="perf-kpi-card__val-block perf-kpi-card__val-block--right">
                        <span className="perf-kpi-card__val-label">Realisasi</span>
                        <span className={`perf-kpi-card__val perf-kpi-card__val--${itemColor}`}>{item.realisasi}</span>
                      </div>
                    </div>
                    <div className="perf-kpi-card__bar">
                      <div
                        className={`perf-kpi-card__bar-fill perf-kpi-card__bar-fill--${itemColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    {item.definisi && (
                      <div className="perf-kpi-card__definisi">{item.definisi}</div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Two-column footer: Peer divisi + Top performer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="perf-podium-section">
            <div className="perf-podium-section__header">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M2 7h10M2 3h10M2 11h10" />
              </svg>
              <span className="perf-podium-section__title">Divisi Lain di {direktorat.nama}</span>
            </div>
            {peers.length === 0 ? (
              <div className="perf-empty"><div className="perf-empty__sub">Tidak ada divisi peer.</div></div>
            ) : (
              peers.map((p) => {
                const c = scoreColor(p.nilai)
                return (
                  <Link
                    key={p.kode}
                    href={`/performance/divisi/${p.kode}`}
                    className="perf-rank-item"
                    style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                  >
                    <div className="perf-rank-item__info">
                      <div className="perf-rank-item__name">{p.nama}</div>
                      <div className="perf-rank-item__sub">{p.kode}</div>
                    </div>
                    <span className={`perf-rank-item__score perf-rank-item__score--${c}`}>
                      {p.nilai.toFixed(2)}%
                    </span>
                  </Link>
                )
              })
            )}
          </div>

          <div className="perf-podium-section">
            <div className="perf-podium-section__header">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M7 1l1.5 3.5L12 5 9.5 7.5 10 11 7 9.5 4 11l.5-3.5L2 5l3.5-.5L7 1z" />
              </svg>
              <span className="perf-podium-section__title">Top Performer di Divisi</span>
            </div>
            {topPerformers.length === 0 ? (
              <div className="perf-empty"><div className="perf-empty__sub">Belum ada data performer.</div></div>
            ) : (
              topPerformers.map((p) => {
                const c = scoreColor(p.nilai)
                return (
                  <div key={p.rank} className="perf-rank-item">
                    <span className={`perf-rank-badge perf-rank-badge--${p.rank}`}>{p.rank}</span>
                    <div className="perf-rank-item__info">
                      <div className="perf-rank-item__name">{p.nama}</div>
                      <div className="perf-rank-item__sub">{p.jabatan}</div>
                    </div>
                    <span className={`perf-rank-item__score perf-rank-item__score--${c}`}>
                      {p.nilai.toFixed(2)}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 4 }}>
          Capaian KPI Divisi maksimal: 110%
        </div>
      </div>
    </div>
  )
}
