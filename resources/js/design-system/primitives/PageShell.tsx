import type { HTMLAttributes, ReactNode } from 'react'
import './PageShell.css'

export interface PageShellProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional padding override. Default uses spacing tokens. */
  padding?: 'default' | 'compact' | 'none'
}

/**
 * PageShell — canonical responsive page wrapper.
 *
 * Every top-level page in ATLAS should be wrapped in PageShell. It enforces:
 *   - Full-bleed neutral surface background (no legacy gradient bleed)
 *   - max-width via --ds-content-max token (1480px), centered
 *   - Consistent page-level padding (32px default)
 *   - .ds typography scope so primitives render correctly
 *
 * Why a component, not just a CSS class: makes the shell impossible to forget.
 * Adding a new page means using <PageShell>; failing to do so produces visibly
 * different chrome and is caught at review.
 *
 * Usage:
 *   <PageShell>
 *     <PageHeader title="Programs" subtitle="..." actions={...} />
 *     <YourContent />
 *   </PageShell>
 */
export function PageShell({
  padding = 'default',
  className,
  children,
  ...rest
}: PageShellProps) {
  const cls = ['ds', 'ds-page-shell', `ds-page-shell--p-${padding}`, className]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} {...rest}>
      <div className="ds-page-shell__inner">{children}</div>
    </div>
  )
}

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Optional element rendered between title and actions (filter pills, tabs). */
  middle?: ReactNode
  /** Right-aligned utility actions: chips, stats, primary button. */
  actions?: ReactNode
  /** Back button or breadcrumb-like control rendered before the title. */
  leading?: ReactNode
  className?: string
}

/**
 * PageHeader — consistent page-level header.
 *
 * Title is the page name. Subtitle is short context (date, count, scope).
 * Middle slot is for inline filters (e.g. tab strip). Actions go on the right.
 */
export function PageHeader({
  title,
  subtitle,
  middle,
  actions,
  leading,
  className,
}: PageHeaderProps) {
  return (
    <header className={['ds-page-header', className].filter(Boolean).join(' ')}>
      <div className="ds-page-header__row">
        {leading ? <div className="ds-page-header__leading">{leading}</div> : null}
        <div className="ds-page-header__title-block">
          <h1 className="ds-page-header__title">{title}</h1>
          {subtitle ? <p className="ds-page-header__subtitle">{subtitle}</p> : null}
        </div>
        {middle ? <div className="ds-page-header__middle">{middle}</div> : null}
        {actions ? <div className="ds-page-header__actions">{actions}</div> : null}
      </div>
    </header>
  )
}
