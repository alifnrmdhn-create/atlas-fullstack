import pptxgen from 'pptxgenjs'
import { MONTH_KEYS, type CharterPayload, type MonthKey } from '../../types/charter'
import { COLORS, LAYOUT, MONTH_LABELS, healthColor, slugify } from './charterTemplate'

/**
 * Generate a single-slide PPTX brief for one Program, mirroring the
 * Charter View on screen. File is downloaded directly via the browser
 * — no server round-trip.
 *
 * Layout per docs/CHARTER_VIEW_PLAN.md section 6.6.
 *
 * Visual reference: docs/reference/15052026_Monitoring Program Kerja DKMR.pdf
 * (page 21 et al). 100% pixel-fidelity is not the goal; structural
 * identity is.
 */
export async function exportProgramCharter(data: CharterPayload): Promise<void> {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.333 × 7.5 in
  pres.title = `Charter — ${data.program.code} — ${data.program.name}`

  composeSlide(pres, data)

  const filename = `Charter_${slugify(data.program.name)}_${data.program.currentMonth}.pptx`
  await pres.writeFile({ fileName: filename })
}

/**
 * Batch variant — one slide per program, single file. Used by the
 * multi-program export modal in /programs (Pak Dirkeu's MRC use case:
 * pick N programs across direktorat, get one deck).
 *
 * Slides are composed in the order payloads are passed. The downstream
 * caller is expected to sort/filter beforehand.
 */
export async function exportProgramsCharterBatch(payloads: CharterPayload[]): Promise<void> {
  if (payloads.length === 0) return
  if (payloads.length === 1) {
    // Single-item batch is just the regular export. Avoids "Batch_1programs"
    // filename ugliness.
    return exportProgramCharter(payloads[0])
  }

  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'
  const currentMonth = payloads[0].program.currentMonth
  pres.title = `Charter Batch — ${payloads.length} programs — ${currentMonth}`

  for (const data of payloads) {
    composeSlide(pres, data)
  }

  const filename = `Charter_Batch_${payloads.length}programs_${currentMonth}.pptx`
  await pres.writeFile({ fileName: filename })
}

/** Compose one slide from a charter payload — extracted so both
 *  single + batch exporters share the exact same builder pipeline. */
function composeSlide(pres: pptxgen, data: CharterPayload): void {
  const slide = pres.addSlide()
  slide.background = { color: COLORS.PANEL_BG }

  buildHeaderStrip(slide, data)
  buildActivityTable(slide, data)
  buildStatusPanel(slide, data)
  buildUpdatePanel(slide, data)
  buildPicaProblem(slide, data)
  buildPicaNextStep(slide, data)
  buildKpiProgress(slide, data)
  buildFooter(slide, data)
}

// ── Header strip ────────────────────────────────────────────────────────
function buildHeaderStrip(slide: pptxgen.Slide, data: CharterPayload): void {
  const { program, status, kpi } = data
  const { x, y, w, h } = LAYOUT.HEADER

  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: COLORS.STRIP_BG },
    line: { color: COLORS.BORDER, width: 0.5 },
  })

  // Program code (mono) + name (bold)
  slide.addText(program.code, {
    x: x + 0.15, y: y + 0.05, w: 1.4, h: 0.25,
    fontFace: 'Menlo', fontSize: 9, color: COLORS.TEXT_SECONDARY, bold: true,
  })
  slide.addText(program.name, {
    x: x + 0.15, y: y + 0.25, w: 5.5, h: 0.55,
    fontFace: 'Inter', fontSize: 14, color: COLORS.TEXT_PRIMARY, bold: true,
    valign: 'top',
  })

  // KPI / PIC / Period — middle columns
  slide.addText([
    { text: 'KPI UTAMA\n', options: { fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true } },
    {
      text: kpi ? `${kpi.name}\nTarget ${kpi.target.toLocaleString('id-ID')} ${kpi.unit}` : 'Non-Scorecard',
      options: { fontSize: 9, color: COLORS.TEXT_PRIMARY },
    },
  ], { x: x + 6.0, y: y + 0.08, w: 2.2, h: h - 0.16, valign: 'top' })

  slide.addText([
    { text: 'PIC\n', options: { fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true } },
    { text: `${program.pic.name}\n${program.pic.position}`, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY } },
  ], { x: x + 8.3, y: y + 0.08, w: 1.9, h: h - 0.16, valign: 'top' })

  slide.addText([
    { text: 'PERIODE\n', options: { fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true } },
    { text: `${program.period.from} → ${program.period.to}`, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY } },
    { text: `\n${program.directorateName} · ${program.divisionName}`, options: { fontSize: 8, color: COLORS.TEXT_SECONDARY } },
  ], { x: x + 10.3, y: y + 0.08, w: 1.8, h: h - 0.16, valign: 'top' })

  // Health pill at far right
  const pillColor = healthColor(status.health)
  slide.addShape('roundRect', {
    x: x + w - 0.95, y: y + 0.18, w: 0.85, h: 0.32,
    fill: { color: pillColor },
    line: { color: pillColor, width: 0 },
    rectRadius: 0.16,
  })
  slide.addText(healthLabel(status.health), {
    x: x + w - 0.95, y: y + 0.18, w: 0.85, h: 0.32,
    fontSize: 9, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle',
  })
}

