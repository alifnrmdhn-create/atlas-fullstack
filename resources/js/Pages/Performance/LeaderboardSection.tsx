import { Card } from '../../design-system'
import { scoreTone } from './_shared'

export type Performer = {
  rank: number
  nama: string
  jabatan: string
  unit: string
  nilai: number
}

type Props = {
  topPerformers: Record<string, Performer[]>
  onSelect?: (nama: string) => void
  /** Optional periode label di sub-header tiap kartu BOD. */
  periode?: string
}

/**
 * Leaderboard 3-kolom BOD-1/-2/-3 dengan medal styling top-3.
 * Mirror slide 14 PDF DKMR — "Leader Board Capaian KPI Divisi Holding".
 *
 * Reusable: render di IndividuView + Executive Summary.
 */
export function LeaderboardSection({ topPerformers, onSelect, periode }: Props) {
  const groups = Object.entries(topPerformers)
  if (groups.length === 0) return null

  return (
    <div className="perf-leaderboard">
      {groups.map(([bodLabel, performers]) => (
        <Card key={bodLabel} padding="md">
          <div className="perf-card-head">
            <h2 className="perf-card-head__title">{bodLabel}</h2>
            <span className="perf-rank__sub">
              {periode ? `Score ${periode}` : 'Score this month'}
            </span>
          </div>
          <div className="perf-leaderboard__list">
            {performers.map((p) => {
              const tone = scoreTone(p.nilai)
              const handleClick = onSelect ? () => onSelect(p.nama) : undefined
              const Wrapper = handleClick ? 'button' : 'div'
              const wrapperProps = handleClick
                ? { type: 'button' as const, onClick: handleClick }
                : {}
              return (
                <Wrapper
                  key={p.nama}
                  className="perf-rank"
                  {...wrapperProps}
                >
                  <span className="perf-rank__num" data-rank={p.rank}>{p.rank}</span>
                  <div className="perf-rank__info">
                    <div className="perf-rank__name">{p.nama}</div>
                    <div className="perf-rank__sub">{p.jabatan} · {p.unit}</div>
                  </div>
                  <span className="perf-rank__value" data-tone={tone}>
                    {p.nilai.toFixed(2)}
                  </span>
                </Wrapper>
              )
            })}
          </div>
        </Card>
      ))}
    </div>
  )
}
