import { Link, usePage } from '@inertiajs/react'
import { TrendingUp, TrendingDown, AlertCircle, Calendar } from 'lucide-react'
import { formatPercent, formatPeriod } from '../../Pages/Performance/_shared'

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
        <p className="context-panel__empty">Loading scorecard data…</p>
      </section>
    )
  }

  // Level insight adaptif: dengan 1 direktorat, top === bottom (dulu entitas
  // yang sama tampil hijau sebagai Outperformer DAN merah sebagai
  // Underperformer — paradoks). Solo → pakai level DIVISI yang ceritanya ada.
  const soloDivisi = topDirektorat.length === 1 && direktoratGrid.length === 1
    ? [...direktoratGrid[0].divisi].sort((a, b) => b.nilai - a.nilai)
    : null
  const top: RankItem = soloDivisi
    ? { rank: 1, nama: soloDivisi[0].kode, sub: soloDivisi[0].nama, nilai: soloDivisi[0].nilai }
    : topDirektorat[0]
  const bottomSrc = soloDivisi ? soloDivisi[soloDivisi.length - 1] : null
  const bottom: RankItem | null = soloDivisi
    ? (soloDivisi.length > 1 && bottomSrc
        ? { rank: soloDivisi.length, nama: bottomSrc.kode, sub: bottomSrc.nama, nilai: bottomSrc.nilai }
        : null)
    : (topDirektorat.length > 1 ? topDirektorat[topDirektorat.length - 1] : null)
  const scopeLabel = soloDivisi ? 'division' : 'directorate'
  const belowTarget = soloDivisi
    ? direktoratGrid[0].divisi.filter((d) => d.nilai < 100)
    : direktoratGrid.filter((d) => d.nilai < 100)

  return (
    <>
      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <Calendar size={13} />
          </span>
          <h3 className="context-panel__section-title">Period</h3>
        </header>
        <div className="context-panel__section-body">
          <p className="context-panel__period">{formatPeriod(periode)}</p>
        </div>
      </section>

      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <TrendingUp size={13} />
          </span>
          <h3 className="context-panel__section-title">Top {scopeLabel}</h3>
        </header>
        <div className="context-panel__section-body">
          <PerformerRow item={top} tone="green" />
        </div>
      </section>

      {bottom && (
        <section className="context-panel__section">
          <header className="context-panel__section-header">
            <span className="context-panel__section-icon" aria-hidden="true">
              <TrendingDown size={13} />
            </span>
            <h3 className="context-panel__section-title">Lowest {scopeLabel}</h3>
          </header>
          <div className="context-panel__section-body">
            <PerformerRow item={bottom} tone={bottom.nilai < 100 ? 'red' : 'green'} />
          </div>
        </section>
      )}

      {belowTarget.length > 0 ? (
        <section className="context-panel__section context-panel__section--danger">
          <header className="context-panel__section-header">
            <span className="context-panel__section-icon" aria-hidden="true">
              <AlertCircle size={13} />
            </span>
            <h3 className="context-panel__section-title">Below target</h3>
          </header>
          <div className="context-panel__section-body">
            {belowTarget.map((d) => (
              <Link
                key={d.kode}
                href={soloDivisi
                  ? `/performance/divisi/${d.kode.toLowerCase()}`
                  : `/performance/kolegial/${d.kode.toLowerCase()}`}
                className="context-panel__focus-item"
              >
                <span className="context-panel__focus-label">{d.nama}</span>
                <span className="context-panel__focus-meta">{formatPercent(d.nilai)}</span>
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
      <div className="context-panel__performer-value">{formatPercent(item.nilai)}</div>
    </div>
  )
}
