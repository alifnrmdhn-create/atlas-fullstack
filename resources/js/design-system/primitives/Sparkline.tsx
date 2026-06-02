import { useId } from 'react'
import './Sparkline.css'

type Tone = 'green' | 'amber' | 'red' | 'neutral'

const TONE_VAR: Record<Tone, string> = {
  green: 'var(--tone-green)',
  amber: 'var(--tone-amber)',
  red: 'var(--tone-red)',
  neutral: 'var(--ds-text-tertiary)',
}

export interface SparklineProps {
  /** Series values, oldest → newest. Renders nothing for <2 points. */
  values: number[]
  tone?: Tone
  width?: number
  height?: number
  /** Soft area fill under the line (Tufte). */
  areaFill?: boolean
  /** Highlight the most recent point with a dot (Tufte). */
  lastDot?: boolean
  /** Smooth the line with a Catmull-Rom curve (flowing, not angular). */
  smooth?: boolean
  className?: string
}

/* Catmull-Rom → cubic bezier smoothing for an organic, non-stiff line. */
function smoothLine(coords: ReadonlyArray<readonly [number, number]>): string {
  if (coords.length < 2) return ''
  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

/**
 * Sparkline — a word-sized trend line (Tufte). Fixed-size and crisp (no
 * non-uniform stretch, so the last-point dot stays round). No entrance
 * animation — a dashboard should be readable the instant it paints.
 */
export function Sparkline({
  values,
  tone = 'neutral',
  width = 168,
  height = 40,
  areaFill = true,
  lastDot = true,
  smooth = false,
  className,
}: SparklineProps) {
  const gradId = useId().replace(/:/g, '')
  if (values.length < 2) return null

  const color = TONE_VAR[tone]
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const padY = 4

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * (height - padY * 2) - padY
    return [x, y] as const
  })
  const lineD = smooth ? smoothLine(coords) : `M ${coords.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`
  const areaD = `${lineD} L ${width.toFixed(1)} ${height.toFixed(1)} L 0 ${height.toFixed(1)} Z`
  const [lastX, lastY] = coords[coords.length - 1]

  return (
    <svg
      className={['ds-sparkline', className].filter(Boolean).join(' ')}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ color }}
      aria-hidden
    >
      {areaFill && (
        <>
          <defs>
            <linearGradient id={`spk-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#spk-${gradId})`} stroke="none" />
        </>
      )}
      <path
        d={lineD}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastDot && <circle cx={lastX} cy={lastY} r={2.4} fill="currentColor" />}
    </svg>
  )
}
