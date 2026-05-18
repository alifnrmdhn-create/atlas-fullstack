/**
 * Period format helpers — convert between machine format dan label manusia.
 *
 * Machine format (yang disimpan di ProgramProgressLog.period):
 *   - "YYYY-WNN"  ISO 8601 week (e.g., "2026-W17")
 *   - "YYYY-MM"   Calendar month (e.g., "2026-05")
 *
 * Label format (yang ditampilkan ke user, mirror DKMR PDF):
 *   - "Minggu ke 1 bulan Mei 2026"
 *   - "Bulan Mei 2026"
 */

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

/** Match "YYYY-WNN" ISO week. */
const RE_ISO_WEEK = /^(\d{4})-W(\d{1,2})$/
/** Match "YYYY-MM" calendar month. */
const RE_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isIsoWeek(period: string): boolean {
  return RE_ISO_WEEK.test(period)
}
export function isMonth(period: string): boolean {
  return RE_MONTH.test(period)
}

/** Monday of given ISO week year+week. */
function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const jan4IsoDay = ((jan4.getDay() + 6) % 7) + 1 // 1=Mon..7=Sun
  const w01Mon = new Date(year, 0, 4 - jan4IsoDay + 1)
  const monday = new Date(w01Mon)
  monday.setDate(w01Mon.getDate() + (week - 1) * 7)
  return monday
}

/** Thursday determines which calendar month an ISO week belongs to. */
function isoWeekThursday(year: number, week: number): Date {
  const monday = isoWeekMonday(year, week)
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  return thursday
}

/**
 * Convert ISO week ("2026-W20") → "Minggu ke 3 bulan Mei 2026".
 *
 * "Minggu ke N" = posisi week ini di antara week-week yang Thursday-nya jatuh
 * di bulan yang sama. Konsisten dengan WeekToMonthMapper backend.
 */
export function isoWeekToMonthLabel(period: string): string {
  const m = period.match(RE_ISO_WEEK)
  if (!m) return period
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  const thursday = isoWeekThursday(year, week)
  const targetMonth = thursday.getMonth()

  let weekOfMonth = 1
  for (let w = 1; w < week; w++) {
    const checkThu = isoWeekThursday(year, w)
    if (checkThu.getMonth() === targetMonth && checkThu.getFullYear() === year) {
      weekOfMonth++
    }
  }

  return `Minggu ke ${weekOfMonth} bulan ${MONTH_NAMES_ID[targetMonth]} ${year}`
}

/** Convert "YYYY-MM" → "Bulan Mei 2026". */
export function monthToLabel(period: string): string {
  const m = period.match(RE_MONTH)
  if (!m) return period
  const year = parseInt(m[1], 10)
  const monthIdx = parseInt(m[2], 10) - 1
  return `Bulan ${MONTH_NAMES_ID[monthIdx]} ${year}`
}

/** Auto-detect format and produce human label. */
export function periodToLabel(period: string): string {
  if (isIsoWeek(period)) return isoWeekToMonthLabel(period)
  if (isMonth(period)) return monthToLabel(period)
  return period
}

/** Current ISO week formatted as "YYYY-WNN". */
export function currentIsoWeek(now: Date = new Date()): string {
  const thursday = new Date(now)
  thursday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + 3)
  const jan4 = new Date(thursday.getFullYear(), 0, 4)
  const week = 1 + Math.round((thursday.getTime() - jan4.getTime()) / 604800000)
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Current month formatted as "YYYY-MM". */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
