import type { CharterStatus, CharterHealth } from '../../../types/charter'

type Props = {
  status: CharterStatus
}

const HEALTH_LABEL: Record<CharterHealth, string> = {
  ON_TRACK:  'On Track',
  AT_RISK:   'At Risk',
  TERLAMBAT: 'Terlambat',
  COMPLETED: 'Completed',
}

/**
 * Side-rail status block — big % achievement number + health label
 * + activity completion breakdown. Pattern A: flat, hairline divider.
 */
export function StatusPanel({ status }: Props) {
  return (
    <div className="cs-status">
      <div className="cs-status__head">
        <span className="cs-status__label">% Achievement</span>
      </div>
      <div className="cs-status__big">
        {status.achievementPct !== null ? `${status.achievementPct}%` : '—'}
      </div>
      <div className="cs-status__health-row">
        <span
          className={`cs-status__dot cs-status__dot--${status.health.toLowerCase()}`}
          style={{ backgroundColor: status.badgeColor }}
        />
        <span className="cs-status__health-label">{HEALTH_LABEL[status.health]}</span>
      </div>
      {status.totalCount > 0 && (
        <div className="cs-status__breakdown">
          <span className="cs-status__breakdown-num">{status.completedCount}</span>
          <span className="cs-status__breakdown-sep">/</span>
          <span className="cs-status__breakdown-total">{status.totalCount}</span>
          <span className="cs-status__breakdown-label">aktivitas selesai</span>
        </div>
      )}
    </div>
  )
}
