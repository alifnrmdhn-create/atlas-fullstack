import type { ReactNode } from 'react'
import './Donut.css'

type Tone = 'green' | 'amber' | 'red' | 'neutral'

const TONE: Record<Tone, string> = {
  green: 'var(--ds-green-600)',
  amber: 'var(--ds-amber-600)',
  red: 'var(--ds-red-600)',
  neutral: 'var(--ds-border-strong)',
}

export interface DonutSegment {
  value: number
  tone?: Tone
  label?: string
}

export interface DonutProps {
  /** One segment → completion ring (pass `max`); many → composition donut. */
  segments: DonutSegment[]
  /** Full-scale denominator. Omit for composition (segments sum = full ring). */
  max?: number
  size?: number
  thickness?: number
  centerValue?: ReactNode
  centerLabel?: ReactNode
  className?: string
}

/**
 * Donut — a ring for completion (one value vs a max) or composition (RAG-toned
 * slices). Center holds a headline number. SVG, no dependency, no animation.
 */
export function Donut({
  segments, max, size = 120, thickness = 14, centerValue, centerLabel, className,
}: DonutProps) {
  const r = (size - thickness) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const sum = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  const total = (max && max > 0) ? max : (sum || 1)

  let offset = 0
  const arcs = segments.map((seg, i) => {
    const len = (Math.max(0, seg.value) / total) * circ
    const node = (
      <circle
        key={i}
        cx={c} cy={c} r={r}
        fill="none"
        stroke={TONE[seg.tone ?? 'neutral']}
        strokeWidth={thickness}
        strokeDasharray={`${len} ${circ - len}`}
        strokeDashoffset={-offset}
      />
    )
    offset += len
    return node
  })

  return (
    <div className={['ds-donut', className].filter(Boolean).join(' ')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ds-donut__svg" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ds-surface-sunken)" strokeWidth={thickness} />
        {arcs}
      </svg>
      {(centerValue != null || centerLabel != null) && (
        <div className="ds-donut__center">
          {centerValue != null && <div className="ds-donut__value">{centerValue}</div>}
          {centerLabel != null && <div className="ds-donut__label">{centerLabel}</div>}
        </div>
      )}
    </div>
  )
}
