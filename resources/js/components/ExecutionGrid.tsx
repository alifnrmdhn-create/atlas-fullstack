import { Fragment, useMemo, useRef, useEffect, useState } from 'react'
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

// Lebar info pane (sticky-equivalent). Total = 630px.
// Output + PIC (Divisi) dihapus 19 Mei 2026 — tidak ada di form input Struktur,
// selalu render "—", dan ketika masih ada bikin sticky-overlap saat scroll.
const COL_FASE = 54
const COL_URAIAN = 320
const COL_PIC_PERSON = 200
const COL_STATUS = 56
const INFO_PANE_WIDTH = COL_FASE + COL_URAIAN + COL_PIC_PERSON + COL_STATUS

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

// Aggregate steps' planned/actual weeks for rollup row.
// % achievement = actual-so-far / planned-so-far (capped at currentWeek).
// Memberi mental model "dari yang seharusnya selesai sampai sekarang,
// berapa yang terealisasi" — bukan "total dari seluruh plan termasuk masa depan".
function aggregateSteps(steps: ExecutionStep[], currentWeek: string) {
  let plannedTotal = 0
  let actualTotal = 0
  let plannedSoFar = 0
  let actualSoFar = 0
  for (const s of steps) {
    plannedTotal += s.plannedWeeks.length
    actualTotal += s.actualWeeks.length
    plannedSoFar += s.plannedWeeks.filter((w) => w <= currentWeek).length
    actualSoFar += s.actualWeeks.filter((w) => w <= currentWeek).length
  }
  const achievement = plannedSoFar > 0
    ? Math.round((actualSoFar / plannedSoFar) * 100)
    : null
  return { plannedTotal, actualTotal, plannedSoFar, actualSoFar, achievement }
}

/**
 * Sticky-column tabel pakai split-frame layout (a la Notion/Airtable):
 * info pane di kiri (tidak scroll horizontal) + weeks pane di kanan
 * (scroll horizontal). Vertical scroll di-share via root scroller.
 *
 * Sebelumnya pakai single grid + `position: sticky; left: NNNpx` per sel
 * info — but sticky offsets pinning cells ke posisi viewport tertentu
 * sering overlap dengan week cells saat grid-template-columns auto-sized.
 * Split-frame menghilangkan seluruh kelas bug ini.
 */
