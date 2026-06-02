import pptxgen from 'pptxgenjs'
import { COLORS, slugify } from './charterTemplate'

/**
 * Executive Summary PPTX export — Gap #1.
 *
 * Multi-slide brief mirror PDF DKMR slide 2:
 *   Slide 1: Hero KPI achievement (4-6 angka direktorat)
 *   Slide 2: Status program 4-card + Highlight KPI positif
 *   Slide 3: Perhatian khusus (At Risk / Terlambat) + Leaderboard BOD
 *
 * File didownload lewat browser, tidak ada server round-trip.
 */

type DirektoratCard = {
  kode: string
  nama: string
  nilai: number
  divisi: { kode: string; nama: string; nilai: number }[]
}

type StatusBreakdown = {
  total: number
  onTrack: number
  atRisk: number
  terlambat: number
  completed: number
  pctOnTrack: number
  pctAtRisk: number
  pctTerlambat: number
  pctCompleted: number
}

type PerhatianItem = {
  id: number
  code: string
  name: string
  status: 'At Risk' | 'Delayed'
  deadline: string | null
  daysLeft: number | null
  dukungan: string | null
  progress: string | null
}

type InsightBullet = {
  kpi: string
  realisasi: string
  sasaran: string
  ratio: number
  satuan: string | null
}

type Performer = {
  rank: number
  nama: string
  jabatan: string
  unit: string
  nilai: number
}

export type ExecutiveSummaryPayload = {
  direktoratGrid: DirektoratCard[]
  trend: { periodes: { key: string; label: string }[]; series: { kode: string; nama: string; values: (number | null)[] }[] }
  programStatusBreakdown: StatusBreakdown
  perhatianKhusus: PerhatianItem[]
  insight: { positif: InsightBullet[]; perhatian: InsightBullet[] }
  leaderboard: Record<string, Performer[]>
  periode: string
  periodeLabel: string
}

const PAGE = { W: 13.333, H: 7.5 } as const

function scoreColor(nilai: number): string {
  if (nilai >= 100) return COLORS.PRIMARY
  if (nilai >= 80)  return COLORS.AT_RISK
  return COLORS.DELAYED
}

export async function exportExecutiveSummary(data: ExecutiveSummaryPayload): Promise<void> {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'
  pres.title = `Executive Summary — ${data.periodeLabel}`

  buildSlideHero(pres, data)
  buildSlideStatus(pres, data)
  buildSlideAttention(pres, data)

  const filename = `Executive_Summary_${slugify(data.periodeLabel)}.pptx`
  await pres.writeFile({ fileName: filename })
}

