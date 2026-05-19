import React, { useState, useEffect, useCallback, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import { usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { api, ApiRequestError, extractErrorMessage } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { formatKpiValue, getKpiFillPercent } from '../lib/kpi'
import { periodToLabel, currentIsoWeek, currentMonth, isIsoWeek } from '../lib/periodFormat'
import { useDarkMode } from '../lib/useDarkMode'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { sc as colors } from '../lib/statusColors'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { EscalationButton } from '../components/Escalation'
import { TraceStrip, type TraceNode } from '../components/TraceStrip'
import { DraftStatusBadge } from '../components/DraftStatusBadge'
import { DraftRestoreBanner } from '../components/DraftRestoreBanner'
import { useAutoSave } from '../hooks/useAutoSave'
import {
  Avatar,
  HealthPill,
  Metric,
  SectionState,
  SkeletonBlock,
  SkeletonStack,
  formatRelativeTime,
} from '../components/ui'
import type { ProgramDetail, ProgramKpiLink } from '../types'
import { ExecutionTab } from '../components/ExecutionTab'
import { TaskPlanningPanel } from './TaskPlanningPanel'
import { getProgramDisplayStatus } from '../lib/programStatus'
import './ProgramDetailView.css'

// ── Icon bank (inline SVG) ─────────────────────────────────────────────────
const PIcon = {
  calendar: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16" width="13"><rect height="11" rx="1.5" width="12" x="2" y="3"/><path d="M5 1.5v3M11 1.5v3M2 7h12"/></svg>,
  activity: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><path d="M1.5 8h3l2-5 3 10 2-5h3"/></svg>,
  wifi:     <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="11"><path d="M2 5.5C3.5 4 5.5 3 8 3s4.5 1 6 2.5"/><path d="M4 8c1-1 2.5-1.5 4-1.5s3 0.5 4 1.5"/><circle cx="8" cy="11" fill="currentColor" r="1.2"/></svg>,
  chart:    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><rect height="7" rx="1" width="3" x="1.5" y="7"/><rect height="11" rx="1" width="3" x="6.5" y="3"/><rect height="5" rx="1" width="3" x="11.5" y="9"/></svg>,
  chevron:  <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 10 6" width="10"><path d="M1 1l4 4 4-4"/></svg>,
  info:     <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><circle cx="8" cy="8" r="6.5"/><path d="M8 11.5V7M8 5v.5"/></svg>,
  sparkle:  <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="11"><path d="M7 1.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2 1.2-3.3z"/></svg>,
  user:     <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><circle cx="8" cy="5.5" r="2.5"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/></svg>,
  layers:   <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><path d="M8 1.5 1.5 5 8 8.5 14.5 5 8 1.5z"/><path d="M1.5 9.5 8 13l6.5-3.5"/><path d="M1.5 12 8 15.5l6.5-3.5"/></svg>,
  blocker:  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><circle cx="8" cy="8" r="5.5"/><path d="m4.1 4.1 7.8 7.8"/></svg>,
  alert:    <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><path d="M8 2 1.5 13.5h13L8 2z"/><path d="M8 6.5v3.5M8 11.7v.3"/></svg>,
  kpi:      <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><path d="M2 12 6 7l3 3 5-6"/><circle cx="14" cy="4" r="1.5" fill="currentColor" stroke="none"/></svg>,
  chat:     <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><path d="M14 10a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/></svg>,
  grid:     <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13"><rect height="5.5" rx="1" width="5.5" x="1.5" y="1.5"/><rect height="5.5" rx="1" width="5.5" x="9" y="1.5"/><rect height="5.5" rx="1" width="5.5" x="1.5" y="9"/><rect height="5.5" rx="1" width="5.5" x="9" y="9"/></svg>,
}

// ── Sidebar collapse localStorage ──────────────────────────────────────────
const PROG_SIDEBAR_KEY = 'prog.sidebarCollapsed.v1'
function loadProgSidebar(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(PROG_SIDEBAR_KEY) ?? '{}') } catch { return {} }
}
function saveProgSidebar(s: Record<string, boolean>) {
  try { localStorage.setItem(PROG_SIDEBAR_KEY, JSON.stringify(s)) } catch {}
}

// ── Helpers ────────────────────────────────────────────────────────────────

const daysUntil = (dateStr: string): number => {
  const now = new Date()
  const d = new Date(dateStr)
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}

const formatDaysLabel = (days: number): { label: string; color: string; tone: 'critical' | 'warning' | 'notice' | 'muted' } => {
  if (days < 0) return { label: `${Math.abs(days)} hari overdue`, color: 'var(--red)', tone: 'critical' }
  if (days === 0) return { label: 'Hari ini', color: 'var(--yellow)', tone: 'warning' }
  if (days <= 7) return { label: `${days} hari lagi`, color: 'var(--yellow)', tone: 'warning' }
  if (days <= 30) return { label: `${days} hari lagi`, color: 'var(--blue)', tone: 'notice' }
  return { label: `${days} hari lagi`, color: 'var(--text-muted)', tone: 'muted' }
}

const fmtDateShort = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}


type DetailTab = 'ringkasan' | 'workstream' | 'execution' | 'blocker' | 'kpi' | 'diskusi'

type PulseBlocker = {
  id: number; severity: string; title: string; daysOpen: number
  task: {
    id: number; title: string
    workstream: { name: string; program: { id: number } }
  }
}

type WorkstreamRow = {
  id: number; name: string; status: string; priority: string
  startDate: string | null; targetCompletion: string
  description?: string; picPersonIds?: number[]; primaryPicPersonId?: number | null
  picPersons?: Array<{ id: number; name: string }>
  budgetIdr?: number | null
  budgetSpent?: number | null
}

type TaskItem = {
  id: number; code: string; title: string; status: string; percentComplete: number; phaseId: number | null
  startDate?: string | null; targetCompletion?: string; priority?: string
  isBlocked?: boolean
  output?: string | null
  description?: string | null
  picPersons?: Array<{ id: number; name: string }>
}

type PhaseItem = {
  id: number; code: string; order: number; name: string; status: string; tasks: TaskItem[]
}

