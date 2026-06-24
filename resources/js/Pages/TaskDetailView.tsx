import { useState, useEffect, useMemo, useRef } from 'react'
import type { FormEvent } from 'react'
import { usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useDarkMode } from '../lib/useDarkMode'
import { EscalationButton } from '../components/Escalation'
import { TraceStrip, type TraceNode } from '../components/TraceStrip'
import { tonePalette } from '../lib/statusColors'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { useEscKey } from '../hooks/useEscKey'
import {
  Avatar,
  CommentThreadList,
  ComposerModeToggle,
  HealthPill,
  InlineNotice,
  RichTextPreview,
} from '../components/ui'
import { UserPicker } from '../components/UserPicker'
import type { TaskDetail } from '../types'
import './TaskDetailView.css'

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog', READY: 'Ready', IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review', BLOCKED: 'Blocked', COMPLETED: 'Completed',
}
const STATUS_DOT: Record<string, string> = {
  BACKLOG: 'var(--text-muted)', READY: 'var(--blue)', IN_PROGRESS: 'var(--green)',
  IN_REVIEW: 'var(--yellow)', BLOCKED: 'var(--red)', COMPLETED: 'var(--green)',
}
const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
}
const COMPOSER_TEMPLATES = [
  { label: 'Update', value: 'Execution update:\n- ' },
  { label: 'Blocker', value: 'Blocker:\n- Impact:\n- Dependency:' },
  { label: 'Next step', value: 'Next step:\n- Owner:\n- Due:' },
  { label: 'Decision', value: 'Decision:\n- Context:\n- Outcome:' },
  { label: 'Risk', value: 'Risk:\n- Likelihood:\n- Impact:\n- Mitigation:' },
]

function taskSeverityTones(dark: boolean) {
  const palette = tonePalette(dark)
  return {
    CRITICAL: { bg: palette.RED.bg, fg: palette.RED.fg, dot: 'var(--red)' },
    HIGH: { bg: palette.YELLOW.bg, fg: palette.YELLOW.fg, dot: 'var(--yellow)' },
    MEDIUM: { bg: palette.BLUE.bg, fg: palette.BLUE.fg, dot: 'var(--blue)' },
    LOW: { bg: palette.GRAY.bg, fg: palette.GRAY.fg, dot: 'var(--text-muted)' },
  } as const
}

type DirectoryUser = { id: number; name: string; positionTitle: string | null; roleType?: string }

// ── Inline icon bank ───────────────────────────────────────────────────────
const Icon = {
  back: <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="14"><path d="M8 2 3 7l5 5"/></svg>,
  program: <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16" width="14"><rect height="11" rx="1.5" width="10" x="3" y="2.5"/><path d="M5.5 6h5M5.5 9h5M5.5 12h3"/></svg>,
  calendar: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 16 16" width="13"><rect height="11" rx="1.5" width="12" x="2" y="3"/><path d="M5 1.5v3M11 1.5v3M2 7h12"/></svg>,
  subtask: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><rect height="11" rx="2" width="11" x="2.5" y="2.5"/><path d="m5.5 8 2 2 3-3.5"/></svg>,
  blocker: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><circle cx="8" cy="8" r="5.5"/><path d="m4.1 4.1 7.8 7.8"/></svg>,
  chat: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><path d="M14 10a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/></svg>,
  info: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><circle cx="8" cy="8" r="6.5"/><path d="M8 11.5V7M8 5v.5"/></svg>,
  activity: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><path d="M1.5 8h3l2-5 3 10 2-5h3"/></svg>,
  user: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><circle cx="8" cy="5.5" r="2.5"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/></svg>,
  alert: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><path d="M8 2 1.5 13.5h13L8 2z"/><path d="M8 6.5v3.5M8 11.7v.3"/></svg>,
  flame: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><path d="M8 1.5s-3 3-3 6 1.5 4 3 4 3-1 3-4-3-6-3-6z"/><path d="M6.5 12c0 1.4 0.7 2.5 1.5 2.5s1.5-1.1 1.5-2.5"/></svg>,
  arrow: <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="11"><path d="m6 3 5 5-5 5"/></svg>,
  link: <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="12"><path d="M6.5 9.5a2 2 0 0 0 2.83 0l2.83-2.83a2 2 0 0 0-2.83-2.83l-0.7 0.7"/><path d="M9.5 6.5a2 2 0 0 0-2.83 0L3.84 9.33a2 2 0 0 0 2.83 2.83l0.7-0.7"/></svg>,
  check: <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="M2 6.5l2.5 2.5L10 3.5"/></svg>,
  search: <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 16 16" width="13"><circle cx="7" cy="7" r="5"/><path d="m11 11 3 3"/></svg>,
  chevron: <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 10 6" width="10"><path d="M1 1l4 4 4-4"/></svg>,
  sparkle: <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="11"><path d="M7 1.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2 1.2-3.3z"/></svg>,
  wifi: <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="11"><path d="M2 5.5C3.5 4 5.5 3 8 3s4.5 1 6 2.5"/><path d="M4 8c1-1 2.5-1.5 4-1.5s3 0.5 4 1.5"/><circle cx="8" cy="11" fill="currentColor" r="1.2"/></svg>,
}

// ── Helpers ────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const d = new Date(iso).getTime()
  if (isNaN(d)) return ''
  const diff = Date.now() - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w`
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function formatEstimate(hours: number): { primary: string; secondary?: string } {
  if (hours <= 0) return { primary: `${hours} hrs` }
  if (hours < 8) return { primary: `${hours} hrs` }
  const days = hours / 8
  if (days < 5) {
    const pretty = days % 1 === 0 ? days.toFixed(0) : days.toFixed(1)
    return { primary: `${hours} hrs`, secondary: `≈ ${pretty} work days` }
  }
  const weeks = days / 5
  const pretty = weeks % 1 === 0 ? weeks.toFixed(0) : weeks.toFixed(1)
  return { primary: `${hours} hrs`, secondary: `≈ ${pretty} work weeks` }
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  const max = 260 // cap roughly 10 lines
  el.style.height = Math.min(el.scrollHeight, max) + 'px'
}

const COLLAPSE_KEY = 'wid.collapsedPanels.v1'
function loadCollapsedPanels(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    return { infoFooter: true, ...saved }
  } catch { return { infoFooter: true } }
}
function saveCollapsedPanels(state: Record<string, boolean>) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state)) } catch {}
}

// ── Ren (plannedWeeks) helpers ────────────────────────────────────────────
function isoWeekToDate(isoWeek: string): Date {
  // "2026-W10" → Monday of that week
  const [yearStr, weekStr] = isoWeek.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)
  // Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7)
  return monday
}

function dateToIsoWeek(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function weeksInRange(startWeek: string, endWeek: string): string[] {
  const result: string[] = []
  const start = isoWeekToDate(startWeek)
  const end = isoWeekToDate(endWeek)
  const cur = new Date(start)
  let guard = 0
  while (cur <= end && guard < 200) {
    result.push(dateToIsoWeek(cur))
    cur.setDate(cur.getDate() + 7)
    guard++
  }
  return result
}

// Always use Monday of ISO week — matches Execution Grid column headers
function formatWeekLabel(isoWeek: string): string {
  try {
    const monday      = isoWeekToDate(isoWeek)
    const weekOfMonth = Math.ceil(monday.getDate() / 7)
    const month = monday.toLocaleDateString('en-US', { month: 'short' })
    const year  = String(monday.getFullYear()).slice(-2)
    return `W${weekOfMonth} ${month} ${year}`
  } catch { return isoWeek }
}

// Confetti burst — pure DOM, no library. Fires a short burst from origin point.
function fireConfetti(originX: number, originY: number) {
  const container = document.createElement('div')
  container.className = 'wid-confetti-layer'
  document.body.appendChild(container)
  const palette = ['var(--indigo)', 'var(--green)', 'var(--yellow)', 'var(--blue)', 'var(--purple)', 'var(--accent)']
  const N = 32
  for (let i = 0; i < N; i++) {
    const piece = document.createElement('span')
    piece.className = 'wid-confetti-piece'
    const angle = Math.random() * Math.PI - Math.PI / 2 // spread up-ish
    const speed = 180 + Math.random() * 220
    const dx = Math.cos(angle) * speed + (Math.random() - 0.5) * 120
    const dy = Math.sin(angle) * speed - 160 + Math.random() * 80
    piece.style.setProperty('--x', `${originX}px`)
    piece.style.setProperty('--y', `${originY}px`)
    piece.style.setProperty('--dx', `${dx}px`)
    piece.style.setProperty('--dy', `${dy}px`)
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`)
    piece.style.background = palette[i % palette.length]
    piece.style.width = `${6 + Math.random() * 6}px`
    piece.style.height = `${10 + Math.random() * 6}px`
    container.appendChild(piece)
  }
  setTimeout(() => container.remove(), 1400)
}

/**
 * TaskDetailView — render full task detail. Bisa di-mount sebagai:
 * - Full page (/execution/tasks/{id}): id dari page props (Inertia)
 * - Modal/panel: id di-pass via prop `taskId`. Pakem 2026-05-21: card click
 *   di Workboard buka modal alih-alih navigate ke /tasks/{id}.
 *
 * Props:
 * - taskId: kalau di-set, override page props (mode modal/panel).
 * - mode: 'page' default | 'modal' — affect layout (modal hides topbar back btn).
 * - onClose: untuk modal mode, dipanggil saat close (esc / X / save complete).
 */
export interface TaskDetailViewProps {
  taskId?: number
  mode?: 'page' | 'modal'
  onClose?: () => void
}

