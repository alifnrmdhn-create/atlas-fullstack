import { Card } from '../../design-system'

export type InsightBullet = {
  kpi: string
  realisasi: string
  sasaran: string
  ratio: number
  satuan: string | null
}

export type InsightPayload = {
  positif: InsightBullet[]
  perhatian: InsightBullet[]
}

type Props = {
  insight: InsightPayload
}

function pctLabel(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`
}

function bulletPhrase(b: InsightBullet): string {
  const unit = b.satuan && b.satuan !== '-' ? ` ${b.satuan}` : ''
  return `${b.kpi}: realization ${b.realisasi}${unit} (target ${b.sasaran}${unit}, ${pctLabel(b.ratio)})`
}

/**
 * Insight Utama — 2-column auto-derived KPI narrative.
 * Mirror panel slide 9-12 PDF DKMR.
 *
 * Selalu render dua kolom (Capaian Positif + Perlu Perhatian). Kolom kosong
 * jatuh ke empty-state copy, supaya struktur stabil dan user paham apa
 * yang sedang di-track.
 */
export function InsightPanel({ insight }: Props) {
  const { positif, perhatian } = insight

  return (
    <Card padding="md" className="perf-insight">
      <div className="perf-insight__head">
        <h3 className="perf-insight__title">Key Insights</h3>
        <span className="perf-insight__sub">Auto-derived from KPI achievement · ±5% tolerance</span>
      </div>
      <div className="perf-insight__cols">
        <div className="perf-insight__col" data-tone="green">
          <div className="perf-insight__col-head">
            <span className="perf-insight__col-icon" aria-hidden>✓</span>
            <span className="perf-insight__col-title">Positive Achievement</span>
            <span className="perf-insight__col-count">{positif.length}</span>
          </div>
          {positif.length === 0 ? (
            <p className="perf-insight__empty">No KPIs have exceeded the target by ≥+5% yet.</p>
          ) : (
            <ul className="perf-insight__list">
              {positif.map((b) => (
                <li key={b.kpi} className="perf-insight__item">
                  {bulletPhrase(b)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="perf-insight__col" data-tone="amber">
          <div className="perf-insight__col-head">
            <span className="perf-insight__col-icon" aria-hidden>!</span>
            <span className="perf-insight__col-title">Needs Attention</span>
            <span className="perf-insight__col-count">{perhatian.length}</span>
          </div>
          {perhatian.length === 0 ? (
            <p className="perf-insight__empty">All KPIs are within ±5% of target.</p>
          ) : (
            <ul className="perf-insight__list">
              {perhatian.map((b) => (
                <li key={b.kpi} className="perf-insight__item">
                  {bulletPhrase(b)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
