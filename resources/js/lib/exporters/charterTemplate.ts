// Charter View PPTX export — layout + color constants.
//
// Coordinates are in inches against pptxgenjs LAYOUT_WIDE (13.333 × 7.5).
// Palette follows the DKMR May 2026 PPT deck so the exported file is
// visually consistent with the source brief.

export const LAYOUT = {
  HEADER:           { x: 0.3, y: 0.3, w: 12.7, h: 0.8 },
  ACTIVITY_TABLE:   { x: 0.3, y: 1.2, w: 7.5, h: 4.0 },
  STATUS_PANEL:     { x: 8.0, y: 1.2, w: 2.4, h: 1.8 },
  UPDATE_PANEL:     { x: 8.0, y: 3.1, w: 4.9, h: 2.1 },
  PICA_PROBLEM:     { x: 0.3, y: 5.4, w: 4.5, h: 1.5 },
  PICA_NEXT_STEP:   { x: 5.0, y: 5.4, w: 3.8, h: 1.5 },
  KPI_PROGRESS:     { x: 9.0, y: 5.4, w: 4.0, h: 1.5 },
  FOOTER:           { x: 0.3, y: 7.05, w: 12.7, h: 0.3 },
} as const

export const COLORS = {
  PRIMARY:        '00875A',  // hijau Danantara
  PRIMARY_DARK:   '004D33',
  TARGET:         '97C459',  // hijau muda — target row
  REALIZED:       '3B6D11',  // hijau tua — realized row
  BELOW:          'F0997B',  // oranye — below target
  AT_RISK:        'BA7517',  // amber
  DELAYED:        'A32D2D',  // merah
  COMPLETED:      '3B6D11',
  TEXT_PRIMARY:   '212121',
  TEXT_SECONDARY: '6B7280',
  TEXT_MUTED:     '9CA3AF',
  BORDER:         'E5E7EB',
  PANEL_BG:       'FFFFFF',
  STRIP_BG:       'F9FAFB',
} as const

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
] as const

/** Map charter health → header pill fill color. */
export function healthColor(health: string): string {
  switch (health) {
    case 'ON_TRACK':  return COLORS.PRIMARY
    case 'AT_RISK':   return COLORS.AT_RISK
    case 'TERLAMBAT': return COLORS.DELAYED
    case 'COMPLETED': return COLORS.COMPLETED
    default:          return COLORS.TEXT_SECONDARY
  }
}

/** Filename-safe slug for the exported program name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'program'
}
