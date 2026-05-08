import { usePage } from '@inertiajs/react'
import {
  NAV_SECTIONS,
  normalizeNavPath,
  findActiveSection,
  findActiveItem,
} from '../lib/nav-config'
import type { NavItem, NavSection } from '../lib/nav-config'

type ActiveNav = {
  /** Raw pathname from Inertia (no query, no trailing slash). */
  pathname: string
  /** Pathname collapsed to its top-level shell route (see normalizeNavPath). */
  activePath: string
  /** Section that owns activePath, if any. */
  activeSection: NavSection | undefined
  /** Item matching activePath, if any. */
  activeItem: NavItem | undefined
  /** All sections — re-exported for consumers that need to render the full tree. */
  sections: NavSection[]
}

/**
 * Single source of truth for "what page is the user on?" — used by
 * Breadcrumb, CommandPalette, and (in M5+) the rail and context panel
 * resolver. Centralizes Inertia coupling and path normalization so future
 * shell pieces don't each reinvent it.
 */
export function useActiveNav(): ActiveNav {
  const { url } = usePage()
  const rawPath = url.split('?')[0] || '/'
  const pathname = rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '')
  const activePath = normalizeNavPath(pathname)
  return {
    pathname,
    activePath,
    activeSection: findActiveSection(activePath),
    activeItem: findActiveItem(activePath),
    sections: NAV_SECTIONS,
  }
}
