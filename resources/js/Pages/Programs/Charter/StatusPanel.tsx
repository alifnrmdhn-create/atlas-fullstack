import { useTranslation } from 'react-i18next'
import { charterHealthLabel } from '../../../lib/status'
import type { CharterStatus, CharterHealth } from '../../../types/charter'

type Props = {
  status: CharterStatus
  /** "YYYY-MM" — server now(), untuk caption "as of" basis achievement. */
  asOfMonth?: string
}

// Delegasi ke sumber tunggal lib/status.ts (charterHealthLabel) — vocab identik.
const healthLabel = (health: CharterHealth): string => charterHealthLabel(health)

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatMonth(ym?: string): string | null {
  if (!ym) return null
  const [y, m] = ym.split('-')
  const mi = parseInt(m, 10) - 1
  if (Number.isNaN(mi) || mi < 0 || mi > 11) return null
  return `${MONTH_LABELS[mi]} ${y}`
}

/**
 * Side-rail status block — big % achievement number + health + activity
 * breakdown. Premium pass (2026-06): satu bar utama (mini-track kedua dibuang
 * karena redundan), caption menjelaskan BASIS angka achievement (realisasi
 * minggu kerja), dan breakdown In progress/Not started mendamaikan kenapa
 * "0/3 done" bisa berdampingan dengan achievement > 0%.
 *
 * Fallback: kalau achievementPct null (belum ada planned weeks di periode
 * berjalan), tampilkan task completion % + label berbeda.
 */
export function StatusPanel({ status, asOfMonth }: Props) {
  const { t } = useTranslation()
  const tone = status.health.toLowerCase()
  const activityRatio = status.totalCount > 0 ? status.completedCount / status.totalCount : 0
  const activityPct = Math.round(activityRatio * 100)

  const hasAchievement = status.achievementPct !== null
  const hasTasks = status.totalCount > 0
  const displayPct = hasAchievement ? status.achievementPct! : (hasTasks ? activityPct : null)
  const displayLabel = hasAchievement ? t('% Achievement') : (hasTasks ? t('% Activities Done') : t('% Progress'))

  const asOf = formatMonth(asOfMonth)
  const caption = hasAchievement
    ? (asOf ? t('Realized work-weeks · through {{month}}', { month: asOf }) : t('Realized work-weeks to date'))
    : (hasTasks ? t('Based on completed activities') : null)

  const notStarted = Math.max(0, status.totalCount - status.completedCount - status.inProgressCount)

  return (
    <div className="cs-status">
      <div className="cs-status__head">
        <span className="cs-status__label">{displayLabel}</span>
        <span className={`cs-status__chip cs-status__chip--${tone}`}>
          <span className={`cs-status__dot cs-status__dot--${tone}`} />
          {healthLabel(status.health)}
        </span>
      </div>

      <div className="cs-status__big">
        {displayPct !== null ? `${displayPct}%` : '—'}
      </div>
      {caption && <div className="cs-status__caption">{caption}</div>}

      <div className={`cs-status__bar cs-status__bar--${tone}`} role="presentation" aria-hidden="true">
        <div
          className="cs-status__bar-fill"
          style={{ width: `${displayPct !== null ? Math.max(2, Math.min(100, displayPct)) : 0}%` }}
        />
      </div>

      {status.totalCount > 0 && (
        <div className="cs-status__breakdown">
          <div className="cs-status__breakdown-row">
            <span className="cs-status__breakdown-key">{t('Activities completed')}</span>
            <span className="cs-status__breakdown-val">
              <span className="cs-status__breakdown-num">{status.completedCount}</span>
              <span className="cs-status__breakdown-sep">/</span>
              <span className="cs-status__breakdown-total">{status.totalCount}</span>
            </span>
          </div>
          <div className="cs-status__breakdown-sub">
            <span className="cs-status__pip cs-status__pip--progress" />
            {t('{{count}} in progress', { count: status.inProgressCount })}
            <span className="cs-status__breakdown-dot">·</span>
            <span className="cs-status__pip cs-status__pip--idle" />
            {t('{{count}} not started', { count: notStarted })}
          </div>
        </div>
      )}
    </div>
  )
}