// ── Slide 1: Hero KPI 4-6 angka ─────────────────────────────────
function buildSlideHero(pres: pptxgen, data: ExecutiveSummaryPayload): void {
  const slide = pres.addSlide()
  slide.background = { color: 'FFFFFF' }

  // Title bar
  slide.addText('Executive Summary — Monitoring Program Kerja', {
    x: 0.3, y: 0.25, w: 12.7, h: 0.45,
    fontSize: 22, bold: true, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
  })
  slide.addText(`Periode s.d. ${data.periodeLabel}`, {
    x: 0.3, y: 0.7, w: 12.7, h: 0.3,
    fontSize: 12, color: COLORS.TEXT_SECONDARY, fontFace: 'Calibri',
  })

  // Section label
  slide.addText('CAPAIAN TARGET KPI', {
    x: 0.3, y: 1.15, w: 12.7, h: 0.35,
    fontSize: 11, bold: true, color: COLORS.PRIMARY, fontFace: 'Calibri',
  })

  // 4-6 cards in grid
  const cards = data.direktoratGrid.slice(0, 6)
  const cardW = 2.05
  const cardH = 1.7
  const gap = 0.15
  const totalW = cards.length * cardW + (cards.length - 1) * gap
  const startX = (PAGE.W - totalW) / 2

  cards.forEach((card, i) => {
    const x = startX + i * (cardW + gap)
    const y = 1.6
    const color = scoreColor(card.nilai)

    slide.addShape('rect', {
      x, y, w: cardW, h: cardH,
      fill: { color: 'FAFAFA' },
      line: { color: COLORS.BORDER, width: 0.5 },
    })
    slide.addText(card.kode, {
      x: x + 0.1, y: y + 0.1, w: cardW - 0.2, h: 0.25,
      fontSize: 9, bold: true, color: COLORS.TEXT_MUTED, fontFace: 'Calibri',
    })
    slide.addText(card.nama, {
      x: x + 0.1, y: y + 0.32, w: cardW - 0.2, h: 0.4,
      fontSize: 10, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
    })
    slide.addText(`${card.nilai.toFixed(1)}%`, {
      x: x + 0.1, y: y + 0.75, w: cardW - 0.2, h: 0.55,
      fontSize: 24, bold: true, color, fontFace: 'Calibri',
    })
    // Mini status: "X% di atas target" / "X% di bawah target"
    const diff = (card.nilai - 100).toFixed(1)
    const status = card.nilai >= 100 ? `+${diff}% vs target` : `${diff}% vs target`
    slide.addText(status, {
      x: x + 0.1, y: y + 1.35, w: cardW - 0.2, h: 0.25,
      fontSize: 9, color: COLORS.TEXT_SECONDARY, fontFace: 'Calibri',
    })
  })

  // Trend chart area (right-side under heading)
  if (data.trend.series.length > 0) {
    const trendY = 3.5
    slide.addText('TREN SKOR KPI 6 BULAN', {
      x: 0.3, y: trendY, w: 12.7, h: 0.3,
      fontSize: 11, bold: true, color: COLORS.PRIMARY, fontFace: 'Calibri',
    })

    // Pivot to recharts-compatible shape for native pptxgen bar chart
    const chartData = data.trend.series.map(s => ({
      name: s.nama,
      labels: data.trend.periodes.map(p => p.label),
      values: s.values.map(v => (v ?? 0)),
    }))
    slide.addChart('bar' as never, chartData, {
      x: 0.5, y: trendY + 0.35, w: 12.3, h: 3.3,
      barGrouping: 'clustered',
      barDir: 'col',
      valAxisMinVal: 0,
      valAxisMaxVal: 110,
      catAxisLabelFontSize: 9,
      valAxisLabelFontSize: 9,
      showLegend: true,
      legendPos: 'b',
      legendFontSize: 9,
      chartColors: ['00875A', 'A855F7', 'F97316', '0EA5E9', '06B6D4', 'EAB308'],
    })
  }

  // Footer
  slide.addText('© Direktorat Keuangan & Manajemen Risiko · Generated by ATLAS', {
    x: 0.3, y: 7.1, w: 12.7, h: 0.3,
    fontSize: 8, color: COLORS.TEXT_MUTED, italic: true, fontFace: 'Calibri',
  })
}

