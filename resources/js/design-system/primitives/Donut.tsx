import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import './Donut.css'

type Tone = 'green' | 'amber' | 'red' | 'neutral'

const TONE: Record<Tone, string> = {
  green: 'var(--tone-green)',
  amber: 'var(--tone-amber)',
  red: 'var(--tone-red)',
  neutral: 'var(--ds-border-strong)',
}

/* Rich variant — vivid two-stop gradients + glow, reads well on light & dark. */
const RICH_GRAD: Record<Tone, [string, string]> = {
  green:   ['#34D399', '#059669'],
  amber:   ['#FBBF24', '#D97706'],
  red:     ['#FB7185', '#DC2626'],
  neutral: ['#CBD5E1', '#94A3B8'],
}
const RICH_GLOW: Record<Tone, string> = {
  green:   'rgba(16,185,129,0.45)',
  amber:   'rgba(245,158,11,0.45)',
  red:     'rgba(248,113,113,0.50)',
  neutral: 'rgba(148,163,184,0.30)',
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
  /** Premium rendering — gradient strokes, round caps with gaps, soft glow. */
  rich?: boolean
  /** Makes slices clickable (drill-down). */
  onSliceClick?: (segment: DonutSegment, index: number) => void
}

/**
 * Donut — completion ring or RAG-toned composition. Hovering a slice pops it
 * out, dims the rest, and swaps the center to that slice's value + label — a
 * premium, legible microinteraction without a separate tooltip. With `rich`,
 * arcs use vivid gradients, rounded caps with gaps, and a tone-colored glow.
 */
export function Donut({
  segments, max, size = 120, thickness = 14, centerValue, centerLabel, className, rich = false, onSliceClick,
}: DonutProps) {
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId().replace(/:/g, '')
  const r = (size - thickness) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const sum = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  const total = (max && max > 0) ? max : (sum || 1)
  const gap = rich ? thickness * 0.9 : 0 // circumference units between segments

  let offset = 0
  const arcs = segments.map((seg, i) => {
    const tone = seg.tone ?? 'neutral'
    const len = (Math.max(0, seg.value) / total) * circ
    const drawn = len > 0 ? Math.max(len - gap, 1) : 0
    const isHover = hover === i
    const dim = hover != null && !isHover
    const node = drawn > 0 ? (
      <circle
        key={i}
        cx={c} cy={c} r={r}
        fill="none"
        stroke={rich ? `url(#${gid}-${tone})` : TONE[tone]}
        strokeWidth={isHover ? thickness + 4 : thickness}
        strokeLinecap={rich ? 'round' : 'butt'}
        strokeDasharray={`${drawn} ${circ - drawn}`}
        strokeDashoffset={-offset}
        opacity={dim ? 0.4 : 1}
        className="ds-donut__arc"
        style={{
          cursor: onSliceClick ? 'pointer' : undefined,
          filter: rich ? `drop-shadow(0 0 ${isHover ? 7 : 4}px ${RICH_GLOW[tone]})` : undefined,
        }}
        onMouseEnter={() => setHover(i)}
        onMouseLeave={() => setHover(null)}
        onClick={onSliceClick ? () => onSliceClick(seg, i) : undefined}
      />
    ) : null
    offset += len
    return node
  })

  const cv = hover != null ? segments[hover].value : centerValue
  const cl = hover != null ? (segments[hover].label ?? null) : centerLabel

  return (
    <div className={['ds-donut', rich && 'ds-donut--rich', className].filter(Boolean).join(' ')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ds-donut__svg" aria-hidden>
        {rich && (
          <defs>
            {(Object.keys(RICH_GRAD) as Tone[]).map(t => (
              <linearGradient key={t} id={`${gid}-${t}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={RICH_GRAD[t][0]} />
                <stop offset="100%" stopColor={RICH_GRAD[t][1]} />
              </linearGradient>
            ))}
          </defs>
        )}
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ds-surface-sunken)" strokeWidth={rich ? thickness - 2 : thickness} />
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
