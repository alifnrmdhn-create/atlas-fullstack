import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { Meeting, MeetingType, AttendeeRole, RsvpStatus } from '../types'
import { MeetingDetailPanel } from './MeetingDetailPanel'
import { useEscKey } from '../hooks/useEscKey'

// ── Constants ──────────────────────────────────────────────────────────────

const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  RAPAT_DIREKSI:    'Rapat Direksi',
  RAPAT_KOORDINASI: 'Rapat Koordinasi',
  RAPAT_DIVISI:     'Rapat Divisi',
  RAPAT_TIM:        'Rapat Tim',
  ONE_ON_ONE:       '1-on-1',
}

const RSVP_LABEL: Record<RsvpStatus, string> = {
  PENDING:      'Belum respons',
  HADIR:        'Hadir',
  TIDAK_HADIR:  'Tidak Hadir',
  DELEGASI:     'Delegasi',
}

type ScheduleTone = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' | 'cyan' | 'pink' | 'orange'

const AVATAR_TONES: ScheduleTone[] = ['purple', 'blue', 'green', 'yellow', 'red', 'cyan', 'pink', 'orange']
const AVATAR_PALETTE_SIZE = AVATAR_TONES.length

const MEETING_TYPE_TONE: Record<MeetingType, ScheduleTone> = {
  RAPAT_DIREKSI: 'red',
  RAPAT_KOORDINASI: 'purple',
  RAPAT_DIVISI: 'blue',
  RAPAT_TIM: 'green',
  ONE_ON_ONE: 'yellow',
}

const RSVP_STATUS_TONE: Record<RsvpStatus, ScheduleTone> = {
  PENDING: 'gray',
  HADIR: 'green',
  TIDAK_HADIR: 'red',
  DELEGASI: 'yellow',
}

function nameToColorIndex(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % AVATAR_PALETTE_SIZE
}

// ── Calendar constants ─────────────────────────────────────────────────────
const CAL_HOUR_START   = 0   // 00:00
const CAL_HOUR_END     = 24  // 24:00
const CAL_ZOOM_LEVELS  = { compact: 40, normal: 56, spacious: 76 } as const
type CalZoom = keyof typeof CAL_ZOOM_LEVELS
const CAL_WORK_START   = 8   // 08:00 — start of working hours
const CAL_WORK_END     = 17  // 17:00 — end of working hours

/** Get Mon–Sun of the week that is `offsetWeeks` away from today. */
function getWeekDays(offsetWeeks: number): Date[] {
  const today = new Date()
  const dow = today.getDay() === 0 ? 7 : today.getDay() // Mon=1 … Sun=7
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow - 1) + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

/** Convert a datetime to pixel offset from CAL_HOUR_START, clamped. */
function calTop(date: Date, hourPx: number): number {
  const h = date.getHours() + date.getMinutes() / 60
  return Math.max(0, (h - CAL_HOUR_START) * hourPx)
}

/** Convert a duration to pixel height, minimum 18px. */
function calHeight(startAt: Date, endAt: Date, hourPx: number): number {
  const mins = Math.max(15, (endAt.getTime() - startAt.getTime()) / 60000)
  return Math.max(18, (mins / 60) * hourPx)
}

/**
 * Compute side-by-side column layout for overlapping events.
 * Returns a map: eventId → { col, totalCols }
 */
function computeOverlapLayout(
  events: Array<{ id: number; startAt: string; endAt: string }>
): Map<number, { col: number; totalCols: number }> {
  if (events.length === 0) return new Map()

  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  )

  // Build overlap groups (connected components)
  const groups: (typeof sorted)[] = []
  for (const ev of sorted) {
    const evS = new Date(ev.startAt).getTime()
    const evE = new Date(ev.endAt).getTime()
    const overlapping: number[] = []
    for (let g = 0; g < groups.length; g++) {
      if (groups[g].some(e =>
        evS < new Date(e.endAt).getTime() && evE > new Date(e.startAt).getTime()
      )) overlapping.push(g)
    }
    if (overlapping.length === 0) {
      groups.push([ev])
    } else {
      const merged = [ev, ...overlapping.flatMap(g => groups[g])]
      overlapping.sort((a, b) => b - a).forEach(g => groups.splice(g, 1))
      groups.push(merged)
    }
  }

  const result = new Map<number, { col: number; totalCols: number }>()
  for (const group of groups) {
    const byStart = [...group].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    const colEnds: number[] = []
    const assigned = new Map<number, number>()
    for (const ev of byStart) {
      const s = new Date(ev.startAt).getTime(), e = new Date(ev.endAt).getTime()
      let placed = false
      for (let c = 0; c < colEnds.length; c++) {
        if (s >= colEnds[c]) { colEnds[c] = e; assigned.set(ev.id, c); placed = true; break }
      }
      if (!placed) { assigned.set(ev.id, colEnds.length); colEnds.push(e) }
    }
    const totalCols = colEnds.length
    for (const ev of group) result.set(ev.id, { col: assigned.get(ev.id) ?? 0, totalCols })
  }
  return result
}

type FilterMode = 'upcoming' | 'completed' | 'mine' | 'person' | 'decisions'

type DecisionItem = {
  id: number
  decision: string
  createdAt: string
  meetingId: number
  meeting: { id: number; title: string; startAt: string; meetingType: string }
  decidedByUser: { id: number; name: string; roleType: string } | null
}

type PersonView = {
  id: number
  name: string
  roleType: string
  positionTitle?: string
  unit?: { code: string; name: string }
}

type UserOption = {
  id: number
  name: string
  roleType: string
  positionTitle?: string
  unit?: { id: number; code: string; name: string }
}

type ProgramOption = {
  id: number
  name: string
  code: string
}

type FocusBlock = {
  id: number
  userId: number
  title: string
  startAt: string
  endAt: string
  note?: string
  createdAt: string
}

type SuggestionItem = {
  type: 'PROGRAM_HEALTH' | 'BLOCKER_ESCALATION'
  programId: number
  programName: string
  programCode: string
  programHealth: string
  progressPercent: number
  criticalBlockerCount: number
  daysSinceLastMeeting: number | null
  suggestedType: MeetingType
  suggestedTitle: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date(iso))
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

function isTomorrow(iso: string) {
  const t = new Date(); t.setDate(t.getDate() + 1)
  return new Date(iso).toDateString() === t.toDateString()
}

