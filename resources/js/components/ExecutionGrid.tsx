import { Fragment, useMemo } from 'react'
import type {
  ExecutionGridData,
  ExecutionPhase,
  ExecutionStep,
} from '../types'

type Props = {
  data: ExecutionGridData
  onToggleActualWeek?: (stepId: number, week: string, currentActualWeeks: string[]) => void
  onResetActualWeeks?: (stepId: number) => void
}

const WEEK_COL_WIDTH = 38

// Lebar sticky columns (must match execution-grid.css)
const COL_FASE = 54
const COL_URAIAN = 320
const COL_OUTPUT = 220
const COL_PIC_UNIT = 180
const COL_PIC_PERSON = 180
const COL_STATUS = 56
const STICKY_WIDTH = COL_FASE + COL_URAIAN + COL_OUTPUT + COL_PIC_UNIT + COL_PIC_PERSON + COL_STATUS

function deriveRealCellState(
  step: ExecutionStep,
  week: string,
): 'none' | 'on-time' | 'late' | 'blocked' {
  if (!step.actualWeeks.includes(week)) return 'none'
  if (step.isBlocked) return 'blocked'
  const plannedSorted = [...step.plannedWeeks].sort()
  const lastPlanned = plannedSorted[plannedSorted.length - 1]
  if (lastPlanned && week > lastPlanned) return 'late'
  return 'on-time'
}

export function ExecutionGrid({ data, onToggleActualWeek, onResetActualWeeks }: Props) {
  const { weekRange, monthHeaders, currentWeek, phases, unphasedSteps, workstream } = data

  const gridTemplateColumns = useMemo(
    () =>
      `${COL_FASE}px ${COL_URAIAN}px ${COL_OUTPUT}px ${COL_PIC_UNIT}px ${COL_PIC_PERSON}px ${COL_STATUS}px ` +
      `repeat(${weekRange.weeks.length}, ${WEEK_COL_WIDTH}px)`,
    [weekRange.weeks.length],
  )

  const todayLeft = useMemo(() => {
    const idx = weekRange.weeks.indexOf(currentWeek)
    if (idx < 0) return null
    return STICKY_WIDTH + idx * WEEK_COL_WIDTH + WEEK_COL_WIDTH / 2
  }, [weekRange.weeks, currentWeek])

  const totalSteps = phases.reduce((n, p) => n + p.steps.length, 0) + unphasedSteps.length

  if (totalSteps === 0) {
    return (
      <div className="execution-grid">
        <div className="execution-grid__empty">
          Workstream ini belum memiliki sub-tahap dengan rencana mingguan. Tambah fase & sub-tahap
          untuk mulai tracking Plan/Real.
        </div>
      </div>
    )
  }

  return (
    <div className="execution-grid">
      <div className="execution-grid__scroller">
        <div className="execution-grid__table" style={{ gridTemplateColumns }}>
          {/* ── Header row 1: month spanning ─────────────────── */}
          <div
            className="execution-grid__col-sticky execution-grid__col-sticky--header execution-grid__fase"
            style={{ gridRow: '1 / span 2' }}
          >
            Fase
          </div>
          <div
            className="execution-grid__col-sticky execution-grid__col-sticky--header execution-grid__uraian"
            style={{ gridRow: '1 / span 2' }}
          >
            Uraian Tahapan
          </div>
          <div
            className="execution-grid__col-sticky execution-grid__col-sticky--header execution-grid__output"
            style={{ gridRow: '1 / span 2' }}
          >
            Output
          </div>
          <div
            className="execution-grid__col-sticky execution-grid__col-sticky--header execution-grid__pic-unit"
            style={{ gridRow: '1 / span 2' }}
          >
            PIC (Divisi)
          </div>
          <div
            className="execution-grid__col-sticky execution-grid__col-sticky--header execution-grid__pic-person"
            style={{ gridRow: '1 / span 2' }}
          >
            Person
          </div>
          <div
            className="execution-grid__col-sticky execution-grid__col-sticky--header execution-grid__status-label execution-grid__status-label--real"
            style={{ gridRow: '1 / span 2', background: 'var(--surface-1)', color: 'var(--text-strong)' }}
          >
            Status
          </div>
          {monthHeaders.map((mh) => (
            <div
              key={`${mh.year}-${mh.monthIndex}`}
              className="execution-grid__month"
              style={{ gridColumn: `span ${mh.weeks.length}` }}
            >
              {mh.month} {mh.year !== new Date().getFullYear() ? mh.year : ''}
            </div>
          ))}

          {/* ── Header row 2: week ordinals ──────────────────── */}
          {weekRange.weeks.map((iso) => {
            const ord = Math.ceil(isoWeekToDate(iso).getUTCDate() / 7)
            return (
              <div
                key={iso}
                className={`execution-grid__week ${iso === currentWeek ? 'execution-grid__week--today' : ''}`}
                title={iso}
              >
                W{ord}
              </div>
            )
          })}

          {/* ── Data rows: phases + steps ─────────────────────── */}
          {phases.map((phase) => (
            <PhaseBlock
              key={phase.id}
              phase={phase}
              weeks={weekRange.weeks}
              currentWeek={currentWeek}
              onToggleActualWeek={onToggleActualWeek}
              onResetActualWeeks={onResetActualWeeks}
            />
          ))}

          {unphasedSteps.length > 0 && (
            <>
              <div className="execution-grid__phase-row" style={{ gridColumn: '1 / -1' }}>
                <span className="execution-grid__phase-row__order">—</span>
                <span className="execution-grid__phase-row__name">Lain-lain (tanpa fase)</span>
              </div>
              {unphasedSteps.map((step, idx) => (
                <StepRows
                  key={step.id}
                  step={step}
                  weeks={weekRange.weeks}
                  currentWeek={currentWeek}
                  letterFallback={String.fromCharCode(97 + idx)}
                  onToggleActualWeek={onToggleActualWeek}
                  onResetActualWeeks={onResetActualWeeks}
                />
              ))}
            </>
          )}
        </div>

        {todayLeft !== null && (
          <div
            className="execution-grid__today-line"
            style={{ left: todayLeft }}
            title={`Hari ini — ${currentWeek}`}
          />
        )}
      </div>

      <div className="execution-grid__legend">
        <span className="execution-grid__legend-chip">
          <span className="execution-grid__legend-swatch" style={{ background: 'var(--blue)' }} />
          Plan
        </span>
        <span className="execution-grid__legend-chip">
          <span className="execution-grid__legend-swatch" style={{ background: 'var(--green)' }} />
          Real — on-time
        </span>
        <span className="execution-grid__legend-chip">
          <span className="execution-grid__legend-swatch" style={{ background: 'var(--yellow)' }} />
          Real — terlambat
        </span>
        <span className="execution-grid__legend-chip">
          <span className="execution-grid__legend-swatch" style={{ background: 'var(--red)' }} />
          Real — terblokir
        </span>
        {onToggleActualWeek && (
          <span className="execution-grid__legend-chip" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Klik sel Real untuk input realisasi manual
          </span>
        )}
        <span className="execution-grid__legend-chip" style={{ marginLeft: 'auto' }}>
          Workstream: <b style={{ color: 'var(--text-strong)' }}>{workstream.name}</b>
        </span>
      </div>
    </div>
  )
}

