import { useState, useEffect, useCallback, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import { usePage, router } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { getProgramDisplayStatus } from '../lib/programStatus'
import {
  Avatar,
  HealthPill,
  SectionState,
  SkeletonStack,
} from '../components/ui'
import { TimelineGantt } from '../components/TimelineGantt'
import type { TimelineGanttProgram } from '../components/TimelineGantt'
import { api, extractErrorMessage } from '../lib/api'
import type { CharterPayload } from '../types/charter'
import { formatKpiValue, formatKpiValueParts, getKpiFillPercent } from '../lib/kpi'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import { ExecutionTab } from '../components/ExecutionTab'
import { MonitoringMatrix } from '../components/MonitoringMatrix'
import { useInlineToast } from '../components/InlineToast'
import { UserPicker } from '../components/UserPicker'
import { PageHeader } from '../design-system'
import './ProgramsView.css'

// ── Types ──────────────────────────────────────────────────────────────────

type ProgramTab = 'portfolio' | 'timeline' | 'monitoring' | 'pulse' | 'risiko' | 'archive'
type PortfolioView = 'list' | 'kanban' | 'table'
type TimelineView = 'lanes' | 'gantt'
type LaneGrouping = 'status' | 'priority' | 'health'

type PulseBlocker = {
  id: number; code: string; title: string; severity: string; status: string
  createdAt: string; daysOpen: number; assignedTo: number | null
  task: {
    id: number; code: string; title: string
    workstream: { id: number; name: string; program: { id: number; code: string; name: string } }
  }
}

type PulseWorkstream = {
  id: number; code: string; name: string; status: string
  progressPercent: number; healthStatus: string
  targetCompletion: string; daysRemaining: number
  program: { id: number; code: string; name: string }
  owner: { id: number; name: string } | null
}

type PulseTask = {
  id: number; code: string; title: string; status: string
  percentComplete: number; updatedAt: string; stagnantDays: number
  assignee: { id: number; name: string } | null
  workstream: { id: number; name: string; program: { id: number; code: string; name: string } }
}

type ExecutionPulse = {
  activeBlockers: PulseBlocker[]
  atRiskWorkstreams: PulseWorkstream[]
  stagnantItems: PulseTask[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_ORDER = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
const VALID_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])

const approvalBadge = (prog: { approvalStatus?: string | null; rejectionNote?: string | null }) => {
  // Rejected = DRAFT + rejectionNote populated. The literal 'REJECTED' status
  // never persists (BE reverts to DRAFT) — must check the compound or the
  // badge never renders. Check FIRST so DRAFT case below doesn't shadow it.
  if (prog.approvalStatus === 'DRAFT' && prog.rejectionNote) {
    return { label: 'Ditolak', tone: 'red' as const }
  }
  switch (prog.approvalStatus) {
    case 'DRAFT':
      return { label: 'Draft', tone: 'yellow' as const }
    case 'PENDING_KASUB':
      return { label: 'Pend. Kasub', tone: 'blue' as const }
    case 'PENDING_KADIV':
      return { label: 'Pend. Kadiv', tone: 'blue' as const }
    case 'ACTIVE':
      // "Berjalan" badge konsisten dengan Board/Table tab yang pakai
      // getProgramDisplayStatus helper. Memberi sinyal jelas "ini sudah lewat
      // approval phase" — tanpa ini row ACTIVE tampil identik dengan PENDING
      // (kedua-duanya cuma punya health pill).
      return { label: 'Berjalan', tone: 'green' as const }
    default:
      return null
  }
}

const healthStatusLabel = (status: 'GREEN' | 'YELLOW' | 'RED') => {
  if (status === 'GREEN') return 'On Track'
  if (status === 'YELLOW') return 'At Risk'
  return 'Terlambat'
}

const workstreamSummaryLabel = (count: number | undefined | null) => {
  if (!count || count <= 0) return 'Belum ada workstream'
  return `${count} workstream`
}

// ── Health Donut — SVG donut chart untuk hero stats strip ──────────────
// Pure SVG, no chart library. Segments via stroke-dasharray dengan offset
// kumulatif. Center label menampilkan total program. */
function HealthDonut({ green, yellow, red, total }: {
  green: number; yellow: number; red: number; total: number
}) {
  const SIZE = 92
  const STROKE = 12
  const r = (SIZE - STROKE) / 2
  const c = 2 * Math.PI * r
  const cx = SIZE / 2
  const safeTotal = Math.max(total, 1)
  const greenLen = (green / safeTotal) * c
  const yellowLen = (yellow / safeTotal) * c
  const redLen = (red / safeTotal) * c

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="programs-v2__donut"
      role="img"
      aria-label={`Distribusi health: On Track ${green}, At Risk ${yellow}, Terlambat ${red}`}
    >
      {/* Track ring */}
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke="var(--ds-surface-sunken)" strokeWidth={STROKE} />
      {/* Segments — rotate -90deg agar mulai dari atas (12 o'clock) */}
      <g transform={`rotate(-90 ${cx} ${cx})`} strokeLinecap="butt">
        {green > 0 && (
          <circle cx={cx} cy={cx} r={r} fill="none"
            stroke="var(--ds-green-500)" strokeWidth={STROKE}
            strokeDasharray={`${greenLen} ${c}`}
            strokeDashoffset={0}
          />
        )}
        {yellow > 0 && (
          <circle cx={cx} cy={cx} r={r} fill="none"
            stroke="var(--ds-amber-500)" strokeWidth={STROKE}
            strokeDasharray={`${yellowLen} ${c}`}
            strokeDashoffset={-greenLen}
          />
        )}
        {red > 0 && (
          <circle cx={cx} cy={cx} r={r} fill="none"
            stroke="var(--ds-red-500)" strokeWidth={STROKE}
            strokeDasharray={`${redLen} ${c}`}
            strokeDashoffset={-(greenLen + yellowLen)}
          />
        )}
      </g>
      {/* Center label */}
      <text x={cx} y={cx - 2} textAnchor="middle" dominantBaseline="middle"
        className="programs-v2__donut-num">{total}</text>
      <text x={cx} y={cx + 14} textAnchor="middle" dominantBaseline="middle"
        className="programs-v2__donut-label">program</text>
    </svg>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

export function ProgramsView() {
  const {
    programs, kpis, dashboard, selectedProgramId,
    loadOverview,
    normalizeHealthStatus, formatStatusLabel,
    currentUser, apmsKpis,
  } = useWorkspace()

  const navigate = useInertiaNavigate()
  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const roleAccess = useRoleAccess()
  const isStrategic = role === 'BOD' || role === 'KADIV'
  const toast = useInlineToast()

  // Pop stashed approval-success toast — di-set oleh ProgramDetailView saat
  // KADIV final-approve sebelum redirect. Lihat submitApprove() di detail.
  // Pakai sessionStorage karena toast state inline tidak survive navigasi page.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = sessionStorage.getItem('atlas:program-approved')
    if (!raw) return
    sessionStorage.removeItem('atlas:program-approved')
    try {
      const payload = JSON.parse(raw) as { id: number; name: string; at: number }
      // Stale guard: kalau set-nya >30 detik lalu, user mungkin navigated
      // lewat jalan lain — skip supaya tidak muncul toast nyasar.
      if (Date.now() - payload.at > 30_000) return
      toast.show(`Program "${payload.name}" disetujui · PIC sudah diberi tahu`, 'success')
    } catch { /* malformed payload — silent skip */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Tab state ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<ProgramTab>('portfolio')
  const [portfolioView, setPortfolioView] = useState<PortfolioView>('list')
  const [timelineView, setTimelineView] = useState<TimelineView>('lanes')
  const [laneGrouping, setLaneGrouping] = useState<LaneGrouping>(isStrategic ? 'health' : 'status')
  const [laneSearch, setLaneSearch] = useState('')
  const [portfolioSearch, setPortfolioSearch] = useState('')
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'needs_action'>('all')

  // ── URL-driven filters from Context Panel (M6.1) ───────────────────────────
  // Status values in the URL stay human-readable (on_track | at_risk | terlambat)
  // for shareable links; we map to the internal GREEN/YELLOW/RED here.
  const { url } = usePage()
  const urlStatusFilter = useMemo<Set<'GREEN' | 'YELLOW' | 'RED'>>(() => {
    const qs = url.split('?')[1] ?? ''
    const raw = new URLSearchParams(qs).get('status') ?? ''
    const map: Record<string, 'GREEN' | 'YELLOW' | 'RED'> = {
      on_track: 'GREEN',
      at_risk: 'YELLOW',
      terlambat: 'RED',
    }
    const out = new Set<'GREEN' | 'YELLOW' | 'RED'>()
    for (const v of raw.split(',').filter(Boolean)) {
      const mapped = map[v]
      if (mapped) out.add(mapped)
    }
    return out
  }, [url])

  const urlStaleOnly = useMemo<boolean>(() => {
    const qs = url.split('?')[1] ?? ''
    return new URLSearchParams(qs).get('stale') === '1'
  }, [url])

  const toggleStatusFilter = useCallback((tone: 'GREEN' | 'YELLOW' | 'RED') => {
    const map = { GREEN: 'on_track', YELLOW: 'at_risk', RED: 'terlambat' } as const
    const qs = url.split('?')[1] ?? ''
    const params = new URLSearchParams(qs)
    const cur = new Set((params.get('status') ?? '').split(',').filter(Boolean))
    const v = map[tone]
    if (cur.has(v)) cur.delete(v)
    else cur.add(v)
    if (cur.size > 0) params.set('status', Array.from(cur).join(','))
    else params.delete('status')
    const target = `/programs${params.toString() ? '?' + params.toString() : ''}`
    router.visit(target, { preserveState: true, preserveScroll: true, replace: true })
  }, [url])

  const toggleStaleFilter = useCallback(() => {
    const qs = url.split('?')[1] ?? ''
    const params = new URLSearchParams(qs)
    if (params.get('stale') === '1') params.delete('stale')
    else params.set('stale', '1')
    const target = `/programs${params.toString() ? '?' + params.toString() : ''}`
    router.visit(target, { preserveState: true, preserveScroll: true, replace: true })
  }, [url])

  const resetFilters = useCallback(() => {
    router.visit('/programs', { preserveState: true, preserveScroll: true, replace: true })
  }, [])

  // ── Timeline data ──────────────────────────────────────────────────────
  const [timelineData, setTimelineData] = useState<TimelineGanttProgram[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)

  const loadTimeline = useCallback(() => {
    setTimelineLoading(true)
    setTimelineError(null)
    api.get<{ data: TimelineGanttProgram[] }>('/programs/timeline-all')
      .then(res => setTimelineData(res.data ?? []))
      .catch((err) => {
        console.error('[Atlas] Gagal memuat timeline program:', err)
        setTimelineData([])
        setTimelineError(err instanceof Error ? err.message : 'Gagal memuat timeline program')
      })
      .finally(() => setTimelineLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'timeline' && timelineView === 'gantt' && timelineData.length === 0) loadTimeline()
  }, [tab, timelineView, timelineData.length, loadTimeline])

  // ── Execution pulse data ───────────────────────────────────────────────
  const [pulse, setPulse] = useState<ExecutionPulse | null>(null)
  const [pulseLoading, setPulseLoading] = useState(false)
  const [pulseError, setPulseError] = useState<string | null>(null)

  const loadPulse = useCallback(() => {
    setPulseLoading(true)
    setPulseError(null)
    api.get<{ data: ExecutionPulse }>('/programs/execution-pulse')
      .then(res => setPulse(res.data ?? null))
      .catch((err) => {
        console.error('[Atlas] Gagal memuat execution pulse:', err)
        setPulse(null)
        setPulseError(err instanceof Error ? err.message : 'Gagal memuat data eksekusi')
      })
      .finally(() => setPulseLoading(false))
  }, [])

  // Load pulse on mount so blocker badges are available in all tabs
  useEffect(() => { loadPulse() }, [loadPulse])

  // Declare modal-open flags early so useEscKey priority can reference them
  const [showCreateProgram, setShowCreateProgram] = useState(false)

  // ── Batch Charter Export (Isu #5) ─────────────────────────────────────
  // Modal: pilih N program → fetch /programs/{id}/charter (JSON) parallel
  // → exportProgramsCharterBatch composes 1 deck multi-slide → download.
  // Use case: Pak Dirkeu rapat MRC → 1 file PPTX untuk semua program direktorat.
  const [showBatchExport, setShowBatchExport] = useState(false)
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(new Set())
  const [batchSearch, setBatchSearch] = useState('')
  const [batchExporting, setBatchExporting] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const closeBatchExport = () => {
    if (batchExporting) return
    setShowBatchExport(false)
    setBatchSelectedIds(new Set())
    setBatchSearch('')
    setBatchError(null)
  }
  useEscKey(closeBatchExport, showBatchExport)
  const batchDialogRef = useDialogFocus<HTMLDivElement>(showBatchExport)
  const batchTitleId = useId()
  const batchFilteredPrograms = useMemo(() => {
    const q = batchSearch.trim().toLowerCase()
    if (!q) return programs
    return programs.filter(p =>
      p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    )
  }, [programs, batchSearch])
  const batchAllVisibleSelected = batchFilteredPrograms.length > 0
    && batchFilteredPrograms.every(p => batchSelectedIds.has(p.id))
  const toggleBatchAll = () => {
    if (batchAllVisibleSelected) {
      // Deselect just the visible ones (keep selection of non-visible).
      setBatchSelectedIds(prev => {
        const next = new Set(prev)
        batchFilteredPrograms.forEach(p => next.delete(p.id))
        return next
      })
    } else {
      setBatchSelectedIds(prev => {
        const next = new Set(prev)
        batchFilteredPrograms.forEach(p => next.add(p.id))
        return next
      })
    }
  }
  const toggleBatchOne = (id: number) => {
    setBatchSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const handleBatchExport = async () => {
    if (batchSelectedIds.size === 0 || batchExporting) return
    setBatchExporting(true)
    setBatchError(null)
    try {
      const ids = Array.from(batchSelectedIds)
      // Fetch payload parallel — Charter route returns JSON when Accept header
      // is application/json (api lib sets this by default).
      const payloads = await Promise.all(
        ids.map(id => api.get<{ data: CharterPayload }>(`/programs/${id}/charter`)
          .then(r => r.data))
      )
      // Lazy import — pptxgenjs bundle (~377 KB) hanya dimuat saat user
      // benar-benar export. Sama dengan single-export ExportButton.
      const { exportProgramsCharterBatch } = await import('../lib/exporters/programCharterPptx')
      await exportProgramsCharterBatch(payloads)
      closeBatchExport()
    } catch (e: unknown) {
      setBatchError(extractErrorMessage(e, 'Gagal membuat PPTX batch.'))
    } finally {
      setBatchExporting(false)
    }
  }

  // ── Overlay animation helper (must be defined before any modal that uses it) ──
  const [closingOverlay, setClosingOverlay] = useState<string | null>(null)
  const closeOverlay = useCallback((name: string, action: () => void) => {
    setClosingOverlay(name)
    setTimeout(() => { action(); setClosingOverlay(null) }, 150)
  }, [])

  // ── Kebab menu state ──────────────────────────────────────────────────
  type KebabMenuData = {
    progId: number; progName: string; isOwner: boolean
    prog: { id: number; name: string; description?: string; status: string; priority: string; startDate?: string; targetEndDate?: string }
    top: number; right: number
  }
  const [kebabMenu, setKebabMenu] = useState<KebabMenuData | null>(null)
  const openKebabId = kebabMenu?.progId ?? null
  const closeKebab = useCallback(() => setKebabMenu(null), [])

  // ── Edit Program modal ────────────────────────────────────────────────
  type EditProgram = { id: number; name: string; description: string; status: string; priority: string; startDate: string; targetEndDate: string; ownerId: number | null; approvalStatus: string | null; kelompok: string; pilarStrategis: string; progresTerkini: string; dukunganDibutuhkan: string }
  const [editProgram, setEditProgram] = useState<EditProgram | null>(null)
  const [epSaving, setEpSaving] = useState(false)
  const [epError, setEpError] = useState<string | null>(null)
  const [epUserDirectory, setEpUserDirectory] = useState<Array<{ id: number; name: string; positionTitle?: string | null }>>([])
  const [epDirLoading, setEpDirLoading] = useState(false)
  const editProgramTitleId = useId()
  const editProgramDialogRef = useDialogFocus<HTMLDivElement>(!!editProgram)
  const closeEditProgram = useCallback(() => closeOverlay('edit-program', () => { setEditProgram(null); setEpError(null); setEpUserDirectory([]) }), [closeOverlay])
  useEscKey(closeEditProgram, !!editProgram)

  const openEditProgram = (prog: { id: number; name: string; description?: string; status: string; priority: string; startDate?: string; targetEndDate?: string; ownerId?: number | null; approvalStatus?: string | null; kelompok?: string | null; pilarStrategis?: string | null; progresTerkini?: string | null; dukunganDibutuhkan?: string | null }) => {
    setEditProgram({
      id: prog.id,
      name: prog.name,
      description: prog.description ?? '',
      status: prog.status,
      priority: prog.priority,
      startDate: prog.startDate ? prog.startDate.slice(0, 10) : '',
      targetEndDate: prog.targetEndDate ? prog.targetEndDate.slice(0, 10) : '',
      ownerId: prog.ownerId ?? null,
      approvalStatus: prog.approvalStatus ?? null,
      kelompok: prog.kelompok ?? '',
      pilarStrategis: prog.pilarStrategis ?? '',
      progresTerkini: prog.progresTerkini ?? '',
      dukunganDibutuhkan: prog.dukunganDibutuhkan ?? '',
    })
    setKebabMenu(null)
    // Pre-load user directory so it's ready when form opens
    setEpDirLoading(true)
    void api.get<{ data: Array<{ id: number; name: string; positionTitle?: string | null }> }>('/users/directory')
      .then(r => setEpUserDirectory(r.data ?? []))
      .catch((err) => console.error('[Atlas] Gagal memuat user directory (EP):', err))
      .finally(() => setEpDirLoading(false))
  }

  const submitEditProgram = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editProgram) return
    setEpSaving(true); setEpError(null)
    try {
      await api.put(`/programs/${editProgram.id}`, {
        name: editProgram.name.trim(),
        description: editProgram.description.trim() || undefined,
        status: editProgram.status,
        priority: editProgram.priority,
        startDate: editProgram.startDate,
        targetEndDate: editProgram.targetEndDate,
        ...(editProgram.ownerId != null ? { ownerId: editProgram.ownerId } : {}),
        kelompok: editProgram.kelompok || undefined,
        pilarStrategis: editProgram.pilarStrategis || undefined,
        progresTerkini: editProgram.progresTerkini.trim() || undefined,
        dukunganDibutuhkan: editProgram.dukunganDibutuhkan.trim() || undefined,
      })
      closeEditProgram()
      await loadOverview('refresh')
    } catch (err: unknown) {
      setEpError((err as { message?: string })?.message ?? 'Gagal menyimpan perubahan.')
    } finally {
      setEpSaving(false)
    }
  }

  // ── Archive Program modal ─────────────────────────────────────────────
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string } | null>(null)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const archiveTitleId = useId()
  const archiveDialogRef = useDialogFocus<HTMLDivElement>(!!archiveTarget)
  const closeArchiveModal = useCallback(() => closeOverlay('archive-program', () => { setArchiveTarget(null); setArchiveError(null) }), [closeOverlay])
  useEscKey(closeArchiveModal, !!archiveTarget)

  const submitArchive = async () => {
    if (!archiveTarget) return
    setArchiveSaving(true); setArchiveError(null)
    try {
      await api.patch(`/programs/${archiveTarget.id}/archive`, {})
      closeArchiveModal()
      await loadOverview('refresh')
    } catch (err: unknown) {
      setArchiveError((err as { message?: string })?.message ?? 'Gagal mengarsipkan program.')
    } finally {
      setArchiveSaving(false)
    }
  }

  // ── Restore Program modal ─────────────────────────────────────────────
  type ArchivedProgram = { id: number; name: string; code: string; archivedAt: string; archivedByName?: string | null; workstreamCount: number }
  const [archivedPrograms, setArchivedPrograms] = useState<ArchivedProgram[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<{ id: number; name: string } | null>(null)
  const [restoreSaving, setRestoreSaving] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const restoreTitleId = useId()
  const restoreDialogRef = useDialogFocus<HTMLDivElement>(!!restoreTarget)
  const closeRestoreModal = useCallback(() => closeOverlay('restore-program', () => { setRestoreTarget(null); setRestoreError(null) }), [closeOverlay])
  useEscKey(closeRestoreModal, !!restoreTarget)

  const [archivedError, setArchivedError] = useState<string | null>(null)
  const loadArchivedPrograms = useCallback(() => {
    setArchivedLoading(true)
    setArchivedError(null)
    api.get<{ data: ArchivedProgram[] }>('/programs/archived')
      .then(res => setArchivedPrograms(res.data ?? []))
      .catch((err) => {
        console.error('[Atlas] Gagal memuat program arsip:', err)
        setArchivedPrograms([])
        setArchivedError(err instanceof Error ? err.message : 'Gagal memuat program arsip')
      })
      .finally(() => setArchivedLoading(false))
  }, [])

  useEffect(() => { if (tab === 'archive') loadArchivedPrograms() }, [tab, loadArchivedPrograms])

  const submitRestore = async () => {
    if (!restoreTarget) return
    setRestoreSaving(true); setRestoreError(null)
    try {
      await api.patch(`/programs/${restoreTarget.id}/restore`, {})
      closeRestoreModal()
      loadArchivedPrograms()
      await loadOverview('refresh')
    } catch (err: unknown) {
      setRestoreError((err as { message?: string })?.message ?? 'Gagal memulihkan program.')
    } finally {
      setRestoreSaving(false)
    }
  }

  // ── Buat Program modal ────────────────────────────────────────────────
  const [cpCodeManuallyEdited, setCpCodeManuallyEdited] = useState(false)
  const [cpForm, setCpForm] = useState({
    code: '', name: '', description: '',
    status: 'IN_PROGRESS', priority: 'MEDIUM',
    startDate: '', targetEndDate: '',
    kelompok: '' as string,
    pilarStrategis: '' as string,
  })
  const [cpOwnerId, setCpOwnerId] = useState<number | null>(null)
  const [cpOwnerUnitId, setCpOwnerUnitId] = useState<number | null>(null)
  const [cpUnits, setCpUnits] = useState<Array<{ id: number; name: string; code: string }>>([])
  const [cpStep, setCpStep] = useState<1 | 2>(1)
  const [cpKpiCodes, setCpKpiCodes] = useState<string[]>([])
  const [cpKpiSearch, setCpKpiSearch] = useState('')
  const [cpKpiDropdownOpen, setCpKpiDropdownOpen] = useState(false)
  const [cpHasNoApmsKpi, setCpHasNoApmsKpi] = useState(false)
  const [cpSaving, setCpSaving] = useState(false)
  const [cpError, setCpError] = useState<string | null>(null)
  const [cpUserDirectory, setCpUserDirectory] = useState<Array<{ id: number; name: string; positionTitle?: string | null }>>([])

  const closeCpModal = useCallback(() => closeOverlay('create-program', () => {
    setShowCreateProgram(false)
    setCpError(null)
    setCpStep(1)
    setCpKpiCodes([])
    setCpKpiSearch('')
    setCpKpiDropdownOpen(false)
    setCpHasNoApmsKpi(false)
    setCpOwnerId(null)
    setCpOwnerUnitId(null)
    setCpUnits([])
    setCpForm({ code: '', name: '', description: '', status: 'IN_PROGRESS', priority: 'MEDIUM', startDate: '', targetEndDate: '', kelompok: '', pilarStrategis: '' })
    setCpCodeManuallyEdited(false)
  }), [closeOverlay])

  useEscKey(closeCpModal, showCreateProgram)
  const createProgramDialogRef = useDialogFocus<HTMLDivElement>(showCreateProgram || closingOverlay === 'create-program')
  const createProgramTitleId = useId()
  const createProgramDescId = useId()

  // Single entrypoint for "buka modal Program Baru" — dipakai oleh tombol di
  // page header DAN listener TOPBAR_ACTION_EVENT (global "+" di topbar +
  // command palette). Tanpa listener ini, klik "Program" di popover "+" jadi
  // no-op karena /programs sengaja tidak terdaftar di TOPBAR_ACTIONS map
  // (page mengelola CTA-nya sendiri).
  const openCreateProgramModal = useCallback(() => {
    if (!roleAccess.canCreateProgram) return
    setShowCreateProgram(true)
    if (cpUnits.length === 0) {
      void api.get<{ data: Array<{ id: number; name: string; code: string }> }>('/organization/units')
        .then(r => setCpUnits(r.data ?? []))
        .catch((err) => console.error('[Atlas] Gagal memuat unit list:', err))
    }
  }, [roleAccess.canCreateProgram, cpUnits.length])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; page: string }>).detail
      if (detail?.id === 'program.new') openCreateProgramModal()
    }
    window.addEventListener(TOPBAR_ACTION_EVENT, handler)
    return () => window.removeEventListener(TOPBAR_ACTION_EVENT, handler)
  }, [openCreateProgramModal])

  const submitCpStep1 = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCpStep(2)
  }

  const submitCreateProgram = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!currentUser) return
    setCpSaving(true)
    setCpError(null)
    try {
      const programName = cpForm.name.trim()
      const res = await api.post<{ data: { id: number } }>('/programs', {
        code: cpForm.code.trim(),
        name: programName,
        description: cpForm.description.trim() || undefined,
        status: cpForm.status,
        priority: cpForm.priority,
        startDate: cpForm.startDate,
        targetEndDate: cpForm.targetEndDate,
        ownerId: cpOwnerId ?? currentUser.id,
        ownerUnitId: cpOwnerUnitId ?? currentUser.unit?.id ?? undefined,
        apmsKpiCodes: cpKpiCodes.length > 0 ? cpKpiCodes : undefined,
        hasNoApmsKpi: cpHasNoApmsKpi || undefined,
        kelompok: cpForm.kelompok || undefined,
        pilarStrategis: cpForm.pilarStrategis || undefined,
      })
      const newId = res?.data?.id
      closeCpModal()
      toast.show(`Program "${programName}" berhasil dibuat — buka detail untuk lanjut setup`, 'success')
      // Refresh sidebar context + program list di belakang, lalu navigasi user
      // ke detail page untuk lanjut setup checklist.
      void loadOverview('refresh')
      if (newId) {
        navigate(`/programs/${newId}`)
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Gagal membuat program.'
      setCpError(msg)
      toast.show(msg, 'error')
    } finally {
      setCpSaving(false)
    }
  }

  // ── Auto-suggest program code ──────────────────────────────────────────
  // Format: PRG-<KODE_DIVISI>-<SINGKATAN_NAMA>-<URUTAN>
  // Segmen DIVISI di-omit jika tidak ada (user tanpa unit dan belum pilih Divisi Pemilik).
  const resolveDivisiCode = (ownerUnitId: number | null): string | null => {
    const rawCode = ownerUnitId
      ? cpUnits.find(u => u.id === ownerUnitId)?.code
      : currentUser?.unit?.code
    if (!rawCode) return null
    // Strip locale suffix: "DIMR-HLD" → "DIMR", "DKSA-HLD" → "DKSA". Kode tanpa suffix dilewati.
    return rawCode.split('-')[0]?.toUpperCase() ?? null
  }
  const suggestCode = (name: string, divisiCode: string | null): string => {
    const STOP = new Set(['dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'the', 'of', 'and'])
    const words = name.trim().split(/\s+/).filter(w => w.length > 1 && !STOP.has(w.toLowerCase()))
    const abbr = words.slice(0, 3).map(w => w[0].toUpperCase()).join('')
    const seq = String(programs.length + 1).padStart(3, '0')
    const segments = ['PRG']
    if (divisiCode) segments.push(divisiCode)
    segments.push(abbr || 'X')
    segments.push(seq)
    return segments.join('-')
  }

  // ── Computed values ────────────────────────────────────────────────────
  const avgProgress = programs.length > 0
    ? Math.round(programs.reduce((s, p) => s + p.progressPercent, 0) / programs.length) : 0
  const healthMix = {
    green:  programs.filter(p => normalizeHealthStatus(p.healthStatus) === 'GREEN').length,
    yellow: programs.filter(p => normalizeHealthStatus(p.healthStatus) === 'YELLOW').length,
    red:    programs.filter(p => normalizeHealthStatus(p.healthStatus) === 'RED').length,
  }
  const riskPrograms = programs.filter(p => normalizeHealthStatus(p.healthStatus) === 'RED' || p.riskScore >= 15).length

  const daysUntil = (dateStr: string) =>
    Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  const formatDaysLabel = (days: number) => {
    if (days < 0) return { label: `${Math.abs(days)} hari terlambat`, color: 'var(--red)', tone: 'critical' as const }
    if (days === 0) return { label: 'hari ini', color: 'var(--red)', tone: 'critical' as const }
    if (days <= 14) return { label: `${days} hari lagi`, color: 'var(--yellow)', tone: 'warning' as const }
    if (days <= 30) return { label: `${days} hari lagi`, color: 'var(--blue)', tone: 'notice' as const }
    return { label: `${days} hari lagi`, color: 'var(--text-muted)', tone: 'muted' as const }
  }

  // Programs where the current user needs to take action (approve or submit)
  const needsActionPrograms = programs.filter(p => {
    if (role === 'KASUBDIV') return p.approvalStatus === 'PENDING_KASUB'
    if (['KADIV', 'ADMIN', 'SUPERADMIN'].includes(role)) return p.approvalStatus === 'PENDING_KADIV'
    // ASISTEN/others: their own DRAFT programs still need to be submitted
    return p.approvalStatus === 'DRAFT' && p.submittedById === currentUser?.id
  })

  const matchesUrlStatus = (p: typeof programs[number]) =>
    urlStatusFilter.size === 0 || urlStatusFilter.has(normalizeHealthStatus(p.healthStatus) as 'GREEN' | 'YELLOW' | 'RED')

  const filteredPortfolio = programs.filter(p => {
    const matchesSearch = !portfolioSearch ||
      p.name.toLowerCase().includes(portfolioSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(portfolioSearch.toLowerCase())
    const matchesApproval = approvalFilter === 'all' || needsActionPrograms.some(n => n.id === p.id)
    return matchesSearch && matchesApproval && matchesUrlStatus(p)
  })

  const filteredLane = programs.filter(p =>
    (!laneSearch || p.name.toLowerCase().includes(laneSearch.toLowerCase()) ||
     p.code.toLowerCase().includes(laneSearch.toLowerCase())) &&
    matchesUrlStatus(p)
  )
  const filteredTimeline = timelineData.filter(p =>
    !laneSearch || p.name.toLowerCase().includes(laneSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(laneSearch.toLowerCase())
  )

  // Lane grouping
  type Group = { key: string; label: string; tone: string; items: typeof programs }
  let laneGroups: Group[] = []
  if (laneGrouping === 'status') {
    laneGroups = STATUS_ORDER.map(s => ({
      key: s, label: formatStatusLabel(s), tone: s.toLowerCase(),
      items: filteredLane.filter(p => p.status === s),
    })).filter(g => g.items.length > 0)
  } else if (laneGrouping === 'priority') {
    laneGroups = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(pri => ({
      key: pri, label: pri,
      tone: pri.toLowerCase(),
      items: filteredLane.filter(p => p.priority === pri),
    })).filter(g => g.items.length > 0)
  } else {
    laneGroups = ['GREEN', 'YELLOW', 'RED'].map(h => ({
      key: h,
      label: h === 'GREEN' ? 'On Track' : h === 'YELLOW' ? 'At Risk' : 'Terlambat',
      tone: h.toLowerCase(),
      items: filteredLane.filter(p => normalizeHealthStatus(p.healthStatus) === h),
    })).filter(g => g.items.length > 0)
  }

  // ── Pulse filter state ─────────────────────────────────────────────────
  const [pulseFilter, setPulseFilter] = useState<'all' | number>('all')

  // Filter blockers with valid task→workstream→program chain.
  // Orphan blockers (task deleted/null) would crash downstream accesses.
  const validBlockers = (pulse?.activeBlockers ?? []).filter(b =>
    b.task?.workstream?.program?.id != null
  )

  // ── Blocker counts per program (for detail panel badge) ───────────────
  const blockerCountByProgram = validBlockers.reduce<Record<number, number>>((acc, b) => {
    const pid = b.task!.workstream.program.id
    acc[pid] = (acc[pid] ?? 0) + 1
    return acc
  }, {})

  const blockers = validBlockers.filter(b =>
    pulseFilter === 'all' || b.task!.workstream.program.id === pulseFilter
  )
  const atRisk = pulse?.atRiskWorkstreams.filter(i =>
    pulseFilter === 'all' || i.program.id === pulseFilter
  ) ?? []
  const stagnant = pulse?.stagnantItems.filter(w =>
    pulseFilter === 'all' || w.workstream.program.id === pulseFilter
  ) ?? []

  const totalIssues = (pulse?.activeBlockers.length ?? 0) +
    (pulse?.atRiskWorkstreams.length ?? 0) + (pulse?.stagnantItems.length ?? 0)

  return (
    <div className="ds programs-v2 view-programs">
      {/* `ds-stagger`: Phase 3 motion standardization. Modals di page ini
          semua portal-mounted (createPortal ke document.body) — modal-safe. */}
      <div className="programs-v2__inner ds-stagger">
      {/* ── Page header (design-system PageHeader) ─────────────────────────── */}
      <PageHeader
        title="Programs"
        subtitle={programs.length === 0 ? 'Belum ada program' : 'Portofolio program kerja & kesehatannya'}
        actions={
          <>
            {roleAccess.isMonitoringOnly && (
              <span className="role-monitoring-badge">Monitoring</span>
            )}
            {programs.length > 0 && (
              <button
                className="programs-v2__cta programs-v2__cta--secondary"
                onClick={() => setShowBatchExport(true)}
                type="button"
                title="Export Charter PPTX untuk beberapa program sekaligus (rapat MRC / direksi)"
              >
                Export Charter PPTX
              </button>
            )}
            {roleAccess.canCreateProgram && (
              <button
                className="programs-v2__cta"
                onClick={openCreateProgramModal}
                type="button"
              >
                Program Baru
              </button>
            )}
          </>
        }
      />

      {/* ── Portfolio stats strip ──────────────────────────────────────────
          Glance summary dengan donut chart sebagai visualisasi utama health
          distribution. Total program ditampilkan di tengah donut — menghapus
          stat cell terpisah yang redundan. Pure SVG, no chart library. */}
      {programs.length > 0 && (
        <div className="programs-v2__hero-stats">
          <div className="programs-v2__stat programs-v2__stat--donut">
            <HealthDonut
              green={healthMix.green}
              yellow={healthMix.yellow}
              red={healthMix.red}
              total={programs.length}
            />
            <div className="programs-v2__health-legend programs-v2__health-legend--column">
              <span className="programs-v2__health-legend-item">
                <i className="programs-v2__health-dot programs-v2__health-dot--green" />
                On Track <strong>{healthMix.green}</strong>
              </span>
              <span className="programs-v2__health-legend-item">
                <i className="programs-v2__health-dot programs-v2__health-dot--yellow" />
                At Risk <strong>{healthMix.yellow}</strong>
              </span>
              <span className="programs-v2__health-legend-item">
                <i className="programs-v2__health-dot programs-v2__health-dot--red" />
                Terlambat <strong>{healthMix.red}</strong>
              </span>
            </div>
          </div>

          <div className="programs-v2__stat">
            <div className="programs-v2__stat-num">{avgProgress}<span className="programs-v2__stat-num-unit">%</span></div>
            <div className="programs-v2__stat-label">Rata-rata Progress</div>
            <div className="programs-v2__progress-bar">
              <span style={{ width: `${Math.min(avgProgress, 100)}%` }} />
            </div>
          </div>

          {(riskPrograms > 0 || needsActionPrograms.length > 0) && (
            <button
              type="button"
              className="programs-v2__stat programs-v2__stat--action"
              onClick={() => {
                setTab('portfolio')
                if (needsActionPrograms.length > 0) {
                  setApprovalFilter('needs_action')
                } else {
                  router.visit('/programs?status=at_risk,terlambat', {
                    preserveState: true, preserveScroll: true, replace: true,
                  })
                }
              }}
              title={needsActionPrograms.length > 0
                ? 'Filter program yang menunggu aksi Anda'
                : 'Filter program berisiko (At Risk + Terlambat)'}
            >
              <div className="programs-v2__stat-num">
                {needsActionPrograms.length > 0 ? needsActionPrograms.length : riskPrograms}
              </div>
              <div className="programs-v2__stat-label">
                {needsActionPrograms.length > 0 ? 'Butuh Aksi Anda' : 'Butuh Perhatian'}
                <span className="programs-v2__stat-arrow"> →</span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <nav className="programs-v2__tabs" role="tablist" aria-label="Program views">
        {([
          ['portfolio', 'Portofolio'],
          ['timeline',  'Timeline'],
          ['monitoring', 'Monitoring'],
          ['pulse',     'Pulse'],
          ['risiko',    'Risiko'],
        ] as [ProgramTab, string][]).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`programs-v2__tab${tab === t ? ' programs-v2__tab--active' : ''}`}
            onClick={() => setTab(t)}
            type="button"
          >
            <span>{label}</span>
            {t === 'pulse' && totalIssues > 0 && (
              <span className="programs-v2__tab-count">{totalIssues}</span>
            )}
          </button>
        ))}
        {roleAccess.canViewArchive && (
          <button
            role="tab"
            aria-selected={tab === 'archive'}
            className={`programs-v2__tab programs-v2__tab--muted${tab === 'archive' ? ' programs-v2__tab--active' : ''}`}
            onClick={() => setTab('archive')}
            type="button"
          >
            <span>Arsip</span>
          </button>
        )}
      </nav>

      {/* ── Controls bar — filters left, view+search right ──────────────── */}
      {(tab === 'portfolio' || tab === 'timeline') && (
        <div className="programs-controls">
          <div className="programs-controls__filters" role="group" aria-label="Filter program">
            {([
              ['GREEN',  'On Track',  'green'],
              ['YELLOW', 'At Risk',   'amber'],
              ['RED',    'Terlambat', 'red'],
            ] as const).map(([tone, label, toneClass]) => {
              const active = urlStatusFilter.has(tone)
              return (
                <button
                  key={tone}
                  type="button"
                  className={`programs-filter-chip programs-filter-chip--${toneClass}${active ? ' programs-filter-chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleStatusFilter(tone)}
                >
                  <span className="programs-filter-chip__dot" aria-hidden="true" />
                  {label}
                </button>
              )
            })}
            <button
              type="button"
              className={`programs-filter-chip programs-filter-chip--stale${urlStaleOnly ? ' programs-filter-chip--active' : ''}`}
              aria-pressed={urlStaleOnly}
              onClick={toggleStaleFilter}
            >
              Stale &gt;30 hari
            </button>
            {tab === 'portfolio' && needsActionPrograms.length > 0 && (
              <button
                type="button"
                className={`programs-filter-chip programs-filter-chip--amber${approvalFilter === 'needs_action' ? ' programs-filter-chip--active' : ''}`}
                aria-pressed={approvalFilter === 'needs_action'}
                onClick={() => setApprovalFilter(f => f === 'needs_action' ? 'all' : 'needs_action')}
              >
                <span className="programs-filter-chip__dot" aria-hidden="true" />
                Perlu Persetujuan
                <span className="programs-filter-chip__count">{needsActionPrograms.length}</span>
              </button>
            )}
            {(urlStatusFilter.size > 0 || urlStaleOnly || approvalFilter === 'needs_action') && (
              <button
                type="button"
                className="programs-filter-reset"
                onClick={() => {
                  setApprovalFilter('all')
                  resetFilters()
                }}
              >
                Reset
              </button>
            )}
          </div>

          <div className="programs-controls__view">
            {tab === 'portfolio' && (
              <>
                <div className="view-toggle">
                  {(['list', 'kanban', 'table'] as PortfolioView[]).map(mode => (
                    <button key={mode} className={`view-toggle-btn${portfolioView === mode ? ' active' : ''}`}
                      onClick={() => setPortfolioView(mode)}>
                      {mode === 'list' ? 'List' : mode === 'kanban' ? 'Board' : 'Table'}
                    </button>
                  ))}
                </div>
                <div className="programs-search">
                  <svg className="programs-search__icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="4.5" />
                    <path d="m9.5 9.5 3 3" />
                  </svg>
                  <input className="programs-search__input" value={portfolioSearch}
                    onChange={e => setPortfolioSearch(e.target.value)} placeholder="Cari program…" />
                </div>
              </>
            )}
            {tab === 'timeline' && (
              <>
                <div className="view-toggle">
                  <button className={`view-toggle-btn${timelineView === 'lanes' ? ' active' : ''}`} onClick={() => setTimelineView('lanes')}>Lanes</button>
                  <button className={`view-toggle-btn${timelineView === 'gantt' ? ' active' : ''}`} onClick={() => setTimelineView('gantt')}>Gantt</button>
                </div>
                {timelineView === 'lanes' && (
                  <div className="view-toggle">
                    {(['status', 'priority', 'health'] as LaneGrouping[]).map(g => (
                      <button key={g} className={`view-toggle-btn${laneGrouping === g ? ' active' : ''}`} onClick={() => setLaneGrouping(g)}>
                        {g === 'status' ? 'Status' : g === 'priority' ? 'Prioritas' : 'Kesehatan'}
                      </button>
                    ))}
                  </div>
                )}
              <div className="programs-search">
                <svg className="programs-search__icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" />
                  <path d="m9.5 9.5 3 3" />
                </svg>
                <input className="programs-search__input" value={laneSearch}
                  onChange={e => setLaneSearch(e.target.value)} placeholder="Cari program…" />
              </div>
            </>
          )}
          </div>
        </div>
      )}

      <div className="programs-workspace">
        {/* ── Main area ─────────────────────────────────────────────────── */}
        <div className="programs-main">
          <div key={tab} className="programs-tab-content">

          {/* ── TAB: PORTOFOLIO ─────────────────────────────────────────── */}
          {tab === 'portfolio' && (
            <>
              {portfolioView === 'list' && (
                <div className="section-block section-block--bare">
                  {filteredPortfolio.length > 0 ? (
                    <div className="program-roster">
                      <div className="program-roster__header" aria-hidden="true">
                        <div className="program-roster__header-main">
                          <span>Program</span>
                          <span>Status</span>
                          <span>Progress</span>
                          <span>PIC</span>
                        </div>
                        {/* Spacer mengikuti area Charter btn + kebab di row, supaya
                            kolom header benar-benar align dengan kolom konten. */}
                        <span className="program-roster__header-actions-spacer" aria-hidden="true" />
                      </div>
                      {filteredPortfolio.map((prog) => {
                        const health = normalizeHealthStatus(prog.healthStatus)
                        const sc = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
                        const healthLabel = healthStatusLabel(health)
                        const bCount = blockerCountByProgram[prog.id] ?? 0
                        const days = prog.targetEndDate ? daysUntil(prog.targetEndDate) : null
                        const deadlineInfo = days !== null ? formatDaysLabel(days) : null
                        const approvalInfo = approvalBadge(prog)
                        const healthTone = sc === 'on-track' ? 'green' : sc === 'at-risk' ? 'yellow' : 'red'
                        const isOwner = (prog as { ownerId?: number }).ownerId === currentUser?.id
                        const showActions = roleAccess.canEditProgram(isOwner) || roleAccess.canArchiveProgram(isOwner)
                        return (
                          <div
                            key={prog.id}
                            className={`list-row list-row--${sc} list-row--with-actions${prog.id === selectedProgramId ? ' program-row--active' : ''}`}
                          >
                            <button
                              className="program-row__main"
                              onClick={() => navigate(`/programs/${prog.id}`)}
                              type="button"
                            >
                              <div className="program-row__identity">
                                <span className="code-badge program-row__code">{prog.code}</span>
                                <div className="program-row__info">
                                  <strong>{prog.name}</strong>
                                  <div className="program-row__meta">
                                    <span className="program-row__meta-primary">{workstreamSummaryLabel(prog.workstreamCount)}</span>
                                    {deadlineInfo && (
                                      <span className={`program-deadline program-deadline--${deadlineInfo.tone}`}>
                                        {deadlineInfo.label}
                                      </span>
                                    )}
                                    {bCount > 0 && (
                                      <span className="program-row__badge program-row__badge--blocker">
                                        {bCount} blocker
                                      </span>
                                    )}
                                    {approvalInfo && (
                                      <span className={`program-row__approval-tag program-row__approval-tag--${approvalInfo.tone}`}>
                                        {approvalInfo.label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="program-row__state">
                                <span className={`program-row__status-pill program-row__status-pill--${healthTone}`}>
                                  {healthLabel}
                                </span>
                              </div>
                              <div className="program-row__progress">
                                {prog.progressPercent > 0 ? (
                                  <div className="program-row__progress-main">
                                    <div className="progress-bar-track program-row__progress-track">
                                      <div className={`progress-bar-fill ${sc}`} style={{ width: `${prog.progressPercent}%` }} />
                                    </div>
                                    <span className="program-row__progress-value">
                                      {prog.progressPercent}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="program-row__progress-empty">Belum dimulai</span>
                                )}
                              </div>
                              <div className="program-row__owner-block">
                                {prog.owner ? (
                                  <>
                                    <Avatar name={prog.owner.name} size={24} />
                                    <span className="program-row__owner" title={prog.owner.name}>
                                      {prog.owner.name}
                                    </span>
                                  </>
                                ) : (
                                  <span className="program-row__owner program-row__owner--empty">
                                    Belum ditetapkan
                                  </span>
                                )}
                                {(prog.picPersons ?? []).length > 0 && (
                                  <span className="program-row__copics" title={(prog.picPersons ?? []).map(p => p.name).join(', ')}>
                                    +{(prog.picPersons ?? []).length}
                                  </span>
                                )}
                              </div>
                            </button>
                            {/* Charter quick-view button — direct shortcut ke
                                /programs/{id}/charter tanpa drill-in ke edit
                                view. Selalu visible untuk discoverability. */}
                            <button
                              className="program-row__charter-btn"
                              onClick={e => { e.stopPropagation(); navigate(`/programs/${prog.id}/charter`) }}
                              type="button"
                              title="Lihat sebagai Charter (single-page, read-only)"
                              aria-label={`Lihat ${prog.code} sebagai Charter`}
                            >
                              Charter
                              <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10" aria-hidden="true">
                                <path d="M3 6h6M6 3l3 3-3 3" />
                              </svg>
                            </button>
                            {/* Kebab wrap SELALU dirender dengan width tetap (44px) agar
                                semua baris identik — button di-hide via visibility:hidden
                                bila tidak ada aksi, bukan conditional render. */}
                            <div className={`program-row__kebab-wrap${openKebabId === prog.id ? ' program-row__kebab-wrap--open' : ''}`}>
                              <button
                                className="program-row__kebab-btn"
                                style={!showActions ? { visibility: 'hidden' } : undefined}
                                onClick={e => {
                                  if (!showActions) return
                                  e.stopPropagation()
                                  if (openKebabId === prog.id) { closeKebab(); return }
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                  setKebabMenu({
                                    progId: prog.id, progName: prog.name, isOwner,
                                    prog,
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right,
                                  })
                                }}
                                type="button"
                                aria-label="Aksi program"
                                tabIndex={!showActions ? -1 : undefined}
                              >
                                ···
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : portfolioSearch ? (
                    <SectionState
                      tone="info" compact
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-4-4" />
                        </svg>
                      }
                      title="Tidak ditemukan"
                      text={`Tidak ada program yang cocok dengan "${portfolioSearch}".`}
                    />
                  ) : (
                    <SectionState
                      tone="info"
                      icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      }
                      title="Portfolio kosong"
                      text="Program akan muncul setelah data dimuat."
                    />
                  )}
                </div>
              )}

              {portfolioView === 'kanban' && (
                <div className="program-kanban">
                  {STATUS_ORDER.map(status => {
                    const items = filteredPortfolio.filter(p => p.status === status)
                    return (
                      <div className="kanban-col" key={status}>
                        <div className="kanban-col__header">
                          <span className="kanban-col__label">{formatStatusLabel(status)}</span>
                          <span className="kanban-col__count">{items.length}</span>
                        </div>
                        <div className="kanban-col__body">
                          {items.map(prog => {
                            const h = normalizeHealthStatus(prog.healthStatus)
                            const sc = h === 'GREEN' ? 'on-track' : h === 'YELLOW' ? 'at-risk' : 'off-track'
                            const hClass = h === 'GREEN' ? 'health-green' : h === 'YELLOW' ? 'health-yellow' : 'health-red'
                            const approvalInfo = approvalBadge(prog)
                            const bCount = blockerCountByProgram[prog.id] ?? 0
                            const days = prog.targetEndDate ? daysUntil(prog.targetEndDate) : null
                            const deadlineInfo = days !== null ? formatDaysLabel(days) : null
                            return (
                              <button key={prog.id}
                                className={`kanban-card kanban-card--${hClass}${prog.id === selectedProgramId ? ' kanban-card--active' : ''}`}
                                onClick={() => navigate(`/programs/${prog.id}`)}
                                type="button">
                                <div className="work-card__head">
                                  <span className={`work-card__dot work-card__dot--${prog.priority.toLowerCase()}`} />
                                  <h4 className="kanban-card__title">{prog.name}</h4>
                                </div>
                                <div className="progress-bar-track kanban-card__progress-track">
                                  <div className={`progress-bar-fill ${sc}`} style={{ width: `${prog.progressPercent}%` }} />
                                </div>
                                <div className="kanban-card__footer">
                                  <span className="code-badge">{prog.code}</span>
                                  <HealthPill status={h} />
                                  {approvalInfo && (
                                    <span className={`program-tone-chip program-tone-chip--${approvalInfo.tone} program-tone-chip--compact`}>
                                      {approvalInfo.label}
                                    </span>
                                  )}
                                  {bCount > 0 && (
                                    <span className="program-tone-chip program-tone-chip--red program-tone-chip--compact">
                                      {bCount}⚠
                                    </span>
                                  )}
                                  <span className="kanban-card__progress-value">{prog.progressPercent}%</span>
                                </div>
                                {deadlineInfo && (
                                  <div className={`kanban-card__deadline program-deadline program-deadline--${deadlineInfo.tone}`}>
                                    {deadlineInfo.label}
                                  </div>
                                )}
                              </button>
                            )
                          })}
                          {items.length === 0 && <div className="kanban-col__empty">Tidak ada program</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {portfolioView === 'table' && (
                <div className="panel">
                  <div className="panel__header">
                    <div>
                      <h3 className="panel__title">Portfolio Table</h3>
                      <p className="panel__sub">Risk score, alignment, dan health status per program.</p>
                    </div>
                  </div>
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Status</th>
                        <th>Progress</th>
                        <th>Deadline</th>
                        <th>Risk</th>
                        <th>Blocker</th>
                        <th>Alignment</th>
                        <th>Health</th>
                        <th>KPI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPortfolio.map(prog => {
                        const bCount = blockerCountByProgram[prog.id] ?? 0
                        const days = prog.targetEndDate ? daysUntil(prog.targetEndDate) : null
                        const deadlineInfo = days !== null ? formatDaysLabel(days) : null
                        return (
                          <tr key={prog.id}
                            className={`gov-table__row${prog.id === selectedProgramId ? ' gov-table__row--active' : ''}`}
                            onClick={() => navigate(`/programs/${prog.id}`)}>
                            <td>
                              <div className="gov-table__name">
                                <span className="code-badge">{prog.code}</span>
                                <strong>{prog.name}</strong>
                              </div>
                            </td>
                            <td>{(() => { const d = getProgramDisplayStatus(prog); return <span className={`badge badge--${d.tone}`}>{d.label}</span> })()}</td>
                            <td>
                              <div className="gov-table__progress">
                                <div className="progress-bar progress-bar--inline">
                                  <div className="progress-bar__fill" style={{ width: `${prog.progressPercent}%` }} />
                                </div>
                                <span>{prog.progressPercent}%</span>
                              </div>
                            </td>
                            <td>
                              {deadlineInfo ? (
                                <span className={`program-deadline program-deadline--${deadlineInfo.tone}`}>{deadlineInfo.label}</span>
                              ) : <span className="text-muted">—</span>}
                            </td>
                            <td>
                              <span className={prog.riskScore >= 15 ? 'text-red fw-bold' : prog.riskScore >= 8 ? 'text-yellow fw-bold' : 'text-green fw-bold'}>
                                {prog.riskScore}
                              </span>
                            </td>
                            <td>
                              {bCount > 0 ? (
                                <span className="program-table-count program-table-count--blockers">{bCount}</span>
                              ) : <span className="program-table-count program-table-count--empty">—</span>}
                            </td>
                            <td>{prog.strategicAlignment}%</td>
                            <td><HealthPill status={normalizeHealthStatus(prog.healthStatus)} /></td>
                            <td>
                              {(prog.kpiCount ?? 0) === 0 ? (
                                <span className="program-tone-chip program-tone-chip--yellow program-tone-chip--compact">
                                  No KPI
                                </span>
                              ) : (
                                <span className="program-table-count program-table-count--empty">{prog.kpiCount}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* KPI Watch dipindah ke Home — lihat tab Home untuk analisis KPI */}
            </>
          )}

          {/* ── TAB: TIMELINE ───────────────────────────────────────────── */}
          {tab === 'timeline' && (
            <>
              {timelineView === 'lanes' && (
                <div className="roadmap-body">
                  {laneGroups.length === 0 ? (
                    <p className="text-sm text-muted roadmap-empty">Tidak ada program yang cocok.</p>
                  ) : (
                    <>
                      {laneGroups.map(group => (
                        <div className="roadmap-lane" key={group.key}>
                          <div className={`roadmap-lane__header${group.key === 'ON_HOLD' ? ' roadmap-lane__header--on-hold' : ''}`}>
                            <span className={`roadmap-lane__dot roadmap-lane__dot--${group.tone}`} />
                            <span className="roadmap-lane__label">{group.label}</span>
                            <span className="section-badge">{group.items.length}</span>
                          </div>
                          <div className="roadmap-lane__body">
                            {group.items.map(prog => {
                              const health = normalizeHealthStatus(prog.healthStatus)
                              const sc = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
                              const riskTone = prog.riskScore >= 15 ? 'critical' : 'warn'
                              return (
                                <button key={prog.id} className="roadmap-bar list-row"
                                  onClick={() => navigate(`/programs/${prog.id}`)}>
                                  <span className="code-badge roadmap-bar__code">{prog.code}</span>
                                  <div className="roadmap-bar__title">
                                    <span className="roadmap-bar__name" title={prog.name}>{prog.name}</span>
                                  </div>
                                  <div className="progress-bar-track roadmap-bar__progress">
                                    <div className={`progress-bar-fill ${sc}`} style={{ width: `${Math.max(prog.progressPercent, 2)}%` }} />
                                  </div>
                                  <span className="roadmap-bar__pct">
                                    {prog.progressPercent}%
                                  </span>
                                  {prog.riskScore >= 10 ? (
                                    <span className={`risk-chip risk-chip--${riskTone} roadmap-bar__risk`}>
                                      Risk {prog.riskScore}
                                    </span>
                                  ) : <span className="roadmap-bar__risk-placeholder" />}
                                  {prog.owner ? (
                                    <span className="roadmap-bar__owner text-muted text-xs">{prog.owner.name}</span>
                                  ) : <span className="roadmap-bar__owner-placeholder" />}
                                  {(prog.kpiCount ?? 0) === 0 && (
                                    <span className="program-tone-chip program-tone-chip--yellow program-tone-chip--compact">
                                      No KPI
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Alignment matrix */}
                      {dashboard?.dimensions.strategic && dashboard.dimensions.strategic.length > 0 && (
                        <div className="roadmap-alignment">
                          <div className="section-block">
                            <div className="section-header">
                              <h3 className="section-title">Program Alignment</h3>
                            </div>
                            <div className="alignment-grid">
                              {dashboard.dimensions.strategic.slice(0, 8).map(s => (
                                <div className="alignment-cell" key={s.programId} title={`${s.program} — ${s.strategicAlignment ?? 0}%`}>
                                  <div className="alignment-cell__bar">
                                    <div
                                      className={`alignment-cell__fill alignment-cell__fill--${(s.strategicAlignment ?? 0) >= 80 ? 'green' : (s.strategicAlignment ?? 0) >= 60 ? 'yellow' : 'red'}`}
                                      style={{ height: `${s.strategicAlignment ?? 0}%` }}
                                    />
                                  </div>
                                  <span className="alignment-cell__label text-muted">{s.program}</span>
                                  <span className="alignment-cell__val">{s.strategicAlignment != null ? `${s.strategicAlignment}%` : '—'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {timelineView === 'gantt' && (
                <div className="roadmap-body roadmap-body--timeline">
                  {timelineLoading ? (
                    <p className="text-sm text-muted roadmap-empty">Memuat timeline…</p>
                  ) : timelineError ? (
                    <div className="roadmap-empty roadmap-empty--error" role="alert">
                      <p className="text-sm">Gagal memuat timeline program.</p>
                      <p className="text-xs text-muted">{timelineError}</p>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={loadTimeline}>
                        Coba lagi
                      </button>
                    </div>
                  ) : (
                    <TimelineGantt
                      programs={filteredTimeline}
                      emptyText="Tidak ada program untuk ditampilkan."
                      onOpenProgram={(id) => navigate(`/programs/${id}`)}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* ── TAB: MONITORING MATRIX ──────────────────────────────────── */}
          {tab === 'monitoring' && (
            <div className="programs-section-stack">
              <MonitoringMatrix />
            </div>
          )}

          {/* ── TAB: PULSE ──────────────────────────────────────────────── */}
          {tab === 'pulse' && (
            <div className="pulse-body">
              {/* Program filter pill row */}
              {programs.length > 0 && (
                <div className="program-filter-pills">
                  <button
                    className={`program-filter-pill${pulseFilter === 'all' ? ' program-filter-pill--active' : ''}`}
                    onClick={() => setPulseFilter('all')}
                    type="button">Semua Program</button>
                  {programs.map(p => (
                    <button key={p.id}
                      className={`program-filter-pill${pulseFilter === p.id ? ' program-filter-pill--active' : ''}`}
                      onClick={() => setPulseFilter(p.id)}
                      type="button">{p.code}</button>
                  ))}
                </div>
              )}

              {pulseLoading ? (
                <div className="section-block"><SkeletonStack lines={[90, 75, 60, 80]} /></div>
              ) : !pulse ? (
                <SectionState icon="⚡" title="Unable to load pulse data" text="Try refreshing the page." />
              ) : (
                <div className="pulse-stack">

                  {/* A: Active Blockers */}
                  <div className="section-block">
                    <div className="section-header">
                      <div>
                        <h3 className="section-title">Active Blockers</h3>
                        <p className="section-subtitle">All open blockers halting execution.</p>
                      </div>
                      <span className={`section-badge${blockers.length > 0 ? ' section-badge--red' : ''}`}>
                        {blockers.length} open
                      </span>
                    </div>
                    {blockers.length === 0 ? (
                      <SectionState
  tone="success" compact
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  }
  title="Tidak ada blocker aktif"
  text="Semua blocker sudah diselesaikan."
/>
                    ) : (
                      <div className="program-list-stack program-list-stack--tight">
                        {blockers.map(b => {
                          const severity = VALID_SEVERITIES.has(b.severity) ? b.severity : 'LOW'
                          return (
                            <div key={b.id} className={`blocker-item blocker-item--${severity}`}>
                              <span className={`severity-badge severity-badge--${severity}`}>
                                {severity}
                              </span>
                              <div className="blocker-item__body">
                                <div className="blocker-item__title">
                                  {b.title}
                                </div>
                                <div className="blocker-item__meta">
                                  {b.task!.workstream.program.code} › {b.task!.workstream.name} › {b.task!.title}
                                </div>
                              </div>
                              <span className="blocker-item__age">
                                {Math.round(b.daysOpen) === 0 ? 'Today' : `${Math.round(b.daysOpen)}d`}
                              </span>
                              <button
                                className="btn btn--ghost blocker-item__action"
                                onClick={() => navigate(`/execution/tasks/${b.task!.id}`)}
                                type="button"
                              >
                                Buka →
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* B: At-risk workstreams */}
                  <div className="section-block">
                    <div className="section-header">
                      <div>
                        <h3 className="section-title">Workstream Berisiko</h3>
                        <p className="section-subtitle">Deadline ≤30 days with progress below 70%.</p>
                      </div>
                      <span className={`section-badge${atRisk.length > 0 ? ' section-badge--yellow' : ''}`}>
                        {atRisk.length} workstream
                      </span>
                    </div>
                    {atRisk.length === 0 ? (
                      <SectionState
  tone="success" compact
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  }
  title="Tidak ada workstream berisiko"
  text="Semua workstream berjalan sesuai target."
/>
                    ) : (
                      <div className="program-list-stack program-list-stack--tight">
                        {atRisk.map(ini => {
                          const h = normalizeHealthStatus(ini.healthStatus)
                          const sc = h === 'GREEN' ? 'on-track' : h === 'YELLOW' ? 'at-risk' : 'off-track'
                          const urgencyTone = ini.daysRemaining <= 7 ? 'critical' : ini.daysRemaining <= 14 ? 'warning' : 'muted'
                          return (
                            <div key={ini.id} className="pulse-item">
                              <HealthPill status={h} />
                              <div className="pulse-item__body">
                                <div className="pulse-item__title">
                                  {ini.name}
                                </div>
                                <div className="pulse-item__meta">
                                  {ini.program.code} · {ini.owner?.name ?? '—'}
                                </div>
                              </div>
                              <div className="pulse-item__progress">
                                <div className="progress-bar-track">
                                  <div className={`progress-bar-fill ${sc}`} style={{ width: `${ini.progressPercent}%` }} />
                                </div>
                                <span className="pulse-item__progress-value">{ini.progressPercent}%</span>
                              </div>
                              <span className={`pulse-item__state pulse-item__state--${urgencyTone}`}>
                                {Math.round(ini.daysRemaining) <= 0 ? 'Overdue' : `${Math.round(ini.daysRemaining)}d left`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* C: Stagnant items */}
                  <div className="section-block">
                    <div className="section-header">
                      <div>
                        <h3 className="section-title">Tugas Stagnan</h3>
                        <p className="section-subtitle">Tugas aktif yang belum ada update dalam 7 hari terakhir.</p>
                      </div>
                      <span className="section-badge">{stagnant.length} item</span>
                    </div>
                    {stagnant.length === 0 ? (
                      <SectionState
  tone="success" compact
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  }
  title="Tidak ada yang stagnan"
  text="Semua task berjalan aktif."
/>
                    ) : (
                      <div className="program-list-stack program-list-stack--tight">
                        {stagnant.map(w => {
                          const staleTone = w.stagnantDays >= 14 ? 'critical' : w.stagnantDays >= 10 ? 'warning' : 'muted'
                          return (
                            <div key={w.id} className="pulse-item">
                              <span className="badge pulse-item__status">{formatStatusLabel(w.status)}</span>
                              <div className="pulse-item__body">
                                <div className="pulse-item__title">
                                  {w.title}
                                </div>
                                <div className="pulse-item__meta">
                                  {w.workstream.program.code} › {w.workstream.name} · {w.assignee?.name ?? 'Unassigned'}
                                </div>
                              </div>
                              <span className="pulse-item__metric">
                                {w.percentComplete}%
                              </span>
                              <span className={`pulse-item__state pulse-item__state--${staleTone}`}>
                                Stagnant {Math.round(w.stagnantDays)}d
                              </span>
                              <button
                                className="btn btn--ghost blocker-item__action"
                                onClick={() => navigate(`/execution/tasks/${w.id}`)}
                                type="button"
                              >
                                Buka →
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: RISIKO ─────────────────────────────────────────────── */}
          {tab === 'risiko' && (
            <div className="programs-section-stack">
              <div className="section-block">
                <div className="section-header">
                  <div>
                    <h3 className="section-title">Program Alignment</h3>
                    <p className="section-subtitle">Strategic alignment level per program.</p>
                  </div>
                </div>
                {dashboard?.dimensions.strategic && dashboard.dimensions.strategic.length > 0 ? (
                  <div className="alignment-grid">
                    {dashboard.dimensions.strategic.slice(0, 8).map(s => (
                      <div className="alignment-cell" key={s.programId} title={`${s.program} — ${s.strategicAlignment}%`}>
                        <div className="alignment-cell__bar">
                          <div
                            className={`alignment-cell__fill alignment-cell__fill--${s.strategicAlignment >= 80 ? 'green' : s.strategicAlignment >= 60 ? 'yellow' : 'red'}`}
                            style={{ height: `${s.strategicAlignment}%` }}
                          >
                            <span className={`alignment-cell__fill-label${s.strategicAlignment >= 20 ? ' alignment-cell__fill-label--visible' : ''}`}>{s.program}</span>
                          </div>
                        </div>
                        <span className="alignment-cell__label text-muted">{s.program}</span>
                        <span className="alignment-cell__val">{s.strategicAlignment}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <SectionState icon="📊" title="Belum ada data alignment" text="Data akan tersedia setelah program dikonfigurasi." compact />
                )}
              </div>

              <div className="section-block">
                <div className="section-header">
                  <div>
                    <h3 className="section-title">Risk per Program</h3>
                    <p className="section-subtitle">Aggregate risk score per program.</p>
                  </div>
                </div>
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Risk Score</th>
                      <th>Alignment</th>
                      <th>Health</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programs
                      .slice()
                      .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
                      .map(prog => (
                        <tr key={prog.id}
                          className={`gov-table__row${prog.id === selectedProgramId ? ' gov-table__row--active' : ''}`}
                          onClick={() => navigate(`/programs/${prog.id}`)}>
                          <td>
                            <div className="gov-table__name">
                              <span className="code-badge">{prog.code}</span>
                              <strong>{prog.name}</strong>
                            </div>
                          </td>
                          <td>
                            <span className={prog.riskScore >= 15 ? 'text-red fw-bold' : prog.riskScore >= 8 ? 'text-yellow fw-bold' : 'text-green fw-bold'}>
                              {prog.riskScore ?? 0}
                            </span>
                          </td>
                          <td>{prog.strategicAlignment ?? 0}%</td>
                          <td><HealthPill status={normalizeHealthStatus(prog.healthStatus)} /></td>
                          <td>{(() => { const d = getProgramDisplayStatus(prog); return <span className={`badge badge--${d.tone}`}>{d.label}</span> })()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>{/* end .programs-tab-content */}
        </div>
      </div>

      {/* ── Modal: Buat Program ───────────────────────────────────────── */}
      {(showCreateProgram || closingOverlay === 'create-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'create-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !cpSaving && closeCpModal()}
        >
          <div aria-describedby={createProgramDescId} aria-labelledby={createProgramTitleId} aria-modal="true" className="modal modal--wide" ref={createProgramDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="program-modal-head">
                <span className="program-modal-kicker">Pengaturan Program</span>
                <h3 className="modal__title program-modal-title" id={createProgramTitleId}>{cpStep === 1 ? 'Program Baru' : 'Dampak KPI'}</h3>
                <p className="program-modal-subtitle" id={createProgramDescId}>
                  {cpStep === 1
                    ? 'Rapikan identitas, status awal, dan rentang waktu agar program langsung terbaca jelas di roster.'
                    : 'Hubungkan program ke KPI APMS yang paling terdampak, atau tandai sebagai target internal bila belum ada referensi APMS.'}
                </p>
                <div className="program-modal-stepper">
                  {[1, 2].map(s => (
                    <span key={s} className={`program-modal-step${cpStep >= s ? ' program-modal-step--active' : ''}`} />
                  ))}
                  <span className="program-modal-step-label">
                    Langkah {cpStep} dari 2
                  </span>
                </div>
              </div>
              <button
                aria-label="Tutup"
                className="modal__close"
                disabled={cpSaving}
                onClick={closeCpModal}
                type="button"
              >
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
                  <path d="m1 1 10 10M11 1 1 11" />
                </svg>
              </button>
            </div>

            {/* ── Step 1: Identitas Program ── */}
            {cpStep === 1 && (
              <form onSubmit={submitCpStep1}>
                <div className="modal__body program-modal-body">
                  <section className="program-modal-section">
                    <div className="program-modal-section__intro">
                      <h4>Identitas inti</h4>
                      <p>Informasi ini akan tampil di roster portfolio dan halaman detail program.</p>
                    </div>
                    <div className="program-form-grid program-form-grid--title">
                      <div className="form-field">
                        <label>Kode <span className="form-field__required">*</span></label>
                        <input
                          maxLength={40}
                          minLength={3}
                          onChange={e => {
                            setCpCodeManuallyEdited(true)
                            setCpForm(f => ({ ...f, code: e.target.value.toUpperCase() }))
                          }}
                          placeholder="Auto-generate dari nama"
                          required
                          type="text"
                          value={cpForm.code}
                        />
                        <p className="form-field__hint">
                          {cpForm.code
                            ? <span className="form-field__hint--preview">{cpForm.code}</span>
                            : 'Otomatis terisi saat nama diketik'}
                        </p>
                      </div>
                      <div className="form-field">
                        <label>Nama Program <span className="form-field__required">*</span></label>
                        <input
                          maxLength={120}
                          minLength={3}
                          onChange={e => {
                            const name = e.target.value
                            const divisiCode = resolveDivisiCode(cpOwnerUnitId)
                            setCpForm(f => ({
                              ...f,
                              name,
                              code: cpCodeManuallyEdited ? f.code : suggestCode(name, divisiCode),
                            }))
                          }}
                          placeholder="Nama program"
                          required
                          type="text"
                          value={cpForm.name}
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Deskripsi</label>
                      <textarea
                        className="composer__input program-modal-textarea"
                        maxLength={400}
                        onChange={e => setCpForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Deskripsi singkat (opsional)"
                        rows={2}
                        value={cpForm.description}
                      />
                    </div>
                  </section>

                  <section className="program-modal-section">
                    <div className="program-modal-section__intro">
                      <h4>Ritme eksekusi</h4>
                      <p>Tetapkan prioritas dan target waktu agar progres bisa dimonitor sejak awal.</p>
                    </div>
                    <div className="form-field">
                      <label>Prioritas</label>
                      <select
                        className="form-input"
                        onChange={e => setCpForm(f => ({ ...f, priority: e.target.value }))}
                        value={cpForm.priority}
                      >
                        <option value="CRITICAL">Critical</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </div>
                    <div className="program-form-grid program-form-grid--equal">
                      <div className="form-field">
                        <label>Tanggal Mulai <span className="form-field__required">*</span></label>
                        <input
                          onChange={e => {
                            const newStart = e.target.value
                            setCpForm(f => {
                              // Re-validate: kalau targetEndDate sudah diisi dan
                              // sekarang start > end, clear targetEndDate supaya
                              // user explicit re-pilih. Mencegah submit dengan
                              // tanggal invalid yang lolos HTML5 min check saat
                              // urutan input start-after-end terjadi.
                              const next = { ...f, startDate: newStart }
                              if (next.targetEndDate && newStart && next.targetEndDate < newStart) {
                                next.targetEndDate = ''
                              }
                              return next
                            })
                          }}
                          required
                          type="date"
                          value={cpForm.startDate}
                        />
                      </div>
                      <div className="form-field">
                        <label>Target Selesai <span className="form-field__required">*</span></label>
                        <input
                          min={cpForm.startDate || undefined}
                          onChange={e => setCpForm(f => ({ ...f, targetEndDate: e.target.value }))}
                          required
                          type="date"
                          value={cpForm.targetEndDate}
                        />
                        {cpForm.startDate && cpForm.targetEndDate && cpForm.targetEndDate < cpForm.startDate && (
                          <p className="form-field__hint" style={{ color: 'var(--red)' }}>
                            Target Selesai harus setelah Tanggal Mulai.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Section ke-3: Konteks strategis & owner. Sebelumnya field-field
                      ini orphan (tanpa section header) langsung di-render setelah
                      Ritme eksekusi — bikin user bingung mana group apa. Section
                      explicit memberi struktur visual yang konsisten dengan 2 section
                      sebelumnya. */}
                  <section className="program-modal-section">
                    <div className="program-modal-section__intro">
                      <h4>Konteks strategis &amp; owner</h4>
                      <p>Pemetaan program ke pilar AGHRIS dan siapa yang bertanggung jawab. Bisa diubah nanti dari halaman detail.</p>
                    </div>
                    <div className="program-form-grid program-form-grid--equal">
                      <div className="form-field">
                        <label>Kelompok</label>
                        <select
                          className="form-input"
                          onChange={e => setCpForm(f => ({ ...f, kelompok: e.target.value }))}
                          value={cpForm.kelompok}
                        >
                          <option value="">— Pilih kelompok —</option>
                          <option value="SCORECARD">Scorecard</option>
                          <option value="NON_SCORECARD">Non Scorecard</option>
                        </select>
                      </div>
                      <div className="form-field">
                        <label>Pilar Strategis</label>
                        <select
                          className="form-input"
                          onChange={e => setCpForm(f => ({ ...f, pilarStrategis: e.target.value }))}
                          value={cpForm.pilarStrategis}
                        >
                          <option value="">— Pilih pilar —</option>
                          <option value="COLLECTING_MORE">Collecting More</option>
                          <option value="SPENDING_BETTER">Spending Better</option>
                          <option value="INNOVATIVE_FINANCING">Innovative Financing</option>
                          <option value="ENABLER">Program Enabler</option>
                        </select>
                      </div>
                    </div>

                  <div className="form-field">
                    <label>PIC Utama</label>
                    {cpUserDirectory.length === 0 ? (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          void api.get<{ data: Array<{ id: number; name: string; positionTitle?: string | null }> }>('/users/directory')
                            .then(r => setCpUserDirectory(r.data ?? []))
                            .catch((err) => console.error('[Atlas] Gagal memuat user directory (CP):', err))
                        }}
                        type="button"
                      >
                        Pilih PIC Utama…
                      </button>
                    ) : (
                      <select
                        className="form-input"
                        onChange={e => setCpOwnerId(Number(e.target.value))}
                        value={cpOwnerId ?? currentUser?.id ?? ''}
                      >
                        {cpUserDirectory.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name}{u.positionTitle ? ` — ${u.positionTitle}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {cpUnits.length > 0 && (
                    <div className="form-field">
                      <label>Divisi Pemilik</label>
                      <select
                        className="form-input"
                        onChange={e => {
                          const newId = e.target.value ? Number(e.target.value) : null
                          setCpOwnerUnitId(newId)
                          if (!cpCodeManuallyEdited && cpForm.name.trim()) {
                            const divisiCode = resolveDivisiCode(newId)
                            setCpForm(f => ({ ...f, code: suggestCode(f.name, divisiCode) }))
                          }
                        }}
                        value={cpOwnerUnitId ?? currentUser?.unit?.id ?? ''}
                      >
                        <option value="">— Auto (dari unit Anda) —</option>
                        {cpUnits.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.code} — {u.name}
                          </option>
                        ))}
                      </select>
                      <p className="form-field__hint">
                        Default: divisi Anda ({currentUser?.unit?.code ?? 'tidak diketahui'})
                      </p>
                    </div>
                  )}
                  </section>
                </div>
                <div className="modal__footer">
                  <button
                    className="btn btn--ghost"
                    disabled={cpSaving}
                    onClick={closeCpModal}
                    type="button"
                  >
                    Batal
                  </button>
                  <button
                    className="profile-save-btn"
                    disabled={!cpForm.code.trim() || !cpForm.name.trim() || !cpForm.startDate || !cpForm.targetEndDate}
                    type="submit"
                  >
                    Lanjut →
                  </button>
                </div>
              </form>
            )}

            {/* ── Step 2: KPI Impact ── */}
            {cpStep === 2 && (() => {
              const alreadyAdded = new Set(cpKpiCodes)
              const cpKpiResults = apmsKpis.filter(k =>
                !alreadyAdded.has(k.kode) &&
                (cpKpiSearch === '' || k.kode.toLowerCase().includes(cpKpiSearch.toLowerCase()) || k.nama.toLowerCase().includes(cpKpiSearch.toLowerCase()))
              ).slice(0, 8)
              return (
                <form onSubmit={submitCreateProgram}>
                  <div className="modal__body program-modal-body">
                    {cpError && (
                      <div className="program-modal-error">
                        {cpError}
                      </div>
                    )}
                    <section className="program-modal-section program-modal-section--soft">
                      <div className="program-modal-section__intro">
                        <h4>Pemetaan KPI</h4>
                        <p className="program-modal-copy">
                          Program <strong>{cpForm.name}</strong> ini berdampak ke KPI APMS yang mana?
                          Ini membantu melacak kontribusi program terhadap target AGHRIS.
                        </p>
                      </div>

                      {/* Mutually exclusive choice — radio group lebih akurat dari
                          checkbox optional. User pilih sumber KPI dulu, baru lihat
                          UI yang relevan (search atau note). */}
                      <div className="program-kpi-mode" role="radiogroup" aria-label="Sumber KPI program">
                        <label className={`program-kpi-mode__opt${!cpHasNoApmsKpi ? ' is-active' : ''}`}>
                          <input
                            type="radio"
                            name="kpi-mode"
                            checked={!cpHasNoApmsKpi}
                            onChange={() => setCpHasNoApmsKpi(false)}
                          />
                          <div className="program-kpi-mode__body">
                            <span className="program-kpi-mode__title">Hubungkan ke KPI APMS</span>
                            <span className="program-kpi-mode__hint">Pilih satu atau beberapa KPI APMS yang program ini dampak langsung.</span>
                          </div>
                        </label>
                        <label className={`program-kpi-mode__opt${cpHasNoApmsKpi ? ' is-active' : ''}`}>
                          <input
                            type="radio"
                            name="kpi-mode"
                            checked={cpHasNoApmsKpi}
                            onChange={() => {
                              setCpHasNoApmsKpi(true)
                              setCpKpiCodes([])
                            }}
                          />
                          <div className="program-kpi-mode__body">
                            <span className="program-kpi-mode__title">Set KPI internal sendiri</span>
                            <span className="program-kpi-mode__hint">Program tidak punya referensi di APMS — definisikan target internal nanti.</span>
                          </div>
                        </label>
                      </div>

                      {!cpHasNoApmsKpi && (
                        <div className="prog-kpi-picker">
                          <input
                            className="kpi-link-input"
                            type="text"
                            placeholder="Cari KPI APMS berdasarkan kode atau nama…"
                            value={cpKpiSearch}
                            onChange={e => { setCpKpiSearch(e.target.value); setCpKpiDropdownOpen(true) }}
                            onFocus={() => setCpKpiDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setCpKpiDropdownOpen(false), 150)}
                            autoComplete="off"
                          />
                          {cpKpiDropdownOpen && cpKpiResults.length > 0 && (
                            <div className="prog-kpi-dropdown">
                              {cpKpiResults.map(k => (
                                <button
                                  key={k.kode}
                                  type="button"
                                  className="prog-kpi-dropdown__item"
                                  onMouseDown={() => {
                                    setCpKpiCodes(prev => [...prev, k.kode])
                                    setCpKpiSearch('')
                                    setCpKpiDropdownOpen(false)
                                  }}
                                >
                                  <span className="code-badge prog-kpi-dropdown__code">{k.kode}</span>
                                  <span className="prog-kpi-dropdown__name">{k.nama}</span>
                                  <span className="prog-kpi-dropdown__weight">bobot {k.bobot}%</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {cpKpiDropdownOpen && cpKpiSearch.length > 0 && cpKpiResults.length === 0 && (
                            <div className="prog-kpi-dropdown prog-kpi-dropdown--empty">
                              Tidak ada KPI yang cocok.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="program-modal-selection-meta">
                        <span>{cpKpiCodes.length} KPI dipilih</span>
                        {!cpHasNoApmsKpi && <span>Pilih minimal 1 KPI utama sebelum membuat program.</span>}
                      </div>

                      {cpKpiCodes.length > 0 ? (
                        <div className="program-kpi-chip-list">
                          {cpKpiCodes.map(code => {
                            const meta = apmsKpis.find(k => k.kode === code)
                            return (
                              <span key={code} className="program-kpi-chip">
                                <span className="code-badge program-kpi-chip__code">{code}</span>
                                {meta && <span className="program-kpi-chip__name">{meta.nama.slice(0, 30)}{meta.nama.length > 30 ? '…' : ''}</span>}
                                <button
                                  type="button"
                                  className="program-kpi-chip__remove"
                                  onClick={() => setCpKpiCodes(prev => prev.filter(c => c !== code))}
                                >×</button>
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="program-modal-empty">
                          Belum ada KPI terpilih. Gunakan pencarian di atas untuk menghubungkan KPI APMS yang paling relevan.
                        </div>
                      )}
                    </section>

                    {cpHasNoApmsKpi && (
                      <div className="program-kpi-note">
                        Setelah program dibuat, definisikan KPI internal dari tab <strong>KPI APMS</strong> di halaman detail.
                      </div>
                    )}
                  </div>
                  <div className="modal__footer">
                    <button
                      className="btn btn--ghost"
                      disabled={cpSaving}
                      onClick={() => setCpStep(1)}
                      type="button"
                    >
                      ← Kembali
                    </button>
                    <button
                      className="profile-save-btn"
                      disabled={cpSaving || (!cpHasNoApmsKpi && cpKpiCodes.length === 0)}
                      type="submit"
                    >
                      {cpSaving ? 'Menyimpan…' : 'Buat Program'}
                    </button>
                  </div>
                </form>
              )
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ── Archive tab ─────────────────────────────────────────────────────── */}
      {tab === 'archive' && (
        <div className="view-tab-body">
          <div className="section-block">
            <div className="section-header">
              <div>
                <h3 className="section-title">Program Diarsipkan</h3>
                <p className="section-subtitle">Program yang telah diarsipkan. Data tetap utuh dan dapat dipulihkan kapan saja.</p>
              </div>
              <span className="section-badge">{archivedPrograms.length} program</span>
            </div>
            {archivedLoading ? (
              <SkeletonStack lines={[90, 75, 60]} />
            ) : archivedError ? (
              <div className="roadmap-empty roadmap-empty--error" role="alert">
                <p className="text-sm">Gagal memuat program arsip.</p>
                <p className="text-xs text-muted">{archivedError}</p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={loadArchivedPrograms}>
                  Coba lagi
                </button>
              </div>
            ) : archivedPrograms.length === 0 ? (
              <SectionState
  tone="info"
  icon={
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </svg>
  }
  title="Tidak ada arsip"
  text="Belum ada program yang diarsipkan."
/>
            ) : (
              <div className="program-roster">
                {archivedPrograms.map(prog => (
                  <div key={prog.id} className="list-row list-row--archived">
                    <div className="program-row__main program-row__main--static">
                      <div className="program-row__identity">
                        <span className="code-badge program-row__code">{prog.code}</span>
                        <div className="program-row__info">
                          <strong>{prog.name}</strong>
                          <div className="program-row__meta">
                            <span className="program-row__meta-primary">{prog.workstreamCount} workstream</span>
                            <span className="program-row__meta-sep">•</span>
                            <span className="program-row__meta-primary">
                              Diarsipkan {new Date(prog.archivedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {prog.archivedByName ? ` oleh ${prog.archivedByName}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn--ghost archive-restore-btn"
                      onClick={() => setRestoreTarget({ id: prog.id, name: prog.name })}
                      type="button"
                    >
                      Pulihkan
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Edit Program ────────────────────────────────────────────── */}
      {(!!editProgram || closingOverlay === 'edit-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'edit-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !epSaving && closeEditProgram()}
        >
          <div aria-labelledby={editProgramTitleId} aria-modal="true" className="modal" ref={editProgramDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={editProgramTitleId}>Edit Program</h3>
                <p className="modal-subtitle">Perbarui detail program. Perubahan langsung tersimpan.</p>
              </div>
              <button aria-label="Tutup" className="modal__close" disabled={epSaving} onClick={closeEditProgram} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            {editProgram && (
              <form onSubmit={(e) => void submitEditProgram(e)}>
                <div className="modal__body">
                  {epError && <div className="prog-modal-error">{epError}</div>}
                  <div className="form-field">
                    <label>Nama Program <span className="form-field__required">*</span></label>
                    <input autoFocus maxLength={120} minLength={3} onChange={e => setEditProgram(p => p ? { ...p, name: e.target.value } : p)} required type="text" value={editProgram.name} />
                  </div>
                  <div className="form-field">
                    <label>Deskripsi</label>
                    <textarea className="composer__input prog-modal-textarea" maxLength={400} onChange={e => setEditProgram(p => p ? { ...p, description: e.target.value } : p)} rows={2} value={editProgram.description} />
                  </div>
                  {editProgram.approvalStatus === 'ACTIVE' && (
                    <div className="form-field">
                      <label>Status operasional</label>
                      <select className="form-input" onChange={e => setEditProgram(p => p ? { ...p, status: e.target.value } : p)} value={editProgram.status}>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="ON_HOLD">On Hold</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>
                  )}
                  <div className="form-field">
                    <label>Prioritas</label>
                    <select className="form-input" onChange={e => setEditProgram(p => p ? { ...p, priority: e.target.value } : p)} value={editProgram.priority}>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                  <div className="prog-form-grid prog-form-grid--equal">
                    <div className="form-field">
                      <label>Tanggal Mulai</label>
                      <input onChange={e => setEditProgram(p => p ? { ...p, startDate: e.target.value } : p)} type="date" value={editProgram.startDate} />
                    </div>
                    <div className="form-field">
                      <label>Target Selesai</label>
                      <input onChange={e => setEditProgram(p => p ? { ...p, targetEndDate: e.target.value } : p)} type="date" value={editProgram.targetEndDate} />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>PIC Utama</label>
                    {epDirLoading ? (
                      <p className="form-hint text-muted">Memuat direktori pengguna…</p>
                    ) : epUserDirectory.length === 0 ? (
                      <p className="form-hint text-muted">Gagal memuat direktori pengguna.</p>
                    ) : (
                      <UserPicker
                        currentUserId={currentUser?.id}
                        onChange={id => setEditProgram(p => p ? { ...p, ownerId: id } : p)}
                        options={epUserDirectory}
                        placeholder="Pilih PIC Utama…"
                        value={editProgram.ownerId ?? currentUser?.id ?? null}
                      />
                    )}
                  </div>

                  <div className="prog-form-grid prog-form-grid--equal">
                    <div className="form-field">
                      <label>Kelompok</label>
                      <select
                        className="form-input"
                        onChange={e => setEditProgram(p => p ? { ...p, kelompok: e.target.value } : p)}
                        value={editProgram.kelompok}
                      >
                        <option value="">— Pilih kelompok —</option>
                        <option value="SCORECARD">Scorecard</option>
                        <option value="NON_SCORECARD">Non Scorecard</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Pilar Strategis</label>
                      <select
                        className="form-input"
                        onChange={e => setEditProgram(p => p ? { ...p, pilarStrategis: e.target.value } : p)}
                        value={editProgram.pilarStrategis}
                      >
                        <option value="">— Pilih pilar —</option>
                        <option value="COLLECTING_MORE">Collecting More</option>
                        <option value="SPENDING_BETTER">Spending Better</option>
                        <option value="INNOVATIVE_FINANCING">Innovative Financing</option>
                        <option value="ENABLER">Program Enabler</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Progres Terkini</label>
                    <textarea
                      className="composer__input prog-modal-textarea"
                      maxLength={2000}
                      onChange={e => setEditProgram(p => p ? { ...p, progresTerkini: e.target.value } : p)}
                      placeholder="Apa yang sudah diselesaikan atau sedang berjalan?"
                      rows={3}
                      value={editProgram.progresTerkini}
                    />
                  </div>

                  <div className="form-field">
                    <label>Dukungan yang Dibutuhkan</label>
                    <textarea
                      className="composer__input prog-modal-textarea"
                      maxLength={2000}
                      onChange={e => setEditProgram(p => p ? { ...p, dukunganDibutuhkan: e.target.value } : p)}
                      placeholder="Dukungan, eskalasi, atau keputusan yang diperlukan"
                      rows={2}
                      value={editProgram.dukunganDibutuhkan}
                    />
                  </div>
                </div>
                <div className="modal__footer">
                  <button className="btn btn--ghost" disabled={epSaving} onClick={closeEditProgram} type="button">Batal</button>
                  <button className="profile-save-btn" disabled={epSaving || !editProgram.name.trim()} type="submit">
                    {epSaving ? 'Menyimpan…' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal: Konfirmasi Archive ─────────────────────────────────────── */}
      {(!!archiveTarget || closingOverlay === 'archive-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'archive-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !archiveSaving && closeArchiveModal()}
        >
          <div aria-labelledby={archiveTitleId} aria-modal="true" className="modal modal--warning" ref={archiveDialogRef} role="alertdialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={archiveTitleId}>Arsipkan Program?</h3>
              </div>
            </div>
            <div className="modal__body">
              {archiveError && <div className="prog-modal-error">{archiveError}</div>}
              <div className="confirm-warning-box">
                <svg className="confirm-warning-box__icon" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                <div>
                  <p className="confirm-warning-box__title">Program ini akan disembunyikan dari semua tampilan.</p>
                  <p className="confirm-warning-box__body">
                    <strong>{archiveTarget?.name}</strong> dan seluruh workstream, task, serta data terkaitnya <em>tidak dihapus</em> — hanya diarsipkan. Superadmin dan KADIV dapat memulihkannya kapan saja.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" disabled={archiveSaving} onClick={closeArchiveModal} type="button">Batal</button>
              <button className="btn btn--danger" disabled={archiveSaving} onClick={() => void submitArchive()} type="button">
                {archiveSaving ? 'Mengarsipkan…' : 'Ya, Arsipkan'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal: Konfirmasi Restore ─────────────────────────────────────── */}
      {(!!restoreTarget || closingOverlay === 'restore-program') && createPortal(
        <div
          className={`modal-backdrop${closingOverlay === 'restore-program' ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !restoreSaving && closeRestoreModal()}
        >
          <div aria-labelledby={restoreTitleId} aria-modal="true" className="modal" ref={restoreDialogRef} role="alertdialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={restoreTitleId}>Pulihkan Program?</h3>
              </div>
            </div>
            <div className="modal__body">
              {restoreError && <div className="prog-modal-error">{restoreError}</div>}
              <p>Program <strong>{restoreTarget?.name}</strong> akan dipulihkan dan kembali muncul di semua tampilan.</p>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" disabled={restoreSaving} onClick={closeRestoreModal} type="button">Batal</button>
              <button className="profile-save-btn" disabled={restoreSaving} onClick={() => void submitRestore()} type="button">
                {restoreSaving ? 'Memulihkan…' : 'Ya, Pulihkan'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Kebab dropdown + backdrop — di-render via portal ke document.body
          agar tidak ter-clip oleh overflow:hidden/auto di ancestor mana pun */}
      </div>
      {showBatchExport && createPortal(
        <div
          className="modal-backdrop"
          onClick={() => !batchExporting && closeBatchExport()}
        >
          <div
            ref={batchDialogRef}
            className="modal batch-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={batchTitleId}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={batchTitleId}>Export Charter PPTX</h3>
                <p className="modal__subtitle">
                  Pilih beberapa program — 1 file PPTX, 1 slide per program.
                </p>
              </div>
              <button
                type="button"
                className="modal__close"
                onClick={closeBatchExport}
                disabled={batchExporting}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <div className="modal__body">
              <input
                type="search"
                className="form-input batch-export__search"
                placeholder="Cari kode atau nama program…"
                value={batchSearch}
                onChange={e => setBatchSearch(e.target.value)}
                disabled={batchExporting}
                autoFocus
              />
              <div className="batch-export__list">
                <label className="batch-export__row batch-export__row--head">
                  <input
                    type="checkbox"
                    checked={batchAllVisibleSelected}
                    onChange={toggleBatchAll}
                    disabled={batchExporting || batchFilteredPrograms.length === 0}
                    aria-label="Pilih semua program yang terlihat"
                  />
                  <span className="batch-export__head-label">
                    {batchAllVisibleSelected ? 'Bersihkan' : 'Pilih semua'}
                    {' '}({batchFilteredPrograms.length})
                  </span>
                  <span className="batch-export__head-counter">
                    {batchSelectedIds.size} dipilih
                  </span>
                </label>
                {batchFilteredPrograms.length === 0 ? (
                  <div className="batch-export__empty">
                    {batchSearch
                      ? `Tidak ada program yang cocok dengan "${batchSearch}".`
                      : 'Belum ada program.'}
                  </div>
                ) : batchFilteredPrograms.map(p => {
                  const selected = batchSelectedIds.has(p.id)
                  return (
                    <label key={p.id} className={`batch-export__row${selected ? ' batch-export__row--selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleBatchOne(p.id)}
                        disabled={batchExporting}
                      />
                      <span className="batch-export__code">{p.code}</span>
                      <span className="batch-export__name">{p.name}</span>
                      <span className={`batch-export__health batch-export__health--${normalizeHealthStatus(p.healthStatus).toLowerCase()}`}>
                        {healthStatusLabel(normalizeHealthStatus(p.healthStatus))}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="modal__footer">
              {batchError && (
                <span className="batch-export__error" role="alert">{batchError}</span>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeBatchExport}
                disabled={batchExporting}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleBatchExport}
                disabled={batchSelectedIds.size === 0 || batchExporting}
              >
                {batchExporting
                  ? `Menyiapkan ${batchSelectedIds.size} program…`
                  : batchSelectedIds.size === 0
                    ? 'Pilih minimal 1 program'
                    : `Export ${batchSelectedIds.size} program →`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {kebabMenu !== null && createPortal(
        <>
          <div className="kebab-close-backdrop" onClick={closeKebab} />
          <div
            className="program-row__kebab-menu"
            style={{ position: 'fixed', top: kebabMenu.top, right: kebabMenu.right, zIndex: 9001 }}
            onClick={e => e.stopPropagation()}
          >
            {roleAccess.canEditProgram(kebabMenu.isOwner) && (
              <button className="kebab-menu__item" onClick={() => { openEditProgram(kebabMenu.prog); closeKebab() }} type="button">
                <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><path d="M11.5 2.5a2.121 2.121 0 1 1 3 3L6 14H2v-4L11.5 2.5Z"/></svg>
                Edit
              </button>
            )}
            {roleAccess.canArchiveProgram(kebabMenu.isOwner) && (
              <button className="kebab-menu__item kebab-menu__item--danger" onClick={() => { setArchiveTarget({ id: kebabMenu.progId, name: kebabMenu.progName }); closeKebab() }} type="button">
                <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><rect height="3" rx="0.5" width="12" x="2" y="2"/><path d="M3.5 5v8a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5M6.5 8h3"/></svg>
                Arsipkan
              </button>
            )}
          </div>
        </>,
        document.body
      )}
      <toast.View />
    </div>
  )
}

export default ProgramsView
