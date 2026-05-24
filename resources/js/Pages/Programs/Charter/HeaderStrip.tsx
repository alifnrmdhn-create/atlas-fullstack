import type { ReactNode } from 'react'
import type { CharterProgram, CharterStatus, CharterKpi, CharterHealth } from '../../../types/charter'

type Props = {
  program: CharterProgram
  status: CharterStatus
  kpi: CharterKpi
  /** Right-aligned action slot. Charter.tsx passes <ExportButton/> here. */
  actionSlot?: ReactNode
}

const HEALTH_LABEL: Record<CharterHealth, string> = {
  ON_TRACK:  'On Track',
  AT_RISK:   'At Risk',
  TERLAMBAT: 'Terlambat',
  COMPLETED: 'Completed',
}

/** Format "YYYY-MM" → "Mei 2026" natural Indonesian month. */
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function formatYearMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const mi = parseInt(m, 10) - 1
  if (Number.isNaN(mi) || mi < 0 || mi > 11) return ym
  return `${MONTH_ID[mi]} ${y}`
}

/**
 * Top metadata strip — Title row (code chip + program name + status/actions)
 * di atas, kemudian grid 4-kolom: Strategic Objective, KPI, PIC, Period.
 */
export function HeaderStrip({ program, status, kpi, actionSlot }: Props) {
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
            {HEALTH_LABEL[status.health]}
          </span>
          {actionSlot ?? (
            <button
              type="button"
              className="charter-export-button cs-export"
              disabled
              title="Tersedia di Phase 3"
            >
              Export PPTX
            </button>
          )}
        </div>
      </div>

      <div className="cs-header__col cs-header__col--so">
        <div className="cs-header__label">Strategic Objective</div>
        <div className="cs-header__so" title={program.strategicObjective ?? undefined}>
          {program.strategicObjective ?? '—'}
        </div>
        {program.pillarLabel && (
          <div className="cs-header__pillar">{program.pillarLabel}</div>
        )}
      </div>

      <div className="cs-header__col">
        <div className="cs-header__label">KPI Utama</div>
        {kpi ? (
          <>
            <div className="cs-header__value">{kpi.name}</div>
            <div className="cs-header__sub">Target {kpi.target.toLocaleString('id-ID')} {kpi.unit}</div>
          </>
        ) : (
          <div className="cs-header__sub cs-header__sub--muted">Non-Scorecard</div>
        )}
      </div>

      <div className="cs-header__col">
        <div className="cs-header__label">PIC</div>
        <div className="cs-header__value">{program.pic.name}</div>
        <div className="cs-header__sub">{program.pic.position}</div>
      </div>

      <div className="cs-header__col">
        <div className="cs-header__label">Periode</div>
        <div className="cs-header__value">
          {formatYearMonth(program.period.from)} → {formatYearMonth(program.period.to)}
        </div>
        <div className="cs-header__sub">
          {program.directorateName} · {program.divisionName}
        </div>
      </div>
    </header>
  )
}
