import { Fragment } from 'react'
import { MONTH_KEYS, type CharterKpiHistory } from '../../../types/charter'

type Props = {
  history: CharterKpiHistory
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return '—'
  // Compact id-ID number formatting with up to 2 decimals
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

/**
 * Bottom KPI table — one row per active KPI, two sub-rows (Target/Real)
 * across 12 months. Cells with real ≥ target are highlighted.
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
                  const above = cell.real !== null && cell.aboveTarget
                  return (
                    <td
                      key={m}
                      className={`kpt-cell kpt-cell--mon${above ? ' is-above' : ''}`}
                    >
                      {formatNumber(cell.real)}
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
