export type HealthStatus = 'GREEN' | 'YELLOW' | 'RED'
export type PresenceStatus = 'ONLINE' | 'AWAY' | 'DO_NOT_DISTURB' | 'OFFLINE'

export type UserSummary = {
  id: number
  name: string
  roleType: string
  email?: string
  avatarUrl?: string
  positionTitle?: string
  unit?: OrganizationRef
  directorate?: OrganizationRef
}

export type OrganizationRef = {
  id: number
  code: string
  name: string
}

export type ManagerSummary = {
  id: number
  userId: string
  nik?: string
  name: string
  positionTitle?: string
}

export type AuthUser = {
  id: number
  userId: string
  nik?: string
  identifierType?: 'NIK' | 'USER_ID'
  displayIdentifier?: string
  email: string
  name: string
  roleType: string
  positionTitle?: string
  avatarUrl?: string
  unit?: OrganizationRef
  directorate?: OrganizationRef
  manager?: ManagerSummary
}

export type AuthSession = {
  token: string
  user: AuthUser
}

export type AuthOption = {
  id: number
  userId: string
  nik?: string
  identifierType?: 'NIK' | 'USER_ID'
  displayIdentifier?: string
  email: string
  name: string
  roleType: string
  positionTitle?: string
  avatarUrl?: string
  unit?: OrganizationRef
  directorate?: OrganizationRef
  manager?: ManagerSummary
}

export type ChannelSummary = {
  id: number
  name: string
  type: 'PUBLIC' | 'PRIVATE'
  memberCount: number
  unreadCount: number
  isStarred: boolean
  description?: string
  linkedProgramId?: number
  linkedWorkstreamId?: number
  topicType?: string
  canManageMembers?: boolean
  isDirectMessage?: boolean
  lastMessage?: {
    id: number
    userId?: number
    content: string
    createdAt: string
    isDeletedForEveryone?: boolean
  }
}

export type ChannelMember = {
  channelId: number
  userId: number
  name: string
  roleType: string
  status?: PresenceStatus
  statusEmoji?: string
  lastViewedAt?: string
}

export type MessageReminder = {
  id: number
  channelId: number
  messageId: number
  remindAt: string
  note?: string
}

export type UnfurlData = {
  url: string
  title?: string
  description?: string
  image?: string
  favicon?: string
  siteName?: string
}

export type ChannelMessage = {
  id: number
  channelId: number
  userId: number
  content: string
  parentMessageId?: number
  replyCount: number
  reactions: Record<string, number[]>
  /** Resolved user IDs mentioned in this message — stored at creation time, immune to name changes */
  mentionedUserIds?: number[]
  isPinned: boolean
  isEdited?: boolean
  deletedForEveryoneAt?: string
  deletedForEveryoneBy?: number
  isDeletedForEveryone?: boolean
  attachments?: Array<{ url: string; name: string; type: string; size?: number }>
  createdAt: string
  updatedAt: string
  authorName?: string
  authorRole?: string
}

export type CommentItem = {
  id: number
  entityType: 'PROGRAM' | 'WORKSTREAM' | 'TASK' | 'BLOCKER'
  entityId: number
  commentText: string
  createdBy: number
  parentCommentId?: number
  replyCount: number
  reactions: Record<string, number[]>
  mentionedUserIds: number[]
  mentionChannels: string[]
  isPinned: boolean
  isEdited: boolean
  editedAt?: string
  searchableText: string
  createdAt: string
  updatedAt: string
  authorName?: string
  authorRole?: string
}

export type Kelompok = 'SCORECARD' | 'NON_SCORECARD'
export type PilarStrategis =
  | 'COLLECTING_MORE'
  | 'SPENDING_BETTER'
  | 'INNOVATIVE_FINANCING'
  | 'ENABLER'

