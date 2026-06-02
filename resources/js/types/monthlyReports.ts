// Shared types for Monthly Reports module

export type UnitRef = { id: number; code: string; name: string }
export type UserRef = { id: number; name: string; roleType?: string }

export type Metric = {
  id: number; reportId: number
  section: string; kategori: string; label: string; satuan: string
  rkap: string | null; realisasi: string | null; tahunLalu: string | null
  order: number
}
export type ReportFile   = { id: number; originalName: string; uploadedAt: string; uploadedBy: UserRef }
export type Approval     = { id: number; approverRole: string; action: string; note: string | null; createdAt: string; approver: UserRef }
export type ProgramRef = { id: number; code: string; name: string }

export type Report = {
  id: number; unitId: number; month: number; year: number; status: string
  narrativeSummary: string | null; highlights: string | null
  submittedAt: string | null; submittedBy: UserRef | null; unit: UnitRef
  linkedProgramIds?: number[]; linkedPrograms?: ProgramRef[]
  metrics?: Metric[]; files?: ReportFile[]; approvals?: Approval[]
  _count?: { metrics: number; files: number }
}

// Shared helpers
export const MON      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const MON_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
export const CY       = new Date().getFullYear()
export const YEARS    = [CY, CY - 1, CY - 2]

export const STATUS: Record<string, { label: string; cls: string; row: string; color: string }> = {
  DRAFT:     { label: 'Draft',      cls: 'draft',     row: 'draft',     color: 'var(--text-muted)' },
  SUBMITTED: { label: 'Diajukan',   cls: 'submitted', row: 'submitted', color: 'var(--yellow)' },
  REVIEWED:  { label: 'Direview',   cls: 'reviewed',  row: 'reviewed',  color: 'var(--blue)' },
  APPROVED:  { label: 'Disetujui',  cls: 'approved',  row: 'approved',  color: 'var(--green)' },
  REJECTED:  { label: 'Ditolak',    cls: 'rejected',  row: 'rejected',  color: 'var(--red)' },
}

export const APPROVAL_ACTION: Record<string, { label: string; cls: string; dot: string }> = {
  APPROVED:           { label: 'Disetujui',    cls: 'green', dot: 'approved' },
  REJECTED:           { label: 'Ditolak',      cls: 'red',   dot: 'rejected' },
  REVISION_REQUESTED: { label: 'Minta revisi', cls: 'amber', dot: 'revision' },
}

export const n     = (v: string | null) => v == null ? 0 : Number(v)
export const isNonNum = (sat: string) =>
  ['%','x','Hari','Orang','Item','SPT','Unit','Risiko','KRI','Entitas'].some(s => sat.includes(s))

export const fmtVal = (v: string | null, sat = '') => {
  if (v == null) return '–'
  const x = Number(v)
  if (isNonNum(sat)) return x.toLocaleString('id-ID', { maximumFractionDigits: 2 })
  return x.toLocaleString('id-ID', { maximumFractionDigits: 0 })
}

export const pctVs = (real: string | null, ref: string | null): number | null => {
  const r = n(ref); if (!r) return null
  return Math.round((n(real) / r) * 100)
}

export const perfCls   = (p: number | null) => p == null ? '' : p >= 100 ? 'green' : p >= 85 ? 'amber' : 'red'
export const perfColor = (p: number | null) => p == null ? 'var(--text-muted)' : p >= 100 ? 'var(--green)' : p >= 85 ? 'var(--yellow)' : 'var(--red)'

export const periodLabel  = (m: number, y: number) => `s.d. ${MON[m - 1]} ${y}`
export const reportTitle  = (m: number, y: number) => `Laporan Manajemen s.d. ${MON_FULL[m - 1]} ${y}`
export const prevYrLabel  = (y: number) => String(y - 1)

// ── DIMR Risk Report types ────────────────────────────────────────────────────

export type RiskKRI = {
  id: number; reportId: number; riskSnapshotId: number
  kriCode: string; kriName: string; unit: string
  targetValue: string; actualValue: string
  thresholdWarning: string; thresholdCritical: string
  status: 'NORMAL' | 'WARNING' | 'CRITICAL'
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING'
  prevMonthValue: string | null; higherIsBetter: boolean
  notes: string | null; order: number
}

export type RiskMitigation = {
  id: number; reportId: number; riskSnapshotId: number
  plannedActions: number; completedActions: number; completionRate: string
  budgetAllocated: string | null; budgetRealized: string | null; budgetAbsorption: string | null
  isOverdue: boolean; overdueDays: number | null; notes: string | null
}

