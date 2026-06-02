import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { PicaCompositePanel } from '../components/PicaCompositePanel'
import { UserPicker } from '../components/UserPicker'
import { formatRoleLabel } from '../lib/roleLabel'
import type { Meeting, MeetingType, PresenceStatus } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────

type ActionItem = {
  id: number
  meetingId: number
  title: string
  description?: string
  assignedToId?: number
  assignedTo?: { id: number; name: string; avatarUrl?: string }
  dueDate?: string
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'
  completedAt?: string
  linkedTaskId?: number | null
  createdAt: string
}

type WorkstreamOption = {
  id: number
  name: string
  code: string
}

type Decision = {
  id: number
  meetingId: number
  decision: string
  decidedBy: number
  decidedByUser?: { id: number; name: string }
  createdAt: string
}


type UserOption = {
  id: number
  name: string
  roleType?: string
  positionTitle?: string
}

type PrepPacket = {
  meetingId: number
  rsvpSummary: { hadir: number; tidakHadir: number; delegasi: number; pending: number; total: number }
  programContext: {
    id: number; name: string; code: string; healthStatus: string; progressPercent: number; status: string
    activeBlockers: Array<{ id: number; title: string; severity: string; status: string }>
    kpis: Array<{ id: number; name: string; targetValue: number; actualValue: number | null }>
  } | null
  continuity: {
    previousMeeting: { id: number; title: string; startAt: string }
    unresolvedCount: number; totalCount: number; completionRate: number | null
    unresolvedItems: Array<{ id: number; title: string; status: string; dueDate: string | null }>
  } | null
}

// ── iCal export ────────────────────────────────────────────────────────────

function icsDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('Z', 'Z')
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function exportIcs(meeting: Meeting): void {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ATLAS PTPN//Meeting//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:atlas-meeting-${meeting.id}@ptpn`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(meeting.startAt)}`,
    `DTEND:${icsDate(meeting.endAt)}`,
    `SUMMARY:${icsEscape(meeting.title)}`,
    meeting.description ? `DESCRIPTION:${icsEscape(meeting.description)}` : '',
    meeting.location ? `LOCATION:${icsEscape(meeting.location)}` : '',
    meeting.notes ? `COMMENT:${icsEscape(meeting.notes)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `atlas-meeting-${meeting.id}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Constants ──────────────────────────────────────────────────────────────

const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  RAPAT_DIREKSI: 'Rapat Direksi', RAPAT_KOORDINASI: 'Rapat Koordinasi',
  RAPAT_DIVISI: 'Rapat Divisi', RAPAT_TIM: 'Rapat Tim', ONE_ON_ONE: '1-on-1',
}

const ACTION_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
}

type MeetingTone = 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan' | 'pink' | 'orange'

const AVATAR_TONES: MeetingTone[] = ['purple', 'blue', 'green', 'yellow', 'red', 'cyan', 'pink', 'orange']

const MEETING_TYPE_TONE: Record<MeetingType, MeetingTone> = {
  RAPAT_DIREKSI: 'red',
  RAPAT_KOORDINASI: 'purple',
  RAPAT_DIVISI: 'blue',
  RAPAT_TIM: 'green',
  ONE_ON_ONE: 'yellow',
}

const RSVP_STATUS_TONE: Record<string, MeetingTone> = {
  HADIR: 'green',
  ACCEPTED: 'green',
  TIDAK_HADIR: 'red',
  DECLINED: 'red',
  DELEGASI: 'yellow',
  TENTATIVE: 'yellow',
  PENDING: 'gray',
}

const PRESENCE_STATUS_TONE: Record<PresenceStatus, MeetingTone> = {
  ONLINE: 'green',
  AWAY: 'yellow',
  DO_NOT_DISTURB: 'purple',
  OFFLINE: 'gray',
}

const HEALTH_STATUS_TONE: Record<'RED' | 'YELLOW' | 'GREEN', MeetingTone> = {
  RED: 'red',
  YELLOW: 'yellow',
  GREEN: 'green',
}

const BLOCKER_SEVERITY_TONE: Record<string, MeetingTone> = {
  CRITICAL: 'red',
  HIGH: 'yellow',
  MEDIUM: 'blue',
  LOW: 'green',
}

const ACTION_STATUS_TONE: Record<ActionItem['status'], MeetingTone> = {
  OPEN: 'gray',
  IN_PROGRESS: 'yellow',
  COMPLETED: 'green',
}

// ── Helpers ────────────────────────────────────────────────────────────────

const AVATAR_PALETTE_SIZE = AVATAR_TONES.length

function nameToColorIndex(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % AVATAR_PALETTE_SIZE
}

function toDateInput(iso: string) { return iso.slice(0, 10) }
function toTimeInput(iso: string) { return iso.slice(11, 16) }

function formatDatetime(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date(iso))
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(iso))
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

function rsvpLabel(status: string) {
  return RSVP_STATUS_TONE[status] ? (
    status === 'HADIR' || status === 'ACCEPTED' ? 'Present'
      : status === 'TIDAK_HADIR' || status === 'DECLINED' ? 'Absent'
      : status === 'DELEGASI' ? 'Delegated'
      : status === 'TENTATIVE' ? 'Tentative'
      : 'Pending'
  ) : status
}

function Avatar({ name }: { name: string }) {
  const tone = AVATAR_TONES[nameToColorIndex(name)]
  return (
    <div className="meeting-avatar" data-tone={tone}>
      {getInitials(name)}
    </div>
  )
}