function dayLabel(iso: string) {
  if (isToday(iso)) return `Hari Ini — ${formatDate(iso)}`
  if (isTomorrow(iso)) return `Besok — ${formatDate(iso)}`
  return formatDate(iso)
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

function durationLabel(startAt: string, endAt: string) {
  const mins = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000)
  if (mins < 60) return `${mins} mnt`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h} jam ${m} mnt` : `${h} jam`
}

function rsvpSymbol(status: RsvpStatus) {
  return status === 'HADIR' ? '✓' : status === 'TIDAK_HADIR' ? '✗' : status === 'DELEGASI' ? '↪' : '○'
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const tone = AVATAR_TONES[nameToColorIndex(name)]
  return (
    <div
      className="schedule-avatar"
      data-tone={tone}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
      }}
    >
      {getInitials(name)}
    </div>
  )
}

function TypeBadge({ type }: { type: MeetingType }) {
  return (
    <span className="schedule-type-badge" data-tone={MEETING_TYPE_TONE[type]}>
      {MEETING_TYPE_LABEL[type]}
    </span>
  )
}

function RsvpBadge({ status }: { status: RsvpStatus }) {
  return (
    <span className="schedule-rsvp-badge" data-tone={RSVP_STATUS_TONE[status]}>
      {rsvpSymbol(status)} {RSVP_LABEL[status]}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ScheduleView() {
  const { currentUser } = useWorkspace()

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  useEscKey(() => setSelectedMeeting(null), selectedMeeting !== null)
  // Keep last non-null meeting so panel content stays visible during the close transition
  const lastMeetingRef = useRef<Meeting | null>(null)
  if (selectedMeeting !== null) lastMeetingRef.current = selectedMeeting

  // Overlay exit animation — tracks which modal is animating out
  const [closingOverlay, setClosingOverlay] = useState<string | null>(null)
  const closeOverlay = useCallback((name: string, action: () => void) => {
    setClosingOverlay(name)
    setTimeout(() => { action(); setClosingOverlay(null) }, 150)
  }, [])

  const [filter, setFilter] = useState<FilterMode>('upcoming')
  const [searchQuery, setSearchQuery] = useState('')

  // Decisions Registry
  const [decisionsQuery, setDecisionsQuery] = useState('')
  const [decisions, setDecisions] = useState<DecisionItem[]>([])
  const [decisionsLoading, setDecisionsLoading] = useState(false)
  const [decisionsError, setDecisionsError] = useState<string | null>(null)

  // Per Orang
  const [personView, setPersonView] = useState<PersonView | null>(null)
  const [personSearch, setPersonSearch] = useState('')
  const [personOptions, setPersonOptions] = useState<PersonView[]>([])
  const [personSearchLoading, setPersonSearchLoading] = useState(false)

  // Portfolio suggestions
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(true)

  // Focus blocks
  const [focusBlocks, setFocusBlocks] = useState<FocusBlock[]>([])
  const [showFocusForm, setShowFocusForm] = useState(false)
  const focusDialogRef = useDialogFocus<HTMLDivElement>(showFocusForm || closingOverlay === 'focus')
  const focusDialogTitleId = useId()
  const focusDialogDescId = useId()
  const [focusForm, setFocusForm] = useState({ title: 'Focus Time', date: '', startTime: '', endTime: '', note: '' })
  const [focusSaving, setFocusSaving] = useState(false)
  const [focusError, setFocusError] = useState<string | null>(null)

  // Create meeting modal
  const [showCreate, setShowCreate] = useState(false)
  const createMeetingDialogRef = useDialogFocus<HTMLDivElement>(showCreate || closingOverlay === 'create')
  const createMeetingTitleId = useId()
  const createMeetingDescId = useId()

  // Detail/RSVP panel
  const [showRsvpFor, setShowRsvpFor] = useState<number | null>(null)  // meeting id
  const rsvpDialogRef = useDialogFocus<HTMLDivElement>(showRsvpFor !== null || closingOverlay === 'rsvp')
  const rsvpTitleId = useId()
  const rsvpDescId = useId()
  const [rsvpStatus, setRsvpStatus] = useState<'HADIR' | 'TIDAK_HADIR' | 'DELEGASI'>('HADIR')
  const [delegateSearch, setDelegateSearch] = useState('')
  const [delegateOptions, setDelegateOptions] = useState<UserOption[]>([])
  const [selectedDelegate, setSelectedDelegate] = useState<UserOption | null>(null)
  const [delegateNote, setDelegateNote] = useState('')
  const [rsvpSaving, setRsvpSaving] = useState(false)
  const [rsvpError, setRsvpError] = useState<string | null>(null)
  const [quickRsvpLoading, setQuickRsvpLoading] = useState<number | null>(null)
  const [quickRsvpError, setQuickRsvpError] = useState<{ id: number; msg: string } | null>(null)

  // Cancel confirmation
  const [confirmCancel, setConfirmCancel] = useState<{ id: number; title: string } | null>(null)
  const cancelMeetingDialogRef = useDialogFocus<HTMLDivElement>(confirmCancel !== null || closingOverlay === 'cancel')
  const cancelMeetingTitleId = useId()
  const cancelMeetingDescId = useId()
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSaving, setCancelSaving] = useState(false)

  // Delete focus block confirmation
  const [confirmDeleteFocus, setConfirmDeleteFocus] = useState<number | null>(null)
  const deleteFocusDialogRef = useDialogFocus<HTMLDivElement>(confirmDeleteFocus !== null || closingOverlay === 'del-focus')
  const deleteFocusTitleId = useId()
  const deleteFocusDescId = useId()
  const [deleteFocusError, setDeleteFocusError] = useState<string | null>(null)
  const [deleteFocusSaving, setDeleteFocusSaving] = useState(false)

  // Create form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    meetingType: 'RAPAT_TIM' as MeetingType,
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    linkedProgramId: '' as string | number,
  })
  const [attendeeSearch, setAttendeeSearch] = useState('')
  const [attendeeOptions, setAttendeeOptions] = useState<UserOption[]>([])
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [selectedAttendees, setSelectedAttendees] = useState<Array<{ user: UserOption; role: AttendeeRole }>>([])
  const [programs, setPrograms] = useState<ProgramOption[]>([])
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calWeekOffset, setCalWeekOffset] = useState(0)
  const [calShowWeekend, setCalShowWeekend] = useState(false)
  const [calZoom, setCalZoom] = useState<CalZoom>('normal')
  const CAL_HOUR_PX = CAL_ZOOM_LEVELS[calZoom]

  // Calendar hover slot for click-to-create
  const [calHoverSlot, setCalHoverSlot] = useState<{ dayStr: string; top: number; hour: number; minute: number } | null>(null)

  // List view pagination
  const LIST_PAGE_SIZE = 20
  const [listPage, setListPage] = useState(1)

  const calBodyRef = useRef<HTMLDivElement>(null)

  // ── Load meetings ────────────────────────────────────────────────────────

  const loadMeetings = useCallback(() => {
    if (filter === 'person' && !personView) { setMeetings([]); setLoading(false); return }
    setLoading(true)
    setError(null)

    let url: string
    if (viewMode === 'calendar') {
      // Calendar mode: fetch by week date range so navigating weeks always loads correct data
      const weekDays = getWeekDays(calWeekOffset)
      const from = weekDays[0].toISOString()
      const to   = new Date(weekDays[6].getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      if (filter === 'person' && personView) {
        url = `/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&forUserId=${personView.id}`
      } else {
        url = `/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      }
    } else if (filter === 'person' && personView) {
      url = `/meetings?filter=upcoming&forUserId=${personView.id}`
    } else {
      const params = filter === 'upcoming' ? '?filter=upcoming' : '?filter=all'
      url = `/meetings${params}`
    }

    api.get<{ data: Meeting[] }>(url)
      .then(res => {
        let data = res.data
        if (filter === 'mine') data = data.filter(m => m.organizerId === currentUser?.id)
        if (filter === 'completed') data = data.filter(m => m.status === 'COMPLETED')
        setMeetings(data)
        // Update selectedMeeting from fresh list — don't nullify if it dropped out of filter
        setSelectedMeeting(prev => {
          if (!prev) return null
          return data.find(m => m.id === prev.id) ?? prev
        })
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Gagal memuat jadwal.'))
      .finally(() => setLoading(false))
  }, [filter, currentUser?.id, personView, viewMode, calWeekOffset])

  /** Re-fetch a single meeting by id and patch it in-place — used by detail panel onUpdate
   *  so a status change (ONGOING, COMPLETED) doesn't lose the meeting from the calendar. */
  const refreshMeeting = useCallback((meetingId: number) => {
    api.get<{ data: Meeting }>(`/meetings/${meetingId}`)
      .then(res => {
        const fresh = res.data
        setMeetings(prev => prev.map(m => m.id === meetingId ? fresh : m))
        setSelectedMeeting(prev => prev?.id === meetingId ? fresh : prev)
      })
      .catch(() => {
        // Fallback: full reload
        loadMeetings()
      })
  }, [loadMeetings])

  useEffect(() => { loadMeetings() }, [loadMeetings])

  // ── Load portfolio suggestions ───────────────────────────────────────────

  useEffect(() => {
    api.get<{ data: SuggestionItem[] }>('/meetings/suggestions')
      .then(res => setSuggestions(res.data ?? []))
      .catch(() => setSuggestions([]))
  }, [])

  const loadFocusBlocks = useCallback(() => {
    setFocusBlocks([])
    const url = filter === 'person' && personView
      ? `/focus-blocks?forUserId=${personView.id}`
      : '/focus-blocks'
    api.get<{ data: FocusBlock[] }>(url)
      .then(res => setFocusBlocks(res.data ?? []))
      .catch(() => setFocusBlocks([]))
  }, [filter, personView])

  useEffect(() => { loadFocusBlocks() }, [loadFocusBlocks])

  // ── Load users for pickers ───────────────────────────────────────────────

  // ESC closes create meeting modal
  useEffect(() => {
    if (!showCreate) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !createSaving) setShowCreate(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCreate, createSaving])

  useEffect(() => {
    if (!showCreate) return
    if (allUsers.length > 0) return
    api.get<{ data: UserOption[] }>('/users/directory')
      .then(res => setAllUsers(res.data ?? []))
      .catch(() => setAllUsers([]))
  }, [showCreate, allUsers.length])

  useEffect(() => {
    if (!showCreate) return
    api.get<{ data: ProgramOption[] }>('/programs')
      .then(res => setPrograms(res.data ?? []))
      .catch(() => setPrograms([]))
  }, [showCreate])

  useEffect(() => {
    if (!attendeeSearch.trim()) { setAttendeeOptions(allUsers.slice(0, 40)); return }
    const q = attendeeSearch.toLowerCase()
    setAttendeeOptions(
      allUsers.filter(u =>
        u.name.toLowerCase().includes(q) ||
        (u.unit?.name ?? '').toLowerCase().includes(q) ||
        (u.positionTitle ?? '').toLowerCase().includes(q)
      ).slice(0, 40)
    )
  }, [attendeeSearch, allUsers])

  useEffect(() => {
    // Eligible delegates: only attendees of this meeting, excluding self, organizer, and those who already declined/delegated
    const rsvpMeeting = meetings.find(m => m.id === showRsvpFor)
    const attendeeUserIds = new Set(rsvpMeeting?.attendees.map(a => a.userId) ?? [])
    const excludedIds = new Set<number | undefined>([
      currentUser?.id,
      rsvpMeeting?.organizerId,
      ...(rsvpMeeting?.attendees
        .filter(a => a.rsvpStatus === 'TIDAK_HADIR' || a.rsvpStatus === 'DELEGASI')
        .map(a => a.userId) ?? []),
    ])
    const eligible = allUsers.filter(u => attendeeUserIds.has(u.id) && !excludedIds.has(u.id))

    if (!delegateSearch.trim() || !showRsvpFor) { setDelegateOptions(eligible.slice(0, 30)); return }
    const q = delegateSearch.toLowerCase()
    setDelegateOptions(eligible.filter(u => u.name.toLowerCase().includes(q)).slice(0, 30))
  }, [delegateSearch, allUsers, showRsvpFor, meetings, currentUser?.id])

  useEffect(() => {
    if (showRsvpFor && allUsers.length === 0) {
      api.get<{ data: UserOption[] }>('/users/directory')
        .then(res => setAllUsers(res.data ?? []))
        .catch(() => {})
    }
  }, [showRsvpFor, allUsers.length])

  // Person search
  useEffect(() => {
    if (filter !== 'person') return
    if (!personSearch.trim()) {
      if (allUsers.length > 0) {
        setPersonOptions(allUsers.filter(u => u.id !== currentUser?.id).slice(0, 30))
      } else {
        setPersonSearchLoading(true)
        api.get<{ data: UserOption[] }>('/users/directory')
          .then(res => {
            setAllUsers(res.data ?? [])
            setPersonOptions((res.data ?? []).filter(u => u.id !== currentUser?.id).slice(0, 30))
          })
          .catch(() => {})
          .finally(() => setPersonSearchLoading(false))
      }
      return
    }
    const q = personSearch.toLowerCase()
    const list = allUsers.length > 0 ? allUsers : []
    setPersonOptions(
      list.filter(u =>
        u.id !== currentUser?.id &&
        (u.name.toLowerCase().includes(q) ||
         (u.positionTitle ?? '').toLowerCase().includes(q) ||
         (u.unit?.name ?? '').toLowerCase().includes(q))
      ).slice(0, 30)
    )
  }, [personSearch, filter, allUsers, currentUser?.id])

  // ── Auto-scroll calendar to current time ────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'calendar' || !calBodyRef.current) return
    const now = new Date()
    // Scroll to current time if today is in view, else scroll to start of work day
    const targetHour = now.getHours() > CAL_WORK_START ? now.getHours() - 1 : CAL_WORK_START
    calBodyRef.current.scrollTop = Math.max(0, (targetHour - CAL_HOUR_START) * CAL_HOUR_PX)
  }, [viewMode, calWeekOffset])

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'calendar') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setCalWeekOffset(o => o - 1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setCalWeekOffset(o => o + 1) }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setCalWeekOffset(0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewMode])

  // ── Decisions Registry ───────────────────────────────────────────────────

  useEffect(() => {
    if (filter !== 'decisions') return
    let cancelled = false
    setDecisionsLoading(true)
    setDecisionsError(null)
    const qs = decisionsQuery.trim() ? `?q=${encodeURIComponent(decisionsQuery.trim())}` : ''
    api.get<{ data: DecisionItem[] }>(`/meetings/decisions${qs}`)
      .then(res => { if (!cancelled) setDecisions(res.data) })
      .catch(err => { if (!cancelled) setDecisionsError(err instanceof Error ? err.message : 'Gagal memuat keputusan.') })
      .finally(() => { if (!cancelled) setDecisionsLoading(false) })
    return () => { cancelled = true }
  }, [filter, decisionsQuery])

  // ── Toolbar stats ────────────────────────────────────────────────────────

  const now = new Date()
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0)
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999)
  const thisWeekCount = meetings.filter(m => {
    const d = new Date(m.startAt)
    return d >= weekStart && d <= weekEnd && m.status !== 'CANCELLED'
  }).length
  const pendingRsvpCount = meetings.filter(m => {
    const a = m.attendees.find(a => a.userId === currentUser?.id)
    return a && a.rsvpStatus === 'PENDING' && a.attendeeRole !== 'ORGANIZER' && m.status === 'SCHEDULED'
  }).length

  // ── Search filter ────────────────────────────────────────────────────────

  const q = searchQuery.toLowerCase().trim()
  const filteredMeetings = q
    ? meetings.filter(m => m.title.toLowerCase().includes(q) || (m.location ?? '').toLowerCase().includes(q))
    : meetings

  // ── Group meetings + focus blocks by date ────────────────────────────────

  type DayGroup = { dateKey: string; meetings: Meeting[]; blocks: FocusBlock[] }
  const grouped = [...filteredMeetings, ...focusBlocks.map(b => ({ _type: 'block' as const, ...b }))].reduce<DayGroup[]>((acc, item) => {
    const key = new Date(item.startAt).toDateString()
    let g = acc.find(d => d.dateKey === key)
    if (!g) { g = { dateKey: key, meetings: [], blocks: [] }; acc.push(g) }
    if ('_type' in item) g.blocks.push(item)
    else g.meetings.push(item as Meeting)
    return acc
  }, []).sort((a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime())

  // ── RSVP handlers ────────────────────────────────────────────────────────

  const openRsvp = (meeting: Meeting) => {
    const myAttendee = meeting.attendees.find(a => a.userId === currentUser?.id)
    if (!myAttendee || myAttendee.attendeeRole === 'ORGANIZER') return
    setShowRsvpFor(meeting.id)
    setRsvpStatus(myAttendee.rsvpStatus === 'TIDAK_HADIR' ? 'TIDAK_HADIR' : myAttendee.rsvpStatus === 'DELEGASI' ? 'DELEGASI' : 'HADIR')
    setSelectedDelegate(null)
    setDelegateSearch('')
    setDelegateNote('')
    setRsvpError(null)
  }

  const submitRsvp = async () => {
    if (!showRsvpFor) return
    if (rsvpStatus === 'DELEGASI' && !selectedDelegate) {
      setRsvpError('Pilih siapa yang mewakili Anda.')
      return
    }
    setRsvpSaving(true)
    setRsvpError(null)
    try {
      await api.post(`/meetings/${showRsvpFor}/rsvp`, {
        rsvpStatus,
        delegateToId: rsvpStatus === 'DELEGASI' ? selectedDelegate?.id : undefined,
        delegateNote: rsvpStatus === 'DELEGASI' ? delegateNote || undefined : undefined,
      })
      setShowRsvpFor(null)
      loadMeetings()
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : 'Gagal menyimpan RSVP.')
    } finally {
      setRsvpSaving(false)
    }
  }

  // ESC closes RSVP modal
  useEffect(() => {
    if (showRsvpFor === null) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rsvpSaving) setShowRsvpFor(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showRsvpFor, rsvpSaving])

  // ── Quick RSVP (no modal for HADIR / TIDAK_HADIR) ───────────────────────

  const submitQuickRsvp = async (meetingId: number, status: 'HADIR' | 'TIDAK_HADIR') => {
    if (quickRsvpLoading === meetingId) return
    setQuickRsvpLoading(meetingId)
    setQuickRsvpError(null)
    try {
      await api.post(`/meetings/${meetingId}/rsvp`, { rsvpStatus: status })
      loadMeetings()
    } catch (err) {
      setQuickRsvpError({ id: meetingId, msg: err instanceof Error ? err.message : 'Gagal menyimpan RSVP.' })
    } finally {
      setQuickRsvpLoading(null)
    }
  }

  // ── Cancel meeting ───────────────────────────────────────────────────────

  const cancelMeeting = (meetingId: number) => {
    const m = meetings.find(m => m.id === meetingId)
    if (!m) return
    setCancelError(null)
    setConfirmCancel({ id: meetingId, title: m.title })
  }

  const doCancel = async () => {
    if (!confirmCancel) return
    setCancelSaving(true)
    setCancelError(null)
    try {
      await api.delete(`/meetings/${confirmCancel.id}`)
      setConfirmCancel(null)
      loadMeetings()
      if (selectedMeeting?.id === confirmCancel.id) setSelectedMeeting(null)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Gagal membatalkan meeting.')
    } finally {
      setCancelSaving(false)
    }
  }

  // ── Create meeting ────────────────────────────────────────────────────────

  const openCreate = (prefill?: { date?: string; startTime?: string; endTime?: string }) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    setForm({ title: '', description: '', meetingType: 'RAPAT_TIM', date: prefill?.date ?? today, startTime: prefill?.startTime ?? '09:00', endTime: prefill?.endTime ?? '10:00', location: '', linkedProgramId: '' })
    setSelectedAttendees([])
    setAttendeeSearch('')
    setCreateError(null)
    setShowCreate(true)
  }

  const openCreateFromSuggestion = (s: SuggestionItem) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    setForm({
      title: s.suggestedTitle,
      description: `Terkait program ${s.programCode}: ${s.programName} (${s.programHealth})`,
      meetingType: s.suggestedType,
      date: today,
      startTime: '09:00',
      endTime: '10:00',
      location: '',
      linkedProgramId: s.programId,
    })
    setSelectedAttendees([])
    setAttendeeSearch('')
    setCreateError(null)
    setShowCreate(true)
  }

  const openFocusForm = () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    setFocusForm({ title: 'Focus Time', date: today, startTime: '09:00', endTime: '11:00', note: '' })
    setFocusError(null)
    setShowFocusForm(true)
  }

  const submitFocusBlock = async () => {
    if (!focusForm.date || !focusForm.startTime || !focusForm.endTime) {
      setFocusError('Tanggal dan waktu wajib diisi.'); return
    }
    const startAt = new Date(`${focusForm.date}T${focusForm.startTime}:00`).toISOString()
    const endAt   = new Date(`${focusForm.date}T${focusForm.endTime}:00`).toISOString()
    if (new Date(endAt) <= new Date(startAt)) { setFocusError('Waktu selesai harus setelah waktu mulai.'); return }
    setFocusSaving(true)
    setFocusError(null)
    try {
      await api.post('/focus-blocks', {
        title: focusForm.title.trim() || 'Focus Time',
        startAt, endAt,
        note: focusForm.note.trim() || undefined,
      })
      setShowFocusForm(false)
      loadFocusBlocks()
    } catch (err) {
      setFocusError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setFocusSaving(false)
    }
  }

  const deleteFocusBlock = (id: number) => {
    setConfirmDeleteFocus(id)
  }

  const doDeleteFocus = async () => {
    if (!confirmDeleteFocus) return
    setDeleteFocusSaving(true)
    setDeleteFocusError(null)
    try {
      await api.delete(`/focus-blocks/${confirmDeleteFocus}`)
      setConfirmDeleteFocus(null)
      loadFocusBlocks()
    } catch (err) {
      setDeleteFocusError(err instanceof Error ? err.message : 'Gagal menghapus blok fokus.')
    } finally {
      setDeleteFocusSaving(false)
    }
  }

  const addAttendee = (user: UserOption) => {
    if (selectedAttendees.find(a => a.user.id === user.id)) return
    if (user.id === currentUser?.id) return  // organizer already included
    setSelectedAttendees(prev => [...prev, { user, role: 'REQUIRED' }])
    setAttendeeSearch('')
    setAttendeeOptions([])
  }

  const removeAttendee = (userId: number) => {
    setSelectedAttendees(prev => prev.filter(a => a.user.id !== userId))
  }

  const toggleAttendeeRole = (userId: number) => {
    setSelectedAttendees(prev => prev.map(a =>
      a.user.id === userId ? { ...a, role: a.role === 'REQUIRED' ? 'OPTIONAL' : 'REQUIRED' } : a
    ))
  }

  const submitCreate = async () => {
    if (!form.title.trim()) { setCreateError('Judul meeting wajib diisi.'); return }
    if (!form.date || !form.startTime || !form.endTime) { setCreateError('Tanggal dan waktu wajib diisi.'); return }
    const startAt = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const endAt   = new Date(`${form.date}T${form.endTime}:00`).toISOString()
    if (new Date(endAt) <= new Date(startAt)) { setCreateError('Waktu selesai harus setelah waktu mulai.'); return }
    if (new Date(startAt) < new Date(Date.now() - 15 * 60 * 1000)) { setCreateError('Tidak dapat membuat meeting di masa lalu.'); return }

    setCreateSaving(true)
    setCreateError(null)
    try {
      await api.post('/meetings', {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        meetingType: form.meetingType,
        startAt,
        endAt,
        location: form.location.trim() || undefined,
        linkedProgramId: form.linkedProgramId ? Number(form.linkedProgramId) : undefined,
        attendees: selectedAttendees.map(a => ({ userId: a.user.id, attendeeRole: a.role })),
      })
      setForm({ title: '', description: '', meetingType: 'RAPAT_TIM', date: '', startTime: '', endTime: '', location: '', linkedProgramId: '' })
      setSelectedAttendees([])
      setShowCreate(false)
      loadMeetings()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Gagal membuat meeting.')
    } finally {
      setCreateSaving(false)
    }
  }

  // ── My RSVP for a meeting ────────────────────────────────────────────────

  const getMyRsvp = (meeting: Meeting) =>
    meeting.attendees.find(a => a.userId === currentUser?.id)

  const rsvpSummary = (meeting: Meeting) => {
    const hadir      = meeting.attendees.filter(a => a.rsvpStatus === 'HADIR').length
    const pending    = meeting.attendees.filter(a => a.rsvpStatus === 'PENDING').length
    const tidakHadir = meeting.attendees.filter(a => a.rsvpStatus === 'TIDAK_HADIR').length
    const delegasi   = meeting.attendees.filter(a => a.rsvpStatus === 'DELEGASI').length
    return { hadir, pending, tidakHadir, delegasi, total: meeting.attendees.length }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="view-schedule">

      {/* Toolbar */}
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Jadwal Meeting</h2>
        <div className="view-toolbar__sep" />

        {/* Mini stats */}
        <div className="schedule-toolbar-stats">
          {thisWeekCount > 0 && (
            <span>{thisWeekCount} <em>minggu ini</em></span>
          )}
          {pendingRsvpCount > 0 && (
            <span className="schedule-toolbar-stats__pending">
              {pendingRsvpCount} <em>perlu konfirmasi</em>
            </span>
          )}
        </div>

        <div className="view-toggle schedule-toolbar__filters">
          {(['upcoming', 'completed', 'mine', 'person', 'decisions'] as FilterMode[]).map(f => (
            <button
              key={f}
              className={`view-toggle-btn${filter === f ? ' active' : ''}`}
              onClick={() => {
                setFilter(f)
                if (f !== 'person') setPersonView(null)
                setPersonSearch('')
                setListPage(1)
              }}
            >
              {f === 'upcoming' ? 'Mendatang' : f === 'completed' ? 'Selesai' : f === 'mine' ? 'Saya Buat' : f === 'person' ? 'Per Orang' : 'Keputusan'}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="schedule-view-toggle schedule-view-toggle--toolbar">
          <button
            className={`schedule-view-toggle__btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            title="Tampilan daftar"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 4h12M2 8h12M2 12h12"/>
            </svg>
          </button>
          <button
            className={`schedule-view-toggle__btn${viewMode === 'calendar' ? ' active' : ''}`}
            onClick={() => setViewMode('calendar')}
            title="Tampilan kalender"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="12" height="11" rx="1.5"/>
              <path d="M5 1v3M11 1v3M2 7h12"/>
              <rect x="5" y="9" width="2" height="2" rx="0.3" fill="currentColor" stroke="none"/>
              <rect x="9" y="9" width="2" height="2" rx="0.3" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>

        <button className="toolbar-action-btn toolbar-action-btn--ghost schedule-toolbar-action-btn" onClick={openFocusForm}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="10" height="8" rx="1.5"/>
            <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
          </svg>
          Blok Fokus
        </button>
        <button className="toolbar-action-btn schedule-toolbar-action-btn schedule-toolbar-action-btn--primary" onClick={() => openCreate()}>
          + Buat Meeting
        </button>
      </div>

      {/* Decisions search bar */}
      {filter === 'decisions' && (
        <div className="schedule-search-bar">
          <svg className="schedule-inline-icon schedule-inline-icon--muted" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6.5" cy="6.5" r="5" /><path d="m10.5 10.5 3.5 3.5" />
          </svg>
          <input
            className="schedule-search-bar__input"
            type="text"
            placeholder="Cari keputusan rapat…"
            value={decisionsQuery}
            onChange={e => setDecisionsQuery(e.target.value)}
          />
          {decisionsQuery && (
            <button className="schedule-search-bar__clear" onClick={() => setDecisionsQuery('')}>
              <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
            </button>
          )}
        </div>
      )}

      {/* Search bar — list mode only */}
      {viewMode === 'list' && filter !== 'decisions' && <div className="schedule-search-bar">
        <svg className="schedule-inline-icon schedule-inline-icon--muted" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6.5" cy="6.5" r="5" /><path d="m10.5 10.5 3.5 3.5" />
        </svg>
        <input
          className="schedule-search-bar__input"
          type="text"
          placeholder="Cari meeting atau lokasi…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="schedule-search-bar__clear" onClick={() => setSearchQuery('')}>
            <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
          </button>
        )}
      </div>}

      {/* Per Orang — person picker */}
      {filter === 'person' && (
        <div className="person-view-bar">
          {personView ? (
            /* Selected person header */
            <div className="person-view-header">
              <div className="person-view-header__avatar">
                {personView.name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
              </div>
              <div className="person-view-header__info">
                <span className="person-view-header__name">{personView.name}</span>
                <span className="person-view-header__meta">
                  {personView.positionTitle ?? personView.roleType}
                  {personView.unit ? ` · ${personView.unit.name}` : ''}
                </span>
              </div>
              <button
                className="person-view-header__change"
                onClick={() => { setPersonView(null); setPersonSearch('') }}
              >
                Ganti
              </button>
            </div>
          ) : (
            /* Person search */
            <div className="person-view-search">
              <div className="person-view-search__label">Lihat jadwal siapa?</div>
              <div className="person-view-search__input-wrap">
                <svg className="schedule-inline-icon schedule-inline-icon--muted" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6.5" cy="6.5" r="5" /><path d="m10.5 10.5 3.5 3.5" />
                </svg>
                <input
                  className="person-view-search__input"
                  type="text"
                  placeholder="Cari nama, jabatan, atau unit…"
                  value={personSearch}
                  onChange={e => setPersonSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {personSearchLoading && (
                <p className="text-xs text-muted schedule-loading-note">Memuat…</p>
              )}
              {!personSearchLoading && personOptions.length > 0 && (
                <div className="person-view-list">
                  {personOptions.map(u => (
                    <button
                      key={u.id}
                      className="person-view-item"
                      onClick={() => {
                        setPersonView(u)
                        setPersonSearch('')
                      }}
                    >
                      <div className="person-view-item__avatar">
                        {u.name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
                      </div>
                      <div className="person-view-item__info">
                        <span className="person-view-item__name">{u.name}</span>
                        <span className="person-view-item__meta">
                          {u.positionTitle ?? u.roleType}{u.unit ? ` · ${u.unit.code}` : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Portfolio suggestions banner */}
      {suggestions.length > 0 && showSuggestions && (
        <div className="suggestions-banner">
          <div className="suggestions-banner__header">
            <div className="suggestions-banner__title">
              <span className="suggestions-banner__icon">⚡</span>
              <span>Rekomendasi Meeting</span>
              <span className="suggestions-banner__count">{suggestions.length} program perlu perhatian</span>
            </div>
            <button
              className="suggestions-banner__dismiss"
              onClick={() => setShowSuggestions(false)}
              title="Sembunyikan"
            >
              <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
            </button>
          </div>
          <div className="suggestions-banner__list">
            {suggestions.map(s => (
              <div key={s.programId} className="suggestion-card">
                <div className="suggestion-card__health" data-health={s.programHealth} />
                <div className="suggestion-card__body">
                  <span className="suggestion-card__code">{s.programCode}</span>
                  <span className="suggestion-card__name">{s.programName}</span>
                  <div className="suggestion-card__meta">
                    <span className={`suggestion-card__badge suggestion-card__badge--${s.programHealth.toLowerCase()}`}>
                      {s.programHealth}
                    </span>
                    {s.criticalBlockerCount > 0 && (
                      <span className="suggestion-card__blocker">
                        {s.criticalBlockerCount} blocker kritis
                      </span>
                    )}
                    {s.daysSinceLastMeeting !== null ? (
                      <span className="suggestion-card__days">
                        Meeting terakhir {s.daysSinceLastMeeting} hari lalu
                      </span>
                    ) : (
                      <span className="suggestion-card__days">Belum ada meeting</span>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn--xs btn--primary"
                  onClick={() => openCreateFromSuggestion(s)}
                >
                  Jadwalkan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Decisions Registry ─────────────────────────────────────────── */}
      {filter === 'decisions' && (
        <div className="schedule-content">
          {decisionsLoading && (
            <div className="schedule-empty">
              <span className="text-muted text-sm">Memuat registry keputusan…</span>
            </div>
          )}
          {decisionsError && (
            <div className="schedule-empty">
              <span className="text-sm schedule-feedback schedule-feedback--danger">{decisionsError}</span>
            </div>
          )}
          {!decisionsLoading && !decisionsError && decisions.length === 0 && (
            <div className="schedule-empty">
              <div className="schedule-empty__icon">📋</div>
              <p className="schedule-empty__title">Belum ada keputusan</p>
              <p className="schedule-empty__sub">
                {decisionsQuery
                  ? `Tidak ada keputusan yang cocok dengan "${decisionsQuery}".`
                  : 'Keputusan yang dicatat dalam meeting akan muncul di sini sebagai institutional memory.'}
              </p>
            </div>
          )}
          {!decisionsLoading && !decisionsError && decisions.length > 0 && (
            <div className="decisions-registry">
              <div className="decisions-registry__header">
                <span className="decisions-registry__count">{decisions.length} keputusan{decisionsQuery ? ` untuk "${decisionsQuery}"` : ''}</span>
              </div>
              {decisions.map(d => (
                <button
                  key={d.id}
                  type="button"
                  className="decisions-registry__item"
                  onClick={() => {
                    api.get<{ data: Meeting }>(`/meetings/${d.meetingId}`).then(res => setSelectedMeeting(res.data)).catch(() => {})
                  }}
                >
                  <div className="decisions-registry__icon">⚖</div>
                  <div className="decisions-registry__body">
                    <p className="decisions-registry__text">{d.decision}</p>
                    <div className="decisions-registry__meta">
                      <span className="decisions-registry__meeting">{d.meeting.title}</span>
                      <span className="decisions-registry__sep">·</span>
                      <span className="decisions-registry__date">
                        {new Date(d.meeting.startAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {d.decidedByUser && (
                        <>
                          <span className="decisions-registry__sep">·</span>
                          <span className="decisions-registry__by">{d.decidedByUser.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <svg className="decisions-registry__arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content + Detail panel */}
      {filter !== 'decisions' && (
      <div className={`schedule-layout${selectedMeeting ? ' schedule-layout--split' : ''}${viewMode === 'calendar' ? ' schedule-layout--calendar' : ''}`}>
      <div className="schedule-content">
        {loading && (
          <div className="schedule-empty">
            <span className="text-muted text-sm">Memuat jadwal…</span>
          </div>
        )}

        {error && (
          <div className="schedule-empty">
            <span className="text-sm schedule-feedback schedule-feedback--danger">{error}</span>
          </div>
        )}

        {filter === 'person' && !personView && (
          <div className="schedule-empty">
            <div className="schedule-empty__icon">👤</div>
            <p className="schedule-empty__title">Pilih seseorang</p>
            <p className="schedule-empty__sub">Cari nama untuk melihat jadwal mereka.</p>
          </div>
        )}

        {!loading && !error && viewMode === 'list' && grouped.length === 0 && (filter !== 'person' || personView) && (
          <div className="schedule-empty">
            <div className="schedule-empty__icon">📅</div>
            <p className="schedule-empty__title">Tidak ada meeting</p>
            <p className="schedule-empty__sub">
              {filter === 'person'
                ? `${personView?.name} tidak ada jadwal mendatang.`
                : filter === 'upcoming'
                  ? 'Tidak ada meeting yang dijadwalkan dalam waktu dekat.'
                  : 'Belum ada meeting yang tercatat.'}
            </p>
            {filter !== 'person' && (
              <button className="btn btn--primary schedule-empty__action" onClick={() => openCreate()}>
                + Buat Meeting Baru
              </button>
            )}
          </div>
        )}

        {/* ── Calendar view ── */}
        {!loading && !error && viewMode === 'calendar' && (filter !== 'person' || personView) && (() => {
          const allWeekDays = getWeekDays(calWeekOffset)
          const displayDays = calShowWeekend ? allWeekDays : allWeekDays.slice(0, 5)
          const numDays = displayDays.length

          // Week label: always show date range
          const weekLabel = (() => {
            const s = displayDays[0], e = displayDays[displayDays.length - 1]
            const sm = s.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
            const em = e.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
            return `${sm} – ${em}`
          })()
          const totalH = (CAL_HOUR_END - CAL_HOUR_START) * CAL_HOUR_PX
          const gridCols = `52px repeat(${numDays}, 1fr)`

          // Build event map: dateKey → events (meetings + blocks)
          const eventsByDay = new Map<string, { meetings: Meeting[]; blocks: FocusBlock[] }>()
          displayDays.forEach(d => eventsByDay.set(d.toDateString(), { meetings: [], blocks: [] }))
          meetings.forEach(m => {
            const k = new Date(m.startAt).toDateString()
            if (eventsByDay.has(k)) eventsByDay.get(k)!.meetings.push(m)
          })
          focusBlocks.forEach(b => {
            const k = new Date(b.startAt).toDateString()
            if (eventsByDay.has(k)) eventsByDay.get(k)!.blocks.push(b)
          })

          const todayStr = new Date().toDateString()
          const dayNames   = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
          const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

          return (
            <div className="schedule-cal">
              {/* Week navigation */}
              <div className="schedule-cal-nav">
                <button className="schedule-cal-nav__btn" onClick={() => setCalWeekOffset(o => o - 1)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m10 3-5 5 5 5"/></svg>
                </button>

                <span className="schedule-cal-nav__label">{weekLabel}</span>

                {calWeekOffset !== 0 && (
                  <button className="schedule-cal-nav__today-btn" onClick={() => setCalWeekOffset(0)}>
                    Hari Ini
                  </button>
                )}

                <span className="schedule-cal-nav__kbd-hint">
                  <kbd>←</kbd><kbd>→</kbd> navigasi · <kbd>T</kbd> hari ini
                </span>

                <button className="schedule-cal-nav__btn" onClick={() => setCalWeekOffset(o => o + 1)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 5 5-5 5"/></svg>
                </button>

                {/* 5-day / 7-day toggle */}
                <div className="schedule-cal-nav__day-toggle">
                  <button
                    className={`schedule-cal-nav__day-btn${!calShowWeekend ? ' active' : ''}`}
                    onClick={() => setCalShowWeekend(false)}
                  >5 hari</button>
                  <button
                    className={`schedule-cal-nav__day-btn${calShowWeekend ? ' active' : ''}`}
                    onClick={() => setCalShowWeekend(true)}
                  >7 hari</button>
                </div>

                {/* Zoom toggle */}
                <div className="schedule-cal-nav__zoom-toggle" title="Kepadatan baris jam">
                  <button
                    className={`schedule-cal-nav__zoom-btn${calZoom === 'compact' ? ' active' : ''}`}
                    onClick={() => setCalZoom('compact')}
                    title="Compact"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2 4h12M2 8h12M2 12h12"/>
                    </svg>
                  </button>
                  <button
                    className={`schedule-cal-nav__zoom-btn${calZoom === 'normal' ? ' active' : ''}`}
                    onClick={() => setCalZoom('normal')}
                    title="Normal"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2 3h12M2 8h12M2 13h12"/>
                    </svg>
                  </button>
                  <button
                    className={`schedule-cal-nav__zoom-btn${calZoom === 'spacious' ? ' active' : ''}`}
                    onClick={() => setCalZoom('spacious')}
                    title="Spacious"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2 2h12M2 9h12M2 16h12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Day headers */}
              <div className="schedule-cal-head" style={{ gridTemplateColumns: gridCols }}>
                <div className="schedule-cal-head__gutter" />
                {displayDays.map(d => {
                  const isToday = d.toDateString() === todayStr
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const dk = d.toDateString()
                  const dayEvs = eventsByDay.get(dk) ?? { meetings: [], blocks: [] }
                  const evCount = dayEvs.meetings.length + dayEvs.blocks.length
                  return (
                    <div key={dk} className={`schedule-cal-head__day${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}`}>
                      <span className="schedule-cal-head__dow">{dayNames[d.getDay()]}</span>
                      <span className={`schedule-cal-head__date${isToday ? ' today' : ''}`}>{d.getDate()}</span>
                      <span className="schedule-cal-head__month">{monthNames[d.getMonth()]}</span>
                      {evCount > 0 && (
                        <span className={`schedule-cal-head__badge${isToday ? ' today' : ''}`}>{evCount}</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Grid body */}
              <div className="schedule-cal-body" ref={calBodyRef} style={{ gridTemplateColumns: gridCols }}>
                {/* Time gutter — labels every 2 hours, work hours bolder */}
                <div className="schedule-cal-gutter" style={{ height: totalH }}>
                  {Array.from({ length: CAL_HOUR_END - CAL_HOUR_START }, (_, i) => {
                    const hour = CAL_HOUR_START + i
                    const isWork = hour >= CAL_WORK_START && hour < CAL_WORK_END
                    const show = hour % 2 === 0
                    return (
                      <div key={i} className={`schedule-cal-gutter__hour${isWork ? ' work' : ''}${!show ? ' minor' : ''}`} style={{ top: i * CAL_HOUR_PX }}>
                        {show ? `${String(hour).padStart(2, '0')}:00` : ''}
                      </div>
                    )
                  })}
                </div>

                {/* Day columns */}
                {displayDays.map(d => {
                  const dk = d.toDateString()
                  const isToday = dk === todayStr
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const dayEvs = eventsByDay.get(dk) ?? { meetings: [], blocks: [] }

                  // Compute overlap layout for all events in this day
                  const allEvs = [
                    ...dayEvs.meetings.map(m => ({ id: m.id, startAt: m.startAt, endAt: m.endAt })),
                    ...dayEvs.blocks.map(b => ({ id: -b.id, startAt: b.startAt, endAt: b.endAt })),
                  ]
                  const layout = computeOverlapLayout(allEvs)

                  const handleDayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
                    if (isWeekend) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const relY = e.clientY - rect.top + e.currentTarget.scrollTop
                    const rawHour = CAL_HOUR_START + relY / CAL_HOUR_PX
                    const hour = Math.floor(rawHour)
                    const minute = rawHour % 1 >= 0.5 ? 30 : 0
                    const snappedTop = (hour - CAL_HOUR_START + minute / 60) * CAL_HOUR_PX
                    setCalHoverSlot({ dayStr: dk, top: snappedTop, hour, minute })
                  }

                  return (
                    <div
                      key={dk}
                      className={`schedule-cal-day${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}`}
                      style={{ height: totalH }}
                      aria-label={d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                      onMouseMove={handleDayMouseMove}
                      onMouseLeave={() => setCalHoverSlot(null)}
                      onClick={e => {
                        // Only create if clicking on background (not an event)
                        if ((e.target as HTMLElement).closest('.schedule-cal-event')) return
                        if (isWeekend || !calHoverSlot || calHoverSlot.dayStr !== dk) return
                        const dateObj = d
                        const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`
                        const h = String(calHoverSlot.hour).padStart(2, '0')
                        const m = String(calHoverSlot.minute).padStart(2, '0')
                        const endH = calHoverSlot.minute === 30 ? String(calHoverSlot.hour + 1).padStart(2, '0') : h
                        const endM = calHoverSlot.minute === 30 ? '00' : '30'
                        openCreate({ date: dateStr, startTime: `${h}:${m}`, endTime: `${endH}:${endM}` })
                      }}
                    >
                      {/* Work-hours band */}
                      <div className="schedule-cal-day__work-band" style={{
                        top: (CAL_WORK_START - CAL_HOUR_START) * CAL_HOUR_PX,
                        height: (CAL_WORK_END - CAL_WORK_START) * CAL_HOUR_PX,
                      }} />

                      {/* Hour + half-hour lines */}
                      {Array.from({ length: CAL_HOUR_END - CAL_HOUR_START }, (_, i) => {
                        const hour = CAL_HOUR_START + i
                        const isWork = hour >= CAL_WORK_START && hour < CAL_WORK_END
                        return (
                          <div key={i} className={`schedule-cal-day__hour-line${isWork ? ' work' : ''}`} style={{ top: i * CAL_HOUR_PX }} />
                        )
                      })}
                      {Array.from({ length: CAL_HOUR_END - CAL_HOUR_START }, (_, i) => (
                        <div key={`h${i}`} className="schedule-cal-day__half-line" style={{ top: i * CAL_HOUR_PX + CAL_HOUR_PX / 2 }} />
                      ))}

                      {/* Focus blocks */}
                      {dayEvs.blocks.map(b => {
                        const s = new Date(b.startAt), e = new Date(b.endAt)
                        const top = calTop(s, CAL_HOUR_PX), height = calHeight(s, e, CAL_HOUR_PX)
                        const { col, totalCols } = layout.get(-b.id) ?? { col: 0, totalCols: 1 }
                        const usable = 96, colW = (usable - (totalCols - 1)) / totalCols
                        const leftPct = 2 + col * (colW + 1)
                        const rightPct = 2 + (totalCols - col - 1) * (colW + 1)
                        return (
                          <div
                            key={`fb-${b.id}`}
                            className="schedule-cal-event schedule-cal-event--focus"
                            style={{ top, height, left: `${leftPct}%`, right: `${rightPct}%` }}
                          >
                            <span className="schedule-cal-event__time">{formatTime(b.startAt)}</span>
                            <span className="schedule-cal-event__title">🔒 {b.title}</span>
                          </div>
                        )
                      })}

                      {/* Meetings */}
                      {dayEvs.meetings.map(m => {
                        const s = new Date(m.startAt), e = new Date(m.endAt)
                        const top = calTop(s, CAL_HOUR_PX), height = calHeight(s, e, CAL_HOUR_PX)
                        const isSelected = selectedMeeting?.id === m.id
                        const isOngoing = m.status === 'ONGOING'
                        const isPostponedEv = m.status === 'POSTPONED'
                        const tone = MEETING_TYPE_TONE[m.meetingType] ?? 'green'
                        const { col: colIdx, totalCols } = layout.get(m.id) ?? { col: 0, totalCols: 1 }
                        const usable = 96, colW = (usable - (totalCols - 1)) / totalCols
                        const leftPct  = 2 + colIdx * (colW + 1)
                        const rightPct = 2 + (totalCols - colIdx - 1) * (colW + 1)
                        // Inline density based on available height
                        const showTime     = height >= 28
                        const showLocation = height >= 80 && !!m.location
                        const showAttendees = height >= 80
                        return (
                          <div
                            key={m.id}
                            className={`schedule-cal-event schedule-cal-event--${tone}${isSelected ? ' selected' : ''}${isOngoing ? ' ongoing' : ''}${isPostponedEv ? ' postponed' : ''}`}
                            style={{ top, height, left: `${leftPct}%`, right: `${rightPct}%` }}
                            onClick={() => setSelectedMeeting(prev => prev?.id === m.id ? null : m)}
                          >
                            {showTime && (
                              <span className="schedule-cal-event__time">{formatTime(m.startAt)}–{formatTime(m.endAt)}</span>
                            )}
                            <span className="schedule-cal-event__title">{m.title}</span>
                            {showLocation && (
                              <span className="schedule-cal-event__loc">
                                <svg className="schedule-inline-icon" width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 4-4.5 8.5-4.5 8.5S3.5 10 3.5 6A4.5 4.5 0 0 1 8 1.5z"/><circle cx="8" cy="6" r="1.5"/>
                                </svg>
                                {m.location}
                              </span>
                            )}
                            {showAttendees && (
                              <span className="schedule-cal-event__attendees">
                                {m.attendees.length} peserta
                              </span>
                            )}
                            {isOngoing && <span className="schedule-cal-event__dot" />}
                          </div>
                        )
                      })}

                      {/* Ghost hover slot — click to create */}
                      {!isWeekend && calHoverSlot?.dayStr === dk && (
                        <div
                          className="schedule-cal-day__ghost-slot"
                          style={{ top: calHoverSlot.top, height: CAL_HOUR_PX / 2 }}
                        >
                          <span className="schedule-cal-day__ghost-label">
                            {String(calHoverSlot.hour).padStart(2,'0')}:{String(calHoverSlot.minute).padStart(2,'0')}
                          </span>
                        </div>
                      )}

                      {/* Now line — dot in today column, line extends via CSS */}
                      {isToday && (() => {
                        const nowTop = calTop(new Date(), CAL_HOUR_PX)
                        if (nowTop < 0 || nowTop >= totalH) return null
                        return (
                          <div className="schedule-cal-day__now-line" style={{ top: nowTop }}>
                            <div className="schedule-cal-day__now-dot" />
                          </div>
                        )
                      })()}
                      {/* Extend now-line across non-today columns via pseudo */}
                      {!isToday && (() => {
                        const nowTop = calTop(new Date(), CAL_HOUR_PX)
                        if (nowTop < 0 || nowTop >= totalH) return null
                        return <div className="schedule-cal-day__now-ext" style={{ top: nowTop }} />
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── List view ── */}
        {!loading && !error && viewMode === 'list' && (() => {
          const pagedGroups = grouped.slice(0, listPage * LIST_PAGE_SIZE)
          const hasMore = grouped.length > pagedGroups.length

          return (
            <>
              {pagedGroups.map(group => {
                const todayGroup = isToday(group.dateKey)
                const dateRef = group.meetings[0]?.startAt ?? group.blocks[0]?.startAt ?? group.dateKey

                return (
                  <div key={group.dateKey} className={`schedule-date-group${todayGroup ? ' schedule-date-group--today' : ''}`}>
                    <div className="schedule-date-header">
                      <span>{dayLabel(dateRef)}</span>
                      <span className="schedule-date-count">
                        {group.meetings.length} meeting{group.blocks.length > 0 ? ` · ${group.blocks.length} fokus` : ''}
                      </span>
                    </div>

                    <div className="schedule-cards">
                      {group.meetings.map(meeting => {
                        const myRsvp = getMyRsvp(meeting)
                        const summary = rsvpSummary(meeting)
                        const isOrganizer = meeting.organizerId === currentUser?.id
                        const isCancelled = meeting.status === 'CANCELLED'
                        const isPostponed = meeting.status === 'POSTPONED'
                        const canRsvp = !!myRsvp && myRsvp.attendeeRole !== 'ORGANIZER' && !isCancelled && !isPostponed
                        const isPersonView = filter === 'person'

                        const isOngoing = meeting.status === 'ONGOING'
                        const showQuickRsvp = canRsvp && myRsvp?.rsvpStatus === 'PENDING' && !isOngoing && !isCancelled && !isPostponed

                        return (
                          <div
                            key={meeting.id}
                            className={`schedule-card${isCancelled ? ' schedule-card--cancelled' : ''}${isOngoing ? ' schedule-card--ongoing' : ''}${isPostponed ? ' schedule-card--postponed' : ''}`}
                            onClick={() => setSelectedMeeting(m => m?.id === meeting.id ? null : meeting)}
                          >
                            {/* Top row */}
                            <div className="schedule-card__top">
                              <div className="schedule-card__meta">
                                <TypeBadge type={meeting.meetingType} />
                                {isOngoing && (
                                  <span className="schedule-card__ongoing-badge">
                                    <span className="schedule-card__ongoing-dot" />
                                    Berlangsung
                                  </span>
                                )}
                                {isCancelled && (
                                  <span className="schedule-tone-pill" data-tone="gray">
                                    Dibatalkan
                                  </span>
                                )}
                                {isPostponed && (
                                  <span className="schedule-tone-pill" data-tone="yellow">
                                    ⏸ Ditunda
                                  </span>
                                )}
                                <span className="schedule-card__time">
                                  {formatTime(meeting.startAt)} – {formatTime(meeting.endAt)}
                                </span>
                                <span className="schedule-card__duration text-muted">
                                  ({durationLabel(meeting.startAt, meeting.endAt)})
                                </span>
                              </div>

                              {isOrganizer && !isCancelled && !isPersonView && (
                                <button
                                  className="btn btn--xs btn--ghost schedule-card__action"
                                  onClick={e => {
                                    e.stopPropagation()
                                    cancelMeeting(meeting.id)
                                  }}
                                >
                                  Batalkan
                                </button>
                              )}
                            </div>

                            {/* Title */}
                            <h3 className="schedule-card__title">
                              {meeting.title}
                            </h3>

                            {/* Location */}
                            {meeting.location && (
                              <div className="schedule-card__location">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 4-4.5 8.5-4.5 8.5S3.5 10 3.5 6A4.5 4.5 0 0 1 8 1.5z" />
                                  <circle cx="8" cy="6" r="1.5" />
                                </svg>
                                {meeting.location}
                              </div>
                            )}

                            {/* Attendees summary */}
                            <div className="schedule-card__footer">
                              <div className="schedule-card__attendees">
                                <div className="schedule-card__avatars">
                                  {meeting.attendees.slice(0, 5).map(a => (
                                    <div
                                      key={a.id}
                                      className="schedule-card__avatar-wrap"
                                      title={a.user?.name ?? `User ${a.userId}`}
                                    >
                                      <Avatar name={a.user?.name ?? '?'} size={22} />
                                    </div>
                                  ))}
                                  {meeting.attendees.length > 5 && (
                                    <span className="schedule-card__avatar-more">+{meeting.attendees.length - 5}</span>
                                  )}
                                </div>
                                <div className="schedule-card__rsvp-summary">
                                  <span className="schedule-rsvp-count" data-tone="green">✓ {summary.hadir}</span>
                                  {summary.tidakHadir > 0 && <span className="schedule-rsvp-count" data-tone="red">✗ {summary.tidakHadir}</span>}
                                  {summary.delegasi > 0 && <span className="schedule-rsvp-count" data-tone="yellow">↪ {summary.delegasi}</span>}
                                  {summary.pending > 0 && <span className="schedule-rsvp-count" data-tone="gray">○ {summary.pending}</span>}
                                </div>
                              </div>

                              <div className="schedule-card__my-rsvp">
                                {isPersonView ? null : isOrganizer ? (
                                  <span className="schedule-organizer-badge">Organizer</span>
                                ) : myRsvp ? (
                                  showQuickRsvp ? (
                                    <div>
                                      <div className="schedule-rsvp-quick">
                                        <button
                                          className="schedule-rsvp-quick__btn schedule-rsvp-quick__btn--hadir"
                                          onClick={e => {
                                            e.stopPropagation()
                                            void submitQuickRsvp(meeting.id, 'HADIR')
                                          }}
                                          disabled={quickRsvpLoading === meeting.id || showRsvpFor !== null}
                                          title="Konfirmasi hadir"
                                        >
                                          {quickRsvpLoading === meeting.id ? '…' : '✓ Hadir'}
                                        </button>
                                        <button
                                          className="schedule-rsvp-quick__btn schedule-rsvp-quick__btn--tidak"
                                          onClick={e => {
                                            e.stopPropagation()
                                            void submitQuickRsvp(meeting.id, 'TIDAK_HADIR')
                                          }}
                                          disabled={quickRsvpLoading === meeting.id || showRsvpFor !== null}
                                          title="Tidak hadir"
                                        >
                                          {quickRsvpLoading === meeting.id ? '…' : '✗ Tidak'}
                                        </button>
                                        <button
                                          className="schedule-rsvp-quick__btn schedule-rsvp-quick__btn--delegasi"
                                          onClick={e => {
                                            e.stopPropagation()
                                            openRsvp(meeting)
                                          }}
                                          title="Delegasikan ke orang lain (buka dialog)"
                                        >
                                          ↪ Delegasi…
                                        </button>
                                      </div>
                                      {quickRsvpError?.id === meeting.id && (
                                        <p className="schedule-feedback schedule-feedback--danger schedule-feedback--compact">{quickRsvpError.msg}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="schedule-card__response">
                                      <RsvpBadge status={myRsvp.rsvpStatus} />
                                      {canRsvp && (
                                        <button
                                          className="btn btn--xs btn--ghost schedule-card__action"
                                          onClick={e => {
                                            e.stopPropagation()
                                            openRsvp(meeting)
                                          }}
                                        >
                                          Ubah
                                        </button>
                                      )}
                                    </div>
                                  )
                                ) : null}
                              </div>
                            </div>

                            {/* Organizer info */}
                            {meeting.organizer && (
                              <div className="schedule-card__organizer">
                                <span className="schedule-card__organizer-label">
                                  Dibuat oleh {meeting.organizer.name}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Focus blocks for this day */}
                      {group.blocks.map(block => (
                        <div key={`fb-${block.id}`} className="schedule-card schedule-card--focus">
                          <div className="schedule-card__top">
                            <div className="schedule-card__meta">
                              <span className="schedule-tone-pill" data-tone="purple">
                                🔒 Fokus
                              </span>
                              <span className="schedule-card__time">
                                {formatTime(block.startAt)} – {formatTime(block.endAt)}
                              </span>
                              <span className="schedule-card__duration text-muted">
                                ({durationLabel(block.startAt, block.endAt)})
                              </span>
                            </div>
                            {block.userId === currentUser?.id && (
                              <button
                                className="btn btn--xs btn--ghost schedule-card__action"
                                onClick={() => void deleteFocusBlock(block.id)}
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                          <h3 className="schedule-card__title schedule-card__title--focus">{block.title}</h3>
                          {block.note && (
                            <p className="schedule-card__note">{block.note}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {hasMore && (
                <div className="schedule-load-more">
                  <button
                    className="btn btn--ghost schedule-load-more__btn"
                    onClick={() => setListPage(p => p + 1)}
                  >
                    Muat lebih banyak ({grouped.length - pagedGroups.length} lagi)
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Detail panel — always in DOM, width transition drives open/close */}
      <div className={`schedule-detail-panel${selectedMeeting ? ' schedule-detail-panel--open' : ''}`}>
        {lastMeetingRef.current && (
          <MeetingDetailPanel
            meeting={lastMeetingRef.current}
            onClose={() => setSelectedMeeting(null)}
            onUpdate={() => refreshMeeting(lastMeetingRef.current!.id)}
          />
        )}
      </div>
      </div>
      )}


      {/* ── Cancel Meeting Confirmation ── */}
      {(confirmCancel || closingOverlay === 'cancel') && (
        <div className={`modal-backdrop${closingOverlay === 'cancel' ? ' modal-backdrop--closing' : ''}`} onClick={() => !cancelSaving && closeOverlay('cancel', () => setConfirmCancel(null))}>
          <div aria-describedby={cancelMeetingDescId} aria-labelledby={cancelMeetingTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--sm" ref={cancelMeetingDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Schedule</span>
                <h3 className="modal__title" id={cancelMeetingTitleId}>Batalkan Meeting</h3>
                <p className="modal-subtitle" id={cancelMeetingDescId}>Pembatalan akan menutup akses RSVP dan notulens untuk seluruh peserta.</p>
              </div>
              <button className="modal__close" onClick={() => closeOverlay('cancel', () => setConfirmCancel(null))} disabled={cancelSaving}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body schedule-modal__body schedule-modal__body--compact">
              <p className="text-sm schedule-modal__text modal-helper-note modal-helper-note--danger">
                Yakin ingin membatalkan meeting <strong>"{confirmCancel?.title}"</strong>?
                Seluruh peserta tidak akan bisa RSVP atau melihat notulens setelah meeting dibatalkan.
              </p>
              {cancelError && (
                <p className="text-sm schedule-feedback schedule-feedback--danger">{cancelError}</p>
              )}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => closeOverlay('cancel', () => setConfirmCancel(null))} disabled={cancelSaving}>Kembali</button>
              <button
                className="btn btn--danger"
                onClick={doCancel}
                disabled={cancelSaving}
              >
                {cancelSaving ? 'Membatalkan…' : 'Ya, Batalkan Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Focus Block Confirmation ── */}
      {(confirmDeleteFocus !== null || closingOverlay === 'del-focus') && (
        <div className={`modal-backdrop${closingOverlay === 'del-focus' ? ' modal-backdrop--closing' : ''}`} onClick={() => { if (!deleteFocusSaving) closeOverlay('del-focus', () => { setConfirmDeleteFocus(null); setDeleteFocusError(null) }) }}>
          <div aria-describedby={deleteFocusDescId} aria-labelledby={deleteFocusTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--xs" ref={deleteFocusDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Schedule</span>
                <h3 className="modal__title" id={deleteFocusTitleId}>Hapus Blok Fokus</h3>
                <p className="modal-subtitle" id={deleteFocusDescId}>Sinyal ketersediaan ini akan dihapus dari kalender fokus Anda.</p>
              </div>
              <button className="modal__close" onClick={() => closeOverlay('del-focus', () => { setConfirmDeleteFocus(null); setDeleteFocusError(null) })} disabled={deleteFocusSaving}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body schedule-modal__body">
              <p className="text-sm schedule-modal__text modal-helper-note modal-helper-note--danger">Yakin ingin menghapus blok fokus ini?</p>
              {deleteFocusError && (
                <p className="text-sm schedule-feedback schedule-feedback--danger schedule-feedback--spaced">{deleteFocusError}</p>
              )}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => closeOverlay('del-focus', () => { setConfirmDeleteFocus(null); setDeleteFocusError(null) })} disabled={deleteFocusSaving}>Batal</button>
              <button className="btn btn--danger" onClick={() => void doDeleteFocus()} disabled={deleteFocusSaving}>
                {deleteFocusSaving ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RSVP Modal ── */}
      {(showRsvpFor !== null || closingOverlay === 'rsvp') && (
        <div className={`modal-backdrop${closingOverlay === 'rsvp' ? ' modal-backdrop--closing' : ''}`} onClick={() => closeOverlay('rsvp', () => setShowRsvpFor(null))}>
          <div aria-describedby={rsvpDescId} aria-labelledby={rsvpTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--md" ref={rsvpDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Schedule</span>
                <h3 className="modal__title" id={rsvpTitleId}>Konfirmasi Kehadiran</h3>
                <p className="modal-subtitle" id={rsvpDescId}>Pilih status kehadiran Anda atau delegasikan ke rekan yang paling tepat.</p>
              </div>
              <button className="modal__close" onClick={() => closeOverlay('rsvp', () => setShowRsvpFor(null))}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>

            <div className="modal__body">
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Status Kehadiran</h4>
                  <p>Pilih respon yang paling sesuai agar organizer bisa membaca komitmen kehadiran secara akurat.</p>
                </div>
                <div className="schedule-rsvp-options">
                  {(['HADIR', 'TIDAK_HADIR', 'DELEGASI'] as const).map(s => (
                    <button
                      key={s}
                      className={`btn btn--sm${rsvpStatus === s ? ' btn--primary' : ' btn--ghost'}`}
                      onClick={() => { setRsvpStatus(s); if (s !== 'DELEGASI') setSelectedDelegate(null) }}
                    >
                      {s === 'HADIR' ? '✓ Hadir' : s === 'TIDAK_HADIR' ? '✗ Tidak Hadir' : '↪ Delegasi'}
                    </button>
                  ))}
                </div>
              </section>

              {rsvpStatus === 'DELEGASI' && (
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Delegasi Peserta</h4>
                    <p>Pilih penerima delegasi dan tambahkan konteks singkat agar transisinya tetap jelas.</p>
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Delegasikan ke</label>
                    {!selectedDelegate ? (
                      <>
                        {allUsers.length === 0 ? (
                          <p className="text-sm text-muted schedule-feedback schedule-feedback--muted">Memuat daftar user…</p>
                        ) : (
                          <>
                            <input
                              className="form-input"
                              type="text"
                              placeholder="Cari nama…"
                              value={delegateSearch}
                              onChange={e => setDelegateSearch(e.target.value)}
                              autoFocus
                            />
                            {delegateOptions.length > 0 && (
                              <div className="user-picker-list">
                                {delegateOptions.map(u => (
                                  <button
                                    key={u.id}
                                    className="user-picker-item"
                                    type="button"
                                    onClick={() => { setSelectedDelegate(u); setDelegateSearch('') }}
                                  >
                                    <span className="text-sm text-strong">{u.name}</span>
                                    <span className="text-xs text-muted">{u.positionTitle ?? u.roleType}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <div className="selected-user-chip">
                        <span>↪ {selectedDelegate.name}</span>
                        <button type="button" onClick={() => setSelectedDelegate(null)}>
                          <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="modal-field">
                    <label className="modal-label">Catatan <span className="text-muted">(opsional)</span></label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Alasan delegasi…"
                      value={delegateNote}
                      maxLength={200}
                      onChange={e => setDelegateNote(e.target.value)}
                    />
                    {delegateNote.length > 150 && (
                      <span className={`schedule-char-count${delegateNote.length >= 200 ? ' schedule-char-count--limit' : ''}`}>
                        {delegateNote.length}/200
                      </span>
                    )}
                  </div>
                </section>
              )}

              {rsvpError && (
                <p className="text-sm schedule-feedback schedule-feedback--danger schedule-feedback--compact">{rsvpError}</p>
              )}
            </div>

            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => closeOverlay('rsvp', () => setShowRsvpFor(null))} disabled={rsvpSaving}>Batal</button>
              <button className="btn btn--primary" onClick={submitRsvp} disabled={rsvpSaving}>
                {rsvpSaving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Meeting Modal ── */}
      {(showCreate || closingOverlay === 'create') && (
        <div className={`modal-backdrop${closingOverlay === 'create' ? ' modal-backdrop--closing' : ''}`} onClick={() => closeOverlay('create', () => setShowCreate(false))}>
          <div aria-describedby={createMeetingDescId} aria-labelledby={createMeetingTitleId} aria-modal="true" className="modal modal--wide schedule-modal" ref={createMeetingDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Schedule</span>
                <h3 className="modal__title" id={createMeetingTitleId}>Buat Meeting Baru</h3>
                <p className="modal-subtitle" id={createMeetingDescId}>Susun konteks meeting, jadwal, dan peserta dalam satu alur yang rapi sebelum undangan dikirim.</p>
              </div>
              <button className="modal__close" onClick={() => closeOverlay('create', () => setShowCreate(false))}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>

            <div className="modal__body schedule-modal__body schedule-modal__body--spacious">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Informasi Meeting</h4>
                  <p>Tetapkan identitas meeting dan kaitannya dengan program agar undangan langsung kontekstual.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Judul Meeting <span className="schedule-modal__required">*</span></label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="misal: Rapat Koordinasi Q2 2026"
                    value={form.title}
                    maxLength={120}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Tipe Meeting</label>
                  <select
                    className="form-input"
                    value={form.meetingType}
                    onChange={e => setForm(f => ({ ...f, meetingType: e.target.value as MeetingType }))}
                  >
                    {(Object.entries(MEETING_TYPE_LABEL) as [MeetingType, string][]).map(([val, lbl]) => (
                      <option key={val} value={val}>{lbl}</option>
                    ))}
                  </select>
                </div>
                {programs.length > 0 && (
                  <div className="modal-field">
                    <label className="modal-label">Terkait Program <span className="text-muted">(opsional)</span></label>
                    <select
                      className="form-input"
                      value={form.linkedProgramId}
                      onChange={e => setForm(f => ({ ...f, linkedProgramId: e.target.value }))}
                    >
                      <option value="">— Pilih program —</option>
                      {programs.map(p => (
                        <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </section>

              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Waktu & lokasi</h4>
                  <p>Pastikan peserta membaca kapan meeting dimulai, berakhir, dan di mana meeting berlangsung.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Tanggal & Waktu <span className="schedule-modal__required">*</span></label>
                  <div className="schedule-modal__datetime-grid">
                    <input
                      className="form-input"
                      type="date"
                      value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    />
                    <input
                      className="form-input"
                      type="time"
                      value={form.startTime}
                      onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    />
                    <input
                      className="form-input"
                      type="time"
                      value={form.endTime}
                      onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    />
                  </div>
                  <span className="text-xs text-muted schedule-modal__hint">Tanggal · Mulai · Selesai</span>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Lokasi <span className="text-muted">(opsional)</span></label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="misal: Ruang Rapat Direksi Lt.8 atau https://meet.google.com/…"
                    value={form.location}
                    maxLength={200}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Deskripsi <span className="text-muted">(opsional)</span></label>
                  <textarea
                    rows={2}
                    placeholder="Agenda, konteks, atau tujuan meeting…"
                    value={form.description}
                    maxLength={400}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="form-input schedule-modal__textarea"
                  />
                </div>
              </section>

              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Undang Peserta</h4>
                  <p>Pilih peserta wajib atau opsional, lalu cek kembali daftar undangan sebelum meeting dibuat.</p>
                </div>
                <div className="schedule-attendee-list">
                  <div className="schedule-attendee-chip schedule-attendee-chip--organizer">
                    <Avatar name={currentUser?.name ?? ''} size={18} />
                    <span>{currentUser?.name}</span>
                    <span className="schedule-attendee-chip__meta">Organizer</span>
                  </div>
                  {selectedAttendees.map(a => (
                    <div key={a.user.id} className="schedule-attendee-chip">
                      <Avatar name={a.user.name} size={18} />
                      <span>{a.user.name}</span>
                      <button
                        type="button"
                        className="schedule-attendee-chip__role"
                        onClick={() => toggleAttendeeRole(a.user.id)}
                        title="Klik untuk ubah peran"
                      >
                        {a.role === 'REQUIRED' ? 'Wajib' : 'Opsional'}
                      </button>
                      <button type="button" className="schedule-attendee-chip__remove" onClick={() => removeAttendee(a.user.id)}>
                        <svg fill="none" height="8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="8"><path d="m1 1 10 10M11 1 1 11" /></svg>
                      </button>
                    </div>
                  ))}
                </div>

                <input
                  className="form-input"
                  type="text"
                  placeholder="Ketik nama untuk undang peserta…"
                  value={attendeeSearch}
                  onChange={e => setAttendeeSearch(e.target.value)}
                />
                {attendeeSearch.length > 0 && attendeeOptions.length > 0 && (
                  <div className="user-picker-list">
                    {attendeeOptions
                      .filter(u => u.id !== currentUser?.id && !selectedAttendees.find(a => a.user.id === u.id))
                      .map(u => (
                        <button
                          key={u.id}
                          className="user-picker-item"
                          type="button"
                          onClick={() => addAttendee(u)}
                        >
                          <div className="schedule-user-option">
                            <Avatar name={u.name} size={22} />
                            <div className="schedule-user-option__body">
                              <span className="text-sm text-strong">{u.name}</span>
                              <span className="text-xs text-muted">{u.positionTitle ?? u.roleType}{u.unit ? ` · ${u.unit.code}` : ''}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </section>

              {selectedAttendees.length === 0 && (
                <p className="text-sm schedule-feedback schedule-feedback--warning">
                  ⚠ Belum ada peserta yang diundang. Meeting hanya akan dihadiri organizer.
                </p>
              )}

              {createError && (
                <p className="text-sm schedule-feedback schedule-feedback--danger">{createError}</p>
              )}
            </div>

            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => closeOverlay('create', () => setShowCreate(false))} disabled={createSaving}>Batal</button>
              <button className="btn btn--primary" onClick={submitCreate} disabled={createSaving}>
                {createSaving ? 'Membuat…' : 'Buat Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Focus Block Modal ── */}
      {(showFocusForm || closingOverlay === 'focus') && (
        <div className={`modal-backdrop${closingOverlay === 'focus' ? ' modal-backdrop--closing' : ''}`} onClick={() => closeOverlay('focus', () => setShowFocusForm(false))}>
          <div aria-describedby={focusDialogDescId} aria-labelledby={focusDialogTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--md" ref={focusDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Schedule</span>
                <h3 className="modal__title" id={focusDialogTitleId}>Blok Waktu Fokus</h3>
                <p className="modal-subtitle" id={focusDialogDescId}>Tandai rentang waktu yang sebaiknya tidak dipenuhi undangan meeting, sebagai sinyal bagi tim.</p>
              </div>
              <button className="modal__close" onClick={() => closeOverlay('focus', () => setShowFocusForm(false))}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body schedule-modal__body">
              <p className="text-sm text-muted schedule-modal__intro modal-helper-note">
                Blok ini menandai waktu Anda tidak tersedia untuk meeting. Bersifat soft — tidak memblokir undangan, hanya sebagai sinyal.
              </p>
              <section className="modal-section">
                <div className="modal-field">
                  <label className="modal-label">Label</label>
                  <input
                    className="form-input"
                    type="text"
                    value={focusForm.title}
                    maxLength={100}
                    onChange={e => setFocusForm(f => ({ ...f, title: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Tanggal & Waktu <span className="schedule-modal__required">*</span></label>
                  <div className="schedule-modal__datetime-grid">
                    <input className="form-input" type="date" value={focusForm.date}
                      onChange={e => setFocusForm(f => ({ ...f, date: e.target.value }))} />
                    <input className="form-input" type="time" value={focusForm.startTime}
                      onChange={e => setFocusForm(f => ({ ...f, startTime: e.target.value }))} />
                    <input className="form-input" type="time" value={focusForm.endTime}
                      onChange={e => setFocusForm(f => ({ ...f, endTime: e.target.value }))} />
                  </div>
                  <span className="text-xs text-muted schedule-modal__hint">Tanggal · Mulai · Selesai</span>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Catatan <span className="text-muted">(opsional)</span></label>
                  <input className="form-input" type="text" placeholder="misal: Deep work sprint Q2"
                    value={focusForm.note}
                    maxLength={300}
                    onChange={e => setFocusForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </section>
              {focusError && <p className="text-sm schedule-feedback schedule-feedback--danger">{focusError}</p>}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => closeOverlay('focus', () => setShowFocusForm(false))} disabled={focusSaving}>Batal</button>
              <button className="btn btn--primary schedule-btn--focus" onClick={submitFocusBlock} disabled={focusSaving}>
                {focusSaving ? 'Menyimpan…' : 'Simpan Blok'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScheduleView
