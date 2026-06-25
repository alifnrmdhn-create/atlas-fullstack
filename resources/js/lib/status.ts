/**
 * lib/status.ts — SUMBER KEBENARAN TUNGGAL untuk label/tone/slug status.
 * ════════════════════════════════════════════════════════════════════
 * Latar: audit 2026-06-25 menemukan kosakata status ATLAS terfragmentasi
 * (enum mentah bocor ke UI, 1 konsep dipakai kata berbeda, ~14 helper
 * deklarasi ulang label). Plan: docs/status-vocabulary-unification-plan-2026-06.md.
 *
 * Aturan emas: **satu konsep → satu string sumber**. Variasi visual
 * (UPPERCASE, singkatan, ikon) = presentasi yang diturunkan, BUKAN string
 * kedua yang ditulis tangan. Semua label WAJIB lewat i18n (natural-key EN).
 *
 * Dua sumbu status (jangan dicampur):
 *   - PROGRESS / lifecycle  → workStatusLabel  (Backlog…Completed)
 *   - SCHEDULE / health     → healthLabel       (On Track / At Risk / Delayed / Overdue)
 * Plus: priority, severity, program-lifecycle/approval.
 *
 * Helper program penuh (rekonsiliasi approval+operasional+health) tetap di
 * lib/programStatus.ts — di-re-export di sini sbg satu pintu impor.
 */

import i18n from './i18n'

export {
  getProgramDisplayStatus,
  getProgramHealthDisplay,
} from './programStatus'
export type {
  ProgramDisplayStatus,
  ProgramDisplayTone,
  ProgramHealthDisplay,
  ProgramHealthTone,
} from './programStatus'
export { healthTone, scoreTone } from './tone'
export type { Tone } from './tone'

// ── PROGRESS / lifecycle status ───────────────────────────────────────
// Enum DB: BACKLOG READY IN_PROGRESS IN_REVIEW BLOCKED COMPLETED.
// Dipakai juga oleh blocker (OPEN/IN_PROGRESS/RESOLVED), meeting, dll —
// generic title-case + i18n menghasilkan label kanonik utk semuanya.
// (Pengganti contexts/workspace.tsx formatStatusLabel — kini delegasi ke sini.)
export function workStatusLabel(value?: string | null): string {
  if (!value) return i18n.t('Not set')
  const label = value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
  return i18n.t(label)
}

/** Slug CSS utk status lifecycle (lowercase enum). */
export const workStatusSlug = (value?: string | null): string => (value ?? '').toLowerCase()

// ── SCHEDULE / health status ──────────────────────────────────────────
// Sumbu urgensi/health pada level task & program (GREEN/YELLOW/RED/OVERDUE).
// Vocab kanonik: On Track / At Risk / Delayed / Overdue / Completed.
// Catatan: program penuh pakai getProgramHealthDisplay (ada override
// overdue-by-date & completed). healthLabel() = pemetaan enum mentah saja.
const HEALTH_LABEL: Record<string, string> = {
  GREEN: 'On Track',
  YELLOW: 'At Risk',
  RED: 'Delayed',
  OVERDUE: 'Overdue',
  COMPLETED: 'Completed',
}
export function healthLabel(value?: string | null): string {
  const key = (value ?? '').toUpperCase()
  return i18n.t(HEALTH_LABEL[key] ?? key)
}

// ── PRIORITY (task) ───────────────────────────────────────────────────
// Low / Medium / High / Critical. UPPERCASE adalah presentasi (text-transform
// CSS), BUKAN string sumber — render selalu lewat priorityLabel().
const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
}
export function priorityLabel(value?: string | null): string {
  if (!value) return ''
  return i18n.t(PRIORITY_LABEL[value] ?? (value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()))
}
export const prioritySlug = (value?: string | null): string => (value ?? '').toLowerCase()

// ── SEVERITY (blocker / risk) ─────────────────────────────────────────
// Skala kata IDENTIK dgn priority (Low…Critical) tapi KONSEP berbeda
// (severity ≠ priority). Fungsi terpisah utk kejelasan semantik & agar
// suatu saat bisa divergen tanpa menyentuh priority (lihat plan §6).
export function severityLabel(value?: string | null): string {
  return priorityLabel(value)
}
export const severitySlug = prioritySlug

// ── PROGRAM approval lifecycle (enum → label, utk log/transition) ──────
// Render program PENUH pakai getProgramDisplayStatus (rekonsiliasi state).
// Ini hanya pemetaan enum mentah → kata kanonik, dipakai mis. di approval
// log (toStatus). Kata "running" = "Active" (keputusan 2026-06-25).
const APPROVAL_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PLANNING: 'Planning',
  PENDING_KASUB: 'Awaiting KASUBDIV',
  PENDING_KADIV: 'Awaiting KADIV',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ON_HOLD: 'On Hold',
}
export function approvalStatusLabel(value?: string | null): string {
  if (!value) return ''
  const fallback = value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
  return i18n.t(APPROVAL_STATUS_LABEL[value] ?? fallback)
}

// ── PROGRAM operational status (field `status`: PLANNING/IN_PROGRESS/ON_HOLD/…) ─
// BEDA dari approval lifecycle & dari work-status task. Kata "running" program
// = "Active" (BUKAN "In Progress" yang dipakai task) — keputusan 2026-06-25:
// program "Active" vs task "In Progress" = beda altitude, bantu user bedakan
// level. Render program PENUH (rekonsiliasi approval+health) tetap pakai
// getProgramDisplayStatus; ini utk grouping/lane header by status mentah.
const PROGRAM_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  IN_PROGRESS: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}
export function programStatusLabel(value?: string | null): string {
  if (!value) return ''
  const fallback = value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
  return i18n.t(PROGRAM_STATUS_LABEL[value] ?? fallback)
}

// ── CHARTER health enum (ON_TRACK/AT_RISK/TERLAMBAT/COMPLETED) → label ────────
// Ejaan enum berbeda (TERLAMBAT, bukan RED) tapi vocab sama: Delayed dst.
const CHARTER_HEALTH_LABEL: Record<string, string> = {
  ON_TRACK: 'On Track', AT_RISK: 'At Risk', TERLAMBAT: 'Delayed', COMPLETED: 'Completed',
}
export function charterHealthLabel(health?: string | null): string {
  const key = (health ?? '').toUpperCase()
  return i18n.t(CHARTER_HEALTH_LABEL[key] ?? (health ?? ''))
}
