import { Link } from '@inertiajs/react'
import { AlertCircle, Calendar, Pin, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../hooks/useWorkspace'

/**
 * Home context panel — "Fokus hari ini".
 *
 * Reads the same programSummary that HomeView uses, so counts here
 * stay in sync with the alert strip on the main page. When Home is
 * still loading, the panel shows a low-noise empty state instead of
 * placeholder zeros.
 */
export function HomeFocusPanel() {
  const { t } = useTranslation()
  const { programSummary } = useWorkspace()

  if (!programSummary) {
    return (
      <Section icon={<AlertCircle size={13} />} title={t('Needs attention')}>
        <p className="context-panel__empty">{t('Loading summary…')}</p>
      </Section>
    )
  }

  const { summary, needsAction } = programSummary
  const terlambatCount = summary.terlambat + summary.overdue
  const decisionCount = needsAction.length

  const hasAttention = terlambatCount > 0 || decisionCount > 0

  return (
    <>
      <Section icon={<AlertCircle size={13} />} title={t('Needs attention')} tone={hasAttention ? 'danger' : undefined}>
        {hasAttention ? (
          <>
            {terlambatCount > 0 ? (
              <FocusItem
                label={t('{{count}} programs delayed', { count: terlambatCount })}
                meta={t('needs intervention')}
                href="/programs?status=terlambat"
              />
            ) : null}
            {decisionCount > 0 ? (
              <FocusItem
                label={t('{{count}} items awaiting decision', { count: decisionCount })}
                meta={t('approval')}
                href="/fokus"
              />
            ) : null}
          </>
        ) : (
          <p className="context-panel__empty">{t('Nothing urgent today.')}</p>
        )}
      </Section>

      <Section icon={<Calendar size={13} />} title={t("Today's schedule")}>
        <p className="context-panel__empty">
          {t('No meetings scheduled.')}
          <br />
          <Link href="/jadwal" className="context-panel__inline-link">
            {t('View calendar →')}
          </Link>
        </p>
      </Section>

      <Section icon={<Pin size={13} />} title={t('Pinned')}>
        <p className="context-panel__empty">
          {t('Pin a program or report from its detail page for quick access.')}
        </p>
      </Section>
    </>
  )
}

function Section({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <section className={`context-panel__section${tone ? ` context-panel__section--${tone}` : ''}`}>
      <header className="context-panel__section-header">
        <span className="context-panel__section-icon" aria-hidden="true">
          {icon}
        </span>
        <h3 className="context-panel__section-title">{title}</h3>
      </header>
      <div className="context-panel__section-body">{children}</div>
    </section>
  )
}

function FocusItem({
  label,
  meta,
  href,
}: {
  label: string
  meta: string
  href: string
}) {
  return (
    <Link href={href} className="context-panel__focus-item">
      <span className="context-panel__focus-label">{label}</span>
      <span className="context-panel__focus-meta">
        {meta}
        <ArrowRight size={11} aria-hidden="true" />
      </span>
    </Link>
  )
}
