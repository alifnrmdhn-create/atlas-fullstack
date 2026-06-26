import { Fragment, useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MONTH_KEYS, type CharterActivity, type CharterPeriod } from '../../../types/charter'
import { useCanHover } from '../../../hooks/useCanHover'

type Props = {
  activities: CharterActivity[]
  period?: CharterPeriod
  /** "YYYY-MM" — server `now()`, dipakai untuk garis penanda "posisi sekarang". */
  currentMonth?: string
  /** "YYYY-MM-DD" — server `now()`, satu sumber untuk teks tooltip "Now"
   *  (tanggal + minggu ISO). Konsisten dengan garis (yang pakai currentMonth).
   *  Fallback ke jam klien hanya bila tak dikirim. */
  today?: string
}

/** Satu baris tooltip marker — dipetakan ke warna garisnya (biru/merah). */
type TipRow = { kind: 'now' | 'deadline'; label: string; detail: string }

/**
 * 12-month timeline — one Activity = 2 rows (Target / Real).
 *
 * Premium pass (2026-06):
 *   - Target = track tipis (light), Real = bar pill MENERUS (solid hijau /
 *     oranye saat below). Sel sebulan yang bersebelahan & sejenis menyatu
 *     jadi satu pill (rounding hanya di ujung run) — bukan blok terputus.
 *   - Kolom Workstream jadi caption grup bila semua aktivitas satu workstream;
 *     kolom Deliverable disembunyikan bila semua kosong (anti-noise).
 *   - Dua garis penanda waktu (saran Pak Iswahyudi): garis biru = bulan
 *     berjalan ("sekarang"), garis merah putus-putus = bulan target selesai.
 *
 * Months derived server-side dari plannedWeeks / actualWeeks via
 * WeekToMonthMapper. A week that spans two months counts for both.
 */