export type Program = {
  id: number
  code: string
  name: string
  description?: string
  ownerId?: number
  ownerUnitId?: number
  status: string
  priority: string
  progressPercent: number
  riskScore: number
  strategicAlignment: number
  healthStatus: HealthStatus
  startDate: string
  targetEndDate: string
  actualEndDate: string | null
  workstreamCount: number
  linkedChannel?: { id: number; name: string }
  activityCount: number
  messageCount: number
  kpiCount?: number
  owner?: UserSummary
  picPersons?: Array<{ id: number; name: string }>
  approvalStatus?: string
  rejectionNote?: string
  submittedById?: number
  kelompok?: Kelompok | null
  pilarStrategis?: PilarStrategis | null
  progresTerkini?: string | null
  dukunganDibutuhkan?: string | null
  autoHealthComputedAt?: string | null
}

export type Task = {
  id: number
  code: string
  title: string
  description?: string | null
  output?: string | null
  status: string
  priority: string
  percentComplete: number
  healthStatus: HealthStatus
  isBlocked: boolean
  blockedReason?: string | null
  startDate?: string | null
  targetCompletion?: string
  actualCompletion?: string | null
  createdAt?: string
  updatedAt?: string
  blockerCount: number
  commentsCount: number
  createdByUnitId?: number
  workstream?: { id: number; name: string; program?: { id: number; code: string; name: string; healthStatus?: HealthStatus; approvalStatus?: string; ownerUnitId?: number; startDate?: string | null; targetEndDate?: string | null; actualEndDate?: string | null } }
  assignee?: UserSummary
}

export type ProgramDetail = {
  id: number
  code: string
  name: string
  description?: string
  strategicObjective?: string | null
  ownerId: number
  ownerUnitId?: number
  owner?: UserSummary
  status: string
  priority: string
  progressPercent: number
  strategicAlignment: number
  healthStatus: HealthStatus
  startDate: string
  targetEndDate: string
  actualEndDate?: string | null
  linkedChannelId?: number
  approvalStatus?: string
  rejectionNote?: string
  submittedById?: number
  submittedByName?: string | null
  /** Currently expected reviewer (KASUBDIV/KADIV) — only set when status is PENDING_*. */
  pendingReviewer?: { id: number; name: string; roleType: string | null; positionTitle: string | null } | null
  /** When the program entered current PENDING state — ISO datetime, only when PENDING_*. */
  pendingSinceAt?: string | null
  /** When the program transitioned to ACTIVE — ISO datetime, only when status='ACTIVE'. */
  activatedAt?: string | null
  kelompok?: Kelompok | null
  pilarStrategis?: PilarStrategis | null
  progresTerkini?: string | null
  dukunganDibutuhkan?: string | null
  autoHealthComputedAt?: string | null
  readiness?: {
    hasWorkstream: boolean
    hasTask: boolean
    hasKpi: boolean
    isReady: boolean
  }
  picPersonIds?: number[]
  picPersons?: Array<{ id: number; name: string; positionTitle: string | null }>
  comments: CommentItem[]
  activities: ActivityItem[]
  workstreams: Array<{
    id: number
    code: string
    name: string
    description?: string
    progressPercent: number
    status: string
    priority: string
    healthStatus: HealthStatus
    riskLevel: string
    targetCompletion: string
    startDate: string | null
    actualCompletion: string | null
    budgetIdr?: number | null
    budgetSpent?: number | null
    picPersonIds?: number[]
    primaryPicPersonId?: number
    picPersons?: Array<{ id: number; name: string }>
  }>
  hasNoApmsKpi?: boolean
  kpis?: Array<{
    id: number
    code: string
    name: string
    dataType?: 'NUMERIC' | 'PERCENTAGE' | 'CURRENCY' | null
    targetValue: number
    actualValue?: number | null
    warningThreshold?: number | null
    criticalThreshold?: number | null
    unitOfMeasure?: string | null
    reviewFrequency: string
    isLeadingIndicator: boolean
    isActive: boolean
    lastMeasuredDate?: string | null
  }>
}

export type WorkstreamDetail = {
  id: number
  code: string
  name: string
  description?: string
  status: string
  priority: string
  progressPercent: number
  healthStatus: HealthStatus
  tasks: Array<{
    id: number
    code: string
    title: string
    description?: string | null
    output?: string | null
    status: string
    percentComplete: number
    isBlocked?: boolean
    blockedReason?: string | null
    healthStatus?: HealthStatus | null
    priority?: string
    startDate?: string | null
    targetCompletion?: string | null
    actualCompletion?: string | null
    letterIndex?: string | null
    phaseId?: number | null
    picUnitIds?: number[] | null
    picPersons?: Array<{ id: number; name: string }>
  }>
  comments: CommentItem[]
}

