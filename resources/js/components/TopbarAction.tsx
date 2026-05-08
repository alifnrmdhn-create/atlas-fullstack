import { Link } from '@inertiajs/react'
import { Plus, Download, Share2, Filter } from 'lucide-react'
import type { TopbarAction as TopbarActionConfig } from '../lib/topbar-config'
import { TOPBAR_ACTION_EVENT } from '../lib/topbar-config'

const ICONS = { Plus, Download, Share2, Filter }

type Props = {
  action: TopbarActionConfig
  /** Active path included in the dispatched event detail so listeners can disambiguate. */
  page: string
}

/**
 * Renders the contextual action button. If `href` is set, navigates via
 * Inertia Link. Otherwise dispatches a window CustomEvent that pages can
 * listen for.
 */
export function TopbarAction({ action, page }: Props) {
  const Icon = action.icon ? ICONS[action.icon] : null

  const content = (
    <>
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      <span>{action.label}</span>
    </>
  )

  if (action.href) {
    return (
      <Link href={action.href} className="topbar__action-btn">
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className="topbar__action-btn"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent(TOPBAR_ACTION_EVENT, {
            detail: { id: action.id, page },
          }),
        )
      }}
    >
      {content}
    </button>
  )
}
