import type { ReactNode, MouseEventHandler, KeyboardEventHandler } from 'react'
import './ListRow.css'

export interface ListRowProps {
  /** Optional leading slot (icon, status dot, mono code pill). */
  leading?: ReactNode
  /** Primary text. The most important info per row. */
  primary: ReactNode
  /** Optional secondary line below primary (metadata). */
  secondary?: ReactNode
  /** Optional middle slot for inline content (progress bar, sparkline). */
  middle?: ReactNode
  /** Optional trailing slot (status pill, CTA, due date). */
  trailing?: ReactNode
  /** Click handler — when set, row becomes interactive. */
  onClick?: MouseEventHandler<HTMLDivElement>
  /** Visual emphasis. Use sparingly for "needs attention" state. */
  emphasis?: 'none' | 'warning' | 'danger'
  className?: string
}

/**
 * ListRow — fixed 48px height row for list views.
 *
 * Replaces the variable-height list patterns in Programs, Execution, Reports.
 * Density is intentional: BUMN executives reading dashboards expect Excel-like
 * density, not airy mobile-first spacing.
 */
export function ListRow({
  leading,
  primary,
  secondary,
  middle,
  trailing,
  onClick,
  emphasis = 'none',
  className,
}: ListRowProps) {
  const interactive = typeof onClick === 'function'
  const cls = [
    'ds-list-row',
    `ds-list-row--${emphasis}`,
    interactive && 'ds-list-row--interactive',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const onKeyDown: KeyboardEventHandler<HTMLDivElement> | undefined = interactive
    ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
        }
      }
    : undefined

  return (
    <div
      className={cls}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      {leading ? <div className="ds-list-row__leading">{leading}</div> : null}
      <div className="ds-list-row__text">
        <div className="ds-list-row__primary">{primary}</div>
        {secondary ? <div className="ds-list-row__secondary">{secondary}</div> : null}
      </div>
      {middle ? <div className="ds-list-row__middle">{middle}</div> : null}
      {trailing ? <div className="ds-list-row__trailing">{trailing}</div> : null}
    </div>
  )
}
