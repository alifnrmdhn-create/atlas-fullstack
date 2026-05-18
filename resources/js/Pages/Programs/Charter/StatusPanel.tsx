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
 * Achievement % juga divisualkan sebagai progress bar besar supaya
 * panel terlihat informatif (bukan hanya angka mati).
 */
export function StatusPanel({ status }: Props) {
  const pct = status.achievementPct
  const tone = status.health.toLowerCase()
  const activityRatio = status.totalCount > 0 ? status.completedCount / status.totalCount : 0
  return (
    <div className="cs-status">
      <div className="cs-status__head">
        <span className="cs-status__label">% Achievement</span>
      </div>
      <div className="cs-status__big">
        {pct !== null ? `${pct}%` : '—'}
      </div>
      {pct !== null && (
        <div className={`cs-status__bar cs-status__bar--${tone}`} role="presentation" aria-hidden="true">
          <div
            className="cs-status__bar-fill"
            style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
          />
        </div>
      )}
      <div className="cs-status__health-row">
        <span className={`cs-status__dot cs-status__dot--${tone}`} />
        <span className="cs-status__health-label">{HEALTH_LABEL[status.health]}</span>
      </div>
      {status.totalCount > 0 && (
        <div className="cs-status__breakdown">
          <span className="cs-status__breakdown-num">{status.completedCount}</span>
          <span className="cs-status__breakdown-sep">/</span>
          <span className="cs-status__breakdown-total">{status.totalCount}</span>
          <span className="cs-status__breakdown-label">aktivitas selesai</span>
          {/* Mini progress ratio activity completion — visual untuk tracking. */}
          <div className="cs-status__activity-track" role="presentation" aria-hidden="true">
            <div
              className={`cs-status__activity-fill cs-status__activity-fill--${tone}`}
              style={{ width: `${Math.round(activityRatio * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
