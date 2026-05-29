import { useId } from 'react'
import './Sparkline.css'

type Tone = 'green' | 'amber' | 'red' | 'neutral'

const TONE_VAR: Record<Tone, string> = {
  green: 'var(--ds-green-600)',
  amber: 'var(--ds-amber-600)',
  red: 'var(--ds-red-600)',
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
  className?: string
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
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} ${width.toFixed(1)},${height.toFixed(1)} 0,${height.toFixed(1)}`
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
          <polygon points={area} fill={`url(#spk-${gradId})`} stroke="none" />
        </>
      )}
      <polyline
        points={line}
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
