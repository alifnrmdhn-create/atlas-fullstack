/**
 * Shared tone mapping — the single source of truth for status → color across
 * the app. Mirrors `Performance/_shared.ts:scoreTone` (kept separate to avoid a
 * cross-page import); consolidate if/when convenient.
 *
 * Tone vocabulary matches the design-system primitives (`green|amber|red|neutral`).
 */

export type Tone = 'green' | 'amber' | 'red' | 'neutral'

/** Scorecard threshold: ≥100 green (on/above target), 80–99 amber, <80 red. */
export function scoreTone(value: number): Exclude<Tone, 'neutral'> {
  if (value >= 100) return 'green'
  if (value >= 80) return 'amber'
  return 'red'
}

/** ProgramHealthToneKey (on_track | at_risk | terlambat | overdue | selesai) → visual tone. */
export function healthTone(key: string): Tone {
  switch (key) {
    case 'on_track':
      return 'green'
    case 'at_risk':
      return 'amber'
    case 'terlambat':
    case 'overdue':
      return 'red'
    default:
      return 'neutral'
  }
}