function RsvpPill({ status, role }: { status: string; role: string }) {
  if (role === 'ORGANIZER') return (
    <span className="meeting-rsvp-pill meeting-rsvp-pill--organizer">
      Organizer
    </span>
  )
  const tone = RSVP_STATUS_TONE[status] ?? 'gray'
  return (
    <span className="meeting-rsvp-pill" data-tone={tone}>
      {rsvpLabel(status)}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function MeetingDetailPanel({
  meeting,
  onClose,
  onUpdate,
}: {
  meeting: Meeting
  onClose: () => void
  onUpdate: () => void
}) {
  const { currentUser, presence, meetingRefreshKey } = useWorkspace()
  const isOrganizer = meeting.organizerId === currentUser?.id
  const isCancelled = meeting.status === 'CANCELLED'
  const isPostponed = meeting.status === 'POSTPONED'
  const isCompleted = meeting.status === 'COMPLETED'

  const getPresenceStatus = (userId: number): PresenceStatus => {
    return presence.find(p => p.userId === userId)?.status ?? 'OFFLINE'
  }

  // ── Data state ────────────────────────────────────────────────────────────
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [prep, setPrep] = useState<PrepPacket | null>(null)
  const [prepExpanded, setPrepExpanded] = useState(true)
  const [prepUnavailable, setPrepUnavailable] = useState(false)

  // ── Notes ─────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(meeting.notes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesError, setNotesError] = useState<string | null>(null)

  // ── Decision form ─────────────────────────────────────────────────────────
  const [newDecision, setNewDecision] = useState('')
  const [decisionSaving, setDecisionSaving] = useState(false)
  const [confirmDeleteDecision, setConfirmDeleteDecision] = useState<number | null>(null)
  const deleteDecisionDialogRef = useDialogFocus<HTMLDivElement>(confirmDeleteDecision !== null)
  const deleteDecisionTitleId = useId()
  const deleteDecisionDescId = useId()
  const [decisionDeleteSaving, setDecisionDeleteSaving] = useState(false)
  useEscKey(() => { if (!decisionDeleteSaving) setConfirmDeleteDecision(null) }, confirmDeleteDecision !== null)
  const [confirmDeleteActionItem, setConfirmDeleteActionItem] = useState<number | null>(null)
  const deleteActionItemDialogRef = useDialogFocus<HTMLDivElement>(confirmDeleteActionItem !== null)
  const deleteActionItemTitleId = useId()
  const deleteActionItemDescId = useId()
  const [actionItemDeleteSaving, setActionItemDeleteSaving] = useState(false)
  useEscKey(() => { if (!actionItemDeleteSaving) setConfirmDeleteActionItem(null) }, confirmDeleteActionItem !== null)
  const [toggleLoading, setToggleLoading] = useState<number | null>(null)

  // ── Status lifecycle loading ──────────────────────────────────────────────
  const [startLoading, setStartLoading] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)

  // ── Edit meeting form ─────────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false)
  const editMeetingDialogRef = useDialogFocus<HTMLDivElement>(showEdit)
  const editMeetingTitleId = useId()
  const editMeetingDescId = useId()
  const [editForm, setEditForm] = useState({
    title: '', description: '', meetingType: 'RAPAT_TIM' as MeetingType,
    date: '', startTime: '', endTime: '', location: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  useEscKey(() => {
    if (editSaving) return
    const editDirty = editForm.title !== meeting.title ||
      editForm.description !== (meeting.description ?? '') ||
      editForm.meetingType !== meeting.meetingType ||
      editForm.location !== (meeting.location ?? '')
    if (editDirty && !window.confirm('Discard unsaved changes?')) return
    setShowEdit(false); setEditError(null)
  }, showEdit)

  // ── Postpone meeting ─────────────────────────────────────────────────────
  const [showPostpone, setShowPostpone] = useState(false)
  const postponeMeetingDialogRef = useDialogFocus<HTMLDivElement>(showPostpone)
  const postponeMeetingTitleId = useId()
  const postponeMeetingDescId = useId()
  const [postponeReason, setPostponeReason] = useState('')
  const [postponeSaving, setPostponeSaving] = useState(false)
  const [postponeError, setPostponeError] = useState<string | null>(null)
  useEscKey(() => {
    if (postponeSaving) return
    if (postponeReason !== '' && !window.confirm('Discard the reason you typed?')) return
    setShowPostpone(false); setPostponeReason(''); setPostponeError(null)
  }, showPostpone)

  // ── Push to workboard ─────────────────────────────────────────────────────
  const [pushItem, setPushItem] = useState<ActionItem | null>(null)
  const pushTaskDialogRef = useDialogFocus<HTMLDivElement>(pushItem !== null)
  const pushTaskTitleId = useId()
  const pushTaskDescId = useId()
  const [workstreams, setWorkstreams] = useState<WorkstreamOption[]>([])
  const [pushForm, setPushForm] = useState({ workstreamId: '', targetCompletion: '' })
  const [pushSaving, setPushSaving] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  useEscKey(() => {
    if (pushSaving) return
    const pushDirty = pushForm.workstreamId !== '' || pushForm.targetCompletion !== ''
    if (pushDirty && !window.confirm('Discard the selections you made?')) return
    setPushItem(null); setPushError(null)
  }, pushItem !== null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Action item form ──────────────────────────────────────────────────────
  const [showAIForm, setShowAIForm] = useState(false)
  const [aiForm, setAiForm] = useState({ title: '', assignedToId: '' as string | number, dueDate: '' })
  const [aiUsers, setAiUsers] = useState<UserOption[]>([])
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [aiSaving, setAiSaving] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // ── Panel body ref — scroll to top + reset transient state when meeting changes ──
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
    setNotes(meeting.notes ?? '')
    setNewDecision('')
    setShowAIForm(false)
    setAiForm({ title: '', assignedToId: '', dueDate: '' })
    setShowEdit(false)
    setEditError(null)
    setShowPostpone(false)
    setPostponeReason('')
    setPostponeError(null)
    setSuccessMsg(null)
    setErrorMsg(null)
  }, [meeting.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────

  const showError = (msg: string) => { setSuccessMsg(null); setErrorMsg(msg) }

  // ── Load panel data ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoadingData(true)
    setErrorMsg(null)
    try {
      const [aiRes, decRes] = await Promise.allSettled([
        api.get<{ data: ActionItem[] }>(`/meetings/${meeting.id}/action-items`),
        api.get<{ data: Decision[] }>(`/meetings/${meeting.id}/decisions`),
      ])
      if (aiRes.status === 'fulfilled') setActionItems(aiRes.value.data)
      if (decRes.status === 'fulfilled') setDecisions(decRes.value.data)
      // Prep packet — non-blocking, load separately
      api.get<{ data: PrepPacket }>(`/meetings/${meeting.id}/prep`)
        .then(res => { setPrep(res.data); setPrepUnavailable(false) })
        .catch((err) => { console.error('[Atlas] Silent failure in MeetingDetailPanel.tsx:', err); setPrepUnavailable(true) })
    } finally {
      setLoadingData(false)
    }
  }, [meeting.id])

  useEffect(() => { void loadData() }, [loadData])
  // Re-fetch panel data when any meeting SSE event fires (action items, decisions, RSVP)
  useEffect(() => { if (meetingRefreshKey > 0) void loadData() }, [meetingRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ESC closes Edit modal
  useEffect(() => {
    if (!showEdit) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editSaving) { setShowEdit(false); setEditError(null) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showEdit, editSaving])

  // ESC closes Postpone modal
  useEffect(() => {
    if (!showPostpone) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !postponeSaving) { setShowPostpone(false); setPostponeReason(''); setPostponeError(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPostpone, postponeSaving])

  useEffect(() => {
    if (!showAIForm || allUsers.length > 0) return
    api.get<{ data: UserOption[] }>('/users/directory')
      .then(res => setAllUsers(res.data ?? []))
      .catch((err) => console.error('[Atlas] Silent failure in MeetingDetailPanel.tsx:', err))
  }, [showAIForm, allUsers.length])

  useEffect(() => {
    if (!pushItem || workstreams.length > 0) return
    api.get<{ data: WorkstreamOption[] }>('/workstreams')
      .then(res => setWorkstreams(res.data ?? []))
      .catch((err) => console.error('[Atlas] Silent failure in MeetingDetailPanel.tsx:', err))
  }, [pushItem, workstreams.length])

  useEffect(() => {
    // Only show meeting attendees (HADIR or organizer) as valid assignees
    const eligible = meeting.attendees
      .filter(a => a.rsvpStatus === 'HADIR' || a.attendeeRole === 'ORGANIZER')
      .map(a => ({ id: a.userId, name: a.user?.name ?? '', positionTitle: a.user?.positionTitle }))
      .filter(u => u.name)
    setAiUsers(eligible)
  }, [meeting.attendees])

  // ── Notes save ────────────────────────────────────────────────────────────

  const saveNotes = async () => {
    setNotesSaving(true)
    setNotesError(null)
    try {
      await api.patch(`/meetings/${meeting.id}`, { notes })
      onUpdate()
      setSuccessMsg('Minutes saved successfully.')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setNotesSaving(false)
    }
  }

  // ── Decision actions ──────────────────────────────────────────────────────

  const addDecision = async () => {
    if (!newDecision.trim()) return
    setDecisionSaving(true)
    try {
      await api.post(`/meetings/${meeting.id}/decisions`, { decision: newDecision.trim() })
      setNewDecision('')
      void loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add decision.')
    } finally { setDecisionSaving(false) }
  }

  const deleteDecision = (id: number) => {
    setConfirmDeleteDecision(id)
  }

  const doDeleteDecision = async () => {
    if (!confirmDeleteDecision) return
    setDecisionDeleteSaving(true)
    try {
      await api.delete(`/meetings/${meeting.id}/decisions/${confirmDeleteDecision}`)
      setConfirmDeleteDecision(null)
      void loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete decision.')
      setConfirmDeleteDecision(null)
    } finally {
      setDecisionDeleteSaving(false)
    }
  }

  // ── Action item actions ───────────────────────────────────────────────────

  const addActionItem = async () => {
    if (!aiForm.title.trim()) { setAiError('Title is required.'); return }
    if (aiForm.title.trim().length < 3) { setAiError('Title must be at least 3 characters.'); return }
    setAiSaving(true)
    setAiError(null)
    try {
      await api.post(`/meetings/${meeting.id}/action-items`, {
        title: aiForm.title.trim(),
        assignedToId: aiForm.assignedToId ? Number(aiForm.assignedToId) : undefined,
        dueDate: aiForm.dueDate || undefined,
      })
      setAiForm({ title: '', assignedToId: '', dueDate: '' })
      setShowAIForm(false)
      void loadData()
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to add.')
    } finally {
      setAiSaving(false) }
  }

  const toggleActionStatus = async (item: ActionItem) => {
    if (toggleLoading === item.id) return
    const next = item.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED'
    setToggleLoading(item.id)
    try {
      await api.patch(`/meetings/${meeting.id}/action-items/${item.id}`, { status: next })
      void loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update action item status.')
    } finally {
      setToggleLoading(null)
    }
  }

  const deleteActionItem = (id: number) => {
    setConfirmDeleteActionItem(id)
  }

  const doDeleteActionItem = async () => {
    if (!confirmDeleteActionItem) return
    setActionItemDeleteSaving(true)
    try {
      await api.delete(`/meetings/${meeting.id}/action-items/${confirmDeleteActionItem}`)
      setConfirmDeleteActionItem(null)
      void loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete action item.')
      setConfirmDeleteActionItem(null)
    } finally {
      setActionItemDeleteSaving(false)
    }
  }

  // ── Status lifecycle ──────────────────────────────────────────────────────

  const startMeeting = async () => {
    if (startLoading) return
    setStartLoading(true)
    try {
      await api.patch(`/meetings/${meeting.id}`, { status: 'ONGOING' })
      setShowEdit(false)
      setShowAIForm(false)
      onUpdate()
      void loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to start meeting.')
    } finally {
      setStartLoading(false)
    }
  }

  const completeMeeting = async () => {
    if (completeLoading) return
    setCompleteLoading(true)
    try {
      await api.patch(`/meetings/${meeting.id}`, { status: 'COMPLETED' })
      setShowEdit(false)
      setShowAIForm(false)
      onUpdate()
      void loadData()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to complete meeting.')
    } finally {
      setCompleteLoading(false)
    }
  }

  const postponeMeeting = async () => {
    if (!postponeReason.trim()) { setPostponeError('A postponement reason is required.'); return }
    setPostponeSaving(true)
    setPostponeError(null)
    try {
      await api.patch(`/meetings/${meeting.id}`, { status: 'POSTPONED', postponedReason: postponeReason.trim() })
      setShowPostpone(false)
      setPostponeReason('')
      onUpdate()
      void loadData()
    } catch (err) {
      setPostponeError(err instanceof Error ? err.message : 'Failed to postpone meeting.')
    } finally {
      setPostponeSaving(false)
    }
  }

  const openReschedule = () => {
    // Reuse edit form but prefill with current time — organizer picks new time
    setEditForm({
      title: meeting.title,
      description: meeting.description ?? '',
      meetingType: meeting.meetingType,
      date: toDateInput(meeting.startAt),
      startTime: toTimeInput(meeting.startAt),
      endTime: toTimeInput(meeting.endAt),
      location: meeting.location ?? '',
    })
    setEditError(null)
    setShowEdit(true)
  }

  // ── Edit meeting ──────────────────────────────────────────────────────────

  const openEdit = () => {
    setEditForm({
      title: meeting.title,
      description: meeting.description ?? '',
      meetingType: meeting.meetingType,
      date: toDateInput(meeting.startAt),
      startTime: toTimeInput(meeting.startAt),
      endTime: toTimeInput(meeting.endAt),
      location: meeting.location ?? '',
    })
    setEditError(null)
    setShowEdit(true)
  }

  const submitEdit = async () => {
    if (!editForm.title.trim()) { setEditError('Title is required.'); return }
    if (editForm.title.trim().length < 3) { setEditError('Title must be at least 3 characters.'); return }
    if (!editForm.date || !editForm.startTime || !editForm.endTime) { setEditError('Date and time are required.'); return }
    const startAt = new Date(`${editForm.date}T${editForm.startTime}:00`).toISOString()
    const endAt   = new Date(`${editForm.date}T${editForm.endTime}:00`).toISOString()
    if (new Date(endAt) <= new Date(startAt)) { setEditError('End time must be after start time.'); return }
    setEditSaving(true)
    setEditError(null)
    try {
      await api.patch(`/meetings/${meeting.id}`, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        meetingType: editForm.meetingType,
        startAt,
        endAt,
        location: editForm.location.trim() || undefined,
        // If rescheduling a postponed meeting, restore to SCHEDULED
        ...(isPostponed ? { status: 'SCHEDULED' } : {}),
      })
      setShowEdit(false)
      onUpdate()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Push to Workboard ─────────────────────────────────────────────────────

  const openPush = (item: ActionItem) => {
    setPushForm({
      workstreamId: '',
      targetCompletion: item.dueDate
        ? item.dueDate.slice(0, 10)
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
    })
    setPushError(null)
    setPushItem(item)
  }

  const submitPush = async () => {
    if (!pushItem) return
    if (!pushForm.workstreamId) { setPushError('Select a workstream first.'); return }
    setPushSaving(true)
    setPushError(null)
    try {
      const res = await api.post<{ data: { taskCode: string; taskId: number } }>(
        `/meetings/${meeting.id}/action-items/${pushItem.id}/push`,
        {
          workstreamId: Number(pushForm.workstreamId),
          targetCompletion: pushForm.targetCompletion || undefined,
        }
      )
      setPushItem(null)
      void loadData()
      setErrorMsg(null)
      setSuccessMsg(`Task ${res.data.taskCode} created in Workboard.`)
      setTimeout(() => setSuccessMsg(null), 5000)
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Failed to push to Workboard.')
    } finally {
      setPushSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const completedAI  = actionItems.filter(i => i.status === 'COMPLETED').length
  const totalAI = actionItems.length

  // Cost calculation
  const durationMins = Math.round((new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime()) / 60000)
  const durationHrs = durationMins / 60
  const personHours = Math.round(durationHrs * meeting.attendees.length * 10) / 10

  return (
    <div className="meeting-detail">

      {/* Header — left accent stripe based on meeting type */}
      <div className="meeting-detail__header" data-tone={MEETING_TYPE_TONE[meeting.meetingType]}>
        <div className="meeting-detail__header-main">
          {/* Top badges row */}
          <div className="meeting-detail__badges">
            <span className="meeting-detail__type-badge" data-tone={MEETING_TYPE_TONE[meeting.meetingType]}>
              {MEETING_TYPE_LABEL[meeting.meetingType]}
            </span>
            {meeting.status === 'ONGOING' && (
              <span className="meeting-detail__status-badge meeting-detail__status-badge--ongoing">
                <span className="schedule-card__ongoing-dot" /> Ongoing
              </span>
            )}
            {meeting.status === 'COMPLETED' && (
              <span className="meeting-detail__status-badge meeting-detail__status-badge--done">✓ Completed</span>
            )}
            {isCancelled && (
              <span className="meeting-detail__status-badge meeting-detail__status-badge--cancel">Cancelled</span>
            )}
            {isPostponed && (
              <span className="meeting-detail__status-badge meeting-detail__status-badge--postponed">
                ⏸ Postponed
              </span>
            )}
          </div>

          <h2 className="meeting-detail__title">{meeting.title}</h2>

          {/* Postponed reason banner */}
          {isPostponed && meeting.postponedReason && (
            <div className="meeting-detail__postpone-banner">
              <strong>Postponement reason:</strong> {meeting.postponedReason}
            </div>
          )}

          {/* Rescheduled indicator */}
          {meeting.rescheduledFromAt && meeting.status !== 'POSTPONED' && (
            <div className="meeting-detail__reschedule-note">
              Rescheduled from {formatDatetime(meeting.rescheduledFromAt)}
            </div>
          )}

          {/* Meta row */}
          <div className="meeting-detail__meta">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>
            <span className="meeting-detail__meta-strong">{formatTime(meeting.startAt)} – {formatTime(meeting.endAt)}</span>
            <span className="meeting-detail__meta-dot">·</span>
            <span>{formatDate(meeting.startAt)}</span>
            {meeting.location && (
              <>
                <span className="meeting-detail__meta-dot">·</span>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 4-4.5 8.5-4.5 8.5S3.5 10 3.5 6A4.5 4.5 0 0 1 8 1.5z"/><circle cx="8" cy="6" r="1.5"/></svg>
                <span className="meeting-detail__meta-truncate">{meeting.location}</span>
              </>
            )}
          </div>

          {/* Person-hours */}
          <div className="meeting-detail__stats">
            <span className="meeting-detail__stats-muted">
              {meeting.attendees.length} attendees · {durationMins < 60 ? `${durationMins} min` : `${Math.round(durationHrs * 10) / 10} hr`}
            </span>
            <span className="meeting-detail__stats-dot">·</span>
            <span className="meeting-detail__stats-strong">{personHours} person-hours</span>
          </div>
        </div>

        {/* Action buttons + close */}
        <div className="meeting-detail__actions">
          {isOrganizer && !isCancelled && !isPostponed && !isCompleted && (
            <button className="btn btn--sm btn--ghost meeting-detail__action-btn" onClick={openEdit}>Edit</button>
          )}
          {isOrganizer && meeting.status === 'SCHEDULED' && (
            <button className="btn btn--sm btn--ghost meeting-detail__action-btn meeting-detail__action-btn--info" onClick={startMeeting} disabled={startLoading}>
              {startLoading ? '…' : '▶ Start'}
            </button>
          )}
          {isOrganizer && (meeting.status === 'SCHEDULED' || meeting.status === 'ONGOING') && (
            <button className="btn btn--sm btn--ghost meeting-detail__action-btn meeting-detail__action-btn--success" onClick={completeMeeting} disabled={completeLoading}>
              {completeLoading ? '…' : '✓ Complete'}
            </button>
          )}
          {isOrganizer && (meeting.status === 'SCHEDULED' || meeting.status === 'ONGOING') && (
            <button className="btn btn--sm btn--ghost meeting-detail__action-btn meeting-detail__action-btn--warn" onClick={() => setShowPostpone(true)}>
              ⏸ Postpone
            </button>
          )}
          {isOrganizer && isPostponed && (
            <button className="btn btn--sm btn--ghost meeting-detail__action-btn meeting-detail__action-btn--info" onClick={openReschedule}>
              Reschedule
            </button>
          )}
          {/* Sprint 5 — Check→Act bridge: post-meeting → ProgressLog */}
          {isCompleted && meeting.linkedProgramId && (
            <button
              className="btn btn--sm btn--ghost meeting-detail__action-btn meeting-detail__action-btn--info"
              onClick={() => {
                const decisionsList = decisions.length > 0 ? '\n\nDecisions:\n' + decisions.map(d => `- ${d.decision}`).join('\n') : ''
                const actionList = actionItems.length > 0 ? '\n\nAction Items:\n' + actionItems.map(a => `- ${a.title}`).join('\n') : ''
                const meetingDate = new Date(meeting.startAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                const ctx = {
                  narrative: `Outcome of coordination meeting "${meeting.title}" (${meetingDate}).${decisionsList}${actionList}`,
                  meetingTitle: meeting.title,
                  meetingDate: meeting.startAt,
                }
                sessionStorage.setItem(`atlas:progress-log-prefill.${meeting.linkedProgramId}`, JSON.stringify(ctx))
                window.location.href = `/programs/${meeting.linkedProgramId}`
              }}
              title="Record this meeting summary as a program ProgressLog"
            >
              → ProgressLog
            </button>
          )}
          {!isOrganizer && !isCancelled && !isPostponed && !isCompleted && (
            <span className="meeting-detail__readonly-hint" title="Only the organizer can edit this meeting">
              Read only
            </span>
          )}
          <button
            className="btn btn--sm btn--ghost meeting-detail__action-btn meeting-detail__action-btn--ics"
            onClick={() => exportIcs(meeting)}
            title="Export to Google Calendar / Apple Calendar (.ics)"
            type="button"
          >
            <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 14 14" width="12">
              <rect height="10" rx="1.5" width="12" x="1" y="3" />
              <path d="M1 6h12M5 1v4M9 1v4" />
            </svg>
            .ics
          </button>
          <button className="meeting-detail__close-btn panel-close-btn" onClick={onClose} title="Close (Esc)" type="button">
            <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
            <kbd>Esc</kbd>
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="meeting-detail__body">

        {/* ── Inline error toast ── */}
        {errorMsg && (
          <div className="meeting-inline-toast meeting-inline-toast--danger">
            <span>⚠ {errorMsg}</span>
            <button className="meeting-inline-toast__close" onClick={() => setErrorMsg(null)}>
              <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
            </button>
          </div>
        )}

        {/* ── Inline success toast ── */}
        {successMsg && (
          <div className="meeting-inline-toast meeting-inline-toast--success">
            <span>✓ {successMsg}</span>
            <button className="meeting-inline-toast__close" onClick={() => setSuccessMsg(null)}>
              <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
            </button>
          </div>
        )}

        {/* ── Prep Packet ── */}
        {prepUnavailable && !prep && (
          <div className="meeting-prep-unavailable">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3"/><circle cx="8" cy="11" r="0.5" fill="currentColor"/></svg>
            Meeting briefing is currently unavailable.
          </div>
        )}
        {prep && (prep.programContext || prep.continuity) && (
          <div className="prep-packet meeting-prep-packet">
            <button
              className="prep-packet__toggle"
              onClick={() => setPrepExpanded(e => !e)}
            >
              <span className="prep-packet__icon">📋</span>
              <span className="prep-packet__title">Meeting Briefing</span>
              <div className="prep-packet__badges">
                {prep.rsvpSummary.pending > 0 && (
                  <span className="prep-packet__badge prep-packet__badge--warn">
                    ○ {prep.rsvpSummary.pending} not confirmed
                  </span>
                )}
                {prep.programContext?.healthStatus === 'RED' && (
                  <span className="prep-packet__badge prep-packet__badge--danger">🔴 Critical program</span>
                )}
                {prep.continuity && prep.continuity.unresolvedCount > 0 && (
                  <span className="prep-packet__badge prep-packet__badge--warn">
                    ⚠ {prep.continuity.unresolvedCount} pending items
                  </span>
                )}
              </div>
              <svg
                className={`prep-packet__chevron${prepExpanded ? ' prep-packet__chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="m2 4 4 4 4-4" />
              </svg>
            </button>

            <div className={`prep-packet__body${prepExpanded ? ' prep-packet__body--open' : ''}`}>
              <div className="prep-packet__body-inner">

                {/* RSVP Summary */}
                <div className="prep-packet__row">
                  <span className="prep-packet__label">Attendance Confirmation</span>
                  <div className="meeting-prep-rsvp">
                    <span className="meeting-prep-rsvp__item" data-tone="green">✓ {prep.rsvpSummary.hadir} present</span>
                    {prep.rsvpSummary.tidakHadir > 0 && <span className="meeting-prep-rsvp__item" data-tone="red">✗ {prep.rsvpSummary.tidakHadir} absent</span>}
                    {prep.rsvpSummary.delegasi > 0 && <span className="meeting-prep-rsvp__item" data-tone="yellow">↪ {prep.rsvpSummary.delegasi} delegated</span>}
                    {prep.rsvpSummary.pending > 0 && <span className="meeting-prep-rsvp__item" data-tone="gray">○ {prep.rsvpSummary.pending} pending</span>}
                  </div>
                </div>

                {/* Program context */}
                {prep.programContext && (
                  <>
                    <div className="prep-packet__divider" />
                    <div className="prep-packet__row">
                      <span className="prep-packet__label">Program Status</span>
                      <div className="meeting-prep-program">
                        <div className="meeting-prep-program__header">
                          <span className="meeting-prep-program__name">
                            [{prep.programContext.code}] {prep.programContext.name}
                          </span>
                          <span className="meeting-prep-program__badge" data-tone={HEALTH_STATUS_TONE[prep.programContext.healthStatus as 'RED' | 'YELLOW' | 'GREEN'] ?? 'gray'}>
                            {prep.programContext.healthStatus === 'RED' ? '🔴 Critical' : prep.programContext.healthStatus === 'YELLOW' ? '🟡 At Risk' : '🟢 Healthy'}
                          </span>
                        </div>
                        <div className="meeting-prep-program__progress">
                          <div className="meeting-prep-program__track">
                            <div className="meeting-prep-program__fill" data-tone={HEALTH_STATUS_TONE[prep.programContext.healthStatus as 'RED' | 'YELLOW' | 'GREEN'] ?? 'gray'} style={{ width: `${prep.programContext.progressPercent}%` }} />
                          </div>
                          <span className="meeting-prep-program__percent">{prep.programContext.progressPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Blockers */}
                    {prep.programContext.activeBlockers.length > 0 && (
                      <div className="prep-packet__row">
                        <span className="prep-packet__label">Active Blockers</span>
                        <div className="meeting-prep-stack">
                          {prep.programContext.activeBlockers.map(b => (
                            <div key={b.id} className="meeting-prep-inline-row">
                              <span className="meeting-prep-severity" data-tone={BLOCKER_SEVERITY_TONE[b.severity] ?? 'blue'}>
                                {b.severity}
                              </span>
                              <span className="meeting-prep-inline-title">{b.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* KPIs */}
                    {prep.programContext.kpis.length > 0 && (
                      <div className="prep-packet__row">
                        <span className="prep-packet__label">Related KPIs</span>
                        <div className="meeting-prep-stack">
                          {prep.programContext.kpis.map(k => {
                            const pct = k.actualValue && k.targetValue ? Math.round((k.actualValue / k.targetValue) * 100) : null
                            return (
                              <div key={k.id} className="meeting-prep-kpi">
                                <span className="meeting-prep-kpi__name">{k.name}</span>
                                {pct !== null && (
                                  <span className="meeting-prep-kpi__value" data-tone={pct >= 80 ? 'green' : pct >= 60 ? 'yellow' : 'red'}>
                                    {pct}%
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Continuity summary */}
                {prep.continuity && prep.continuity.unresolvedCount > 0 && (
                  <>
                    <div className="prep-packet__divider" />
                    <div className="prep-packet__row">
                      <span className="prep-packet__label">Previous Meeting</span>
                      <div className="meeting-prep-continuity">
                        <span className="meeting-prep-continuity__headline">
                          ⚠ {prep.continuity.unresolvedCount} of {prep.continuity.totalCount} action items unresolved
                          {prep.continuity.completionRate !== null && ` (${prep.continuity.completionRate}% complete)`}
                        </span>
                        <span className="meeting-prep-continuity__meta">
                          {prep.continuity.previousMeeting.title} · {formatDate(prep.continuity.previousMeeting.startAt)}
                        </span>
                      </div>
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        )}

        {loadingData && (
          <p className="text-muted text-sm meeting-detail__loading-note">Loading data…</p>
        )}

        {/* ── Attendees ── */}
        <div className="meeting-detail__section">
          <div className="meeting-detail__section-header">
            <span className="meeting-detail__section-title">Attendees</span>
            <span className="meeting-detail__section-count">{meeting.attendees.length}</span>
          </div>
          <div className="meeting-detail__attendees">
            {meeting.attendees.length === 0 && (
              <p className="meeting-detail__empty-note">No attendees yet.</p>
            )}
            {meeting.attendees.map(a => {
              const name = a.user?.name ?? `User ${a.userId}`
              const pStatus = getPresenceStatus(a.userId)
              const presenceDotPulse = pStatus === 'ONLINE'
              return (
                <div key={a.id} className="meeting-detail__attendee">
                  <div className="meeting-detail__attendee-avatar">
                    <Avatar name={name} />
                    <span
                      className={presenceDotPulse ? 'attendee-presence-dot attendee-presence-dot--pulse' : 'attendee-presence-dot'}
                      data-tone={PRESENCE_STATUS_TONE[pStatus]}
                      title={pStatus === 'ONLINE' ? 'Online' : pStatus === 'AWAY' ? 'Away' : pStatus === 'DO_NOT_DISTURB' ? 'Do Not Disturb' : 'Offline'}
                    />
                  </div>
                  <div className="meeting-detail__attendee-info">
                    <div className="meeting-detail__attendee-name">{name}</div>
                    {a.rsvpStatus === 'DELEGASI' && a.delegateTo
                      ? <div className="meeting-detail__delegate-note">↪ {a.delegateTo.name}</div>
                      : a.user?.positionTitle
                        ? <div className="meeting-detail__attendee-role">{a.user.positionTitle}</div>
                        : null
                    }
                  </div>
                  <RsvpPill status={a.rsvpStatus} role={a.attendeeRole} />
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Notulen ── */}
        <div className="meeting-detail__section">
          <div className="meeting-detail__section-header">
            <span className="meeting-detail__section-title">Minutes</span>
          </div>
          {isOrganizer && !isCancelled && !isPostponed ? (
            <div className="meeting-detail__editor">
              <textarea
                className="form-input meeting-detail__textarea"
                rows={5}
                placeholder="Write meeting notes, discussion summary, key points…"
                value={notes}
                maxLength={8000}
                onChange={e => setNotes(e.target.value)}
              />
              {notes.length > 7000 && (
                <span className={`schedule-char-count meeting-detail__char-count${notes.length >= 8000 ? ' schedule-char-count--limit' : ''}`}>
                  {notes.length}/8000
                </span>
              )}
              <div className="meeting-detail__editor-footer">
                {notesError && <span className="text-sm schedule-feedback schedule-feedback--danger">{notesError}</span>}
                <button
                  className="btn btn--sm btn--ghost meeting-detail__save-btn"
                  onClick={saveNotes}
                  disabled={notesSaving}
                >
                  {notesSaving ? 'Saving…' : 'Save Minutes'}
                </button>
              </div>
            </div>
          ) : (
            <p className={`text-sm meeting-detail__notes-readonly${notes ? '' : ' meeting-detail__notes-readonly--empty'}`}>
              {notes || 'No minutes yet.'}
            </p>
          )}
        </div>

        {/* ── Keputusan ── */}
        <div className="meeting-detail__section">
          <div className="meeting-detail__section-header">
            <span className="meeting-detail__section-title">Decisions</span>
            <span className="meeting-detail__section-count">{decisions.length}</span>
          </div>

          {!loadingData && decisions.length === 0 && (
            <p className="meeting-detail__empty-note">No decisions recorded yet.</p>
          )}

          {decisions.length > 0 && (
            <div className="meeting-decisions">
              {decisions.map(d => (
                <div key={d.id} className="meeting-decision-item">
                  <span className="meeting-decision-item__icon">✅</span>
                  <div className="meeting-decision-item__body">
                    <p className="text-sm meeting-decision-item__text">{d.decision}</p>
                    {d.decidedByUser && (
                      <span className="text-xs text-muted">
                        by {d.decidedByUser.name} · {formatDatetime(d.createdAt)}
                      </span>
                    )}
                  </div>
                  {isOrganizer && !isCancelled && !isPostponed && (
                    <button
                      type="button"
                      className="meeting-detail__icon-btn"
                      onClick={() => void deleteDecision(d.id)}
                      aria-label="Delete decision"
                    >
                      <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isOrganizer && !isCancelled && !isPostponed && (
            <div className="meeting-decision-add">
              <div className="meeting-decision-add__field">
                <input
                  className="form-input meeting-decision-add__input"
                  type="text"
                  placeholder="Add a decision that was made…"
                  value={newDecision}
                  maxLength={600}
                  onChange={e => setNewDecision(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addDecision() } }}
                />
                {newDecision.length > 520 && (
                  <span className={`schedule-char-count meeting-decision-add__count${newDecision.length >= 600 ? ' schedule-char-count--limit' : ''}`}>
                    {newDecision.length}/600
                  </span>
                )}
              </div>
              <button
                className="btn btn--sm btn--primary"
                onClick={addDecision}
                disabled={decisionSaving || newDecision.trim().length < 3 || newDecision.length >= 600}
                title={newDecision.trim().length > 0 && newDecision.trim().length < 3 ? 'At least 3 characters' : undefined}
              >
                {decisionSaving ? '…' : '+ Add'}
              </button>
            </div>
          )}
        </div>

        {/* ── Sprint 3 — PICA Composite Panel ── */}
        {/* Auto-expanded saat RAPAT_KOORDINASI dengan linkedProgramId; collapsed di tipe lain */}
        <div className="meeting-detail__section">
          <PicaCompositePanel
            meetingId={meeting.id}
            meetingType={meeting.meetingType}
            linkedProgramId={meeting.linkedProgramId ?? null}
            isOrganizer={isOrganizer}
            onCreateActionItem={(prefill) => {
              setAiForm({
                title: prefill.title,
                assignedToId: '',
                dueDate: '',
              })
              setShowAIForm(true)
              // Scroll ke form action item agar user lihat
              setTimeout(() => {
                document.querySelector('.meeting-action-items')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            }}
          />
        </div>

        {/* ── Action Items ── */}
        <div className="meeting-detail__section">
          <div className="meeting-detail__section-header">
            <span className="meeting-detail__section-title">Action Items</span>
            {totalAI > 0 && (
              <span className="meeting-detail__section-count">
                {completedAI}/{totalAI} completed
              </span>
            )}
          </div>
          {/* Gap pass 2 — clarify close-loop behavior: tandai action item
              selesai akan auto-close task yang ditautkan, tapi reopen tidak
              revert. Mencegah user surprise saat unmark accidentally. */}
          {actionItems.some(ai => ai.linkedTaskId) && (
            <p className="meeting-detail__hint">
              💡 Action items linked to a task will automatically close the task when marked complete.
              Reopening an action item does NOT revert the task — open the task to reopen it manually if needed.
            </p>
          )}

          {/* Progress bar */}
          {totalAI > 0 && (
            <div className="meeting-action-progress">
              <div className="meeting-action-progress__fill" style={{ width: `${Math.round((completedAI / totalAI) * 100)}%` }} />
            </div>
          )}
          {totalAI > 0 && completedAI === totalAI && (
            <div className="meeting-action-progress__done">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="m5 8 2 2 4-4"/></svg>
              All action items completed!
            </div>
          )}

          {!loadingData && actionItems.length === 0 && (
            <p className="meeting-detail__empty-note">No action items yet.</p>
          )}

          {actionItems.length > 0 && (
            <div className="meeting-action-items">
              {actionItems.map(item => (
                <div key={item.id} className={`meeting-action-item${item.status === 'COMPLETED' ? ' meeting-action-item--done' : ''}`}>
                  <button
                    className="meeting-action-item__check"
                    onClick={() => void toggleActionStatus(item)}
                    disabled={toggleLoading === item.id || (item.assignedTo?.id !== currentUser?.id && !isOrganizer)}
                    title={item.status === 'COMPLETED' ? 'Mark as not completed' : 'Mark as completed'}
                  >
                    {item.status === 'COMPLETED'
                      ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="m5 8 2 2 4-4" /></svg>
                      : <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /></svg>
                    }
                  </button>
                  <div className="meeting-action-item__body">
                    <p className={`text-sm meeting-action-item__title${item.status === 'COMPLETED' ? ' meeting-action-item__title--done' : ''}`}>
                      {item.title}
                    </p>
                    <div className="meeting-action-item__meta">
                      {item.assignedTo && (
                        <span className="text-xs text-muted">→ {item.assignedTo.name}</span>
                      )}
                      {item.dueDate && (
                        <span className={`text-xs${new Date(item.dueDate) < new Date() && item.status !== 'COMPLETED' ? ' meeting-action-item__meta-overdue' : ' text-muted'}`}>
                          due {formatDate(item.dueDate)}
                        </span>
                      )}
                      <span className="text-xs meeting-action-item__status" data-tone={ACTION_STATUS_TONE[item.status]}>
                        {ACTION_STATUS_LABEL[item.status]}
                      </span>
                    </div>
                  </div>
                  <div className="meeting-action-item__actions">
                    {item.linkedTaskId ? (
                      <span className="meeting-action-item__wi-pill">
                        WI ✓
                      </span>
                    ) : isOrganizer && !isCancelled && !isPostponed && item.status !== 'COMPLETED' && (
                      <button
                        className="btn btn--xs btn--ghost meeting-action-item__wb-btn"
                        onClick={() => openPush(item)}
                        title="Push to Workboard as a Task"
                      >
                        → WB
                      </button>
                    )}
                    {isOrganizer && !isCancelled && !isPostponed && (
                      <button type="button" className="meeting-detail__icon-btn" onClick={() => void deleteActionItem(item.id)} aria-label="Delete action item">
                        <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isOrganizer && !isCancelled && !isPostponed && (
            <>
              {!showAIForm ? (
                <button
                  className="meeting-add-item-btn"
                  onClick={() => setShowAIForm(true)}
                >
                  + Add action item
                </button>
              ) : (
                <div className="meeting-ai-form">
                  <input
                    className="form-input meeting-ai-form__title"
                    type="text"
                    placeholder="Action item title… (min. 3 characters)"
                    value={aiForm.title}
                    minLength={3}
                    maxLength={200}
                    onChange={e => setAiForm(f => ({ ...f, title: e.target.value }))}
                    autoFocus
                  />
                  <div className="meeting-ai-form__grid">
                    <div className="meeting-ai-form__field">
                      <UserPicker
                        allowClear
                        clearLabel="— Clear assignee —"
                        inputClassName="form-input meeting-ai-form__input"
                        onChange={id => setAiForm(f => ({ ...f, assignedToId: id ?? '' }))}
                        options={aiUsers.map(u => ({
                          id: u.id,
                          name: u.name,
                          positionTitle: u.positionTitle ?? formatRoleLabel(u.roleType),
                        }))}
                        placeholder="Assign to…"
                        value={typeof aiForm.assignedToId === 'number' ? aiForm.assignedToId : (aiForm.assignedToId ? Number(aiForm.assignedToId) : null)}
                      />
                    </div>
                    <input
                      className="form-input meeting-ai-form__input"
                      type="date"
                      value={aiForm.dueDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={e => setAiForm(f => ({ ...f, dueDate: e.target.value }))}
                    />
                  </div>
                  {aiError && <p className="text-sm schedule-feedback schedule-feedback--danger">{aiError}</p>}
                  <div className="meeting-ai-form__actions">
                    <button className="btn btn--sm btn--ghost" onClick={() => { setShowAIForm(false); setAiError(null); setAiForm({ title: '', assignedToId: '', dueDate: '' }) }}>Cancel</button>
                    <button className="btn btn--sm btn--primary" onClick={addActionItem} disabled={aiSaving}>
                      {aiSaving ? '…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* ── Edit Meeting Modal ──
          Phase 5B: portal-mount semua 5 modal MeetingDetailPanel ke document.body.
          Subkomponen ini dipakai di ScheduleView yang sekarang punya ds-stagger
          → modal-backdrop inline akan ter-scope salah. Portal escape ke viewport. */}
      {showEdit && createPortal(
        <div className="modal-backdrop" onClick={() => setShowEdit(false)}>
          <div aria-describedby={editMeetingDescId} aria-labelledby={editMeetingTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--lg meeting-modal-surface" ref={editMeetingDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Meeting Setup</span>
                <h3 className="modal__title" id={editMeetingTitleId}>Edit Meeting</h3>
                <p className="modal-subtitle" id={editMeetingDescId}>
                  Update the agenda, time, and meeting context so attendees receive the most accurate information.
                </p>
              </div>
              <button className="modal__close" type="button" onClick={() => setShowEdit(false)}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body schedule-modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Main Information</h4>
                  <p>Tidy up the meeting title and type so attendees immediately understand the forum they are attending.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Title <span className="schedule-modal__required">*</span></label>
                  <input className="form-input" type="text" value={editForm.title}
                    minLength={3} maxLength={120} disabled={editSaving}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} autoFocus />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Meeting Type</label>
                  <select className="form-input" value={editForm.meetingType} disabled={editSaving}
                    onChange={e => setEditForm(f => ({ ...f, meetingType: e.target.value as MeetingType }))}>
                    {(['RAPAT_DIREKSI','RAPAT_KOORDINASI','RAPAT_DIVISI','RAPAT_TIM','ONE_ON_ONE'] as MeetingType[]).map(t => (
                      <option key={t} value={t}>{MEETING_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Time & Location</h4>
                  <p>Make sure the schedule, location, and additional notes are ready before changes are saved for attendees.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Date & Time <span className="schedule-modal__required">*</span></label>
                  <div className="schedule-modal__datetime-grid">
                    <input className="form-input" type="date" value={editForm.date} required disabled={editSaving}
                      onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
                    <input className="form-input" type="time" value={editForm.startTime} required disabled={editSaving}
                      onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))} />
                    <input className="form-input" type="time" value={editForm.endTime} required disabled={editSaving}
                      onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))} />
                  </div>
                  <span className="text-xs text-muted schedule-modal__hint">Date · Start · End</span>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Location</label>
                  <input className="form-input" type="text" placeholder="Meeting room or link…" value={editForm.location}
                    maxLength={200} disabled={editSaving}
                    onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Description</label>
                  <textarea className="form-input schedule-modal__textarea" rows={2} value={editForm.description}
                    maxLength={400} disabled={editSaving}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </section>
              {editError && <p className="text-sm schedule-feedback schedule-feedback--danger">{editError}</p>}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => { setShowEdit(false); setEditError(null) }} disabled={editSaving}>Cancel</button>
              <button className="btn btn--primary" onClick={submitEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Delete Decision Confirmation Modal ── Phase 5B: portal-mounted. */}
      {confirmDeleteDecision !== null && createPortal(
        <div className="modal-backdrop" onClick={() => setConfirmDeleteDecision(null)}>
          <div aria-describedby={deleteDecisionDescId} aria-labelledby={deleteDecisionTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--confirm meeting-modal-surface meeting-modal-surface--confirm" ref={deleteDecisionDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={deleteDecisionTitleId}>Delete Decision?</h3>
                <p className="modal-subtitle" id={deleteDecisionDescId}>A deleted meeting decision cannot be restored and will be lost from the minutes trail.</p>
              </div>
              <button className="modal__close" type="button" onClick={() => setConfirmDeleteDecision(null)}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body">
              <div className="modal-helper-note modal-helper-note--danger">
                This decision will be permanently deleted and cannot be recovered.
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setConfirmDeleteDecision(null)} disabled={decisionDeleteSaving}>Cancel</button>
              <button className="btn btn--danger" onClick={() => void doDeleteDecision()} disabled={decisionDeleteSaving}>
                {decisionDeleteSaving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Delete Action Item Confirmation Modal ── Phase 5B: portal-mounted. */}
      {confirmDeleteActionItem !== null && createPortal(
        <div className="modal-backdrop" onClick={() => setConfirmDeleteActionItem(null)}>
          <div aria-describedby={deleteActionItemDescId} aria-labelledby={deleteActionItemTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--confirm meeting-modal-surface meeting-modal-surface--confirm" ref={deleteActionItemDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={deleteActionItemTitleId}>Delete Action Item?</h3>
                <p className="modal-subtitle" id={deleteActionItemDescId}>Deleting an action item breaks the execution trail originating from this meeting forum.</p>
              </div>
              <button className="modal__close" type="button" onClick={() => setConfirmDeleteActionItem(null)}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body">
              <div className="modal-helper-note modal-helper-note--danger">
                This action item will be permanently deleted and cannot be recovered.
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setConfirmDeleteActionItem(null)} disabled={actionItemDeleteSaving}>Cancel</button>
              <button className="btn btn--danger" onClick={() => void doDeleteActionItem()} disabled={actionItemDeleteSaving}>
                {actionItemDeleteSaving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Push to Workboard Modal ── Phase 5B: portal-mounted. */}
      {pushItem && createPortal(
        <div className="modal-backdrop" onClick={() => setPushItem(null)}>
          <div aria-describedby={pushTaskDescId} aria-labelledby={pushTaskTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--md meeting-modal-surface" ref={pushTaskDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Meeting to Workboard</span>
                <h3 className="modal__title" id={pushTaskTitleId}>Push to Workboard</h3>
                <p className="modal-subtitle" id={pushTaskDescId}>
                  Turn a meeting action item into a task whose progress, owner, and deadline can be tracked.
                </p>
              </div>
              <button className="modal__close" type="button" onClick={() => setPushItem(null)}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body schedule-modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Source Action Item</h4>
                  <p>The item below will be used as the basis for a new task in the workboard.</p>
                </div>
                <div className="meeting-push-preview">
                  <span className="meeting-push-preview__label">Action item</span>
                  <span className="meeting-push-preview__title">{pushItem.title}</span>
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Execution Target</h4>
                  <p>Choose the destination workstream and add a target completion date if you want a more measurable follow-up rhythm.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Workstream <span className="schedule-modal__required">*</span></label>
                  {workstreams.length === 0 ? (
                    <p className="text-sm text-muted">Loading…</p>
                  ) : (
                    <select className="form-input" value={pushForm.workstreamId}
                      onChange={e => setPushForm(f => ({ ...f, workstreamId: e.target.value }))}>
                      <option value="">— Select a workstream —</option>
                      {workstreams.map(i => (
                        <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="modal-field">
                  <label className="modal-label">Target Completion</label>
                  <input className="form-input" type="date" value={pushForm.targetCompletion}
                    onChange={e => setPushForm(f => ({ ...f, targetCompletion: e.target.value }))} />
                </div>
              </section>
              {pushError && <p className="text-sm schedule-feedback schedule-feedback--danger">{pushError}</p>}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setPushItem(null)} disabled={pushSaving}>Cancel</button>
              <button className="btn btn--primary" onClick={submitPush} disabled={pushSaving}>
                {pushSaving ? 'Creating…' : '→ Create Task'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Postpone Modal ── Phase 5B: portal-mounted. */}
      {showPostpone && createPortal(
        <div className="modal-backdrop" onClick={() => { setShowPostpone(false); setPostponeReason(''); setPostponeError(null) }}>
          <div aria-describedby={postponeMeetingDescId} aria-labelledby={postponeMeetingTitleId} aria-modal="true" className="modal schedule-modal schedule-modal--md meeting-modal-surface" ref={postponeMeetingDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Meeting Status</span>
                <h3 className="modal__title" id={postponeMeetingTitleId}>Postpone Meeting</h3>
                <p className="modal-subtitle" id={postponeMeetingDescId}>
                  Postpone the meeting with a clear reason so attendees understand the context and the organizer can reschedule easily.
                </p>
              </div>
              <button className="modal__close" type="button" onClick={() => { setShowPostpone(false); setPostponeReason(''); setPostponeError(null) }}>
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body schedule-modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Postponement Impact</h4>
                  <p>The meeting status will become <strong>Postponed</strong>. The organizer can reschedule at any time.</p>
                </div>
                <div className="modal-helper-note">
                  Use a sufficiently informative reason so attendees understand whether the meeting needs to be re-prepared or is simply being moved.
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Postponement Reason</h4>
                  <p>This note helps preserve context when the meeting is rescheduled later.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Postponement Reason <span className="schedule-modal__required">*</span></label>
                  <textarea
                    className="form-input schedule-modal__textarea"
                    rows={3}
                    placeholder="e.g. Director unavailable, will be rescheduled"
                    value={postponeReason}
                    maxLength={300}
                    onChange={e => setPostponeReason(e.target.value)}
                    autoFocus
                  />
                  {postponeReason.length > 240 && (
                    <span className={`schedule-char-count${postponeReason.length >= 300 ? ' schedule-char-count--limit' : ''}`}>{postponeReason.length}/300</span>
                  )}
                </div>
              </section>
              {postponeError && <p className="text-sm schedule-feedback schedule-feedback--danger">{postponeError}</p>}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" type="button" onClick={() => { setShowPostpone(false); setPostponeReason(''); setPostponeError(null) }} disabled={postponeSaving}>Cancel</button>
              <button className="btn btn--primary meeting-btn--warn" type="button" onClick={postponeMeeting} disabled={postponeSaving || !postponeReason.trim()}>
                {postponeSaving ? 'Saving…' : '⏸ Confirm Postpone'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
