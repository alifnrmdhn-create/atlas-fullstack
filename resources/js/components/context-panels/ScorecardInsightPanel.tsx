import { Link, usePage } from '@inertiajs/react'
import { TrendingUp, TrendingDown, AlertCircle, Calendar } from 'lucide-react'

type RankItem = { rank: number; nama: string; kode?: string; sub?: string; nilai: number }
type Divisi = { kode: string; nama: string; nilai: number }
type DirektoratCard = { kode: string; nama: string; nilai: number; divisi: Divisi[] }

type ScorecardPageProps = {
  topDirektorat?: RankItem[]
  topDivisi?: RankItem[]
  direktoratGrid?: DirektoratCard[]
  periode?: string
}

/**
 * Scorecard context panel — insight outperformer/underperformer.
 *
 * Reads the same Inertia page props that ScorecardView consumes, so the
 * panel and the main page never disagree about what's "top" or
 * "bottom". When props are absent (e.g., Inertia layout-only render
 * during transition), shows a quiet loading state.
 */
export function ScorecardInsightPanel() {
  const { props } = usePage<ScorecardPageProps>()
  const topDirektorat = props.topDirektorat ?? []
  const direktoratGrid = props.direktoratGrid ?? []
  const periode = props.periode ?? '—'

  if (topDirektorat.length === 0) {
    return (
      <section className="context-panel__section">
        <p className="context-panel__empty">Memuat data scorecard…</p>
      </section>
    )
  }

  // topDirektorat is already ranked by nilai descending
  const top = topDirektorat[0]
  const bottom = topDirektorat[topDirektorat.length - 1]
  const belowTarget = direktoratGrid.filter((d) => d.nilai < 100)

  return (
    <>
      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <Calendar size={13} />
          </span>
          <h3 className="context-panel__section-title">Periode</h3>
        </header>
        <div className="context-panel__section-body">
          <p className="context-panel__period">{periode}</p>
        </div>
      </section>

      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <TrendingUp size={13} />
          </span>
          <h3 className="context-panel__section-title">Outperformer</h3>
        </header>
        <div className="context-panel__section-body">
          <PerformerRow item={top} tone="green" />
        </div>
      </section>

      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <TrendingDown size={13} />
          </span>
          <h3 className="context-panel__section-title">Underperformer</h3>
        </header>
        <div className="context-panel__section-body">
          <PerformerRow item={bottom} tone="red" />
        </div>
      </section>

      {belowTarget.length > 0 ? (
        <section className="context-panel__section context-panel__section--danger">
          <header className="context-panel__section-header">
            <span className="context-panel__section-icon" aria-hidden="true">
              <AlertCircle size={13} />
            </span>
            <h3 className="context-panel__section-title">Di bawah target</h3>
          </header>
          <div className="context-panel__section-body">
            {belowTarget.map((d) => (
              <Link
                key={d.kode}
                href={`/performance/kolegial/${d.kode.toLowerCase()}`}
                className="context-panel__focus-item"
              >
                <span className="context-panel__focus-label">{d.nama}</span>
                <span className="context-panel__focus-meta">{d.nilai.toFixed(2)}%</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

function PerformerRow({ item, tone }: { item: RankItem; tone: 'green' | 'red' }) {
  return (
    <div className={`context-panel__performer context-panel__performer--${tone}`}>
      <div className="context-panel__performer-name">{item.nama}</div>
      {item.sub ? <div className="context-panel__performer-sub">{item.sub}</div> : null}
      <div className="context-panel__performer-value">{item.nilai.toFixed(2)}%</div>
    </div>
  )
}