// ── Slide 2: Status program + Insight positif ───────────────────
function buildSlideStatus(pres: pptxgen, data: ExecutiveSummaryPayload): void {
  const slide = pres.addSlide()
  slide.background = { color: 'FFFFFF' }

  slide.addText('Status Program & Highlight Capaian', {
    x: 0.3, y: 0.25, w: 12.7, h: 0.45,
    fontSize: 20, bold: true, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
  })
  slide.addText(`Periode s.d. ${data.periodeLabel} · ${data.programStatusBreakdown.total} program aktif`, {
    x: 0.3, y: 0.7, w: 12.7, h: 0.3,
    fontSize: 11, color: COLORS.TEXT_SECONDARY, fontFace: 'Calibri',
  })

  // Status 4-card row
  const statuses: Array<{ label: string; count: number; pct: number; color: string }> = [
    { label: 'On Track',  count: data.programStatusBreakdown.onTrack,   pct: data.programStatusBreakdown.pctOnTrack,   color: COLORS.PRIMARY },
    { label: 'Completed', count: data.programStatusBreakdown.completed, pct: data.programStatusBreakdown.pctCompleted, color: '2563EB' },
    { label: 'At Risk',   count: data.programStatusBreakdown.atRisk,    pct: data.programStatusBreakdown.pctAtRisk,    color: COLORS.AT_RISK },
    { label: 'Delayed', count: data.programStatusBreakdown.terlambat, pct: data.programStatusBreakdown.pctTerlambat, color: COLORS.DELAYED },
  ]

  statuses.forEach((s, i) => {
    const cardW = 3.0
    const cardH = 1.4
    const gap = 0.15
    const startX = (PAGE.W - (4 * cardW + 3 * gap)) / 2
    const x = startX + i * (cardW + gap)
    const y = 1.3

    slide.addShape('rect', {
      x, y, w: cardW, h: cardH,
      fill: { color: 'FAFAFA' },
      line: { color: s.color, width: 1.5 },
    })
    slide.addText(String(s.count), {
      x, y: y + 0.15, w: cardW, h: 0.7,
      fontSize: 36, bold: true, color: s.color, align: 'center', fontFace: 'Calibri',
    })
    slide.addText(s.label, {
      x, y: y + 0.85, w: cardW, h: 0.3,
      fontSize: 12, bold: true, color: COLORS.TEXT_PRIMARY, align: 'center', fontFace: 'Calibri',
    })
    slide.addText(`${s.pct}% dari total`, {
      x, y: y + 1.1, w: cardW, h: 0.25,
      fontSize: 10, color: COLORS.TEXT_SECONDARY, align: 'center', fontFace: 'Calibri',
    })
  })

  // Insight Positif + Perhatian
  const insightY = 3.1
  slide.addText('HIGHLIGHT CAPAIAN KPI', {
    x: 0.3, y: insightY, w: 12.7, h: 0.3,
    fontSize: 11, bold: true, color: COLORS.PRIMARY, fontFace: 'Calibri',
  })

  const colW = 6.2
  const colH = 3.5
  const colStartY = insightY + 0.4

  // Positif column
  slide.addShape('rect', {
    x: 0.3, y: colStartY, w: colW, h: colH,
    fill: { color: 'F0FDF4' },
    line: { color: COLORS.PRIMARY, width: 0.5 },
  })
  slide.addText('✓ Capaian Positif', {
    x: 0.5, y: colStartY + 0.1, w: colW - 0.4, h: 0.3,
    fontSize: 12, bold: true, color: COLORS.PRIMARY, fontFace: 'Calibri',
  })
  const positifLines = data.insight.positif.map(b => {
    const unit = b.satuan && b.satuan !== '-' ? ` ${b.satuan}` : ''
    return { text: `• ${b.kpi}: ${b.realisasi}${unit} (target ${b.sasaran}${unit}, ${(b.ratio * 100).toFixed(0)}%)`, options: { breakLine: true } }
  })
  if (positifLines.length === 0) {
    positifLines.push({ text: '— Tidak ada KPI di atas +5% target.', options: { breakLine: true } })
  }
  slide.addText(positifLines, {
    x: 0.5, y: colStartY + 0.5, w: colW - 0.4, h: colH - 0.6,
    fontSize: 10, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
  })

  // Perhatian column
  slide.addShape('rect', {
    x: 6.85, y: colStartY, w: colW, h: colH,
    fill: { color: 'FEF3C7' },
    line: { color: COLORS.AT_RISK, width: 0.5 },
  })
  slide.addText('⚠ Perlu Perhatian', {
    x: 7.05, y: colStartY + 0.1, w: colW - 0.4, h: 0.3,
    fontSize: 12, bold: true, color: COLORS.AT_RISK, fontFace: 'Calibri',
  })
  const perhatianLines = data.insight.perhatian.map(b => {
    const unit = b.satuan && b.satuan !== '-' ? ` ${b.satuan}` : ''
    return { text: `• ${b.kpi}: ${b.realisasi}${unit} (target ${b.sasaran}${unit}, ${(b.ratio * 100).toFixed(0)}%)`, options: { breakLine: true } }
  })
  if (perhatianLines.length === 0) {
    perhatianLines.push({ text: '— Semua KPI dalam toleransi ±5% target.', options: { breakLine: true } })
  }
  slide.addText(perhatianLines, {
    x: 7.05, y: colStartY + 0.5, w: colW - 0.4, h: colH - 0.6,
    fontSize: 10, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
  })

  slide.addText('© Direktorat Keuangan & Manajemen Risiko · Generated by ATLAS', {
    x: 0.3, y: 7.1, w: 12.7, h: 0.3,
    fontSize: 8, color: COLORS.TEXT_MUTED, italic: true, fontFace: 'Calibri',
  })
}

