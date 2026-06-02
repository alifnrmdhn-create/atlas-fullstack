import type { CharterProgressLog } from '../../../types/charter'

type Props = {
  log: CharterProgressLog
}

/**
 * Side-rail "Update Saat Ini" — narrative from the most recent
 * ProgramProgressLog entry.
 */
export function UpdatePanel({ log }: Props) {
  return (
    <div className="cs-update">
      <div className="cs-update__head">
        <span className="cs-update__label">Current Update</span>
        {log.asOfMonth && <span className="cs-update__period">{log.asOfMonth}</span>}
      </div>
      {log.updateNote ? (
        <p className="cs-update__note">{log.updateNote}</p>
      ) : (
        <p className="cs-update__empty">No recent progress updates.</p>
      )}
    </div>
  )
}
