import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useActiveNav } from '../hooks/useActiveNav'
import { resolveContextPanel } from '../lib/context-panel-config'

/**
 * Renders the contextual side panel for the active route. Returns null
 * when the route opts out (Channels, Workboard, admin pages, etc.) so
 * AppShell can adjust its grid template accordingly.
 *
 * Collapse state persists per-route under localStorage key
 * 'atlas:context-panel:<path>'. Default open. Workboard kanban and similar
 * ruang-lebar use cases are handled by opting out of the panel entirely
 * rather than collapsing it.
 */

const STORAGE_PREFIX = 'atlas:context-panel:'

function readCollapsed(path: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_PREFIX + path) === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(path: string, value: boolean) {
  try {
    localStorage.setItem(STORAGE_PREFIX + path, String(value))
  } catch {}
}

export function ContextPanel() {
  const { activePath, pathname } = useActiveNav()
  const def = resolveContextPanel(activePath, pathname)

  const [collapsed, setCollapsed] = useState(() => readCollapsed(activePath))

  // Re-read persisted collapse when route changes
  useEffect(() => {
    setCollapsed(readCollapsed(activePath))
  }, [activePath])

  if (!def) return null

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      writeCollapsed(activePath, next)
      return next
    })
  }

  const { title, Component } = def

  return (
    <aside
      className={`context-panel${collapsed ? ' context-panel--collapsed' : ''}`}
      aria-label={title}
    >
      <div className="context-panel__header">
        {collapsed ? (
          <button
            type="button"
            className="context-panel__expand-btn"
            onClick={toggle}
            aria-label="Buka panel"
            title="Buka panel"
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <>
            <h2 className="context-panel__title">{title}</h2>
            <button
              type="button"
              className="context-panel__collapse-btn"
              onClick={toggle}
              aria-label="Tutup panel"
              title="Tutup panel"
            >
              <ChevronLeft size={14} />
            </button>
          </>
        )}
      </div>
      {collapsed ? null : (
        <div className="context-panel__body">
          <Component />
        </div>
      )}
    </aside>
  )
}
