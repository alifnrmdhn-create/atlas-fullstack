import type { ReactNode } from 'react'
import './Stat.css'

type Size = 'md' | 'lg' | 'hero'
type Tone = 'neutral' | 'red' | 'amber' | 'green'

export interface StatProps {
  /** The label that sits above or below the value. Always present for context. */
  label: ReactNode
  value: ReactNode
  /** Optional unit suffix (% , hari, etc) shown smaller next to value. */
  unit?: ReactNode
  /** Optional trend or delta caption beneath the value. */
  caption?: ReactNode
  size?: Size
  tone?: Tone
  /** Where the label sits relative to the value. */
  labelPosition?: 'top' | 'bottom'
  className?: string
}

/**
 * Stat — the single primitive for displaying a number with context.
 *
 * Replaces the "kotak KPI" pattern (border + padding + small text) used
 * inconsistently across Home, Reports, Performance. Stat is unboxed by
 * default; if you want a box, wrap it in <Card>.
 *
 * Sizes:
 *   md   → 20px value · for tables, inline metrics
 *   lg   → 28px value · for card headers
 *   hero → 40px value · for page-level hero numbers (one per page)
 */
export function Stat({
  label,
  value,
  unit,
  caption,
  size = 'md',
  tone = 'neutral',
  labelPosition = 'bottom',
  className,
}: StatProps) {
  const cls = ['ds-stat', `ds-stat--${size}`, `ds-stat--${tone}`, className].filter(Boolean).join(' ')
  const labelEl = <div className="ds-stat__label">{label}</div>
  return (
    <div className={cls}>
      {labelPosition === 'top' ? labelEl : null}
      <div className="ds-stat__value-row">
        <span className="ds-stat__value" data-num>
          {value}
        </span>
        {unit ? <span className="ds-stat__unit">{unit}</span> : null}
      </div>
      {labelPosition === 'bottom' ? labelEl : null}
      {caption ? <div className="ds-stat__caption">{caption}</div> : null}
    </div>
  )
}