export function ActivityTimelineTable({ activities, period, currentMonth, today }: Props) {
  const { t } = useTranslation()
  const canHover = useCanHover()
  const [tip, setTip] = useState<{ x: number; y: number; rows: TipRow[]; colIdx: number } | null>(null)

  // Touch: tooltip dibuka via tap (bukan hover) → tutup saat tap di luar / scroll
  // (posisi fixed jadi basi saat konten bergeser). Listener dipasang di frame
  // BERIKUTNYA: kalau langsung, event sisa dari tap pembuka (mis. scroll residual
  // momentum / klik yang sama) menutup tooltip seketika. `click` (bukan
  // `pointerdown`) + stopPropagation di sel marker → tap-ulang sel sama toggle
  // tutup tanpa re-open.
  useEffect(() => {
    if (!tip || canHover) return
    const close = () => setTip(null)
    const raf = requestAnimationFrame(() => {
      document.addEventListener('click', close)
      window.addEventListener('scroll', close, true)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [tip, canHover])
  if (activities.length === 0) {
    return (
      <div className="atl-empty">
        {t('No activities yet. Add tasks to a workstream to populate the timeline.')}
      </div>
    )
  }

  // Multi-year: range label; single-year: angka tahun saja.
  const yearFrom = period?.from?.slice(0, 4) ?? null
  const yearTo = period?.to?.slice(0, 4) ?? null
  const year = yearFrom && yearTo && yearFrom !== yearTo
    ? `${yearFrom} – ${yearTo}`
    : yearFrom

  // Penanda waktu. Kolom = tahun `yearFrom` (Jan..Des). Sentinel 12 = di luar
  // (setelah Des) → garis di tepi kanan kolom terakhir.
  const columnYear = yearFrom ? Number.parseInt(yearFrom, 10) : null
  const monthIndexInView = (ym?: string | null): number | null => {
    if (!ym || columnYear == null) return null
    const [yStr, mStr] = ym.split('-')
    const y = Number(yStr)
    const mo = Number(mStr)
    if (!y || !mo) return null
    if (y < columnYear) return null
    if (y > columnYear) return 12
    return mo - 1
  }
  const nowIdx = monthIndexInView(currentMonth)
  const targetIdx = monthIndexInView(period?.to)

  const markerClass = (i: number): string => {
    const parts: string[] = []
    if (nowIdx === i) parts.push('atl-col-now')
    else if (nowIdx === 12 && i === 11) parts.push('atl-col-now--past')
    if (targetIdx === i) parts.push('atl-col-deadline')
    else if (targetIdx === 12 && i === 11) parts.push('atl-col-deadline--past')
    return parts.join(' ')
  }

  const monthLabel = (ym?: string | null): string | null => {
    if (!ym) return null
    const [yStr, mStr] = ym.split('-')
    const mo = Number(mStr)
    if (!mo || mo < 1 || mo > 12) return null
    return `${MONTH_KEYS[mo - 1]} ${yStr}`
  }
  const nowLabel = monthLabel(currentMonth)
  const targetLabel = monthLabel(period?.to)

  // Tooltip detail saat hover garis penanda — tanggal + minggu ISO.
  const isoWeek = (d: Date): number => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - dayNum + 3)
    const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
    return 1 + Math.round((date.getTime() - firstThu.getTime()) / 6.048e8)
  }
  // Sumber "Now" = server `today` (YYYY-MM-DD), sama dgn garis. Fallback jam
  // klien hanya bila prop tak dikirim (caller lama).
  const nowDate = (() => {
    if (today) {
      const [y, mo, d] = today.split('-').map(Number)
      if (y && mo && d) return new Date(y, mo - 1, d)
    }
    return new Date()
  })()
  const nowRow: TipRow = {
    kind: 'now',
    label: t('Now'),
    detail: `${t('Week {{w}}', { w: isoWeek(nowDate) })} · ${nowDate.getDate()} ${MONTH_KEYS[nowDate.getMonth()]} ${nowDate.getFullYear()}`,
  }
  const targetRow: TipRow | null = (() => {
    if (!period?.to) return null
    const [ty, tm] = period.to.split('-').map(Number)
    if (!ty || !tm) return null
    const lastDay = new Date(ty, tm, 0).getDate() // hari-0 bulan berikutnya = hari terakhir bulan target
    return { kind: 'deadline', label: t('Target finish'), detail: `${lastDay} ${MONTH_KEYS[tm - 1]} ${ty}` }
  })()
  const markerRows = (i: number): TipRow[] => {
    const rows: TipRow[] = []
    if (nowIdx === i || (nowIdx === 12 && i === 11)) rows.push(nowRow)
    if ((targetIdx === i || (targetIdx === 12 && i === 11)) && targetRow) rows.push(targetRow)
    return rows
  }
  // Tooltip kustom (portal ke body → tidak terpotong overflow tabel). Tiap
  // marker = satu baris berlabel + dot/dash warna garisnya (bukan string lebur).
  // Clamp X agar pill tak keluar viewport di layar sempit (transform center).
  const clampX = (x: number) => Math.min(Math.max(x, 130), window.innerWidth - 130)
  const tipProps = (i: number) => {
    const rows = markerRows(i)
    if (!rows.length) return {}
    if (canHover) {
      // Desktop: hover mengikuti kursor.
      const show = (e: MouseEvent) => setTip({ x: clampX(e.clientX), y: e.clientY, rows, colIdx: i })
      return { onMouseEnter: show, onMouseMove: show, onMouseLeave: () => setTip(null) }
    }
    // Touch: tap meng-toggle. stopPropagation supaya listener `click` dokumen
    // (dismiss) tak ikut terpicu oleh tap yang membuka/menutup ini.
    const toggle = (e: MouseEvent) => {
      e.stopPropagation()
      setTip(prev => (prev && prev.colIdx === i ? null : { x: clampX(e.clientX), y: e.clientY, rows, colIdx: i }))
    }
    return { onClick: toggle, style: { cursor: 'pointer' } as const }
  }

  // Anti-noise: kolom Workstream → caption grup bila tunggal; Deliverable
  // disembunyikan bila semua aktivitas kosong.
  const workstreams = Array.from(new Set(activities.map(a => a.workstream).filter(Boolean)))
  const singleWorkstream = workstreams.length === 1 ? workstreams[0] : null
  const showWorkstreamCol = workstreams.length > 1
  const showDeliverableCol = activities.some(a => a.deliverable)

  // Bar pill menerus: render inner span; rounding hanya di ujung run (state
  // berbeda dengan tetangga). Sel sejenis bersebelahan menyatu mulus.
  const renderBar = (states: string[], i: number) => {
    const s = states[i]
    if (!s) return null
    const start = i === 0 || states[i - 1] !== s
    const end = i === 11 || states[i + 1] !== s
    return <span className={`atl-bar atl-bar--${s}${start ? ' is-start' : ''}${end ? ' is-end' : ''}`} />
  }

  return (
    <>
      <div className="atl-toolbar">
        {singleWorkstream && (
          <div className="atl-group">
            <span className="atl-group__label">{t('Workstream')}</span>
            <span className="atl-group__value">{singleWorkstream}</span>
          </div>
        )}
        <div className="atl-legend">
          <span className="atl-legend__item">
            <span className="atl-legend__chip atl-legend__chip--target" aria-hidden="true" />
            {t('Target')}
          </span>
          <span className="atl-legend__item">
            <span className="atl-legend__chip atl-legend__chip--real" aria-hidden="true" />
            {t('Real')}
          </span>
          {(nowLabel || targetLabel) && <span className="atl-legend__sep" aria-hidden="true" />}
          {nowLabel && (
            <span className="atl-legend__item">
              <span className="atl-legend__mark atl-legend__mark--now" aria-hidden="true" />
              {t('Now · {{month}}', { month: nowLabel })}
            </span>
          )}
          {targetLabel && (
            <span className="atl-legend__item">
              <span className="atl-legend__mark atl-legend__mark--deadline" aria-hidden="true" />
              {t('Target finish · {{month}}', { month: targetLabel })}
            </span>
          )}
        </div>
      </div>

      <div className="atl-wrap">
        <table className="atl-table" role="table">
          <thead>
            {year && (
              <tr>
                <th className="atl-head atl-head--name" rowSpan={2}>{t('Activity')}</th>
                {showWorkstreamCol && <th className="atl-head atl-head--workstream" rowSpan={2}>{t('Workstream')}</th>}
                {showDeliverableCol && <th className="atl-head atl-head--deliverable" rowSpan={2}>{t('Deliverable')}</th>}
                <th className="atl-head atl-head--label" rowSpan={2} />
                <th className="atl-year-row" colSpan={MONTH_KEYS.length}>{year}</th>
              </tr>
            )}
            <tr>
              {!year && (
                <>
                  <th className="atl-head atl-head--name">{t('Activity')}</th>
                  {showWorkstreamCol && <th className="atl-head atl-head--workstream">{t('Workstream')}</th>}
                  {showDeliverableCol && <th className="atl-head atl-head--deliverable">{t('Deliverable')}</th>}
                  <th className="atl-head atl-head--label" />
                </>
              )}
              {MONTH_KEYS.map((m, i) => (
                <th key={m} className={`atl-head atl-head--mon ${markerClass(i)}`.trimEnd()} {...tipProps(i)}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.map(activity => {
              const targetStates = MONTH_KEYS.map(m => (activity.months[m].target ? 'target' : ''))
              const realStates = MONTH_KEYS.map(m => {
                const c = activity.months[m]
                return c.realized ? 'realized' : c.below ? 'below' : ''
              })
              return (
                <Fragment key={activity.id}>
                  <tr className="atl-row atl-row--target">
                    <td className="atl-cell atl-cell--name" rowSpan={2}>{activity.name}</td>
                    {showWorkstreamCol && (
                      <td className="atl-cell atl-cell--workstream" rowSpan={2}>{activity.workstream || '—'}</td>
                    )}
                    {showDeliverableCol && (
                      <td className="atl-cell atl-cell--deliverable" rowSpan={2}>
                        {activity.deliverable ?? <span className="atl-muted">—</span>}
                      </td>
                    )}
                    <td className="atl-cell atl-cell--label">{t('Target')}</td>
                    {MONTH_KEYS.map((m, i) => (
                      <td key={m} className={`atl-cell atl-cell--mon ${markerClass(i)}`.trimEnd()} {...tipProps(i)}>
                        {renderBar(targetStates, i)}
                      </td>
                    ))}
                  </tr>
                  <tr className="atl-row atl-row--real">
                    <td className="atl-cell atl-cell--label">{t('Real')}</td>
                    {MONTH_KEYS.map((m, i) => (
                      <td key={m} className={`atl-cell atl-cell--mon ${markerClass(i)}`.trimEnd()} {...tipProps(i)}>
                        {renderBar(realStates, i)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {tip && createPortal(
        <div
          className={`atl-tip${tip.y < 80 ? ' atl-tip--below' : ''}`}
          role="tooltip"
          style={{ left: tip.x, top: tip.y < 80 ? tip.y + 18 : tip.y - 14 }}
        >
          {tip.rows.map(row => (
            <div key={row.kind} className="atl-tip__row">
              <span className={`atl-tip__mark atl-tip__mark--${row.kind}`} aria-hidden="true" />
              <span className="atl-tip__label">{row.label}</span>
              <span className="atl-tip__detail">{row.detail}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
