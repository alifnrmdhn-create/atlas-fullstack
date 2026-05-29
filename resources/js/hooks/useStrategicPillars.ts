import { usePage } from '@inertiajs/react'

/**
 * Pilar strategis yang berlaku untuk direktorat user (value => label),
 * di-share via Inertia (`strategicPillars`) dan di-resolve backend dari
 * config('atlas-thresholds.pillar_directorates').
 *
 * Map KOSONG = direktorat user tidak memakai pilar (mis. direktorat selain
 * DIR-KMR) → consumer menyembunyikan dropdown "Pilar Strategis" supaya tidak
 * diisi asal. Single source of truth untuk opsi dropdown — jangan hardcode
 * opsi pilar di komponen.
 *
 *   const pillars = useStrategicPillars()
 *   const showPillarField = Object.keys(pillars).length > 0
 */
export function useStrategicPillars(): Record<string, string> {
  const { strategicPillars } = usePage<{ strategicPillars?: Record<string, string> }>().props
  return strategicPillars ?? {}
}
