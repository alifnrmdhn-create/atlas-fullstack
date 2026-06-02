/**
 * Shared utilities for Performance views.
 * scoreColor and helpers are centralized here so the 6 views stay consistent.
 */

export type ScoreTone = 'green' | 'amber' | 'red'

/** Standard scorecard threshold: ≥100 green, 80-99 amber, <80 red. */
export function scoreTone(val: number): ScoreTone {
  if (val >= 100) return 'green'
  if (val >= 80) return 'amber'
  return 'red'
}

/** Cap-110 percentage for visual fill (max bar width). */
export function fillRatio(val: number, cap = 110): number {
  return Math.min(Math.max(val / cap, 0), 1)
}

/** Compute percentage achievement of target with polarity. */
export function realisasiPercent(
  sasaran: string | number,
  realisasi: string | number,
  polaritas: 'maximize' | 'minimize',
): number {
  const t = typeof sasaran === 'string' ? parseFloat(sasaran.replace(',', '.')) : sasaran
  const r = typeof realisasi === 'string' ? parseFloat(realisasi.replace(',', '.')) : realisasi
  if (isNaN(t) || isNaN(r)) return 0
  if (t === 0) return r === 0 ? 100 : 0
  const ratio = polaritas === 'maximize'
    ? r / t
    : t / Math.max(Math.abs(r), 0.0001)
  return Math.min(Math.abs(ratio) * 100, 110)
}

/** Format with Indonesian locale. */
export function formatNumber(val: number, decimals = 2): string {
  return val.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPercent(val: number, decimals = 2): string {
  return `${formatNumber(val, decimals)}%`
}

/** Format domain values with their satuan. */
export function formatVal(val: number | string, satuan: string): string {
  const n = typeof val === 'string' ? val : val.toLocaleString('id-ID')
  if (satuan === 'Rp M') return `Rp ${n} M`
  if (satuan === '%') return `${n}%`
  return `${n} ${satuan}`
}

const MONTHS_ID = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** Format "2026-03" → "Maret 2026". Falls back to input if unparseable. */
export function formatPeriod(p: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(p)
  if (!m) return p
  const idx = parseInt(m[2], 10) - 1
  if (idx < 0 || idx > 11) return p
  return `${MONTHS_ID[idx]} ${m[1]}`
}
