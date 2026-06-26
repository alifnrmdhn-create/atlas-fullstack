import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import i18n from '../lib/i18n'
import type { ExecutionGridData, ExecutionWorkstreamSummary } from '../types'
import { useWorkspace } from '../hooks/useWorkspace'
import { ExecutionGrid } from './ExecutionGrid'
import { SectionState, SkeletonStack } from './ui'

type Props = {
  programId: number
  programName?: string
  approvalStatus?: string
}

async function downloadXlsx(programId: number, workstreamId: number, grid: ExecutionGridData) {
  const res = await fetch(`/programs/${programId}/execution-grid.xlsx?workstreamId=${workstreamId}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  })
  if (!res.ok) {
    let msg = i18n.t('Failed to export Excel (HTTP {{status}}).', { status: res.status })
    try {
      const body = await res.json()
      if (body?.error) msg = i18n.t('Export failed: {{error}}', { error: body.error })
    } catch { /* non-JSON body */ }
    alert(msg)
    return
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const prog = grid.program.code.replace(/[^a-zA-Z0-9\-_]/g, '_')
  const ws = grid.workstream.name.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 40)
  const a = document.createElement('a')
  a.href = url
  a.download = `WeeklySchedule_${prog}_${ws}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportGridCSV(grid: ExecutionGridData, programName?: string) {
  const weeks = grid.weekRange.weeks
  // PIC Unit dihapus dari header — selaras dengan Jadwal grid view yang juga
  // tidak lagi menampilkan kolom tersebut (tidak ada di form Struktur).
  const header = [i18n.t('Phase'), i18n.t('Description'), i18n.t('PIC Person'), i18n.t('Type'), i18n.t('Status'), ...weeks]
  const rows: string[][] = [header]

  const encodeCell = (v: string) => `"${v.replace(/"/g, '""')}"`

  const addStep = (phaseLabel: string, step: ExecutionGridData['phases'][number]['steps'][number]) => {
    const persons = step.picPersons.map((p) => p.name).join(' / ') || step.primaryAssignee?.name || ''
    const letter = step.letterIndex ?? ''

    const renRow = [
      phaseLabel, `${letter} ${step.title}`.trim(),
      persons, i18n.t('Plan'), step.status,
      ...weeks.map((w) => step.plannedWeeks.includes(w) ? '■' : ''),
    ]
    const realRow = [
      '', '', '', i18n.t('Real'),
      step.actualDerived ? 'auto' : 'manual',
      ...weeks.map((w) => step.actualWeeks.includes(w) ? '■' : ''),
    ]
    rows.push(renRow, realRow)
  }

  grid.phases.forEach((phase) => {
    const label = `${phase.order}. ${phase.name}`
    phase.steps.forEach((step) => addStep(label, step))
  })
  grid.unphasedSteps.forEach((step) => addStep('—', step))

  const csv = rows.map((row) => row.map(encodeCell).join(',')).join('\r\n')
  const bom = '﻿'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const wsName = grid.workstream.name.replace(/[^a-zA-Z0-9\-_]/g, '_')
  const prog = (programName ?? 'program').replace(/[^a-zA-Z0-9\-_]/g, '_')
  a.download = `ExecutionGrid_${prog}_${wsName}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExecutionTab({ programId, programName, approvalStatus }: Props) {
  const { t } = useTranslation()
  const inPlanning = approvalStatus != null && approvalStatus !== 'ACTIVE' && approvalStatus !== 'COMPLETED'
  // Tab "Schedule/Jadwal" = READ-ONLY (catatan 24 Jun 2026: "info schedule
  // sebaiknya hanya tampilan, otomatis berubah dari update workboard"). Baris
  // "Real" di-derive otomatis dari status/percentComplete task (Workboard) di
  // ExecutionGridController — tidak ada lagi override manual per-minggu.
  const { gridRefreshTick } = useWorkspace()
  const [workstreams, setWorkstreams] = useState<ExecutionWorkstreamSummary[] | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [grid, setGrid] = useState<ExecutionGridData | null>(null)
  const [wsLoading, setWsLoading] = useState(true)
  const [gridLoading, setGridLoading] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const [gridError, setGridError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setWsLoading(true)
    setWsError(null)
    api
      .get<{ data: ExecutionWorkstreamSummary[] }>(`/programs/${programId}/workstreams`)
      .then((res) => {
        if (cancelled) return
        setWorkstreams(res.data)
        setActiveId(res.data[0]?.id ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setWsError(err instanceof Error ? err.message : t('Failed to load workstream.'))
      })
      .finally(() => {
        if (!cancelled) setWsLoading(false)
      })
    return () => { cancelled = true }
  }, [programId])

  useEffect(() => {
    if (activeId == null) return
    let cancelled = false
    setGridLoading(true)
    setGridError(null)
    api
      .get<{ data: ExecutionGridData }>(
        `/programs/${programId}/execution-grid?workstreamId=${activeId}`,
      )
      .then((res) => {
        if (cancelled) return
        setGrid(res.data)
      })
      .catch((err) => {
        if (cancelled) return
        setGridError(err instanceof Error ? err.message : t('Failed to load execution grid.'))
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false)
      })
    return () => { cancelled = true }
  }, [programId, activeId, gridRefreshTick])

  const totalSteps = useMemo(
    () => (workstreams ?? []).reduce((n, w) => n + w.taskCount, 0),
    [workstreams],
  )

  if (wsLoading) {
    return (
      <div style={{ padding: 16 }}>
        <SkeletonStack lines={[100, 88, 72]} />
      </div>
    )
  }

  if (wsError) {
    return <SectionState icon="⚠️" title={t('Failed to load workstream')} text={wsError} />
  }

  if (!workstreams || workstreams.length === 0) {
    return (
      <SectionState
        icon="📋"
        title={t('No workstreams yet')}
        text={t('Program {{program}} has no workstreams to show in the Execution Grid yet.', { program: programName ?? '#' + programId })}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="section-header" style={{ marginBottom: 0 }}>
        <div>
          <h3 className="section-title">{t('Execution Grid — {{program}}', { program: programName ?? `Program #${programId}` })}</h3>
          <p className="section-subtitle">
            {t('Weekly Plan vs Actual (Real) table. The Real row updates automatically from task status in the Workboard.')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {grid && activeId && (
            <>
              <button
                type="button"
                className="view-toggle-btn"
                onClick={() => void downloadXlsx(programId, activeId, grid)}
                title={t('Download as Excel (XLSX) — preserves table layout')}
              >
                {t('↓ XLSX')}
              </button>
              <button
                type="button"
                className="view-toggle-btn"
                onClick={() => exportGridCSV(grid, programName)}
                title={t('Download as CSV')}
              >
                {t('↓ CSV')}
              </button>
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('{{count}} workstream', { count: workstreams.length })}
            {' · '}
            {t('{{count}} steps', { count: totalSteps })}
          </span>
        </div>
      </div>

      <div className="workstream-pills">
        {workstreams.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`workstream-pill${activeId === w.id ? ' workstream-pill--active' : ''}`}
            onClick={() => setActiveId(w.id)}
            title={w.code}
          >
            {w.name}
            <span className="workstream-pill__count">
              {t('{{phases}} phases · {{tasks}} tasks', { phases: w.phaseCount, tasks: w.taskCount })}
            </span>
          </button>
        ))}
      </div>

      {gridLoading && (
        <div style={{ padding: 16 }}>
          <SkeletonStack lines={[100, 95, 88, 72]} />
        </div>
      )}

      {gridError && !gridLoading && (
        <SectionState title={t('Failed to load grid')} text={gridError} />
      )}

      {!gridLoading && !gridError && grid && (
        <>
          {inPlanning && (
            <div className="exec-planning-notice">
              <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12" aria-hidden="true"><circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9v.5"/></svg>
              {t('The ')}<strong>{t('Real')}</strong>{t(' row fills in automatically from task progress once the program enters the Execution phase. For now, only the ')}<strong>{t('Plan')}</strong>{t(' can be set up.')}
            </div>
          )}
          <ExecutionGrid data={grid} />
        </>
      )}
    </div>
  )
}