export type TaskDetail = {
  id: number
  code: string
  title: string
  description?: string
  output?: string | null
  status: string
  priority: string
  percentComplete: number
  healthStatus: HealthStatus
  isBlocked: boolean
  blockedReason?: string
  targetCompletion?: string | null
  estimatedHours?: number | null
  assignee?: { id: number; name: string; positionTitle?: string } | null
  comments: CommentItem[]
  blockers: Array<{
    id: number
    code: string
    title: string
    description?: string
    status: string
    severity: string
    assignedTo?: number | null
  }>
  subTasks: Array<{
    id: number
    title: string
    status: string
    isCompleted: boolean
    dueDate?: string
  }>
  workstream?: { id: number; name: string; program?: { id: number; code: string; name: string; approvalStatus?: string; ownerId?: number | null } }
  plannedWeeks?: string[] | null
  actualWeeks?: string[] | null
  picUnitIds?: number[] | null
  picPersonIds?: number[] | null
  startDate?: string | null
  phaseId?: number | null
}

export type Kpi = {
  id: number
  code: string
  name: string
  dataType?: 'NUMERIC' | 'PERCENTAGE' | 'CURRENCY'
  targetValue: number
  actualValue?: number | null
  unitOfMeasure?: string
  metricType: string
  reviewFrequency?: string
  isLeadingIndicator: boolean
  status: HealthStatus
  trend: Array<{
    id: number
    actualValue: number
    measurementDate: string
  }>
  // APMS fields — populated when source is 'apms'
  bobot?: number
  skor?: number
  source?: 'atlas' | 'apms'
}

// Raw KPI record from AGHRIS/APMS — fields match AGHRIS API response exactly
export type ApmsKpi = {
  kode: string          // e.g. "N0030248"
  nama: string          // nama KPI
  bobot: number         // bobot dalam % (e.g. 25 = 25%)
  sasaran: number       // target value
  realisasi: number     // actual/realisasi value
  skor: number          // computed score dari AGHRIS
  bulan: number         // 1–12
  tahun: number
  status: 'approved' | 'pending' | 'read_only'
}

// Meta response dari endpoint APMS proxy
export type ApmsKpiResponse = {
  data: ApmsKpi[]
  meta: {
    tahun: number
    bulan: number
    source: 'apms'
    connected: boolean
  }
  linkedPrograms: Record<string, { id: number; code: string; name: string }[]>
}

// Junction: Program ATLAS ↔ kode KPI AGHRIS
export type ProgramKpiLink = {
  id: number
  programId: number
  apmsKpiCode: string
  note?: string | null
  apmsKpiName?: string | null
  apmsKpiBobot?: number | null
  createdAt: string
}

export type Blocker = {
  id: number
  code: string
  taskId?: number
  title: string
  severity: string
  status: string
  priority: string
  assignedTo?: number
  linkedChannelId?: number
  createdAt?: string
  updatedAt?: string
  task?: {
    id: number
    code: string
    title: string
    workstream?: {
      id: number
      name: string
      program?: { id: number; code: string; name: string; healthStatus?: HealthStatus; approvalStatus?: string }
    }
  }
}

export type PresenceUser = {
  id: number
  userId: number
  status: PresenceStatus
  statusEmoji?: string
  statusMessage?: string
  lastActivityAt: string
  user?: UserSummary
}

export type NotificationItem = {
  id: number
  type: string
  message: string
  source: string
  createdAt: string
  readAt?: string
  dismissedAt?: string
  resolvedAt?: string
  expiresAt?: string
  state: 'UNREAD' | 'READ' | 'DISMISSED'
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category?: 'ACTION' | 'COMMUNICATION' | 'RISK' | 'SYSTEM'
  requiresAction?: boolean
  actionLabel?: string
  roleImpact?: string
  impact?: string
  groupKey?: string
  entity?: {
    type: string
    id: number
  }
}