function PhaseBlock({
  phase,
  weeks,
  currentWeek,
  onToggleActualWeek,
  onResetActualWeeks,
}: {
  phase: ExecutionPhase
  weeks: string[]
  currentWeek: string
  onToggleActualWeek?: (stepId: number, week: string, currentActualWeeks: string[]) => void
  onResetActualWeeks?: (stepId: number) => void
}) {
  const unitLabels = phase.picUnits.map((u) => u.shortName ?? u.name).join(', ')
  const personLabels = phase.picPersons.map((p) => p.name).join(', ')
  return (
    <Fragment>
      <div className="execution-grid__phase-row" style={{ gridColumn: '1 / -1' }}>
        <span className="execution-grid__phase-row__order">{phase.order}</span>
        <span className="execution-grid__phase-row__name">{phase.name}</span>
        <span className="execution-grid__phase-row__meta">
          {unitLabels && <>PIC: {unitLabels}</>}
          {unitLabels && personLabels && ' · '}
          {personLabels}
          {phase.startWeek && phase.endWeek && ` · ${phase.startWeek} → ${phase.endWeek}`}
        </span>
      </div>
      {phase.steps.map((step) => (
        <StepRows
          key={step.id}
          step={step}
          weeks={weeks}
          currentWeek={currentWeek}
          onToggleActualWeek={onToggleActualWeek}
          onResetActualWeeks={onResetActualWeeks}
        />
      ))}
    </Fragment>
  )
}

