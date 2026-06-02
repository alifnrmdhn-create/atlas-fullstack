import { Fragment } from 'react'
import { MONTH_KEYS, type CharterActivity, type CharterPeriod } from '../../../types/charter'

type Props = {
  activities: CharterActivity[]
  period?: CharterPeriod
}

/**
 * 12-month timeline table — one Activity = 2 rows (Target / Real).
 *
 * Cell colors mirror DKMR May 2026 PPT slide 21:
 *   - Target row: light green where the month was planned (`target=true`)
 *   - Real row: dark green where realized, orange where below-target
 *     (planned month already past with no realization)
 *
 * Months derived server-side from `plannedWeeks` / `actualWeeks` via
 * WeekToMonthMapper. A week that spans two months counts for both.
 */
export function ActivityTimelineTable({ activities, period }: Props) {
  if (activities.length === 0) {
    return (
      <div className="atl-empty">
        No activities yet. Add tasks to a workstream to populate the timeline.
      </div>
    )
  }

  // Year context strip. Support multi-year programs:
  //   - Single year (from=2026, to=2026) → "2026"
  //   - Multi-year (from=2026-05, to=2027-04) → "2026 – 2027"
  // Note: month columns Jan..Des di-display per year fiscal yang dimulai;
  // multi-year tampil ambigu apakah column Jan = year-from atau year-to.
  // Range label memberi context cukup tanpa kompleksitas dual-row.
  const yearFrom = period?.from?.slice(0, 4) ?? null
  const yearTo = period?.to?.slice(0, 4) ?? null
  const year = yearFrom && yearTo && yearFrom !== yearTo
    ? `${yearFrom} – ${yearTo}`
    : yearFrom

  return (
    <div className="atl-wrap">
      <table className="atl-table" role="table">
        <thead>
          {year && (
            <tr>
              <th className="atl-head atl-head--name" rowSpan={2}>Aktivitas</th>
              <th className="atl-head atl-head--workstream" rowSpan={2}>Workstream</th>
              <th className="atl-head atl-head--deliverable" rowSpan={2}>Deliverable</th>
              <th className="atl-head atl-head--label" rowSpan={2} />
              <th className="atl-year-row" colSpan={MONTH_KEYS.length}>{year}</th>
            </tr>
          )}
          <tr>
            {!year && (
              <>
                <th className="atl-head atl-head--name">Aktivitas</th>
                <th className="atl-head atl-head--workstream">Workstream</th>
                <th className="atl-head atl-head--deliverable">Deliverable</th>
                <th className="atl-head atl-head--label" />
              </>
            )}
            {MONTH_KEYS.map(m => (
              <th key={m} className="atl-head atl-head--mon">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activities.map(activity => (
            <Fragment key={activity.id}>
              <tr className="atl-row atl-row--target">
                <td className="atl-cell atl-cell--name" rowSpan={2}>{activity.name}</td>
                <td className="atl-cell atl-cell--workstream" rowSpan={2}>{activity.workstream || '—'}</td>
                <td className="atl-cell atl-cell--deliverable" rowSpan={2}>
                  {activity.deliverable ?? <span className="atl-muted">—</span>}
                </td>
                <td className="atl-cell atl-cell--label">Target</td>
                {MONTH_KEYS.map(m => {
                  const cell = activity.months[m]
                  return (
                    <td
                      key={m}
                      className={`atl-cell atl-cell--mon${cell.target ? ' is-target' : ''}`}
                      aria-label={cell.target ? `Target ${m}` : undefined}
                    />
                  )
                })}
              </tr>
              <tr className="atl-row atl-row--real">
                <td className="atl-cell atl-cell--label">Real</td>
                {MONTH_KEYS.map(m => {
                  const cell = activity.months[m]
                  const state = cell.realized ? 'realized' : cell.below ? 'below' : ''
                  return (
                    <td
                      key={m}
                      className={`atl-cell atl-cell--mon${state ? ` is-${state}` : ''}`}
                      aria-label={
                        cell.realized ? `Realized ${m}` :
                        cell.below ? `Below target ${m}` : undefined
                      }
                    />
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