export type SystemStatus = {
  service: string
  timestamp: string
  persistence: {
    provider: 'postgresql'
    mode: 'database' | 'fallback'
    databaseUrlConfigured: boolean
    availability: 'unknown' | 'ready' | 'unavailable'
    fallbackStore: string | null
    lastError: string | null
  }
}

export type ActivityItem = {
  id: number
  entityType: string
  entityId: number
  action: string
  description?: string
  changeTimestamp: string
}

// ── Program Summary (Executive Dashboard) ────────────────────────────────────

export type ProgramHealthToneKey = 'on_track' | 'at_risk' | 'terlambat' | 'overdue' | 'selesai'

export type DivisiProgramCounts = {
  total: number
  onTrack: number
  atRisk: number
  terlambat: number
  overdue: number
  selesai: number
  draft?: number       // program belum aktif (DRAFT/PENDING)
  pctOnTrack: number
  pctAtRisk: number
  pctTerlambat: number
  pctSelesai: number
}

export type DivisiProgramSummary = DivisiProgramCounts & {
  unit: { id: number | null; name: string; code: string }
}

export type EarlyWarningProgram = {
  id: number
  code: string
  name: string
  divisi: string
  divisiName: string
  healthTone: ProgramHealthToneKey
  healthLabel: string
  targetEndDate: string | null
  daysRemaining: number | null
  progressPercent: number
  kelompok: Kelompok | null
  pilarStrategis: PilarStrategis | null
  progresTerkini: string | null
  dukunganDibutuhkan: string | null
}

export type DivisiTaskLoad = {
  kind: 'unit' | 'person'
  subjectRole: 'leader' | 'pool' | null
  unit: { id: number | null; name: string; code: string } | null
  person: { id: number; name: string; positionTitle: string | null; avatarUrl: string | null; roleType: string } | null
  head: { id: number; name: string; positionTitle: string | null; avatarUrl: string | null } | null
  isRollup: boolean
  criticalThreshold: number
  minSampleForCritical: number
  total: number
  active: number
  done: number
  blocked: number
  backlog: number
  overdue: number
  onTimeCount: number
  lateCount: number
  onTimeRate: number | null
  /** For pool members: top assigners by task count (desc, max 3). */
  assignerBreakdown: Array<{ id: number; name: string; count: number }> | null
}

export type ScorecardHealth = DivisiProgramCounts & {
  kelompok: 'SCORECARD' | 'NON_SCORECARD'
}

export type DeadlineCluster = {
  label: string
  total: number
  atRisk: number
  onTrack: number
}

export type NeedsActionItem = {
  id: number
  code: string
  name: string
  reason: string
  tag: 'approval' | 'blocker' | 'support'
  divisi: string
}

export type StagnantProgram = {
  id: number
  code: string
  name: string
  daysIdle: number
  tone: ProgramHealthToneKey
  divisi: string
}

export type BlockerSignal = {
  unitId: number | null
  code: string
  critical: number
  high: number
  medium: number
  total: number
}

export type KpiHealthPayload = {
  total: number
  red: number
  yellow: number
  green: number
  byPilar: Array<{ pilar: string; red: number; yellow: number; green: number; total: number }>
  kpiTrend?: Array<{ date: string; pctGreen: number }>
}

export type MomentumPayload = {
  programsCompletedLast30d: number
  newProgramsLast30d: number
  tasksCompletedThisWeek: number
  /** Real execution velocity: task completions per ISO week, 8 weeks oldest→newest. */
  weeklyThroughput: Array<{ weekStart: string; label: string; count: number }>
  stagnantCount: number
  activeRate: number
  stagnantPrograms: StagnantProgram[]
}

export type VelocityPayload = {
  comparedTo: string
  daysAgo: number
  total: number
  onTrack: number
  atRisk: number
  terlambat: number
  selesai: number
  byDivisi: Array<{ code: string; onTrack: number; atRisk: number }>
} | null