type WorkstreamDetail = {
  id: number; name: string; status: string
  startDate?: string | null; targetCompletion?: string; description?: string
  primaryPicPersonId?: number | null
  picPersons?: Array<{ id: number; name: string }>
  phases: PhaseItem[]
  tasks: TaskItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Penanggung Jawab chip untuk task row di tab Struktur. Tampilkan avatar
 * inisial + nama (truncate). Saat task belum di-assign, tampilkan placeholder
 * muted dengan icon — bukan space kosong — supaya user tahu actionable.
 * +N badge ringkas kalau ada multiple penanggung jawab. Vocab "Penanggung
 * jawab" konsisten dengan field di planning panel (bukan "PIC").
 */
function TaskPicChip({ picPersons }: { picPersons?: Array<{ id: number; name: string }> }) {
  const list = picPersons ?? []
  if (list.length === 0) {
    return (
      <span className="wi-row__pic wi-row__pic--empty" title="Belum ada penanggung jawab">
        <svg aria-hidden="true" fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 12 12" width="11">
          <circle cx="6" cy="4" r="2"/>
          <path d="M2.5 10c.6-1.8 2-2.6 3.5-2.6S9 8.2 9.5 10"/>
        </svg>
        <span className="wi-row__pic-name">Belum ditugaskan</span>
      </span>
    )
  }
  const primary = list[0]
  const extra = list.length - 1
  const initials = primary.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <span
      className="wi-row__pic"
      title={`Penanggung jawab: ${list.map(p => p.name).join(', ')}`}
    >
      <span className="wi-row__pic-avatar" aria-hidden="true">{initials}</span>
      <span className="wi-row__pic-name">{primary.name}</span>
      {extra > 0 && <span className="wi-row__pic-extra">+{extra}</span>}
    </span>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export function ProgramDetailView() {
  const page = usePage<{ program?: { id: number } }>()
  const numId = Number(page.props.program?.id)
  const navigate = useInertiaNavigate()
  const {
    programs, currentUser, apmsKpis, apmsLastFetchedAt, refreshApmsKpis,
    normalizeHealthStatus, formatStatusLabel,
    loadOverview, channels,
  } = useWorkspace()
  const roleAccess = useRoleAccess()
  const dark = useDarkMode()
  const C = colors(dark)
  const SEV_COLOR: Record<string, { bg: string; fg: string }> = {
    CRITICAL: { bg: C.RED.bg,    fg: C.RED.fg },
    HIGH:     { bg: C.YELLOW.bg, fg: C.YELLOW.fg },
    MEDIUM:   { bg: C.YELLOW.bg, fg: C.YELLOW.fg },
    LOW:      { bg: C.GRAY.bg,   fg: C.GRAY.fg },
  }

  // Program summary (for owner/channel/messageCount not in ProgramDetail type)
  const programSummary = programs.find(p => p.id === numId) ?? null

  // ── Sidebar collapse state ────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState<Record<string, boolean>>(() => loadProgSidebar())
  const toggleSidebar = (key: string) => {
    setSidebarCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      saveProgSidebar(next)
      return next
    })
  }

  // ── Global toast ─────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const showToast = (msg: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ msg, tone })
    toastTimerRef.current = window.setTimeout(() => setToast(null), tone === 'error' ? 3200 : 2200)
  }
  const extractErr = (err: unknown, fallback: string): string =>
    err instanceof Error ? err.message : (typeof err === 'string' ? err : fallback)

  // ── Detail data ───────────────────────────────────────────────────────
  const [detail, setDetail] = useState<ProgramDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDetail = async (silent = false) => {
    if (!numId) return
    if (!silent) setLoading(true)
    try {
      const res = await api.get<{ data: ProgramDetail }>(`/programs/${numId}`)
      setDetail(res.data)
    } catch { /* no-op */ } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { void loadDetail() }, [numId])

  // ── Approval Log ─────────────────────────────────────────────────────
  type ApprovalLogEntry = {
    id: number; action: string; fromStatus: string | null; toStatus: string
    byUserName: string | null; note: string | null; createdAt: string
  }
  const [approvalLog, setApprovalLog] = useState<ApprovalLogEntry[]>([])
  const [approvalLogLoading, setApprovalLogLoading] = useState(false)
  const [approvalLogExpanded, setApprovalLogExpanded] = useState(false)
  const loadApprovalLog = useCallback(async () => {
    if (!numId) return
    setApprovalLogLoading(true)
    try {
      const res = await api.get<{ data: ApprovalLogEntry[] }>(`/programs/${numId}/approval-log`)
      setApprovalLog(res.data ?? [])
    } catch { /* no-op */ } finally {
      setApprovalLogLoading(false)
    }
  }, [numId])

  // ── Progress Log ──────────────────────────────────────────────────────
  type ProgressLogEntry = {
    id: number
    programId: number
    period: string
    healthAtTime: 'on_track' | 'at_risk' | 'terlambat' | 'overdue'
    narrative: string
    kendala: string | null
    correctiveAction: string | null
    nextStep: string | null
    dukunganDibutuhkan: string | null
    createdById: number
    createdByName: string | null
    createdAt: string
  }
  const [progressLog, setProgressLog] = useState<ProgressLogEntry[]>([])
  const [progressLogLoading, setProgressLogLoading] = useState(false)
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [progressForm, setProgressForm] = useState<{
    period: string
    healthAtTime: ProgressLogEntry['healthAtTime']
    narrative: string
    kendala: string
    correctiveAction: string
    nextStep: string
    dukunganDibutuhkan: string
  }>({
    period: currentIsoWeek(),
    healthAtTime: 'on_track',
    narrative: '',
    kendala: '',
    correctiveAction: '',
    nextStep: '',
    dukunganDibutuhkan: '',
  })
  const [progressFormSaving, setProgressFormSaving] = useState(false)

  // Sprint 6 — Autosave draft Progress Log. formKey unik per program. Subscribe
  // ke 'program:changed' supaya kalau SSE picu reload detail, draft di-flush
  // dulu (jangan sampai user kehilangan tulisan saat realtime update masuk).
  const progressDraft = useAutoSave({
    formKey: `program:${numId}:progressLog`,
    state: progressForm,
    enabled: showProgressForm && Number.isFinite(numId),
    entityType: 'Program',
    entityId: Number.isFinite(numId) ? numId : undefined,
    flushOnSSEEvents: ['program:changed'],
  })

  // Mode periode: 'week' default (DKMR PDF dominan minggu-ke-N), 'month' fallback
  // untuk program dengan reporting bulanan. Auto-sync ke progressForm.period saat
  // ganti mode (current week ↔ current month).
  const [periodMode, setPeriodMode] = useState<'week' | 'month'>('week')
  // Composite Weekly Update — KPI aktual yang dimasukkan bareng progress log.
  // Map kpiId → string input value. Saat submit progress log, parallel POST
  // ke /kpis/{id}/values untuk setiap entry yang nilainya non-empty.
  const [weeklyKpiActuals, setWeeklyKpiActuals] = useState<Record<number, string>>({})
  const [weeklyKpiErrors, setWeeklyKpiErrors] = useState<string[]>([])

  // Derive measurementDate (YYYY-MM-DD, Jumat = end-of-work-week) dari ISO week
  // string "YYYY-Www". Fallback: hari ini.
  const isoWeekToFridayDate = (period: string): string => {
    const m = period.match(/^(\d{4})-W(\d{1,2})$/)
    if (!m) return new Date().toISOString().slice(0, 10)
    const year = parseInt(m[1], 10)
    const week = parseInt(m[2], 10)
    const jan4 = new Date(year, 0, 4)
    const jan4IsoDay = ((jan4.getDay() + 6) % 7) + 1 // 1=Mon..7=Sun
    const w01Mon = new Date(year, 0, 4 - jan4IsoDay + 1)
    const friday = new Date(w01Mon)
    friday.setDate(w01Mon.getDate() + (week - 1) * 7 + 4)
    return friday.toISOString().slice(0, 10)
  }

  const loadProgressLog = useCallback(async () => {
    setProgressLogLoading(true)
    try {
      const res = await api.get<{ data: ProgressLogEntry[] }>(`/programs/${numId}/progress-log`)
      setProgressLog(res.data ?? [])
    } finally {
      setProgressLogLoading(false)
    }
  }, [numId])

  const submitProgressLog = async () => {
    if (!progressForm.narrative.trim()) return
    setProgressFormSaving(true)
    setWeeklyKpiErrors([])
    try {
      // (0) Flush draft autosave dulu — defensif kalau ada save sedang in-flight,
      //     pastikan server snapshot terkini sebelum kita commit.
      await progressDraft.flush()

      // (1) Save progress log — narrative + PICA fields. Wajib sukses lebih
      //     dulu karena ini source of truth weekly update.
      const res = await api.post<{ data: ProgressLogEntry }>(`/programs/${numId}/progress-log`, progressForm)
      // Progress log sudah di DB — buang draft. Idempotent, aman walaupun
      // belum ada draft (mis. user submit langsung tanpa autosave kena debounce).
      await progressDraft.discard()
      setProgressLog(prev => {
        const existing = prev.findIndex(e => e.period === res.data.period)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = res.data
          return updated
        }
        return [res.data, ...prev]
      })

      // (2) Save KPI actuals (kalau ada yang diisi). Parallel POST per KPI.
      //     Kegagalan per-KPI di-collect sebagai partial error, tidak rollback
      //     progress log karena bedanya audit trail vs measurement.
      const kpiEntries = Object.entries(weeklyKpiActuals)
        .filter(([, v]) => v.trim() !== '' && !Number.isNaN(Number(v)))
      if (kpiEntries.length > 0) {
        const measurementDate = isoWeekToFridayDate(progressForm.period)
        const settled = await Promise.allSettled(kpiEntries.map(([kpiId, value]) =>
          api.post(`/kpis/${kpiId}/values`, {
            measurementDate,
            actualValue: Number(value),
          })
        ))
        const failed = settled
          .map((r, i) => ({ r, kpiId: kpiEntries[i][0] }))
          .filter(({ r }) => r.status === 'rejected')
          .map(({ kpiId, r }) => {
            const kpi = (detail?.kpis ?? []).find(k => String(k.id) === kpiId)
            const label = kpi?.name ?? `KPI #${kpiId}`
            const msg = (r as PromiseRejectedResult).reason instanceof Error
              ? (r as PromiseRejectedResult).reason.message
              : 'gagal menyimpan'
            return `${label}: ${msg}`
          })
        if (failed.length > 0) {
          setWeeklyKpiErrors(failed)
          // Tetap close form? Tidak — biar user lihat error + retry. Tapi
          // progress log sudah tersimpan, jadi clear narrative dst.
          await loadDetail(true)
          setProgressForm(f => ({ ...f, narrative: '', kendala: '', correctiveAction: '', nextStep: '', dukunganDibutuhkan: '' }))
          return
        }
        // Semua KPI sukses → reload detail untuk refresh actualValue +
        // overview untuk refresh workspace programs[id].healthStatus (BE
        // auto-recompute health setelah simpan actual value via
        // ProgramHealthService).
        await Promise.all([loadDetail(true), loadOverview('refresh')])
      } else {
        // Tidak ada KPI value disimpan, tapi progress log sukses — refresh
        // overview untuk update progresTerkini di program summary.
        await loadOverview('refresh')
      }

      setShowProgressForm(false)
      setProgressForm(f => ({ ...f, narrative: '', kendala: '', correctiveAction: '', nextStep: '', dukunganDibutuhkan: '' }))
      setWeeklyKpiActuals({})
    } finally {
      setProgressFormSaving(false)
    }
  }

  // ── KPI APMS Links ────────────────────────────────────────────────────
  const [kpiLinks, setKpiLinks] = useState<ProgramKpiLink[]>([])
  const [kpiLinkSearch, setKpiLinkSearch] = useState('')
  const [kpiLinkDropdownOpen, setKpiLinkDropdownOpen] = useState(false)
  const [kpiLinkSaving, setKpiLinkSaving] = useState(false)
  const [kpiLinkError, setKpiLinkError] = useState<string | null>(null)
  const [showKpiInternalForm, setShowKpiInternalForm] = useState(false)
  const [kpiInternal, setKpiInternal] = useState({ name: '', targetValue: '', unitOfMeasure: '', reviewFrequency: 'MONTHLY' })
  const [kpiInternalSaving, setKpiInternalSaving] = useState(false)
  const [kpiInternalError, setKpiInternalError] = useState<string | null>(null)
  // Edit state — saat user klik pencil di KPI row. Form fields shared dengan
  // create flow (kpiInternal), tapi submit via PATCH /kpis/{id} bukan POST.
  const [editingKpiId, setEditingKpiId] = useState<number | null>(null)
  const [recordingKpiId, setRecordingKpiId] = useState<number | null>(null)
  const [kpiActual, setKpiActual] = useState({ measurementDate: new Date().toISOString().slice(0, 10), actualValue: '', statusNotes: '' })
  const [kpiActualSaving, setKpiActualSaving] = useState(false)
  const [kpiActualError, setKpiActualError] = useState<string | null>(null)

  const loadKpiLinks = useCallback(async () => {
    if (!numId) return
    try {
      const res = await api.get<{ data: ProgramKpiLink[] }>(`/programs/${numId}/kpi-links`)
      setKpiLinks(res.data ?? [])
    } catch { /* no-op */ }
  }, [numId])

  useEffect(() => { void loadKpiLinks() }, [loadKpiLinks])

  const addKpiLink = async (code: string) => {
    if (!code) return
    setKpiLinkSaving(true)
    setKpiLinkError(null)
    try {
      const meta = apmsKpis.find(k => k.kode === code)
      await api.post(`/programs/${numId}/kpi-links`, {
        apmsKpiCode: code.toUpperCase(),
        apmsKpiName: meta?.nama,
        apmsKpiBobot: meta?.bobot,
      })
      setKpiLinkSearch('')
      setKpiLinkDropdownOpen(false)
      // loadDetail → readiness.hasKpi terupdate utk checklist; loadOverview → kpiCount
      // di ProgramsView/HomeFocus terupdate (dua-duanya kebutuhan terpisah).
      await Promise.all([loadKpiLinks(), loadDetail(true), loadOverview('refresh')])
    } catch (e: unknown) {
      setKpiLinkError(extractErrorMessage(e, 'Gagal menambah link KPI.'))
    } finally {
      setKpiLinkSaving(false)
    }
  }

  const removeKpiLink = async (code: string) => {
    try {
      await api.delete(`/programs/${numId}/kpi-links/${code}`)
      await Promise.all([loadKpiLinks(), loadDetail(true), loadOverview('refresh')])
    } catch (err) {
      showToast(extractErr(err, 'Gagal menghapus link KPI.'), 'error')
    }
  }

  const submitKpiInternal = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setKpiInternalSaving(true)
    setKpiInternalError(null)
    try {
      if (editingKpiId) {
        // Edit mode — PATCH /kpis/{id}. Code immutable (auto-gen, tidak boleh
        // diubah user). Hanya nama, target, satuan, frekuensi yang mutable.
        await api.patch(`/kpis/${editingKpiId}`, {
          name: kpiInternal.name.trim(),
          targetValue: Number(kpiInternal.targetValue),
          unitOfMeasure: kpiInternal.unitOfMeasure.trim() || null,
          reviewFrequency: kpiInternal.reviewFrequency,
        })
        setEditingKpiId(null)
      } else {
        // Create mode — auto-gen code unik dengan prefix program code +
        // sequence number. Format: PRG-X-Y-K01 / -K02 / dst. Ini guaranteed
        // unique global karena program code itu sendiri sudah unique.
        const existingCount = (detail?.kpis ?? []).length
        const seq = String(existingCount + 1).padStart(2, '0')
        const autoCode = `${detail?.code ?? `P${numId}`}-K${seq}`
        await api.post(`/programs/${numId}/kpi-internal`, {
          code: autoCode,
          name: kpiInternal.name.trim(),
          targetValue: Number(kpiInternal.targetValue),
          unitOfMeasure: kpiInternal.unitOfMeasure.trim() || undefined,
          reviewFrequency: kpiInternal.reviewFrequency,
        })
      }
      setKpiInternal({ name: '', targetValue: '', unitOfMeasure: '', reviewFrequency: 'MONTHLY' })
      setShowKpiInternalForm(false)
      // loadDetail → KPI baru/updated muncul di list detail.kpis + readiness.hasKpi update;
      // loadOverview → kpiCount di ProgramsView terupdate.
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (e: unknown) {
      setKpiInternalError(extractErrorMessage(e, editingKpiId ? 'Gagal memperbarui KPI.' : 'Gagal membuat KPI internal.'))
    } finally {
      setKpiInternalSaving(false)
    }
  }

  // Helper: open form di edit mode dengan pre-filled values dari KPI yang dipilih.
  const openEditKpi = (kpi: { id: number; name: string; targetValue: number; unitOfMeasure?: string | null; reviewFrequency?: string }) => {
    setEditingKpiId(kpi.id)
    setKpiInternal({
      name: kpi.name,
      targetValue: String(kpi.targetValue ?? ''),
      unitOfMeasure: kpi.unitOfMeasure ?? '',
      reviewFrequency: kpi.reviewFrequency ?? 'MONTHLY',
    })
    setShowKpiInternalForm(true)
    setKpiInternalError(null)
  }

  const submitKpiActual = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!recordingKpiId) return
    setKpiActualSaving(true)
    setKpiActualError(null)
    try {
      await api.post(`/kpis/${recordingKpiId}/values`, {
        measurementDate: kpiActual.measurementDate,
        actualValue: Number(kpiActual.actualValue),
        statusNotes: kpiActual.statusNotes || undefined,
      })
      setRecordingKpiId(null)
      setKpiActual({ measurementDate: new Date().toISOString().slice(0, 10), actualValue: '', statusNotes: '' })
      // loadDetail → detail.kpis refresh actualValue;
      // loadOverview → workspace programs[id].healthStatus refresh (BE auto-
      // recompute health via ProgramHealthService setelah simpan actual).
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (e: unknown) {
      setKpiActualError(extractErrorMessage(e, 'Gagal menyimpan aktual KPI.'))
    } finally {
      setKpiActualSaving(false)
    }
  }

  const linkedCodes = new Set(kpiLinks.map(l => l.apmsKpiCode))
  const kpiSearchResults = apmsKpis.filter(k =>
    !linkedCodes.has(k.kode) &&
    (kpiLinkSearch === '' || k.kode.toLowerCase().includes(kpiLinkSearch.toLowerCase()) || k.nama.toLowerCase().includes(kpiLinkSearch.toLowerCase()))
  ).slice(0, 8)

  // ── Blockers (from execution pulse) ──────────────────────────────────
  const [blockers, setBlockers] = useState<PulseBlocker[]>([])
  const [blockersLoading, setBlockersLoading] = useState(false)
  const [blockersError, setBlockersError] = useState(false)

  useEffect(() => {
    setBlockersLoading(true)
    setBlockersError(false)
    api.get<{ data: { activeBlockers: PulseBlocker[] } }>('/programs/execution-pulse')
      .then(res => {
        // Defensive filter — skip blocker dengan struktur nested yang malformed,
        // jangan jatuhkan seluruh load karena 1 item rusak.
        const all = res.data?.activeBlockers ?? []
        const filtered = all.filter(b => b?.task?.workstream?.program?.id === numId)
        setBlockers(filtered)
      })
      .catch((err) => {
        // Hanya tandai error untuk HTTP failure nyata (4xx/5xx). Empty
        // array dari endpoint sukses TIDAK boleh trigger banner — itu
        // legit state (program baru, belum ada blocker).
        if (err instanceof ApiRequestError && err.status >= 400) {
          console.error('[Atlas] Gagal memuat blocker program:', err.status, err.message)
          setBlockersError(true)
        } else {
          // Parsing error / unexpected — log saja, biarkan empty state default.
          console.warn('[Atlas] Blocker load warning (treated as empty):', err)
        }
      })
      .finally(() => setBlockersLoading(false))
  }, [numId])

  // ── Tabs ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<DetailTab>('ringkasan')

  useEffect(() => {
    if (activeTab === 'ringkasan') {
      void loadApprovalLog()
      void loadProgressLog()
    }
  }, [activeTab, loadApprovalLog, loadProgressLog])

  // ── Sprint 5 — Check→Act bridge: prefill ProgressLog dari meeting context ──
  useEffect(() => {
    if (typeof window === 'undefined' || !numId) return
    const key = `atlas:progress-log-prefill.${numId}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return
    try {
      const ctx = JSON.parse(raw) as { narrative?: string; kendala?: string; meetingTitle?: string; meetingDate?: string }
      setProgressForm(f => ({
        ...f,
        narrative: ctx.narrative ?? f.narrative,
        kendala: ctx.kendala ?? f.kendala,
      }))
      setShowProgressForm(true)
      sessionStorage.removeItem(key)
    } catch {
      sessionStorage.removeItem(key)
    }
  }, [numId])

  // ── Identitas Strategis (Charter View Phase 1) ────────────────────────
  // Inline editable: pilarStrategis (5-value enum) + strategicObjective
  // (free text). Sumber data ke Charter View read-only di Phase 2.
  const [strategicForm, setStrategicForm] = useState({
    strategicObjective: '',
    pilarStrategis: '',
  })
  const [strategicSaving, setStrategicSaving] = useState(false)
  const [strategicError, setStrategicError] = useState<string | null>(null)
  // Read-only by default — toggle ke edit mode hanya saat user klik tombol Edit.
  // Mengurangi form-feel di Ringkasan tab (Notion/Linear pattern).
  const [strategicEditing, setStrategicEditing] = useState(false)

  useEffect(() => {
    setStrategicForm({
      strategicObjective: detail?.strategicObjective ?? '',
      pilarStrategis: detail?.pilarStrategis ?? '',
    })
    setStrategicError(null)
  }, [detail?.strategicObjective, detail?.pilarStrategis])

  const saveStrategic = async (): Promise<boolean> => {
    if (!detail) return false
    setStrategicSaving(true); setStrategicError(null)
    try {
      await api.put(`/programs/${numId}`, {
        strategicObjective: strategicForm.strategicObjective.trim() || null,
        pilarStrategis: strategicForm.pilarStrategis || null,
      })
      await loadDetail(true)
      return true
    } catch (err: unknown) {
      setStrategicError(extractErrorMessage(err, 'Gagal menyimpan.'))
      return false
    } finally {
      setStrategicSaving(false)
    }
  }

  // ── Workstream sub-detail ─────────────────────────────────────────────
  const [selectedIniId, setSelectedIniId] = useState<number | null>(null)
  const [iniDetail, setIniDetail] = useState<WorkstreamDetail | null>(null)
  const [iniDetailLoading, setIniDetailLoading] = useState(false)

  useEffect(() => {
    if (!selectedIniId) return
    setIniDetailLoading(true)
    api.get<{ data: WorkstreamDetail }>(`/workstreams/${selectedIniId}`)
      .then(res => setIniDetail(res.data))
      .catch((err) => {
        console.error('[Atlas] Gagal memuat detail workstream:', err)
        setIniDetail(null)
      })
      .finally(() => setIniDetailLoading(false))
  }, [selectedIniId])

  // ── Overlay animation helper ──────────────────────────────────────────
  const [closingOverlay, setClosingOverlay] = useState<string | null>(null)
  const closeOverlay = useCallback((name: string, action: () => void) => {
    setClosingOverlay(name)
    setTimeout(() => { action(); setClosingOverlay(null) }, 150)
  }, [])

  // ── Task Planning Panel ───────────────────────────────────────────────
  const [planningTaskId, setPlanningTaskId] = useState<number | null>(null)
  const triggerPlanningPanelClose = useCallback(() =>
    closeOverlay('planning-panel', () => setPlanningTaskId(null)), [closeOverlay])
  const planningPanelClosing = closingOverlay === 'planning-panel'

  // ── Edit Program modal ────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false)
  const [epForm, setEpForm] = useState({
    code: '', name: '', description: '',
    status: 'IN_PROGRESS', priority: 'MEDIUM',
    startDate: '', targetEndDate: '',
    linkedChannelId: '' as string | number,
  })
  const [epPicIds, setEpPicIds] = useState<number[]>([])
  const [epOwnerId, setEpOwnerId] = useState<number | null>(null)
  const [epPicQuery, setEpPicQuery] = useState('')
  const [epOwnerEditing, setEpOwnerEditing] = useState(false)
  const [epOwnerQuery, setEpOwnerQuery] = useState('')
  const [epSaving, setEpSaving] = useState(false)
  const [epError, setEpError] = useState<string | null>(null)
  const [userDirectory, setUserDirectory] = useState<Array<{ id: number; name: string; positionTitle?: string | null }>>([])
  const triggerEpClose = useCallback(() => closeOverlay('edit-program', () => { setShowEdit(false); setEpError(null) }), [closeOverlay])
  const epClosing = closingOverlay === 'edit-program'
  const editProgramDialogRef = useDialogFocus<HTMLDivElement>(showEdit || epClosing)
  const editProgramTitleId = useId()
  const editProgramDescId = useId()
  useEscKey(() => {
    if (epSaving) return
    const epDirty = !!detail && (
      epForm.code !== detail.code ||
      epForm.name !== detail.name ||
      epForm.description !== (detail.description ?? '') ||
      epForm.status !== detail.status ||
      epForm.priority !== detail.priority ||
      epForm.startDate !== (detail.startDate?.slice(0, 10) ?? '') ||
      epForm.targetEndDate !== (detail.targetEndDate?.slice(0, 10) ?? '') ||
      String(epForm.linkedChannelId ?? '') !== String(detail.linkedChannelId ?? '') ||
      epPicIds.length !== (detail.picPersonIds?.length ?? 0) ||
      epPicIds.some(id => !(detail.picPersonIds ?? []).includes(id)) ||
      epOwnerId !== detail.ownerId
    )
    if (epDirty && !window.confirm('Buang perubahan yang belum disimpan?')) return
    triggerEpClose()
  }, showEdit || epClosing)

  const openEdit = () => {
    if (!detail) return
    setEpForm({
      code: detail.code,
      name: detail.name,
      description: detail.description ?? '',
      status: detail.status,
      priority: detail.priority,
      startDate: detail.startDate?.slice(0, 10) ?? '',
      targetEndDate: detail.targetEndDate?.slice(0, 10) ?? '',
      linkedChannelId: detail.linkedChannelId ?? '',
    })
    setEpPicIds(detail.picPersonIds ?? [])
    setEpOwnerId(detail.ownerId)
    setEpPicQuery('')
    setEpOwnerEditing(false)
    setEpOwnerQuery('')
    if (userDirectory.length === 0) {
      void api.get<{ data: Array<{ id: number; name: string; positionTitle?: string | null }> }>('/users/directory')
        .then(r => setUserDirectory(r.data ?? []))
        .catch((err) => console.error('[Atlas] Gagal memuat user directory:', err))
    }
    setShowEdit(true)
  }

  const submitEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setEpSaving(true); setEpError(null)
    try {
      const channelNum = epForm.linkedChannelId === '' || epForm.linkedChannelId === null
        ? null
        : Number(epForm.linkedChannelId)

      await api.put(`/programs/${numId}`, {
        code: epForm.code.trim(),
        name: epForm.name.trim(),
        description: epForm.description.trim() || undefined,
        status: epForm.status, priority: epForm.priority,
        startDate: epForm.startDate, targetEndDate: epForm.targetEndDate,
        linkedChannelId: channelNum,
        picPersonIds: epPicIds,
        ...(epOwnerId && epOwnerId !== detail?.ownerId ? { ownerId: epOwnerId } : {}),
      })
      triggerEpClose()
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (err: unknown) {
      setEpError(extractErrorMessage(err, 'Gagal menyimpan.'))
    } finally {
      setEpSaving(false)
    }
  }

  // ── Create Workstream modal ───────────────────────────────────────────
  const [showCreateIni, setShowCreateIni] = useState(false)
  const [ciForm, setCiForm] = useState({
    name: '', description: '', status: 'BACKLOG', priority: 'MEDIUM',
    startDate: '', targetCompletion: '',
  })
  const [ciSaving, setCiSaving] = useState(false)
  const [ciError, setCiError] = useState<string | null>(null)
  // Owner workstream = reviewer task IN_REVIEW (lihat TaskController.waitingForMe).
  // Default ke current user, tapi visible + bisa override.
  const [ciOwnerId, setCiOwnerId] = useState<number | null>(null)
  const [ciPicIds, setCiPicIds] = useState<number[]>([])
  const [eiPicIds, setEiPicIds] = useState<number[]>([])
  const [ciPrimaryPicId, setCiPrimaryPicId] = useState<number | null>(null)
  const [eiPrimaryPicId, setEiPrimaryPicId] = useState<number | null>(null)
  const [ciPicSearch, setCiPicSearch] = useState('')
  const [eiPicSearch, setEiPicSearch] = useState('')
  const triggerCiClose = useCallback(() => closeOverlay('create-ini', () => {
    setShowCreateIni(false); setCiError(null); setCiPicIds([]); setCiPicSearch(''); setCiPrimaryPicId(null)
    setCiForm({ name: '', description: '', status: 'BACKLOG', priority: 'MEDIUM', startDate: '', targetCompletion: '' })
  }), [closeOverlay])
  const ciClosing = closingOverlay === 'create-ini'
  const createWorkstreamDialogRef = useDialogFocus<HTMLDivElement>(showCreateIni || ciClosing)
  const createWorkstreamTitleId = useId()
  useEscKey(() => {
    if (ciSaving) return
    const ciDirty = ciForm.name !== '' || ciForm.description !== '' ||
      ciForm.startDate !== '' || ciForm.targetCompletion !== '' ||
      ciForm.status !== 'BACKLOG' || ciForm.priority !== 'MEDIUM' ||
      ciPicIds.length > 0 || ciOwnerId !== null
    if (ciDirty && !window.confirm('Buang perubahan yang belum disimpan?')) return
    triggerCiClose()
  }, showCreateIni || ciClosing)

  const submitCreateIni = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCiSaving(true); setCiError(null)
    try {
      await api.post('/workstreams', {
        programId: numId,
        name: ciForm.name.trim(),
        description: ciForm.description.trim() || undefined,
        status: ciForm.status, priority: ciForm.priority,
        startDate: ciForm.startDate || undefined,
        targetCompletion: ciForm.targetCompletion,
        ownerId: ciOwnerId ?? currentUser?.id ?? undefined,
        picPersonIds: ciPicIds.length > 0 ? ciPicIds : undefined,
        primaryPicPersonId: ciPrimaryPicId ?? (ciPicIds[0] ?? undefined),
      })
      triggerCiClose()
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (err: unknown) {
      setCiError(extractErrorMessage(err, 'Gagal membuat workstream.'))
    } finally {
      setCiSaving(false)
    }
  }

  // ── Edit Workstream modal ─────────────────────────────────────────────
  const [editIni, setEditIni] = useState<WorkstreamRow | null>(null)
  const [showEditIni, setShowEditIni] = useState(false)
  const [eiForm, setEiForm] = useState({
    name: '', description: '', status: 'BACKLOG', priority: 'MEDIUM',
    startDate: '', targetCompletion: '',
  })
  const [eiSaving, setEiSaving] = useState(false)
  const [eiError, setEiError] = useState<string | null>(null)
  const triggerEiClose = useCallback(() => closeOverlay('edit-ini', () => { setShowEditIni(false); setEditIni(null); setEiError(null); setEiPicIds([]); setEiPrimaryPicId(null); setEiPicSearch('') }), [closeOverlay])
  const eiClosing = closingOverlay === 'edit-ini'
  const editWorkstreamDialogRef = useDialogFocus<HTMLDivElement>(showEditIni || eiClosing)
  const editWorkstreamTitleId = useId()
  const editWorkstreamDescId = useId()
  useEscKey(() => {
    if (eiSaving) return
    const eiDirty = !!editIni && (
      eiForm.name !== editIni.name ||
      eiForm.description !== (editIni.description ?? '') ||
      eiForm.status !== editIni.status ||
      eiForm.priority !== editIni.priority ||
      eiForm.startDate !== (editIni.startDate?.slice(0, 10) ?? '') ||
      eiForm.targetCompletion !== (editIni.targetCompletion?.slice(0, 10) ?? '') ||
      eiPicIds.length !== (editIni.picPersonIds?.length ?? 0) ||
      eiPicIds.some(id => !(editIni.picPersonIds ?? []).includes(id)) ||
      eiPrimaryPicId !== (editIni.primaryPicPersonId ?? null)
    )
    if (eiDirty && !window.confirm('Buang perubahan yang belum disimpan?')) return
    triggerEiClose()
  }, showEditIni || eiClosing)

  const openEditIni = (ini: WorkstreamRow) => {
    setEditIni(ini)
    setEiForm({
      name: ini.name, description: ini.description ?? '',
      status: ini.status, priority: ini.priority,
      startDate: ini.startDate?.slice(0, 10) ?? '',
      targetCompletion: ini.targetCompletion?.slice(0, 10) ?? '',
    })
    setEiPicIds(ini.picPersonIds ?? [])
    setEiPrimaryPicId(ini.primaryPicPersonId ?? (ini.picPersonIds?.[0] ?? null))
    if (userDirectory.length === 0) {
      void api.get<{ data: Array<{ id: number; name: string; positionTitle?: string | null }> }>('/users/directory')
        .then(r => setUserDirectory(r.data ?? []))
        .catch((err) => console.error('[Atlas] Gagal memuat user directory:', err))
    }
    setShowEditIni(true)
  }

  const submitEditIni = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editIni) return
    setEiSaving(true); setEiError(null)
    try {
      await api.put(`/workstreams/${editIni.id}`, {
        name: eiForm.name.trim(),
        description: eiForm.description.trim() || undefined,
        status: eiForm.status, priority: eiForm.priority,
        startDate: eiForm.startDate || undefined,
        targetCompletion: eiForm.targetCompletion,
        picPersonIds: eiPicIds.length > 0 ? eiPicIds : undefined,
        primaryPicPersonId: eiPrimaryPicId ?? (eiPicIds[0] ?? undefined),
      })
      triggerEiClose()
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (err: unknown) {
      setEiError(extractErrorMessage(err, 'Gagal menyimpan.'))
    } finally {
      setEiSaving(false)
    }
  }

  // ── Delete Workstream ─────────────────────────────────────────────────
  const [confirmDelIniId, setConfirmDelIniId] = useState<number | null>(null)
  const [delIniSaving, setDelIniSaving] = useState(false)
  const [delIniError, setDelIniError] = useState<string | null>(null)

  const submitDelIni = async (iniId: number) => {
    setDelIniSaving(true)
    setDelIniError(null)
    try {
      await api.delete(`/workstreams/${iniId}`)
      setConfirmDelIniId(null)
      if (selectedIniId === iniId) setSelectedIniId(null)
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (err) {
      setDelIniError(extractErr(err, 'Gagal menghapus workstream.'))
    } finally {
      setDelIniSaving(false)
    }
  }

  // ── Edit Phase (Tugas) modal ─────────────────────────────────────────
  const [editPhase, setEditPhase] = useState<PhaseItem | null>(null)
  const [showEditPhase, setShowEditPhase] = useState(false)
  const [ephForm, setEphForm] = useState({ name: '', description: '', status: 'PLANNING' })
  const [ephSaving, setEphSaving] = useState(false)
  const [ephError, setEphError] = useState<string | null>(null)
  const triggerEphClose = useCallback(() => closeOverlay('edit-phase', () => {
    setShowEditPhase(false); setEditPhase(null); setEphError(null)
    setEphForm({ name: '', description: '', status: 'PLANNING' })
  }), [closeOverlay])
  const ephClosing = closingOverlay === 'edit-phase'
  const editPhaseDialogRef = useDialogFocus<HTMLDivElement>(showEditPhase || ephClosing)
  const editPhaseTitleId = useId()
  useEscKey(() => {
    if (ephSaving) return
    const ephDirty = !!editPhase && (
      ephForm.name !== editPhase.name ||
      ephForm.status !== editPhase.status ||
      ephForm.description !== ''
    )
    if (ephDirty && !window.confirm('Buang perubahan yang belum disimpan?')) return
    triggerEphClose()
  }, showEditPhase || ephClosing)

  const openEditPhase = (phase: PhaseItem) => {
    setEditPhase(phase)
    setEphForm({ name: phase.name, description: '', status: phase.status })
    setShowEditPhase(true)
  }

  const submitEditPhase = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editPhase || !selectedIniId) return
    setEphSaving(true); setEphError(null)
    try {
      await api.put(`/phases/${editPhase.id}`, {
        name: ephForm.name.trim(),
        description: ephForm.description.trim() || undefined,
        status: ephForm.status,
      })
      triggerEphClose()
      void reloadIniDetail(selectedIniId)
    } catch (err: unknown) {
      setEphError(extractErrorMessage(err, 'Gagal menyimpan.'))
    } finally {
      setEphSaving(false)
    }
  }

  // ── Delete Phase (Tugas) ──────────────────────────────────────────────
  const [confirmDelPhaseId, setConfirmDelPhaseId] = useState<number | null>(null)
  const [delPhaseSaving, setDelPhaseSaving] = useState(false)
  const [delPhaseError, setDelPhaseError] = useState<string | null>(null)

  const submitDelPhase = async (phaseId: number) => {
    if (!selectedIniId) return
    setDelPhaseSaving(true); setDelPhaseError(null)
    try {
      await api.delete(`/phases/${phaseId}`)
      setConfirmDelPhaseId(null)
      void reloadIniDetail(selectedIniId)
    } catch (err: unknown) {
      setDelPhaseError(extractErrorMessage(err, 'Gagal menghapus task.'))
    } finally {
      setDelPhaseSaving(false)
    }
  }

  // ── Create Phase (Tugas) modal ────────────────────────────────────────
  const [showCreatePhase, setShowCreatePhase] = useState(false)
  const [cpWorkstreamId, setCpWorkstreamId] = useState<number | null>(null)
  const [cpForm, setCpForm] = useState({ name: '', description: '', status: 'PLANNING' })
  const [cpSaving, setCpSaving] = useState(false)
  const [cpError, setCpError] = useState<string | null>(null)
  const triggerCpClose = useCallback(() => closeOverlay('create-phase', () => {
    setShowCreatePhase(false); setCpError(null); setCpWorkstreamId(null)
    setCpForm({ name: '', description: '', status: 'PLANNING' })
  }), [closeOverlay])
  const cpClosing = closingOverlay === 'create-phase'
  const createPhaseDialogRef = useDialogFocus<HTMLDivElement>(showCreatePhase || cpClosing)
  const createPhaseTitleId = useId()
  useEscKey(() => {
    if (cpSaving) return
    const cpDirty = cpForm.name !== '' || cpForm.description !== '' || cpForm.status !== 'PLANNING'
    if (cpDirty && !window.confirm('Buang perubahan yang belum disimpan?')) return
    triggerCpClose()
  }, showCreatePhase || cpClosing)

  const reloadIniDetail = useCallback(async (workstreamId: number) => {
    // Mutasi phase/task di bawah workstream bisa flip program-level readiness
    // flags (hasWorkstream/hasTask) yang gate banner checklist "Ajukan ke
    // KADIV". Refresh program detail bareng workstream detail supaya ribbon
    // sinkron tanpa user perlu hard refresh.
    try {
      const [iniRes, progRes] = await Promise.all([
        api.get<{ data: WorkstreamDetail }>(`/workstreams/${workstreamId}`),
        numId
          ? api.get<{ data: ProgramDetail }>(`/programs/${numId}`)
          : Promise.resolve(null),
      ])
      setIniDetail(iniRes.data)
      if (progRes) setDetail(progRes.data)
    } catch { /* no-op */ }
  }, [numId])

  const submitCreatePhase = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!cpWorkstreamId) return
    setCpSaving(true); setCpError(null)
    try {
      await api.post(`/workstreams/${cpWorkstreamId}/phases`, {
        name: cpForm.name.trim(),
        description: cpForm.description.trim() || undefined,
        status: cpForm.status,
      })
      triggerCpClose()
      void reloadIniDetail(cpWorkstreamId)
    } catch (err: unknown) {
      setCpError(extractErrorMessage(err, 'Gagal membuat phase.'))
    } finally {
      setCpSaving(false)
    }
  }

  // ── Create Subtask within Phase ─────────────────────────────────────
  const [showCreateSubTask, setShowCreateSubTask] = useState(false)
  const [cstPhaseId, setCstPhaseId] = useState<number | null>(null)
  const [cstWorkstreamId, setCstWorkstreamId] = useState<number | null>(null)
  const [cstForm, setCstForm] = useState({ title: '', description: '', priority: 'MEDIUM', startDate: '', targetCompletion: '', assignedTo: null as number | null })
  const [cstSaving, setCstSaving] = useState(false)
  const [cstError, setCstError] = useState<string | null>(null)
  const [cstDirectory, setCstDirectory] = useState<Array<{ id: number; name: string; positionTitle: string | null }>>([])
  const [cstPicSearch, setCstPicSearch] = useState('')
  const triggerCstClose = useCallback(() => closeOverlay('create-subtask', () => {
    setShowCreateSubTask(false); setCstError(null); setCstPhaseId(null); setCstWorkstreamId(null)
    setCstForm({ title: '', description: '', priority: 'MEDIUM', startDate: '', targetCompletion: '', assignedTo: null })
    setCstPicSearch('')
  }), [closeOverlay])
  const cstClosing = closingOverlay === 'create-subtask'
  const createSubTaskDialogRef = useDialogFocus<HTMLDivElement>(showCreateSubTask || cstClosing)
  const createSubTaskTitleId = useId()
  useEscKey(() => {
    if (cstSaving) return
    const cstDirty = cstForm.title !== '' || cstForm.description !== '' ||
      cstForm.priority !== 'MEDIUM' || cstForm.startDate !== '' ||
      cstForm.targetCompletion !== '' || cstForm.assignedTo !== null
    if (cstDirty && !window.confirm('Buang perubahan yang belum disimpan?')) return
    triggerCstClose()
  }, showCreateSubTask || cstClosing)

  const submitCreateSubTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!cstWorkstreamId) return
    setCstSaving(true); setCstError(null)
    try {
      await api.post('/tasks', {
        workstreamId: cstWorkstreamId,
        phaseId: cstPhaseId ?? undefined,
        title: cstForm.title.trim(),
        description: cstForm.description.trim() || undefined,
        priority: cstForm.priority,
        status: 'BACKLOG',
        startDate: cstForm.startDate ? new Date(cstForm.startDate).toISOString() : undefined,
        targetCompletion: cstForm.targetCompletion ? new Date(cstForm.targetCompletion).toISOString() : undefined,
        assignedTo: cstForm.assignedTo ?? undefined,
      })
      triggerCstClose()
      void reloadIniDetail(cstWorkstreamId)
    } catch (err: unknown) {
      setCstError(extractErrorMessage(err, 'Gagal membuat task.'))
    } finally {
      setCstSaving(false)
    }
  }

  // ── Approval actions ──────────────────────────────────────────────────
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [approvalModal, setApprovalModal] = useState<'approve' | 'reject' | 'submit' | 'withdraw' | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [approvedSuccess, setApprovedSuccess] = useState(false)

  // Post-activation hint banner dismiss state — per-program, session-scoped.
  // SessionStorage (bukan localStorage) supaya banner muncul lagi di tab/window
  // baru — user di session berbeda mungkin perlu lihat hint lagi.
  const banDismissKey = numId ? `atlas:program-active-banner-dismissed:${numId}` : ''
  const [activationBannerDismissed, setActivationBannerDismissed] = useState(() => {
    if (typeof window === 'undefined' || !banDismissKey) return false
    return !!sessionStorage.getItem(banDismissKey)
  })
  const dismissActivationBanner = () => {
    if (banDismissKey) sessionStorage.setItem(banDismissKey, '1')
    setActivationBannerDismissed(true)
  }

  useEscKey(() => {
    if (approvalLoading) return
    if (approvalModal === 'reject' && rejectNote !== '' && !window.confirm('Buang catatan yang sudah diketik?')) return
    setApprovalModal(null); setRejectNote(''); setApprovalError(null)
  }, approvalModal !== null)

  const submitForApproval = async () => {
    setApprovalLoading(true); setApprovalError(null)
    try {
      await api.post(`/programs/${numId}/submit`, {})
      setApprovalModal(null)
      await Promise.all([loadDetail(true), loadOverview('refresh'), loadApprovalLog()])
    } catch (e: unknown) {
      setApprovalError(extractErrorMessage(e, 'Gagal mengajukan persetujuan.'))
    } finally { setApprovalLoading(false) }
  }

  const activateProgram = async () => {
    setApprovalLoading(true); setApprovalError(null)
    try {
      await api.post(`/programs/${numId}/activate`, {})
      await Promise.all([loadDetail(true), loadOverview('refresh'), loadApprovalLog()])
    } catch (e: unknown) {
      setApprovalError(extractErrorMessage(e, 'Gagal mengaktifkan program.'))
    } finally { setApprovalLoading(false) }
  }

  const submitApprove = async () => {
    setApprovalLoading(true); setApprovalError(null)
    // Capture status SEBELUM API call — setelah approve, detail.approvalStatus
    // berubah (PENDING_KADIV → ACTIVE), jadi check di sini supaya bisa beda-kan
    // "approve final" (yang trigger toast) vs "approve escalation KASUB→KADIV".
    const wasPendingKadiv = detail?.approvalStatus === 'PENDING_KADIV'
    const progName = detail?.name ?? ''
    try {
      await api.post(`/programs/${numId}/approve`, {})
      setApprovalModal(null)
      setApprovedSuccess(true)
      await Promise.all([loadDetail(true), loadOverview('refresh'), loadApprovalLog()])
      // Stash approval-success info supaya /programs bisa tampilkan toast saat
      // user landing — green banner inline di detail page hilang setelah redirect,
      // tanpa stash ini approver tidak ada feedback bahwa action-nya tercatat.
      if (typeof window !== 'undefined' && wasPendingKadiv && numId) {
        sessionStorage.setItem('atlas:program-approved', JSON.stringify({
          id: numId, name: progName, at: Date.now(),
        }))
      }
      // Redirect ke /programs setelah 2.5 detik
      setTimeout(() => navigate('/programs'), 2500)
    } catch (e: unknown) {
      setApprovalError(extractErrorMessage(e, 'Gagal menyetujui program.'))
    } finally { setApprovalLoading(false) }
  }

  const submitReject = async () => {
    if (!rejectNote.trim()) return
    setApprovalLoading(true); setApprovalError(null)
    try {
      await api.post(`/programs/${numId}/reject`, { note: rejectNote.trim() })
      setApprovalModal(null); setRejectNote('')
      await Promise.all([loadDetail(true), loadOverview('refresh'), loadApprovalLog()])
    } catch (e: unknown) {
      setApprovalError(extractErrorMessage(e, 'Gagal menolak program.'))
    } finally { setApprovalLoading(false) }
  }

  const submitWithdraw = async () => {
    setApprovalLoading(true); setApprovalError(null)
    try {
      await api.post(`/programs/${numId}/withdraw`, {})
      setApprovalModal(null)
      await Promise.all([loadDetail(true), loadOverview('refresh'), loadApprovalLog()])
    } catch (e: unknown) {
      setApprovalError(extractErrorMessage(e, 'Gagal menarik pengajuan.'))
    } finally { setApprovalLoading(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  // Treat creator (submittedById) as a stakeholder so the person who
  // initiated the program can always keep it up to date, even if they
  // designated someone else as PIC Utama.
  const isOwner = detail && currentUser
    ? detail.ownerId === currentUser.id ||
      detail.submittedById === currentUser.id ||
      (detail.picPersonIds ?? []).includes(currentUser.id)
    : false

  const tabDefs: [DetailTab, string][] = [
    ['ringkasan',  'Ringkasan'],
    ['workstream', 'Struktur'],
    ['execution',  'Jadwal'],
    ['blocker',    'Hambatan'],
    ['kpi',        'KPI APMS'],
  ]

  // ── Approval log section (extracted) ─────────────────────────────────
  // Rendered at top of Ringkasan tab when program is PENDING approval atau
  // baru ditolak — itu konteks paling penting saat itu. Di state ACTIVE/
  // DRAFT-segar, section ini turun ke posisi normal (di bawah Workstream).
  const renderApprovalLogSection = () => {
    if (!(approvalLog.length > 0 || approvalLogLoading)) return null
    const actionLabel: Record<string, string> = {
      SUBMITTED: 'Diajukan', APPROVED: 'Disetujui',
      REJECTED: 'Ditolak', ACTIVATED: 'Diaktifkan', COMPLETED: 'Diselesaikan',
      WITHDRAWN: 'Ditarik kembali',
      COMMITMENT_CHANGED: 'Commitment diubah',
    }
    const actionTone: Record<string, string> = {
      SUBMITTED: 'info', APPROVED: 'positive',
      REJECTED: 'danger', ACTIVATED: 'positive', COMPLETED: 'positive',
      WITHDRAWN: 'muted',
      COMMITMENT_CHANGED: 'info',
    }
    return (
      <div className="wi-section">
        <div className="wi-section__header">
          <h3 className="wi-section__title">{PIcon.activity} Riwayat Persetujuan</h3>
        </div>
        {approvalLogLoading && approvalLog.length === 0 ? (
          <div className="prog-approval-log-skeleton" aria-label="Memuat riwayat persetujuan">
            <div className="prog-approval-log-skeleton__entry">
              <SkeletonBlock width="55%" height={14} />
              <SkeletonBlock width="40%" height={11} />
            </div>
            <div className="prog-approval-log-skeleton__entry">
              <SkeletonBlock width="48%" height={14} />
              <SkeletonBlock width="36%" height={11} />
            </div>
          </div>
        ) : (() => {
          // Default collapse: tampilkan 2 entry terbaru. Sisanya disembunyikan
          // di balik toggle supaya timeline aktivitas hari-yang-sama (banyak
          // siklus Diajukan → Ditarik → Diajukan) tidak banjir di Ringkasan.
          const COLLAPSED_COUNT = 2
          const hasMore = approvalLog.length > COLLAPSED_COUNT
          const visible = approvalLogExpanded || !hasMore
            ? approvalLog
            : approvalLog.slice(0, COLLAPSED_COUNT)
          const hiddenCount = approvalLog.length - visible.length
          return (
            <div className="prog-approval-log">
              {visible.map((entry) => {
                const tone = actionTone[entry.action] ?? 'default'
                const label = actionLabel[entry.action] ?? entry.action
                const date = new Date(entry.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                return (
                  <div key={entry.id} className={`prog-approval-log__entry prog-approval-log__entry--${tone}`}>
                    <span className="prog-approval-log__dot" />
                    <div className="prog-approval-log__body">
                      <div className="prog-approval-log__head">
                        <span className="prog-approval-log__action">{label}</span>
                        {entry.toStatus && (
                          <span className="prog-approval-log__status">{entry.toStatus.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                      <span className="prog-approval-log__meta">
                        {entry.byUserName} · {date}
                      </span>
                      {entry.note && (
                        <div className="prog-approval-log__note">{entry.note}</div>
                      )}
                    </div>
                  </div>
                )
              })}
              {hasMore && (
                <button
                  type="button"
                  className="prog-approval-log__toggle"
                  onClick={() => setApprovalLogExpanded(v => !v)}
                  aria-expanded={approvalLogExpanded}
                >
                  {approvalLogExpanded
                    ? 'Sembunyikan riwayat lama'
                    : `Lihat ${hiddenCount} entry lainnya`}
                </button>
              )}
            </div>
          )
        })()}
      </div>
    )
  }

  // True kalau Riwayat Persetujuan harus di-pin ke atas Ringkasan tab.
  const _detailStatus = detail?.approvalStatus ?? ''
  const _isRejected = _detailStatus === 'DRAFT' && !!detail?.rejectionNote
  const pinApprovalLogTop = approvalLog.length > 0 && (
    _detailStatus === 'PENDING_KASUB' || _detailStatus === 'PENDING_KADIV' || _isRejected
  )

  return (
    <div className="ds program-detail-v2 prog-detail-page">
      {/* ── Breadcrumb (slim) ──────────────────────────────────────────── */}
      <div className="wi-detail-header wi-detail-header--slim">
        <TraceStrip
          nodes={[
            { label: 'Programs', href: '/programs' },
            ...(detail ? [{ code: detail.code } as TraceNode] : []),
          ]}
        />
      </div>

      {/* ── Title row + lifecycle/approval actions ─────────────────────── */}
      {loading ? (
        <div className="prog-title-row">
          <SkeletonBlock height={24} width="320px" />
        </div>
      ) : detail ? (
        <>
          <div className="prog-title-row">
            <h1 className="prog-title-row__title">{detail.name}</h1>
            <div className="prog-title-row__meta">
              <span className="prog-title-row__priority">
                <span className={`prog-title-row__priority-dot prog-title-row__priority-dot--${detail.priority.toLowerCase()}`} />
                {detail.priority}
              </span>
              {detail.approvalStatus === 'DRAFT' && !!detail.rejectionNote && (
                <span className="prog-approval-pill prog-approval-pill--danger">Ditolak</span>
              )}
            </div>
            {/* View switchers + lifecycle/approval actions — sebaris di title row.
                Board + Charter dipindah dari hero panel supaya hero col 4 cuma
                punya status indicators (Health + Kelompok), tidak crammed. */}
            <div className="wi-detail-header__actions">
              <div className="wi-detail-header__group wi-detail-header__group--views">
                <button
                  className="icon-btn wi-detail-header__board-btn"
                  onClick={() => navigate(`/execution?programId=${numId}`)}
                  type="button"
                >
                  <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10">
                    <path d="M2 10 10 2M5 2h5v5" />
                  </svg>
                  Board
                </button>
                <button
                  className="icon-btn wi-detail-header__board-btn charter-link"
                  onClick={() => navigate(`/programs/${numId}/charter`)}
                  type="button"
                  title="Buka tampilan Charter (single-page, read-only)"
                >
                  Charter
                  <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10">
                    <path d="M3 6h6M6 3l3 3-3 3" />
                  </svg>
                </button>
              </div>
              {((roleAccess.canEditProgram(
                  isOwner,
                  detail.approvalStatus === 'DRAFT' && !!detail.rejectionNote,
                ) && !['PENDING_KASUB', 'PENDING_KADIV'].includes(detail.approvalStatus ?? ''))
                || detail.approvalStatus === 'PENDING_KASUB'
                || detail.approvalStatus === 'PENDING_KADIV') && (
                <div className="wi-detail-header__group wi-detail-header__group--actions">
                  {roleAccess.canEditProgram(
                      isOwner,
                      detail.approvalStatus === 'DRAFT' && !!detail.rejectionNote,
                    ) &&
                    !['PENDING_KASUB', 'PENDING_KADIV'].includes(detail.approvalStatus ?? '') && (
                    <button className="btn btn--ghost wi-detail-header__btn" onClick={openEdit} type="button">
                      Edit
                    </button>
                  )}
                  {detail.approvalStatus === 'PENDING_KASUB' && roleAccess.canApproveAsKasub && (
                    <>
                      <button className="btn btn--ghost wi-detail-header__btn wi-detail-header__btn--danger" disabled={approvalLoading} onClick={() => setApprovalModal('reject')} type="button">Tolak</button>
                      <button className="btn btn--primary wi-detail-header__btn" disabled={approvalLoading} onClick={() => setApprovalModal('approve')} type="button">Setujui</button>
                    </>
                  )}
                  {detail.approvalStatus === 'PENDING_KADIV' && roleAccess.canApproveAsKadiv && (
                    <>
                      <button className="btn btn--ghost wi-detail-header__btn wi-detail-header__btn--danger" disabled={approvalLoading} onClick={() => setApprovalModal('reject')} type="button">Tolak</button>
                      <button className="btn btn--primary wi-detail-header__btn" disabled={approvalLoading} onClick={() => setApprovalModal('approve')} type="button">Setujui</button>
                    </>
                  )}
                  {['PENDING_KASUB', 'PENDING_KADIV'].includes(detail.approvalStatus ?? '') &&
                    (detail.submittedById === currentUser?.id || detail.ownerId === currentUser?.id) &&
                    !(detail.approvalStatus === 'PENDING_KASUB' && roleAccess.canApproveAsKasub) &&
                    !(detail.approvalStatus === 'PENDING_KADIV' && roleAccess.canApproveAsKadiv) && (
                    <button
                      className="btn btn--ghost wi-detail-header__btn"
                      disabled={approvalLoading}
                      onClick={() => setApprovalModal('withdraw')}
                      type="button"
                    >
                      Tarik kembali
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {detail.approvalStatus === 'DRAFT' && detail.rejectionNote && (
            <p className="prog-approval-note">Catatan penolakan: {detail.rejectionNote}</p>
          )}
          {approvedSuccess && (
            <div className="prog-approval-success-banner">
              <span className="prog-approval-success-banner__icon">✓</span>
              <span>Program disetujui! Mengalihkan ke daftar program…</span>
            </div>
          )}

          {/* ── Hero panel ──────────────────────────────────────────────
              Strategic Objective + Pilar | PIC | Periode | Health + ViewSwitchers.
              Adopsi pola Charter — info-dense horizontal grid, bukan title-only. */}
          {(() => {
            const pillarLabel = detail.pilarStrategis
              ? detail.pilarStrategis.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              : null
            const formatDateID = (s: string) =>
              new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
            const startStr = detail.startDate ? formatDateID(detail.startDate) : '—'
            const endStr = detail.targetEndDate ? formatDateID(detail.targetEndDate) : '—'
            const dlInfo = detail.targetEndDate
              ? formatDaysLabel(daysUntil(detail.targetEndDate))
              : null
            const canEditStrategicHero = roleAccess.canEditProgram(
                isOwner,
                detail.approvalStatus === 'DRAFT' && !!detail.rejectionNote,
              )
              && !['PENDING_KASUB', 'PENDING_KADIV'].includes(detail.approvalStatus ?? '')
            return (
              <header className="prog-hero">
                <div className="prog-hero__col">
                  <div className="prog-hero__label-row">
                    <span className="prog-hero__label">Strategic Objective</span>
                    {strategicSaving && <span className="prog-hero__edit-status">Menyimpan…</span>}
                    {canEditStrategicHero && !strategicEditing && (
                      <button
                        type="button"
                        className="prog-hero__edit-btn"
                        onClick={() => setStrategicEditing(true)}
                        title="Edit Strategic Objective &amp; Pilar Strategis"
                        aria-label="Edit identitas strategis"
                      >
                        <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 12 12" width="11" aria-hidden="true">
                          <path d="M8 2l2 2-6 6L2 10l0-2z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {strategicEditing ? (
                    <div className="prog-hero__edit">
                      <textarea
                        className="prog-strategic__input prog-hero__edit-textarea"
                        rows={2}
                        maxLength={1000}
                        value={strategicForm.strategicObjective}
                        onChange={e => {
                          setStrategicForm(f => ({ ...f, strategicObjective: e.target.value }))
                          const ta = e.currentTarget
                          ta.style.height = 'auto'
                          ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
                        }}
                        ref={el => {
                          if (el) {
                            el.style.height = 'auto'
                            el.style.height = `${Math.min(el.scrollHeight, 200)}px`
                          }
                        }}
                        placeholder="Contoh: Efektivitas Pengawasan Pendanaan Pemerintah"
                        disabled={strategicSaving}
                        autoFocus
                      />
                      <select
                        className="prog-strategic__input prog-hero__edit-select"
                        value={strategicForm.pilarStrategis}
                        onChange={e => setStrategicForm(f => ({ ...f, pilarStrategis: e.target.value }))}
                        disabled={strategicSaving}
                        aria-label="Pilar Strategis"
                      >
                        <option value="">— Pilih pilar —</option>
                        <option value="COLLECTING_MORE">Collecting More</option>
                        <option value="SPENDING_BETTER">Spending Better</option>
                        <option value="INNOVATIVE_FINANCING">Innovative Financing</option>
                        <option value="ENABLER">Program Enabler</option>
                      </select>
                      {strategicError && (
                        <div className="prog-hero__edit-error">{strategicError}</div>
                      )}
                      <div className="prog-hero__edit-actions">
                        <button
                          type="button"
                          className="wi-btn wi-btn--primary wi-btn--sm"
                          onClick={async () => {
                            // hanya tutup kalau sukses — kalau error, biarkan form
                            // tetap terbuka supaya user bisa baca pesan & retry.
                            const ok = await saveStrategic()
                            if (ok) setStrategicEditing(false)
                          }}
                          disabled={strategicSaving}
                        >
                          {strategicSaving ? 'Menyimpan…' : 'Simpan'}
                        </button>
                        <button
                          type="button"
                          className="wi-btn wi-btn--ghost wi-btn--sm"
                          onClick={() => {
                            setStrategicForm({
                              strategicObjective: detail.strategicObjective ?? '',
                              pilarStrategis: detail.pilarStrategis ?? '',
                            })
                            setStrategicError(null)
                            setStrategicEditing(false)
                          }}
                          disabled={strategicSaving}
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {detail.strategicObjective ? (
                        <div className="prog-hero__so" title={detail.strategicObjective}>
                          {detail.strategicObjective}
                        </div>
                      ) : (
                        <div className="prog-hero__so prog-hero__so--empty">Belum diisi</div>
                      )}
                      {pillarLabel && (
                        <span className="prog-hero__pillar">{pillarLabel}</span>
                      )}
                    </>
                  )}
                </div>

                <div className="prog-hero__col">
                  <div className="prog-hero__label">PIC Utama</div>
                  {(() => {
                    // detail.owner punya positionTitle + unit (eager-loaded di
                    // findOrFail), programSummary.owner cuma id/name. Prefer
                    // detail kalau ada supaya subline jabatan · divisi tampil.
                    const owner = detail.owner ?? programSummary?.owner ?? null
                    if (!owner) {
                      return <div className="prog-hero__value prog-hero__so--empty">Belum ditetapkan</div>
                    }
                    const role = owner.positionTitle ?? null
                    const unit = owner.unit?.name ?? null
                    const subline = [role, unit].filter(Boolean).join(' · ')
                    const supportCount = (detail.picPersons ?? []).length
                    return (
                      <>
                        <div className="prog-hero__value">
                          <Avatar name={owner.name} size={22} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {owner.name}
                          </span>
                        </div>
                        {subline && (
                          <div className="prog-hero__sub" title={subline}>{subline}</div>
                        )}
                        {supportCount > 0 && (
                          <div className="prog-hero__sub prog-hero__sub--accent">
                            +{supportCount} tim pendukung
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>

                <div className="prog-hero__col">
                  <div className="prog-hero__label">Periode</div>
                  <div className="prog-hero__value">
                    {startStr} → {endStr}
                  </div>
                  {dlInfo && (
                    <div className={`prog-hero__sub prog-hero__sub--${dlInfo.tone === 'critical' ? 'danger' : dlInfo.tone === 'warning' ? 'warn' : 'accent'}`}>
                      {dlInfo.label}
                    </div>
                  )}
                </div>

                <div className="prog-hero__col prog-hero__col--status">
                  <div className="prog-hero__label">Status</div>
                  <div className="prog-hero__status-stack">
                    <HealthPill
                      status={normalizeHealthStatus(detail.healthStatus)}
                      title={detail.autoHealthComputedAt
                        ? `Auto-derived dari workstream + KPI + task overdue + open blockers. Last computed: ${new Date(detail.autoHealthComputedAt).toLocaleString('id-ID')}`
                        : undefined}
                    />
                    {detail.kelompok && (
                      <span className={`prog-detail-header__kelompok prog-detail-header__kelompok--${detail.kelompok === 'SCORECARD' ? 'scorecard' : 'non'}`}>
                        {detail.kelompok === 'SCORECARD' ? 'Scorecard' : 'Non Scorecard'}
                      </span>
                    )}
                  </div>
                </div>
              </header>
            )
          })()}
        </>
      ) : (
        <div className="prog-title-row">
          <p className="wi-detail-titlebar__empty">Program tidak ditemukan.</p>
        </div>
      )}

      {/* ── Lifecycle phase banner ───────────────────────────────────── */}
      {detail && (() => {
        const status = detail.approvalStatus ?? 'DRAFT'
        // Rejected = status reverts to DRAFT + rejectionNote populated. Literal
        // 'REJECTED' never persists — historic checks on it were dead code.
        const isRejected = status === 'DRAFT' && !!detail.rejectionNote
        const inPlanning = ['DRAFT', 'PLANNING', 'PENDING_KASUB', 'PENDING_KADIV'].includes(status)
        const inExecution = status === 'ACTIVE'
        const inDone = status === 'COMPLETED'
        let phase: 'planning' | 'execution' | 'done' = 'planning'
        if (inExecution) phase = 'execution'
        else if (inDone) phase = 'done'
        else if (!inPlanning) return null

        const label = phase === 'planning' ? 'Fase Perencanaan' : phase === 'execution' ? 'Fase Eksekusi' : 'Selesai'
        // Icon set: planning (file), planning-ready (check), pending (clock),
        // rejected (alert), execution (play), done (check).
        const planningIcon = phase === 'planning'
          ? <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12" aria-hidden="true"><path d="M2.5 2h6l3 3v7H2.5z"/><path d="M8.5 2v3h3M5 8h4M5 10h3"/></svg>
          : null
        const icon = phase === 'execution'
          ? <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12" aria-hidden="true"><path d="M4 3v8l7-4z"/></svg>
          : phase === 'done'
          ? <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="12" aria-hidden="true"><path d="m2.5 7 3 3 6-7"/></svg>
          : planningIcon

        // Pre-compute checklist state — dipakai banner hint + checklist section.
        // Sinkron dengan logic di checks array (~line 1840).
        // Channel sengaja TIDAK dipakai sebagai gate: opsional dari sisi bisnis.
        // hasKpi pakai detail.readiness (fresh dari /programs/{id}), bukan workspace
        // cache yang bisa stale antara save KPI dan refresh overview.
        const checklistDone = (
          !!(detail.description?.trim())
          && !!detail.readiness?.hasWorkstream && !!detail.readiness?.hasTask
          && !!detail.readiness?.hasKpi
        )

        let hint: React.ReactNode = null
        if (phase === 'planning') {
          // isRejected dicek FIRST — DRAFT-with-note adalah special case dari DRAFT.
          if (isRejected) hint = 'Perlu revisi — lihat catatan penolakan di atas.'
          else if (status === 'DRAFT') {
            hint = checklistDone
              ? 'Checklist lengkap — klik tombol di bawah untuk aktifkan / ajukan persetujuan.'
              : 'Lengkapi persiapan di checklist, lalu aktifkan program.'
          }
          else if (status === 'PENDING_KASUB') hint = 'Menunggu persetujuan KASUBDIV. Struktur & rencana masih bisa disempurnakan; eksekusi aktif setelah disetujui.'
          else if (status === 'PENDING_KADIV') hint = 'Menunggu persetujuan KADIV. Struktur & rencana masih bisa disempurnakan; eksekusi aktif setelah disetujui.'
        } else if (phase === 'execution') {
          const days = detail.targetEndDate ? daysUntil(detail.targetEndDate) : null
          const dl = days !== null ? formatDaysLabel(days) : null
          hint = dl ? <>Target selesai <strong>{dl.label}</strong></> : 'Eksekusi berjalan.'
        } else if (phase === 'done') {
          const endDate = detail.actualEndDate ?? detail.targetEndDate
          hint = endDate ? <>Ditutup {new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</> : null
        }

        // Variant menentukan warna banner. "planning" punya 4 sub-state:
        // - planning-ready (hijau): checklist 3/3, siap aktifkan/ajukan.
        // - pending (biru): menunggu KASUBDIV/KADIV menyetujui.
        // - rejected (merah): perlu revisi.
        // - planning (kuning): ada gap di checklist, default state.
        let variant: string = phase
        if (phase === 'planning') {
          // isRejected dicek FIRST agar tidak ter-shadow oleh planning-ready
          // (rejected program juga punya status='DRAFT' & bisa checklistDone).
          if (isRejected) variant = 'rejected'
          else if (status === 'PENDING_KASUB' || status === 'PENDING_KADIV') variant = 'pending'
          else if (status === 'DRAFT' && checklistDone) variant = 'planning-ready'
        }
        const readyIcon = <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="12" aria-hidden="true"><path d="m2.5 7 3 3 6-7"/></svg>
        const pendingIcon = <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12" aria-hidden="true"><circle cx="7" cy="7" r="5.5"/><path d="M7 4v3l2 1.5"/></svg>
        const rejectedIcon = <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12" aria-hidden="true"><circle cx="7" cy="7" r="5.5"/><path d="M7 4v3M7 10h.01"/></svg>
        const finalIcon = variant === 'planning-ready' ? readyIcon
          : variant === 'pending' ? pendingIcon
          : variant === 'rejected' ? rejectedIcon
          : icon

        return (
          <div className={`prog-lifecycle-banner prog-lifecycle-banner--${variant}`}>
            <span className="prog-lifecycle-banner__icon">{finalIcon}</span>
            <span className="prog-lifecycle-banner__label">{label}</span>
            {hint && <span className="prog-lifecycle-banner__hint">· {hint}</span>}
          </div>
        )
      })()}

      {/* ── Post-activation hint banner ──────────────────────────────────
          Tampil 7 hari pertama setelah program transition ke ACTIVE.
          Tujuan: jembatani gap antara "approval selesai" (Plan done) dan
          "mulai eksekusi" (Do start) — PIC sering bingung "OK sudah aktif,
          sekarang ngapain?". Banner kasih CTA eksplisit ke Board.
          Dismissable per-session per-program. */}
      {detail && detail.approvalStatus === 'ACTIVE' && detail.activatedAt
        && !activationBannerDismissed && (() => {
        const daysSince = (Date.now() - new Date(detail.activatedAt).getTime()) / 86400000
        if (daysSince > 7) return null
        return (
          <div className="prog-activation-banner" role="status">
            <span className="prog-activation-banner__icon" aria-hidden="true">
              <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="14"><path d="M4 3v8l7-4z"/></svg>
            </span>
            <div className="prog-activation-banner__body">
              <strong className="prog-activation-banner__title">Program baru aktif · siap dieksekusi</strong>
              <span className="prog-activation-banner__hint">
                Buka Board untuk drag-drop task harian. Struktur masih bisa disempurnakan dari tab Struktur sambil tim mulai work.
              </span>
            </div>
            <div className="prog-activation-banner__actions">
              <button
                className="btn btn--primary prog-activation-banner__cta"
                onClick={() => navigate(`/execution?programId=${numId}`)}
                type="button"
              >
                Buka Board →
              </button>
              <button
                aria-label="Tutup hint"
                className="prog-activation-banner__dismiss"
                onClick={dismissActivationBanner}
                title="Tutup (muncul kembali di session baru)"
                type="button"
              >
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11"/></svg>
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      {detail && (
        <div className="prog-detail-tabs">
          {tabDefs.map(([dt, label]) => {
            const badgeCount = dt === 'blocker' ? blockers.length : 0
            return (
              <button
                key={dt}
                className={`prog-detail-tab${activeTab === dt ? ' prog-detail-tab--active' : ''}`}
                onClick={() => setActiveTab(dt)}
                type="button"
              >
                {label}
                {badgeCount > 0 && (
                  <span className="prog-detail-tab__badge">{badgeCount}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Tab content ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="wi-detail-loading">
          <SkeletonStack lines={[100, 80, 60, 90, 70]} />
        </div>
      ) : detail ? (
        <div className="prog-detail-body">

          {/* ── RINGKASAN ─────────────────────────────────────────────── */}
          {activeTab === 'ringkasan' && (
            <div className="prog-overview-v2">
              {/* Left: description + workstream + activity log */}
              <div className="prog-overview-v2__main">
                {/* Riwayat Persetujuan di-pin ke atas saat status PENDING atau
                    baru ditolak — konteks paling relevan saat itu (PIC perlu
                    lihat catatan reviewer / status submission tanpa scroll). */}
                {pinApprovalLogTop && renderApprovalLogSection()}
                {detail.description && (
                  <div className="wi-section prog-description">
                    <span className="prog-description__label">Deskripsi</span>
                    <p className="wi-desc">{detail.description}</p>
                  </div>
                )}

                {/* Identitas Strategis (Strategic Objective + Pilar) sekarang
                    inline di Hero panel — klik pencil icon di kolom Strategic
                    Objective untuk edit. Section terpisah dihapus karena bikin
                    user bingung (form lompat ke bawah saat klik edit). */}

                <div className="wi-section">

                  {(() => {
                    // Compute KPI health from internal KPIs with actuals
                    const kpisWithData = (detail.kpis ?? []).filter(k => k.actualValue != null)
                    const kpiStatuses = kpisWithData.map(k => {
                      const actual = k.actualValue!
                      const target = k.targetValue ?? 0
                      const critical = k.criticalThreshold ?? target * 0.8
                      const warning  = k.warningThreshold  ?? target * 0.95
                      if (actual <= critical) return 'RED'
                      if (actual <= warning)  return 'YELLOW'
                      return 'GREEN'
                    })
                    const kpiRedCount    = kpiStatuses.filter(s => s === 'RED').length
                    const kpiYellowCount = kpiStatuses.filter(s => s === 'YELLOW').length
                    const kpiHealth = kpisWithData.length === 0 ? null
                      : kpiRedCount >= 2 ? 'RED'
                      : kpiRedCount >= 1 ? 'YELLOW'
                      : kpiYellowCount >= 1 ? 'YELLOW'
                      : 'GREEN'
                    const kpiHealthLabel = kpiHealth === 'RED' ? 'Merah' : kpiHealth === 'YELLOW' ? 'Kuning' : 'Hijau'

                    // Schedule health — progress vs waktu terpakai
                    const scheduleHealth = (() => {
                      if (!detail.startDate || !detail.targetEndDate) return null
                      const start = new Date(detail.startDate).getTime()
                      const end   = new Date(detail.targetEndDate).getTime()
                      const now   = Date.now()
                      if (end <= start) return null
                      const total   = end - start
                      const elapsed = Math.min(Math.max(now - start, 0), total)
                      const pctTime = Math.round(elapsed / total * 100)
                      const gap     = detail.progressPercent - pctTime
                      return { pctTime, gap }
                    })()

                    // Hanya tampilkan Alignment kalau ada data — '—' placeholder
                    // memberi visual noise tanpa info. Sama untuk KPI Health (sudah
                    // di-gate kpiHealth!==null). Workstream selalu tampil karena
                    // structural info.
                    const showAlignment = detail.strategicAlignment != null
                    const cols = 1 + (showAlignment ? 1 : 0) + 1 + (kpiHealth !== null ? 1 : 0)
                    const wsCount = (detail.workstreams ?? []).length
                    // Sprint 4: Progress + Workstream + Alignment metrics dihapus —
                    // semua info sudah tersedia di Hero panel atau side rail tanpa duplikasi.
                    // KPI Health tetap ditampilkan inline kalau ada data — info penting
                    // strategis yang tidak terwakili di hero/side rail.
                    return (
                      <>
                        {kpiHealth !== null && (
                          <div className="detail-metrics detail-metrics--1">
                            <div className="metric">
                              <span className="metric__label">KPI Health</span>
                              <span className={`metric__value metric__value--${kpiHealth.toLowerCase()}`}>
                                <span className={`metric__dot metric__dot--${kpiHealth.toLowerCase()}`} />
                                {kpiHealthLabel}
                              </span>
                            </div>
                          </div>
                        )}
                        {/* KPI monitoring panel — hanya tampil saat minimal 1 KPI
                            sudah punya actualValue. Jika semua KPI masih "Belum ada
                            data", panel ini cuma noise (header + 1 row kosong) yang
                            tidak memberi info actionable. Setelah ada data baru
                            tampilkan untuk monitoring status per indikator. */}
                        {kpisWithData.length > 0 && (
                          <div className="program-kpi-health">
                            <div className="program-kpi-health__title">
                              KPI Internal — Status per Indikator
                            </div>
                            <div className="program-kpi-health__list">
                              {(detail.kpis ?? []).map(kpi => {
                                const hasActual = kpi.actualValue != null
                                const actual = kpi.actualValue ?? 0
                                const target = kpi.targetValue ?? 0
                                const critical = kpi.criticalThreshold ?? target * 0.8
                                const warning  = kpi.warningThreshold  ?? target * 0.95
                                const status = !hasActual ? null
                                  : actual <= critical ? 'RED'
                                  : actual <= warning  ? 'YELLOW'
                                  : 'GREEN'
                                const tone = status ? status.toLowerCase() : 'muted'
                                const pct = getKpiFillPercent(actual, target)
                                return (
                                  <div key={kpi.id} className="program-kpi-health__row">
                                    <span className={`program-kpi-health__dot program-kpi-health__dot--${tone}`} />
                                    <span className="program-kpi-health__name">
                                      {kpi.name}
                                    </span>
                                    {hasActual ? (
                                      <>
                                        <div className="program-kpi-health__track">
                                          <div className={`program-kpi-health__fill program-kpi-health__fill--${tone}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className={`program-kpi-health__pct program-kpi-health__pct--${tone}`}>
                                          {pct}%
                                        </span>
                                      </>
                                    ) : (
                                      <span className="program-kpi-health__empty">Belum ada data</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            {kpiHealth === 'RED' && (
                              <div className="program-kpi-health__notice program-kpi-health__notice--red">
                                Perhatian: {kpiRedCount} indikator KPI di bawah ambang kritis — health program terpengaruh.
                              </div>
                            )}
                            {kpiHealth === 'YELLOW' && kpiRedCount === 0 && (
                              <div className="program-kpi-health__notice program-kpi-health__notice--yellow">
                                {kpiYellowCount} indikator KPI mendekati ambang warning.
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* ── Workstream preview — ringkas, 3 row teratas dengan progress ──
                    Mengisi white space Ringkasan dengan substansi yang sudah ada.
                    User dapat scan progress workstream tanpa pindah tab; klik nama
                    untuk drill ke detail workstream. */}
                {(detail.workstreams ?? []).length === 0 ? (
                  <div className="wi-section prog-ws-preview prog-ws-preview--empty">
                    <div className="prog-ws-preview__empty">
                      <span className="prog-ws-preview__empty-icon" aria-hidden="true">
                        <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 22 22" width="20">
                          <rect height="14" rx="2" width="16" x="3" y="4"/>
                          <path d="M7 9h8M7 13h5"/>
                        </svg>
                      </span>
                      <div className="prog-ws-preview__empty-text">
                        <p className="prog-ws-preview__empty-title">Belum ada workstream</p>
                        <p className="prog-ws-preview__empty-hint">Pecah program menjadi workstream untuk mulai mendistribusikan task ke tim.</p>
                      </div>
                      <button
                        type="button"
                        className="prog-ws-preview__empty-cta"
                        onClick={() => {
                          setActiveTab('workstream')
                          setShowCreateIni(true)
                        }}
                      >
                        Buat workstream pertama →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="wi-section prog-ws-preview">
                    <div className="prog-ws-preview__head">
                      <h3 className="prog-ws-preview__title">Workstream</h3>
                      {(detail.workstreams ?? []).length > 3 && (
                        <button
                          type="button"
                          className="prog-ws-preview__more"
                          onClick={() => setActiveTab('workstream')}
                        >
                          Lihat semua {(detail.workstreams ?? []).length} →
                        </button>
                      )}
                    </div>
                    <ul className="prog-ws-preview__list">
                      {(detail.workstreams ?? []).slice(0, 3).map(ws => {
                        const pct = Math.max(0, Math.min(100, ws.progressPercent ?? 0))
                        const tone = (ws.healthStatus ?? 'GREEN').toLowerCase()
                        return (
                          <li key={ws.id} className="prog-ws-preview__item">
                            <span className={`prog-ws-preview__dot prog-ws-preview__dot--${tone}`} aria-hidden="true" />
                            <button
                              type="button"
                              className="prog-ws-preview__name"
                              onClick={() => {
                                // Workstream detail dibuka via overlay di tab Struktur
                                // (selectedIniId pattern), bukan via route terpisah.
                                setActiveTab('workstream')
                                setSelectedIniId(ws.id)
                              }}
                              title={ws.name}
                            >
                              {ws.name}
                            </button>
                            <div className="prog-ws-preview__track" aria-hidden="true">
                              <div
                                className={`prog-ws-preview__fill prog-ws-preview__fill--${tone}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="prog-ws-preview__pct">{pct}%</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {/* ── Blocker callout — visible di Ringkasan tanpa perlu pindah tab ── */}
                {blockersError && (
                  <div className="prog-blocker-callout prog-blocker-callout--error">
                    <div className="prog-blocker-callout__head">
                      <span className="prog-blocker-callout__icon">{PIcon.blocker}</span>
                      <strong className="prog-blocker-callout__title">Gagal memuat data blocker</strong>
                      <button
                        type="button"
                        className="prog-blocker-callout__link"
                        onClick={() => setActiveTab('blocker')}
                      >
                        Coba di tab Hambatan →
                      </button>
                    </div>
                  </div>
                )}
                {!blockersError && blockers.length > 0 && (
                  <div className="prog-blocker-callout">
                    <div className="prog-blocker-callout__head">
                      <span className="prog-blocker-callout__icon">{PIcon.blocker}</span>
                      <strong className="prog-blocker-callout__title">{blockers.length} blocker aktif</strong>
                      <button
                        type="button"
                        className="prog-blocker-callout__link"
                        onClick={() => setActiveTab('blocker')}
                      >
                        Lihat semua →
                      </button>
                    </div>
                    <div className="prog-blocker-callout__list">
                      {blockers.slice(0, 3).map(b => {
                        const sevColor = b.severity === 'CRITICAL' || b.severity === 'HIGH'
                          ? 'var(--red)' : b.severity === 'MEDIUM' ? 'var(--yellow)' : 'var(--text-muted)'
                        return (
                          <div key={b.id} className="prog-blocker-callout__item">
                            <span className="prog-blocker-callout__sev" style={{ color: sevColor }}>
                              {b.severity}
                            </span>
                            <span className="prog-blocker-callout__desc">{b.title}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── Progress Log ── */}
                {detail.approvalStatus === 'ACTIVE' && (
                  <div className="wi-section">
                    <div className="wi-section__header">
                      <h3 className="wi-section__title">{PIcon.activity} Riwayat Progress</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {showProgressForm && (
                          <DraftStatusBadge
                            status={progressDraft.status}
                            lastSavedAt={progressDraft.lastSavedAt}
                          />
                        )}
                        <button
                          className="wi-btn wi-btn--sm wi-btn--outline"
                          onClick={() => setShowProgressForm(v => !v)}
                        >
                          {showProgressForm ? 'Tutup' : '+ Update Progress'}
                        </button>
                      </div>
                    </div>

                    {showProgressForm && (
                      <div className="prog-progress-form">
                        {progressDraft.hasDraft && progressDraft.status === 'restored' && progressDraft.lastSavedAt && (
                          <DraftRestoreBanner
                            savedAt={progressDraft.lastSavedAt}
                            onRestore={() => {
                              const p = progressDraft.restoredPayload as Partial<typeof progressForm> | null
                              if (p) setProgressForm(f => ({ ...f, ...p }))
                              progressDraft.acceptRestore()
                            }}
                            onDiscard={() => { void progressDraft.discard() }}
                          />
                        )}
                        <div className="prog-progress-form__row">
                          <label className="prog-progress-form__label">Periode</label>
                          <div className="prog-period-picker">
                            <div className="prog-period-picker__mode" role="tablist" aria-label="Mode periode">
                              <button
                                type="button"
                                role="tab"
                                aria-selected={periodMode === 'week'}
                                className="prog-period-picker__mode-btn"
                                data-active={periodMode === 'week'}
                                onClick={() => {
                                  if (periodMode === 'week') return
                                  setPeriodMode('week')
                                  setProgressForm(f => ({ ...f, period: currentIsoWeek() }))
                                }}
                              >
                                Mingguan
                              </button>
                              <button
                                type="button"
                                role="tab"
                                aria-selected={periodMode === 'month'}
                                className="prog-period-picker__mode-btn"
                                data-active={periodMode === 'month'}
                                onClick={() => {
                                  if (periodMode === 'month') return
                                  setPeriodMode('month')
                                  setProgressForm(f => ({ ...f, period: currentMonth() }))
                                }}
                              >
                                Bulanan
                              </button>
                            </div>
                            <input
                              type={periodMode === 'week' ? 'week' : 'month'}
                              className="wi-input prog-period-picker__input"
                              value={progressForm.period}
                              onChange={e => setProgressForm(f => ({ ...f, period: e.target.value }))}
                              aria-describedby="prog-period-preview"
                            />
                            <span
                              id="prog-period-preview"
                              className="prog-period-picker__preview"
                              data-format={isIsoWeek(progressForm.period) ? 'week' : 'month'}
                            >
                              {periodToLabel(progressForm.period)}
                            </span>
                          </div>
                        </div>
                        <div className="prog-progress-form__row">
                          <label className="prog-progress-form__label">Health</label>
                          <select
                            className="wi-input"
                            value={progressForm.healthAtTime}
                            onChange={e => setProgressForm(f => ({ ...f, healthAtTime: e.target.value as ProgressLogEntry['healthAtTime'] }))}
                          >
                            <option value="on_track">On Track</option>
                            <option value="at_risk">At Risk</option>
                            <option value="terlambat">Terlambat</option>
                            <option value="overdue">Lewat Tenggat</option>
                          </select>
                        </div>
                        <div className="prog-progress-form__row">
                          <label className="prog-progress-form__label">Progres Terkini *</label>
                          <textarea
                            className="wi-input"
                            rows={3}
                            value={progressForm.narrative}
                            onChange={e => setProgressForm(f => ({ ...f, narrative: e.target.value }))}
                            placeholder="Ceritakan perkembangan program minggu ini..."
                          />
                        </div>

                        {/* ── KPI Aktual Minggu Ini — composite weekly entry ──
                            Numbers behind the narrative. Optional; biarkan kosong
                            kalau tidak ada update. Submit progress log akan
                            otomatis POST setiap entry yang terisi sebagai
                            KpiValue dengan measurementDate = Jumat ISO week. */}
                        {(detail.kpis ?? []).length > 0 && (
                          <div className="prog-progress-form__row prog-progress-form__row--kpi">
                            <label className="prog-progress-form__label">
                              KPI Aktual Minggu Ini
                              <span className="prog-progress-form__hint">opsional · isi yang berubah saja</span>
                            </label>
                            <div className="prog-progress-form__kpi-list">
                              {(detail.kpis ?? []).map(kpi => {
                                const lastActual = kpi.actualValue != null
                                  ? formatKpiValue(kpi.actualValue, kpi.unitOfMeasure ?? '', kpi.dataType ?? undefined)
                                  : null
                                const targetLabel = formatKpiValue(kpi.targetValue, kpi.unitOfMeasure ?? '', kpi.dataType ?? undefined)
                                return (
                                  <div key={kpi.id} className="prog-progress-form__kpi-item">
                                    <div className="prog-progress-form__kpi-meta">
                                      <span className="prog-progress-form__kpi-name">{kpi.name}</span>
                                      <span className="prog-progress-form__kpi-sub">
                                        Target {targetLabel}
                                        {lastActual ? ` · terakhir ${lastActual}` : ' · belum ada actual'}
                                      </span>
                                    </div>
                                    <input
                                      className="wi-input prog-progress-form__kpi-input"
                                      type="number"
                                      step="any"
                                      inputMode="decimal"
                                      value={weeklyKpiActuals[kpi.id] ?? ''}
                                      onChange={e => setWeeklyKpiActuals(s => ({ ...s, [kpi.id]: e.target.value }))}
                                      placeholder={lastActual ?? '—'}
                                      aria-label={`Aktual baru untuk ${kpi.name}`}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className="prog-progress-form__row">
                          <label className="prog-progress-form__label">Kendala / Problem Identification</label>
                          <textarea
                            className="wi-input"
                            rows={2}
                            value={progressForm.kendala}
                            onChange={e => setProgressForm(f => ({ ...f, kendala: e.target.value }))}
                            placeholder="Hambatan yang dihadapi minggu ini (opsional)"
                          />
                        </div>
                        <div className="prog-progress-form__row">
                          <label className="prog-progress-form__label">Corrective Action</label>
                          <textarea
                            className="wi-input"
                            rows={2}
                            value={progressForm.correctiveAction}
                            onChange={e => setProgressForm(f => ({ ...f, correctiveAction: e.target.value }))}
                            placeholder="Tindakan korektif yang diambil untuk mengatasi kendala (opsional)"
                          />
                        </div>
                        <div className="prog-progress-form__row">
                          <label className="prog-progress-form__label">Next Step</label>
                          <textarea
                            className="wi-input"
                            rows={2}
                            value={progressForm.nextStep}
                            onChange={e => setProgressForm(f => ({ ...f, nextStep: e.target.value }))}
                            placeholder="Langkah selanjutnya & target periode berikutnya (opsional)"
                          />
                        </div>
                        <div className="prog-progress-form__row">
                          <label className="prog-progress-form__label">Dukungan Dibutuhkan</label>
                          <textarea
                            className="wi-input"
                            rows={2}
                            value={progressForm.dukunganDibutuhkan}
                            onChange={e => setProgressForm(f => ({ ...f, dukunganDibutuhkan: e.target.value }))}
                            placeholder="Support yang diperlukan dari stakeholder (opsional)"
                          />
                        </div>
                        {weeklyKpiErrors.length > 0 && (
                          <div className="prog-progress-form__kpi-errors" role="alert">
                            <strong>Progres tersimpan,</strong> tapi {weeklyKpiErrors.length} KPI gagal disimpan:
                            <ul>
                              {weeklyKpiErrors.map((msg, i) => <li key={i}>{msg}</li>)}
                            </ul>
                            <p className="prog-progress-form__kpi-errors-hint">
                              Coba lagi dari tab KPI atau retry submit setelah perbaikan.
                            </p>
                          </div>
                        )}
                        <div className="prog-progress-form__actions">
                          <button
                            className="wi-btn wi-btn--primary wi-btn--sm"
                            onClick={submitProgressLog}
                            disabled={progressFormSaving || !progressForm.narrative.trim()}
                          >
                            {progressFormSaving ? 'Menyimpan…' : 'Simpan Update'}
                          </button>
                          <button
                            className="wi-btn wi-btn--ghost wi-btn--sm"
                            onClick={() => setShowProgressForm(false)}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}

                    {progressLogLoading && progressLog.length === 0 ? (
                      <div className="prog-approval-log-skeleton" aria-label="Memuat riwayat progress">
                        <div className="prog-approval-log-skeleton__entry">
                          <SkeletonBlock width="60%" height={14} />
                          <SkeletonBlock width="42%" height={11} />
                        </div>
                        <div className="prog-approval-log-skeleton__entry">
                          <SkeletonBlock width="50%" height={14} />
                          <SkeletonBlock width="36%" height={11} />
                        </div>
                      </div>
                    ) : progressLog.length === 0 ? (
                      // CTA echo dihapus — tombol "+ Update Progress" sudah di
                      // header section ini, dan sidebar kanan punya empty state
                      // dengan CTA jelas. Slim line cukup supaya section tidak
                      // looks broken (header tanpa body).
                      <p className="hd-muted" style={{ fontSize: 12, margin: '2px 0 0' }}>Belum ada riwayat update.</p>
                    ) : (
                      <div className="prog-progress-log">
                        {progressLog.map(entry => {
                          const healthLabel: Record<string, string> = {
                            on_track: 'On Track', at_risk: 'At Risk', terlambat: 'Terlambat', overdue: 'Lewat Tenggat',
                          }
                          const healthTone: Record<string, string> = {
                            on_track: 'positive', at_risk: 'warning', terlambat: 'danger', overdue: 'danger',
                          }
                          const tone = healthTone[entry.healthAtTime] ?? 'default'
                          const date = new Date(entry.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                          return (
                            <div key={entry.id} className={`prog-progress-log__entry prog-progress-log__entry--${tone}`}>
                              <div className="prog-progress-log__header">
                                <span className="prog-progress-log__period">{entry.period}</span>
                                <span className={`prog-progress-log__health prog-progress-log__health--${tone}`}>
                                  {healthLabel[entry.healthAtTime] ?? entry.healthAtTime}
                                </span>
                                <span className="prog-progress-log__meta">{entry.createdByName} · {date}</span>
                              </div>
                              <p className="prog-progress-log__narrative">{entry.narrative}</p>
                              {(entry.kendala || entry.correctiveAction || entry.nextStep || entry.dukunganDibutuhkan) && (
                                <details className="prog-progress-log__details">
                                  <summary className="prog-progress-log__details-toggle">
                                    Detail kendala, tindak lanjut &amp; dukungan
                                  </summary>
                                  <div className="prog-progress-log__details-body">
                                    {entry.kendala && (
                                      <div className="prog-progress-log__kendala">
                                        <strong>Kendala:</strong> {entry.kendala}
                                      </div>
                                    )}
                                    {entry.correctiveAction && (
                                      <div className="prog-progress-log__corrective">
                                        <strong>Corrective action:</strong> {entry.correctiveAction}
                                      </div>
                                    )}
                                    {entry.nextStep && (
                                      <div className="prog-progress-log__nextstep">
                                        <strong>Next step:</strong> {entry.nextStep}
                                      </div>
                                    )}
                                    {entry.dukunganDibutuhkan && (
                                      <div className="prog-progress-log__support">
                                        <strong>Dukungan dibutuhkan:</strong> {entry.dukunganDibutuhkan}
                                        <div style={{ marginTop: 6 }}>
                                          <EscalationButton
                                            sourceType="PROGRESS_LOG"
                                            sourceId={entry.id}
                                            prefillTitle={`Dukungan untuk ${entry.period}`}
                                            prefillDescription={entry.dukunganDibutuhkan}
                                            linkedProgramId={numId}
                                            size="sm"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </details>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Approval History Log (posisi bawah, hanya kalau tidak
                    di-pin ke atas — lihat pinApprovalLogTop di atas) ── */}
                {!pinApprovalLogTop && renderApprovalLogSection()}

                {/* prog-pending-hint dihapus 2026-05-19 — sudah diserap ke
                    hint lifecycle banner di atas. Sebelumnya pesan "Menunggu
                    persetujuan KADIV" tampil 3 kali (status pill sidebar + banner
                    + hint box) padahal info-nya identik. */}

                {/* ── Completeness checklist (DRAFT only) ──
                    Sebelumnya juga muncul untuk PENDING_KASUB/PENDING_KADIV — tapi
                    di state PENDING checklist sudah pasti 3/3 (kalau tidak, submit
                    di-block sebelum endpoint), jadi panel cuma jadi visual noise
                    tanpa action. PIC saat PENDING hanya perlu konteks "menunggu" +
                    timeline, bukan ditampilkan to-do yang sudah selesai. */}
                {detail.approvalStatus === 'DRAFT' && (() => {
                  // Checklist gating: hanya item wajib untuk eksekusi. Channel sengaja
                  // diturunkan ke modal Edit Program saja (opsional, tidak gate aktivasi).
                  // hasKpi memuaskan baik via KPI APMS link maupun KPI internal (lihat
                  // Program::getReadinessAttribute), jadi label memakai "KPI" generik.
                  const checks = [
                    { done: !!(detail.description?.trim()), label: 'Deskripsi program diisi', cta: openEdit },
                    { done: !!detail.readiness?.hasWorkstream && !!detail.readiness?.hasTask, label: 'Minimal 1 workstream dengan 1 task', cta: () => setActiveTab('workstream') },
                    { done: !!detail.readiness?.hasKpi, label: 'KPI ditautkan (APMS atau internal)', cta: () => setActiveTab('kpi') },
                  ]
                  const doneCount = checks.filter(c => c.done).length
                  const allDone = doneCount === checks.length

                  // Saat allDone, render compact ribbon (1 row inline) — full panel
                  // dengan progress bar + list + hint paragraph terasa berlebihan
                  // ketika checklist sudah selesai. Mode pending tetap pakai full UI.
                  if (allDone && detail.approvalStatus === 'DRAFT') {
                    const role = currentUser?.roleType?.toUpperCase() ?? ''
                    const isAdmin = ['SUPERADMIN', 'ADMIN'].includes(role)
                    const isKadivAdmin = ['KADIV', 'SUPERADMIN', 'ADMIN'].includes(role)
                    const isSubmitter = detail.submittedById === currentUser?.id || detail.ownerId === currentUser?.id
                    const isInRevision = !!detail.rejectionNote
                    // Post-rejection: only PIC (owner/submitter) sees the resubmit CTA.
                    // KADIV reviewer step back agar tidak mem-bypass koreksi yang
                    // baru diminta sendiri lewat "Mulai Eksekusi". Admin tetap bisa
                    // override (escape hatch). Lihat ProgramController::activate.
                    if (isInRevision && !isSubmitter && !isAdmin) return null
                    if (!isKadivAdmin && !isSubmitter) return null
                    const nextApprover = role === 'KASUBDIV' ? 'KADIV' : 'KASUBDIV'
                    // Saat in-revision, PIC harus resubmit (bukan langsung activate)
                    // bahkan kalau dia kebetulan KADIV — flow approval harus utuh.
                    const useActivate = isKadivAdmin && !isInRevision
                    return (
                      <div className="prog-checklist-ribbon">
                        <span className="prog-checklist-ribbon__icon" aria-hidden="true">
                          <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 14 14" width="14"><path d="m2.5 7 3 3 6-7"/></svg>
                        </span>
                        <span className="prog-checklist-ribbon__label">
                          {isInRevision ? 'Siap diajukan ulang' : 'Program siap dieksekusi'}
                        </span>
                        <span className="prog-checklist-ribbon__sep" aria-hidden="true">·</span>
                        <span className="prog-checklist-ribbon__hint">
                          {isInRevision
                            ? `Ajukan ulang ke ${nextApprover} setelah perbaikan selesai.`
                            : useActivate
                              ? 'Tim langsung bisa eksekusi setelah diaktifkan.'
                              : `Persetujuan ${nextApprover} dibutuhkan sebelum eksekusi dimulai.`}
                        </span>
                        <button
                          className="btn btn--primary prog-checklist-ribbon__cta"
                          disabled={approvalLoading}
                          onClick={() => useActivate ? void activateProgram() : setApprovalModal('submit')}
                          type="button"
                        >
                          {useActivate ? 'Mulai Eksekusi →' : `Ajukan ke ${nextApprover} →`}
                        </button>
                      </div>
                    )
                  }

                  return (
                    <div className="prog-checklist">
                      <div className="prog-checklist__head">
                        <span className="prog-checklist__title">Siapkan Program Agar Tim Bisa Mulai</span>
                        <span className="prog-checklist__count">{doneCount}/{checks.length}</span>
                      </div>
                      <div className="prog-checklist__track">
                        <div className="prog-checklist__fill" style={{ width: `${Math.round((doneCount / checks.length) * 100)}%` }} />
                      </div>
                      <ul className="prog-checklist__list">
                        {checks.map((c, i) => (
                          <li key={i} className={`prog-checklist__item${c.done ? ' prog-checklist__item--done' : ''}`}>
                            <span className="prog-checklist__bullet">
                              {c.done
                                ? <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 12 12" width="12"><path d="M2 6.5 5 9.5l5-7"/></svg>
                                : <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><circle cx="6" cy="6" r="4.5"/></svg>
                              }
                            </span>
                            <span className="prog-checklist__label">{c.label}</span>
                            {!c.done && c.cta && (
                              <button className="prog-checklist__btn" onClick={c.cta} type="button">Lengkapi →</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}

              </div>

              {/* Right: side rail — ProgressStatusPanel + UpdatePanel (Sprint 4)
                  Pola Charter: side rail substantive (% Progress visual + latest
                  update narrative), bukan list 6 plain-text facts yang dulu boros
                  whitespace. */}
              <aside className="prog-overview-v2__side">
                {(() => {
                  const pct = Math.max(0, Math.min(100, detail.progressPercent ?? 0))
                  const health = normalizeHealthStatus(detail.healthStatus)
                  const healthTone = health === 'GREEN' ? 'on-track' : health === 'YELLOW' ? 'at-risk' : 'off-track'
                  const wsList = detail.workstreams ?? []
                  const wsTotal = wsList.length
                  const wsDone = wsList.filter(w => (w.progressPercent ?? 0) >= 100).length
                  const disp = getProgramDisplayStatus(detail)
                  return (
                    <div className={`prog-status-panel prog-status-panel--${healthTone}`}>
                      <div className="prog-status-panel__label">% Progress</div>
                      <div className="prog-status-panel__big">{pct}%</div>
                      <div className="prog-status-panel__bar" aria-hidden="true">
                        <div className="prog-status-panel__bar-fill" style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                      <div className="prog-status-panel__health-row">
                        <span className={`prog-status-panel__dot prog-status-panel__dot--${healthTone}`} />
                        <span className="prog-status-panel__health-label">{disp.label}</span>
                      </div>
                      {wsTotal > 0 && (
                        <div className="prog-status-panel__breakdown">
                          <span className="prog-status-panel__breakdown-num">{wsDone}</span>
                          <span className="prog-status-panel__breakdown-sep">/</span>
                          <span className="prog-status-panel__breakdown-total">{wsTotal}</span>
                          <span>workstream selesai</span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {(() => {
                  const latest = progressLog[0]
                  const formatPeriod = (iso: string) => {
                    try {
                      return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                    } catch { return iso }
                  }
                  return (
                    <div className="prog-update-panel">
                      <div className="prog-update-panel__head">
                        <span className="prog-update-panel__label">Update Saat Ini</span>
                        {latest && (
                          <span className="prog-update-panel__period">{formatPeriod(latest.createdAt)}</span>
                        )}
                      </div>
                      {latest?.narrative ? (
                        <p className="prog-update-panel__note">{latest.narrative}</p>
                      ) : (
                        <p className="prog-update-panel__empty">
                          Belum ada update progress.<br />
                          <span className="prog-update-panel__cta">Klik &quot;+ Update Progress&quot; di kolom utama</span>
                        </p>
                      )}
                    </div>
                  )
                })()}

                {(detail.progresTerkini || detail.dukunganDibutuhkan) && (
                  <div className="prog-update-panel">
                    {detail.progresTerkini && (
                      <>
                        <div className="prog-update-panel__head">
                          <span className="prog-update-panel__label">Progres Terkini</span>
                        </div>
                        <p className="prog-update-panel__note">{detail.progresTerkini}</p>
                      </>
                    )}
                    {detail.dukunganDibutuhkan && (
                      <>
                        <div className="prog-update-panel__head" style={{ marginTop: detail.progresTerkini ? 12 : 0 }}>
                          <span className="prog-update-panel__label">Dukungan Dibutuhkan</span>
                        </div>
                        <p className="prog-update-panel__note">{detail.dukunganDibutuhkan}</p>
                      </>
                    )}
                  </div>
                )}
              </aside>
            </div>
          )}

          {/* ── WORKSTREAM ─────────────────────────────────────────────── */}
          {activeTab === 'workstream' && (
            <div className="prog-detail-tab-body">
              <div className="program-detail-section-head program-detail-section-head--split">
                <div className="program-detail-section-title-row">
                  <h3 className="wi-section__title program-detail-section-title">
                    {PIcon.layers}
                    Workstream
                  </h3>
                  {/* Badge count dihilangkan saat <= 1 — info redundan karena list
                      langsung di bawah heading. Tampilkan hanya saat banyak supaya
                      user dapat scan total dengan cepat. */}
                  {(detail.workstreams ?? []).length > 1 && (
                    <span className="section-badge">{(detail.workstreams ?? []).length}</span>
                  )}
                </div>
                {roleAccess.canCreateWorkstream && (
                  <button className="btn btn--ghost program-detail-section-btn" onClick={() => {
                    if (userDirectory.length === 0) {
                      void api.get<{ data: Array<{ id: number; name: string; positionTitle?: string | null }> }>('/users/directory')
                        .then(r => setUserDirectory(r.data ?? []))
                        .catch((err) => console.error('[Atlas] Gagal memuat user directory:', err))
                    }
                    setShowCreateIni(true)
                  }} type="button">
                    + Workstream Baru
                  </button>
                )}
              </div>

              {(detail.workstreams ?? []).length === 0 ? (
                <SectionState
                  tone="info"
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                  }
                  title="Belum ada workstream"
                  text="Pecah program menjadi workstream untuk mulai mendistribusikan task ke tim."
                />
              ) : (
                <div className="workstream-list">
                  {(detail.workstreams ?? [])
                    .slice()
                    .sort((a, b) => {
                      const order: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
                      return (order[a.healthStatus] ?? 1) - (order[b.healthStatus] ?? 1)
                    })
                    .map(ini => {
                      const iDays = ini.targetCompletion ? daysUntil(ini.targetCompletion) : null
                      const iDeadline = iDays !== null ? formatDaysLabel(iDays) : null
                      const isConfirmDel = confirmDelIniId === ini.id
                      return (
                        <div key={ini.id}>
                          <div
                            className={`workstream-row${selectedIniId === ini.id ? ' workstream-row--active' : ''}`}
                            onClick={() => setSelectedIniId(ini.id === selectedIniId ? null : ini.id)}
                            onKeyDown={e => e.key === 'Enter' && setSelectedIniId(ini.id)}
                            role="button"
                            tabIndex={0}
                            data-health={normalizeHealthStatus(ini.healthStatus).toLowerCase()}
                            aria-label={`Workstream ${ini.name}, status: ${normalizeHealthStatus(ini.healthStatus)}`}
                          >
                            {/* HealthPill (At Risk/On Track) dihilangkan dari row header.
                                Status sudah dikomunikasikan via border-left accent yang
                                colored sesuai health (data-health attribute), kombinasi
                                dengan aria-label untuk screen reader. Dua indikator =
                                redundant + ambil real-estate yang dipakai lebih baik
                                untuk content title. */}
                            <div className="workstream-row__info">
                              <strong>{ini.name}</strong>
                              <span className="workstream-row__meta">
                                <span className="code-badge workstream-row__code">{ini.code}</span>
                                {/* Health status text — eksplisit dropdown setelah
                                    HealthPill dihapus dari row. Stripe kiri tetap
                                    tampil sebagai cue, text ini supaya tidak perlu
                                    hover untuk tahu status. Hanya tampil saat non-green
                                    (At Risk/Terlambat) — green tidak perlu disebut,
                                    progress bar sudah menunjukkan health implisit. */}
                                {(() => {
                                  const h = normalizeHealthStatus(ini.healthStatus)
                                  if (h === 'GREEN') return null
                                  const label = h === 'YELLOW' ? 'At Risk' : h === 'RED' ? 'Terlambat' : 'Lewat tenggat'
                                  return (
                                    <span className={`workstream-row__health workstream-row__health--${h.toLowerCase()}`}>{label}</span>
                                  )
                                })()}
                                {(ini.startDate || ini.targetCompletion) && (
                                  <span className="workstream-row__dates">
                                    {fmtDateShort(ini.startDate)} → {fmtDateShort(ini.targetCompletion)}
                                  </span>
                                )}
                                {iDeadline && (
                                  <span className={`program-deadline program-deadline--${iDeadline.tone}`}>{iDeadline.label}</span>
                                )}
                                {(ini.picPersons ?? []).length > 0 && (() => {
                                  const primaryId = ini.primaryPicPersonId ?? ini.picPersons![0].id
                                  const ordered = [...ini.picPersons!].sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : 0))
                                  return (
                                    <span className="workstream-row__pic-list">
                                      {ordered.slice(0, 2).map(p => (
                                        <span
                                          key={p.id}
                                          className={`workstream-row__pic-chip${p.id === primaryId ? ' workstream-row__pic-chip--primary' : ''}`}
                                          title={p.id === primaryId ? 'PIC Utama' : 'PIC'}
                                        >
                                          {p.id === primaryId && <span className="workstream-row__pic-chip-star">★</span>}
                                          {p.name}
                                        </span>
                                      ))}
                                      {ordered.length > 2 && (
                                        <span className="workstream-row__pic-chip">+{ordered.length - 2}</span>
                                      )}
                                    </span>
                                  )
                                })()}
                              {ini.budgetIdr != null && (
                                <span className="ws-budget">
                                  Anggaran: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(ini.budgetIdr))}
                                  {ini.budgetSpent != null && ini.budgetSpent > 0 && (
                                    <span className="ws-budget__spent"> · Terpakai: {Math.round(Number(ini.budgetSpent) / Number(ini.budgetIdr) * 100)}%</span>
                                  )}
                                </span>
                              )}
                              </span>
                            </div>
                            <div className="workstream-row__progress">
                              <div className="progress-bar progress-bar--mini">
                                <div className="progress-bar__fill" style={{ width: `${ini.progressPercent}%` }} />
                              </div>
                              <span>{ini.progressPercent}%</span>
                            </div>
                            {roleAccess.canCreateWorkstream && (
                              <div className="workstream-row__actions" onClick={e => e.stopPropagation()}>
                                <button
                                  className="ws-icon-btn"
                                  onClick={() => openEditIni(ini)}
                                  type="button"
                                  title="Edit workstream"
                                  aria-label="Edit workstream"
                                >
                                  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="14"><path d="M9.5 2.5 11.5 4.5 4.5 11.5 2 12l.5-2.5z"/></svg>
                                </button>
                                <button
                                  className={`ws-icon-btn ws-icon-btn--danger${isConfirmDel ? ' is-confirm' : ''}`}
                                  onClick={() => setConfirmDelIniId(isConfirmDel ? null : ini.id)}
                                  type="button"
                                  title="Hapus workstream"
                                  aria-label="Hapus workstream"
                                >
                                  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="14"><path d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 7.5h4l.5-7.5M6 6.5v3M8 6.5v3"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                          {isConfirmDel && (
                            <div className="workstream-delete-confirm">
                              <span className="workstream-delete-confirm__text">Hapus workstream ini?</span>
                              {confirmDelIniId === ini.id && delIniError && (
                                <span className="wid-form__error">{delIniError}</span>
                              )}
                              <button
                                className="btn btn--danger"
                                disabled={delIniSaving}
                                onClick={() => void submitDelIni(ini.id)}
                                type="button"
                              >
                                {delIniSaving ? '…' : 'Hapus'}
                              </button>
                              <button
                                className="btn btn--ghost workstream-row__action"
                                disabled={delIniSaving}
                                onClick={() => { setConfirmDelIniId(null); setDelIniError(null) }}
                                type="button"
                              >
                                Batal
                              </button>
                            </div>
                          )}
                          {selectedIniId === ini.id && (
                            <div className={`panel workstream-detail-panel${planningTaskId ? ' workstream-detail-panel--split' : ''}`}>
                              <div className="workstream-detail-panel__content">
                              {iniDetailLoading ? (
                                <div className="workstream-detail-panel__body"><SkeletonStack lines={[90, 75, 60]} /></div>
                              ) : iniDetail ? (() => {
                                // Tasks with phaseId only counted via phases (avoid double-count when workstream.tasks also returns them)
                                const allTasks = [
                                  ...((iniDetail.phases ?? []).flatMap(p => p.tasks)),
                                  ...((iniDetail.tasks ?? []).filter(t => !t.phaseId)),
                                ]
                                const taskCount = allTasks.length
                                const doneCount = allTasks.filter(t => t.status === 'COMPLETED' || t.percentComplete === 100).length
                                const blockerCount = allTasks.filter(t => t.isBlocked).length
                                const phaseCount = (iniDetail.phases ?? []).length
                                return (
                                <>
                                  {/* Workstream info baseline: chips "1 Phase / 1 Task"
                                      sengaja dihilangkan — count sudah tertulis di phase
                                      header ("0/1 selesai") + di task list itself. Yang
                                      signal kuat (Selesai, Blocker) tetap tampil sebagai
                                      chip karena memberi info actionable. */}
                                  {(iniDetail.description || doneCount > 0 || blockerCount > 0) && (
                                    <div className="workstream-panel-info">
                                      {(doneCount > 0 || blockerCount > 0) && (
                                        <span className="workstream-panel-info__stats">
                                          {doneCount > 0 && <span className="ws-stat ws-stat--done">{doneCount} Selesai</span>}
                                          {blockerCount > 0 && <span className="ws-stat ws-stat--blocker">{blockerCount} Blocker</span>}
                                        </span>
                                      )}
                                      {iniDetail.description && (
                                        <span className="workstream-panel-info__item workstream-panel-info__item--desc">
                                          {iniDetail.description}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {(iniDetail.phases ?? []).length === 0 && (iniDetail.tasks ?? []).length === 0 ? (
                                    <div className="workstream-empty-body">
                                      <p className="workstream-empty-body__text">
                                        <strong>Belum ada phase &amp; task di workstream ini.</strong>
                                        <span className="workstream-empty-body__hint">
                                          Mulai dengan menambahkan phase pertama untuk mengelompokkan tahapan,
                                          atau task langsung jika tidak butuh pengelompokan.
                                        </span>
                                      </p>
                                      {roleAccess.canCreateWorkstream && (
                                        <button
                                          className="btn btn--ghost workstream-empty-body__btn"
                                          onClick={() => { setCpWorkstreamId(ini.id); setShowCreatePhase(true) }}
                                          type="button"
                                        >
                                          + Tambah Phase Pertama
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="workstream-phase-list">
                                      {(iniDetail.phases ?? []).map((phase, idx) => (
                                        <div key={phase.id} className="phase-group">
                                          <div className="phase-group__header">
                                            <span className="phase-group__eyebrow">Phase</span>
                                            <span className="phase-group__order">{idx + 1}</span>
                                            <span className="phase-group__name">{phase.name}</span>
                                            {phase.tasks.length > 0 && (
                                              <span className="phase-group__count">
                                                {phase.tasks.filter(t => t.status === 'COMPLETED' || t.percentComplete === 100).length}/{phase.tasks.length} selesai
                                              </span>
                                            )}
                                            {!['PLANNING', 'BACKLOG', 'READY'].includes(phase.status) && (
                                              <span className="wi-status-chip phase-group__status" data-status={phase.status}>{formatStatusLabel(phase.status)}</span>
                                            )}
                                            {roleAccess.canCreateWorkstream && confirmDelPhaseId !== phase.id && (
                                              <div className="phase-group__actions" onClick={e => e.stopPropagation()}>
                                                <button className="phase-group__action-btn" onClick={() => openEditPhase(phase)} title="Edit phase" type="button">✎</button>
                                                <button className="phase-group__action-btn phase-group__action-btn--del" onClick={() => setConfirmDelPhaseId(phase.id)} title="Hapus phase" type="button">×</button>
                                              </div>
                                            )}
                                            {confirmDelPhaseId === phase.id && (
                                              <div className="phase-group__del-confirm" onClick={e => e.stopPropagation()}>
                                                {delPhaseError && <span className="wid-form__error">{delPhaseError}</span>}
                                                <span className="phase-group__del-text">
                                                  Hapus phase ini{phase.tasks.length > 0 ? ` beserta ${phase.tasks.length} task di dalamnya` : ''}?
                                                </span>
                                                <button className="btn btn--danger phase-group__del-btn" disabled={delPhaseSaving} onClick={() => void submitDelPhase(phase.id)} type="button">{delPhaseSaving ? '…' : 'Hapus'}</button>
                                                <button className="btn btn--ghost phase-group__del-btn" disabled={delPhaseSaving} onClick={() => { setConfirmDelPhaseId(null); setDelPhaseError(null) }} type="button">Batal</button>
                                              </div>
                                            )}
                                          </div>
                                          <div className="phase-group__tasks">
                                            {phase.tasks.length === 0 ? (
                                              <p className="phase-group__empty">Belum ada task.</p>
                                            ) : (
                                              phase.tasks.map(item => (
                                                <button
                                                  key={item.id}
                                                  className="wi-row"
                                                  onClick={() => setPlanningTaskId(item.id)}
                                                  type="button"
                                                >
                                                  <div className="wi-row__info">
                                                    {item.isBlocked && <span className="wi-row__blocker" title="Blocked" />}
                                                    <span className="code-badge">{item.code}</span>
                                                    <div className="wi-row__info-text">
                                                      <span className="wi-row__title">{item.title}</span>
                                                      {item.description && (
                                                        <span className="wi-row__desc" title={item.description}>
                                                          {item.description}
                                                        </span>
                                                      )}
                                                      {item.output && (
                                                        <span className="wi-row__output" title={`Output: ${item.output}`}>
                                                          → {item.output}
                                                        </span>
                                                      )}
                                                      {(item.startDate || item.targetCompletion) && (
                                                        <span className="wi-row__meta">
                                                          {fmtDateShort(item.startDate)} → {fmtDateShort(item.targetCompletion)}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>
                                                  <div className="wi-row__right">
                                                    {/* PIC chip — primary assignee dengan avatar inisial.
                                                        Fallback "Belum ada PIC" muted kalau task belum di-assign,
                                                        memberi cue actionable bukan info hilang. */}
                                                    <TaskPicChip picPersons={item.picPersons} />
                                                    {/* Priority dot disembunyikan saat MEDIUM (default).
                                                        Tampil hanya untuk HIGH/CRITICAL/LOW = signal deliberate.
                                                        Konsisten dengan panel TaskPlanningPanel yang juga hide MEDIUM. */}
                                                    {item.priority && item.priority.toUpperCase() !== 'MEDIUM' && (
                                                      <span className={`wi-row__priority wi-row__priority--${item.priority.toLowerCase()}`} title={item.priority} />
                                                    )}
                                                    <span className="wi-pct-track" aria-hidden="true">
                                                      <span className="wi-pct-fill" style={{ width: `${item.percentComplete}%` }} />
                                                    </span>
                                                    <span className="wi-pct">{item.percentComplete}%</span>
                                                    {!['BACKLOG', 'READY'].includes(item.status) && (
                                                      <span className="wi-status-chip" data-status={item.status}>{formatStatusLabel(item.status)}</span>
                                                    )}
                                                  </div>
                                                </button>
                                              ))
                                            )}
                                            {roleAccess.canCreateWorkstream && (
                                              <button
                                                className="btn btn--ghost wi-add-subtask-btn"
                                                onClick={() => {
                                                  setCstPhaseId(phase.id); setCstWorkstreamId(ini.id); setShowCreateSubTask(true)
                                                  if (cstDirectory.length === 0) {
                                                    void api.get<{ data: Array<{ id: number; name: string; positionTitle: string | null }> }>('/users/directory')
                                                      .then(r => setCstDirectory(r.data ?? []))
                                                      .catch(() => { /* non-fatal: PIC selector akan kosong */ })
                                                  }
                                                }}
                                                type="button"
                                              >
                                                + Tambah Task
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}

                                      {(iniDetail.tasks ?? []).filter(t => !t.phaseId).length > 0 && (
                                        <div className="phase-group">
                                          <div className="phase-group__header phase-group__header--unphased">
                                            <span className="phase-group__name">Task tanpa phase</span>
                                          </div>
                                          <div className="phase-group__tasks">
                                            {(iniDetail.tasks ?? []).filter(t => !t.phaseId).map(item => (
                                              <button
                                                key={item.id}
                                                className="wi-row"
                                                onClick={() => setPlanningTaskId(item.id)}
                                                type="button"
                                              >
                                                <div className="wi-row__info">
                                                  {item.isBlocked && <span className="wi-row__blocker" title="Blocked" />}
                                                  <span className="code-badge">{item.code}</span>
                                                  <div className="wi-row__info-text">
                                                    <span className="wi-row__title">{item.title}</span>
                                                    {item.description && (
                                                      <span className="wi-row__desc" title={item.description}>
                                                        {item.description}
                                                      </span>
                                                    )}
                                                    {item.output && (
                                                      <span className="wi-row__output" title={`Output: ${item.output}`}>
                                                        → {item.output}
                                                      </span>
                                                    )}
                                                    {(item.startDate || item.targetCompletion) && (
                                                      <span className="wi-row__meta">
                                                        {fmtDateShort(item.startDate)} → {fmtDateShort(item.targetCompletion)}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="wi-row__right">
                                                  <TaskPicChip picPersons={item.picPersons} />
                                                  {item.priority && <span className={`wi-row__priority wi-row__priority--${item.priority.toLowerCase()}`} title={item.priority} />}
                                                  <span className="wi-pct-track" aria-hidden="true">
                                                    <span className="wi-pct-fill" style={{ width: `${item.percentComplete}%` }} />
                                                  </span>
                                                  <span className="wi-pct">{item.percentComplete}%</span>
                                                  <span className="wi-status-chip" data-status={item.status}>{formatStatusLabel(item.status)}</span>
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {roleAccess.canCreateWorkstream && (
                                        <button
                                          className="btn btn--ghost wi-add-phase-btn"
                                          onClick={() => { setCpWorkstreamId(ini.id); setShowCreatePhase(true) }}
                                          type="button"
                                        >
                                          + Tambah Phase
                                        </button>
                                      )}

                                      {(iniDetail.phases ?? []).some(p => p.tasks.length > 0) && (
                                        <div className="workstream-ren-hint">
                                          <span className="workstream-ren-hint__text">Jadwal Plan tergenerate otomatis dari tanggal task.</span>
                                          <button
                                            className="workstream-ren-hint__link"
                                            onClick={() => setActiveTab('execution')}
                                            type="button"
                                          >
                                            Lihat di Jadwal →
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                                )
                              })() : null}
                              </div>{/* end workstream-detail-panel__content */}
                              {planningTaskId && (
                                <div className={`tpp-push-wrap${planningPanelClosing ? ' tpp-push-wrap--closing' : ''}`}>
                                  <TaskPlanningPanel
                                    taskId={planningTaskId}
                                    mode="push"
                                    onClose={triggerPlanningPanelClose}
                                    onRefresh={() => selectedIniId && void reloadIniDetail(selectedIniId)}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── EXECUTION GRID ─────────────────────────────────────────── */}
          {activeTab === 'execution' && (
            <div className="prog-detail-tab-body">
              <ExecutionTab programId={numId} programName={detail?.name} approvalStatus={detail?.approvalStatus} />
            </div>
          )}

          {/* ── BLOCKER ────────────────────────────────────────────────── */}
          {activeTab === 'blocker' && (
            <div className="prog-detail-tab-body">
              <div className="program-detail-section-head">
                <h3 className="wi-section__title program-detail-section-title">
                  {PIcon.blocker}
                  Hambatan Program
                </h3>
                {/* Badge count: hide saat 0. "0 open" = noise tanpa info actionable.
                    Tampilkan hanya saat ada blocker aktif sebagai signal scan-cepat. */}
                {blockers.length > 0 && (
                  <span className="section-badge section-badge--red">
                    {blockers.length} open
                  </span>
                )}
              </div>
              {blockersLoading ? (
                <SkeletonStack lines={[90, 75, 60]} />
              ) : blockers.length === 0 ? (() => {
                // Context-aware empty state: planning phase (program belum aktif)
                // vs eksekusi (program aktif, tapi memang tidak ada blocker).
                // Beda message supaya user paham apakah ini "belum bisa report"
                // atau "memang aman".
                // 'REJECTED' literal never persists — rejected programs already have
                // status='DRAFT' (with rejectionNote), so DRAFT alone covers them.
                const inPlanning = ['DRAFT', 'PLANNING', 'PENDING_KASUB', 'PENDING_KADIV']
                  .includes(detail.approvalStatus ?? '')
                return inPlanning ? (
                  <SectionState
                    tone="info"
                    icon={
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    }
                    title="Belum ada hambatan dilaporkan"
                    text="Tab ini aktif penuh setelah program masuk fase Eksekusi. Tim melaporkan blocker dari task yang sedang dikerjakan."
                  />
                ) : (
                  <SectionState
                    tone="success"
                    icon={
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    }
                    title="Tidak ada hambatan aktif"
                    text="Program berjalan lancar tanpa blocker. Status auto-update saat tim melaporkan hambatan dari task."
                  />
                )
              })() : (
                <div className="program-list-stack">
                  {blockers.map(b => {
                    const severity = b.severity in SEV_COLOR ? b.severity : 'LOW'
                    const severityLabel = severity.charAt(0) + severity.slice(1).toLowerCase()
                    return (
                      <div key={b.id} className={`blocker-item blocker-item--${severity}`}>
                        <span className={`severity-badge severity-badge--${severity}`}>
                          {severityLabel}
                        </span>
                        <div className="blocker-item__body">
                          <div className="blocker-item__title">{b.title}</div>
                          <div className="blocker-item__meta">
                            {b.task.workstream.name} › {b.task.title}
                          </div>
                        </div>
                        <span className="blocker-item__age" title="Berapa lama blocker ini dilaporkan">
                          {b.daysOpen === 0 ? 'Hari ini' : `${b.daysOpen} hari`}
                        </span>
                        <button
                          className="btn btn--ghost blocker-item__action"
                          onClick={() => navigate(`/execution/tasks/${b.task.id}`)}
                          type="button"
                        >
                          Buka task →
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}


          {/* ── DISKUSI ────────────────────────────────────────────────── */}
          {/* ── KPI APMS ──────────────────────────────────────────────── */}
          {activeTab === 'kpi' && (
            <div className="prog-detail-tab-body">
              <div className="prog-kpi-head">
                <div className="prog-kpi-head__title-row">
                  <h3 className="wi-section__title prog-kpi-head__title">
                    {PIcon.kpi}
                    KPI APMS Terkait
                  </h3>
                  {/* Badge count: hide saat 0 — redundant info ketika empty state
                      sudah komunikasi "Belum ada KPI yang terhubung". */}
                  {kpiLinks.length > 0 && (
                    <span className="section-badge">{kpiLinks.length}</span>
                  )}
                  {detail?.hasNoApmsKpi && (
                    <span className="prog-kpi-flag prog-kpi-flag--warning">Tidak ada KPI APMS</span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {apmsLastFetchedAt && (() => {
                      const minsAgo = Math.floor((Date.now() - new Date(apmsLastFetchedAt).getTime()) / 60000)
                      const isStale = minsAgo >= 15
                      return (
                        <span
                          style={{ fontSize: 11.5, color: isStale ? 'var(--yellow)' : 'var(--text-muted)' }}
                          title={`Data APMS diambil ${new Date(apmsLastFetchedAt).toLocaleTimeString('id-ID')}`}
                        >
                          Sinkron {minsAgo < 1 ? 'baru saja' : `${minsAgo} menit lalu`}
                        </span>
                      )
                    })()}
                    <button
                      type="button"
                      className="prog-kpi-sync-btn"
                      onClick={() => void refreshApmsKpis()}
                      title="Sync ulang data KPI dari APMS/AGHRIS"
                    >
                      <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 12 12" width="11" aria-hidden="true">
                        <path d="M1.5 5a4.5 4.5 0 0 1 8-2.5L10.5 2M10.5 7a4.5 4.5 0 0 1-8 2.5L1.5 10M10.5 1.5v2.5h-2.5M3.5 8h-2v2.5"/>
                      </svg>
                      Sync
                    </button>
                  </div>
                </div>
                <p className="prog-kpi-head__note">
                  {detail?.hasNoApmsKpi
                    ? 'Program ini ditandai tidak memiliki KPI di APMS. Gunakan KPI Internal di bawah untuk mencatat target dan realisasi.'
                    : 'Atributkan kode KPI dari AGHRIS yang relevan dengan program ini. Data KPI tetap bersumber dari APMS.'}
                </p>
              </div>

              {/* Add KPI APMS — searchable dropdown */}
              <div className="prog-kpi-picker">
                <div className="kpi-link-add-row">
                  <input
                    className="kpi-link-input"
                    type="text"
                    placeholder="Cari KPI APMS berdasarkan kode atau nama…"
                    value={kpiLinkSearch}
                    onChange={e => { setKpiLinkSearch(e.target.value); setKpiLinkDropdownOpen(true) }}
                    onFocus={() => setKpiLinkDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setKpiLinkDropdownOpen(false), 150)}
                    disabled={kpiLinkSaving}
                    autoComplete="off"
                  />
                </div>
                {kpiLinkDropdownOpen && kpiSearchResults.length > 0 && (
                  <div className="prog-kpi-dropdown">
                    {kpiSearchResults.map(k => (
                      <button
                        key={k.kode}
                        className="prog-kpi-dropdown__item"
                        type="button"
                        onMouseDown={() => void addKpiLink(k.kode)}
                      >
                        <span className="code-badge prog-kpi-dropdown__code">{k.kode}</span>
                        <span className="prog-kpi-dropdown__name">{k.nama}</span>
                        <span className="prog-kpi-dropdown__weight">{k.bobot}%</span>
                      </button>
                    ))}
                  </div>
                )}
                {kpiLinkDropdownOpen && kpiLinkSearch.length > 0 && kpiSearchResults.length === 0 && (
                  <div className="prog-kpi-dropdown prog-kpi-dropdown--empty">
                    Tidak ada KPI yang cocok.
                  </div>
                )}
              </div>
              {kpiLinkError && (
                <p className="prog-kpi-error">{kpiLinkError}</p>
              )}

              {/* KPI link list — empty state lebih informatif. Saat hasNoApmsKpi
                  flagged, copy berbeda karena user sengaja skip APMS. */}
              {kpiLinks.length === 0 ? (
                <div className="prog-kpi-empty">
                  {detail?.hasNoApmsKpi
                    ? 'Program ini tidak dihubungkan ke KPI APMS. Lihat bagian Target KPI Internal di bawah untuk mendefinisikan metrik program.'
                    : 'Cari kode atau nama KPI APMS di atas untuk menghubungkan program dengan target AGHRIS yang relevan.'}
                </div>
              ) : (
                <div className="kpi-link-list prog-kpi-card-list">
                  {kpiLinks.map(link => {
                    const meta = apmsKpis.find(k => k.kode === link.apmsKpiCode)
                    const displayName = meta?.nama ?? link.apmsKpiName ?? link.note ?? '—'
                    const displayBobot = meta?.bobot ?? link.apmsKpiBobot
                    const realisasi = meta?.realisasi
                    const sasaran = meta?.sasaran
                    const skor = meta?.skor
                    const apmsAchievePct = (sasaran && sasaran > 0 && realisasi != null)
                      ? Math.min(100, Math.round((realisasi / sasaran) * 100))
                      : null
                    const apmsStatus = meta
                      ? (apmsAchievePct != null && apmsAchievePct >= 95 ? 'GREEN' : apmsAchievePct != null && apmsAchievePct >= 80 ? 'YELLOW' : 'RED')
                      : null
                    const apmsTone = apmsStatus ? apmsStatus.toLowerCase() : 'muted'
                    return (
                      <div key={link.apmsKpiCode} className="prog-kpi-card">
                        <div className={`prog-kpi-card__head${meta ? '' : ' prog-kpi-card__head--compact'}`}>
                          <span className="code-badge">{link.apmsKpiCode}</span>
                          <span className={`prog-kpi-card__name${displayName === '—' ? ' prog-kpi-card__name--muted' : ''}`}>
                            {displayName}
                          </span>
                          {displayBobot != null && (
                            <span className="prog-kpi-card__weight">bobot {displayBobot}%</span>
                          )}
                          {apmsStatus && (
                            <span className={`prog-kpi-status prog-kpi-status--${apmsTone}`}>{apmsStatus}</span>
                          )}
                          <button
                            className="kpi-link-remove prog-kpi-card__remove"
                            onClick={() => void removeKpiLink(link.apmsKpiCode)}
                            title="Hapus link"
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                        {meta && apmsAchievePct != null && (
                          <div className="prog-kpi-progress">
                            <div className="prog-kpi-progress__track">
                              <div
                                className={`prog-kpi-progress__fill prog-kpi-progress__fill--${apmsTone}`}
                                style={{ width: `${apmsAchievePct}%` }}
                              />
                            </div>
                            <span className="prog-kpi-progress__meta">
                              {realisasi} / {sasaran} ({apmsAchievePct}%)
                              {skor != null && <> · skor {skor.toFixed(1)}</>}
                            </span>
                          </div>
                        )}
                        {!meta && (
                          <p className="prog-kpi-card__note">Data APMS tidak tersedia saat ini.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* KPI Internal */}
              <div className="prog-kpi-internal">
                <div className="prog-kpi-internal__header">
                  <div className="prog-kpi-internal__copy">
                    <h4 className="wi-section__title" style={{ marginBottom: 2 }}>
                      {PIcon.chart}
                      Target KPI Internal
                    </h4>
                    <p className="prog-kpi-internal__desc">
                      Untuk program yang tidak memiliki KPI di APMS.
                    </p>
                    {(() => {
                      const kpis = detail?.kpis ?? []
                      if (kpis.length === 0) return null
                      const counts = kpis.reduce((acc, kpi) => {
                        const actual = kpi.actualValue ?? 0
                        const target = kpi.targetValue
                        if (kpi.actualValue == null || target === 0) { acc.unset++; return acc }
                        const warn = kpi.warningThreshold ?? target * 0.95
                        const crit = kpi.criticalThreshold ?? target * 0.8
                        if (actual <= crit) acc.red++
                        else if (actual <= warn) acc.yellow++
                        else acc.green++
                        return acc
                      }, { green: 0, yellow: 0, red: 0, unset: 0 })
                      // Summary chips dengan status dot, drop ASCII arrows
                      // (▲ ~ ▼ —) yang terlihat amatir. Status dipresentasi
                      // via dot+text yang konsisten dengan rest of UI.
                      return (
                        <div className="prog-kpi-summary">
                          {counts.green > 0 && (
                            <span className="prog-kpi-summary-pill prog-kpi-summary-pill--green">
                              <span className="prog-kpi-summary-pill__dot" />
                              {counts.green} on track
                            </span>
                          )}
                          {counts.yellow > 0 && (
                            <span className="prog-kpi-summary-pill prog-kpi-summary-pill--yellow">
                              <span className="prog-kpi-summary-pill__dot" />
                              {counts.yellow} at risk
                            </span>
                          )}
                          {counts.red > 0 && (
                            <span className="prog-kpi-summary-pill prog-kpi-summary-pill--red">
                              <span className="prog-kpi-summary-pill__dot" />
                              {counts.red} off track
                            </span>
                          )}
                          {counts.unset > 0 && (
                            <span className="prog-kpi-summary-pill prog-kpi-summary-pill--muted">
                              <span className="prog-kpi-summary-pill__dot" />
                              {counts.unset} belum diukur
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  <button
                    className="btn btn--ghost prog-kpi-internal__toggle"
                    type="button"
                    onClick={() => {
                      if (showKpiInternalForm) {
                        setEditingKpiId(null)
                        setKpiInternal({ name: '', targetValue: '', unitOfMeasure: '', reviewFrequency: 'MONTHLY' })
                      }
                      setShowKpiInternalForm(v => !v)
                    }}
                  >
                    {showKpiInternalForm ? 'Batal' : '+ Buat Target'}
                  </button>
                </div>
                {showKpiInternalForm && (
                  <form className="prog-kpi-form" onSubmit={(e) => void submitKpiInternal(e)}>
                    {kpiInternalError && (
                      <p className="prog-kpi-error prog-kpi-error--compact">{kpiInternalError}</p>
                    )}
                    {/* Kode field DIHAPUS — auto-generated dari programCode + sequence
                        (lihat submitKpiInternal). User tidak perlu memikirkan
                        unique-ness; sistem generate `PRG-X-Y-K01`, `-K02`, dst.
                        Pada edit mode, code tetap immutable (BE patch endpoint
                        tidak terima field code). */}
                    <div className="form-field prog-form-field">
                      <label>Nama KPI <span className="form-field__required">*</span></label>
                      <input
                        required minLength={2} maxLength={120}
                        placeholder="Nama metrik"
                        value={kpiInternal.name}
                        onChange={e => setKpiInternal(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="prog-form-grid prog-form-grid--triple">
                      <div className="form-field prog-form-field">
                        <label>Target <span className="form-field__required">*</span></label>
                        <input
                          required type="number" step="any" placeholder="0"
                          value={kpiInternal.targetValue}
                          onChange={e => setKpiInternal(f => ({ ...f, targetValue: e.target.value }))}
                        />
                      </div>
                      <div className="form-field prog-form-field">
                        <label>Satuan</label>
                        <input
                          maxLength={30} placeholder="%, unit, dsb"
                          value={kpiInternal.unitOfMeasure}
                          onChange={e => setKpiInternal(f => ({ ...f, unitOfMeasure: e.target.value }))}
                        />
                      </div>
                      <div className="form-field prog-form-field">
                        <label>Frekuensi</label>
                        <select
                          className="form-input"
                          value={kpiInternal.reviewFrequency}
                          onChange={e => setKpiInternal(f => ({ ...f, reviewFrequency: e.target.value }))}
                        >
                          <option value="WEEKLY">Mingguan</option>
                          <option value="MONTHLY">Bulanan</option>
                          <option value="QUARTERLY">Kuartalan</option>
                          <option value="ANNUALLY">Tahunan</option>
                        </select>
                      </div>
                    </div>
                    <div className="prog-form-actions">
                      <button
                        className="profile-save-btn"
                        type="submit"
                        disabled={kpiInternalSaving || !kpiInternal.name || !kpiInternal.targetValue}
                      >
                        {kpiInternalSaving ? 'Menyimpan…' : (editingKpiId ? 'Simpan Perubahan' : 'Simpan KPI')}
                      </button>
                    </div>
                  </form>
                )}
                {(detail.kpis ?? []).length > 0 && (
                  <div className={`prog-kpi-card-list prog-kpi-card-list--internal${showKpiInternalForm ? ' prog-kpi-card-list--spaced' : ''}`}>
                    {(detail.kpis ?? []).map(kpi => {
                      const pct = getKpiFillPercent(kpi.actualValue, kpi.targetValue)
                      const warn = kpi.warningThreshold ?? kpi.targetValue * 0.95
                      const crit = kpi.criticalThreshold ?? kpi.targetValue * 0.8
                      const actual = kpi.actualValue ?? 0
                      const hasActual = kpi.actualValue != null
                      const kpiStatus = !hasActual ? 'UNSET' : actual >= warn ? 'GREEN' : actual >= crit ? 'YELLOW' : 'RED'
                      const kpiTone = kpiStatus === 'UNSET' ? 'muted' : kpiStatus.toLowerCase()
                      const isRecording = recordingKpiId === kpi.id
                      // Color accent border-left berdasarkan status — memberikan
                      // signal visual cepat tanpa user perlu baca text status.
                      // Pattern Linear/Notion: row dengan colored stripe.
                      return (
                        <div
                          key={kpi.id}
                          className={`prog-kpi-card prog-kpi-card--internal prog-kpi-card--tone-${kpiTone}`}
                        >
                          <div className="prog-kpi-card__head">
                            <span className="code-badge">{kpi.code}</span>
                            <span className="prog-kpi-card__name">{kpi.name}</span>
                            {kpi.reviewFrequency && (
                              <span className="prog-kpi-card__freq" title="Frekuensi pengukuran">
                                {kpi.reviewFrequency === 'WEEKLY' ? 'Mingguan'
                                  : kpi.reviewFrequency === 'MONTHLY' ? 'Bulanan'
                                  : kpi.reviewFrequency === 'QUARTERLY' ? 'Kuartalan'
                                  : 'Tahunan'}
                              </span>
                            )}
                            <span className={`prog-kpi-status prog-kpi-status--${kpiTone}`}>
                              {kpiStatus !== 'UNSET' ? kpiStatus : '—'}
                            </span>
                            {/* Edit button — hover-only di KPI card. Authorization
                                check: tidak boleh edit saat PENDING_KASUB/KADIV. */}
                            {!['PENDING_KASUB', 'PENDING_KADIV'].includes(detail.approvalStatus ?? '') && (
                              <button
                                type="button"
                                className="prog-kpi-card__edit"
                                onClick={() => openEditKpi(kpi)}
                                title="Edit KPI"
                                aria-label="Edit KPI"
                              >
                                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12" aria-hidden="true">
                                  <path d="M9.5 2.5 11.5 4.5 4.5 11.5 2 12l.5-2.5z"/>
                                </svg>
                              </button>
                            )}
                            {detail.approvalStatus === 'ACTIVE' ? (
                              <button
                                type="button"
                                className="btn btn--ghost prog-kpi-card__action"
                                onClick={() => { setRecordingKpiId(isRecording ? null : kpi.id); setKpiActualError(null) }}
                              >
                                {isRecording ? 'Batal' : 'Catat Aktual'}
                              </button>
                            ) : (
                              <span
                                className="prog-kpi-card__action-locked"
                                title="Nilai aktual KPI bisa diisi setelah program masuk fase Eksekusi"
                              >
                                <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 12 12" width="11" aria-hidden="true">
                                  <rect height="6" rx="1" width="8" x="2" y="5"/>
                                  <path d="M4 5V3.5a2 2 0 0 1 4 0V5"/>
                                </svg>
                                Perencanaan
                              </span>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="prog-kpi-progress">
                            <div className="prog-kpi-progress__track">
                              <div
                                className={`prog-kpi-progress__fill prog-kpi-progress__fill--${kpiTone}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="prog-kpi-progress__meta">
                              {formatKpiValue(actual, kpi.unitOfMeasure, kpi.dataType)} / {formatKpiValue(kpi.targetValue, kpi.unitOfMeasure, kpi.dataType)} ({pct}%)
                            </span>
                          </div>
                          {kpi.lastMeasuredDate && (
                            <p className="prog-kpi-card__note">
                              Terakhir diukur: {new Date(kpi.lastMeasuredDate).toLocaleDateString('id-ID')}
                            </p>
                          )}
                          {/* Inline record actual form */}
                          {isRecording && (
                            <form className="prog-kpi-record-form" onSubmit={(e) => void submitKpiActual(e)}>
                              {kpiActualError && <p className="prog-kpi-error prog-kpi-error--compact">{kpiActualError}</p>}
                              <div className="prog-form-grid prog-form-grid--equal prog-form-grid--compact">
                                <div className="form-field prog-form-field prog-form-field--compact">
                                  <label>Tanggal Ukur</label>
                                  <input type="date" value={kpiActual.measurementDate} onChange={e => setKpiActual(f => ({ ...f, measurementDate: e.target.value }))} required />
                                </div>
                                <div className="form-field prog-form-field prog-form-field--compact">
                                  <label>Nilai Aktual{kpi.unitOfMeasure ? ` (${kpi.unitOfMeasure})` : ''}</label>
                                  <input type="number" step="any" value={kpiActual.actualValue} onChange={e => setKpiActual(f => ({ ...f, actualValue: e.target.value }))} required placeholder="0" />
                                </div>
                              </div>
                              <div className="form-field prog-form-field prog-form-field--compact">
                                <label>Catatan (opsional)</label>
                                <input maxLength={200} value={kpiActual.statusNotes} onChange={e => setKpiActual(f => ({ ...f, statusNotes: e.target.value }))} placeholder="Penjelasan singkat…" />
                              </div>
                              <div className="prog-form-actions">
                                <button className="profile-save-btn" type="submit" disabled={kpiActualSaving || !kpiActual.actualValue}>
                                  {kpiActualSaving ? 'Menyimpan…' : 'Simpan'}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      ) : null}

      {/* ── Modal: Edit Program ──────────────────────────────────────── */}
      {(showEdit || epClosing) && createPortal(
        <div
          className={`modal-backdrop${epClosing ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !epSaving && triggerEpClose()}
        >
          <div aria-describedby={editProgramDescId} aria-labelledby={editProgramTitleId} aria-modal="true" className="modal modal--wide" ref={editProgramDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{programSummary?.code ?? 'Program'}</span>
                <h3 className="modal__title" id={editProgramTitleId}>Edit Program</h3>
                <p className="modal-subtitle" id={editProgramDescId}>
                  Perbarui identitas, status, dan target waktu program tanpa meninggalkan konteks detail yang sedang dibuka.
                </p>
              </div>
              <button aria-label="Tutup" className="modal__close" disabled={epSaving} onClick={triggerEpClose} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => void submitEdit(e)}>
              <div className="modal__body">
                {/* Governance hint untuk program ACTIVE — Opsi A: transparency
                    over gate-keeping. PIC tetap bisa edit, tapi commitment field
                    akan ter-log + KADIV dapat notif. Hint kasih clarity supaya
                    user tidak kaget. */}
                {detail?.approvalStatus === 'ACTIVE' && (
                  <div className="prog-edit-commitment-hint" role="note">
                    <span className="prog-edit-commitment-hint__icon" aria-hidden="true">
                      <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="14"><circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9.5h.01"/></svg>
                    </span>
                    <div className="prog-edit-commitment-hint__body">
                      <strong>Program sudah aktif</strong>
                      <span>
                        Perubahan field <em>commitment</em> (target waktu, prioritas, anggaran, kelompok, pilar strategis) akan tercatat di Riwayat Persetujuan dan KADIV diberitahu otomatis. Detail field (deskripsi, PIC, narrative progress) free-edit tanpa notif.
                      </span>
                    </div>
                  </div>
                )}
                {epError && <div className="prog-modal-error">{epError}</div>}
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Identitas Program</h4>
                    <p>Rapikan kode, nama, dan ringkasan singkat agar roster dan laporan tetap mudah dipindai.</p>
                  </div>
                  <div className="prog-form-grid prog-form-grid--wide">
                    <div className="form-field">
                      <label>Kode <span className="form-field__required">*</span></label>
                      <input maxLength={40} onChange={e => setEpForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required type="text" value={epForm.code} />
                    </div>
                    <div className="form-field">
                      <label>Nama Program <span className="form-field__required">*</span></label>
                      <input maxLength={120} onChange={e => setEpForm(f => ({ ...f, name: e.target.value }))} required type="text" value={epForm.name} />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Deskripsi</label>
                    <textarea className="composer__input prog-modal-textarea" maxLength={400} onChange={e => setEpForm(f => ({ ...f, description: e.target.value }))} rows={2} value={epForm.description} />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Prioritas &amp; Jadwal</h4>
                    <p>Selaraskan prioritas dan horizon waktu dengan kondisi terbaru.</p>
                  </div>
                  {detail?.approvalStatus === 'ACTIVE' && (
                    <div className="form-field">
                      <label>Status operasional</label>
                      <select className="form-input" onChange={e => setEpForm(f => ({ ...f, status: e.target.value }))} value={epForm.status}>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="ON_HOLD">On Hold</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>
                  )}
                  <div className="form-field">
                    <label>Prioritas</label>
                    <select className="form-input" onChange={e => setEpForm(f => ({ ...f, priority: e.target.value }))} value={epForm.priority}>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                  <div className="prog-form-grid prog-form-grid--equal">
                    <div className="form-field">
                      <label>Tanggal Mulai</label>
                      <input onChange={e => setEpForm(f => ({ ...f, startDate: e.target.value }))} type="date" value={epForm.startDate} />
                    </div>
                    <div className="form-field">
                      <label>Target Selesai</label>
                      <input onChange={e => setEpForm(f => ({ ...f, targetEndDate: e.target.value }))} type="date" value={epForm.targetEndDate} />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>
                      Channel Komunikasi
                      <span className="form-field__hint"> · tautkan ke channel agar update program juga muncul di sana</span>
                    </label>
                    <select
                      className="form-input"
                      value={epForm.linkedChannelId === '' ? '' : String(epForm.linkedChannelId)}
                      onChange={e => setEpForm(f => ({ ...f, linkedChannelId: e.target.value }))}
                    >
                      <option value="">— Tidak ditautkan —</option>
                      {channels
                        .filter(c => !c.isDirectMessage)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            #{c.name}{c.type === 'PRIVATE' ? ' (private)' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                </section>
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>PIC &amp; Tim</h4>
                    <p>Tetapkan siapa yang bertanggung jawab atas program ini. PIC Utama memiliki hak penuh; Tim PIC dapat turut mengedit.</p>
                  </div>
                  {userDirectory.length === 0 ? (
                    <p className="wi-sidebar-value" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Memuat daftar pengguna…</p>
                  ) : (
                    <>
                      {(() => {
                        const canEditOwner = !!detail && roleAccess.canEditProgram(
                          isOwner,
                          detail.approvalStatus === 'DRAFT' && !!detail.rejectionNote,
                        )
                        if (!canEditOwner) return null
                        const currentOwnerId = epOwnerId ?? detail?.ownerId ?? 0
                        const currentOwner = userDirectory.find(u => u.id === currentOwnerId)
                        const q = epOwnerQuery.trim().toLowerCase()
                        const ownerCandidates = userDirectory.filter(u => u.id !== currentOwnerId)
                        const ownerFiltered = (q
                          ? ownerCandidates.filter(u =>
                              u.name.toLowerCase().includes(q) ||
                              (u.positionTitle ?? '').toLowerCase().includes(q)
                            )
                          : ownerCandidates
                        ).slice(0, 6)
                        const pickOwner = (id: number) => {
                          setEpOwnerId(id)
                          setEpOwnerEditing(false)
                          setEpOwnerQuery('')
                          setEpPicIds(prev => prev.filter(x => x !== id))
                        }
                        return (
                          <div className="form-field" style={{ marginBottom: 14 }}>
                            <label>PIC Utama</label>
                            {!epOwnerEditing ? (
                              <div className="prog-owner-current">
                                <div className="prog-owner-current__info">
                                  <span className="prog-owner-current__name">{currentOwner?.name ?? '—'}</span>
                                  {currentOwner?.positionTitle && (
                                    <span className="prog-owner-current__role">{currentOwner.positionTitle}</span>
                                  )}
                                </div>
                                <button
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => { setEpOwnerEditing(true); setEpOwnerQuery('') }}
                                  type="button"
                                >
                                  Ganti
                                </button>
                              </div>
                            ) : (
                              <div className="prog-pic-search">
                                <div className="prog-pic-searchbox">
                                  <svg className="prog-pic-searchbox__icon" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="14"><circle cx="6" cy="6" r="4.5"/><path d="m12.5 12.5-3-3"/></svg>
                                  <input
                                    autoFocus
                                    className="prog-pic-searchbox__input"
                                    onChange={e => setEpOwnerQuery(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        if (ownerFiltered.length > 0) pickOwner(ownerFiltered[0].id)
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault()
                                        setEpOwnerEditing(false); setEpOwnerQuery('')
                                      }
                                    }}
                                    placeholder="Cari PIC Utama baru…"
                                    type="text"
                                    value={epOwnerQuery}
                                  />
                                  <button
                                    aria-label="Batal ganti PIC Utama"
                                    className="prog-pic-searchbox__cancel"
                                    onClick={() => { setEpOwnerEditing(false); setEpOwnerQuery('') }}
                                    type="button"
                                  >
                                    <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
                                  </button>
                                </div>
                                {ownerFiltered.length === 0 ? (
                                  <p className="prog-pic-empty">Tidak ada nama yang cocok.</p>
                                ) : (
                                  <ul className="prog-pic-results">
                                    {ownerFiltered.map(u => (
                                      <li key={u.id}>
                                        <button
                                          className="prog-pic-result"
                                          onClick={() => pickOwner(u.id)}
                                          type="button"
                                        >
                                          <span className="prog-pic-result__name">{u.name}</span>
                                          {u.positionTitle && (
                                            <span className="prog-pic-result__role">{u.positionTitle}</span>
                                          )}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>Tim PIC (co-PIC)</label>
                      {(() => {
                        const ownerId = epOwnerId ?? detail?.ownerId ?? 0
                        const selected = epPicIds
                          .filter(id => id !== ownerId)
                          .map(id => userDirectory.find(u => u.id === id))
                          .filter((u): u is { id: number; name: string; positionTitle?: string | null } => !!u)
                        const q = epPicQuery.trim().toLowerCase()
                        const candidates = userDirectory.filter(u =>
                          u.id !== ownerId && !epPicIds.includes(u.id)
                        )
                        const filtered = (q
                          ? candidates.filter(u =>
                              u.name.toLowerCase().includes(q) ||
                              (u.positionTitle ?? '').toLowerCase().includes(q)
                            )
                          : candidates
                        ).slice(0, 6)
                        const addPic = (id: number) => {
                          setEpPicIds(prev => prev.includes(id) ? prev : [...prev, id])
                          setEpPicQuery('')
                        }
                        const removePic = (id: number) =>
                          setEpPicIds(prev => prev.filter(x => x !== id))
                        return (
                          <div className="prog-pic-search">
                            {selected.length > 0 && (
                              <div className="prog-pic-chips">
                                {selected.map(u => (
                                  <span key={u.id} className="prog-pic-chip">
                                    <span className="prog-pic-chip__name">{u.name}</span>
                                    <button
                                      aria-label={`Hapus ${u.name}`}
                                      className="prog-pic-chip__remove"
                                      onClick={() => removePic(u.id)}
                                      type="button"
                                    >
                                      <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 10 10" width="10"><path d="m1 1 8 8M9 1 1 9" /></svg>
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="prog-pic-searchbox">
                              <svg className="prog-pic-searchbox__icon" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="14"><circle cx="6" cy="6" r="4.5"/><path d="m12.5 12.5-3-3"/></svg>
                              <input
                                className="prog-pic-searchbox__input"
                                onChange={e => setEpPicQuery(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (filtered.length > 0) addPic(filtered[0].id)
                                  }
                                }}
                                placeholder="Cari nama atau jabatan…"
                                type="text"
                                value={epPicQuery}
                              />
                            </div>
                            {filtered.length === 0 ? (
                              <p className="prog-pic-empty">
                                {q ? 'Tidak ada nama yang cocok.' : 'Semua pengguna sudah dipilih.'}
                              </p>
                            ) : (
                              <ul className="prog-pic-results">
                                {filtered.map(u => (
                                  <li key={u.id}>
                                    <button
                                      className="prog-pic-result"
                                      onClick={() => addPic(u.id)}
                                      type="button"
                                    >
                                      <span className="prog-pic-result__name">{u.name}</span>
                                      {u.positionTitle && (
                                        <span className="prog-pic-result__role">{u.positionTitle}</span>
                                      )}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
                </section>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" disabled={epSaving} onClick={triggerEpClose} type="button">Batal</button>
                <button className="profile-save-btn" disabled={epSaving || !epForm.code.trim() || !epForm.name.trim()} type="submit">
                  {epSaving ? 'Menyimpan…' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Modal: Create Workstream ─────────────────────────────────── */}
      {(showCreateIni || ciClosing) && createPortal(
        <div
          className={`modal-backdrop${ciClosing ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !ciSaving && triggerCiClose()}
        >
          <div aria-labelledby={createWorkstreamTitleId} aria-modal="true" className="modal" ref={createWorkstreamDialogRef} role="dialog" tabIndex={-1}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape' && !ciSaving) triggerCiClose() }}
          >
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={createWorkstreamTitleId}>Workstream Baru</h3>
                <p className="modal-subtitle">Tambahkan workstream dalam program ini.</p>
              </div>
              <button aria-label="Tutup" className="modal__close" disabled={ciSaving} onClick={triggerCiClose} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => void submitCreateIni(e)}>
              <div className="modal__body">
                {ciError && <div className="prog-modal-error">{ciError}</div>}
                <div className="form-field">
                  <label>Nama <span className="form-field__required">*</span></label>
                  <input autoFocus maxLength={120} onChange={e => setCiForm(f => ({ ...f, name: e.target.value }))} required type="text" value={ciForm.name} />
                </div>
                <div className="form-field">
                  <label>Deskripsi</label>
                  <textarea className="composer__input prog-modal-textarea" maxLength={400} onChange={e => setCiForm(f => ({ ...f, description: e.target.value }))} rows={2} value={ciForm.description} />
                </div>
                <div className="prog-form-grid prog-form-grid--equal">
                  <div className="form-field">
                    <label>Tanggal Mulai</label>
                    <input onChange={e => setCiForm(f => ({ ...f, startDate: e.target.value }))} type="date" value={ciForm.startDate} />
                  </div>
                  <div className="form-field">
                    <label>Target Selesai <span className="form-field__required">*</span></label>
                    <input onChange={e => setCiForm(f => ({ ...f, targetCompletion: e.target.value }))} required type="date" value={ciForm.targetCompletion} />
                  </div>
                </div>
                <div className="form-field">
                  <label>
                    Owner Workstream
                    <span className="form-field__hint"> · reviewer task yang masuk IN_REVIEW</span>
                  </label>
                  <select
                    className="form-input"
                    value={ciOwnerId ?? currentUser?.id ?? ''}
                    onChange={e => setCiOwnerId(Number(e.target.value))}
                  >
                    {userDirectory.length === 0 && currentUser && (
                      <option value={currentUser.id}>{currentUser.name} (Anda)</option>
                    )}
                    {userDirectory.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}{u.id === currentUser?.id ? ' (Anda)' : ''}
                        {u.positionTitle ? ` — ${u.positionTitle}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Penanggung Jawab</label>
                  <div className="wid-pic-adder" style={{ position: 'relative' }}>
                    {ciPicIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {ciPicIds.map(uid => {
                          const u = userDirectory.find(x => x.id === uid)
                          return (
                            <span className="wid-pic-chip" key={uid}>
                              {u?.name ?? `#${uid}`}
                              <button className="wid-pic-chip__remove" type="button"
                                onClick={() => setCiPicIds(prev => {
                                  const next = prev.filter(id => id !== uid)
                                  if (ciPrimaryPicId === uid) setCiPrimaryPicId(next[0] ?? null)
                                  return next
                                })}>×</button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <input
                      className="wid-pic-search"
                      onChange={e => setCiPicSearch(e.target.value)}
                      placeholder="+ Cari nama..."
                      style={{ width: '100%' }}
                      type="text"
                      value={ciPicSearch}
                    />
                    {ciPicSearch.length > 0 && (() => {
                      const filtered = userDirectory.filter(u => !ciPicIds.includes(u.id) && u.name.toLowerCase().includes(ciPicSearch.toLowerCase())).slice(0, 6)
                      return filtered.length > 0 ? (
                        <div className="wid-pic-dropdown">
                          {filtered.map(u => (
                            <button className="wid-pic-dropdown__item" key={u.id} type="button"
                              onMouseDown={() => {
                                setCiPicIds(prev => {
                                  const next = [...prev, u.id]
                                  if (!ciPrimaryPicId) setCiPrimaryPicId(u.id)
                                  return next
                                })
                                setCiPicSearch('')
                              }}>
                              <span className="wid-pic-dropdown__name">{u.name}</span>
                              {u.positionTitle && <span className="wid-pic-dropdown__role">{u.positionTitle}</span>}
                            </button>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                </div>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" disabled={ciSaving} onClick={triggerCiClose} type="button">Batal</button>
                <button className="profile-save-btn" disabled={ciSaving || ciForm.name.trim().length < 3 || !ciForm.targetCompletion} type="submit">
                  {ciSaving ? 'Menyimpan…' : 'Buat Workstream'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Modal: Edit Workstream ──────────────────────────────────── */}
      {(showEditIni || eiClosing) && createPortal(
        <div
          className={`modal-backdrop${eiClosing ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !eiSaving && triggerEiClose()}
        >
          <div aria-describedby={editWorkstreamDescId} aria-labelledby={editWorkstreamTitleId} aria-modal="true" className="modal modal--wide" ref={editWorkstreamDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{programSummary?.code ?? 'Program'}</span>
                <h3 className="modal__title" id={editWorkstreamTitleId}>Edit Workstream</h3>
                <p className="modal-subtitle" id={editWorkstreamDescId}>
                  Sesuaikan narasi, prioritas, dan tenggat workstream agar tetap sinkron dengan ritme eksekusi program.
                </p>
              </div>
              <button aria-label="Tutup" className="modal__close" disabled={eiSaving} onClick={triggerEiClose} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => void submitEditIni(e)}>
              <div className="modal__body modal__body--compact">
                {eiError && <div className="prog-modal-error">{eiError}</div>}
                <div className="form-field">
                  <label>Nama <span className="form-field__required">*</span></label>
                  <input maxLength={120} onChange={e => setEiForm(f => ({ ...f, name: e.target.value }))} required type="text" value={eiForm.name} />
                </div>
                <div className="form-field">
                  <label>Deskripsi</label>
                  <textarea className="composer__input prog-modal-textarea" maxLength={400} onChange={e => setEiForm(f => ({ ...f, description: e.target.value }))} rows={2} value={eiForm.description} />
                </div>
                {detail?.approvalStatus === 'ACTIVE' && (
                  <div className="form-field">
                    <label>Status</label>
                    <select className="form-input" onChange={e => setEiForm(f => ({ ...f, status: e.target.value }))} value={eiForm.status}>
                      <option value="BACKLOG">Backlog</option>
                      <option value="READY">Ready</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                )}
                <div className="prog-form-grid prog-form-grid--equal">
                  <div className="form-field">
                    <label>Tanggal Mulai</label>
                    <input onChange={e => setEiForm(f => ({ ...f, startDate: e.target.value }))} type="date" value={eiForm.startDate} />
                  </div>
                  <div className="form-field">
                    <label>Target Selesai <span className="form-field__required">*</span></label>
                    <input onChange={e => setEiForm(f => ({ ...f, targetCompletion: e.target.value }))} required type="date" value={eiForm.targetCompletion} />
                    {!eiForm.targetCompletion && <span className="form-field__hint form-field__hint--warn">Tanggal tidak valid atau belum diisi</span>}
                  </div>
                </div>
                <div className="ws-pic-section">
                  <label className="ws-pic-section__label">Penanggung Jawab</label>
                  <input
                    className="ws-pic-section__search"
                    onChange={e => setEiPicSearch(e.target.value)}
                    placeholder="Cari nama..."
                    type="text"
                    value={eiPicSearch}
                  />
                  <div className="ws-pic-list">
                    {userDirectory
                      .filter(u => u.name.toLowerCase().includes(eiPicSearch.toLowerCase()))
                      .map(u => {
                        const checked = eiPicIds.includes(u.id)
                        return (
                          <label key={u.id} className={`ws-pic-item${checked ? ' ws-pic-item--checked' : ''}`}>
                            <input
                              checked={checked}
                              className="ws-pic-item__check"
                              onChange={() => setEiPicIds(prev => {
                                const next = prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                                if (eiPrimaryPicId === u.id && !next.includes(u.id)) setEiPrimaryPicId(next[0] ?? null)
                                if (next.length > 0 && !eiPrimaryPicId) setEiPrimaryPicId(next[0])
                                return next
                              })}
                              type="checkbox"
                            />
                            <span className="ws-pic-item__name">{u.name}</span>
                            {u.positionTitle && <span className="ws-pic-item__role">{u.positionTitle}</span>}
                          </label>
                        )
                      })}
                  </div>
                  {eiPicIds.length > 1 && (
                    <div className="ws-pic-primary">
                      <label className="ws-pic-primary__label">PIC Utama</label>
                      <select
                        className="ws-pic-primary__select"
                        value={eiPrimaryPicId ?? eiPicIds[0]}
                        onChange={e => setEiPrimaryPicId(Number(e.target.value))}
                      >
                        {eiPicIds.map(uid => {
                          const u = userDirectory.find(x => x.id === uid)
                          return <option key={uid} value={uid}>{u?.name ?? `User #${uid}`}</option>
                        })}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" disabled={eiSaving} onClick={triggerEiClose} type="button">Batal</button>
                <button className="profile-save-btn" disabled={eiSaving || eiForm.name.trim().length < 3 || !eiForm.targetCompletion} type="submit">
                  {eiSaving ? 'Menyimpan…' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
      {/* ── Modal: Edit Phase (Tugas) ───────────────────────────────────── */}
      {(showEditPhase || ephClosing) && createPortal(
        <div
          className={`modal-backdrop${ephClosing ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !ephSaving && triggerEphClose()}
        >
          <div aria-labelledby={editPhaseTitleId} aria-modal="true" className="modal" ref={editPhaseDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={editPhaseTitleId}>Edit Phase</h3>
                <p className="modal-subtitle">{editPhase?.name}</p>
              </div>
              <button aria-label="Tutup" className="modal__close" disabled={ephSaving} onClick={triggerEphClose} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => void submitEditPhase(e)}>
              <div className="modal__body">
                {ephError && <div className="prog-modal-error">{ephError}</div>}
                <div className="form-field">
                  <label>Nama Phase <span className="form-field__required">*</span></label>
                  <input autoFocus maxLength={120} onChange={e => setEphForm(f => ({ ...f, name: e.target.value }))} required type="text" value={ephForm.name} />
                </div>
                <div className="form-field">
                  <label>Deskripsi</label>
                  <textarea className="composer__input prog-modal-textarea" maxLength={400} onChange={e => setEphForm(f => ({ ...f, description: e.target.value }))} rows={2} value={ephForm.description} />
                </div>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" disabled={ephSaving} onClick={triggerEphClose} type="button">Batal</button>
                <button className="profile-save-btn" disabled={ephSaving || !ephForm.name.trim()} type="submit">
                  {ephSaving ? 'Menyimpan…' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Modal: Create Phase (Tugas) ─────────────────────────────────── */}
      {(showCreatePhase || cpClosing) && createPortal(
        <div
          className={`modal-backdrop${cpClosing ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !cpSaving && triggerCpClose()}
        >
          <div aria-labelledby={createPhaseTitleId} aria-modal="true" className="modal" ref={createPhaseDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={createPhaseTitleId}>Phase Baru</h3>
                <p className="modal-subtitle">Tambahkan phase (tahapan utama) dalam workstream ini.</p>
              </div>
              <button aria-label="Tutup" className="modal__close" disabled={cpSaving} onClick={triggerCpClose} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => void submitCreatePhase(e)}>
              <div className="modal__body">
                {cpError && <div className="prog-modal-error">{cpError}</div>}
                <div className="form-field">
                  <label>Nama Phase <span className="form-field__required">*</span></label>
                  <input
                    autoFocus
                    maxLength={120}
                    onChange={e => setCpForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Pemetaan Struktur Utang & Audit Baseline"
                    required
                    type="text"
                    value={cpForm.name}
                  />
                </div>
                <div className="form-field">
                  <label>Deskripsi</label>
                  <textarea
                    className="composer__input prog-modal-textarea"
                    maxLength={400}
                    onChange={e => setCpForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    value={cpForm.description}
                  />
                </div>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" disabled={cpSaving} onClick={triggerCpClose} type="button">Batal</button>
                <button className="profile-save-btn" disabled={cpSaving || !cpForm.name.trim()} type="submit">
                  {cpSaving ? 'Menyimpan…' : 'Buat Phase'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Modal: Create Subtask ────────────────────────────────────────── */}
      {(showCreateSubTask || cstClosing) && createPortal(
        <div
          className={`modal-backdrop${cstClosing ? ' modal-backdrop--closing' : ''}`}
          onClick={() => !cstSaving && triggerCstClose()}
        >
          <div aria-labelledby={createSubTaskTitleId} aria-modal="true" className="modal" ref={createSubTaskDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={createSubTaskTitleId}>Task Baru</h3>
                <p className="modal-subtitle">Tambahkan task di dalam phase ini.</p>
              </div>
              <button aria-label="Tutup" className="modal__close" disabled={cstSaving} onClick={triggerCstClose} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => void submitCreateSubTask(e)}>
              <div className="modal__body">
                {cstError && <div className="prog-modal-error">{cstError}</div>}
                <div className="form-field">
                  <label>Judul <span className="form-field__required">*</span></label>
                  <input
                    autoFocus
                    maxLength={120}
                    onChange={e => setCstForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Pemetaan struktur utang SGN per kreditur"
                    required
                    type="text"
                    value={cstForm.title}
                  />
                </div>
                <div className="form-field">
                  <label>Deskripsi</label>
                  <textarea
                    className="composer__input prog-modal-textarea"
                    maxLength={400}
                    onChange={e => setCstForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    value={cstForm.description}
                  />
                </div>
                <div className="prog-form-grid prog-form-grid--equal">
                  <div className="form-field">
                    <label>Tanggal Mulai</label>
                    <input onChange={e => setCstForm(f => ({ ...f, startDate: e.target.value }))} type="date" value={cstForm.startDate} />
                  </div>
                  <div className="form-field">
                    <label>Target Selesai</label>
                    <input
                      min={cstForm.startDate || undefined}
                      onChange={e => setCstForm(f => ({ ...f, targetCompletion: e.target.value }))}
                      type="date"
                      value={cstForm.targetCompletion}
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label>Penanggung Jawab (PIC)</label>
                  <div className="wid-team-row__chips" style={{ paddingTop: 2 }}>
                    {cstForm.assignedTo ? (() => {
                      const person = cstDirectory.find(u => u.id === cstForm.assignedTo)
                      return (
                        <span className="wid-pic-chip">
                          {person?.name ?? `#${cstForm.assignedTo}`}
                          <button aria-label="Hapus PIC" className="wid-pic-chip__remove"
                            disabled={cstSaving} onClick={() => setCstForm(f => ({ ...f, assignedTo: null }))} type="button">×</button>
                        </span>
                      )
                    })() : null}
                    <div className="wid-pic-adder">
                      <input
                        className="wid-pic-search"
                        disabled={cstSaving}
                        onChange={e => setCstPicSearch(e.target.value)}
                        placeholder={cstForm.assignedTo ? 'Ganti…' : '+ Tugaskan…'}
                        value={cstPicSearch}
                      />
                      {cstPicSearch.length > 0 && (() => {
                        const filtered = cstDirectory
                          .filter(u => u.id !== cstForm.assignedTo && u.name.toLowerCase().includes(cstPicSearch.toLowerCase()))
                          .slice(0, 6)
                        return filtered.length > 0 ? (
                          <div className="wid-pic-dropdown">
                            {filtered.map(u => (
                              <button className="wid-pic-dropdown__item" key={u.id}
                                onMouseDown={() => { setCstForm(f => ({ ...f, assignedTo: u.id })); setCstPicSearch('') }} type="button">
                                <span className="wid-pic-dropdown__name">{u.name}</span>
                                {u.positionTitle && <span className="wid-pic-dropdown__role">{u.positionTitle}</span>}
                              </button>
                            ))}
                          </div>
                        ) : null
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" disabled={cstSaving} onClick={triggerCstClose} type="button">Batal</button>
                <button className="profile-save-btn" disabled={cstSaving || !cstForm.title.trim()} type="submit">
                  {cstSaving ? 'Menyimpan…' : 'Buat Task'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {toast && (
        <div className={`wid-toast wid-toast--${toast.tone}`} role="status" aria-live="polite">
          <span className="wid-toast__icon" aria-hidden="true">
            {toast.tone === 'error'
              ? <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="14"><circle cx="8" cy="8" r="7"/><path d="M8 5v3M8 11h.01"/></svg>
              : <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="14"><path d="m3 8 4 4 6-7"/></svg>
            }
          </span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ── Approval confirmation modals ─────────────────────────────── */}
    {approvalModal && createPortal(
      (() => {
        const approverRole = (currentUser?.roleType?.toUpperCase() === 'KASUBDIV') ? 'KADIV' : 'KASUBDIV'
        const close = () => { setApprovalModal(null); setRejectNote(''); setApprovalError(null) }
        return (
      <div className="modal-overlay" onClick={() => { if (!approvalLoading) close() }}>
        <div aria-modal="true" className="modal-surface approval-modal" onClick={e => e.stopPropagation()} role="dialog">
          {approvalModal === 'submit' && (
            <>
              <div className="modal-header">
                <div className="modal-headcopy">
                  <span className="modal-kicker">Persetujuan</span>
                  <span className="modal-title">Ajukan ke {approverRole}?</span>
                  <p className="modal-subtitle">
                    Program <strong>{detail?.name}</strong> akan dikirim ke {approverRole} untuk ditinjau. Konten program akan dikunci hingga ada keputusan.
                  </p>
                </div>
                <button aria-label="Tutup" className="modal__close" disabled={approvalLoading} onClick={close} type="button">
                  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11"/></svg>
                </button>
              </div>
              {approvalError && <div className="modal-body"><p className="approval-modal__error">{approvalError}</p></div>}
              <div className="modal-footer">
                <button className="btn btn--ghost" disabled={approvalLoading} onClick={close} type="button">Batal</button>
                <button className="btn btn--primary" disabled={approvalLoading} onClick={() => void submitForApproval()} type="button">
                  {approvalLoading ? 'Mengirim…' : `Ajukan ke ${approverRole}`}
                </button>
              </div>
            </>
          )}

          {approvalModal === 'approve' && (
            <>
              <div className="modal-header">
                <div className="modal-headcopy">
                  <span className="modal-kicker">Konfirmasi</span>
                  <span className="modal-title">Setujui program?</span>
                  <p className="modal-subtitle">
                    Program <strong>{detail?.name}</strong> akan diaktifkan dan masuk ke fase eksekusi. Tindakan ini tidak dapat dibatalkan.
                  </p>
                </div>
                <button aria-label="Tutup" className="modal__close" disabled={approvalLoading} onClick={close} type="button">
                  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11"/></svg>
                </button>
              </div>
              {approvalError && <div className="modal-body"><p className="approval-modal__error">{approvalError}</p></div>}
              <div className="modal-footer">
                <button className="btn btn--ghost" disabled={approvalLoading} onClick={close} type="button">Batal</button>
                <button className="btn btn--primary" disabled={approvalLoading} onClick={() => void submitApprove()} type="button">
                  {approvalLoading ? 'Menyetujui…' : 'Setujui & Aktifkan'}
                </button>
              </div>
            </>
          )}

          {approvalModal === 'reject' && (
            <>
              <div className="modal-header">
                <div className="modal-headcopy">
                  <span className="modal-kicker">Konfirmasi</span>
                  <span className="modal-title">Tolak program?</span>
                  <p className="modal-subtitle">
                    PIC <strong>{detail?.name}</strong> akan menerima notifikasi dan dapat memperbaiki sebelum mengajukan ulang.
                  </p>
                </div>
                <button aria-label="Tutup" className="modal__close" disabled={approvalLoading} onClick={close} type="button">
                  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11"/></svg>
                </button>
              </div>
              <div className="modal-body">
                <label className="approval-modal__field">
                  <span className="approval-modal__field-label">Alasan penolakan <span className="approval-modal__field-required">*</span></span>
                  <textarea
                    autoFocus
                    className="approval-modal__textarea"
                    maxLength={500}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Tuliskan apa yang perlu diperbaiki…"
                    rows={4}
                    value={rejectNote}
                  />
                  <span className="approval-modal__field-hint">{rejectNote.length} / 500</span>
                </label>
                {approvalError && <p className="approval-modal__error">{approvalError}</p>}
              </div>
              <div className="modal-footer">
                <button className="btn btn--ghost" disabled={approvalLoading} onClick={close} type="button">Batal</button>
                <button className="btn btn--danger" disabled={approvalLoading || !rejectNote.trim()} onClick={() => void submitReject()} type="button">
                  {approvalLoading ? 'Menolak…' : 'Tolak Program'}
                </button>
              </div>
            </>
          )}

          {approvalModal === 'withdraw' && (
            <>
              <div className="modal-header">
                <div className="modal-headcopy">
                  <span className="modal-kicker">Konfirmasi</span>
                  <span className="modal-title">Tarik kembali pengajuan?</span>
                  <p className="modal-subtitle">
                    Program <strong>{detail?.name}</strong> akan kembali ke status Draft.
                    {detail?.pendingReviewer && <> {detail.pendingReviewer.name} akan menerima notifikasi bahwa tidak perlu lagi review.</>}
                    {' '}Anda bisa ajukan ulang kapan saja setelah revisi selesai.
                  </p>
                </div>
                <button aria-label="Tutup" className="modal__close" disabled={approvalLoading} onClick={close} type="button">
                  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11"/></svg>
                </button>
              </div>
              {approvalError && <div className="modal-body"><p className="approval-modal__error">{approvalError}</p></div>}
              <div className="modal-footer">
                <button className="btn btn--ghost" disabled={approvalLoading} onClick={close} type="button">Batal</button>
                <button className="btn btn--primary" disabled={approvalLoading} onClick={() => void submitWithdraw()} type="button">
                  {approvalLoading ? 'Menarik…' : 'Ya, tarik kembali'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
        )
      })(),
      document.body,
    )}
    </div>
  )
}

export default ProgramDetailView
