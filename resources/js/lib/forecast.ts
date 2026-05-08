/**
 * Sprint 5 + Post-MVP — Linear forecast helper.
 *
 * Extrapolasi YTD ke akhir tahun. Tidak memperhitungkan musiman/seasonality —
 * akan disempurnakan di Sprint 6 dengan data riil multi-periode.
 *
 * Status berbasis polarity:
 *   maximize: forecast >= target = green; >= 90% target = yellow; else red
 *   minimize: forecast <= target = green; <= 110% target = yellow; else red
 */

export type ForecastResult = {
  value: number
  status: 'green' | 'yellow' | 'red'
}

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

/** Resolve month index (1-12) dari periode string. Format yang didukung:
 *  - "Maret 2026"  (Indonesia month name)
 *  - "2026-03"     (ISO YYYY-MM)
 *  - "2026-W17"    (ISO week — return null, forecast tidak relevan)
 */
export function resolveMonthIndex(periode: string): number | null {
  // ISO week tidak didukung untuk forecast bulanan
  if (/^\d{4}-W\d{1,2}$/i.test(periode)) return null

  // Indonesia month name
  for (let i = 0; i < MONTHS_ID.length; i++) {
    if (periode.includes(MONTHS_ID[i])) return i + 1
  }

  // ISO YYYY-MM
  const isoMatch = periode.match(/^(\d{4})-(\d{2})$/)
  if (isoMatch) {
    const m = parseInt(isoMatch[2], 10)
    if (m >= 1 && m <= 12) return m
  }

  return null
}

/** Hitung forecast linear berbasis target/realisasi numerik + periode + polaritas. */
export function computeForecast(args: {
  periode: string
  target: number
  realisasi: number
  polaritas: 'maximize' | 'minimize'
}): ForecastResult | null {
  const monthIndex = resolveMonthIndex(args.periode)
  if (monthIndex === null) return null
  if (isNaN(args.target) || isNaN(args.realisasi)) return null

  const forecast = args.realisasi * (12 / monthIndex)
  let status: 'green' | 'yellow' | 'red' = 'green'
  if (args.polaritas === 'maximize') {
    if (forecast < args.target * 0.9) status = 'red'
    else if (forecast < args.target) status = 'yellow'
  } else {
    if (forecast > args.target * 1.1) status = 'red'
    else if (forecast > args.target) status = 'yellow'
  }
  return { value: forecast, status }
}

/** Convenience overload untuk data string-based (mirror IndividuDetail format). */
export function computeForecastFromStrings(args: {
  periode: string
  sasaran: string
  realisasi: string
  polaritas: 'maximize' | 'minimize'
}): ForecastResult | null {
  const target = parseFloat(args.sasaran.replace(',', '.'))
  const realisasi = parseFloat(args.realisasi.replace(',', '.'))
  return computeForecast({ periode: args.periode, target, realisasi, polaritas: args.polaritas })
}