export function ExecutionGrid({ data, onToggleActualWeek, onResetActualWeeks }: Props) {
  const { weekRange, monthHeaders, currentWeek, phases, unphasedSteps, workstream } = data

  const weeksGridTemplateColumns = useMemo(
    () => `repeat(${weekRange.weeks.length}, ${WEEK_COL_WIDTH}px)`,
    [weekRange.weeks.length],
  )

  const todayLeftInWeeks = useMemo(() => {
    const idx = weekRange.weeks.indexOf(currentWeek)
    if (idx < 0) return null
    return idx * WEEK_COL_WIDTH + WEEK_COL_WIDTH / 2
  }, [weekRange.weeks, currentWeek])

  const totalSteps = phases.reduce((n, p) => n + p.steps.length, 0) + unphasedSteps.length

  // Sinkronisasi vertical scroll antara info pane (overflow hidden) dengan
  // weeks pane (overflow auto): mouse wheel di info → forward ke weeks scroller.
  const weeksScrollerRef = useRef<HTMLDivElement | null>(null)
  const infoPaneRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const info = infoPaneRef.current
    if (!info) return
    const handler = (e: WheelEvent) => {
      const ws = weeksScrollerRef.current
      if (!ws) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        ws.scrollTop += e.deltaY
        // Don't preventDefault — let page scroll continue kalau weeks pane
        // sudah di edge.
      }
    }
    info.addEventListener('wheel', handler, { passive: true })
    return () => info.removeEventListener('wheel', handler)
  }, [])

  // Highlight scroll shadow di edge info pane saat weeks pane discroll horizontal.
  const [weeksScrolled, setWeeksScrolled] = useState(false)
  useEffect(() => {
    const ws = weeksScrollerRef.current
    if (!ws) return
    const onScroll = () => setWeeksScrolled(ws.scrollLeft > 0)
    ws.addEventListener('scroll', onScroll, { passive: true })
    return () => ws.removeEventListener('scroll', onScroll)
  }, [])

  if (totalSteps === 0) {
    return (
      <div className="execution-grid">
        <div className="execution-grid__empty">
          Workstream ini belum memiliki sub-tahap dengan rencana mingguan. Tambah fase &amp; sub-tahap
          untuk mulai tracking Plan/Real.
        </div>
      </div>
    )
  }

  // Build flat list of rows in render order — supaya info pane dan weeks pane
  // bisa render rows dengan height yang sinkron. Setiap step menghasilkan
  // dua row (Plan + Real); phase row 1 row; summary row aggregate.
  type AggSummary = ReturnType<typeof aggregateSteps>
  type RowDef =
    | { kind: 'header-1' }     // month spanning row
    | { kind: 'header-2' }     // week ordinal row
    | { kind: 'phase'; phase: ExecutionPhase }
    | { kind: 'step-plan'; phase?: ExecutionPhase; step: ExecutionStep; letter: string }
    | { kind: 'step-real'; step: ExecutionStep }
    | { kind: 'phase-summary'; phase: ExecutionPhase; agg: AggSummary }
    | { kind: 'workstream-summary'; agg: AggSummary }

  const rows: RowDef[] = [{ kind: 'header-1' }, { kind: 'header-2' }]
  const allSteps: ExecutionStep[] = []
  phases.forEach((phase) => {
    rows.push({ kind: 'phase', phase })
    phase.steps.forEach((step) => {
      const letter = step.letterIndex ?? ''
      rows.push({ kind: 'step-plan', phase, step, letter })
      rows.push({ kind: 'step-real', step })
      allSteps.push(step)
    })
    if (phase.steps.length > 0) {
      rows.push({ kind: 'phase-summary', phase, agg: aggregateSteps(phase.steps, currentWeek) })
    }
  })
  if (unphasedSteps.length > 0) {
    const unphasedPhase: ExecutionPhase = {
      id: -1,
      code: 'UNPHASED',
      order: 0,
      name: 'Lain-lain (tanpa fase)',
      status: 'PENDING',
      picUnits: [],
      picPersons: [],
      steps: unphasedSteps,
      description: null,
      color: null,
      healthStatus: null,
      startWeek: null,
      endWeek: null,
    }
    rows.push({ kind: 'phase', phase: unphasedPhase })
    unphasedSteps.forEach((step, idx) => {
      const letter = step.letterIndex ?? String.fromCharCode(97 + idx)
      rows.push({ kind: 'step-plan', phase: unphasedPhase, step, letter })
      rows.push({ kind: 'step-real', step })
      allSteps.push(step)
    })
    rows.push({ kind: 'phase-summary', phase: unphasedPhase, agg: aggregateSteps(unphasedSteps, currentWeek) })
  }
  // Workstream-level footer summary (semua phase + unphased)
  if (allSteps.length > 0) {
    rows.push({ kind: 'workstream-summary', agg: aggregateSteps(allSteps, currentWeek) })
  }

  // Row class — applied to both info pane row + weeks pane row supaya
  // background/height align.
  const rowClass = (row: RowDef): string => {
    switch (row.kind) {
      case 'header-1': return 'execution-grid__row execution-grid__row--header-month'
      case 'header-2': return 'execution-grid__row execution-grid__row--header-week'
      case 'phase':    return 'execution-grid__row execution-grid__row--phase'
      case 'step-plan': return 'execution-grid__row execution-grid__row--step-plan'
      case 'step-real': return 'execution-grid__row execution-grid__row--step-real'
      case 'phase-summary': return 'execution-grid__row execution-grid__row--phase-summary'
      case 'workstream-summary': return 'execution-grid__row execution-grid__row--workstream-summary'
    }
  }

  const canEdit = !!onToggleActualWeek

  return (
    <div className="execution-grid">
      <div className="execution-grid__layout">
        {/* ── Left pane: info columns (fixed width, no horizontal scroll) ── */}
        <div
          ref={infoPaneRef}
          className={`execution-grid__info-pane${weeksScrolled ? ' execution-grid__info-pane--scrolled' : ''}`}
          style={{ width: INFO_PANE_WIDTH, flex: `0 0 ${INFO_PANE_WIDTH}px` }}
        >
          <div
            className="execution-grid__info-table"
            style={{
              gridTemplateColumns: `${COL_FASE}px ${COL_URAIAN}px ${COL_PIC_PERSON}px ${COL_STATUS}px`,
            }}
          >
            {rows.map((row, idx) => {
              const cls = rowClass(row)
              if (row.kind === 'header-1') {
                // Single row spanning all 4 info cols, rendered for visual
                // continuity dengan month-spanning header di weeks pane.
                return (
                  <Fragment key={`info-${idx}`}>
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header execution-grid__col-fase`}>Fase</div>
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header execution-grid__col-uraian`}>Uraian Tahapan</div>
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header execution-grid__col-person`}>Person</div>
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header execution-grid__col-status`}>Status</div>
                  </Fragment>
                )
              }
              if (row.kind === 'header-2') {
                // Empty row di info pane — visual continuation dari header-1
                // (info pane spans both header rows visually karena bg sama).
                return (
                  <Fragment key={`info-${idx}`}>
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header-empty execution-grid__col-fase`} />
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header-empty execution-grid__col-uraian`} />
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header-empty execution-grid__col-person`} />
                    <div className={`${cls} execution-grid__info-cell execution-grid__info-cell--header-empty execution-grid__col-status`} />
                  </Fragment>
                )
              }
              if (row.kind === 'phase') {
                const { phase } = row
                const unitLabels = phase.picUnits.map((u) => u.shortName ?? u.name).join(', ')
                const personLabels = phase.picPersons.map((p) => p.name).join(', ')
                return (
                  <div
                    key={`info-${idx}`}
                    className={`${cls} execution-grid__info-phase`}
                    style={{ gridColumn: '1 / -1' }}
                  >
                    <span className="execution-grid__phase-row__order">{phase.order}</span>
                    <span className="execution-grid__phase-row__name">{phase.name}</span>
                    {(unitLabels || personLabels || (phase.startWeek && phase.endWeek)) && (
                      <span className="execution-grid__phase-row__meta">
                        {unitLabels && <>PIC: {unitLabels}</>}
                        {unitLabels && personLabels && ' · '}
                        {personLabels}
                        {phase.startWeek && phase.endWeek && ` · ${phase.startWeek} → ${phase.endWeek}`}
                      </span>
                    )}
                  </div>
                )
              }
              if (row.kind === 'step-plan') {
                const { step, letter } = row
                const personEntries = step.picPersons.length > 0
                  ? step.picPersons
                  : (step.primaryAssignee ? [{ id: step.primaryAssignee.id, name: step.primaryAssignee.name }] : [])
                const personPrimary = personEntries[0]
                const personExtra = Math.max(0, personEntries.length - 1)
                const personInitials = personPrimary
                  ? personPrimary.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                  : ''
                return (
                  <Fragment key={`info-${idx}`}>
                    <div className={`${cls} execution-grid__info-cell execution-grid__col-fase execution-grid__fase-num`}>{letter}</div>
                    <div className={`${cls} execution-grid__info-cell execution-grid__col-uraian execution-grid__uraian-title`}>{step.title}</div>
                    <div className={`${cls} execution-grid__info-cell execution-grid__col-person`}>
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
                    <div className={`${cls} execution-grid__info-cell execution-grid__col-status execution-grid__status-pill execution-grid__status-pill--plan`}>Plan</div>
                  </Fragment>
                )
              }
              if (row.kind === 'phase-summary' || row.kind === 'workstream-summary') {
                const { agg } = row
                const isWorkstream = row.kind === 'workstream-summary'
                const label = isWorkstream
                  ? `Total ${workstream?.name ?? 'Workstream'}`
                  : `Subtotal Fase ${row.phase.order}`
                const achievementColor = agg.achievement == null
                  ? undefined
                  : agg.achievement >= 80 ? 'var(--green)'
                  : agg.achievement >= 50 ? 'var(--yellow)'
                  : 'var(--red)'
                return (
                  <div
                    key={`info-${idx}`}
                    className={`${cls} execution-grid__info-summary${isWorkstream ? ' execution-grid__info-summary--workstream' : ''}`}
                    style={{ gridColumn: '1 / -1' }}
                  >
                    <span className="execution-grid__summary-label">{label}</span>
                    <span className="execution-grid__summary-stats">
                      Plan {agg.plannedSoFar}/{agg.plannedTotal} mg
                      <span className="execution-grid__summary-sep">·</span>
                      Real {agg.actualSoFar}/{agg.plannedSoFar} mg
                      {agg.achievement != null && (
                        <>
                          <span className="execution-grid__summary-sep">·</span>
                          <span className="execution-grid__summary-pct" style={{ color: achievementColor }}>
                            {agg.achievement}% pencapaian
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                )
              }
              // step-real
              const { step } = row
              const statusText = (
                <>
                  {!['BACKLOG', 'READY'].includes(step.status) && step.status}
                  {step.percentComplete > 0 && step.percentComplete < 100 && ` · ${step.percentComplete}%`}
                  {step.isBlocked && ' · 🚧 blocked'}
                  {!step.actualDerived && step.actualWeeks.length > 0 && ' · manual'}
                </>
              )
              return (
                <Fragment key={`info-${idx}`}>
                  <div className={`${cls} execution-grid__info-cell execution-grid__col-fase`} />
                  <div className={`${cls} execution-grid__info-cell execution-grid__col-uraian execution-grid__uraian-meta`}>
                    {statusText}
                  </div>
                  <div className={`${cls} execution-grid__info-cell execution-grid__col-person`} />
                  <div className={`${cls} execution-grid__info-cell execution-grid__col-status execution-grid__status-pill execution-grid__status-pill--real`}>
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
                </Fragment>
              )
            })}
          </div>
        </div>

        {/* ── Right pane: scrollable weeks ── */}
        <div ref={weeksScrollerRef} className="execution-grid__weeks-scroller">
          <div
            className="execution-grid__weeks-table"
            style={{ gridTemplateColumns: weeksGridTemplateColumns }}
          >
            {rows.map((row, idx) => {
              const cls = rowClass(row)
              if (row.kind === 'header-1') {
                // Month spanning headers
                return monthHeaders.map((mh, mIdx) => (
                  <div
                    key={`m-${mh.year}-${mh.monthIndex}`}
                    className={`${cls} execution-grid__month`}
                    style={{ gridColumn: mIdx === 0 ? `1 / span ${mh.weeks.length}` : `span ${mh.weeks.length}` }}
                  >
                    {mh.month} {mh.year !== new Date().getFullYear() ? mh.year : ''}
                  </div>
                ))
              }
              if (row.kind === 'header-2') {
                return weekRange.weeks.map((iso) => {
                  const ord = Math.ceil(isoWeekToDate(iso).getUTCDate() / 7)
                  return (
                    <div
                      key={`w-${iso}`}
                      className={`${cls} execution-grid__week ${iso === currentWeek ? 'execution-grid__week--today' : ''}`}
                      title={iso}
                    >
                      W{ord}
                    </div>
                  )
                })
              }
              if (row.kind === 'phase') {
                // Phase row di weeks pane — spans all week cols, kosong/divider.
                return (
                  <div
                    key={`p-${idx}-${row.phase.id}`}
                    className={`${cls} execution-grid__weeks-phase`}
                    style={{ gridColumn: '1 / -1' }}
                  />
                )
              }
              if (row.kind === 'phase-summary' || row.kind === 'workstream-summary') {
                // Summary row di weeks pane — render aggregated bar visualizing
                // plan span vs actual span. Cells: plan-weeks ditandai biru samar,
                // actual-weeks ditimpa hijau samar.
                const steps = row.kind === 'workstream-summary'
                  ? phases.flatMap((p) => p.steps).concat(unphasedSteps)
                  : row.phase.steps
                const plannedSet = new Set<string>()
                const actualSet = new Set<string>()
                steps.forEach((s) => {
                  s.plannedWeeks.forEach((w) => plannedSet.add(w))
                  s.actualWeeks.forEach((w) => actualSet.add(w))
                })
                return weekRange.weeks.map((w) => {
                  const isPlan = plannedSet.has(w)
                  const isActual = actualSet.has(w)
                  return (
                    <div
                      key={`sum-${idx}-${w}`}
                      className={`${cls} execution-grid__cell execution-grid__cell--summary${isPlan ? ' execution-grid__cell--summary-plan' : ''}${isActual ? ' execution-grid__cell--summary-actual' : ''}`}
                    />
                  )
                })
              }
              if (row.kind === 'step-plan') {
                const { step } = row
                return weekRange.weeks.map((w) => {
                  const isPlanned = step.plannedWeeks.includes(w)
                  const isToday = w === currentWeek
                  return (
                    <div
                      key={`plan-${step.id}-${w}`}
                      className={`${cls} execution-grid__cell ${isPlanned ? 'execution-grid__cell--ren' : ''} ${isToday && !isPlanned ? 'execution-grid__cell--today' : ''}`}
                      title={isPlanned ? `Plan: ${w}` : ''}
                    />
                  )
                })
              }
              // step-real
              const { step } = row
              return weekRange.weeks.map((w) => {
                const state = deriveRealCellState(step, w)
                const isToday = w === currentWeek
                const stateClass =
                  state === 'on-time' ? 'execution-grid__cell--real-on-time' :
                  state === 'late' ? 'execution-grid__cell--real-late' :
                  state === 'blocked' ? 'execution-grid__cell--real-blocked' : ''
                return (
                  <div
                    key={`real-${step.id}-${w}`}
                    className={`${cls} execution-grid__cell ${stateClass} ${isToday && state === 'none' ? 'execution-grid__cell--today' : ''} ${canEdit ? 'execution-grid__cell--editable' : ''}`}
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
              })
            })}
          </div>

          {todayLeftInWeeks !== null && (
            <div
              className="execution-grid__today-line"
              style={{ left: todayLeftInWeeks }}
              title={`Hari ini — ${currentWeek}`}
            />
          )}
        </div>
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

function isoWeekToDate(iso: string): Date {
  const [yearStr, weekStr] = iso.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const day = jan4.getUTCDay() || 7
  const monday = new Date(Date.UTC(year, 0, 4 + 1 - day))
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7)
  return monday
}
