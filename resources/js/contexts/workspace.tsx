import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { router } from '@inertiajs/react'
import { api, AUTH_EXPIRED_EVENT } from '../lib/api'
import { useAuth as useInertiaAuth } from '../hooks/useAuth'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useStableCallback } from '../hooks/useStableCallback'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'
import i18n from '../lib/i18n'
import { workStatusLabel } from '../lib/status'
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
// `data` (list flat) dihapus dari respons /tasks (audit 2026-06-11 Task 2.8) —
// duplikat persis isi groups, FE tak pernah membacanya; payload terpangkas 2×.
type TasksResponse = {
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
  /** Status request /tasks terpisah dari overviewStatus (yang agregat) — supaya
   *  Workboard bisa bedakan "gagal load" vs "sukses tapi kosong". */
  workGroupsStatus: { loading: boolean; failed: boolean }
  /** Retry terarah hanya untuk /tasks (tanpa refetch 13 request overview). */
  reloadTasks: () => Promise<void>
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
    if (seconds < 60) return i18n.t('just now')
    if (minutes < 60) return i18n.t('{{count}}m ago', { count: minutes })
    if (hours < 24) return i18n.t('{{count}}h ago', { count: hours })
    if (days < 7) return i18n.t('{{count}}d ago', { count: days })
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch {
    return dateString
  }
}

const normalizeHealthStatus = (value?: string): 'GREEN' | 'YELLOW' | 'RED' =>
  value === 'GREEN' || value === 'YELLOW' || value === 'RED' ? value : 'YELLOW'

