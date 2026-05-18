import { Fragment } from 'react'
import { MONTH_KEYS, type CharterCellStatus, type CharterKpiHistory } from '../../../types/charter'

type Props = {
  history: CharterKpiHistory
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

/** Symbol indikator capaian: ▲ above target, ● on target (±5%), ▼ below. */
function statusGlyph(status: CharterCellStatus): string {
  switch (status) {
    case 'above': return '▲'
    case 'on':    return '●'
    case 'below': return '▼'
    default:      return ''
  }
}

function statusAria(status: CharterCellStatus): string {
  switch (status) {
    case 'above': return 'di atas target'
    case 'on':    return 'sesuai target'
    case 'below': return 'di bawah target'
    default:      return 'belum diukur'
  }
}

/**
 * Bottom KPI table — one row per active KPI, two sub-rows (Target/Real)
 * across 12 months. Each Real cell shows a small status glyph (▲/●/▼)
 * mirroring DKMR PDF "Above/On/Below target" icons (slide 20).
 */
export function KpiProgressTable({ history }: Props) {
  if (history.rows.length === 0) {
    return <div className="kpt-empty">Belum ada riwayat KPI bulanan.</div>
  }

  return (
    <div className="kpt-wrap">
      <table className="kpt-table" role="table">
        <thead>
          <tr>
            <th className="kpt-head kpt-head--label">KPI</th>
            <th className="kpt-head kpt-head--label" />
            {MONTH_KEYS.map(m => (
              <th key={m} className="kpt-head kpt-head--mon">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.rows.map((row, idx) => (
            <Fragment key={`${idx}-${row.label}`}>
              <tr className="kpt-row kpt-row--target">
                <td className="kpt-cell kpt-cell--name" rowSpan={2}>{row.label}</td>
                <td className="kpt-cell kpt-cell--label">Target</td>
                {MONTH_KEYS.map(m => {
                  const cell = row.months[m]
                  return (
                    <td key={m} className="kpt-cell kpt-cell--mon">
                      {formatNumber(cell.target)}
                    </td>
                  )
                })}
              </tr>
              <tr className="kpt-row kpt-row--real">
                <td className="kpt-cell kpt-cell--label">Real</td>
                {MONTH_KEYS.map(m => {
                  const cell = row.months[m]
                  const status = cell.status ?? (cell.aboveTarget ? 'above' : 'na')
                  return (
                    <td
                      key={m}
                      className="kpt-cell kpt-cell--mon"
                      data-status={status}
                    >
                      <span className="kpt-cell__value">{formatNumber(cell.real)}</span>
                      {status !== 'na' && cell.real !== null && (
                        <span
                          className="kpt-cell__glyph"
                          data-status={status}
                          aria-label={statusAria(status)}
                          title={statusAria(status)}
                        >
                          {statusGlyph(status)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
