import {
  createContext,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { api, extractErrorMessage, sessionStorage } from '../lib/api'
import { useAuth as useInertiaAuth } from '../hooks/useAuth'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'
import type {
  AuthUser,
  Blocker,
  ChannelMember,
  ChannelMessage,
  ChannelSummary,
  DashboardPayload,
  WorkstreamDetail,
  ApmsKpi,
  ApmsKpiResponse,
  Kpi,
  NotificationItem,
  PresenceStatus,
  PresenceUser,
  Program,
  ProgramDetail,
  ProgramSummaryPayload,
  SavedSearch,
  SearchResult,
  SystemStatus,
  Task,
  TaskDetail,
  MyWorkPayload,
} from '../types'

// ── Local types ───────────────────────────────────────────
export type CollectionResponse<T> = { data: T[]; total: number }
export type NotificationsResponse = { notifications: NotificationItem[]; unreadCount: number }
export type WorkGroup = { status: string; count: number; items: Task[] }
export type OverviewStatus = { loading: boolean; refreshing: boolean; message: string | null }

type ChannelDetailResponse = {
  channel: { id: number; name: string; type: 'PUBLIC' | 'PRIVATE' }
  members: ChannelMember[]
}
type TasksResponse = {
  data: Task[]
  groups: WorkGroup[]
  total: number
}
type ProgramDetailResponse = { data: ProgramDetail }
type TaskDetailResponse = { data: TaskDetail }
type WorkstreamDetailResponse = { data: WorkstreamDetail }
type RealtimeSnapshot = {
  type: 'snapshot'
  generatedAt: string
  channels: ChannelSummary[]
  presence: PresenceUser[]
  notifications: NotificationsResponse
}

type DashboardApiPayload = Omit<DashboardPayload, 'dimensions'> & {
  dimensions: Omit<DashboardPayload['dimensions'], 'controls'> & {
    governance: DashboardPayload['dimensions']['controls']
  }
}

function normalizeDashboardPayload(payload: DashboardApiPayload): DashboardPayload {
  return {
    ...payload,
    dimensions: {
      ...payload.dimensions,
      controls: payload.dimensions.governance,
    },
  }
}

// ── Context value type ────────────────────────────────────
export interface WorkspaceContextValue {
  // Auth
  authStatus: 'booting' | 'signed_out' | 'authenticating' | 'transitioning' | 'signed_in' | 'logging_out'
  currentUser: AuthUser | null
  authError: string | null
  authMessage: string | null
  authForm: { identifier: string; password: string }
  setAuthForm: Dispatch<SetStateAction<{ identifier: string; password: string }>>
  handleLogin: (e: FormEvent<HTMLFormElement>) => Promise<void>
  handleLogout: () => Promise<void>
  handleForgotPassword: () => Promise<void>
  signOutToEntry: (message?: string) => void
  logoutPending: boolean
  requestLogout: () => void
  cancelLogout: () => void

  // Shell UI
  navRailCollapsed: boolean
  setNavRailCollapsed: Dispatch<SetStateAction<boolean>>
  userMenuSurface: 'topbar' | 'sidebar' | null
  toggleUserMenu: (surface: 'topbar' | 'sidebar') => void
  closeUserMenu: () => void

  // Workspace data
  dashboard: DashboardPayload | null
  myWork: MyWorkPayload | null
  programSummary: ProgramSummaryPayload | null
  channels: ChannelSummary[]
  setChannels: Dispatch<SetStateAction<ChannelSummary[]>>
  programs: Program[]
  workGroups: WorkGroup[]
  setWorkGroups: Dispatch<SetStateAction<WorkGroup[]>>
  kpis: Kpi[]
  apmsKpis: ApmsKpi[]
  apmsConnected: boolean
  apmsLinkedPrograms: Record<string, { id: number; code: string; name: string }[]>
  apmsLastFetchedAt: string | null
  refreshApmsKpis: () => Promise<void>
  blockers: Blocker[]
  presence: PresenceUser[]
  setPresence: Dispatch<SetStateAction<PresenceUser[]>>
  notifications: NotificationItem[]
  savedSearches: SavedSearch[]
  systemStatus: SystemStatus | null

  // Selection
  selectedChannelId: number | null
  setSelectedChannelId: Dispatch<SetStateAction<number | null>>
  selectedThreadId: number | null
  setSelectedThreadId: Dispatch<SetStateAction<number | null>>
  selectedProgramId: number | null
  setSelectedProgramId: Dispatch<SetStateAction<number | null>>
  selectedTaskId: number | null
  setSelectedTaskId: Dispatch<SetStateAction<number | null>>
  selectedWorkstreamId: number | null
  setSelectedWorkstreamId: Dispatch<SetStateAction<number | null>>

  // Detail data
  channelMembers: ChannelMember[]
  messages: ChannelMessage[]
  setMessages: Dispatch<SetStateAction<ChannelMessage[]>>
  threadParent: ChannelMessage | null
  threadReplies: ChannelMessage[]
  setThreadReplies: Dispatch<SetStateAction<ChannelMessage[]>>
  programDetail: ProgramDetail | null
  setProgramDetail: Dispatch<SetStateAction<ProgramDetail | null>>
  workstreamDetail: WorkstreamDetail | null
  taskDetail: TaskDetail | null
  setTaskDetail: Dispatch<SetStateAction<TaskDetail | null>>

  // Meeting detail SSE signal — increments whenever any meeting:* event fires
  meetingRefreshKey: number

  // Execution Grid SSE signal — increments whenever task/phase/subtask events fire
  gridRefreshTick: number

  // Assignments (Penugasan) SSE signal — increments whenever assignment:changed fires
  assignmentRefreshTick: number

  // Loading / status
  channelStatus: { loading: boolean; message: string | null }
  setChannelStatus: Dispatch<SetStateAction<{ loading: boolean; message: string | null }>>
  programDetailStatus: { loading: boolean; message: string | null }
  setProgramDetailStatus: Dispatch<SetStateAction<{ loading: boolean; message: string | null }>>
  taskDetailStatus: { loading: boolean; message: string | null }
  setTaskDetailStatus: Dispatch<SetStateAction<{ loading: boolean; message: string | null }>>
  workstreamDetailStatus: { loading: boolean; message: string | null }
  overviewStatus: OverviewStatus
  boardStatus: { saving: boolean; message: string | null }
  setBoardStatus: Dispatch<SetStateAction<{ saving: boolean; message: string | null }>>
  taskActionStatus: { saving: boolean; message: string | null }
  setTaskActionStatus: Dispatch<SetStateAction<{ saving: boolean; message: string | null }>>
  lastSyncedAt: string | null
  currentTimeTick: number

  // Drag state (board)
  dragState: { itemId: number | null; overStatus: string | null }
  setDragState: Dispatch<SetStateAction<{ itemId: number | null; overStatus: string | null }>>

  // Presence draft
  presenceDraft: { status: PresenceStatus; statusEmoji: string; statusMessage: string }
  setPresenceDraft: Dispatch<SetStateAction<{ status: PresenceStatus; statusEmoji: string; statusMessage: string }>>

  // Search state
  searchResults: SearchResult[]
  setSearchResults: Dispatch<SetStateAction<SearchResult[]>>
  searchTotal: number
  setSearchTotal: Dispatch<SetStateAction<number>>
  query: string
  setQuery: Dispatch<SetStateAction<string>>
  searching: boolean
  searchError: string | null

  // Derived
  selectedChannel: ChannelSummary | null
  selectedProgram: Program | null
  totalUnreadChannels: number
  liveStatusLabel: string
  topbarSyncLabel: string
  nextRefreshAt: number | null

  // Actions
  loadOverview: (mode?: 'initial' | 'refresh') => Promise<void>
  refreshChannel: (channelId: number, threadId?: number | null, silent?: boolean) => Promise<void>
  loadProgramDetail: (programId: number, silent?: boolean) => Promise<void>
  loadWorkstreamDetail: (workstreamId: number, silent?: boolean) => Promise<void>
  loadTaskDetail: (taskId: number, silent?: boolean) => Promise<void>
  handleReact: (messageId: number) => Promise<void>
  markNotificationRead: (notificationId: number) => Promise<void>
  dismissNotification: (notificationId: number) => Promise<void>
  notifToasts: NotificationItem[]
  dismissToast: (id: number) => void
  handleTaskDragStart: (taskId: number) => void
  handleTaskDrop: (targetStatus: string, options?: { note?: string; blockedReason?: string }) => Promise<void>
  handleStatusUpdate: (e: FormEvent<HTMLFormElement>) => Promise<void>
  runSearch: (searchQuery: string, type?: string) => Promise<void>
  openProgramWorkspace: (programId: number) => void
  openWorkstreamWorkspace: (workstreamId: number) => void
  openTaskWorkspace: (taskId: number) => void
  boardOnOpen: { forceShowAll: boolean; filterProgramId: number | null } | null
  clearBoardOnOpen: () => void

  // Typing indicators
  typingUsers: Record<number, { userId: number; userName: string }[]>
  sendTyping: (channelId: number) => void

  // Utilities
  normalizeHealthStatus: (value?: string) => 'GREEN' | 'YELLOW' | 'RED'
  formatStatusLabel: (value?: string) => string
  appendComposerSnippet: (setter: Dispatch<SetStateAction<string>>, snippet: string) => void
  formatDate: (dateString: string) => string
}

// ── Helpers ───────────────────────────────────────────────
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (seconds < 60) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch {
    return dateString
  }
}