// Delegasi ke sumber tunggal lib/status.ts (workStatusLabel) — logika title-case
// + i18n identik, dipusatkan agar tak ber-fork (lihat plan status-vocabulary).
const formatStatusLabel = (value?: string): string => workStatusLabel(value)

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
      unit: user.unit ?? undefined,
      directorate: user.directorate ?? undefined,
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
  // Status request /tasks (lihat komentar di interface): board kosong di prod
  // ternyata fetch /tasks yang gagal lalu ditelan diam oleh `track`, bukan data
  // hilang. Lacak sukses/gagal-nya supaya Workboard tak salah tampil "no match".
  const [workGroupsStatus, setWorkGroupsStatus] = useState<{ loading: boolean; failed: boolean }>({ loading: true, failed: false })
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
  // Juga dipakai untuk men-guard respons out-of-order di refreshChannel: callback
  // `.then()` (setelah await) memegang channelId saat request dimulai, jadi kita
  // bandingkan ke ref ini sebelum setState supaya pesan channel lama tidak menimpa
  // channel baru saat user ganti channel cepat. (Sync effect diletakkan SEBELUM
  // effect pemicu refreshChannel agar ref sudah mutakhir saat refresh dijalankan.)
  const selectedChannelIdRef = useRef<number | null>(null)
  useEffect(() => { selectedProgramIdRef.current = selectedProgramId }, [selectedProgramId])
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId }, [selectedTaskId])
  useEffect(() => { selectedWorkstreamIdRef.current = selectedWorkstreamId }, [selectedWorkstreamId])
  useEffect(() => { selectedChannelIdRef.current = selectedChannelId }, [selectedChannelId])

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
  // Sinyal khusus: list channel sudah ter-load + selectedChannelId tervalidasi.
  // Lebih sempit dari overviewStatus.loading — feed pesan tidak perlu menunggu
  // 12 request overview lain selesai, cukup `/channels` saja (penyebab blank ~5s).
  const [channelsLoaded, setChannelsLoaded] = useState(false)
  const sliceLoadedAtRef = useRef<Partial<Record<string, number>>>({})
  const sliceInflightRef = useRef<Partial<Record<string, Promise<boolean>>>>({})
  const [boardStatus, setBoardStatus] = useState({ saving: false, message: null as string | null })
  const [taskActionStatus, setTaskActionStatus] = useState({ saving: false, message: null as string | null })

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

  // NB (audit 2026-06-10): dulu ada ticker setInterval 1 detik (currentTimeTick)
  // yang me-re-render SELURUH provider + 32 file konsumen useWorkspace() tiap
  // detik — hanya demi label countdown "Auto-refresh MM:SS" (liveStatusLabel/
  // topbarSyncLabel/nextRefreshAt/lastSyncedAt) yang ternyata tidak pernah
  // dirender komponen mana pun. Seluruh klaster dihapus. Kalau label sejenis
  // dibutuhkan lagi: tick di KOMPONEN leaf yang menampilkannya, jangan di
  // provider ini.

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
    sliceLoadedAtRef.current = {}; sliceInflightRef.current = {}
    setOverviewStatus({ loading: false, refreshing: false, message: null })
  }

  const signOutToEntry = (message?: string) => {
    resetWorkspaceState()
    setCurrentUser(null)
    setAuthStatus('signed_out')
    setAuthError(null)
    setAuthMessage(message ?? i18n.t('Your session has expired. Please sign in again.'))
    setAuthForm((cur) => ({ ...cur, password: '' }))
    navigate('/login')
  }

  // ── Auth effects ─────────────────────────────────────────
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError(i18n.t('Please use the main login page.'))
    window.location.assign('/login')
  }

  const handleForgotPassword = async () => {
    if (!authForm.identifier.trim()) {
      setAuthError(i18n.t('Enter your NIK or User ID first.'))
      return
    }
    setAuthError(null)
    setAuthMessage(i18n.t('Password reset is not yet available in the Laravel app.'))
  }

  const requestLogout = () => setLogoutPending(true)
  const cancelLogout = () => setLogoutPending(false)

  const handleLogout = async () => {
    setLogoutPending(false)
    setAuthStatus('logging_out')
    // Pakai Inertia router: redirect ke /login di-handle in-protocol, layout
    // (RealtimeProvider, WorkspaceProvider) ter-unmount bersih saat page swap.
    // Hindari fetch + manual navigate — bisa race dengan polling yang lagi
    // in-flight, balas 401, dispatch auth-expired, lalu refresh /login berulang.
    router.post('/logout', {}, {
      onError: () => signOutToEntry(i18n.t('Logout failed. Trying a local reset.')),
    })
  }

  // ── Data loading (route-scoped — audit Task 2.3, 2026-06-11) ──────────────
  // Dulu: 13 request paralel route-agnostic per mount + tiap 5 menit — user di
  // /channels ikut menarik /tasks (endpoint terberat, root cause historis
  // thread-contention FrankenPHP). Sekarang kebutuhan slice dideklarasikan per
  // route: mount/refresh hanya mengambil slice milik route aktif + set global
  // untuk shell, dan perpindahan route menarik slice yang belum ada atau
  // kedaluwarsa (>5 menit) via listener router.on('navigate').
  type SliceKey =
    | 'dashboard' | 'channels' | 'programs' | 'workGroups' | 'kpis' | 'blockers'
    | 'presence' | 'notifications' | 'savedSearches' | 'systemStatus'
    | 'myWork' | 'apms' | 'programSummary'

  const SLICE_STALE_MS = 5 * 60 * 1000

  // Selalu dimuat — kebutuhan shell global (AppShell): badge unread Channels
  // (channels), bell notifikasi (notifications), badge sidebar Programs /
  // Workboard (programs.length / myWork.tasks.length).
  const GLOBAL_SLICES: SliceKey[] = ['channels', 'programs', 'notifications', 'myWork']

  // Kebutuhan per route — diturunkan dari peta konsumen useWorkspace() per
  // halaman (diverifikasi destructure-level, 2026-06-11). Route yang tidak
  // terdaftar = global saja (halaman tsb fetch datanya sendiri, mis.
  // Performance/Assignments/Schedule/admin).
  // NB URL ≠ nama file (legacy Indonesia): Workboard=/execution, Inbox=/fokus,
  // Assignment=/penugasan — lihat import map AppShell. Jangan tebak dari nama view.
  const ROUTE_SLICES: Array<{ test: (p: string) => boolean; slices: SliceKey[] }> = [
    { test: (p) => p === '/' || p === '/home', slices: ['programSummary'] },
    { test: (p) => p === '/fokus', slices: ['programSummary'] },
    { test: (p) => p === '/programs', slices: ['dashboard', 'apms', 'programSummary'] },
    { test: (p) => p.startsWith('/programs/'), slices: ['apms'] },
    { test: (p) => p === '/execution' || p.startsWith('/execution/'), slices: ['workGroups', 'blockers'] },
    { test: (p) => p === '/channels' || p.startsWith('/channels/'), slices: ['workGroups', 'presence'] },
    { test: (p) => p === '/goals', slices: ['dashboard', 'kpis'] },
    { test: (p) => p === '/reports', slices: ['dashboard', 'apms'] },
    { test: (p) => p === '/roadmap', slices: ['dashboard'] },
    { test: (p) => p === '/presence' || p === '/activity' || p === '/jadwal', slices: ['presence'] },
    { test: (p) => p === '/search', slices: ['savedSearches'] },
    { test: (p) => p === '/settings', slices: ['systemStatus'] },
  ]

  const neededSlicesFor = (path: string): SliceKey[] => {
    const keys = new Set<SliceKey>(GLOBAL_SLICES)
    for (const entry of ROUTE_SLICES) {
      if (entry.test(path)) entry.slices.forEach((slice) => keys.add(slice))
    }
    return [...keys]
  }

  // Satu fetcher per slice. Error ditelan per-request (mirror allSettled lama)
  // dan mengembalikan boolean sukses; hasil di-apply BEGITU resolve (tanpa
  // barrier) sehingga halaman unblock saat datanya sendiri tiba. Request
  // konkuren untuk slice yang sama di-dedupe via inflight ref.
  const fetchSlice = (key: SliceKey): Promise<boolean> => {
    const inflight = sliceInflightRef.current[key]
    if (inflight) return inflight

    const track = <T,>(p: Promise<T>, apply: (v: T) => void): Promise<boolean> =>
      p.then((v) => { apply(v); return true }).catch(() => false)

    let job: Promise<boolean>
    switch (key) {
      case 'dashboard':
        job = track(api.get<DashboardApiPayload>('/workspace/overview'), (v) => setDashboard(normalizeDashboardPayload(v)))
        break
      case 'channels':
        job = track(api.get<CollectionResponse<ChannelSummary>>('/channels'), (v) => {
          const loadedChannels = v.data
          // Override unreadCount to 0 for the currently open channel — user is actively watching it
          const patched = loadedChannels.map((c) =>
            c.id === selectedChannelId ? { ...c, unreadCount: 0 } : c
          )
          setChannels(patched)
          setSelectedChannelId((cur) => {
            // Validate saved/current channel still exists in the list
            if (cur != null && loadedChannels.some((c) => c.id === cur)) return cur
            return loadedChannels[0]?.id ?? null
          })
          // Unblock fetch pesan channel SEKARANG — jangan tunggu slice lain.
          setChannelsLoaded(true)
        })
        break
      case 'programs':
        job = track(api.get<CollectionResponse<Program>>('/programs'), (v) => setPrograms(v.data))
        break
      case 'workGroups':
        // /tasks = endpoint terberat (ratusan WorkItem × 3 relasi eager-load).
        // Timeout dinaikkan + status terpisah supaya Workboard bisa membedakan
        // gagal vs kosong (bug "board kosong diam-diam", audit 2026-06-04).
        setWorkGroupsStatus((cur) => ({ ...cur, loading: true, failed: false }))
        job = api.get<TasksResponse>('/tasks', { timeoutMs: 30_000 })
          .then((v) => { setWorkGroups(v.groups); setWorkGroupsStatus({ loading: false, failed: false }); return true })
          .catch(() => { setWorkGroupsStatus({ loading: false, failed: true }); return false })
        break
      case 'kpis':
        job = track(api.get<CollectionResponse<Kpi>>('/kpis'), (v) => setKpis(v.data))
        break
      case 'blockers':
        job = track(api.get<CollectionResponse<Blocker>>('/blockers'), (v) => setBlockers(v.data))
        break
      case 'presence':
        job = track(api.get<{ users: PresenceUser[] }>('/users/presence'), (v) => setPresence(v.users))
        break
      case 'notifications':
        job = track(api.get<NotificationsResponse>('/notifications?read=all'), (v) => setNotifications(v.notifications))
        break
      case 'savedSearches':
        job = track(api.get<{ data: SavedSearch[] }>('/search/saved'), (v) => setSavedSearches(v.data))
        break
      case 'systemStatus':
        job = track(api.get<SystemStatus>('/system/status'), (v) => setSystemStatus(v))
        break
      case 'myWork':
        job = track(api.get<{ data: MyWorkPayload }>('/my-work'), (v) => setMyWork(v.data))
        break
      case 'apms':
        job = track(api.get<ApmsKpiResponse>('/apms/kpi'), (v) => {
          setApmsKpis(v.data)
          setApmsConnected(v.meta.connected)
          setApmsLinkedPrograms(v.linkedPrograms ?? {})
          setApmsLastFetchedAt(new Date().toISOString())
        })
        break
      case 'programSummary':
        job = track(api.get<ProgramSummaryPayload>('/organization/program-summary'), (v) => setProgramSummary(v))
        break
    }

    const done = job.then((ok) => {
      if (ok) sliceLoadedAtRef.current[key] = Date.now()
      sliceInflightRef.current[key] = undefined
      return ok
    })
    sliceInflightRef.current[key] = done
    return done
  }

  const loadOverview = useStableCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    setOverviewStatus({ loading: mode === 'initial', refreshing: mode === 'refresh', message: null })

    try {
      const keys = neededSlicesFor(window.location.pathname)
      const oks = await Promise.all(keys.map((k) => fetchSlice(k)))

      // "Core" = bukti workspace hidup. programs selalu ada di set global;
      // dashboard/programSummary ikut dihitung bila route memuatnya.
      const hasCoreData = keys.some((k, i) =>
        oks[i] && (k === 'programs' || k === 'dashboard' || k === 'programSummary'))
      const failedCount = oks.filter((ok) => !ok).length
      setOverviewStatus({
        loading: false,
        refreshing: false,
        message: failedCount > 0 && !hasCoreData
          ? i18n.t('Some workspace data failed to load. Try refreshing the page.')
          : null,
      })
    } catch {
      setOverviewStatus({ loading: false, refreshing: false, message: i18n.t('Workspace failed to load. Try refreshing the page.') })
    } finally {
      setOverviewStatus((cur) => ({ ...cur, loading: false, refreshing: false }))
      // Jaring pengaman: walau `/channels` gagal, jangan biarkan gate channel
      // ter-blokir permanen (channels ∈ GLOBAL_SLICES, selalu ikut di-fetch).
      setChannelsLoaded(true)
    }
  })

  // Perpindahan route (SPA navigate): tarik slice yang baru dibutuhkan dan
  // belum pernah dimuat / sudah kedaluwarsa — tanpa memuat ulang sisanya.
  const topUpSlicesForRoute = useStableCallback((path: string) => {
    if (authStatus !== 'signed_in') return
    const now = Date.now()
    const stale = neededSlicesFor(path).filter(
      (k) => now - (sliceLoadedAtRef.current[k] ?? 0) > SLICE_STALE_MS,
    )
    if (stale.length) void Promise.all(stale.map((k) => fetchSlice(k)))
  })

  // Retry terarah untuk /tasks saja — dipakai tombol "Coba lagi" di Workboard
  // ketika fetch task gagal, tanpa memuat ulang 13 request overview lainnya.
  const reloadTasks = useStableCallback(async () => {
    setWorkGroupsStatus({ loading: true, failed: false })
    try {
      const v = await api.get<TasksResponse>('/tasks', { timeoutMs: 30_000 })
      setWorkGroups(v.groups)
      setWorkGroupsStatus({ loading: false, failed: false })
    } catch {
      setWorkGroupsStatus({ loading: false, failed: true })
    }
  })

  const refreshChannel = useStableCallback(async (
    channelId: number,
    threadId?: number | null,
    silent = false,
  ) => {
    if (!silent) setChannelStatus({ loading: true, message: null })

    // Feed pesan = elemen yang paling dilihat user. Render BEGITU `/messages`
    // tiba — jangan tunggu member list atau thread. Dulu ketiganya di-Promise.all
    // (+ thread di-await), jadi skeleton nyangkut selama request paling lambat;
    // chat "seolah kosong padahal loading". Sekarang feed prioritas, sisanya
    // menyusul non-blocking.
    // Guard race: respons yang tiba setelah user pindah channel tidak boleh
    // menimpa state channel yang sekarang aktif (lihat selectedChannelIdRef).
    const isStale = () => channelId !== selectedChannelIdRef.current

    const msgsP = api.get<{ data: ChannelMessage[]; total: number }>(
      `/channels/${channelId}/messages?limit=40&offset=0&includeThreads=true`,
    ).then((msgs) => {
      if (isStale()) return false
      setMessages(msgs.data ?? [])
      return true
    }).catch(() => false)

    // Member list hanya untuk panel anggota / add-member — boleh telat, tidak
    // memblokir feed, dan kegagalannya tidak meng-error-kan channel.
    void api.get<ChannelDetailResponse>(`/channels/${channelId}`)
      .then((detail) => { if (!isStale()) setChannelMembers(detail.members) })
      .catch(() => { /* noop — feed tetap tampil tanpa member list */ })

    // Thread (kalau ada yang terbuka) juga lepas dari jalur kritis feed.
    const resolvedThread = threadId ?? selectedThreadId
    if (resolvedThread) {
      void api.get<{ data: { parent: ChannelMessage; replies: ChannelMessage[] } }>(
        `/channels/${channelId}/messages/${resolvedThread}/thread`,
      ).then((threadData) => {
        if (isStale()) return
        setThreadParent(threadData.data?.parent ?? null)
        setThreadReplies(threadData.data?.replies ?? [])
      }).catch(() => { /* noop */ })
    } else {
      setThreadParent(null)
      setThreadReplies([])
    }

    const ok = await msgsP
    // Channel sudah berganti sementara request berjalan → biarkan refresh channel
    // aktif yang mengatur status; jangan sentuh apa pun di sini.
    if (isStale()) return
    if (!silent) setChannelStatus({ loading: false, message: ok ? null : i18n.t('Channel could not be loaded.') })
  })

  const loadProgramDetail = useStableCallback(async (programId: number, silent = false) => {
    if (!silent) setProgramDetailStatus({ loading: true, message: null })
    try {
      const payload = await api.get<ProgramDetailResponse>(`/programs/${programId}`)
      setProgramDetail(payload.data)
      setSelectedWorkstreamId((cur) => {
        if (cur && payload.data.workstreams?.some((i) => i.id === cur)) return cur
        return payload.data.workstreams?.[0]?.id ?? null
      })
      if (!silent) setProgramDetailStatus({ loading: false, message: null })
    } catch {
      if (!silent) setProgramDetailStatus({ loading: false, message: i18n.t('Program detail could not be loaded.') })
    }
  })

  const loadWorkstreamDetail = useStableCallback(async (workstreamId: number, silent = false) => {
    if (!silent) setWorkstreamDetailStatus({ loading: true, message: null })
    try {
      const payload = await api.get<WorkstreamDetailResponse>(`/workstreams/${workstreamId}`)
      setWorkstreamDetail(payload.data)
      if (!silent) setWorkstreamDetailStatus({ loading: false, message: null })
    } catch {
      if (!silent) setWorkstreamDetailStatus({ loading: false, message: i18n.t('Workstream detail could not be loaded.') })
    }
  })

  const loadTaskDetail = useStableCallback(async (taskId: number, silent = false) => {
    if (!silent) setTaskDetailStatus({ loading: true, message: null })
    try {
      const payload = await api.get<TaskDetailResponse>(`/tasks/${taskId}`)
      setTaskDetail(payload.data)
      if (!silent) setTaskDetailStatus({ loading: false, message: null })
    } catch {
      if (!silent) setTaskDetailStatus({ loading: false, message: i18n.t('Task could not be loaded.') })
    }
  })

  const runSearch = useStableCallback(async (searchQuery: string, type = 'ALL') => {
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
      setSearchResults([]); setSearchTotal(0); setSearchError(i18n.t('Search is not available right now.'))
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
      setChannelStatus({ loading: false, message: i18n.t('Failed to save reaction.') })
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
      setOverviewStatus((cur) => ({ ...cur, message: i18n.t('Failed to update notification.') }))
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
      setOverviewStatus((cur) => ({ ...cur, message: i18n.t('Failed to hide notification.') }))
    }
  }

  const handleStatusUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await api.put('/users/me/status', presenceDraft)
      // Optimistic update — sejak realtime pindah ke polling /realtime/poll
      // (lihat memory project-sse-dropped-polling-only), tanpa patch lokal user
      // akan lihat presence list "tertinggal" sampai poll cycle berikutnya (~2s).
      // Poll yang masuk kemudian akan idempoten meng-overwrite dengan data server.
      if (currentUser) {
        const nowIso = new Date().toISOString()
        const meId = currentUser.id
        setPresence(prev => prev.map(p => p.userId === meId ? { ...p, ...presenceDraft, lastActivityAt: nowIso } : p))
      }
      setOverviewStatus((cur) => ({ ...cur, message: i18n.t('Status updated.') }))
    } catch {
      setOverviewStatus((cur) => ({ ...cur, message: i18n.t('Failed to update status.') }))
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
    const handleExpired = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { message?: string } | undefined) : undefined
      signOutToEntry(detail?.message ?? 'Sesi berakhir. Silakan masuk kembali.')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [])

  useEffect(() => {
    if (authStatus !== 'signed_in') return
    void loadOverview('initial')
  }, [authStatus])

  // Top-up slice saat berpindah halaman (Inertia client-side navigation).
  useEffect(() => {
    if (authStatus !== 'signed_in') return
    return router.on('navigate', (event) => {
      const url = new URL(event.detail.page.url, window.location.origin)
      topUpSlicesForRoute(url.pathname)
    })
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
    // Tunggu list channel ter-load (selectedChannelId tervalidasi) — TAPI tidak
    // perlu menunggu seluruh batch overview. Feed pesan unblock segera setelah
    // `/channels` resolve, bukan setelah request paling lambat dari 13.
    if (!channelsLoaded) return
    void refreshChannel(selectedChannelId)
  }, [authStatus, selectedChannelId, channelsLoaded])

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
  const handleRealtimeSnapshot = useStableCallback((snapshot: RealtimeSnapshot) => {
    setChannels(snapshot.channels)
    setPresence(snapshot.presence)
    setNotifications(snapshot.notifications.notifications)
    // Messages are now delivered via channel:* events — no full refresh needed here
  })

  // ── Channel message event handlers ───────────────────────
  const handleMessageCreated = useStableCallback((event: { channelId: number; message: ChannelMessage & { author?: { name?: string; roleType?: string; avatarUrl?: string } } }) => {
    // Normalize: backend sends author relationship, frontend uses authorName/authorRole
    const msg: ChannelMessage = {
      ...event.message,
      reactions: event.message.reactions ?? {},
      authorName: event.message.authorName ?? event.message.author?.name,
      authorRole: event.message.authorRole ?? event.message.author?.roleType,
      authorAvatarUrl: event.message.authorAvatarUrl ?? event.message.author?.avatarUrl,
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

  const handleMessageDeleted = useStableCallback((event: { channelId: number; messageId: number; parentMessageId?: number; newReplyCount?: number }) => {
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

  const handleReactionChanged = useStableCallback((event: { channelId: number; messageId: number; reactions: Record<string, number[]> }) => {
    if (event.channelId !== selectedChannelId) return
    const patch = (m: ChannelMessage) => m.id === event.messageId ? { ...m, reactions: event.reactions } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    if (threadParent?.id === event.messageId) setThreadParent((p) => p ? { ...p, reactions: event.reactions } : p)
  })

  const handleThreadReply = useStableCallback((event: { channelId: number; parentId: number; reply: ChannelMessage; newReplyCount: number }) => {
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

  const handleMessageUpdated = useStableCallback((event: { channelId: number; message: ChannelMessage & { author?: { name?: string; roleType?: string; avatarUrl?: string } } }) => {
    const msg: ChannelMessage = {
      ...event.message,
      reactions: event.message.reactions ?? {},
      authorName: event.message.authorName ?? event.message.author?.name,
      authorRole: event.message.authorRole ?? event.message.author?.roleType,
      authorAvatarUrl: event.message.authorAvatarUrl ?? event.message.author?.avatarUrl,
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

  const handleMessagePinned = useStableCallback((event: { channelId: number; messageId: number; isPinned: boolean }) => {
    if (event.channelId !== selectedChannelId) return
    const patch = (m: ChannelMessage) => m.id === event.messageId ? { ...m, isPinned: event.isPinned } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    if (threadParent?.id === event.messageId) {
      setThreadParent((prev) => prev ? { ...prev, isPinned: event.isPinned } : prev)
    }
  })

  const handleChannelCreated = useStableCallback((event: { channel: ChannelSummary }) => {
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

  const handleChannelUpdated = useStableCallback((event: { channel: ChannelSummary }) => {
    setChannels((prev) => prev.map((c) =>
      c.id === event.channel.id ? { ...c, ...event.channel } : c
    ))
  })

  const handleChannelArchived = useStableCallback((event: { channelId: number }) => {
    setChannels((prev) => prev.filter((c) => c.id !== event.channelId))
    if (selectedChannelId === event.channelId) setSelectedChannelId(null)
  })

  const handleTypingStart = useStableCallback((event: { channelId: number; userId: number; userName: string }) => {
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

  const handleTypingStop = useStableCallback((event: { channelId: number; userId: number }) => {
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
  const scheduleDomainRefresh = useStableCallback(() => {
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

  const handleNotificationCreated = useStableCallback((event: { notification: NotificationItem }) => {
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

  const handlePresenceUpdated = useStableCallback((event: { userId: number; status: string; statusEmoji?: string; statusMessage?: string; lastActivityAt: string }) => {
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

  const handlePresenceActivity = useStableCallback((event: { userId: number; lastActivityAt: string }) => {
    setPresence((prev) => prev.map((p) =>
      p.userId === event.userId ? { ...p, lastActivityAt: event.lastActivityAt } : p
    ))
  })

  const handleDomainChanged = useStableCallback(() => {
    scheduleDomainRefresh()
  })

  // Sprint 3 — Bridge blocker SSE event ke window event agar PicaCompositePanel
  // (dan komponen lain) bisa subscribe tanpa harus tap workspace context.
  const handleBlockerChanged = useStableCallback((data: unknown) => {
    scheduleDomainRefresh()
    const event = realtimePayload<{ id: number; action: string }>(data)
    if (event && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('atlas:blocker:changed', { detail: event }))
    }
  })

  const handleMeetingChanged = useStableCallback(() => {
    scheduleDomainRefresh()
    setMeetingRefreshKey((k) => k + 1)
  })

  const handleGridChanged = useStableCallback(() => {
    scheduleDomainRefresh()
    setGridRefreshTick((k) => k + 1)
  })

  const handleAssignmentChanged = useStableCallback(() => {
    scheduleDomainRefresh()
    setAssignmentRefreshTick((k) => k + 1)
  })

  useRealtimeEvents({
    'workspace:update': (data) => {
      const event = realtimePayload<RealtimeSnapshot>(data)
      if (event) handleRealtimeSnapshot(event)
    },
    // 'workspace:ready' tidak butuh handler lagi — dulu hanya menstempel
    // lastSyncedAt (klaster label sync mati yang dihapus audit 2026-06-10).
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
    workGroupsStatus, reloadTasks,
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
    presenceDraft, setPresenceDraft,
    searchResults, setSearchResults, searchTotal, setSearchTotal,
    query, setQuery, searching, searchError,
    selectedChannel, selectedProgram, totalUnreadChannels,
    loadOverview, refreshChannel, loadProgramDetail, loadWorkstreamDetail, loadTaskDetail,
    handleReact, markNotificationRead, dismissNotification,
    handleStatusUpdate, runSearch,
    openProgramWorkspace, openWorkstreamWorkspace, openTaskWorkspace,
    boardOnOpen, clearBoardOnOpen,
    typingUsers, sendTyping,
    normalizeHealthStatus, formatStatusLabel, appendComposerSnippet,
    formatDate,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
