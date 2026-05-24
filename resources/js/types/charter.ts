// Charter View types — mirrors ProgramCharterService::assemble() contract.
// See docs/CHARTER_VIEW_PLAN.md section 5.5.

export type CharterHealth = 'ON_TRACK' | 'AT_RISK' | 'TERLAMBAT' | 'COMPLETED'

export type CharterPic = {
  name: string
  position: string
}

export type CharterPeriod = {
  from: string // YYYY-MM
  to: string   // YYYY-MM
}

export type CharterProgram = {
  id: number
  name: string
  code: string
  strategicObjective: string | null
  pillar: string | null
  pillarLabel: string | null
  divisionName: string
  directorateName: string
  pic: CharterPic
  period: CharterPeriod
  currentMonth: string // YYYY-MM
}

export type MonthKey =
  | 'Jan' | 'Feb' | 'Mar' | 'Apr' | 'Mei' | 'Jun'
  | 'Jul' | 'Agu' | 'Sep' | 'Okt' | 'Nov' | 'Des'

export const MONTH_KEYS: readonly MonthKey[] = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
] as const

export type ActivityMonthCell = {
  target: boolean
  realized: boolean
  below: boolean
}

export type CharterActivity = {
  id: number
  name: string
  workstream: string
  deliverable: string | null
  periodicity: string | null
  months: Record<MonthKey, ActivityMonthCell>
}

export type CharterStatus = {
  health: CharterHealth
  achievementPct: number | null // null for non-scorecard
  badgeColor: string
  completedCount: number
  totalCount: number
}

export type CharterKpi = {
  name: string
  target: number
  unit: string
  glossary: string | null
} | null

export type CharterProgressLog = {
  asOfMonth: string | null // "Minggu ke-X · MonthName YYYY"
  updateNote: string | null
  problemIdentification: string | null
  correctiveAction: string | null
  nextStep: string | null
  supportNeeded: string | null
}

export type CharterCellStatus = 'above' | 'on' | 'below' | 'na'

export type CharterKpiHistoryMonth = {
  target: number | null
  real: number | null
  aboveTarget: boolean // backward-compat — prefer `status`
  status: CharterCellStatus
}

export type CharterKpiHistoryRow = {
  label: string
  months: Record<MonthKey, CharterKpiHistoryMonth>
}

export type CharterKpiHistory = {
  rows: CharterKpiHistoryRow[]
}

export type CharterPayload = {
  program: CharterProgram
  activities: CharterActivity[]
  status: CharterStatus
  kpi: CharterKpi
  latestProgressLog: CharterProgressLog
  kpiHistory: CharterKpiHistory
}
