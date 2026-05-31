import { useState } from 'react'
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
  /** Makes slices clickable (drill-down). */
  onSliceClick?: (segment: DonutSegment, index: number) => void
}

/**
 * Donut — completion ring or RAG-toned composition. Hovering a slice pops it
 * out, dims the rest, and swaps the center to that slice's value + label — a
 * premium, legible microinteraction without a separate tooltip.
 */
export function Donut({
  segments, max, size = 120, thickness = 14, centerValue, centerLabel, className, onSliceClick,
}: DonutProps) {
  const [hover, setHover] = useState<number | null>(null)
  const r = (size - thickness) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const sum = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  const total = (max && max > 0) ? max : (sum || 1)

  let offset = 0
  const arcs = segments.map((seg, i) => {
    const len = (Math.max(0, seg.value) / total) * circ
    const isHover = hover === i
    const dim = hover != null && !isHover
    const node = (
      <circle
        key={i}
        cx={c} cy={c} r={r}
        fill="none"
        stroke={TONE[seg.tone ?? 'neutral']}
        strokeWidth={isHover ? thickness + 4 : thickness}
        strokeDasharray={`${len} ${circ - len}`}
        strokeDashoffset={-offset}
        opacity={dim ? 0.4 : 1}
        className="ds-donut__arc"
        style={onSliceClick ? { cursor: 'pointer' } : undefined}
        onMouseEnter={() => setHover(i)}
        onMouseLeave={() => setHover(null)}
        onClick={onSliceClick ? () => onSliceClick(seg, i) : undefined}
      />
    )
    offset += len
    return node
  })

  const cv = hover != null ? segments[hover].value : centerValue
  const cl = hover != null ? (segments[hover].label ?? null) : centerLabel

  return (
    <div className={['ds-donut', className].filter(Boolean).join(' ')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ds-donut__svg" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ds-surface-sunken)" strokeWidth={thickness} />
        {arcs}
      </svg>
      {(cv != null || cl != null) && (
        <div className="ds-donut__center">
          {cv != null && <div className="ds-donut__value">{cv}</div>}
          {cl != null && <div className="ds-donut__label">{cl}</div>}
        </div>
      )}
    </div>
  )
}
