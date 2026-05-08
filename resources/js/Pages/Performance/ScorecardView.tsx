import { Link, usePage } from '@inertiajs/react'

type RankItem = { rank: number; nama: string; kode?: string; sub?: string; nilai: number }
type Divisi = { kode: string; nama: string; nilai: number }
type DirektoratCard = { kode: string; nama: string; nilai: number; divisi: Divisi[] }

type PageProps = {
  topDirektorat: RankItem[]
  topDivisi: RankItem[]
  direktoratGrid: DirektoratCard[]
  periode: string
}

function scoreColor(val: number): 'green' | 'yellow' | 'red' {
  if (val >= 100) return 'green'
  if (val >= 80) return 'yellow'
  return 'red'
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={`perf-rank-badge perf-rank-badge--${rank}`}>
      {rank}
    </span>
  )
}

function TopSection({ title, items }: { title: string; items: RankItem[] }) {
  return (
    <div className="perf-podium-section">
      <div className="perf-podium-section__header">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M7 1l1.5 3.5L12 5 9.5 7.5 10 11 7 9.5 4 11l.5-3.5L2 5l3.5-.5L7 1z" />
        </svg>
        <span className="perf-podium-section__title">{title}</span>
      </div>
      {items.map((item) => {
        const color = scoreColor(item.nilai)
        return (
          <div key={item.nama} className="perf-rank-item">
            <RankBadge rank={item.rank} />
            <div className="perf-rank-item__info">
              <div className="perf-rank-item__name">{item.nama}</div>
              {item.sub && <div className="perf-rank-item__sub">{item.sub}</div>}
            </div>
            <span className={`perf-rank-item__score perf-rank-item__score--${color}`}>
              {item.nilai.toFixed(2)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function ScorecardView() {
  const { topDirektorat, topDivisi, direktoratGrid, periode } = usePage<PageProps>().props

  return (
    <div className="view-performance">
      {/* Toolbar */}
      <div className="perf-toolbar">
        <span className="perf-toolbar__title">Scorecard</span>
        <div className="perf-toolbar__sep" />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          Ranking direktorat & divisi
        </span>
        <div className="perf-toolbar__right">
          <div className="perf-period-select">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <rect x="1" y="2" width="12" height="11" rx="1.5" />
              <path d="M1 6h12M5 2v2M9 2v2" />
            </svg>
            {periode}
          </div>
        </div>
      </div>

      <div className="perf-content">
        {/* Top 3 panels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <TopSection title="Top 3 Scorecard Direktorat" items={topDirektorat} />
          <TopSection title="Top 3 Scorecard Divisi" items={topDivisi} />
        </div>

        {/* Grid per direktorat */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Semua Direktorat
          </div>
          <div className="perf-scorecard-grid">
            {direktoratGrid.map((d) => {
              const color = scoreColor(d.nilai)
              const barWidth = Math.min((d.nilai / 110) * 100, 100)

              return (
                <div key={d.kode} className="perf-scorecard-card">
                  <Link
                    href={`/performance/kolegial/${d.kode.toLowerCase()}`}
                    className="perf-scorecard-card__header"
                    style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                    title={`Lihat KPI Direktorat ${d.nama}`}
                  >
                    <span className="perf-scorecard-card__title">{d.nama}</span>
                    <span className={`perf-scorecard-card__total perf-scorecard-card__total--${color}`}>
                      {d.nilai.toFixed(2)}%
                    </span>
                  </Link>
                  <div className="perf-scorecard-card__bar">
                    <div
                      className={`perf-scorecard-card__bar-fill perf-scorecard-card__bar-fill--${color}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="perf-scorecard-card__divisi-list">
                    {d.divisi.map((div) => {
                      const dc = scoreColor(div.nilai)
                      const dw = Math.min((div.nilai / 110) * 100, 100)
                      return (
                        <Link
                          key={div.kode}
                          href={`/performance/divisi/${div.kode}`}
                          className="perf-divisi-row"
                          style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                          title={`Lihat KPI Divisi ${div.nama}`}
                        >
                          <span className="perf-divisi-row__code">{div.kode}</span>
                          <div className="perf-divisi-row__bar">
                            <div
                              className={`perf-divisi-row__bar-fill perf-divisi-row__bar-fill--${dc}`}
                              style={{ width: `${dw}%` }}
                            />
                          </div>
                          <span className={`perf-divisi-row__pct perf-divisi-row__pct--${dc}`}>
                            {div.nilai.toFixed(2)}%
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Note */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 4 }}>
          Capaian Scorecard maksimal: 110%
        </div>
      </div>
    </div>
  )
}