// ── Activity timeline table ─────────────────────────────────────────────
function buildActivityTable(slide: pptxgen.Slide, data: CharterPayload): void {
  const { x, y, w, h } = LAYOUT.ACTIVITY_TABLE

  // Section title
  slide.addText('Aktivitas & Timeline', {
    x, y: y - 0.27, w, h: 0.22,
    fontSize: 9, bold: true, color: COLORS.TEXT_SECONDARY,
  })

  const headerRow: pptxgen.TableRow = [
    { text: 'Aktivitas',  options: { bold: true, fill: { color: COLORS.PRIMARY }, color: 'FFFFFF', fontSize: 8 } },
    { text: 'Deliverable', options: { bold: true, fill: { color: COLORS.PRIMARY }, color: 'FFFFFF', fontSize: 8 } },
    { text: 'T/R',         options: { bold: true, fill: { color: COLORS.PRIMARY }, color: 'FFFFFF', fontSize: 8, align: 'center' } },
    ...MONTH_LABELS.map(m => ({
      text: m,
      options: { bold: true, fill: { color: COLORS.PRIMARY }, color: 'FFFFFF', fontSize: 8, align: 'center' as const },
    })),
  ]

  const bodyRows: pptxgen.TableRow[] = []
  if (data.activities.length === 0) {
    const emptyRow: pptxgen.TableRow = [
      {
        text: 'Belum ada aktivitas pada workstream.',
        options: { colspan: 3 + MONTH_LABELS.length, italic: true, color: COLORS.TEXT_SECONDARY, fontSize: 8, align: 'center' },
      },
    ]
    bodyRows.push(emptyRow)
  } else {
    data.activities.forEach(activity => {
      // Target row
      bodyRows.push([
        { text: activity.name,                options: { rowspan: 2, valign: 'middle', fontSize: 8, color: COLORS.TEXT_PRIMARY } },
        { text: activity.deliverable ?? '—',  options: { rowspan: 2, valign: 'middle', fontSize: 8, color: COLORS.TEXT_SECONDARY } },
        { text: 'T', options: { fontSize: 7, color: COLORS.TEXT_SECONDARY, align: 'center' as const, valign: 'middle' as const } },
        ...MONTH_KEYS.map(m => activityCell(activity.months[m], 'target')),
      ])
      // Real row
      bodyRows.push([
        { text: 'R', options: { fontSize: 7, color: COLORS.TEXT_SECONDARY, align: 'center' as const, valign: 'middle' as const } },
        ...MONTH_KEYS.map(m => activityCell(activity.months[m], 'real')),
      ])
    })
  }

  const monthColWidth = (w - 3.5) / 12 // 3.5" for Aktivitas + Deliverable + T/R columns
  slide.addTable([headerRow, ...bodyRows], {
    x, y, w, h,
    fontSize: 8,
    border: { type: 'solid', color: COLORS.BORDER, pt: 0.5 },
    colW: [1.7, 1.4, 0.4, ...Array(12).fill(monthColWidth)],
  })
}

function activityCell(month: { target: boolean; realized: boolean; below: boolean }, row: 'target' | 'real'): pptxgen.TableCell {
  let fill: string = COLORS.PANEL_BG
  if (row === 'target') {
    if (month.target) fill = COLORS.TARGET
  } else {
    if (month.realized) fill = COLORS.REALIZED
    else if (month.below) fill = COLORS.BELOW
  }
  return {
    text: '',
    options: { fill: { color: fill }, fontSize: 7, align: 'center', valign: 'middle' },
  }
}

