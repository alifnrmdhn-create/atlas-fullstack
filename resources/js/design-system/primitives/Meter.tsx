import './Meter.css'

type Tone = 'green' | 'amber' | 'red' | 'neutral'

export interface MeterProps {
  value: number
  /** Full-scale denominator. Default 100. For KPI-vs-target, pass a headroom
   *  scale (e.g. 120) so values ≥ target don't peg the bar. */
  max?: number
  /** Optional target marker (e.g. 100) — turns the bar into a bullet graph. */
  target?: number
  tone?: Tone
  height?: number
  className?: string
  'aria-label'?: string
}

/**
 * Meter — one horizontal bar for two jobs:
 *  - with `target` → a bullet graph (actual vs target), Few's KPI primitive
 *  - without       → a plain proportional status bar (e.g. program breakdown)
 * Encodes by length (accurately perceived), never by gauge angle.
 */
export function Meter({
  value,
  max = 100,
  target,
  tone = 'neutral',
  height = 8,
  className,
  'aria-label': ariaLabel,
}: MeterProps) {
  const pct = (v: number) => `${Math.min(Math.max((v / max) * 100, 0), 100)}%`
  return (
    <div
      className={['ds-meter', className].filter(Boolean).join(' ')}
      style={{ height }}
      role="img"
      aria-label={ariaLabel ?? `${value} dari ${max}`}
    >
      <span className="ds-meter__track" />
      <span className={`ds-meter__fill ds-meter__fill--${tone}`} style={{ width: pct(value) }} />
      {target != null && <span className="ds-meter__target" style={{ left: pct(target) }} />}
    </div>
  )
}
