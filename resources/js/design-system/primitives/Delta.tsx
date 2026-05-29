import './Delta.css'

export interface DeltaProps {
  /** Signed change. Positive → green ▲, negative → red ▼. */
  value: number | null | undefined
  suffix?: string
  /** Render 0 / null as a neutral dash instead of an arrow. Default true. */
  hideZero?: boolean
  className?: string
}

/**
 * Delta — a signed change indicator (▲/▼ + magnitude), tabular-aligned.
 * Pairs with a Stat to answer "how much did it move?" at a glance.
 */
export function Delta({ value, suffix = '', hideZero = true, className }: DeltaProps) {
  const v = value ?? NaN
  // Treat anything that rounds to 0.0 as flat — avoids a meaningless "▲ 0.0".
  if (Number.isNaN(v) || (hideZero && Math.abs(v) < 0.05)) {
    return <span className={['ds-delta ds-delta--flat', className].filter(Boolean).join(' ')}>—</span>
  }
  const up = v > 0
  const mag = Math.abs(v)
  const text = `${up ? '▲' : '▼'} ${mag < 10 ? mag.toFixed(1) : Math.round(mag)}${suffix}`
  return (
    <span className={['ds-delta', up ? 'ds-delta--up' : 'ds-delta--down', className].filter(Boolean).join(' ')}>
      {text}
    </span>
  )
}
