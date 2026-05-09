import type { ReactNode } from 'react'
import './Pill.css'

type Tone = 'neutral' | 'brand' | 'red' | 'amber' | 'green'
type Variant = 'soft' | 'outline' | 'mono'

export interface PillProps {
  tone?: Tone
  variant?: Variant
  dot?: boolean
  children: ReactNode
  className?: string
}

/**
 * Pill — single primitive replacing the 6+ tag/badge styles in legacy UI.
 *
 * Use cases:
 *   - tone="neutral" variant="mono"   → kode jabatan (DKSA-PSG-001), id token
 *   - tone="red" variant="outline" + dot → status "Terlambat"
 *   - tone="amber" variant="outline" + dot → status "At Risk"
 *   - tone="green" variant="soft"     → status "Selesai", "Disetujui"
 *   - tone="brand" variant="soft"     → counter chip ("12 channels")
 */
export function Pill({ tone = 'neutral', variant = 'soft', dot = false, children, className }: PillProps) {
  const cls = ['ds-pill', `ds-pill--${variant}`, `ds-pill--${tone}`, className].filter(Boolean).join(' ')
  return (
    <span className={cls}>
      {dot ? <span className="ds-pill__dot" aria-hidden /> : null}
      <span className="ds-pill__label">{children}</span>
    </span>
  )
}