export function TaskDetailView({ taskId, mode = 'page', onClose: _onClose }: TaskDetailViewProps = {}) {
  const page = usePage<{ task?: { id: number } }>()
  const id = taskId != null
    ? String(taskId)
    : (page.props.task?.id != null ? String(page.props.task.id) : undefined)
  const navigate = useInertiaNavigate()
  const { currentUser, loadOverview, normalizeHealthStatus, appendComposerSnippet, setSelectedTaskId, taskDetail: contextTaskDetail, programs } = useWorkspace()
  const roleAccess = useRoleAccess()
  const dark = useDarkMode()
  const SEV_TONE = taskSeverityTones(dark)

  // ── Refs ──────────────────────────────────────────────────────────
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const blockerSectionRef = useRef<HTMLElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const descInputRef = useRef<HTMLTextAreaElement | null>(null)

  // ── Data ──────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [celebrateIds, setCelebrateIds] = useState<Set<number>>(new Set())
  // Track whether initial fresh fetch via loadDetail() has completed for the
  // current id. Until then, ignore stale contextTaskDetail to prevent flashes
  // of outdated data (e.g., after drag-status-change in workboard while modal
  // is closed — context retains stale snapshot from prior session).
  const initialFetchDoneRef = useRef(false)

  // ── Relative-time refresh ─────────────────────────────────────────
  // Force re-render every 60s so "2j", "3h", etc. stay fresh without reload.
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setNowTick(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  // ── Composer auto-grow on content change ─────────────────────────
  // (inside this component so composerRef is visible)
  // Ref init at declaration

  // ── Collapsible panels ────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadCollapsedPanels())
  const togglePanel = (key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      saveCollapsedPanels(next)
      return next
    })
  }

  // ── Global toast (success | error) ────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const showToast = (msg: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ msg, tone })
    toastTimerRef.current = window.setTimeout(() => setToast(null), tone === 'error' ? 3200 : 2200)
  }
  const extractErr = (err: unknown, fallback: string): string =>
    err instanceof Error ? err.message : (typeof err === 'string' ? err : fallback)

  const copyWILink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast('Task link copied', 'success')
    } catch {
      showToast('Failed to copy link', 'error')
    }
  }

  // ── Inline tenggat edit popover ───────────────────────────────────
  const [tenggatEditing, setTenggatEditing] = useState(false)
  const [tenggatDraft, setTenggatDraft] = useState('')
  const [tenggatSaving, setTenggatSaving] = useState(false)
  const beginTenggatEdit = () => {
    if (!detail || roleAccess.isMonitoringOnly) return
    setTenggatDraft(detail.targetCompletion ? detail.targetCompletion.slice(0, 10) : '')
    setTenggatEditing(true)
  }
  const commitTenggatEdit = async (nextValue: string) => {
    if (!id || !detail) return
    // Tenggat tidak bisa dikosongkan (schema NOT NULL). Abaikan empty string.
    if (!nextValue) { setTenggatEditing(false); return }
    // Skip kalau tidak berubah
    const currentISO = detail.targetCompletion ? detail.targetCompletion.slice(0, 10) : ''
    if (nextValue === currentISO) { setTenggatEditing(false); return }
    setTenggatSaving(true)
    try {
      await api.patch(`/tasks/${id}`, {
        targetCompletion: new Date(nextValue).toISOString(),
      })
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save deadline.'), 'error')
    } finally {
      setTenggatSaving(false)
      setTenggatEditing(false)
    }
  }

  // ── Ren (plannedWeeks) editor ─────────────────────────────────────
  const [renEditing, setRenEditing] = useState(false)
  const [renStart, setRenStart] = useState('')
  const [renEnd, setRenEnd] = useState('')
  const [renSaving, setRenSaving] = useState(false)

  const openRenEditor = () => {
    if (!detail) return
    const weeks = detail.plannedWeeks ?? []
    if (weeks.length > 0) {
      setRenStart(weeks[0])
      setRenEnd(weeks[weeks.length - 1])
    } else {
      const now = dateToIsoWeek(new Date())
      setRenStart(now)
      setRenEnd(now)
    }
    setRenEditing(true)
  }

  const saveRen = async () => {
    if (!id || !renStart || !renEnd) return
    setRenSaving(true)
    try {
      const weeks = weeksInRange(renStart, renEnd)
      await api.patch(`/tasks/${id}`, { plannedWeeks: weeks })
      await loadDetail(true)
      setRenEditing(false)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save schedule.'), 'error')
    } finally {
      setRenSaving(false)
    }
  }

  const clearRen = async () => {
    if (!id) return
    setRenSaving(true)
    try {
      await api.patch(`/tasks/${id}`, { plannedWeeks: [] })
      await loadDetail(true)
      setRenEditing(false)
    } catch (err) {
      showToast(extractErr(err, 'Failed to delete schedule.'), 'error')
    } finally {
      setRenSaving(false)
    }
  }

  // ── Realisasi (actualWeeks) editor ────────────────────────────────
  // Input realisasi mingguan ditaruh DI SINI (sisi Workboard), bukan di tab
  // Timeline yang kini read-only (catatan 24 Jun 2026 opsi B). actualWeeks =
  // null → AUTO (derive dari progress); array → override manual (boleh non-
  // kontigu / minggu terlambat). Tunduk gate canReportProgress (PIC/owner/admin).
  const [realEditing, setRealEditing] = useState(false)
  const [realDraft, setRealDraft] = useState<string[]>([])
  const [realSaving, setRealSaving] = useState(false)
  const realIsManual = (detail?.actualWeeks ?? null) !== null

  // Kandidat minggu = awal plan s.d. maks(akhir plan, akhir realisasi, minggu
  // berjalan) — supaya realisasi yang terlambat tetap bisa dipilih.
  const realCandidateWeeks = useMemo(() => {
    const planned = detail?.plannedWeeks ?? []
    const actual = detail?.actualWeeks ?? []
    const nowW = dateToIsoWeek(new Date())
    const pool = [...planned, ...actual, nowW].filter(Boolean)
    if (pool.length === 0) return [] as string[]
    const sorted = [...new Set(pool)].sort()
    const start = planned.length > 0 ? [...planned].sort()[0] : sorted[0]
    const end = sorted[sorted.length - 1]
    return weeksInRange(start, end)
  }, [detail?.plannedWeeks, detail?.actualWeeks])

  const openRealEditor = () => {
    if (!detail) return
    setRealDraft(detail.actualWeeks ?? [])
    setRealEditing(true)
  }
  const toggleRealWeek = (w: string) => {
    setRealDraft(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w].sort())
  }
  const saveReal = async () => {
    if (!id) return
    setRealSaving(true)
    try {
      // Kosong → null = kembalikan ke AUTO (derive dari progress).
      await api.patch(`/tasks/${id}`, { actualWeeks: realDraft.length > 0 ? realDraft : null })
      await loadDetail(true)
      setRealEditing(false)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save realization.'), 'error')
    } finally {
      setRealSaving(false)
    }
  }
  const resetRealToAuto = async () => {
    if (!id) return
    setRealSaving(true)
    try {
      await api.patch(`/tasks/${id}`, { actualWeeks: null })
      await loadDetail(true)
      setRealEditing(false)
    } catch (err) {
      showToast(extractErr(err, 'Failed to reset realization.'), 'error')
    } finally {
      setRealSaving(false)
    }
  }

  // ── PIC Unit/Person ───────────────────────────────────────────────
  type OrgUnit = { id: number; code: string; name: string }
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [picUnitSearch, setPicUnitSearch] = useState('')
  const [picPersonSearch, setPicPersonSearch] = useState('')
  const [picSaving, setPicSaving] = useState(false)
  const [showPicAdder, setShowPicAdder] = useState(false)
  const [showUnitAdder, setShowUnitAdder] = useState(false)

  const loadOrgUnits = async () => {
    if (orgUnits.length > 0) return
    try {
      const res = await api.get<{ data: OrgUnit[] }>('/organization/units')
      setOrgUnits(res.data ?? [])
    } catch { /* non-fatal */ }
  }

  const savePicUnits = async (ids: number[]) => {
    if (!id) return
    setPicSaving(true)
    try {
      await api.patch(`/tasks/${id}`, { picUnitIds: ids })
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save unit PIC.'), 'error')
    } finally { setPicSaving(false) }
  }

  const savePicPersons = async (ids: number[]) => {
    if (!id) return
    setPicSaving(true)
    try {
      await api.patch(`/tasks/${id}`, { picPersonIds: ids })
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save person PIC.'), 'error')
    } finally { setPicSaving(false) }
  }

  // ── Quick-switch modal ────────────────────────────────────────────
  const [showQuickSwitch, setShowQuickSwitch] = useState(false)
  const [qsQuery, setQsQuery] = useState('')
  const [qsIndex, setQsIndex] = useState(0)
  const [qsResults, setQsResults] = useState<Array<{ id: number; code: string; title: string; programCode?: string }>>([])
  const [qsLoading, setQsLoading] = useState(false)

  // ── @mentions dropdown ────────────────────────────────────────────
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionAnchor, setMentionAnchor] = useState<number | null>(null) // cursor pos of '@'

  // ── Kbd hint bar (floating) ───────────────────────────────────────
  const [kbdHintDismissed, setKbdHintDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem('wid.kbdHintDismissed') === '1' } catch { return false }
  })
  const dismissKbdHint = () => {
    setKbdHintDismissed(true)
    try { localStorage.setItem('wid.kbdHintDismissed', '1') } catch {}
  }

  // ── SSE live indicator — pulse when context detail refreshes ─────
  const [liveFlash, setLiveFlash] = useState(false)
  const prevContextTsRef = useRef<number>(0)
  useEffect(() => {
    if (contextTaskDetail?.id === Number(id)) {
      const now = Date.now()
      if (prevContextTsRef.current > 0 && now - prevContextTsRef.current > 500) {
        setLiveFlash(true)
        setTimeout(() => setLiveFlash(false), 1400)
      }
      prevContextTsRef.current = now
    }
  }, [contextTaskDetail, id])

  const loadDetail = async (silent = false) => {
    if (!id) return
    if (!silent) setLoading(true)
    try {
      const res = await api.get<{ data: TaskDetail }>(`/tasks/${id}`)
      setDetail(res.data)
      initialFetchDoneRef.current = true
      setLoadError(null)
    } catch (err) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : String(err)
        setLoadError(msg || 'Work item could not be loaded.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    initialFetchDoneRef.current = false
    void loadDetail()
  }, [id])

  useEffect(() => {
    if (!id) return
    setSelectedTaskId(Number(id))
    return () => setSelectedTaskId(null)
  }, [id])

  // Sync from context ONLY after initial fresh fetch completed. Before that,
  // contextTaskDetail might be stale snapshot from a prior modal session
  // (e.g., task was drag-edited in workboard while modal was closed —
  // context not refreshed because selectedTaskId was null). This prevents
  // showing stale data flash on modal open.
  useEffect(() => {
    if (!initialFetchDoneRef.current) return
    if (contextTaskDetail?.id === Number(id)) setDetail(contextTaskDetail)
  }, [contextTaskDetail])

  // Modal rail mode: info-footer always expanded, prefetch org + assign users
  useEffect(() => {
    if (mode === 'modal' && id) {
      void loadOrgUnits()
      void loadAssignUsers()
    }
  }, [mode, id])

  // ── Lifecycle phase (derived from parent program's approvalStatus) ──
  const programApproval = detail?.workstream?.program?.approvalStatus
  const inPlanning = programApproval != null && programApproval !== 'ACTIVE' && programApproval !== 'COMPLETED'

  // ── Execution controls ────────────────────────────────────────────
  const [editDraft, setEditDraft] = useState({ status: 'BACKLOG', percentComplete: 0 })
  useEffect(() => {
    if (detail) setEditDraft({ status: detail.status, percentComplete: detail.percentComplete })
  }, [detail?.id])

  // Status tidak lagi diedit manual di sini (read-only, di-derive dari progress).
  // Dirty = perubahan progres saja.
  const isDirty = detail ? editDraft.percentComplete !== detail.percentComplete : false

  const [actionStatus, setActionStatus] = useState<{ saving: boolean; message: string | null }>({ saving: false, message: null })
  const [regressNote, setRegressNote] = useState('')

  // Regresi = progres baru < tersimpan. Backend mewajibkan alasan kalau
  // penurunan ini memundurkan status (audit log) — minta di FE juga.
  const isRegressing = detail ? editDraft.percentComplete < detail.percentComplete : false

  // Prasyarat mulai kerja: progres > 0 butuh PIC + target (sinkron dgn backend).
  // Tanpa ini slider di-disable agar task tanpa PIC tak bisa didorong "Berjalan".
  const canStart = !!detail?.assignee && !!detail?.targetCompletion
  const startBlockReason = !detail?.assignee && !detail?.targetCompletion
    ? 'Set a PIC & target completion first'
    : !detail?.assignee ? 'Set a PIC before starting the task'
    : !detail?.targetCompletion ? 'Set a target completion before starting the task'
    : ''

  // Catatan PIC (24 Jun 2026): progres/status/realisasi hanya boleh diubah oleh
  // PIC, owner program, atau admin (backend menolak 403 utk manajer se-divisi).
  // Gate FE supaya kontrol yang pasti gagal tak ditampilkan/diaktifkan.
  const isTaskPic = !!detail?.assignee && detail.assignee.id === currentUser?.id
  const isProgramOwner = !!detail?.workstream?.program?.ownerId
    && detail.workstream.program.ownerId === currentUser?.id
  const isAdminRole = roleAccess.role === 'SUPERADMIN' || roleAccess.role === 'ADMIN'
  const canReportProgress = !roleAccess.isMonitoringOnly && (isTaskPic || isProgramOwner || isAdminRole)
  const progressBlockReason = !canReportProgress
    ? 'Only the assigned PIC or program owner can update progress'
    : startBlockReason

  const commitProgress = async () => {
    if (!id || !detail) return
    if (!canReportProgress) {
      showToast('Only the assigned PIC or program owner can update progress.', 'error')
      return
    }
    if (actionStatus.saving) return // guard double-submit
    if (editDraft.percentComplete === detail.percentComplete) return // tidak berubah
    if (isRegressing && !regressNote.trim()) {
      showToast('Enter a reason for the progress decrease for the audit log.', 'error')
      return
    }
    setActionStatus({ saving: true, message: null })
    try {
      // Backend men-derive status dari nilai progres (0→READY/BACKLOG,
      // 1-99→IN_PROGRESS, 100→COMPLETED). Tidak ada PUT /status manual di sini.
      await api.put(`/tasks/${id}/progress`, {
        percentComplete: editDraft.percentComplete,
        ...(isRegressing ? { note: regressNote.trim() } : {}),
      })
      await Promise.all([loadDetail(true), loadOverview('refresh')])
      setRegressNote('')
      setActionStatus({ saving: false, message: 'Saved.' })
      setTimeout(() => setActionStatus(s => ({ ...s, message: null })), 2500)
    } catch (err) {
      setActionStatus({ saving: false, message: null })
      showToast(extractErr(err, 'Failed to save progress.'), 'error')
    }
  }

  const saveExecution = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void commitProgress()
  }

  // Auto-save saat slider dilepas — naik langsung simpan; turun (regresi) tunggu
  // alasan diisi + tombol Simpan, supaya tidak menyimpan tanpa audit note.
  const onSliderCommit = () => {
    if (!detail || editDraft.percentComplete === detail.percentComplete) return
    if (isRegressing) return
    void commitProgress()
  }

  // Catatan: Execution TIDAK punya jalur review/approval (beda dengan
  // Assignments yang punya approvalChain). Task selesai murni dari progres
  // 100%. Tidak ada tombol "Serahkan untuk Review" / approve di sini.

  // ── Assignee ──────────────────────────────────────────────────────
  const [assignUsers, setAssignUsers] = useState<DirectoryUser[]>([])
  const [assignSaving, setAssignSaving] = useState(false)
  const [showAssigneeEdit, setShowAssigneeEdit] = useState(false)

  const loadAssignUsers = async () => {
    if (assignUsers.length > 0) return
    try {
      const res = await api.get<{ data: DirectoryUser[] }>('/users/directory')
      setAssignUsers(res.data ?? [])
    } catch (err) {
      showToast(extractErr(err, 'Failed to load user directory.'), 'error')
    }
  }

  const handleAssign = async (userId: number | null) => {
    if (!id) return
    setAssignSaving(true)
    try {
      await api.put(`/tasks/${id}/assign`, { assignedTo: userId })
      await loadDetail(true)
      setShowAssigneeEdit(false)
    } catch (err) {
      showToast(extractErr(err, 'Failed to change assignee.'), 'error')
    } finally { setAssignSaving(false) }
  }

  // ── Inline title edit ─────────────────────────────────────────────
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)

  const beginTitleEdit = () => {
    if (!detail || roleAccess.isMonitoringOnly) return
    setTitleDraft(detail.title)
    setTitleEditing(true)
    setTimeout(() => titleInputRef.current?.focus(), 10)
  }

  const commitTitleEdit = async () => {
    if (!id || !detail) return
    const next = titleDraft.trim()
    if (!next || next === detail.title) { setTitleEditing(false); return }
    setTitleSaving(true)
    try {
      await api.patch(`/tasks/${id}`, { title: next })
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save title.'), 'error')
    } finally {
      setTitleSaving(false)
      setTitleEditing(false)
    }
  }

  // ── Inline description edit ──────────────────────────────────────
  const [descEditing, setDescEditing] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [descSaving, setDescSaving] = useState(false)

  const beginDescEdit = () => {
    if (!detail || roleAccess.isMonitoringOnly) return
    setDescDraft(detail.description ?? '')
    setDescEditing(true)
    setTimeout(() => descInputRef.current?.focus(), 10)
  }

  const commitDescEdit = async () => {
    if (!id || !detail) return
    const next = descDraft.trim()
    if (next === (detail.description ?? '').trim()) { setDescEditing(false); return }
    setDescSaving(true)
    try {
      await api.patch(`/tasks/${id}`, { description: next || undefined })
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save description.'), 'error')
    } finally {
      setDescSaving(false)
      setDescEditing(false)
    }
  }

  // ── Help overlay ─────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false)

  // ── Inline priority edit ──────────────────────────────────────────
  const [priorityEditing, setPriorityEditing] = useState(false)
  const [prioritySaving, setPrioritySaving] = useState(false)

  const savePriority = async (newPriority: string) => {
    if (!id) return
    setPrioritySaving(true)
    setPriorityEditing(false)
    try {
      await api.patch(`/tasks/${id}`, { priority: newPriority })
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save priority.'), 'error')
    } finally { setPrioritySaving(false) }
  }

  // ── Delete WI ─────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const doDelete = async () => {
    if (!id || deleting) return // guard double-trigger
    setDeleting(true)
    try {
      await api.delete(`/tasks/${id}`)
      await loadOverview('refresh')
      navigate('/execution')
    } catch (err) {
      showToast(extractErr(err, 'Failed to delete task.'), 'error')
    } finally { setDeleting(false) }
  }

  // ── Subtasks ──────────────────────────────────────────────────────
  const [togglingSubtask, setTogglingSubtask] = useState<number | null>(null)
  const [showAddSubtask, setShowAddSubtask] = useState(false)
  const [stTitle, setStTitle] = useState('')
  const [stSaving, setStSaving] = useState(false)

  const toggleSubtask = async (subtaskId: number) => {
    if (!id || togglingSubtask !== null) return
    setTogglingSubtask(subtaskId)
    const wasCompleted = detail?.subTasks.find(s => s.id === subtaskId)?.isCompleted
    setDetail(prev => prev ? {
      ...prev,
      subTasks: prev.subTasks.map(st => st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st),
    } : prev)
    if (!wasCompleted) {
      setCelebrateIds(s => new Set(s).add(subtaskId))
      setTimeout(() => setCelebrateIds(s => { const n = new Set(s); n.delete(subtaskId); return n }), 650)
    }
    try {
      await api.patch(`/tasks/${id}/subtasks/${subtaskId}/toggle`, {})
      await loadDetail(true)
    } catch (err) {
      // Revert optimistic toggle
      setDetail(prev => prev ? {
        ...prev,
        subTasks: prev.subTasks.map(st => st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st),
      } : prev)
      showToast(extractErr(err, 'Failed to update subtask.'), 'error')
    } finally { setTogglingSubtask(null) }
  }

  const deleteSubtask = async (subtaskId: number) => {
    if (!id) return
    try {
      await api.delete(`/tasks/${id}/subtasks/${subtaskId}`)
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to delete subtask.'), 'error')
    }
  }

  const submitAddSubtask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!id || !stTitle.trim()) return
    setStSaving(true)
    try {
      await api.post(`/tasks/${id}/subtasks`, { title: stTitle.trim() })
      setStTitle('')
      setShowAddSubtask(false)
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to add subtask.'), 'error')
    } finally { setStSaving(false) }
  }

  // ── Blockers ──────────────────────────────────────────────────────
  const [showCreateBlocker, setShowCreateBlocker] = useState(false)
  const [blForm, setBlForm] = useState({ code: '', title: '', severity: 'HIGH', description: '', assignedTo: '' })
  const [blSaving, setBlSaving] = useState(false)
  const [blError, setBlError] = useState<string | null>(null)
  const [blEditTarget, setBlEditTarget] = useState<{ id: number; title: string; description: string; severity: string; assignedTo: number | null } | null>(null)
  const [blEditSaving, setBlEditSaving] = useState(false)
  const [blStatusTarget, setBlStatusTarget] = useState<{ id: number; status: string; resolution: string } | null>(null)
  const [blStatusSaving, setBlStatusSaving] = useState(false)
  const [blDeleteConfirmId, setBlDeleteConfirmId] = useState<number | null>(null)
  const [blDeleteSaving, setBlDeleteSaving] = useState(false)

  // Helper: Escape boleh menutup edit mode hanya jika tidak ada perubahan,
  // atau user mengonfirmasi buang draft.
  const confirmDiscard = (): boolean =>
    window.confirm('Discard unsaved changes?')

  useEscKey(() => setPriorityEditing(false), priorityEditing)
  useEscKey(() => {
    const blDirty = blForm.code !== '' || blForm.title !== '' || blForm.description !== '' || blForm.assignedTo !== '' || blForm.severity !== 'HIGH'
    if (blDirty && !confirmDiscard()) return
    setShowCreateBlocker(false); setBlError(null)
  }, showCreateBlocker)
  useEscKey(() => {
    const orig = blEditTarget ? detail?.blockers?.find(b => b.id === blEditTarget.id) : null
    const dirty = !!orig && !!blEditTarget && (
      blEditTarget.title !== orig.title ||
      blEditTarget.description !== (orig.description ?? '') ||
      blEditTarget.severity !== orig.severity ||
      blEditTarget.assignedTo !== (orig.assignedTo ?? null)
    )
    if (dirty && !confirmDiscard()) return
    setBlEditTarget(null)
  }, blEditTarget !== null)
  useEscKey(() => {
    if (blStatusTarget && blStatusTarget.resolution !== '' && !confirmDiscard()) return
    setBlStatusTarget(null)
  }, blStatusTarget !== null)
  useEscKey(() => setBlDeleteConfirmId(null), blDeleteConfirmId !== null)
  useEscKey(() => setShowAssigneeEdit(false), showAssigneeEdit)
  useEscKey(() => {
    if (detail && titleDraft !== detail.title && !confirmDiscard()) return
    setTitleEditing(false)
  }, titleEditing)
  useEscKey(() => {
    if (detail && descDraft !== (detail.description ?? '') && !confirmDiscard()) return
    setDescEditing(false)
  }, descEditing)
  useEscKey(() => setShowHelp(false), showHelp)
  useEscKey(() => {
    const currentTenggat = detail?.targetCompletion?.slice(0, 10) ?? ''
    if (tenggatDraft !== currentTenggat && !confirmDiscard()) return
    setTenggatEditing(false)
  }, tenggatEditing)
  useEscKey(() => setShowQuickSwitch(false), showQuickSwitch)

  // ── Meta shortcuts (always active, even when typing in input) ─────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setShowQuickSwitch(true)
        setQsQuery('')
        setQsIndex(0)
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        void copyWILink()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Template dropdown ────────────────────────────────────────────
  const [showTemplates, setShowTemplates] = useState(false)
  useEscKey(() => setShowTemplates(false), showTemplates)
  useEffect(() => {
    if (!showTemplates) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && !target.closest('.wid-tpl')) setShowTemplates(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [showTemplates])

  // ── Scroll helper ────────────────────────────────────────────────
  const scrollToBlockers = () => {
    blockerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const focusComposer = () => {
    composerRef.current?.focus()
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // ── Quick-switch search ──────────────────────────────────────────
  useEffect(() => {
    if (!showQuickSwitch) return
    const q = qsQuery.trim()
    let aborted = false
    setQsLoading(true)
    ;(async () => {
      try {
        if (q.length === 0) {
          // Show recently visited / current program WIs by default
          const pid = detail?.workstream?.program?.id
          if (pid) {
            const res = await api.get<{ data: Array<{ id: number; code: string; title: string; workstream?: { program?: { code: string } } }> }>(`/tasks?programId=${pid}`)
            if (!aborted) {
              const mapped = (res.data ?? []).slice(0, 12).map(w => ({
                id: w.id, code: w.code, title: w.title, programCode: w.workstream?.program?.code,
              }))
              setQsResults(mapped)
            }
          } else {
            setQsResults([])
          }
        } else {
          const res = await api.get<{ results?: Array<{ type: string; id: number; title: string; snippet: string }> }>(`/search?q=${encodeURIComponent(q)}&type=TASKS&limit=15`)
          if (!aborted) {
            const mapped = (res.results ?? []).filter(r => r.type === 'TASK').map(r => ({
              id: r.id, code: '', title: r.title,
            }))
            setQsResults(mapped)
          }
        }
      } catch {
        if (!aborted) setQsResults([])
      } finally {
        if (!aborted) setQsLoading(false)
      }
    })()
    return () => { aborted = true }
  }, [showQuickSwitch, qsQuery, detail?.workstream?.program?.id])

  // ── Confetti when reaching 100% ──────────────────────────────────
  const confettiFiredRef = useRef(false)
  useEffect(() => {
    if (!detail) return
    if (detail.percentComplete === 100 && detail.status === 'COMPLETED' && !confettiFiredRef.current) {
      confettiFiredRef.current = true
      // Fire from center of hero progress bar
      const el = document.querySelector('.wid-hero__progress-fill') as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        fireConfetti(r.right, r.top + r.height / 2)
      } else {
        fireConfetti(window.innerWidth / 2, window.innerHeight / 3)
      }
    }
    if (detail.percentComplete < 100 || detail.status !== 'COMPLETED') {
      confettiFiredRef.current = false
    }
  }, [detail?.percentComplete, detail?.status])

  // ── beforeunload warning when dirty ──────────────────────────────
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ── Keyboard shortcuts (page-level) ──────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // skip when typing in input/textarea/contenteditable
      const t = e.target as HTMLElement | null
      if (!t) return
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'e' || e.key === 'E') {
        if (!roleAccess.isMonitoringOnly) { e.preventDefault(); beginTitleEdit() }
      } else if (e.key === 't' || e.key === 'T') {
        if (!roleAccess.isMonitoringOnly) { e.preventDefault(); beginTitleEdit() }
      } else if (e.key === 'a' || e.key === 'A') {
        if (!roleAccess.isMonitoringOnly) { e.preventDefault(); setShowAssigneeEdit(true); void loadAssignUsers() }
      } else if (e.key === '/') {
        e.preventDefault(); focusComposer()
      } else if (e.key === '?') {
        e.preventDefault(); setShowHelp(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, roleAccess.isMonitoringOnly])

  const submitCreateBlocker = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!id) return
    setBlSaving(true); setBlError(null)
    try {
      await api.post('/blockers', {
        code: blForm.code.trim(), taskId: Number(id),
        title: blForm.title.trim(), severity: blForm.severity,
        description: blForm.description.trim() || undefined,
        assignedTo: blForm.assignedTo ? Number(blForm.assignedTo) : undefined,
      })
      setBlForm({ code: '', title: '', severity: 'HIGH', description: '', assignedTo: '' })
      setShowCreateBlocker(false)
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (err) {
      setBlError((err as { message?: string })?.message ?? 'Failed to create blocker.')
    } finally { setBlSaving(false) }
  }

  const submitEditBlocker = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!blEditTarget) return
    setBlEditSaving(true)
    try {
      await api.patch(`/blockers/${blEditTarget.id}`, {
        title: blEditTarget.title.trim(),
        description: blEditTarget.description.trim() || undefined,
        severity: blEditTarget.severity,
        assignedTo: blEditTarget.assignedTo,
      })
      setBlEditTarget(null)
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to save blocker.'), 'error')
    } finally { setBlEditSaving(false) }
  }

  const submitUpdateBlockerStatus = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!blStatusTarget) return
    setBlStatusSaving(true)
    try {
      await api.put(`/blockers/${blStatusTarget.id}/status`, {
        status: blStatusTarget.status,
        resolution: blStatusTarget.resolution.trim() || undefined,
      })
      setBlStatusTarget(null)
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (err) {
      showToast(extractErr(err, 'Failed to change blocker status.'), 'error')
    } finally { setBlStatusSaving(false) }
  }

  const submitDeleteBlocker = async (blockerId: number) => {
    if (blDeleteSaving) return
    setBlDeleteSaving(true)
    try {
      await api.delete(`/blockers/${blockerId}`)
      setBlDeleteConfirmId(null)
      await Promise.all([loadDetail(true), loadOverview('refresh')])
    } catch (err) {
      showToast(extractErr(err, 'Failed to delete blocker.'), 'error')
    } finally { setBlDeleteSaving(false) }
  }

  // ── Comments ──────────────────────────────────────────────────────
  const [commentValue, setCommentValue] = useState('')
  // Composer toolbar (Edit/Preview toggle + Template dropdown) hidden by
  // default — UX clutter saat user belum mulai menulis. Show saat textarea
  // focused atau ada draft content.
  const [commentFocused, setCommentFocused] = useState(false)
  const [composerMode, setComposerMode] = useState<'edit' | 'preview'>('edit')
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

  // Auto-grow textarea whenever commentValue changes or composer (re)mounts
  useEffect(() => {
    autoResize(composerRef.current)
  }, [commentValue, composerMode])

  const submitComment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!id || !commentValue.trim()) return
    setSending(true)
    setCommentError(null)
    try {
      await api.post(`/tasks/${id}/comments`, {
        commentText: commentValue.trim(),
        parentCommentId: replyTargetId ?? undefined,
      })
      setCommentValue(''); setReplyTargetId(null)
      await loadDetail(true)
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to post comment.')
    } finally { setSending(false) }
  }

  const deleteComment = async (commentId: number) => {
    try {
      await api.delete(`/comments/${commentId}`)
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to delete comment.'), 'error')
    }
  }
  const reactToComment = async (commentId: number) => {
    try {
      await api.post(`/comments/${commentId}/reactions`, { emoji: ':thumbsup:' })
      await loadDetail(true)
    } catch (err) {
      showToast(extractErr(err, 'Failed to add reaction.'), 'error')
    }
  }

  // ── Derived/computed ─────────────────────────────────────────────
  const parentProgram = useMemo(() => {
    const pid = detail?.workstream?.program?.id
    if (!pid) return null
    return programs.find(p => p.id === pid) ?? null
  }, [detail?.workstream?.program?.id, programs])

  const subtaskStats = useMemo(() => {
    const list = detail?.subTasks ?? []
    const done = list.filter(s => s.isCompleted).length
    const pct = list.length > 0 ? Math.round((done / list.length) * 100) : 0
    return { done, total: list.length, pct }
  }, [detail?.subTasks])

  const activeBlockers = useMemo(
    () => (detail?.blockers ?? []).filter(b => b.status !== 'RESOLVED'),
    [detail?.blockers]
  )

  const recentActivity = useMemo(() => {
    const list = [...(detail?.comments ?? [])]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
    return list
  }, [detail?.comments])

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="ds task-detail-v2 wid-page view-task-detail ds-stagger">
        <div className="wid-topbar">
          <button className="wid-back" onClick={() => navigate('/execution')} type="button">
            {Icon.back} Workboard
          </button>
        </div>
        {/* Shape-aware skeleton matching real layout */}
        <div className="wid-sk-hero">
          <div className="wid-sk-line wid-sk-line--chip" />
          <div className="wid-sk-row">
            <div className="wid-sk-line wid-sk-line--code" />
            <div className="wid-sk-line wid-sk-line--pill" />
            <div className="wid-sk-line wid-sk-line--pill" />
          </div>
          <div className="wid-sk-line wid-sk-line--title" />
          <div className="wid-sk-row">
            <div className="wid-sk-line wid-sk-line--bar" />
            <div className="wid-sk-line wid-sk-line--short" />
            <div className="wid-sk-line wid-sk-line--short" />
          </div>
        </div>
        <div className="wid-metastrip wid-metastrip--sk">
          <div className="wid-sk-line wid-sk-line--med" style={{ height: 24, borderRadius: 6 }} />
          <div className="wid-sk-line wid-sk-line--bar" style={{ height: 8, borderRadius: 4, flex: 1, maxWidth: 200 }} />
          <div className="wid-sk-line wid-sk-line--short" style={{ height: 24, borderRadius: 6, marginLeft: 'auto' }} />
        </div>
        <div className="wid-body">
          <div className="wid-sk-panel">
            <div className="wid-sk-line wid-sk-line--heading" />
            <div className="wid-sk-line wid-sk-line--full" />
            <div className="wid-sk-line wid-sk-line--full" />
            <div className="wid-sk-line wid-sk-line--med" />
          </div>
          <div className="wid-sk-panel">
            <div className="wid-sk-line wid-sk-line--heading" />
            <div className="wid-sk-line wid-sk-line--row" />
            <div className="wid-sk-line wid-sk-line--row" />
          </div>
        </div>
      </div>
    )
  }

  if (loadError || !detail) {
    return (
      <div className="ds task-detail-v2 wid-page view-task-detail ds-stagger">
        <div className="wid-topbar">
          <button className="wid-back" onClick={() => navigate('/execution')} type="button">
            {Icon.back} Workboard
          </button>
        </div>
        <div style={{ padding: '32px', maxWidth: 560 }}>
          <InlineNotice tone="error">{loadError ?? 'Work item not found.'}</InlineNotice>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button className="wid-btn wid-btn--primary" onClick={() => void loadDetail()} type="button">Try again</button>
            <button className="wid-btn" onClick={() => navigate('/execution')} type="button">Back to board</button>
          </div>
        </div>
      </div>
    )
  }

  const health = normalizeHealthStatus(detail.healthStatus)
  const dueDate = detail.targetCompletion ? new Date(detail.targetCompletion) : null
  const dueMsLeft = dueDate ? dueDate.getTime() - Date.now() : null
  const dueDays = dueMsLeft !== null ? Math.ceil(dueMsLeft / (24 * 60 * 60 * 1000)) : null
  const isOverdue = detail.status !== 'COMPLETED' && dueDays !== null && dueDays < 0
  const isDueSoon = detail.status !== 'COMPLETED' && dueDays !== null && dueDays >= 0 && dueDays <= 3

  // Situational alert priority: overdue > blocked > active-blockers > due-soon
  type AlertSpec = {
    tone: 'danger' | 'warn'
    icon: React.ReactNode
    title: string
    sub?: string
    actionLabel?: string
    onAction?: () => void
  }
  let alert: AlertSpec | null = null
  if (isOverdue) {
    alert = {
      tone: 'danger', icon: Icon.alert,
      title: `${Math.abs(dueDays!)} days overdue`,
      sub: dueDate ? dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined,
      actionLabel: !roleAccess.isMonitoringOnly ? 'Edit deadline' : undefined,
      onAction: !roleAccess.isMonitoringOnly ? beginTenggatEdit : undefined,
    }
  } else if (detail.isBlocked && detail.blockedReason) {
    alert = {
      tone: 'danger', icon: Icon.blocker,
      title: 'Work item blocked',
      sub: detail.blockedReason,
      actionLabel: 'View blocker',
      onAction: scrollToBlockers,
    }
  }
  // isDueSoon callout dropped — info "Nh lagi" sudah di hero due chip.
  // Pattern sama dengan activeBlockers (di-drop sebelumnya).

  const priority = (detail.priority ?? 'MEDIUM').toUpperCase()
  const priorityTone = SEV_TONE[priority as keyof typeof SEV_TONE] ?? SEV_TONE.MEDIUM

  return (
    <div className={`ds task-detail-v2 wid-page ds-stagger${mode === 'modal' ? ' wid-page--modal' : ' view-task-detail'}`}>
      {/* Phase 3 motion standardization:
          - `ds-stagger` (always): direct children cascade fade-up
          - `view-task-detail` (page mode only): wrapper opacity fade via view-enter
          Skip view-* in modal mode supaya tidak double-fade dengan modal entrance. */}

      {/* ── Top action bar ──────────────────────────────────────
          Hidden di modal mode — modal punya close button sendiri,
          dan breadcrumb/back tidak masuk akal dalam modal context. */}
      {mode === 'page' && (
      <div className="wid-topbar">
        <button className="wid-back" onClick={() => navigate('/execution')} type="button">
          {Icon.back} Workboard
        </button>
        <span className="wid-topbar__sep" aria-hidden="true" />
        {/* Trace strip dipersingkat — sebelumnya 4 segment (Programs > kode >
            nama panjang > workstream), terlalu deep dan ambil banyak space.
            Sekarang cuma kode program + workstream (paling actionable). */}
        <TraceStrip
          nodes={[
            ...(parentProgram
              ? [{ code: parentProgram.code, label: parentProgram.code, href: `/programs/${parentProgram.id}` } as TraceNode]
              : []),
            ...(detail.workstream ? [{ label: detail.workstream.name } as TraceNode] : []),
          ]}
        />
        <div className="wid-topbar__actions">
          {liveFlash && (
            <span className="wid-live-badge" title="Data updated by real-time sync">
              {Icon.wifi}
              <span>Live</span>
            </span>
          )}
          <button
            aria-label="Search & switch to another task"
            className="wid-iconbtn"
            onClick={() => { setShowQuickSwitch(true); setQsQuery(''); setQsIndex(0) }}
            title="Quick switch (⌘P)"
            type="button"
          >
            {Icon.search}
            <kbd className="wid-kbd">⌘P</kbd>
          </button>
          <button
            aria-label="Copy link to this task"
            className="wid-iconbtn"
            onClick={() => void copyWILink()}
            title="Copy link (⌘⇧C)"
            type="button"
          >
            {Icon.link}
          </button>
          <button
            aria-label="Open keyboard shortcut guide"
            className="wid-iconbtn"
            onClick={() => setShowHelp(true)}
            title="Keyboard shortcuts (?)"
            type="button"
          >
            <span style={{ fontWeight: 700, fontSize: 12, lineHeight: 1 }}>?</span>
          </button>
          {!roleAccess.isMonitoringOnly && !confirmDelete && (
            <>
              <span className="wid-topbar__sep" aria-hidden="true" />
              <button className="wid-iconbtn" onClick={beginTitleEdit} title="Edit title (E)" type="button">
                <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 12 12" width="12"><path d="M8.5 1.5a1.06 1.06 0 0 1 1.5 1.5L3.5 9.5l-3 1 1-3 6.5-6z"/></svg>
                Edit
                <kbd className="wid-kbd">E</kbd>
              </button>
              <button aria-label="Delete task" className="wid-iconbtn wid-iconbtn--danger" onClick={() => setConfirmDelete(true)} type="button">
                <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 12 12" width="12"><path d="M2 3h8M4 3V2h4v1M5 5.5v3M7 5.5v3M3 3l.5 7h5l.5-7"/></svg>
                Delete
              </button>
            </>
          )}
          {confirmDelete && (
            <div className="wid-confirm">
              <span className="wid-confirm__label">Delete permanently?</span>
              <button className="wid-confirm__btn wid-confirm__btn--danger" disabled={deleting} onClick={() => void doDelete()} type="button">
                {deleting ? '…' : 'Yes, Delete'}
              </button>
              <button className="wid-confirm__btn" disabled={deleting} onClick={() => setConfirmDelete(false)} type="button">Cancel</button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="wid-hero">
        <div className="wid-hero__meta">
          <span className="wid-chip wid-chip--code">{detail.code}</span>
          {/* Hide MEDIUM (default) — sesuai pakem ATLAS, priority chip cuma
              ditampilkan untuk non-default (HIGH/CRITICAL/LOW). */}
          {priority !== 'MEDIUM' && (
            <span className="wid-chip wid-chip--priority" style={{ background: priorityTone.bg, color: priorityTone.fg }}>
              <span className="wid-chip__dot" style={{ background: priorityTone.dot }} />
              {PRIORITY_LABELS[priority] ?? priority}
            </span>
          )}
          <HealthPill status={health} />
          {/* "Blocked" chip dihapus — sudah ada blocker callout di bawah
              hero yang lebih informatif (BLK-XXX · alasan + button "Buka").
              3 sinyal blocked sama = clutter. */}
        </div>

        {titleEditing ? (
          <input
            className="wid-hero__title-input"
            disabled={titleSaving}
            maxLength={200}
            onBlur={() => void commitTitleEdit()}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void commitTitleEdit() }
              if (e.key === 'Escape') { e.preventDefault(); setTitleEditing(false) }
            }}
            ref={titleInputRef}
            value={titleDraft}
          />
        ) : (
          <h1
            className={`wid-hero__title${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
            onClick={() => !roleAccess.isMonitoringOnly && beginTitleEdit()}
            title={roleAccess.isMonitoringOnly ? undefined : 'Click to edit (T)'}
          >
            {detail.title}
          </h1>
        )}

        <div className="wid-hero__statline">
          <div className={`wid-hero__progress${isDirty ? ' is-dirty' : ''}`}>
            <div className={`wid-hero__progress-track wid-hero__progress-track--${health.toLowerCase()}`}>
              <div className={`wid-hero__progress-fill wid-hero__progress-fill--${health.toLowerCase()}`} style={{ width: `${editDraft.percentComplete}%` }} />
            </div>
            <span className="wid-hero__progress-pct" key={editDraft.percentComplete}>{editDraft.percentComplete}%</span>
          </div>
          {/* Status tag dihapus dari statline — sudah ada status dropdown di
              form body bawah yang interactive. Pill di sini cuma read-only
              duplicate. */}
          {detail.assignee ? (
            !roleAccess.isMonitoringOnly && mode === 'modal' ? (
              <button
                type="button"
                className="wid-hero__assignee wid-hero__assignee--clickable"
                onClick={() => { setShowAssigneeEdit(true); void loadAssignUsers() }}
                title="Click to change executor"
              >
                <Avatar name={detail.assignee.name} />
                <span className="wid-hero__assignee-name">{detail.assignee.name}</span>
              </button>
            ) : (
              <div className="wid-hero__assignee">
                <Avatar name={detail.assignee.name} />
                <span className="wid-hero__assignee-name">{detail.assignee.name}</span>
              </div>
            )
          ) : !roleAccess.isMonitoringOnly && mode === 'modal' ? (
            <button
              type="button"
              className="wid-hero__assignee wid-hero__assignee--empty wid-hero__assignee--clickable"
              onClick={() => { setShowAssigneeEdit(true); void loadAssignUsers() }}
            >
              {Icon.user}
              <span>Unassigned</span>
            </button>
          ) : (
            <span className="wid-hero__assignee wid-hero__assignee--empty">
              {Icon.user}
              <span>Unassigned</span>
            </span>
          )}
          {dueDate ? (
            tenggatEditing ? (
              <span className="wid-hero__due wid-hero__due--editing">
                {Icon.calendar}
                <input
                  autoFocus
                  className="wid-tenggat-input"
                  disabled={tenggatSaving}
                  onBlur={() => void commitTenggatEdit(tenggatDraft)}
                  onChange={e => setTenggatDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitTenggatEdit(tenggatDraft) }
                    if (e.key === 'Escape') { e.preventDefault(); setTenggatEditing(false) }
                  }}
                  type="date"
                  value={tenggatDraft}
                />
              </span>
            ) : (
              <button
                aria-label="Edit deadline"
                className={`wid-hero__due wid-hero__due--btn${isOverdue ? ' wid-hero__due--overdue' : isDueSoon ? ' wid-hero__due--soon' : ''}${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
                disabled={roleAccess.isMonitoringOnly}
                onClick={beginTenggatEdit}
                title={roleAccess.isMonitoringOnly ? undefined : 'Click to edit deadline'}
                type="button"
              >
                {Icon.calendar}
                <span>{dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {dueDays !== null && detail.status !== 'COMPLETED' && (
                  <span className="wid-due-chip">
                    {isOverdue
                      ? `${Math.abs(dueDays)}d overdue`
                      : dueDays === 0 ? 'today'
                      : `${dueDays}d left`}
                  </span>
                )}
              </button>
            )
          ) : !roleAccess.isMonitoringOnly ? (
            tenggatEditing ? (
              <span className="wid-hero__due wid-hero__due--editing">
                {Icon.calendar}
                <input
                  autoFocus
                  className="wid-tenggat-input"
                  disabled={tenggatSaving}
                  onBlur={() => void commitTenggatEdit(tenggatDraft)}
                  onChange={e => setTenggatDraft(e.target.value)}
                  type="date"
                  value={tenggatDraft}
                />
              </span>
            ) : (
              <button
                className="wid-hero__due wid-hero__due--btn wid-hero__due--empty"
                onClick={beginTenggatEdit}
                type="button"
              >
                {Icon.calendar}
                <span>+ Set deadline</span>
              </button>
            )
          ) : null}
        </div>
      </div>

      {/* ── Situational alert ─────────────────────────────────── */}
      {alert && (
        <div className={`wid-alert wid-alert--${alert.tone}`}>
          <span className="wid-alert__icon">{alert.icon}</span>
          <div className="wid-alert__body">
            <strong>{alert.title}</strong>
            {alert.sub && <span className="wid-alert__sub"> · {alert.sub}</span>}
          </div>
          {alert.actionLabel && alert.onAction && (
            <button className={`wid-alert__action wid-alert__action--${alert.tone}`} onClick={alert.onAction} type="button">
              {alert.actionLabel}
              <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="11"><path d="m6 3 5 5-5 5"/></svg>
            </button>
          )}
        </div>
      )}

      {/* ── Metastrip — execution controls ───────────────────── */}
      {!roleAccess.isMonitoringOnly && !inPlanning ? (
        <form className="wid-metastrip" onSubmit={(e) => void saveExecution(e)}>
          <div className="wid-ms-field">
            <span className="wid-ms-label">Status</span>
            {/* Status read-only — di-derive dari progress (slider) + tombol review +
                section Blockers. Tidak ada dropdown manual supaya tidak ada dua
                cara set status yang membingungkan. */}
            <span className={`wid-status-tag wid-status-tag--${detail.status.toLowerCase().replace(/_/g, '-')}`}>
              <span className="wid-status-tag__dot" style={{ background: STATUS_DOT[detail.status] }} />
              {STATUS_LABELS[detail.status] ?? detail.status}
            </span>
          </div>
          <span className="wid-ms-sep" aria-hidden="true" />
          <div className="wid-ms-field wid-ms-field--progress">
            <span className="wid-ms-label">Progress</span>
            <input
              className="wid-slider"
              max={100}
              min={0}
              onChange={e => {
                // Progres = penggerak utama. Status di-derive backend saat simpan
                // (0→READY/BACKLOG, 1-99→IN_PROGRESS, 100→COMPLETED). Tidak lagi
                // mengubah editDraft.status di FE supaya tidak bentrok dengan derive.
                setEditDraft(d => ({ ...d, percentComplete: Number(e.target.value) }))
              }}
              onMouseUp={onSliderCommit}
              onTouchEnd={onSliderCommit}
              onKeyUp={onSliderCommit}
              disabled={!canStart || !canReportProgress}
              title={progressBlockReason || undefined}
              step={1}
              style={{
                '--wid-slider-pct': `${editDraft.percentComplete}%`,
                '--wid-slider-fill-bg': editDraft.status === 'BLOCKED' ? 'var(--red)'
                  : editDraft.status === 'IN_REVIEW' ? 'var(--yellow)'
                  : editDraft.status === 'COMPLETED' ? 'var(--green)'
                  : isOverdue ? 'var(--red)'
                  : 'var(--indigo)',
              } as React.CSSProperties}
              type="range"
              value={editDraft.percentComplete}
            />
            <span className="wid-ms-pct" key={editDraft.percentComplete}>{editDraft.percentComplete}%</span>
          </div>
          {progressBlockReason && (
            <span className="wid-ms-hint" role="note">⚠ {progressBlockReason}.</span>
          )}
          {isRegressing && (
            <div className="wid-ms-field wid-ms-regress">
              <span className="wid-ms-label">Decrease reason</span>
              <input
                className="wid-ms-select"
                type="text"
                placeholder="e.g. scope revision, wrong input"
                value={regressNote}
                onChange={e => setRegressNote(e.target.value)}
                maxLength={2000}
              />
            </div>
          )}
          <div className="wid-ms-actions">
            {actionStatus.message && (
              <span className="wid-ms-msg">✓ {actionStatus.message}</span>
            )}
            {/* Saved indicator non-button saat tidak dirty (sebelumnya outline
                button disabled — terlihat clickable padahal tidak). Saat dirty
                baru tampil button submit. */}
            {isDirty ? (
              <button
                className="wid-btn wid-btn--primary"
                disabled={actionStatus.saving}
                type="submit"
              >
                {actionStatus.saving ? '…' : 'Save'}
              </button>
            ) : (
              <span className="wid-ms-saved" aria-live="polite">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 6.5 5 9.5l5-7" />
                </svg>
                Saved
              </span>
            )}
          </div>
        </form>
      ) : (
        <div className="wid-metastrip wid-metastrip--readonly">
          <div className="wid-ms-field">
            <span className="wid-ms-label">Status</span>
            <span className={`wid-status-tag wid-status-tag--${detail.status.toLowerCase().replace(/_/g, '-')}`}>
              <span className="wid-status-tag__dot" style={{ background: STATUS_DOT[detail.status] }} />
              {STATUS_LABELS[detail.status] ?? detail.status}
            </span>
          </div>
          <span className="wid-ms-sep" aria-hidden="true" />
          <div className="wid-ms-field wid-ms-field--progress">
            <span className="wid-ms-label">Progress</span>
            <div className={`wid-hero__progress-track wid-hero__progress-track--${health.toLowerCase()}`} style={{ width: 140 }}>
              <div className={`wid-hero__progress-fill wid-hero__progress-fill--${health.toLowerCase()}`} style={{ width: `${detail.percentComplete}%` }} />
            </div>
            <span className="wid-ms-pct">{detail.percentComplete}%</span>
          </div>
          {inPlanning && (
            <span className="wid-ms-lock-hint">
              Program is still in Planning — status &amp; progress become available once Execution begins.
            </span>
          )}
        </div>
      )}

      {/* ── Single-column body ────────────────────────────────── */}
      <div className="wid-body">

        {/* Content column */}
        <div className="wid-main">

          {/* Description — inline editable */}
          {(detail.description || !roleAccess.isMonitoringOnly) && (
            <section className="wid-panel wid-panel--flat">
              <div className="wid-panel__head">
                <h3 className="wid-panel__title">
                  <span className="wid-panel__icon">{Icon.info}</span>
                  Description
                </h3>
                {/* "Edit" button dihapus — text di body already click-to-edit
                    (.wid-desc.is-editable). Tombol di header = duplicate path. */}
              </div>
              <div className="wid-panel__body">
                {descEditing ? (
                  <div className="wid-desc-edit">
                    <textarea
                      className="wid-desc-edit__textarea"
                      disabled={descSaving}
                      maxLength={2000}
                      onBlur={() => void commitDescEdit()}
                      onChange={e => setDescDraft(e.target.value)}
                      onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void commitDescEdit() }
                        if (e.key === 'Escape') { e.preventDefault(); setDescEditing(false) }
                      }}
                      placeholder="Task description, context, or attachments the team should read…"
                      ref={descInputRef}
                      rows={Math.max(3, Math.min(10, descDraft.split('\n').length + 1))}
                      value={descDraft}
                    />
                    <p className="wid-desc-edit__hint">
                      <kbd className="wid-kbd">⌘↵</kbd> save · <kbd className="wid-kbd">ESC</kbd> cancel
                    </p>
                  </div>
                ) : detail.description ? (
                  <p
                    className={`wid-desc${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
                    onClick={() => !roleAccess.isMonitoringOnly && beginDescEdit()}
                    title={roleAccess.isMonitoringOnly ? undefined : 'Click to edit'}
                  >
                    {detail.description}
                  </p>
                ) : (
                  <button className="wid-desc-add" onClick={beginDescEdit} type="button">
                    <span className="wid-desc-add__icon">+</span>
                    Add task description
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Subtasks */}
          <section className="wid-panel wid-panel--flat">
            <div className="wid-panel__head">
              <h3 className="wid-panel__title">
                <span className="wid-panel__icon">{Icon.subtask}</span>
                Subtasks
                {subtaskStats.total > 0 && (
                  <span className="wid-panel__count">{subtaskStats.done}/{subtaskStats.total}</span>
                )}
              </h3>
              {subtaskStats.total > 0 && (
                <div className="wid-subtask-minibar">
                  <div className="wid-subtask-minibar__track">
                    <div className="wid-subtask-minibar__fill" style={{ width: `${subtaskStats.pct}%` }} />
                  </div>
                  <span className="wid-subtask-minibar__pct">{subtaskStats.pct}%</span>
                </div>
              )}
              {!roleAccess.isMonitoringOnly && (
                <button className={`wid-panel__action${showAddSubtask ? ' is-cancel' : ''}`} onClick={() => setShowAddSubtask(v => !v)} type="button">
                  {showAddSubtask ? 'Cancel' : '+ Add'}
                </button>
              )}
            </div>
            {(subtaskStats.total > 0 || showAddSubtask) && (
            <div className="wid-panel__body">
              {subtaskStats.total > 0 && (
                <div className="wid-subtask-list">
                  {(detail.subTasks ?? []).map(st => (
                    <div className={`wid-subtask-row${celebrateIds.has(st.id) ? ' is-celebrating' : ''}`} key={st.id}>
                      <button
                        className={`wid-subtask-check${st.isCompleted ? ' is-done' : ''}${celebrateIds.has(st.id) ? ' is-celebrating' : ''}`}
                        disabled={togglingSubtask === st.id || roleAccess.isMonitoringOnly || inPlanning}
                        onClick={() => void toggleSubtask(st.id)}
                        title={inPlanning ? 'Subtasks can be checked off once the program enters Execution' : undefined}
                        type="button"
                      >
                        {st.isCompleted ? (
                          <svg fill="none" height="16" viewBox="0 0 16 16" width="16">
                            <circle cx="8" cy="8" fill="var(--indigo)" r="7" stroke="var(--indigo)" strokeWidth="1.5"/>
                            <path d="M5 8l2 2 4-4" stroke="var(--text-inverse)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/>
                          </svg>
                        ) : (
                          <svg fill="none" height="16" viewBox="0 0 16 16" width="16">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                        )}
                      </button>
                      <span className={`wid-subtask-title${st.isCompleted ? ' is-done' : ''}`}>{st.title}</span>
                      {!roleAccess.isMonitoringOnly && (
                        <button className="wid-subtask-del" onClick={() => void deleteSubtask(st.id)} type="button" title="Delete">
                          <svg fill="none" height="10" viewBox="0 0 10 10" width="10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Inline "+ Tambah subtask" empty-state link dihapus — duplicate
                  dengan header "+ Tambah" button. User punya 1 entry point clear. */}

              {showAddSubtask && (
                <form className="wid-subtask-add" onSubmit={(e) => void submitAddSubtask(e)}>
                  <svg fill="none" height="16" style={{ color: 'var(--text-muted)', flexShrink: 0 }} viewBox="0 0 16 16" width="16">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 5v6M5 8h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                  </svg>
                  <input
                    autoFocus
                    className="wid-subtask-add__input"
                    disabled={stSaving}
                    maxLength={160}
                    onChange={e => setStTitle(e.target.value)}
                    placeholder="New subtask name…"
                    type="text"
                    value={stTitle}
                  />
                  <button className="wid-subtask-add__submit" disabled={stSaving || !stTitle.trim()} type="submit">
                    {stSaving ? '…' : 'Save'}
                  </button>
                  <button className="wid-subtask-add__cancel" onClick={() => { setShowAddSubtask(false); setStTitle('') }} type="button">
                    <svg fill="none" height="10" viewBox="0 0 10 10" width="10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/></svg>
                  </button>
                </form>
              )}
            </div>
            )}
          </section>

          {/* Blockers — only render when there's something to show or user is adding */}
          {((detail.blockers ?? []).length > 0 || showCreateBlocker || !roleAccess.isMonitoringOnly) && (
          <section className="wid-panel wid-panel--flat" ref={blockerSectionRef}>
            <div className="wid-panel__head">
              <h3 className="wid-panel__title">
                <span className="wid-panel__icon" style={{ color: activeBlockers.length > 0 ? 'var(--red)' : undefined }}>{Icon.blocker}</span>
                Blockers
                {activeBlockers.length > 0 && (
                  <span className="wid-panel__count wid-panel__count--danger">{activeBlockers.length}</span>
                )}
              </h3>
              {!roleAccess.isMonitoringOnly && !inPlanning && (
                <button
                  className={`wid-panel__action${showCreateBlocker ? ' is-cancel' : ''}`}
                  onClick={() => { setShowCreateBlocker(v => !v); setBlError(null); void loadAssignUsers() }}
                  type="button"
                >
                  {showCreateBlocker ? 'Cancel' : '+ Blocker'}
                </button>
              )}
            </div>
            <div className="wid-panel__body">
              {inPlanning && (detail.blockers ?? []).length === 0 && (
                <p className="wid-bl-locked">
                  Blockers can only be created once the program enters the Execution phase.
                </p>
              )}
              {showCreateBlocker && !inPlanning && (
                <form className="wid-bl-form" onSubmit={(e) => void submitCreateBlocker(e)}>
                  <div className="wid-form__row">
                    <input className="wid-input" disabled={blSaving} maxLength={40} minLength={3} onChange={e => setBlForm(f => ({ ...f, code: e.target.value }))} placeholder="Code (BLK-001)" required style={{ flex: '0 0 140px' }} type="text" value={blForm.code} />
                    <select className="wid-input" disabled={blSaving} onChange={e => setBlForm(f => ({ ...f, severity: e.target.value }))} value={blForm.severity}>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                  <input className="wid-input" disabled={blSaving} maxLength={120} minLength={3} onChange={e => setBlForm(f => ({ ...f, title: e.target.value }))} placeholder="Blocker title *" required type="text" value={blForm.title} />
                  <textarea className="wid-input" disabled={blSaving} maxLength={400} onChange={e => setBlForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" rows={2} style={{ resize: 'vertical' }} value={blForm.description} />
                  <div className="wid-form__row wid-form__row--baseline">
                    <div style={{ flex: 1 }}>
                      <UserPicker
                        allowClear
                        clearLabel="— Remove assignee —"
                        disabled={blSaving}
                        inputClassName="wid-input"
                        onChange={id => setBlForm(f => ({ ...f, assignedTo: id ? String(id) : '' }))}
                        options={assignUsers}
                        placeholder="Assignee (optional)"
                        value={blForm.assignedTo ? Number(blForm.assignedTo) : null}
                      />
                    </div>
                    {blError && <span className="wid-form__error" style={{ margin: 0 }}>{blError}</span>}
                    <button className="wid-btn wid-btn--primary" disabled={blSaving} type="submit">
                      {blSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              )}


              {(detail.blockers ?? []).map(bl => {
                const tone = SEV_TONE[bl.severity as keyof typeof SEV_TONE] ?? SEV_TONE.MEDIUM
                const isEditing = blEditTarget?.id === bl.id || blStatusTarget?.id === bl.id || blDeleteConfirmId === bl.id
                const resolved = bl.status === 'RESOLVED'
                return (
                  <div className={`wid-bl-card${isEditing ? ' is-editing' : ''}${resolved ? ' is-resolved' : ''}`} key={bl.id}>
                    <div className="wid-bl-avatar" style={{ background: resolved ? 'var(--indigo-dim)' : tone.bg, color: resolved ? 'var(--indigo)' : tone.fg }}>
                      {Icon.blocker}
                    </div>
                    <div className="wid-bl-body">
                      <div className="wid-bl-meta">
                        <span className="wid-bl-code">{bl.code}</span>
                        <span className="wid-bl-sev" style={{ background: tone.bg, color: tone.fg }}>
                          {PRIORITY_LABELS[bl.severity] ?? bl.severity}
                        </span>
                        <span className={`wid-bl-status wid-bl-status--${bl.status.toLowerCase()}`}>
                          {bl.status === 'OPEN' ? 'Open' : bl.status === 'IN_PROGRESS' ? 'In Progress' : 'Resolved'}
                        </span>
                      </div>
                      <p className="wid-bl-title">{bl.title}</p>
                      {bl.description && <p className="wid-bl-desc">{bl.description}</p>}

                      {blEditTarget?.id === bl.id && (
                        <form onSubmit={(e) => void submitEditBlocker(e)} className="wid-bl-inline-form">
                          <input className="wid-input" disabled={blEditSaving} maxLength={120} onChange={e => setBlEditTarget(t => t ? { ...t, title: e.target.value } : t)} value={blEditTarget.title} />
                          <select className="wid-input" disabled={blEditSaving} onChange={e => setBlEditTarget(t => t ? { ...t, severity: e.target.value } : t)} value={blEditTarget.severity}>
                            <option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
                          </select>
                          <textarea className="wid-input" disabled={blEditSaving} onChange={e => setBlEditTarget(t => t ? { ...t, description: e.target.value } : t)} rows={2} style={{ resize: 'vertical' }} value={blEditTarget.description} />
                          <UserPicker
                            allowClear
                            clearLabel="— Remove assignee —"
                            disabled={blEditSaving}
                            inputClassName="wid-input"
                            onChange={id => setBlEditTarget(t => t ? { ...t, assignedTo: id } : t)}
                            options={assignUsers}
                            placeholder="Assignee (optional)"
                            value={blEditTarget.assignedTo}
                          />
                          <div className="wid-form__actions">
                            <button className="wid-btn wid-btn--primary" disabled={blEditSaving} type="submit">{blEditSaving ? '…' : 'Save'}</button>
                            <button className="wid-btn" onClick={() => setBlEditTarget(null)} type="button">Cancel</button>
                          </div>
                        </form>
                      )}
                      {blStatusTarget?.id === bl.id && (
                        <form onSubmit={(e) => void submitUpdateBlockerStatus(e)} className="wid-bl-inline-form">
                          <select className="wid-input" disabled={blStatusSaving} onChange={e => setBlStatusTarget(t => t ? { ...t, status: e.target.value } : t)} value={blStatusTarget.status}>
                            <option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Resolved</option>
                          </select>
                          {blStatusTarget.status === 'RESOLVED' && (
                            <textarea className="wid-input" disabled={blStatusSaving} onChange={e => setBlStatusTarget(t => t ? { ...t, resolution: e.target.value } : t)} placeholder="Resolution note (optional)" rows={2} style={{ resize: 'vertical' }} value={blStatusTarget.resolution} />
                          )}
                          <div className="wid-form__actions">
                            <button className="wid-btn wid-btn--primary" disabled={blStatusSaving} type="submit">{blStatusSaving ? '…' : 'Save'}</button>
                            <button className="wid-btn" onClick={() => setBlStatusTarget(null)} type="button">Cancel</button>
                          </div>
                        </form>
                      )}
                      {blDeleteConfirmId === bl.id && (
                        <div className="wid-bl-delete-confirm">
                          <span>Delete this blocker?</span>
                          <button className="wid-btn wid-btn--danger" disabled={blDeleteSaving} onClick={() => void submitDeleteBlocker(bl.id)} type="button">
                            {blDeleteSaving ? '…' : 'Yes'}
                          </button>
                          <button className="wid-btn" disabled={blDeleteSaving} onClick={() => setBlDeleteConfirmId(null)} type="button">Cancel</button>
                        </div>
                      )}
                    </div>
                    {!resolved && (
                      <div style={{ marginTop: 4 }}>
                        <EscalationButton
                          sourceType="BLOCKER"
                          sourceId={bl.id}
                          prefillTitle={`Support needed: ${bl.title}`}
                          prefillDescription={bl.description ?? undefined}
                          size="sm"
                        />
                      </div>
                    )}
                    {!roleAccess.isMonitoringOnly && (
                      <div className="wid-bl-actions">
                        <button className="wid-bl-actionbtn" onClick={() => setBlEditTarget(t => t?.id === bl.id ? null : { id: bl.id, title: bl.title, description: bl.description ?? '', severity: bl.severity, assignedTo: bl.assignedTo ?? null })} title="Edit" type="button">
                          <svg fill="none" height="12" viewBox="0 0 12 12" width="12"><path d="M8.5 1.5a1.06 1.06 0 0 1 1.5 1.5L3.5 9.5l-3 1 1-3 6.5-6z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/></svg>
                        </button>
                        <button className="wid-bl-actionbtn" onClick={() => setBlStatusTarget(t => t?.id === bl.id ? null : { id: bl.id, status: bl.status, resolution: '' })} title="Change status" type="button">
                          <svg fill="none" height="12" viewBox="0 0 12 12" width="12"><path d="M10 2.5A4.5 4.5 0 1 1 2 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/><path d="M2 2.5v4H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/></svg>
                        </button>
                        <button className="wid-bl-actionbtn wid-bl-actionbtn--danger" onClick={() => setBlDeleteConfirmId(i => i === bl.id ? null : bl.id)} title="Delete" type="button">
                          <svg fill="none" height="12" viewBox="0 0 12 12" width="12"><path d="M2 3h8M4 3V2h4v1M5 5.5v3M7 5.5v3M3 3l.5 7h5l.5-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
          )}

          {/* Discussion */}
          <section className="wid-panel wid-panel--flat">
            <div className="wid-panel__head">
              <h3 className="wid-panel__title">
                <span className="wid-panel__icon">{Icon.chat}</span>
                Discussion
                {(detail.comments ?? []).length > 0 && <span className="wid-panel__count">{detail.comments.length}</span>}
              </h3>
            </div>
            <div className="wid-panel__body">
              {(detail.comments ?? []).length > 0 && (
                <CommentThreadList
                  comments={detail.comments ?? []}
                  currentUserId={currentUser?.id}
                  onDelete={(cid) => void deleteComment(cid)}
                  onReact={(cid) => void reactToComment(cid)}
                  onReply={(cid) => setReplyTargetId(cid)}
                />
              )}

              <form className={`wid-composer${commentValue.trim().length > 0 ? ' is-dirty' : ''}`} onSubmit={(e) => void submitComment(e)}>
                {currentUser && (
                  <div className="wid-composer__author"><Avatar name={currentUser.name} /></div>
                )}
                <div className="wid-composer__body">
                  {replyTargetId && (
                    <div className="wid-composer__context">
                      <span className="badge">Reply #{replyTargetId}</span>
                    </div>
                  )}
                  {(commentFocused || commentValue.trim().length > 0) && (
                    <div className="wid-composer__header">
                      <ComposerModeToggle mode={composerMode} onModeChange={setComposerMode} />
                      <div className="wid-tpl">
                        <button
                          className={`wid-tpl__trigger${showTemplates ? ' is-open' : ''}`}
                          onClick={() => setShowTemplates(v => !v)}
                          type="button"
                        >
                          + Template
                          <svg fill="none" height="8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 10 6" width="8"><path d="M1 1l4 4 4-4"/></svg>
                        </button>
                        {showTemplates && (
                          <div className="wid-tpl__menu">
                            {COMPOSER_TEMPLATES.map(t => (
                              <button
                                className="wid-tpl__item"
                                key={t.label}
                                onClick={() => {
                                  appendComposerSnippet(setCommentValue, t.value)
                                  setShowTemplates(false)
                                  setTimeout(() => composerRef.current?.focus(), 30)
                                }}
                                type="button"
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {composerMode === 'edit' ? (
                    <div className="wid-composer__textwrap">
                      <textarea
                        className="wid-composer__textarea"
                        onFocus={() => setCommentFocused(true)}
                        onBlur={() => setCommentFocused(false)}
                        onChange={e => {
                          const v = e.target.value
                          setCommentValue(v)
                          autoResize(e.currentTarget)
                          // @mention detection
                          const pos = e.currentTarget.selectionStart ?? v.length
                          const upto = v.slice(0, pos)
                          const atMatch = upto.match(/@([\w\u00C0-\uFFFF.\- ]{0,24})$/)
                          if (atMatch) {
                            setMentionAnchor(pos - atMatch[0].length)
                            setMentionQuery(atMatch[1])
                            setMentionIndex(0)
                            setMentionOpen(true)
                            void loadAssignUsers()
                          } else {
                            setMentionOpen(false)
                          }
                        }}
                        onKeyDown={e => {
                          // Mention nav
                          if (mentionOpen) {
                            const filtered = assignUsers.filter(u =>
                              u.name.toLowerCase().includes(mentionQuery.toLowerCase())
                            ).slice(0, 6)
                            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(filtered.length - 1, i + 1)); return }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(0, i - 1)); return }
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              if (filtered[mentionIndex]) {
                                e.preventDefault()
                                const user = filtered[mentionIndex]
                                const ta = e.currentTarget
                                const pos = ta.selectionStart ?? commentValue.length
                                const before = commentValue.slice(0, mentionAnchor ?? pos)
                                const after = commentValue.slice(pos)
                                const inserted = `@${user.name} `
                                const next = before + inserted + after
                                setCommentValue(next)
                                setMentionOpen(false)
                                setTimeout(() => {
                                  ta.focus()
                                  const newPos = before.length + inserted.length
                                  ta.setSelectionRange(newPos, newPos)
                                  autoResize(ta)
                                }, 10)
                                return
                              }
                            }
                            if (e.key === 'Escape') { e.preventDefault(); setMentionOpen(false); return }
                          }
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            if (commentValue.trim() && !sending) (e.currentTarget.form as HTMLFormElement)?.requestSubmit()
                          }
                        }}
                        placeholder="Execution update, blocker context, next step…  (⌘↵ send · / focus · @ mention)"
                        ref={composerRef}
                        rows={2}
                        value={commentValue}
                      />
                      {mentionOpen && (() => {
                        const filtered = assignUsers.filter(u =>
                          u.name.toLowerCase().includes(mentionQuery.toLowerCase())
                        ).slice(0, 6)
                        if (filtered.length === 0) return null
                        return (
                          <div className="wid-mention-menu" role="listbox">
                            {filtered.map((u, i) => (
                              <button
                                className={`wid-mention-item${i === mentionIndex ? ' is-active' : ''}`}
                                key={u.id}
                                onMouseDown={e => {
                                  e.preventDefault()
                                  const ta = composerRef.current
                                  if (!ta) return
                                  const pos = ta.selectionStart ?? commentValue.length
                                  const before = commentValue.slice(0, mentionAnchor ?? pos)
                                  const after = commentValue.slice(pos)
                                  const inserted = `@${u.name} `
                                  const next = before + inserted + after
                                  setCommentValue(next)
                                  setMentionOpen(false)
                                  setTimeout(() => {
                                    ta.focus()
                                    const newPos = before.length + inserted.length
                                    ta.setSelectionRange(newPos, newPos)
                                    autoResize(ta)
                                  }, 10)
                                }}
                                type="button"
                              >
                                <Avatar name={u.name} />
                                <div className="wid-mention-item__meta">
                                  <span className="wid-mention-item__name">{u.name}</span>
                                  {u.positionTitle && <span className="wid-mention-item__role">{u.positionTitle}</span>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <RichTextPreview emptyText="Preview" value={commentValue} />
                  )}
                  {commentError && <p className="wid-form__error">{commentError}</p>}
                  <div className="wid-composer__actions">
                    {replyTargetId
                      ? <button className="wid-btn" onClick={() => setReplyTargetId(null)} type="button">Cancel reply</button>
                      : <span className="wid-composer__hint">
                          <kbd className="wid-kbd">⌘↵</kbd> to send
                        </span>
                    }
                    <button className="wid-btn wid-btn--primary" disabled={sending || !commentValue.trim()} type="submit">
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>

        </div>{/* /.wid-main */}

        {/* ── Rail — Konteks & Tim (sticky di modal mode) ── */}
        <aside className="wid-rail">
          {/* ── Info footer — Tim, Ren, Konteks, Program ──── */}
          <div className="wid-info-footer wid-info-footer--rail">
            {mode !== 'modal' && (
              <button
                className="wid-info-footer__toggle"
                onClick={() => {
                  togglePanel('infoFooter')
                  if (collapsed.infoFooter) { loadOrgUnits(); void loadAssignUsers() }
                }}
                type="button"
              >
                <svg
                  className={`wid-info-footer__chevron${collapsed.infoFooter ? '' : ' is-open'}`}
                  fill="none"
                  height="10"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 10 6"
                  width="10"
                >
                  <path d="M1 1l4 4 4-4"/>
                </svg>
                Context & Team
              </button>
            )}

            {(mode === 'modal' || !collapsed.infoFooter) && (
              <div className="wid-info-footer__body">

                {/* Tim block */}
                <div className="wid-info-footer__block">
                  <p className="wid-info-footer__block-title">Team</p>

                  <div className={`wid-team-row wid-team-row--executor${showAssigneeEdit ? ' is-editing' : ''}`}>
                    <span className="wid-sp-label">Executor</span>
                    {showAssigneeEdit && !roleAccess.isMonitoringOnly ? (
                      <div className="wid-team-row__edit">
                        <UserPicker
                          allowClear
                          autoOpen
                          clearLabel="— Remove assignee —"
                          disabled={assignSaving}
                          inputClassName="wid-input"
                          onChange={id => void handleAssign(id)}
                          options={assignUsers}
                          placeholder="Select executor…"
                          value={detail.assignee?.id ?? null}
                        />
                        <button className="wid-btn" onClick={() => setShowAssigneeEdit(false)} type="button">Cancel</button>
                      </div>
                    ) : detail.assignee ? (
                      <button
                        className="wid-team-row__person"
                        disabled={assignSaving || roleAccess.isMonitoringOnly}
                        onClick={() => { if (!roleAccess.isMonitoringOnly) { setShowAssigneeEdit(true); void loadAssignUsers() } }}
                        type="button"
                      >
                        <Avatar name={detail.assignee.name} />
                        <span className="wid-team-row__name">{detail.assignee.name}</span>
                        {!roleAccess.isMonitoringOnly && <svg aria-hidden="true" fill="none" height="9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" viewBox="0 0 10 6" width="9"><path d="M1 1l4 4 4-4"/></svg>}
                      </button>
                    ) : !roleAccess.isMonitoringOnly ? (
                      <button
                        className="wid-flat-add"
                        disabled={assignSaving}
                        onClick={() => { setShowAssigneeEdit(true); void loadAssignUsers() }}
                        type="button"
                      >
                        + Assign{currentUser && <span className="wid-flat-add__kbd"><kbd className="wid-kbd">A</kbd></span>}
                      </button>
                    ) : <span className="wid-sp-val">—</span>}
                  </div>

                  {!roleAccess.isMonitoringOnly && (
                    <>
                      <div className="wid-team-row">
                        <span className="wid-sp-label">PIC</span>
                        <div className="wid-team-row__chips">
                          {(() => {
                            const currentId = (detail?.picPersonIds ?? [])[0]
                            if (currentId) {
                              const person = assignUsers.find((u) => u.id === currentId)
                              const label = person ? person.name : `#${currentId}`
                              return (
                                <span className="wid-pic-chip">
                                  {label}
                                  <button type="button" className="wid-pic-chip__remove"
                                    disabled={picSaving} onClick={() => savePicPersons([])}
                                    aria-label={`Remove PIC ${label}`}>×</button>
                                </span>
                              )
                            }
                            return null
                          })()}
                          {!showPicAdder ? (
                            <button
                              type="button"
                              className="wid-pic-adder-toggle"
                              onClick={() => { setShowPicAdder(true); void loadAssignUsers() }}
                              disabled={picSaving}
                            >
                              {(detail?.picPersonIds ?? []).length > 0 ? 'Change' : '+ Select'}
                            </button>
                          ) : (
                          <div className="wid-pic-adder">
                            <input
                              autoFocus
                              className="wid-pic-search"
                              disabled={picSaving}
                              onBlur={() => { if (picPersonSearch.length === 0) setShowPicAdder(false) }}
                              onChange={(e) => { setPicPersonSearch(e.target.value); void loadAssignUsers() }}
                              onKeyDown={(e) => { if (e.key === 'Escape') { setPicPersonSearch(''); setShowPicAdder(false) } }}
                              placeholder={(detail?.picPersonIds ?? []).length > 0 ? 'Search name…' : 'Search name…'}
                              value={picPersonSearch}
                            />
                            {picPersonSearch.length > 0 && (() => {
                              const currentId = (detail?.picPersonIds ?? [])[0]
                              const filtered = assignUsers.filter(
                                (u) => u.id !== currentId &&
                                  u.name.toLowerCase().includes(picPersonSearch.toLowerCase())
                              ).slice(0, 6)
                              return filtered.length > 0 ? (
                                <div className="wid-pic-dropdown">
                                  {filtered.map((u) => (
                                    <button key={u.id} type="button" className="wid-pic-dropdown__item"
                                      onMouseDown={() => { void savePicPersons([u.id]); setPicPersonSearch('') }}>
                                      <span className="wid-pic-dropdown__name">{u.name}</span>
                                      {u.positionTitle && <span className="wid-pic-dropdown__role">{u.positionTitle}</span>}
                                    </button>
                                  ))}
                                </div>
                              ) : null
                            })()}
                          </div>
                          )}
                        </div>
                      </div>

                      <div className="wid-team-row">
                        <span className="wid-sp-label">Unit</span>
                        <div className="wid-team-row__chips">
                          {(detail?.picUnitIds ?? []).map((uid) => {
                            const unit = orgUnits.find((u) => u.id === uid)
                            const label = unit ? unit.code : `#${uid}`
                            return (
                              <span key={uid} className="wid-pic-chip">
                                {label}
                                <button type="button" className="wid-pic-chip__remove"
                                  disabled={picSaving}
                                  onClick={() => savePicUnits((detail?.picUnitIds ?? []).filter((x) => x !== uid))}
                                  aria-label={`Remove ${label}`}>×</button>
                              </span>
                            )
                          })}
                          {!showUnitAdder ? (
                            <button
                              type="button"
                              className="wid-pic-adder-toggle"
                              onClick={() => { setShowUnitAdder(true); loadOrgUnits() }}
                              disabled={picSaving}
                            >
                              + Add unit
                            </button>
                          ) : (
                          <div className="wid-pic-adder">
                            <input
                              autoFocus
                              className="wid-pic-search"
                              disabled={picSaving}
                              onBlur={() => { if (picUnitSearch.length === 0) setShowUnitAdder(false) }}
                              onChange={(e) => { setPicUnitSearch(e.target.value); loadOrgUnits() }}
                              onKeyDown={(e) => { if (e.key === 'Escape') { setPicUnitSearch(''); setShowUnitAdder(false) } }}
                              placeholder="Search unit code/name…"
                              value={picUnitSearch}
                            />
                            {picUnitSearch.length > 0 && (() => {
                              const current = new Set(detail?.picUnitIds ?? [])
                              const filtered = orgUnits.filter(
                                (u) => !current.has(u.id) &&
                                  (u.code.toLowerCase().includes(picUnitSearch.toLowerCase()) ||
                                   u.name.toLowerCase().includes(picUnitSearch.toLowerCase()))
                              ).slice(0, 6)
                              return filtered.length > 0 ? (
                                <div className="wid-pic-dropdown">
                                  {filtered.map((u) => (
                                    <button key={u.id} type="button" className="wid-pic-dropdown__item"
                                      onMouseDown={() => { savePicUnits([...(detail?.picUnitIds ?? []), u.id]); setPicUnitSearch('') }}>
                                      <span className="code-badge">{u.code}</span>
                                      <span className="wid-pic-dropdown__name">{u.name}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null
                            })()}
                          </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Detail metadata block */}
                <div className="wid-info-footer__block">
                  <p className="wid-info-footer__block-title">Detail</p>
                  <div className="wid-sp-grid">
                    <div className="wid-sp-grid__cell">
                      <span className="wid-sp-label">Priority</span>
                      {priorityEditing && !roleAccess.isMonitoringOnly ? (
                        <select
                          autoFocus
                          className="wid-input wid-input--inline"
                          disabled={prioritySaving}
                          onBlur={() => setPriorityEditing(false)}
                          onChange={e => void savePriority(e.target.value)}
                          value={priority}
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      ) : (
                        <button
                          className={`wid-chip wid-chip--priority${roleAccess.isMonitoringOnly ? '' : ' is-editable'}`}
                          disabled={prioritySaving || roleAccess.isMonitoringOnly}
                          onClick={() => !roleAccess.isMonitoringOnly && setPriorityEditing(true)}
                          style={{ background: priorityTone.bg, color: priorityTone.fg, fontSize: 10.5, padding: '2px 8px', cursor: roleAccess.isMonitoringOnly ? 'default' : 'pointer', border: 'none' }}
                          title={roleAccess.isMonitoringOnly ? undefined : 'Click to change priority'}
                          type="button"
                        >
                          <span className="wid-chip__dot" style={{ background: priorityTone.dot }} />
                          {PRIORITY_LABELS[priority] ?? priority}
                        </button>
                      )}
                    </div>
                    {dueDate && (
                      <div className="wid-sp-grid__cell">
                        <span className="wid-sp-label">Deadline</span>
                        <span className={`wid-sp-val${isOverdue ? ' is-overdue' : isDueSoon ? ' is-soon' : ''}`}>
                          {dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                    {detail.estimatedHours != null && (() => {
                      const est = formatEstimate(detail.estimatedHours!)
                      return (
                        <div className="wid-sp-grid__cell">
                          <span className="wid-sp-label">Estimate</span>
                          <span className="wid-sp-val">
                            {est.primary}
                            {est.secondary && <span className="wid-sp-sub"> · {est.secondary}</span>}
                          </span>
                        </div>
                      )
                    })()}
                    {detail.workstream && (
                      <div className="wid-sp-grid__cell wid-sp-grid__cell--full">
                        <span className="wid-sp-label">Workstream</span>
                        <span className="wid-sp-val wid-sp-val--wrap">{detail.workstream.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ren block */}
                {!roleAccess.isMonitoringOnly && (
                  <div className="wid-info-footer__block wid-info-footer__block--full">
                    <p className="wid-info-footer__block-title">Weekly Plan</p>
                    {!renEditing ? (
                      <div className="wid-ren-view">
                        {(detail?.plannedWeeks ?? []).length > 0 ? (
                          <>
                            <div className="wid-ren-weeks">
                              {(detail!.plannedWeeks!).map(w => (
                                <span className="wid-ren-week-chip" key={w}>{formatWeekLabel(w)}</span>
                              ))}
                            </div>
                            <button className="btn btn--ghost wid-ren-edit-btn" onClick={openRenEditor} type="button">Edit schedule</button>
                          </>
                        ) : (
                          <button className="wid-flat-add" onClick={openRenEditor} type="button">+ Set up Plan</button>
                        )}
                      </div>
                    ) : (
                      <div className="wid-ren-editor">
                        <div className="wid-ren-range">
                          <div className="form-field wid-ren-field">
                            <label>Start week</label>
                            <input onChange={e => setRenStart(e.target.value)} type="week" value={renStart} />
                          </div>
                          <div className="form-field wid-ren-field">
                            <label>End week</label>
                            <input min={renStart} onChange={e => setRenEnd(e.target.value)} type="week" value={renEnd} />
                          </div>
                        </div>
                        {renStart && renEnd && renStart <= renEnd && (
                          <p className="wid-ren-preview">{weeksInRange(renStart, renEnd).length} weeks selected</p>
                        )}
                        <div className="wid-ren-actions">
                          <button className="profile-save-btn" disabled={renSaving || !renStart || !renEnd || renStart > renEnd} onClick={() => void saveRen()} type="button">
                            {renSaving ? 'Saving…' : 'Save'}
                          </button>
                          {(detail?.plannedWeeks ?? []).length > 0 && (
                            <button className="btn btn--ghost" disabled={renSaving} onClick={() => void clearRen()} type="button">Delete</button>
                          )}
                          <button className="btn btn--ghost" disabled={renSaving} onClick={() => setRenEditing(false)} type="button">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Weekly Realization block — input realisasi di sisi Workboard;
                    tab Timeline read-only menampilkannya (catatan 24 Jun opsi B). */}
                {canReportProgress && !inPlanning && (
                  <div className="wid-info-footer__block wid-info-footer__block--full">
                    <p className="wid-info-footer__block-title">Weekly Realization</p>
                    {!realEditing ? (
                      <div className="wid-ren-view">
                        {realIsManual && (detail?.actualWeeks ?? []).length > 0 ? (
                          <div className="wid-ren-weeks">
                            {(detail!.actualWeeks!).map(w => (
                              <span className="wid-ren-week-chip" key={w}>{formatWeekLabel(w)}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="wid-ren-auto-note">
                            Auto — derived from progress ({detail?.percentComplete ?? 0}%). Shown read-only on the program Timeline.
                          </p>
                        )}
                        {realCandidateWeeks.length > 0 && (
                          <button className="btn btn--ghost wid-ren-edit-btn" onClick={openRealEditor} type="button">
                            {realIsManual ? 'Edit realization' : 'Set manually'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="wid-ren-editor">
                        <p className="wid-ren-hint">Pick the weeks actually worked (can be non-contiguous). Clearing all reverts to auto.</p>
                        <div className="wid-ren-weeks wid-ren-weeks--toggle">
                          {realCandidateWeeks.map(w => {
                            const on = realDraft.includes(w)
                            const planned = (detail?.plannedWeeks ?? []).includes(w)
                            return (
                              <button
                                aria-pressed={on}
                                className={`wid-ren-week-chip wid-ren-week-chip--toggle${on ? ' is-on' : ''}${planned ? ' is-planned' : ''}`}
                                key={w}
                                onClick={() => toggleRealWeek(w)}
                                title={planned ? 'Planned week' : undefined}
                                type="button"
                              >
                                {formatWeekLabel(w)}
                              </button>
                            )
                          })}
                        </div>
                        <div className="wid-ren-actions">
                          <button className="profile-save-btn" disabled={realSaving} onClick={() => void saveReal()} type="button">
                            {realSaving ? 'Saving…' : 'Save'}
                          </button>
                          {realIsManual && (
                            <button className="btn btn--ghost" disabled={realSaving} onClick={() => void resetRealToAuto()} type="button">Reset to auto</button>
                          )}
                          <button className="btn btn--ghost" disabled={realSaving} onClick={() => setRealEditing(false)} type="button">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Program Induk block */}
                {parentProgram && (
                  <div className="wid-info-footer__block">
                    <p className="wid-info-footer__block-title">Parent Program</p>
                    <button className="wid-parent-card" onClick={() => navigate(`/programs/${parentProgram.id}`)} type="button">
                      <div className="wid-parent-card__head">
                        <span className="wid-parent-card__code">{parentProgram.code}</span>
                        <HealthPill status={parentProgram.healthStatus} />
                      </div>
                      <p className="wid-parent-card__name">{parentProgram.name}</p>
                      <div className="wid-parent-card__progress">
                        <div className="wid-parent-card__track">
                          <div className="wid-parent-card__fill" style={{ width: `${parentProgram.progressPercent}%` }} />
                        </div>
                        <span className="wid-parent-card__pct">{parentProgram.progressPercent}%</span>
                      </div>
                      <div className="wid-parent-card__foot">
                        <span>Open program</span>
                        {Icon.arrow}
                      </div>
                    </button>
                  </div>
                )}

                {/* Recent activity block */}
                {recentActivity.length > 0 && (
                  <div className="wid-info-footer__block wid-info-footer__block--full">
                    <p className="wid-info-footer__block-title">Recent Activity</p>
                    <div className="wid-activity">
                      {recentActivity.map(c => (
                        <div className="wid-activity__row" key={c.id}>
                          <div className="wid-activity__avatar">
                            {c.authorName ? <Avatar name={c.authorName} /> : <div className="wid-assignee-avatar-empty" />}
                          </div>
                          <div className="wid-activity__body">
                            <div className="wid-activity__top">
                              <span className="wid-activity__author">{c.authorName ?? 'Anonymous'}</span>
                              <time className="wid-activity__time">{relativeTime(c.createdAt)}</time>
                            </div>
                            <p className="wid-activity__msg">{c.commentText.length > 100 ? c.commentText.slice(0, 100) + '…' : c.commentText}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

        </aside>{/* /.wid-rail */}
      </div>

      {/* ── Help overlay (press ? to toggle) ────────────────── */}
      {showHelp && (
        <div aria-label="Keyboard shortcut guide" className="wid-help" onMouseDown={() => setShowHelp(false)} role="dialog" aria-modal="true">
          <div className="wid-help__modal" onMouseDown={e => e.stopPropagation()}>
            <div className="wid-help__head">
              <h3 className="wid-help__title">Keyboard shortcuts</h3>
              <button className="wid-help__close" onClick={() => setShowHelp(false)} type="button" aria-label="Close">
                <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="14"><path d="M1 1l12 12M13 1L1 13"/></svg>
              </button>
            </div>
            <div className="wid-help__body">
              <section className="wid-help__group">
                <h4>Navigation</h4>
                <dl>
                  <div><dt><kbd className="wid-kbd">E</kbd></dt><dd>Edit title (inline)</dd></div>
                  <div><dt><kbd className="wid-kbd">T</kbd></dt><dd>Edit title (inline)</dd></div>
                  <div><dt><kbd className="wid-kbd">/</kbd></dt><dd>Focus composer</dd></div>
                  <div><dt><kbd className="wid-kbd">?</kbd></dt><dd>Open this guide</dd></div>
                  <div><dt><kbd className="wid-kbd">ESC</kbd></dt><dd>Close modal / cancel edit</dd></div>
                </dl>
              </section>
              <section className="wid-help__group">
                <h4>Composer</h4>
                <dl>
                  <div><dt><kbd className="wid-kbd">⌘</kbd>+<kbd className="wid-kbd">↵</kbd></dt><dd>Post comment</dd></div>
                </dl>
              </section>
              <section className="wid-help__group">
                <h4>Progress slider</h4>
                <dl>
                  <div><dt><kbd className="wid-kbd">←</kbd> <kbd className="wid-kbd">→</kbd></dt><dd>±1%</dd></div>
                  <div><dt><kbd className="wid-kbd">⇧</kbd>+<kbd className="wid-kbd">←</kbd>/<kbd className="wid-kbd">→</kbd></dt><dd>±10%</dd></div>
                  <div><dt><kbd className="wid-kbd">Home</kbd> / <kbd className="wid-kbd">End</kbd></dt><dd>0% / 100%</dd></div>
                </dl>
              </section>
              <section className="wid-help__group">
                <h4>Inline edit</h4>
                <dl>
                  <div><dt>Click title / description</dt><dd>Enter edit mode</dd></div>
                  <div><dt><kbd className="wid-kbd">↵</kbd></dt><dd>Save title</dd></div>
                  <div><dt><kbd className="wid-kbd">⌘</kbd>+<kbd className="wid-kbd">↵</kbd></dt><dd>Save description</dd></div>
                </dl>
              </section>
            </div>
            <div className="wid-help__foot">
              Press <kbd className="wid-kbd">ESC</kbd> or click outside to close
            </div>
          </div>
        </div>
      )}

      {/* ── Quick-switch modal (⌘P) ──────────────────────── */}
      {showQuickSwitch && (
        <div aria-label="Quick switch to another task" className="wid-qs" onMouseDown={() => setShowQuickSwitch(false)} role="dialog" aria-modal="true">
          <div className="wid-qs__modal" onMouseDown={e => e.stopPropagation()}>
            <div className="wid-qs__head">
              <span className="wid-qs__icon" aria-hidden="true">{Icon.search}</span>
              <input
                autoFocus
                className="wid-qs__input"
                onChange={e => { setQsQuery(e.target.value); setQsIndex(0) }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setQsIndex(i => Math.min(qsResults.length - 1, i + 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setQsIndex(i => Math.max(0, i - 1)) }
                  else if (e.key === 'Enter') {
                    e.preventDefault()
                    const target = qsResults[qsIndex]
                    if (target) { setShowQuickSwitch(false); navigate(`/execution/tasks/${target.id}`) }
                  }
                }}
                placeholder="Search tasks by code or title…"
                type="text"
                value={qsQuery}
              />
              <kbd className="wid-kbd">ESC</kbd>
            </div>
            <div className="wid-qs__body">
              {qsLoading && qsResults.length === 0 && (
                <div className="wid-qs__empty">Loading…</div>
              )}
              {!qsLoading && qsResults.length === 0 && (
                <div className="wid-qs__empty">{qsQuery.trim() ? 'No results.' : 'Type to search tasks.'}</div>
              )}
              {qsResults.map((r, i) => (
                <button
                  className={`wid-qs__item${i === qsIndex ? ' is-active' : ''}${r.id === Number(id) ? ' is-current' : ''}`}
                  key={r.id}
                  onClick={() => { setShowQuickSwitch(false); navigate(`/execution/tasks/${r.id}`) }}
                  onMouseEnter={() => setQsIndex(i)}
                  type="button"
                >
                  <span className="wid-qs__item-code">{r.code}</span>
                  <span className="wid-qs__item-title">{r.title}</span>
                  {r.id === Number(id) && <span className="wid-qs__item-tag">current</span>}
                </button>
              ))}
            </div>
            <div className="wid-qs__foot">
              <span><kbd className="wid-kbd">↑</kbd><kbd className="wid-kbd">↓</kbd> navigate</span>
              <span><kbd className="wid-kbd">↵</kbd> open</span>
              <span><kbd className="wid-kbd">ESC</kbd> close</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Global toast (success | error) ───────────────── */}
      {toast && (
        <div className={`wid-toast wid-toast--${toast.tone}`} role="status" aria-live="polite">
          <span className="wid-toast__icon" aria-hidden="true">
            {toast.tone === 'error' ? Icon.alert : Icon.check}
          </span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ── Kbd hint bar (floating, dismissible) ───────── */}
      {!kbdHintDismissed && !showHelp && !showQuickSwitch && (
        <div className="wid-kbd-hint">
          <button
            aria-label="Open keyboard shortcut guide"
            className="wid-kbd-hint__btn"
            onClick={() => setShowHelp(true)}
            type="button"
          >
            <kbd className="wid-kbd">?</kbd>
            <span>Keyboard shortcuts</span>
          </button>
          <button
            aria-label="Close hint"
            className="wid-kbd-hint__close"
            onClick={dismissKbdHint}
            title="Don't show again"
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="10" viewBox="0 0 10 10" width="10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default TaskDetailView
