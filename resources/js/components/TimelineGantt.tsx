import type { CSSProperties } from 'react'

export type TimelineGanttWorkstream = {
  id: number
  code: string
  name: string
  status: string
  startDate: string | null
  targetCompletion: string
  progressPercent: number
  healthStatus: string
}

export type TimelineGanttProgram = {
  id: number
  code: string
  name: string
  status: string
  priority: string
  progressPercent: number
  healthStatus: string
  riskScore: number
  startDate: string
  targetEndDate: string
  actualEndDate: string | null
  workstreams: TimelineGanttWorkstream[]
}

type GanttBarProps = {
  start: Date
  end: Date
  rangeStart: Date
  rangeEnd: Date
  label: string
  sublabel?: string
  pct: number
  tone: 'green' | 'yellow' | 'red' | 'muted'
  height?: number
  onClick?: () => void
  ariaLabel?: string
}

type TimelineGanttProps = {
  programs: TimelineGanttProgram[]
  emptyText: string
  onOpenProgram: (id: number) => void
}

const healthTone = (status: string): GanttBarProps['tone'] => {
  if (status === 'GREEN') return 'green'
  if (status === 'YELLOW') return 'yellow'
  if (status === 'RED') return 'red'
  return 'muted'
}

const toneColors: Record<GanttBarProps['tone'], { color: string; bg: string }> = {
  green: { color: 'var(--green)', bg: 'var(--green-dim)' },
  yellow: { color: 'var(--yellow)', bg: 'var(--yellow-dim)' },
  red: { color: 'var(--red)', bg: 'var(--red-dim)' },
  muted: { color: 'var(--text-muted)', bg: 'var(--surface-quiet)' },
}

function GanttBar({
  start,
  end,
  rangeStart,
  rangeEnd,
  label,
  sublabel,
  pct,
  tone,
  height = 28,
  onClick,
  ariaLabel,
}: GanttBarProps) {
  const total = rangeEnd.getTime() - rangeStart.getTime()
  const left = Math.max(0, (start.getTime() - rangeStart.getTime()) / total) * 100
  const width = Math.min(
    100 - left,
    Math.max(1, ((end.getTime() - start.getTime()) / total) * 100)
  )
  const toneStyle = toneColors[tone]

  const shellStyle = {
    '--gantt-bar-height': `${height}px`,
    '--gantt-bar-left': `${left}%`,
    '--gantt-bar-width': `${width}%`,
    '--gantt-bar-fill': `${pct}%`,
  } as CSSProperties

  const content = (
    <div
      className="gantt-bar"
      style={{
        background: toneStyle.bg,
        border: `1px solid ${toneStyle.color}`,
        color: toneStyle.color,
      }}
    >
      <div
        className="gantt-bar__fill"
        style={{
          background: toneStyle.color,
        }}
      />
      {width > 6 && (
        <span
          className="gantt-bar__label"
          style={{
            color: toneStyle.color,
          }}
        >
          {label}
          {sublabel ? (
            <span
              className="gantt-bar__sublabel"
              style={{
                color: toneStyle.color,
              }}
            >
              {' · '}
              {sublabel}
            </span>
          ) : null}
        </span>
      )}
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className="gantt-bar-shell gantt-bar-shell--interactive"
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        style={shellStyle}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="gantt-bar-shell gantt-bar-shell--static" style={shellStyle}>
      {content}
    </div>
  )
}

export function TimelineGantt({ programs, emptyText, onOpenProgram }: TimelineGanttProps) {
  if (programs.length === 0) return <p className="text-sm text-muted roadmap-empty">{emptyText}</p>

  const dates = programs.flatMap((program) => [
    new Date(program.startDate),
    new Date(program.targetEndDate),
    ...program.workstreams.map((workstream) => new Date(workstream.targetCompletion)),
  ])
  const rangeStart = new Date(Math.min(...dates.map((date) => date.getTime())))
  const rangeEnd = new Date(Math.max(...dates.map((date) => date.getTime())))
  const pad = (rangeEnd.getTime() - rangeStart.getTime()) * 0.05
  const axisStart = new Date(rangeStart.getTime() - pad)
  const axisEnd = new Date(rangeEnd.getTime() + pad)

  const ticks: Date[] = []
  const tick = new Date(axisStart.getFullYear(), axisStart.getMonth(), 1)
  while (tick <= axisEnd) {
    ticks.push(new Date(tick))
    tick.setMonth(tick.getMonth() + 1)
  }

  const total = axisEnd.getTime() - axisStart.getTime()
  const tickPos = (date: Date) => `${(((date.getTime() - axisStart.getTime()) / total) * 100).toFixed(2)}%`
  const today = new Date()
  const todayPct = ((today.getTime() - axisStart.getTime()) / total) * 100
  const showToday = todayPct > 0 && todayPct < 100
  const todayStyle = { '--gantt-today-left': `${todayPct.toFixed(2)}%` } as CSSProperties
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' })

  return (
    <div className="gantt-wrapper">
      <div className="gantt-axis">
        <div className="gantt-axis__label-col" />
        <div className="gantt-axis__track">
          {ticks.map((date) => (
            <div
              key={date.toISOString()}
              className="gantt-axis__tick"
              style={{ '--gantt-tick-left': tickPos(date) } as CSSProperties}
            >
              {monthLabel.format(date)}
            </div>
          ))}
          {showToday ? <div className="gantt-today" style={todayStyle} title="Today" /> : null}
        </div>
      </div>

      {programs.map((program) => (
        <div key={program.id} className="gantt-group">
          <div className="gantt-row gantt-row--program">
            <div className="gantt-row__label" title={program.name}>
              <span className="code-badge">{program.code}</span>
              <span className="gantt-row__name">{program.name}</span>
            </div>
            <div className="gantt-row__track gantt-row__track--single">
              {showToday ? <div className="gantt-today gantt-today--track" style={todayStyle} /> : null}
              <GanttBar
                start={new Date(program.startDate)}
                end={new Date(program.targetEndDate)}
                rangeStart={axisStart}
                rangeEnd={axisEnd}
                label={`${program.progressPercent}%`}
                pct={program.progressPercent}
                tone={healthTone(program.healthStatus)}
                onClick={() => onOpenProgram(program.id)}
                ariaLabel={`${program.code} ${program.name}, ${program.progressPercent}% progress`}
                height={30}
              />
            </div>
          </div>
          {program.workstreams.length > 0 ? (
            <div className="gantt-subrows">
              {program.workstreams.map((workstream) => (
                <div key={workstream.id} className="gantt-row gantt-row--workstream">
                  <div className="gantt-row__label gantt-row__label--sub" aria-hidden="true" />
                  <div className="gantt-row__track gantt-row__track--single">
                    {showToday ? <div className="gantt-today gantt-today--track" style={todayStyle} /> : null}
                    <GanttBar
                      start={workstream.startDate ? new Date(workstream.startDate) : new Date(program.startDate)}
                      end={new Date(workstream.targetCompletion)}
                      rangeStart={axisStart}
                      rangeEnd={axisEnd}
                      label={`${workstream.progressPercent}%`}
                      sublabel={workstream.name}
                      pct={workstream.progressPercent}
                      tone={healthTone(workstream.healthStatus)}
                      height={22}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
