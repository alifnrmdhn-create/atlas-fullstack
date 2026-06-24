import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
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
    let msg = `Failed to export Excel (HTTP ${res.status}).`
    try {
      const body = await res.json()
      if (body?.error) msg = `Export failed: ${body.error}`
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
  const header = ['Phase', 'Description', 'PIC Person', 'Type', 'Status', ...weeks]
  const rows: string[][] = [header]

  const encodeCell = (v: string) => `"${v.replace(/"/g, '""')}"`

  const addStep = (phaseLabel: string, step: ExecutionGridData['phases'][number]['steps'][number]) => {
    const persons = step.picPersons.map((p) => p.name).join(' / ') || step.primaryAssignee?.name || ''
    const letter = step.letterIndex ?? ''

    const renRow = [
      phaseLabel, `${letter} ${step.title}`.trim(),
      persons, 'Plan', step.status,
      ...weeks.map((w) => step.plannedWeeks.includes(w) ? '■' : ''),
    ]
    const realRow = [
      '', '', '', 'Real',
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
  const inPlanning = approvalStatus != null && approvalStatus !== 'ACTIVE' && approvalStatus !== 'COMPLETED'
  // Tab "Schedule/Jadwal" = READ-ONLY (catatan 24 Jun 2026: "info schedule
  // sebaiknya hanya tampilan, otomatis berubah dari update workboard"). Baris
  // "Real" di-derive otomatis dari status/percentComplete task (Workboard) di
  // ExecutionGridController — tidak ada lagi override manual per-minggu.
  const { gridRefreshTick, currentUser } = useWorkspace()
  const [workstreams, setWorkstreams] = useState<ExecutionWorkstreamSummary[] | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [grid, setGrid] = useState<ExecutionGridData | null>(null)
  const [wsLoading, setWsLoading] = useState(true)
  const [gridLoading, setGridLoading] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const [gridError, setGridError] = useState<string | null>(null)
  const [myOnly, setMyOnly] = useState(false)

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
        setWsError(err instanceof Error ? err.message : 'Failed to load workstream.')
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
        setGridError(err instanceof Error ? err.message : 'Failed to load execution grid.')
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false)
      })
    return () => { cancelled = true }
  }, [programId, activeId, gridRefreshTick])

  const visibleWorkstreams = useMemo(
    () => (workstreams ?? []).filter((w) => !myOnly || w.ownerId === currentUser?.id),
    [workstreams, myOnly, currentUser?.id],
  )

  const totalSteps = useMemo(
    () => (workstreams ?? []).reduce((n, w) => n + w.taskCount, 0),
    [workstreams],
  )

  // Jika filter "Saya saja" menyembunyikan workstream aktif, reset ke pertama yang visible
  useEffect(() => {
    if (!visibleWorkstreams.find((w) => w.id === activeId)) {
      setActiveId(visibleWorkstreams[0]?.id ?? null)
    }
  }, [visibleWorkstreams])

  if (wsLoading) {
    return (
      <div style={{ padding: 16 }}>
        <SkeletonStack lines={[100, 88, 72]} />
      </div>
    )
  }

  if (wsError) {
    return <SectionState icon="⚠️" title="Failed to load workstream" text={wsError} />
  }

  if (!workstreams || workstreams.length === 0) {
    return (
      <SectionState
        icon="📋"
        title="No workstreams yet"
        text={`Program ${programName ?? '#' + programId} has no workstreams to show in the Execution Grid yet.`}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="section-header" style={{ marginBottom: 0 }}>
        <div>
          <h3 className="section-title">Execution Grid — {programName ?? `Program #${programId}`}</h3>
          <p className="section-subtitle">
            Weekly Plan vs Actual (Real) table. The Real row updates automatically from task status in the Workboard.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className={`view-toggle-btn${myOnly ? ' active' : ''}`}
            onClick={() => setMyOnly((v) => !v)}
            title="Show only workstreams I lead"
          >
            Mine only
          </button>
          {grid && activeId && (
            <>
              <button
                type="button"
                className="view-toggle-btn"
                onClick={() => void downloadXlsx(programId, activeId, grid)}
                title="Download as Excel (XLSX) — preserves table layout"
              >
                ↓ XLSX
              </button>
              <button
                type="button"
                className="view-toggle-btn"
                onClick={() => exportGridCSV(grid, programName)}
                title="Download as CSV"
              >
                ↓ CSV
              </button>
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {visibleWorkstreams.length === workstreams.length
              ? `${workstreams.length} workstream`
              : `${visibleWorkstreams.length} of ${workstreams.length} workstream`}
            {' · '}
            {totalSteps} steps
          </span>
        </div>
      </div>

      {visibleWorkstreams.length === 0 ? (
        <SectionState
          title="No workstreams you lead"
          text="Turn off the 'Mine only' filter to see all workstreams in this program."
          compact
        />
      ) : (
        <div className="workstream-pills">
          {visibleWorkstreams.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`workstream-pill${activeId === w.id ? ' workstream-pill--active' : ''}`}
              onClick={() => setActiveId(w.id)}
              title={w.code}
            >
              {w.name}
              <span className="workstream-pill__count">
                {w.phaseCount} phases · {w.taskCount} tasks
              </span>
            </button>
          ))}
        </div>
      )}

      {gridLoading && (
        <div style={{ padding: 16 }}>
          <SkeletonStack lines={[100, 95, 88, 72]} />
        </div>
      )}

      {gridError && !gridLoading && (
        <SectionState title="Failed to load grid" text={gridError} />
      )}

      {!gridLoading && !gridError && grid && (
        <>
          {inPlanning && (
            <div className="exec-planning-notice">
              <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12" aria-hidden="true"><circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9v.5"/></svg>
              The <strong>Real</strong> row fills in automatically from task progress once the program enters the Execution phase.
              For now, only the <strong>Plan</strong> can be set up.
            </div>
          )}
          <ExecutionGrid data={grid} />
        </>
      )}
    </div>
  )
}