function StepRows({
  step,
  weeks,
  currentWeek,
  letterFallback,
  onToggleActualWeek,
  onResetActualWeeks,
}: {
  step: ExecutionStep
  weeks: string[]
  currentWeek: string
  letterFallback?: string
  onToggleActualWeek?: (stepId: number, week: string, currentActualWeeks: string[]) => void
  onResetActualWeeks?: (stepId: number) => void
}) {
  const unitLabels = step.picUnits.map((u) => u.shortName ?? u.name).join(', ')
  // Person display: pakai picPersons array kalau ada, fallback ke primaryAssignee.
  // Tampilkan sebagai avatar chip (FK inisial + nama) konsisten dengan Struktur tab,
  // bukan plain text. Empty = muted italic placeholder.
  const personEntries = step.picPersons.length > 0
    ? step.picPersons
    : (step.primaryAssignee ? [{ id: step.primaryAssignee.id, name: step.primaryAssignee.name }] : [])
  const personPrimary = personEntries[0]
  const personExtra = Math.max(0, personEntries.length - 1)
  const personInitials = personPrimary
    ? personPrimary.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : ''
  const letter = step.letterIndex ?? letterFallback ?? ''
  const canEdit = !!onToggleActualWeek
  return (
    <Fragment>
      {/* Ren row */}
      <div className="execution-grid__col-sticky execution-grid__fase execution-grid__step-ren">
        {letter}
      </div>
      <div className="execution-grid__col-sticky execution-grid__uraian execution-grid__step-ren">
        {step.title}
      </div>
      <div className="execution-grid__col-sticky execution-grid__output execution-grid__step-ren">
        {step.output ?? '—'}
      </div>
      <div className="execution-grid__col-sticky execution-grid__pic-unit execution-grid__step-ren">
        {unitLabels || '—'}
      </div>
      <div className="execution-grid__col-sticky execution-grid__pic-person execution-grid__step-ren">
        {personPrimary ? (
          <span className="exec-grid-pic" title={personEntries.map(p => p.name).join(', ')}>
            <span className="exec-grid-pic__avatar" aria-hidden="true">{personInitials}</span>
            <span className="exec-grid-pic__name">{personPrimary.name}</span>
            {personExtra > 0 && <span className="exec-grid-pic__extra">+{personExtra}</span>}
          </span>
        ) : (
          <span className="exec-grid-pic exec-grid-pic--empty">Belum ditugaskan</span>
        )}
      </div>
      <div className="execution-grid__col-sticky execution-grid__status-label execution-grid__step-ren">
        Plan
      </div>
      {weeks.map((w) => {
        const isPlanned = step.plannedWeeks.includes(w)
        const isToday = w === currentWeek
        return (
          <div
            key={`ren-${step.id}-${w}`}
            className={`execution-grid__cell execution-grid__step-ren ${isPlanned ? 'execution-grid__cell--ren' : ''} ${isToday && !isPlanned ? 'execution-grid__cell--today' : ''}`}
            title={isPlanned ? `Plan: ${w}` : ''}
          />
        )
      })}

      {/* Real row */}
      <div className="execution-grid__col-sticky execution-grid__fase execution-grid__step-real" />
      <div
        className="execution-grid__col-sticky execution-grid__uraian execution-grid__step-real"
        style={{ color: 'var(--text-muted)', fontSize: 'var(--type-caption)' }}
      >
        {/* Only show status when it conveys real progress info — hide default Backlog/Ready */}
        {!['BACKLOG', 'READY'].includes(step.status) && step.status}
        {step.percentComplete > 0 && step.percentComplete < 100 && ` · ${step.percentComplete}%`}
        {step.isBlocked && ' · 🚧 blocked'}
        {!step.actualDerived && step.actualWeeks.length > 0 && ' · manual'}
      </div>
      <div className="execution-grid__col-sticky execution-grid__output execution-grid__step-real" />
      <div className="execution-grid__col-sticky execution-grid__pic-unit execution-grid__step-real" />
      <div className="execution-grid__col-sticky execution-grid__pic-person execution-grid__step-real" />
      <div
        className="execution-grid__col-sticky execution-grid__status-label execution-grid__status-label--real execution-grid__step-real"
        title={canEdit ? 'Klik sel Real untuk toggle minggu realisasi' : undefined}
      >
        Real
        {onResetActualWeeks && !step.actualDerived && step.actualWeeks.length > 0 && (
          <button
            type="button"
            className="execution-grid__reset-btn"
            title="Reset ke auto-derive dari status"
            onClick={() => onResetActualWeeks(step.id)}
          >
            ↺
          </button>
        )}
      </div>
      {weeks.map((w) => {
        const state = deriveRealCellState(step, w)
        const isToday = w === currentWeek
        const stateClass =
          state === 'on-time' ? 'execution-grid__cell--real-on-time' :
          state === 'late' ? 'execution-grid__cell--real-late' :
          state === 'blocked' ? 'execution-grid__cell--real-blocked' : ''
        return (
          <div
            key={`real-${step.id}-${w}`}
            className={`execution-grid__cell execution-grid__step-real ${stateClass} ${isToday && state === 'none' ? 'execution-grid__cell--today' : ''} ${canEdit ? 'execution-grid__cell--editable' : ''}`}
            title={
              canEdit
                ? state !== 'none'
                  ? `Realisasi: ${w} (${state}) — klik untuk hapus`
                  : `Klik untuk tandai ${w} sebagai realisasi`
                : state !== 'none'
                  ? `Realisasi: ${w} (${state})`
                  : ''
            }
            onClick={canEdit ? () => onToggleActualWeek!(step.id, w, step.actualWeeks) : undefined}
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleActualWeek!(step.id, w, step.actualWeeks) } } : undefined}
          />
        )
      })}
    </Fragment>
  )
}

// ── Week helper (minimal client-side ISO-week → Date) ──────────────────────
function isoWeekToDate(iso: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(iso)
  if (!m) return new Date()
  const year = Number(m[1])
  const week = Number(m[2])
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const mondayWeek1 = new Date(jan4)
  mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day + 1)
  const target = new Date(mondayWeek1)
  target.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7)
  return target
}