// ── Status panel (right side) ───────────────────────────────────────────
function buildStatusPanel(slide: pptxgen.Slide, data: CharterPayload): void {
  const { status } = data
  const { x, y, w, h } = LAYOUT.STATUS_PANEL

  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: COLORS.PANEL_BG },
    line: { color: COLORS.BORDER, width: 0.5 },
  })

  slide.addText('% ACHIEVEMENT', {
    x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.2,
    fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true,
  })
  slide.addText(status.achievementPct !== null ? `${status.achievementPct}%` : '—', {
    x: x + 0.15, y: y + 0.3, w: w - 0.3, h: 0.6,
    fontSize: 28, color: COLORS.TEXT_PRIMARY, bold: true, valign: 'middle',
  })
  slide.addText(healthLabel(status.health), {
    x: x + 0.15, y: y + 0.95, w: w - 0.3, h: 0.3,
    fontSize: 11, color: healthColor(status.health), bold: true,
  })
  if (status.totalCount > 0) {
    slide.addText(`${status.completedCount}/${status.totalCount} aktivitas selesai`, {
      x: x + 0.15, y: y + 1.35, w: w - 0.3, h: 0.3,
      fontSize: 8, color: COLORS.TEXT_SECONDARY,
    })
  }
}

// ── Update panel (right side) ───────────────────────────────────────────
function buildUpdatePanel(slide: pptxgen.Slide, data: CharterPayload): void {
  const { latestProgressLog: log } = data
  const { x, y, w, h } = LAYOUT.UPDATE_PANEL

  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: COLORS.PANEL_BG },
    line: { color: COLORS.BORDER, width: 0.5 },
  })

  slide.addText('UPDATE SAAT INI', {
    x: x + 0.15, y: y + 0.1, w: w - 1.5, h: 0.2,
    fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true,
  })
  if (log.asOfMonth) {
    slide.addText(log.asOfMonth, {
      x: x + w - 1.5, y: y + 0.1, w: 1.35, h: 0.2,
      fontSize: 7, color: COLORS.TEXT_SECONDARY, align: 'right',
    })
  }

  slide.addText(log.updateNote ?? 'Belum ada update progress terbaru.', {
    x: x + 0.15, y: y + 0.32, w: w - 0.3, h: h - 0.45,
    fontSize: 9, color: log.updateNote ? COLORS.TEXT_PRIMARY : COLORS.TEXT_SECONDARY,
    italic: !log.updateNote,
    valign: 'top',
  })
}

// ── PICA row (problem→corrective + next step) ───────────────────────────
function buildPicaProblem(slide: pptxgen.Slide, data: CharterPayload): void {
  const { latestProgressLog: log } = data
  const { x, y, w, h } = LAYOUT.PICA_PROBLEM

  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: COLORS.PANEL_BG },
    line: { color: COLORS.BORDER, width: 0.5 },
  })

  slide.addText('IDENTIFIKASI MASALAH → TINDAKAN KOREKTIF', {
    x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.2,
    fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true,
  })

  const noContent = !log.problemIdentification && !log.correctiveAction
  if (noContent) {
    slide.addText('Tidak ada masalah yang terdokumentasi.', {
      x: x + 0.15, y: y + 0.4, w: w - 0.3, h: h - 0.55,
      fontSize: 9, color: COLORS.TEXT_SECONDARY, italic: true,
    })
    return
  }

  const lines: pptxgen.TextProps[] = []
  if (log.problemIdentification) {
    lines.push({ text: 'Masalah: ', options: { fontSize: 8, color: COLORS.TEXT_SECONDARY, bold: true } })
    lines.push({ text: `${log.problemIdentification}\n`, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY } })
  }
  if (log.correctiveAction) {
    lines.push({ text: 'Tindakan Korektif: ', options: { fontSize: 8, color: COLORS.TEXT_SECONDARY, bold: true } })
    lines.push({ text: log.correctiveAction, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY } })
  }
  slide.addText(lines, { x: x + 0.15, y: y + 0.32, w: w - 0.3, h: h - 0.45, valign: 'top' })
}