export type ProgramScope = {
  role: string
  level: 'portfolio' | 'directorate' | 'unit'
  name: string | null
  unitCount: number
}

export type ControlAlert = {
  id: number
  code: string
  title: string
  status: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  programId?: number | null
  programCode?: string | null
  programName?: string | null
}

export type TopBlockerProgram = {
  id: number
  name: string
  progressPercent: number
  blockerCount: number
  healthStatus: string
}

export type CheckpointItem = {
  id: number
  code: string
  title: string
  targetCompletion: string
  status: string
}

export type ProgramSummaryPayload = {
  scope: ProgramScope
  summary: DivisiProgramCounts
  byDivisi: DivisiProgramSummary[]
  taskLoad: DivisiTaskLoad[]
  scorecardHealth: ScorecardHealth[]
  deadlineClusters: DeadlineCluster[]
  needsAction: NeedsActionItem[]
  stagnation: StagnantProgram[]
  blockerSignal: BlockerSignal[]
  kpiHealth: KpiHealthPayload
  momentum: MomentumPayload
  velocity: VelocityPayload
  trendSeries: Array<{ date: string; total: number; onTrack: number; atRisk: number; terlambat: number; pctOnTrack: number }>
  programsForChart: Array<{
    id: number; code: string; name: string
    progressPercent: number; daysRemaining: number | null
    healthTone: ProgramHealthToneKey; divisi: string
    targetEndDate?: string | null
    timeElapsedPct?: number | null
    daysIdle?: number | null
    ownerName?: string | null
    priority?: string | null
    taskTotal?: number
    taskDone?: number
    progresTerkini?: string | null
    dukunganDibutuhkan?: string | null
    approvalStatus?: string | null
  }>
  controls: ControlAlert[]
  topBlockerPrograms: TopBlockerProgram[]
  checkpoints: CheckpointItem[]
  recentActivity: ActivityItem[]
}

export type DashboardPayload = {
  generatedAt: string
  summary: {
    totalPrograms: number
    activePrograms: number
    redPrograms: number
    criticalBlockers: number
    onlineUsers: number
    unreadNotifications: number
  }
  dimensions: {
    strategic: Array<{ programId: number; program: string; strategicAlignment: number; healthStatus: HealthStatus }>
    programs: Array<{ id: number; name: string; progressPercent: number; blockerCount: number; healthStatus: HealthStatus }>
    leadingIndicators: Array<{ id: number; name: string; actualValue?: number; targetValue: number; status: HealthStatus }>
    timeIntelligence: Array<{ id: number; code: string; title: string; targetCompletion: string; status: string }>
    accountability: ActivityItem[]
    controls: Array<{ id: number; code: string; title: string; status: string; severity: string }>
    performance: Array<{ id: number; name: string; score?: number; status: HealthStatus }>
    collaboration: ChannelMessage[]
  }
  recentActivity: ActivityItem[]
  mentions: ChannelMessage[]
  onlineUsers: PresenceUser[]
}

export type SearchResult = {
  type: string
  id: number
  title: string
  snippet: string
  author?: string
  createdAt: string
}

export type SavedSearch = {
  id: number
  name: string
  description?: string
  searchQuery: string
  isShared: boolean
}

export type MyWorkPayload = {
  role: string
  tasks: Task[]
  blockers: Blocker[]
  programs: Program[]
  decisions?: MyWorkDecision[]
  focusPolicy?: FocusPolicy
}

export type MyWorkDecision = {
  id: number
  code: string
  name: string
  status: string
  priority: string
  progressPercent: number
  healthStatus: HealthStatus
  approvalStatus: string
  submittedById?: number
  decisionType: 'APPROVE_PROGRAM' | 'SUBMIT_PROGRAM'
  decisionLabel: string
  decisionReason: string
  blockingLevel: 'HIGH' | 'MEDIUM'
  updatedAt?: string
}