export type RiskSnapshot = {
  id: number; reportId: number
  riskCode: string; riskName: string; category: string
  probabilitas: number; dampak: number; riskScore: number; riskLevel: string
  status: string; prevMonthScore: number | null; scoreChange: string | null
  ownerName: string; notes: string | null; order: number
  kris: RiskKRI[]; mitigation: RiskMitigation | null
}

export type RiskStrategy = {
  id: number; reportId: number
  riskCapacity: string; riskAppetite: string; riskTolerance: string; riskLimit: string
  totalExposure: string; exposureVsCapacity: string; exposureVsAppetite: string
  rasCompliant: boolean; riskStance: string; notes: string | null
}

export type RiskGovernance = {
  id: number; reportId: number
  riskRegisterCoverage: string; risksWithoutOwner: number
  reportSubmissionRate: string; organCompletenessRate: string
  workProgramRealization: string; auditFollowUpRate: string
  erinUpdateRate: string; internalControlFindings: number
  criticalFindingsOpen: number; notes: string | null
}

export type RiskLossEvent = {
  id: number; reportId: number; eventDate: string
  category: string; description: string; impactAmount: string | null
  isRecurring: boolean; recoveryStatus: string; recoveredAmount: string | null
  pic: string; notes: string | null
}

export type RiskNarrative = { id: number; section: string; content: string; order: number }

export type RiskReportApproval = {
  id: number; approverRole: string; action: string; note: string | null; createdAt: string
  approver: UserRef
}

export type RiskReport = {
  id: number; unitId: number; month: number; year: number; status: string
  compositeRating: string | null; rmiScore: string | null
  submittedAt: string | null; approvedAt: string | null
  createdBy: UserRef; submittedBy: UserRef | null; unit: UnitRef
  strategy: RiskStrategy | null
  riskSnapshots: RiskSnapshot[]
  lossEvents: RiskLossEvent[]
  governance: RiskGovernance | null
  narratives: RiskNarrative[]
  approvals: RiskReportApproval[]
}

export const RISK_LEVEL_META: Record<string, { label: string; color: string; bg: string }> = {
  LOW:              { label: 'Low',              color: '#22c55e', bg: 'rgba(34,197,94,0.08)'   },
  LOW_TO_MODERATE:  { label: 'Low to Moderate',  color: '#84cc16', bg: 'rgba(132,204,22,0.08)'  },
  MODERATE:         { label: 'Moderate',         color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  MODERATE_TO_HIGH: { label: 'Moderate to High', color: '#f97316', bg: 'rgba(249,115,22,0.08)'  },
  HIGH:             { label: 'High',             color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
}

export const KRI_STATUS_META: Record<string, { label: string; color: string }> = {
  NORMAL:   { label: 'Normal',   color: '#22c55e' },
  WARNING:  { label: 'Warning',  color: '#f59e0b' },
  CRITICAL: { label: 'Critical', color: '#ef4444' },
}

export const SCORE_CHANGE_META: Record<string, { icon: string; color: string }> = {
  IMPROVED: { icon: '↓', color: '#22c55e' },
  STABLE:   { icon: '→', color: 'var(--text-muted)' },
  WORSENED: { icon: '↑', color: '#ef4444' },
}

export const RECOVERY_META: Record<string, { label: string; color: string }> = {
  UNRECOVERED: { label: 'Belum pulih', color: '#ef4444' },
  PARTIAL:     { label: 'Sebagian',    color: '#f59e0b' },
  RECOVERED:   { label: 'Pulih',       color: '#22c55e' },
}

export const fmtRisk = (v: string | number | null, decimals = 0) => {
  if (v == null) return '–'
  const x = Number(v)
  return x.toLocaleString('id-ID', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
}

export const fmtPct = (v: string | null) =>
  v == null ? '–' : `${(Number(v) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`

export const fmtMoney = (v: string | null) => {
  if (v == null) return '–'
  const x = Number(v)
  if (x === 0) return '–'
  if (Math.abs(x) >= 1_000_000_000) return `Rp ${(x / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (Math.abs(x) >= 1_000_000)     return `Rp ${(x / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`
  return `Rp ${x.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
}

export const fmtRp = (v: string | null, sat: string): string => {
  if (v == null) return '–'
  const x = Number(v)
  if (isNonNum(sat)) return `${x.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${sat}`
  const abs = Math.abs(x)
  const sign = x < 0 ? '-' : ''
  if (sat.includes('Miliar')) {
    if (abs >= 1000) return `${sign}Rp ${(abs / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} T`
    return `${sign}Rp ${abs.toLocaleString('id-ID', { maximumFractionDigits: 0 })} M`
  }
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} T`
  if (abs >= 1_000)     return `${sign}Rp ${(abs / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  return `${sign}Rp ${abs.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Jt`
}