function buildPicaNextStep(slide: pptxgen.Slide, data: CharterPayload): void {
  const { latestProgressLog: log } = data
  const { x, y, w, h } = LAYOUT.PICA_NEXT_STEP

  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: COLORS.PANEL_BG },
    line: { color: COLORS.BORDER, width: 0.5 },
  })

  slide.addText('LANGKAH SELANJUTNYA', {
    x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.2,
    fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true,
  })

  const noContent = !log.nextStep && !log.supportNeeded
  if (noContent) {
    slide.addText('Belum dirumuskan.', {
      x: x + 0.15, y: y + 0.4, w: w - 0.3, h: h - 0.55,
      fontSize: 9, color: COLORS.TEXT_SECONDARY, italic: true,
    })
    return
  }

  const lines: pptxgen.TextProps[] = []
  if (log.nextStep) {
    lines.push({ text: 'Rencana: ', options: { fontSize: 8, color: COLORS.TEXT_SECONDARY, bold: true } })
    lines.push({ text: `${log.nextStep}\n`, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY } })
  }
  if (log.supportNeeded) {
    lines.push({ text: 'Dukungan Dibutuhkan: ', options: { fontSize: 8, color: COLORS.TEXT_SECONDARY, bold: true } })
    lines.push({ text: log.supportNeeded, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY } })
  }
  slide.addText(lines, { x: x + 0.15, y: y + 0.32, w: w - 0.3, h: h - 0.45, valign: 'top' })
}

// ── KPI progress table ──────────────────────────────────────────────────
function buildKpiProgress(slide: pptxgen.Slide, data: CharterPayload): void {
  const { kpiHistory } = data
  const { x, y, w, h } = LAYOUT.KPI_PROGRESS

  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: COLORS.PANEL_BG },
    line: { color: COLORS.BORDER, width: 0.5 },
  })

  slide.addText('PROGRESS KPI BULANAN', {
    x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.2,
    fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true,
  })

  if (kpiHistory.rows.length === 0) {
    slide.addText('Belum ada riwayat KPI bulanan.', {
      x: x + 0.15, y: y + 0.4, w: w - 0.3, h: h - 0.55,
      fontSize: 9, color: COLORS.TEXT_SECONDARY, italic: true,
    })
    return
  }

  // Compact one-row-per-KPI summary: KPI name + last-month real vs target.
  // (Full 12-month grid would not fit in 4.0in width — UpdatePanel-style summary.)
  const lines: pptxgen.TextProps[] = []
  kpiHistory.rows.forEach((row, idx) => {
    const months = MONTH_KEYS as readonly MonthKey[]
    let lastMonth: MonthKey | null = null
    for (let i = months.length - 1; i >= 0; i--) {
      const cell = row.months[months[i]]
      if (cell.real !== null || cell.target !== null) {
        lastMonth = months[i]
        break
      }
    }
    if (idx > 0) lines.push({ text: '\n', options: { fontSize: 4 } })
    lines.push({ text: row.label, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY, bold: true } })
    if (lastMonth) {
      const cell = row.months[lastMonth]
      const above = cell.aboveTarget
      lines.push({
        text: `\n${lastMonth}: Real ${formatNum(cell.real)} / Target ${formatNum(cell.target)}`,
        options: { fontSize: 8, color: above ? COLORS.REALIZED : COLORS.TEXT_SECONDARY },
      })
    } else {
      lines.push({ text: '\nBelum ada pengukuran.', options: { fontSize: 8, color: COLORS.TEXT_SECONDARY, italic: true } })
    }
  })
  slide.addText(lines, { x: x + 0.15, y: y + 0.32, w: w - 0.3, h: h - 0.45, valign: 'top' })
}

// ── Footer ──────────────────────────────────────────────────────────────
function buildFooter(slide: pptxgen.Slide, data: CharterPayload): void {
  const { program } = data
  const { x, y, w, h } = LAYOUT.FOOTER
  const generated = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
  slide.addText([
    { text: 'ATLAS · ', options: { fontSize: 7, color: COLORS.TEXT_SECONDARY, bold: true } },
    { text: `Charter ${program.code} · ${program.currentMonth} · Diunduh ${generated}`, options: { fontSize: 7, color: COLORS.TEXT_SECONDARY } },
  ], { x, y, w, h, align: 'left', valign: 'middle' })
}

// ── helpers ─────────────────────────────────────────────────────────────
/**
 * Health label for the PPTX export.
 *
 * Per CHARTER_VIEW_PLAN.md section 7.1: the in-app UI keeps "Terlambat",
 * but the PPT manual format (and Pak Dirkeu's forum vocabulary outside
 * ATLAS) uses "Delayed" — so the exported deck matches that convention.
 * "Completed" is consistent between UI and PPTX.
 */
function healthLabel(health: string): string {
  switch (health) {
    case 'ON_TRACK':  return 'On Track'
    case 'AT_RISK':   return 'At Risk'
    case 'TERLAMBAT': return 'Delayed'
    case 'COMPLETED': return 'Completed'
    default:          return health
  }
}

function formatNum(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}
