import { useId } from 'react'
import type { ReactNode } from 'react'
import './Gauge.css'

type Tone = 'green' | 'amber' | 'red' | 'neutral'

const RICH_GRAD: Record<Tone, [string, string]> = {
  green:   ['#34D399', '#059669'],
  amber:   ['#FBBF24', '#D97706'],
  red:     ['#FB7185', '#DC2626'],
  neutral: ['#CBD5E1', '#94A3B8'],
}
const RICH_GLOW: Record<Tone, string> = {
  green:   'rgba(16,185,129,0.55)',
  amber:   'rgba(245,158,11,0.55)',
  red:     'rgba(248,113,113,0.55)',
  neutral: 'rgba(148,163,184,0.35)',
}
const SOLID: Record<Tone, string> = {
  green: 'var(--tone-green)', amber: 'var(--tone-amber)',
  red: 'var(--tone-red)', neutral: 'var(--ds-border-strong)',
}

export interface GaugeProps {
  value: number
  /** Full-scale denominator (default 100). For achievement KPIs use e.g. 120. */
  max?: number
  /** Optional reference marker (e.g. target 100) drawn as a tick on the arc. */
  target?: number
  tone?: Tone
  size?: number
  thickness?: number
  /** Center readout — defaults to the rounded value. */
  valueText?: ReactNode
  unit?: ReactNode
  label?: ReactNode
  /** Vivid gradient + glow (default true). */
  rich?: boolean
  className?: string
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

/**
 * Gauge — a 270° speedometer arc (gap at the bottom). Reads min at lower-left,
 * sweeps clockwise over the top to max at lower-right. With `rich` the value
 * arc uses a vivid gradient + tone-colored glow; an optional target tick marks
 * a reference value. The classic single-metric executive readout.
 */
export function Gauge({
  value, max = 100, target, tone = 'green', size = 180, thickness = 16,
  valueText, unit, label, rich = true, className,
}: GaugeProps) {
  const gid = useId().replace(/:/g, '')
  const r = (size - thickness) / 2 - 2
  const c = size / 2
  const C = 2 * Math.PI * r
  const ARC = 0.75 // 270°
  const trackLen = ARC * C
  const valLen = clamp01(value / max) * trackLen

  // Target tick — local angle (clockwise from 3 o'clock) = tFrac · 270°.
  let tick: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (target != null) {
    const a = clamp01(target / max) * ARC * 2 * Math.PI
    const inner = r - thickness / 2 - 1
    const outer = r + thickness / 2 + 2
    tick = {
      x1: c + inner * Math.cos(a), y1: c + inner * Math.sin(a),
      x2: c + outer * Math.cos(a), y2: c + outer * Math.sin(a),
    }
  }

  return (
    <div className={['ds-gauge', className].filter(Boolean).join(' ')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ds-gauge__svg" aria-hidden>
        {rich && (
          <defs>
            <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={RICH_GRAD[tone][0]} />
              <stop offset="100%" stopColor={RICH_GRAD[tone][1]} />
            </linearGradient>
          </defs>
        )}
        {/* track */}
        <circle
          cx={c} cy={c} r={r} fill="none"
          stroke="var(--ds-surface-sunken)" strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${trackLen} ${C}`}
        />
        {/* value arc */}
        <circle
          cx={c} cy={c} r={r} fill="none"
          stroke={rich ? `url(#${gid}-g)` : SOLID[tone]} strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${valLen} ${C}`}
          className="ds-gauge__arc"
          style={{ filter: rich ? `drop-shadow(0 0 6px ${RICH_GLOW[tone]})` : undefined }}
        />
        {/* target tick */}
        {tick && (
          <line
            x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
            stroke="var(--ds-text-primary)" strokeWidth={2.5} strokeLinecap="round"
            className="ds-gauge__tick"
          />
        )}
      </svg>
      <div className="ds-gauge__center">
        <div className="ds-gauge__value">
          {valueText ?? Math.round(value)}
          {unit && <span className="ds-gauge__unit">{unit}</span>}
        </div>
        {label && <div className="ds-gauge__label">{label}</div>}
      </div>
    </div>
  )
}