// ── Slide 3: Perhatian khusus + Leaderboard ─────────────────────
function buildSlideAttention(pres: pptxgen, data: ExecutiveSummaryPayload): void {
  const slide = pres.addSlide()
  slide.background = { color: 'FFFFFF' }

  slide.addText('Perhatian Khusus & Leaderboard', {
    x: 0.3, y: 0.25, w: 12.7, h: 0.45,
    fontSize: 20, bold: true, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
  })
  slide.addText(`Periode s.d. ${data.periodeLabel}`, {
    x: 0.3, y: 0.7, w: 12.7, h: 0.3,
    fontSize: 11, color: COLORS.TEXT_SECONDARY, fontFace: 'Calibri',
  })

  // ── Perhatian khusus (left side, top) ─────────
  slide.addText('PROGRAM PERHATIAN KHUSUS', {
    x: 0.3, y: 1.2, w: 7.5, h: 0.3,
    fontSize: 11, bold: true, color: COLORS.PRIMARY, fontFace: 'Calibri',
  })

  if (data.perhatianKhusus.length === 0) {
    slide.addText('— Tidak ada program At Risk / Terlambat di scope ini.', {
      x: 0.3, y: 1.6, w: 7.5, h: 0.4,
      fontSize: 11, color: COLORS.TEXT_MUTED, italic: true, fontFace: 'Calibri',
    })
  } else {
    const headerFill = { color: COLORS.PRIMARY }
    const rows: pptxgen.TableRow[] = [
      [
        { text: 'Status',    options: { fill: headerFill, color: 'FFFFFF', bold: true, fontSize: 9, align: 'left', valign: 'middle' } },
        { text: 'Program',   options: { fill: headerFill, color: 'FFFFFF', bold: true, fontSize: 9, align: 'left', valign: 'middle' } },
        { text: 'Deadline',  options: { fill: headerFill, color: 'FFFFFF', bold: true, fontSize: 9, align: 'left', valign: 'middle' } },
        { text: 'Dukungan',  options: { fill: headerFill, color: 'FFFFFF', bold: true, fontSize: 9, align: 'left', valign: 'middle' } },
      ],
      ...data.perhatianKhusus.slice(0, 5).map(p => ([
        {
          text: p.status,
          options: {
            color: 'FFFFFF',
            fill: { color: p.status === 'Delayed' ? COLORS.DELAYED : COLORS.AT_RISK },
            fontSize: 9, bold: true, align: 'center' as const, valign: 'middle' as const,
          },
        },
        { text: p.name, options: { fontSize: 9, color: COLORS.TEXT_PRIMARY, align: 'left' as const, valign: 'middle' as const } },
        {
          text: p.deadline ? `${p.deadline}${p.daysLeft !== null && p.daysLeft >= 0 ? ` (${p.daysLeft}h)` : ''}` : '—',
          options: { fontSize: 9, color: COLORS.TEXT_SECONDARY, align: 'left' as const, valign: 'middle' as const },
        },
        { text: p.dukungan || '—', options: { fontSize: 9, color: COLORS.TEXT_PRIMARY, align: 'left' as const, valign: 'middle' as const } },
      ])),
    ]

    slide.addTable(rows, {
      x: 0.3, y: 1.55, w: 7.5,
      colW: [1.2, 2.3, 1.5, 2.5],
      border: { type: 'solid', pt: 0.5, color: COLORS.BORDER },
      fontFace: 'Calibri',
    })
  }

  // ── Leaderboard (right side or below) ─────────
  slide.addText('LEADERBOARD KPI', {
    x: 8.0, y: 1.2, w: 5.0, h: 0.3,
    fontSize: 11, bold: true, color: COLORS.PRIMARY, fontFace: 'Calibri',
  })

  const bodLevels = Object.entries(data.leaderboard)
  bodLevels.forEach(([label, performers], idx) => {
    const x = 8.0
    const y = 1.6 + idx * 1.85
    slide.addText(label, {
      x, y, w: 5.0, h: 0.25,
      fontSize: 10, bold: true, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
    })
    performers.slice(0, 3).forEach((p, i) => {
      const rowY = y + 0.3 + i * 0.45
      // Rank bullet
      const medalColor = i === 0 ? 'F59E0B' : i === 1 ? '9CA3AF' : 'C2410C'
      slide.addShape('ellipse', {
        x, y: rowY, w: 0.3, h: 0.3,
        fill: { color: medalColor },
      })
      slide.addText(String(p.rank), {
        x, y: rowY, w: 0.3, h: 0.3,
        fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: 'Calibri',
      })
      // Name + unit
      slide.addText(p.nama, {
        x: x + 0.4, y: rowY, w: 3.5, h: 0.2,
        fontSize: 9, bold: true, color: COLORS.TEXT_PRIMARY, fontFace: 'Calibri',
      })
      slide.addText(`${p.jabatan} · ${p.unit}`, {
        x: x + 0.4, y: rowY + 0.18, w: 3.5, h: 0.18,
        fontSize: 7.5, color: COLORS.TEXT_SECONDARY, fontFace: 'Calibri',
      })
      // Nilai
      slide.addText(p.nilai.toFixed(2), {
        x: x + 4.0, y: rowY, w: 0.95, h: 0.3,
        fontSize: 10, bold: true, color: scoreColor(p.nilai), align: 'right', valign: 'middle', fontFace: 'Calibri',
      })
    })
  })

  slide.addText('© Direktorat Keuangan & Manajemen Risiko · Generated by ATLAS', {
    x: 0.3, y: 7.1, w: 12.7, h: 0.3,
    fontSize: 8, color: COLORS.TEXT_MUTED, italic: true, fontFace: 'Calibri',
  })
}