const normalizeHealthStatus = (value?: string): 'GREEN' | 'YELLOW' | 'RED' =>
  value === 'GREEN' || value === 'YELLOW' || value === 'RED' ? value : 'YELLOW'

const formatStatusLabel = (value?: string): string => {
  if (!value) return 'Not set'
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function appendComposerSnippet(
  setter: Dispatch<SetStateAction<string>>,
  snippet: string,
) {
  setter((current) => {
    if (!current.trim()) return snippet
    return `${current.trimEnd()}\n\n${snippet}`
  })
}

function realtimePayload<T>(data: unknown): T | null {
  return data && typeof data === 'object' ? (data as T) : null
}

// ── Context ───────────────────────────────────────────────
export const WorkspaceContext = createContext<WorkspaceContextValue>(null!)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const navigate = useInertiaNavigate()
  const inertiaUser = useInertiaAuth()

  // Auth
  const [authStatus, setAuthStatus] = useState<WorkspaceContextValue['authStatus']>('booting')
  const [logoutPending, setLogoutPending] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authForm, setAuthForm] = useState({ identifier: '', password: '' })

  const toWorkspaceUser = (user: typeof inertiaUser): AuthUser | null => {
    if (!user) return null
    return {
      id: user.id,
      userId: user.email,
      email: user.email,
      name: user.name,
      roleType: user.roleType,
      positionTitle: user.positionTitle ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
    }
  }

  // Shell UI
  const [navRailCollapsed, setNavRailCollapsed] = useState(() =>
    typeof window !== 'undefined'
      ? window.localStorage.getItem('atlas-nav-collapsed') === 'true'
      : false,
  )
  const [userMenuSurface, setUserMenuSurface] = useState<'topbar' | 'sidebar' | null>(null)

  // Workspace data
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [myWork, setMyWork] = useState<MyWorkPayload | null>(null)
  const [programSummary, setProgramSummary] = useState<ProgramSummaryPayload | null>(null)
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([])
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [apmsKpis, setApmsKpis] = useState<ApmsKpi[]>([])
  const [apmsConnected, setApmsConnected] = useState(false)
  const [apmsLinkedPrograms, setApmsLinkedPrograms] = useState<Record<string, { id: number; code: string; name: string }[]>>({})
  const [apmsLastFetchedAt, setApmsLastFetchedAt] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifToasts, setNotifToasts] = useState<NotificationItem[]>([])
  const dismissToast = (id: number) => setNotifToasts(prev => prev.filter(t => t.id !== id))
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  // Selection
  const LS_CHANNEL_KEY = 'atlas:lastChannelId'
  const [selectedChannelId, setSelectedChannelIdRaw] = useState<number | null>(() => {
    const saved = localStorage.getItem(LS_CHANNEL_KEY)
    return saved ? Number(saved) : null
  })
  const setSelectedChannelId: Dispatch<SetStateAction<number | null>> = (value) => {
    setSelectedChannelIdRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      if (next != null) localStorage.setItem(LS_CHANNEL_KEY, String(next))
      else localStorage.removeItem(LS_CHANNEL_KEY)
      return next
    })
  }
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState<number | null>(null)

  // Refs mirror selected IDs supaya SSE domain-event listener (yang berada di
  // useEffect stabil tanpa dependency lengkap) bisa membaca ID yang paling
  // mutakhir saat user pindah halaman, tanpa perlu re-subscribe SSE tiap navigate.
  const selectedProgramIdRef = useRef<number | null>(null)
  const selectedTaskIdRef = useRef<number | null>(null)
  const selectedWorkstreamIdRef = useRef<number | null>(null)
  useEffect(() => { selectedProgramIdRef.current = selectedProgramId }, [selectedProgramId])
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId }, [selectedTaskId])
  useEffect(() => { selectedWorkstreamIdRef.current = selectedWorkstreamId }, [selectedWorkstreamId])

  // Detail data
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([])
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [threadParent, setThreadParent] = useState<ChannelMessage | null>(null)
  const [threadReplies, setThreadReplies] = useState<ChannelMessage[]>([])
  // Typing indicators: channelId → list of users currently typing
  const [typingUsers, setTypingUsers] = useState<Record<number, { userId: number; userName: string }[]>>({})
  // Per-user auto-clear timers: "channelId:userId" → timer handle
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Debounce timer for marking active channel as read when SSE messages arrive
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const domainRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [programDetail, setProgramDetail] = useState<ProgramDetail | null>(null)
  const [workstreamDetail, setWorkstreamDetail] = useState<WorkstreamDetail | null>(null)
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null)
  const [meetingRefreshKey, setMeetingRefreshKey] = useState(0)
  const [gridRefreshTick, setGridRefreshTick] = useState(0)
  const [assignmentRefreshTick, setAssignmentRefreshTick] = useState(0)

  // Status
  const [channelStatus, setChannelStatus] = useState({ loading: false, message: null as string | null })
  const [programDetailStatus, setProgramDetailStatus] = useState({ loading: false, message: null as string | null })
  const [taskDetailStatus, setTaskDetailStatus] = useState({ loading: false, message: null as string | null })
  const [workstreamDetailStatus, setWorkstreamDetailStatus] = useState({ loading: false, message: null as string | null })
  const [overviewStatus, setOverviewStatus] = useState<OverviewStatus>({ loading: true, refreshing: false, message: null })
  const [boardStatus, setBoardStatus] = useState({ saving: false, message: null as string | null })
  const [taskActionStatus, setTaskActionStatus] = useState({ saving: false, message: null as string | null })
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null)
  const [currentTimeTick, setCurrentTimeTick] = useState(Date.now())

  // Board / drag
  const [dragState, setDragState] = useState({ itemId: null as number | null, overStatus: null as string | null })
  // Board navigation intent — set by openTaskWorkspace, consumed once by WorkboardView
  const [boardOnOpen, setBoardOnOpen] = useState<{ forceShowAll: boolean; filterProgramId: number | null } | null>(null)
  const clearBoardOnOpen = () => setBoardOnOpen(null)

  // Presence draft — initialised from the current user's real status once presence loads
  const [presenceDraft, setPresenceDraft] = useState({
    status: 'ONLINE' as PresenceStatus,
    statusEmoji: '',
    statusMessage: '',
  })
  const presenceDraftSyncedRef = useRef(false)
  // Ref mirror so heartbeat closure can read latest manual status without re-subscribing
  const presenceDraftRef = useRef(presenceDraft)
  useEffect(() => { presenceDraftRef.current = presenceDraft }, [presenceDraft])

  // Search
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // ── Derived ──────────────────────────────────────────────
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  )
  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  )
  const totalUnreadChannels = useMemo(
    () => channels.reduce((sum, c) => sum + c.unreadCount, 0),
    [channels],
  )

  const formatCountdown = (target: number | null) => {
    if (!target) return 'Auto-refresh scheduled'
    const rem = Math.max(0, target - currentTimeTick)
    const s = Math.floor(rem / 1000)
    const m = Math.floor(s / 60)
    return `Auto-refresh ${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  const liveStatusLabel = useMemo(() => {
    if (overviewStatus.loading && !dashboard) return 'Menyiapkan workspace'
    if (overviewStatus.refreshing) return 'Menyegarkan data'
    return formatCountdown(nextRefreshAt)
  }, [currentTimeTick, dashboard, nextRefreshAt, overviewStatus.loading, overviewStatus.refreshing])

  const topbarSyncLabel = useMemo(() => {
    if (!lastSyncedAt) return 'Belum ada sinkronisasi'
    return `Tersinkron ${formatDate(lastSyncedAt)}`
  }, [lastSyncedAt])

  // ── Auth helpers ─────────────────────────────────────────
  const closeUserMenu = () => setUserMenuSurface(null)
  const toggleUserMenu = (surface: 'topbar' | 'sidebar') => {
    setUserMenuSurface((cur) => (cur === surface ? null : surface))
  }

  const resetWorkspaceState = () => {
    // Clear all pending typing indicator timers
    typingTimersRef.current.forEach((t) => clearTimeout(t))
    typingTimersRef.current.clear()

    setDashboard(null); setMyWork(null); setProgramSummary(null); setChannels([]); setPrograms([]); setWorkGroups([])
    setKpis([]); setApmsKpis([]); setApmsConnected(false); setApmsLinkedPrograms({}); setBlockers([]); setPresence([]); setNotifications([])
    setSavedSearches([]); setSystemStatus(null); setSearchResults([])
    setSearchTotal(0); setSelectedChannelId(null); setSelectedThreadId(null)
    setSelectedProgramId(null); setSelectedTaskId(null); setSelectedWorkstreamId(null)
    setChannelMembers([]); setMessages([]); setThreadParent(null); setThreadReplies([])
    setProgramDetail(null); setWorkstreamDetail(null); setTaskDetail(null)
    setLastSyncedAt(null); setNextRefreshAt(null)
    setOverviewStatus({ loading: false, refreshing: false, message: null })
  }

  const signOutToEntry = (message?: string) => {
    sessionStorage.clear()
    resetWorkspaceState()
    setCurrentUser(null)
    setAuthStatus('signed_out')
    setAuthError(null)
    setAuthMessage(message ?? 'Sesi berakhir. Silakan masuk kembali.')
    setAuthForm((cur) => ({ ...cur, password: '' }))
    navigate('/login')
  }

  // ── Auth effects ─────────────────────────────────────────
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError('Silakan gunakan halaman login utama.')
    window.location.assign('/login')
  }

  const handleForgotPassword = async () => {
    if (!authForm.identifier.trim()) {
      setAuthError('Masukkan NIK atau User ID terlebih dahulu.')
      return
    }
    setAuthError(null)
    setAuthMessage('Reset kata sandi belum tersedia di aplikasi Laravel.')
  }

  const requestLogout = () => setLogoutPending(true)
  const cancelLogout = () => setLogoutPending(false)

  const handleLogout = async () => {
    setLogoutPending(false)
    setAuthStatus('logging_out')
    try { await api.post('/logout', {}) } catch { /* always clear */ }
    // Wait for the app-shell exit animation (~300ms) before unmounting
    setTimeout(() => signOutToEntry('You have been signed out.'), 400)
  }

  // ── Data loading ─────────────────────────────────────────
  const loadOverview = useEffectEvent(async (mode: 'initial' | 'refresh' = 'refresh') => {
    setOverviewStatus({ loading: mode === 'initial', refreshing: mode === 'refresh', message: null })

    try {
      const results = await Promise.allSettled([
        api.get<DashboardApiPayload>('/dashboard'),
        api.get<CollectionResponse<ChannelSummary>>('/channels'),
        api.get<CollectionResponse<Program>>('/programs'),
        api.get<TasksResponse>('/tasks'),
        api.get<CollectionResponse<Kpi>>('/kpis'),
        api.get<CollectionResponse<Blocker>>('/blockers'),
        api.get<{ users: PresenceUser[] }>('/users/presence'),
        api.get<NotificationsResponse>('/notifications?read=all'),
        api.get<{ data: SavedSearch[] }>('/search/saved'),
        api.get<SystemStatus>('/system/status'),
        api.get<{ data: MyWorkPayload }>('/my-work'),
        api.get<ApmsKpiResponse>('/apms/kpi'),
        api.get<ProgramSummaryPayload>('/organization/program-summary'),
      ])

      const [dashR, chR, progR, wiR, kpiR, blkR, presR, notifR, ssR, sysR, mwR, apmsR, psR] = results

      if (dashR.status === 'fulfilled') setDashboard(normalizeDashboardPayload(dashR.value))
      if (mwR.status === 'fulfilled') setMyWork(mwR.value.data)
      if (psR.status === 'fulfilled') setProgramSummary(psR.value)
      if (chR.status === 'fulfilled') {
        const loadedChannels = chR.value.data
        // Override unreadCount to 0 for the currently open channel — user is actively watching it
        const patched = loadedChannels.map((c) =>
          c.id === selectedChannelId ? { ...c, unreadCount: 0 } : c
        )
        setChannels(patched)
        setSelectedChannelId((cur) => {
          // Validate saved/current channel still exists in the list
          if (cur != null && loadedChannels.some((c) => c.id === cur)) return cur
          // Fall back to first channel
          return loadedChannels[0]?.id ?? null
        })
      }
      if (progR.status === 'fulfilled') {
        setPrograms(progR.value.data)
      }
      if (wiR.status === 'fulfilled') {
        setWorkGroups(wiR.value.groups)
      }
      if (kpiR.status === 'fulfilled') setKpis(kpiR.value.data)
      if (apmsR.status === 'fulfilled') {
        setApmsKpis(apmsR.value.data)
        setApmsConnected(apmsR.value.meta.connected)
        setApmsLinkedPrograms(apmsR.value.linkedPrograms ?? {})
        setApmsLastFetchedAt(new Date().toISOString())
      }
      if (blkR.status === 'fulfilled') setBlockers(blkR.value.data)
      if (presR.status === 'fulfilled') setPresence(presR.value.users)
      if (notifR.status === 'fulfilled') setNotifications(notifR.value.notifications)
      if (ssR.status === 'fulfilled') setSavedSearches(ssR.value.data)
      if (sysR.status === 'fulfilled') setSystemStatus(sysR.value)

      const hasCoreData = dashR.status === 'fulfilled' || psR.status === 'fulfilled' || progR.status === 'fulfilled'
      const failedCount = results.filter((result) => result.status === 'rejected').length
      const syncedAt = Date.now()
      if (hasCoreData) {
        setLastSyncedAt(new Date(syncedAt).toISOString())
        setNextRefreshAt(syncedAt + 5 * 60 * 1000)
      }
      setOverviewStatus({
        loading: false,
        refreshing: false,
        message: failedCount > 0 && !hasCoreData
          ? 'Sebagian data workspace gagal dimuat. Coba refresh halaman.'
          : null,
      })
    } catch {
      setOverviewStatus({ loading: false, refreshing: false, message: 'Workspace gagal dimuat. Coba refresh halaman.' })
    } finally {
      setOverviewStatus((cur) => ({ ...cur, loading: false, refreshing: false }))
    }
  })

  const refreshChannel = useEffectEvent(async (
    channelId: number,
    threadId?: number | null,
    silent = false,
  ) => {
    if (!silent) setChannelStatus({ loading: true, message: null })
    try {
      const [detail, msgs] = await Promise.all([
        api.get<ChannelDetailResponse>(`/channels/${channelId}`),
        api.get<{ data: ChannelMessage[]; total: number }>(
          `/channels/${channelId}/messages?limit=40&offset=0&includeThreads=true`,
        ),
      ])
      setChannelMembers(detail.members)
      setMessages(msgs.data ?? [])
      const resolvedThread = threadId ?? selectedThreadId
      if (resolvedThread) {
        const threadData = await api.get<{ data: { parent: ChannelMessage; replies: ChannelMessage[] } }>(
          `/channels/${channelId}/messages/${resolvedThread}/thread`,
        )
        setThreadParent(threadData.data?.parent ?? null)
        setThreadReplies(threadData.data?.replies ?? [])
      } else {
        setThreadParent(null)
        setThreadReplies([])
      }
      if (!silent) setChannelStatus({ loading: false, message: null })
      setLastSyncedAt(new Date().toISOString())
    } catch {
      if (!silent) setChannelStatus({ loading: false, message: 'Channel tidak dapat dimuat.' })
    }
  })

  const loadProgramDetail = useEffectEvent(async (programId: number, silent = false) => {
    if (!silent) setProgramDetailStatus({ loading: true, message: null })
    try {
      const payload = await api.get<ProgramDetailResponse>(`/programs/${programId}`)
      setProgramDetail(payload.data)
      setSelectedWorkstreamId((cur) => {
        if (cur && payload.data.workstreams?.some((i) => i.id === cur)) return cur
        return payload.data.workstreams?.[0]?.id ?? null
      })
      if (!silent) setProgramDetailStatus({ loading: false, message: null })
      setLastSyncedAt(new Date().toISOString())
    } catch {
      if (!silent) setProgramDetailStatus({ loading: false, message: 'Program detail tidak dapat dimuat.' })
    }
  })

  const loadWorkstreamDetail = useEffectEvent(async (workstreamId: number, silent = false) => {
    if (!silent) setWorkstreamDetailStatus({ loading: true, message: null })
    try {
      const payload = await api.get<WorkstreamDetailResponse>(`/workstreams/${workstreamId}`)
      setWorkstreamDetail(payload.data)
      if (!silent) setWorkstreamDetailStatus({ loading: false, message: null })
      setLastSyncedAt(new Date().toISOString())
    } catch {
      if (!silent) setWorkstreamDetailStatus({ loading: false, message: 'Detail workstream tidak dapat dimuat.' })
    }
  })

  const loadTaskDetail = useEffectEvent(async (taskId: number, silent = false) => {
    if (!silent) setTaskDetailStatus({ loading: true, message: null })
    try {
      const payload = await api.get<TaskDetailResponse>(`/tasks/${taskId}`)
      setTaskDetail(payload.data)
      if (!silent) setTaskDetailStatus({ loading: false, message: null })
      setLastSyncedAt(new Date().toISOString())
    } catch {
      if (!silent) setTaskDetailStatus({ loading: false, message: 'Tugas tidak dapat dimuat.' })
    }
  })

  const runSearch = useEffectEvent(async (searchQuery: string, type = 'ALL') => {
    if (!searchQuery.trim()) {
      setSearchResults([]); setSearchTotal(0); setSearchError(null); return
    }
    setSearching(true); setSearchError(null)
    try {
      const payload = await api.get<{ results: SearchResult[]; total: number }>(
        `/search?q=${encodeURIComponent(searchQuery)}&type=${type}&limit=24&offset=0`,
      )
      setSearchResults(payload.results)
      setSearchTotal(payload.total)
    } catch {
      setSearchResults([]); setSearchTotal(0); setSearchError('Search tidak tersedia saat ini.')
    } finally {
      setSearching(false)
    }
  })

  // ── Actions ───────────────────────────────────────────────
  const handleReact = async (messageId: number) => {
    if (!selectedChannelId) return
    try {
      await api.post(`/channels/${selectedChannelId}/messages/${messageId}/reactions`, { emoji: ':thumbsup:' })
      await refreshChannel(selectedChannelId, selectedThreadId)
    } catch {
      setChannelStatus({ loading: false, message: 'Reaction gagal disimpan.' })
    }
  }

  const markNotificationRead = async (notificationId: number) => {
    // Optimistic update — tanpa loadOverview heavy refetch
    const now = new Date().toISOString()
    setNotifications(prev => prev.map(n =>
      n.id === notificationId && n.state === 'UNREAD'
        ? { ...n, state: 'READ' as const, readAt: now }
        : n,
    ))
    setNotifToasts(prev => prev.filter(t => t.id !== notificationId))
    try {
      await api.put(`/notifications/${notificationId}/read`)
    } catch {
      // Server gagal — re-sync state dari server
      await loadOverview('refresh')
      setOverviewStatus((cur) => ({ ...cur, message: 'Notifikasi gagal diperbarui.' }))
    }
  }

  const dismissNotification = async (notificationId: number) => {
    // Optimistic update
    const now = new Date().toISOString()
    setNotifications(prev => prev.map(n =>
      n.id === notificationId
        ? { ...n, state: 'DISMISSED' as const, dismissedAt: now }
        : n,
    ))
    setNotifToasts(prev => prev.filter(t => t.id !== notificationId))
    try {
      await api.put(`/notifications/${notificationId}/dismiss`)
    } catch {
      await loadOverview('refresh')
      setOverviewStatus((cur) => ({ ...cur, message: 'Notifikasi gagal disembunyikan.' }))
    }
  }

  const handleStatusUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await api.put('/users/me/status', presenceDraft)
      // Presence list is updated via the 'presence:updated' SSE broadcast from the server.
      // No need to call loadOverview — that would race with the SSE event and cause a flicker.
      setOverviewStatus((cur) => ({ ...cur, message: 'Status berhasil diperbarui.' }))
    } catch {
      setOverviewStatus((cur) => ({ ...cur, message: 'Status gagal diperbarui.' }))
    }
  }

  const moveTaskToGroup = (groups: WorkGroup[], taskId: number, targetStatus: string): WorkGroup[] => {
    let movedItem: Task | null = null
    const stripped = groups.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.id === taskId) { movedItem = item; return false }
        return true
      }),
    }))
    if (!movedItem) return groups
    const moved = movedItem as Task
    return stripped.map((g) => {
      if (g.status !== targetStatus) return { ...g, count: g.items.length }
      const optimistic: Task = {
        ...moved,
        status: targetStatus,
        percentComplete: targetStatus === 'COMPLETED' ? 100 : moved.percentComplete,
        isBlocked: targetStatus === 'BLOCKED' ? true : moved.isBlocked,
      }
      return { ...g, items: [optimistic, ...g.items], count: g.items.length + 1 }
    })
  }

  const handleTaskDragStart = (taskId: number) => {
    setDragState({ itemId: taskId, overStatus: null })
    setBoardStatus((cur) => ({ ...cur, message: null }))
  }

  const handleTaskDrop = async (targetStatus: string, options?: { note?: string; blockedReason?: string }) => {
    if (!dragState.itemId) return
    const dragged = workGroups.flatMap((g) => g.items).find((i) => i.id === dragState.itemId)
    if (!dragged || dragged.status === targetStatus) {
      setDragState({ itemId: null, overStatus: null }); return
    }
    // Auto-set progress to 100 when moved to Completed
    const autoComplete = targetStatus === 'COMPLETED' && dragged.percentComplete < 100
    const prevGroups = workGroups
    setBoardStatus({ saving: true, message: `Moving ${dragged.code} to ${formatStatusLabel(targetStatus)}…` })
    setWorkGroups((cur) => moveTaskToGroup(cur, dragState.itemId!, targetStatus))
    setDragState({ itemId: null, overStatus: null })
    try {
      const body: Record<string, unknown> = { status: targetStatus }
      if (autoComplete) body.percentComplete = 100
      if (options?.note)          body.note = options.note
      if (options?.blockedReason) body.blockedReason = options.blockedReason
      await api.put(`/tasks/${dragged.id}/status`, body)
      await Promise.all([
        loadOverview('refresh'),
        selectedTaskId === dragged.id ? loadTaskDetail(dragged.id) : Promise.resolve(),
      ])
      setBoardStatus({ saving: false, message: `${dragged.code} dipindah ke ${formatStatusLabel(targetStatus)}.` })
    } catch (err) {
      setWorkGroups(prevGroups)
      const serverMessage = extractErrorMessage(err, '')
      setBoardStatus({
        saving: false,
        message: serverMessage
          ? `failed: ${serverMessage}`
          : `failed: gagal memindah ${dragged.code}.`,
      })
    }
  }

  const openProgramWorkspace = (programId: number) => {
    setSelectedProgramId(programId)
    navigate('/programs')
  }
  const openWorkstreamWorkspace = (workstreamId: number) => {
    setSelectedWorkstreamId(workstreamId)
    navigate('/programs')
  }
  const openTaskWorkspace = (taskId: number) => {
    setSelectedTaskId(taskId)
    setSelectedWorkstreamId(null)                         // Fix 3: clear stale workstream panel

    // Fix 1 & 2: determine program context + whether item belongs to current user
    const item = workGroups.flatMap(g => g.items).find(i => i.id === taskId)
    const programId = item?.workstream?.program?.id ?? null
    const assignedToCurrentUser = item?.assignee?.id === currentUser?.id
    setBoardOnOpen({
      forceShowAll: !assignedToCurrentUser,               // Fix 1: expose non-owned items
      filterProgramId: programId,                         // Fix 2: auto-filter to this program
    })

    navigate('/execution')
  }

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    const user = toWorkspaceUser(inertiaUser)
    setCurrentUser(user)
    setAuthStatus(user ? 'signed_in' : 'signed_out')
    if (user) {
      setAuthForm((cur) => ({
        ...cur,
        identifier: cur.identifier || user.email,
        password: '',
      }))
      setAuthError(null)
      setAuthMessage(null)
    }
  }, [inertiaUser])

  useEffect(() => {
    window.localStorage.setItem('atlas-nav-collapsed', navRailCollapsed ? 'true' : 'false')
  }, [navRailCollapsed])

  useEffect(() => {
    if (authStatus !== 'signed_in') return
    const timer = window.setInterval(() => setCurrentTimeTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [authStatus])

  useEffect(() => {
    const handleExpired = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { message?: string } | undefined) : undefined
      signOutToEntry(detail?.message ?? 'Sesi berakhir. Silakan masuk kembali.')
    }
    window.addEventListener(sessionStorage.eventName, handleExpired)
    return () => window.removeEventListener(sessionStorage.eventName, handleExpired)
  }, [])

  useEffect(() => {
    if (authStatus !== 'signed_in') return
    void loadOverview('initial')
  }, [authStatus])

  useEffect(() => {
    // Clear message-related state when no channel selected (prevents stale messages leaking)
    if (!selectedChannelId) {
      setMessages([])
      setChannelMembers([])
      setThreadParent(null)
      setThreadReplies([])
      setChannelStatus({ loading: false, message: null })
      return
    }
    // Always flush stale thread data when switching channels so the thread panel never shows old content
    setThreadParent(null)
    setThreadReplies([])
    if (authStatus !== 'signed_in') return
    // Wait until overview has loaded so selectedChannelId has been validated against the channels list
    if (overviewStatus.loading) return
    void refreshChannel(selectedChannelId)
  }, [authStatus, selectedChannelId, overviewStatus.loading])

  useEffect(() => {
    if (authStatus !== 'signed_in' || !selectedChannelId || !selectedThreadId) return
    void refreshChannel(selectedChannelId, selectedThreadId)
  }, [authStatus, selectedChannelId, selectedThreadId])

  // Auto-mark-read: semua notif MENTION/DM_RECEIVED terkait channel yang sedang terbuka
  useEffect(() => {
    if (!selectedChannelId || authStatus !== 'signed_in') return
    const channelSource = `channel:${selectedChannelId}`
    const unread = notifications.filter(
      n => n.state === 'UNREAD' && n.source.includes(channelSource),
    )
    if (unread.length === 0) return
    // Mark satu per satu tanpa re-fetch berat — update state lokal langsung
    void Promise.all(
      unread.map(n =>
        api.put(`/notifications/${n.id}/read`).catch(() => {}),
      ),
    ).then(() => {
      setNotifications(prev =>
        prev.map(n =>
          n.state === 'UNREAD' && n.source.includes(channelSource)
            ? { ...n, state: 'READ' as const }
            : n,
        ),
      )
      setNotifToasts(prev => prev.filter(t => !t.source.includes(channelSource)))
    })
  }, [selectedChannelId, authStatus])

  useEffect(() => {
    if (authStatus !== 'signed_in' || !selectedProgramId) return
    void loadProgramDetail(selectedProgramId)
  }, [authStatus, selectedProgramId])

  useEffect(() => {
    if (authStatus !== 'signed_in' || !selectedTaskId) return
    void loadTaskDetail(selectedTaskId)
  }, [authStatus, selectedTaskId])

  useEffect(() => {
    if (authStatus !== 'signed_in' || !selectedWorkstreamId) return
    void loadWorkstreamDetail(selectedWorkstreamId)
  }, [authStatus, selectedWorkstreamId])

  useEffect(() => {
    if (authStatus !== 'signed_in') return
    const timer = window.setInterval(() => void loadOverview('refresh'), 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [authStatus])

  // Realtime SSE
  const handleRealtimeSnapshot = useEffectEvent((snapshot: RealtimeSnapshot) => {
    setChannels(snapshot.channels)
    setPresence(snapshot.presence)
    setNotifications(snapshot.notifications.notifications)
    setLastSyncedAt(snapshot.generatedAt)
    // Messages are now delivered via channel:* events — no full refresh needed here
  })

  // ── Channel message event handlers ───────────────────────
  const handleMessageCreated = useEffectEvent((event: { channelId: number; message: ChannelMessage & { author?: { name?: string; roleType?: string } } }) => {
    // Normalize: backend sends author relationship, frontend uses authorName/authorRole
    const msg: ChannelMessage = {
      ...event.message,
      reactions: event.message.reactions ?? {},
      authorName: event.message.authorName ?? event.message.author?.name,
      authorRole: event.message.authorRole ?? event.message.author?.roleType,
    }

    // "Viewing" hanya berlaku kalau user benar-benar di halaman /channels DAN tab visible.
    // selectedChannelId persist antar route, jadi kalau user pindah ke /home tapi
    // selectedChannelId masih nilai lama, kita TIDAK boleh menganggapnya viewing.
    const onChannelsPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/channels')
    const tabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
    const isViewing = onChannelsPage && tabVisible && event.channelId === selectedChannelId
    const isOwnMessage = currentUser != null && msg.userId === currentUser.id

    // Clear typing indicator for the sender — message arrived, they're not "still typing".
    // Tanpa ini, indicator stay sampai 5s timer auto-clear-nya habis.
    const typingKey = `${event.channelId}:${msg.userId}`
    const typingTimer = typingTimersRef.current.get(typingKey)
    if (typingTimer) {
      clearTimeout(typingTimer)
      typingTimersRef.current.delete(typingKey)
    }
    setTypingUsers((prev) => {
      const current = prev[event.channelId]
      if (!current?.some((u) => u.userId === msg.userId)) return prev
      const next = current.filter((u) => u.userId !== msg.userId)
      if (next.length === 0) {
        const { [event.channelId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [event.channelId]: next }
    })

    // Always update sidebar — bump unread when not viewing & not own message
    setChannels((prev) => prev.map((c) =>
      c.id === event.channelId
        ? {
            ...c,
            unreadCount: isViewing || isOwnMessage ? c.unreadCount : c.unreadCount + 1,
            lastMessage: {
              id: event.message.id,
              userId: event.message.userId,
              content: event.message.content,
              createdAt: event.message.createdAt,
              isDeletedForEveryone: event.message.isDeletedForEveryone,
            },
          }
        : c
    ))

    if (!isViewing) return

    setMessages((prev) => {
      // Deduplicate: skip if a message with same id already exists
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
    // Keep lastViewedAt fresh so periodic loadOverview doesn't re-inflate unreadCount
    // Debounced: fire once after 2s of no new messages (not on every single message)
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current)
    markReadTimerRef.current = setTimeout(() => {
      void api.put(`/channels/${event.channelId}/read`).catch(() => {})
    }, 2000)
  })

  const handleMessageDeleted = useEffectEvent((event: { channelId: number; messageId: number; parentMessageId?: number; newReplyCount?: number }) => {
    if (event.channelId !== selectedChannelId) return
    setMessages((prev) => prev
      .filter((m) => m.id !== event.messageId)
      .map((m) =>
        event.parentMessageId && typeof event.newReplyCount === 'number' && m.id === event.parentMessageId
          ? { ...m, replyCount: event.newReplyCount }
          : m
      ))
    setThreadReplies((prev) => prev.filter((r) => r.id !== event.messageId))
    if (event.parentMessageId && typeof event.newReplyCount === 'number') {
      const newReplyCount = event.newReplyCount
      setThreadParent((prev) =>
        prev && prev.id === event.parentMessageId
          ? { ...prev, replyCount: newReplyCount }
          : prev
      )
    }
    if (threadParent?.id === event.messageId || selectedThreadId === event.messageId) {
      setThreadParent(null)
      setThreadReplies([])
      setSelectedThreadId(null)
    }
  })

  const handleReactionChanged = useEffectEvent((event: { channelId: number; messageId: number; reactions: Record<string, number[]> }) => {
    if (event.channelId !== selectedChannelId) return
    const patch = (m: ChannelMessage) => m.id === event.messageId ? { ...m, reactions: event.reactions } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    if (threadParent?.id === event.messageId) setThreadParent((p) => p ? { ...p, reactions: event.reactions } : p)
  })

  const handleThreadReply = useEffectEvent((event: { channelId: number; parentId: number; reply: ChannelMessage; newReplyCount: number }) => {
    if (event.channelId !== selectedChannelId) return
    // Use authoritative newReplyCount from server — avoids double-increment
    // (optimistic +1 in wrapper is overwritten with the definitive value)
    setMessages((prev) => prev.map((m) =>
      m.id === event.parentId ? { ...m, replyCount: event.newReplyCount } : m
    ))
    // If this thread is currently open, append the reply
    if (selectedThreadId === event.parentId) {
      setThreadReplies((prev) => {
        if (prev.some((r) => r.id === event.reply.id)) return prev
        return [...prev, event.reply]
      })
    }
  })

  const handleMessageUpdated = useEffectEvent((event: { channelId: number; message: ChannelMessage & { author?: { name?: string; roleType?: string } } }) => {
    const msg: ChannelMessage = {
      ...event.message,
      reactions: event.message.reactions ?? {},
      authorName: event.message.authorName ?? event.message.author?.name,
      authorRole: event.message.authorRole ?? event.message.author?.roleType,
    }
    setChannels((prev) => prev.map((channel) => {
      if (channel.id !== event.channelId || channel.lastMessage?.id !== msg.id) {
        return channel
      }
      return {
        ...channel,
        lastMessage: {
          id: msg.id,
          userId: msg.userId,
          content: msg.content,
          createdAt: msg.createdAt,
          isDeletedForEveryone: msg.isDeletedForEveryone,
        },
      }
    }))

    if (event.channelId !== selectedChannelId) return
    const patch = (m: ChannelMessage) => m.id === msg.id ? { ...m, ...msg } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    if (threadParent?.id === msg.id) setThreadParent((p) => p ? { ...p, ...msg } : p)
  })

  const handleMessagePinned = useEffectEvent((event: { channelId: number; messageId: number; isPinned: boolean }) => {
    if (event.channelId !== selectedChannelId) return
    const patch = (m: ChannelMessage) => m.id === event.messageId ? { ...m, isPinned: event.isPinned } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    if (threadParent?.id === event.messageId) {
      setThreadParent((prev) => prev ? { ...prev, isPinned: event.isPinned } : prev)
    }
  })

  const handleChannelCreated = useEffectEvent((event: { channel: ChannelSummary }) => {
    setChannels((prev) => {
      if (prev.some((c) => c.id === event.channel.id)) return prev
      const isDm = event.channel.isDirectMessage ?? /^dm-\d+-\d+$/.test(event.channel.name ?? '')
      return [...prev, {
        ...event.channel,
        unreadCount: event.channel.unreadCount ?? 0,
        memberCount: event.channel.memberCount ?? (isDm ? 2 : 1),
        isStarred: event.channel.isStarred ?? false,
        canManageMembers: event.channel.canManageMembers ?? false,
        isDirectMessage: isDm,
      }]
    })
  })

  const handleChannelUpdated = useEffectEvent((event: { channel: ChannelSummary }) => {
    setChannels((prev) => prev.map((c) =>
      c.id === event.channel.id ? { ...c, ...event.channel } : c
    ))
  })

  const handleChannelArchived = useEffectEvent((event: { channelId: number }) => {
    setChannels((prev) => prev.filter((c) => c.id !== event.channelId))
    if (selectedChannelId === event.channelId) setSelectedChannelId(null)
  })

  const handleTypingStart = useEffectEvent((event: { channelId: number; userId: number; userName: string }) => {
    const key = `${event.channelId}:${event.userId}`
    // Reset auto-clear timer each time the user fires a typing event
    const existing = typingTimersRef.current.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      typingTimersRef.current.delete(key)
      setTypingUsers((prev) => {
        const current = prev[event.channelId] ?? []
        const next = current.filter((u) => u.userId !== event.userId)
        if (next.length === 0) {
          const { [event.channelId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [event.channelId]: next }
      })
    }, 5000)
    typingTimersRef.current.set(key, timer)
    setTypingUsers((prev) => {
      const current = prev[event.channelId] ?? []
      if (current.some((u) => u.userId === event.userId)) return prev
      return { ...prev, [event.channelId]: [...current, { userId: event.userId, userName: event.userName }] }
    })
  })

  const handleTypingStop = useEffectEvent((event: { channelId: number; userId: number }) => {
    const key = `${event.channelId}:${event.userId}`
    const existing = typingTimersRef.current.get(key)
    if (existing) { clearTimeout(existing); typingTimersRef.current.delete(key) }
    setTypingUsers((prev) => {
      const current = prev[event.channelId] ?? []
      const next = current.filter((u) => u.userId !== event.userId)
      if (next.length === 0) {
        const { [event.channelId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [event.channelId]: next }
    })
  })

  // Debounced typing signal — fire-and-forget, no error handling needed
  const sendTyping = useMemo(() => {
    let lastFired = 0
    return (channelId: number) => {
      const now = Date.now()
      if (now - lastFired < 2000) return
      lastFired = now
      void api.post(`/realtime/typing/${channelId}`, {})
    }
  }, [])

  // ── Realtime subscriptions ───────────────────────────────
  const scheduleDomainRefresh = useEffectEvent(() => {
    if (authStatus !== 'signed_in') return
    if (domainRefreshTimerRef.current) return
    domainRefreshTimerRef.current = setTimeout(() => {
      domainRefreshTimerRef.current = null
      void loadOverview('refresh')
      if (selectedProgramIdRef.current) void loadProgramDetail(selectedProgramIdRef.current)
      if (selectedTaskIdRef.current) void loadTaskDetail(selectedTaskIdRef.current)
      if (selectedWorkstreamIdRef.current) void loadWorkstreamDetail(selectedWorkstreamIdRef.current)
    }, 600)
  })

  const handleNotificationCreated = useEffectEvent((event: { notification: NotificationItem }) => {
    setNotifications((prev) => {
      if (prev.some((n) => n.id === event.notification.id)) return prev
      return [event.notification, ...prev]
    })
    setNotifToasts((prev) => {
      if (prev.some((n) => n.id === event.notification.id)) return prev
      const next = [event.notification, ...prev]
      return next.length > 4 ? next.slice(0, 4) : next
    })
  })

  const handlePresenceUpdated = useEffectEvent((event: { userId: number; status: string; statusEmoji?: string; statusMessage?: string; lastActivityAt: string }) => {
    setPresence((prev) => prev.map((p) => {
      if (p.userId !== event.userId) return p
      return {
        ...p,
        status: event.status as PresenceUser['status'],
        ...(event.statusEmoji !== undefined ? { statusEmoji: event.statusEmoji } : {}),
        ...(event.statusMessage !== undefined ? { statusMessage: event.statusMessage } : {}),
        lastActivityAt: event.lastActivityAt,
      }
    }))
  })

  const handlePresenceActivity = useEffectEvent((event: { userId: number; lastActivityAt: string }) => {
    setPresence((prev) => prev.map((p) =>
      p.userId === event.userId ? { ...p, lastActivityAt: event.lastActivityAt } : p
    ))
  })

  const handleDomainChanged = useEffectEvent(() => {
    scheduleDomainRefresh()
  })

  // Sprint 3 — Bridge blocker SSE event ke window event agar PicaCompositePanel
  // (dan komponen lain) bisa subscribe tanpa harus tap workspace context.
  const handleBlockerChanged = useEffectEvent((data: unknown) => {
    scheduleDomainRefresh()
    const event = realtimePayload<{ id: number; action: string }>(data)
    if (event && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('atlas:blocker:changed', { detail: event }))
    }
  })

  const handleMeetingChanged = useEffectEvent(() => {
    scheduleDomainRefresh()
    setMeetingRefreshKey((k) => k + 1)
  })

  const handleGridChanged = useEffectEvent(() => {
    scheduleDomainRefresh()
    setGridRefreshTick((k) => k + 1)
  })

  const handleAssignmentChanged = useEffectEvent(() => {
    scheduleDomainRefresh()
    setAssignmentRefreshTick((k) => k + 1)
  })

  useRealtimeEvents({
    'workspace:update': (data) => {
      const event = realtimePayload<RealtimeSnapshot>(data)
      if (event) handleRealtimeSnapshot(event)
    },
    'workspace:ready': () => setLastSyncedAt(new Date().toISOString()),
    'channel:message:created': (data) => {
      const event = realtimePayload<{ channelId: number; message: ChannelMessage }>(data)
      if (event) handleMessageCreated(event)
    },
    'channel:message:updated': (data) => {
      const event = realtimePayload<{ channelId: number; message: ChannelMessage }>(data)
      if (event) handleMessageUpdated(event)
    },
    'channel:message:deleted': (data) => {
      const event = realtimePayload<{ channelId: number; messageId: number; parentMessageId?: number; newReplyCount?: number }>(data)
      if (event) handleMessageDeleted(event)
    },
    'channel:message:pinned': (data) => {
      const event = realtimePayload<{ channelId: number; messageId: number; isPinned: boolean }>(data)
      if (event) handleMessagePinned(event)
    },
    'channel:reaction:changed': (data) => {
      const event = realtimePayload<{ channelId: number; messageId: number; reactions: Record<string, number[]> }>(data)
      if (event) handleReactionChanged(event)
    },
    'channel:thread:reply': (data) => {
      const event = realtimePayload<{ channelId: number; parentId: number; reply: ChannelMessage; newReplyCount: number }>(data)
      if (event) handleThreadReply(event)
    },
    'notification:created': (data) => {
      const event = realtimePayload<{ notification: NotificationItem }>(data)
      if (event) handleNotificationCreated(event)
    },
    'channel:channel:created': (data) => {
      const event = realtimePayload<{ channel: ChannelSummary }>(data)
      if (event) handleChannelCreated(event)
    },
    'channel:channel:updated': (data) => {
      const event = realtimePayload<{ channel: ChannelSummary }>(data)
      if (event) handleChannelUpdated(event)
    },
    'channel:channel:archived': (data) => {
      const event = realtimePayload<{ channelId: number }>(data)
      if (event) handleChannelArchived(event)
    },
    'channel:typing:start': (data) => {
      const event = realtimePayload<{ channelId: number; userId: number; userName: string }>(data)
      if (event) handleTypingStart(event)
    },
    'channel:typing:stop': (data) => {
      const event = realtimePayload<{ channelId: number; userId: number }>(data)
      if (event) handleTypingStop(event)
    },
    'presence:updated': (data) => {
      const event = realtimePayload<{ userId: number; status: string; statusEmoji?: string; statusMessage?: string; lastActivityAt: string }>(data)
      if (event) handlePresenceUpdated(event)
    },
    'presence:activity': (data) => {
      const event = realtimePayload<{ userId: number; lastActivityAt: string }>(data)
      if (event) handlePresenceActivity(event)
    },
    'program:changed': handleDomainChanged,
    'blocker:changed': handleBlockerChanged,
    'kpi:changed': handleDomainChanged,
    'risk:changed': handleDomainChanged,
    'report:changed': handleDomainChanged,
    'comment:changed': handleDomainChanged,
    'workstream:changed': handleGridChanged,
    'phase:changed': handleGridChanged,
    'task:changed': handleGridChanged,
    'subtask:changed': handleGridChanged,
    'meeting:changed': handleMeetingChanged,
    'meeting:rsvp-changed': handleMeetingChanged,
    'meeting:action-changed': handleMeetingChanged,
    'meeting:decision-changed': handleMeetingChanged,
    'assignment:changed': handleAssignmentChanged,
  })

  useEffect(() => () => {
    if (domainRefreshTimerRef.current) clearTimeout(domainRefreshTimerRef.current)
  }, [])

  // ── Sync presenceDraft with current user's actual status (once) ──────
  useEffect(() => {
    if (presenceDraftSyncedRef.current) return
    if (!currentUser || presence.length === 0) return
    const me = presence.find((p) => p.userId === currentUser.id)
    if (!me) return
    presenceDraftSyncedRef.current = true
    setPresenceDraft({
      status: me.status,
      statusEmoji: me.statusEmoji ?? '',
      statusMessage: me.statusMessage ?? '',
    })
  }, [presence, currentUser])

  // ── Activity heartbeat + idle detection ──────────────────
  // Green dot = user is GENUINELY active in ATLAS, not just logged in.
  // We track real interaction events (mouse/keyboard/scroll). If no
  // interaction for IDLE_TIMEOUT_MS we auto-set AWAY; when activity
  // resumes we restore ONLINE (unless user manually set AWAY/DND).
  useEffect(() => {
    if (authStatus !== 'signed_in') return

    const IDLE_TIMEOUT_MS  = 5 * 60_000   // 5 min inactivity → AWAY
    const PING_INTERVAL_MS = 30_000        // check every 30 s
    const HIDDEN_AWAY_MS   = 5 * 60_000   // tab hidden 5 min → AWAY

    let lastInteractionAt = Date.now()
    // true only when WE auto-set AWAY — never when user set it manually
    let autoAwayActive = false

    const ping = () => void api.post('/realtime/ping', {})

    const setAutoAway = () => {
      // Respect manual AWAY / DO_NOT_DISTURB — don't touch it
      const { status } = presenceDraftRef.current
      if (status === 'AWAY' || status === 'DO_NOT_DISTURB') return
      if (!autoAwayActive) {
        autoAwayActive = true
        void api.put('/users/me/status', { status: 'AWAY' })
      }
    }

    const restoreOnline = () => {
      if (autoAwayActive) {
        autoAwayActive = false
        void api.put('/users/me/status', { status: 'ONLINE' })
      }
      lastInteractionAt = Date.now()
    }

    // Track real user interactions
    const onActivity = () => {
      const wasIdle = autoAwayActive
      lastInteractionAt = Date.now()
      if (wasIdle) restoreOnline()
    }

    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const
    EVENTS.forEach(ev => document.addEventListener(ev, onActivity, { passive: true }))

    // Initial ping on connect
    ping()

    // Periodic idle check
    const interval = setInterval(() => {
      if (document.hidden) return
      const idleMs = Date.now() - lastInteractionAt
      if (idleMs > IDLE_TIMEOUT_MS) {
        setAutoAway()
      } else if (!autoAwayActive) {
        ping() // Only ping when actually active
      }
    }, PING_INTERVAL_MS)

    // Tab visibility
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    const onVisibility = () => {
      if (document.hidden) {
        hiddenTimer = setTimeout(setAutoAway, HIDDEN_AWAY_MS)
      } else {
        if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null }
        if (autoAwayActive) restoreOnline()
        else ping()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      if (hiddenTimer) clearTimeout(hiddenTimer)
      EVENTS.forEach(ev => document.removeEventListener(ev, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [authStatus])

  const refreshApmsKpis = useCallback(async () => {
    try {
      const res = await api.get<ApmsKpiResponse>('/apms/kpi')
      setApmsKpis(res.data)
      setApmsConnected(res.meta.connected)
      setApmsLinkedPrograms(res.linkedPrograms ?? {})
      setApmsLastFetchedAt(new Date().toISOString())
    } catch { /* silently ignore */ }
  }, [])

  // ── Context value ────────────────────────────────────────
  const value: WorkspaceContextValue = {
    authStatus, currentUser, authError, authMessage, authForm, setAuthForm,
    handleLogin, handleLogout, handleForgotPassword, signOutToEntry,
    logoutPending, requestLogout, cancelLogout,
    navRailCollapsed, setNavRailCollapsed, userMenuSurface, toggleUserMenu, closeUserMenu,
    dashboard, myWork, programSummary, channels, setChannels, programs, workGroups, setWorkGroups,
    kpis, apmsKpis, apmsConnected, apmsLinkedPrograms, apmsLastFetchedAt, refreshApmsKpis, blockers, presence, setPresence, notifications, notifToasts, dismissToast, savedSearches, systemStatus,
    selectedChannelId, setSelectedChannelId, selectedThreadId, setSelectedThreadId,
    selectedProgramId, setSelectedProgramId, selectedTaskId, setSelectedTaskId,
    selectedWorkstreamId, setSelectedWorkstreamId,
    channelMembers, messages, setMessages, threadParent, threadReplies, setThreadReplies,
    programDetail, setProgramDetail, workstreamDetail, taskDetail, setTaskDetail,
    meetingRefreshKey,
    gridRefreshTick,
    assignmentRefreshTick,
    channelStatus, setChannelStatus, programDetailStatus, setProgramDetailStatus,
    taskDetailStatus, setTaskDetailStatus, workstreamDetailStatus,
    overviewStatus, boardStatus, setBoardStatus, taskActionStatus, setTaskActionStatus,
    lastSyncedAt, currentTimeTick, dragState, setDragState,
    presenceDraft, setPresenceDraft,
    searchResults, setSearchResults, searchTotal, setSearchTotal,
    query, setQuery, searching, searchError,
    selectedChannel, selectedProgram, totalUnreadChannels,
    liveStatusLabel, topbarSyncLabel, nextRefreshAt,
    loadOverview, refreshChannel, loadProgramDetail, loadWorkstreamDetail, loadTaskDetail,
    handleReact, markNotificationRead, dismissNotification, handleTaskDragStart, handleTaskDrop,
    handleStatusUpdate, runSearch,
    openProgramWorkspace, openWorkstreamWorkspace, openTaskWorkspace,
    boardOnOpen, clearBoardOnOpen,
    typingUsers, sendTyping,
    normalizeHealthStatus, formatStatusLabel, appendComposerSnippet,
    formatDate,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
