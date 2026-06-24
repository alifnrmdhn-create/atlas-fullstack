import { useTranslation } from 'react-i18next'
import i18n from '../../../lib/i18n'
import type { CharterStatus, CharterHealth } from '../../../types/charter'

type Props = {
  status: CharterStatus
}

const healthLabel = (health: CharterHealth): string => {
  const LABELS: Record<CharterHealth, string> = {
    ON_TRACK:  i18n.t('On Track'),
    AT_RISK:   i18n.t('At Risk'),
    TERLAMBAT: i18n.t('Delayed'),
    COMPLETED: i18n.t('Completed'),
  }
  return LABELS[health]
}

/**
 * Side-rail status block — big % achievement number + health label
 * + activity completion breakdown. Pattern A: flat, hairline divider.
 * Achievement % juga divisualkan sebagai progress bar besar supaya
 * panel terlihat informatif (bukan hanya angka mati).
 *
 * Fallback (2026-05-21): kalau achievementPct null (belum ada planned weeks
 * di periode current), tampilkan task completion % sebagai fallback. Sebelumnya
 * "—" tidak informatif untuk user yang mau pantau progres.
 */
export function StatusPanel({ status }: Props) {
  const { t } = useTranslation()
  const tone = status.health.toLowerCase()
  const activityRatio = status.totalCount > 0 ? status.completedCount / status.totalCount : 0
  const activityPct = Math.round(activityRatio * 100)
  // Priority: achievement (planned vs realized weeks) → fallback ke task
  // completion. Label berubah dinamis sesuai data source.
  const hasAchievement = status.achievementPct !== null
  const hasTasks = status.totalCount > 0
  const displayPct = hasAchievement ? status.achievementPct! : (hasTasks ? activityPct : null)
  const displayLabel = hasAchievement ? t('% Achievement') : (hasTasks ? t('% Activities Done') : t('% Progress'))
  return (
    <div className="cs-status">
      <div className="cs-status__head">
        <span className="cs-status__label">{displayLabel}</span>
      </div>
      <div className="cs-status__big">
        {displayPct !== null ? `${displayPct}%` : '—'}
      </div>
      {/* Progress bar selalu render — even at 0% atau null. Empty bar
          menunjukkan "ada progress untuk dipantau, posisi 0%" — bukan
          "tidak ada info" (yang adalah pesan dari "—" tanpa bar). */}
      <div className={`cs-status__bar cs-status__bar--${tone}`} role="presentation" aria-hidden="true">
        <div
          className="cs-status__bar-fill"
          style={{ width: `${displayPct !== null ? Math.max(2, Math.min(100, displayPct)) : 0}%` }}
        />
      </div>
      <div className="cs-status__health-row">
        <span className={`cs-status__dot cs-status__dot--${tone}`} />
        <span className="cs-status__health-label">{healthLabel(status.health)}</span>
      </div>
      {status.totalCount > 0 && (
        <div className="cs-status__breakdown">
          <span className="cs-status__breakdown-num">{status.completedCount}</span>
          <span className="cs-status__breakdown-sep">/</span>
          <span className="cs-status__breakdown-total">{status.totalCount}</span>
          <span className="cs-status__breakdown-label">{t('activities done')}</span>
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