export type FocusPolicy = {
  profile?: string
  source?: 'DEFAULT' | 'ROLE' | 'DATABASE'
  due: {
    upcomingWindowDays: number
    watchWindowDays: number
    overdueBaseScore: number
    overduePerDayScore: number
    overdueCapScore: number
    todayScore: number
    tomorrowScore: number
    upcomingScore: number
    watchScore: number
  }
  idle: {
    watchAfterDays: number
    highAfterDays: number
    criticalAfterDays: number
    watchScore: number
    highScore: number
    criticalScore: number
  }
  blockerAging: {
    watchAfterDays: number
    highAfterDays: number
    watchScore: number
    highScore: number
  }
  approval: {
    ownerScore: number
    kasubScore: number
    kadivScore: number
    highBlockingScore: number
  }
}

// ── Meeting types ──────────────────────────────────────────────────────────

export type MeetingType =
  | 'RAPAT_DIREKSI'
  | 'RAPAT_KOORDINASI'
  | 'RAPAT_DIVISI'
  | 'RAPAT_TIM'
  | 'ONE_ON_ONE'

export type MeetingStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED'
export type AttendeeRole = 'ORGANIZER' | 'REQUIRED' | 'OPTIONAL'
export type RsvpStatus = 'PENDING' | 'HADIR' | 'TIDAK_HADIR' | 'DELEGASI'

export type MeetingAttendee = {
  id: number
  meetingId: number
  userId: number
  attendeeRole: AttendeeRole
  rsvpStatus: RsvpStatus
  delegateToId?: number
  delegateNote?: string
  respondedAt?: string
  createdAt: string
  user?: {
    id: number
    name: string
    avatarUrl?: string
    roleType: string
    positionTitle?: string
    unit?: OrganizationRef
  }
  delegateTo?: {
    id: number
    name: string
    avatarUrl?: string
    roleType: string
  }
}

export type Meeting = {
  id: number
  title: string
  description?: string
  meetingType: MeetingType
  startAt: string
  endAt: string
  location?: string
  organizerId: number
  linkedProgramId?: number
  status: MeetingStatus
  notes?: string
  postponedReason?: string | null
  rescheduledFromAt?: string | null
  createdAt: string
  updatedAt: string
  organizer?: {
    id: number
    name: string
    avatarUrl?: string
    roleType: string
    positionTitle?: string
  }
  attendees: MeetingAttendee[]
}

// ─── Execution Grid (Ren/Real tabel mingguan ala PTPN) ────────────────────────

export type ExecutionWorkstreamSummary = {
  id: number
  code: string
  name: string
  status: string
  healthStatus: HealthStatus | null
  progressPercent: number
  ownerId: number
  phaseCount: number
  taskCount: number
}

export type ExecutionPicRef = {
  id: number
  name: string
  shortName?: string | null
}

export type ExecutionStep = {
  id: number
  code: string
  letterIndex: string | null
  title: string
  description: string | null
  output: string | null
  status: string
  isBlocked: boolean
  blockedReason: string | null
  percentComplete: number
  healthStatus: HealthStatus | null
  primaryAssignee: ExecutionPicRef | null
  picUnits: ExecutionPicRef[]
  picPersons: ExecutionPicRef[]
  plannedWeeks: string[]
  actualWeeks: string[]
  actualDerived: boolean
}

export type ExecutionPhase = {
  id: number
  code: string
  order: number
  name: string
  description: string | null
  status: string
  color: string | null
  healthStatus: HealthStatus | null
  startWeek?: string | null
  endWeek?: string | null
  picUnits: ExecutionPicRef[]
  picPersons: ExecutionPicRef[]
  steps: ExecutionStep[]
}

export type ExecutionMonthHeader = {
  month: string
  year: number
  monthIndex: number
  weeks: Array<{ iso: string; ordinal: number; label: string }>
}

export type ExecutionGridData = {
  program: { id: number; code: string; name: string }
  workstream: {
    id: number
    code: string
    name: string
    description: string | null
    status: string
    healthStatus: HealthStatus | null
    progressPercent: number
    owner: { id: number; name: string } | null
  }
  weekRange: { startWeek: string; endWeek: string; weeks: string[] }
  monthHeaders: ExecutionMonthHeader[]
  currentWeek: string
  phases: ExecutionPhase[]
  unphasedSteps: ExecutionStep[]
}
