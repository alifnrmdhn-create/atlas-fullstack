import { CharterRecapCard } from './CharterRecapCard'
import './charter-recap.css'

/**
 * Charter recap — Portfolio sub-view that stacks a condensed Charter card per
 * program. Operates on the SAME filtered+paged set as the List view (filter
 * chips + search + pagination are owned by ProgramsView), so this component is
 * a pure presenter. Each card lazy-loads its own charter payload.
 */

type RosterSeed = {
  id: number
  code: string
  name: string
  progressPercent: number
}

type Props = {
  programs: RosterSeed[]
}

export function CharterRecap({ programs }: Props) {
  return (
    <div className="charter-recap">
      {programs.map(p => (
        <CharterRecapCard key={p.id} seed={p} />
      ))}
    </div>
  )
}
