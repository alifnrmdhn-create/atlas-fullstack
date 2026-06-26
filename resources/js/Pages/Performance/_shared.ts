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

/** Target-bullet fill: zoom skala 90–110 (target 100 = tengah). <90→0, >110→100.
 *  Dipakai hero Scorecard + header subject Collegial/Division (satu bahasa visual). */
export function bulletPct(val: number): number {
  return Math.min(Math.max(((val - 90) / 20) * 100, 0), 100)
}

/**
 * Label perspektif BSC — EJA PENUH, sumber tunggal (anti singkatan opaque +
 * anti-drift). Mandat 2026-06-26: "langsung paham IBP/L&G apa". Backend simpan
 * 'L&G' (lihat normPerspektif) → di-decode ke 'Learning & Growth'; 'Internal
 * Business Process' & sisanya sudah penuh. JANGAN tampilkan 'IBP'/'L&G' mentah
 * sebagai label utama.
 */
export function perspektifLabel(p: string): string {
  switch (p) {
    case 'L&G': return 'Learning & Growth'
    case 'IBP': return 'Internal Business Process'
    default: return p
  }
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

/**
 * Format domain values with their satuan. Satuan riil di data KPI PTPN:
 * `Skor, Rp Miliar, Jumlah, %, Rasio, Rp` (kpi_divisi_items.satuan).
 * Aturan: currency = prefix "Rp" (bukan "1.996 Rp"); satuan tak-berdimensi
 * (Jumlah/Rasio/Skor) tidak di-suffix — unit sudah tampil sebagai chip meta.
 * Input string (fmtNum BE, plain parseable) di-parse lalu di-localize id-ID;
 * non-numerik ("—") diteruskan apa adanya.
 */
export function formatVal(val: number | string, satuan: string): string {
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val
  if (typeof num !== 'number' || isNaN(num)) return String(val)
  const n = formatNumber(num, Number.isInteger(num) ? 0 : 2)
  const s = satuan.trim()
  if (s === 'Rp') return `Rp ${n}`
  if (s === 'Rp Miliar' || s === 'Rp M') return `Rp ${n} M`
  if (s === '%') return `${n}%`
  if (s === 'Jumlah' || s === 'Rasio' || s === 'Skor') return n
  return s ? `${n} ${s}` : n
}

// Label bulan sengaja English — UI ATLAS full English (glossary 2026-06-02);
// angka tetap locale id-ID (konvensi finansial PTPN).
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** Format "2026-03" → "March 2026". Falls back to input if unparseable. */
export function formatPeriod(p: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(p)
  if (!m) return p
  const idx = parseInt(m[2], 10) - 1
  if (idx < 0 || idx > 11) return p
  return `${MONTHS_EN[idx]} ${m[1]}`
}

/**
 * Zero-target KPI yang tercapai (mis. "Jumlah Fraud: target 0, realisasi 0"
 * → skor 100). Angka "0 → 0" tampak rusak tanpa konteks; UI pakai ini untuk
 * menampilkan tag "zero target met" alih-alih panah biasa.
 */
export function isZeroTargetMet(sasaran: number | string, realisasi: number | string): boolean {
  const t = typeof sasaran === 'string' ? parseFloat(sasaran.replace(',', '.')) : sasaran
  const r = typeof realisasi === 'string' ? parseFloat(realisasi.replace(',', '.')) : realisasi
  return t === 0 && r === 0
}
