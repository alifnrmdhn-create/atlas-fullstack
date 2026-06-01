import './Bars.css'

type Tone = 'green' | 'amber' | 'red' | 'neutral'

export interface Bar {
  label: string
  /** null → no data for this category (renders a faint placeholder). */
  value: number | null
  tone?: Tone
  /** Override the printed value (e.g. "103.9"). Defaults to rounded value. */
  valueLabel?: string
}

export interface BarsProps {
  bars: Bar[]
  /** Y-scale max. Default = 1.08 × max(values, target). */
  max?: number
  /** Horizontal reference line (e.g. target 100). */
  target?: number
  /** Plot height in px (bars area only; labels sit outside). Default 120. */
  height?: number
  className?: string
  /** Premium rendering — gradient fills, rounded tops, soft glow. */
  rich?: boolean
  /** When set, each bar becomes a button — enables hover lift + drill-down. */
  onBarClick?: (bar: Bar, index: number) => void
}

/**
 * Bars — a light vertical bar chart (CSS columns). RAG-toned, labelled, with an
 * optional dashed target line. Bars grow in on mount; when `onBarClick` is set
 * they become focusable buttons that lift on hover.
 */
export function Bars({ bars, max, target, height = 120, className, rich = false, onBarClick }: BarsProps) {
  const scaleMax = max ?? Math.max(...bars.map(b => b.value ?? 0), target ?? 0, 1) * 1.08

  return (
    <div className={['ds-bars', rich && 'ds-bars--rich', className].filter(Boolean).join(' ')}>
      <div className="ds-bars__plot" style={{ height }}>
        {target != null && (
          <div className="ds-bars__target" style={{ bottom: `${(target / scaleMax) * 100}%` }}>
            <span className="ds-bars__target-label">{target}</span>
          </div>
        )}
        {bars.map((b, i) => {
          const has = b.value != null
          const h = has ? Math.max((b.value! / scaleMax) * 100, 2) : 0
          const inner = (
            <>
              {has && <span className="ds-bars__val">{b.valueLabel ?? Math.round(b.value!)}</span>}
              <span
                className={`ds-bars__bar ds-bars__bar--${has ? (b.tone ?? 'neutral') : 'empty'}`}
                style={{ height: `${h}%` }}
              />
            </>
          )
          return onBarClick ? (
            <button
              key={i}
              type="button"
              className="ds-bars__col ds-bars__col--btn"
              onClick={() => onBarClick(b, i)}
              aria-label={`${b.label}: ${b.valueLabel ?? b.value ?? '—'}`}
            >
              {inner}
            </button>
          ) : (
            <div key={i} className="ds-bars__col">{inner}</div>
          )
        })}
      </div>
      <div className="ds-bars__labels">
        {bars.map((b, i) => (
          <span key={i} className="ds-bars__label" title={b.label}>{b.label}</span>
        ))}
      </div>
    </div>
  )
}
