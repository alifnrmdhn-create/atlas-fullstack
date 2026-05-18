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
  return `${b.kpi}: realisasi ${b.realisasi}${unit} (target ${b.sasaran}${unit}, ${pctLabel(b.ratio)})`
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
        <h3 className="perf-insight__title">Insight Utama</h3>
        <span className="perf-insight__sub">Auto-derived dari capaian KPI · ±5% toleransi</span>
      </div>
      <div className="perf-insight__cols">
        <div className="perf-insight__col" data-tone="green">
          <div className="perf-insight__col-head">
            <span className="perf-insight__col-icon" aria-hidden>✓</span>
            <span className="perf-insight__col-title">Capaian Positif</span>
            <span className="perf-insight__col-count">{positif.length}</span>
          </div>
          {positif.length === 0 ? (
            <p className="perf-insight__empty">Belum ada KPI yang melampaui target ≥+5%.</p>
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
            <span className="perf-insight__col-title">Perlu Perhatian</span>
            <span className="perf-insight__col-count">{perhatian.length}</span>
          </div>
          {perhatian.length === 0 ? (
            <p className="perf-insight__empty">Semua KPI dalam toleransi ±5% target.</p>
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
