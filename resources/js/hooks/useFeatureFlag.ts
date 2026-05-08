import { usePage } from '@inertiajs/react'

/**
 * Sprint 4 — Feature flag check di FE.
 *
 * Backend resolve flag per-user via FeatureFlagService dan share via Inertia
 * shared `features` prop. Hook ini tinggal cek bool.
 *
 *   const enabled = useFeatureFlag('clear-the-path')
 */
export function useFeatureFlag(flag: string): boolean {
  const { features } = usePage<{ features?: Record<string, boolean> }>().props
  return Boolean(features?.[flag])
}
