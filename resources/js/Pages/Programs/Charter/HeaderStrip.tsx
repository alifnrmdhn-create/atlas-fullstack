import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { charterHealthLabel } from '../../../lib/status'
import type { CharterProgram, CharterStatus, CharterKpi, CharterHealth } from '../../../types/charter'

type Props = {
  program: CharterProgram
  status: CharterStatus
  kpi: CharterKpi
  /** Right-aligned action slot. Charter.tsx passes <ExportButton/> here. */
  actionSlot?: ReactNode
}

function healthLabel(health: CharterHealth): string {
  return charterHealthLabel(health)
}

/** Format "YYYY-MM" → "May 2026". */
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatYearMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const mi = parseInt(m, 10) - 1
  if (Number.isNaN(mi) || mi < 0 || mi > 11) return ym
  return `${MONTH_ID[mi]} ${y}`
}

/** Jumlah bulan inklusif antara dua "YYYY-MM" (>=0). */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(n => parseInt(n, 10))
  const [ty, tm] = to.split('-').map(n => parseInt(n, 10))
  if ([fy, fm, ty, tm].some(Number.isNaN)) return 0
  return (ty - fy) * 12 + (tm - fm)
}

/**
 * Top metadata strip — Title row (code chip + program name + status/actions)
 * di atas, kemudian grid 4-kolom: Strategic Objective, KPI, PIC, Period.
 */
export function HeaderStrip({ program, status, kpi, actionSlot }: Props) {
  const { t } = useTranslation()
  return (
    <header className="cs-header">
      <div className="cs-header__title">
        <div className="cs-header__title-left">
          <span className="cs-header__code">{program.code}</span>
          <h1 className="cs-header__name" title={program.name}>{program.name}</h1>
        </div>
        <div className="cs-header__title-right">
          {/* Health badge — sentence case (CSS) + subtle bg only, no inline color
              override yang clash dengan modern flat style. */}
          <span className={`cs-health cs-health--${status.health.toLowerCase()}`}>
            {healthLabel(status.health)}
          </span>
          {actionSlot ?? (
            <button
              type="button"
              className="charter-export-button cs-export"
              disabled
              title={t('Available in Phase 3')}
            >
              {t('Export PPTX')}
            </button>
          )}
        </div>
      </div>

      <div className="cs-header__col cs-header__col--so">
        <div className="cs-header__label">{t('Strategic Objective')}</div>
        <div className="cs-header__so" title={program.strategicObjective ?? undefined}>
          {program.strategicObjective ?? '—'}
        </div>
        {program.pillarLabel && (
          <div className="cs-header__pillar">{program.pillarLabel}</div>
        )}
      </div>

      <div className="cs-header__col">
        <div className="cs-header__label">{t('Primary KPI')}</div>
        {kpi ? (
          <>
            <div className="cs-header__value">{kpi.name}</div>
            <div className="cs-header__sub">{t('Target {{value}} {{unit}}', { value: kpi.target.toLocaleString('en-US'), unit: kpi.unit })}</div>
          </>
        ) : (
          // kpi null = belum ada KpiDefinition (APMS maupun internal). Tampilkan
          // sebagai state yang DIRANCANG (diukur via penyelesaian aktivitas),
          // bukan "Not set" yang berkesan lupa diisi.
          <>
            <div className="cs-header__value">{t('Activity completion')}</div>
            <div className="cs-header__sub">{t('No numeric KPI defined')}</div>
          </>
        )}
      </div>

      <div className="cs-header__col">
        <div className="cs-header__label">{t('PIC')}</div>
        <div className="cs-header__value">{program.pic.name}</div>
        <div className="cs-header__sub">{program.pic.position}</div>
      </div>

      <div className="cs-header__col">
        <div className="cs-header__label">{t('Period')}</div>
        <div className="cs-header__value">
          {formatYearMonth(program.period.from)} → {formatYearMonth(program.period.to)}
        </div>
        {(() => {
          const span = monthsBetween(program.period.from, program.period.to) + 1
          if (span <= 0) return null
          const pos = Math.min(span, Math.max(1, monthsBetween(program.period.from, program.currentMonth) + 1))
          return (
            <div className="cs-header__meta">
              {t('{{count}} months', { count: span })}
              <span className="cs-header__meta-dot">·</span>
              {t('month {{pos}} of {{span}}', { pos, span })}
            </div>
          )
        })()}
        <div className="cs-header__sub">
          {program.directorateName} · {program.divisionName}
        </div>
      </div>
    </header>
  )
}
