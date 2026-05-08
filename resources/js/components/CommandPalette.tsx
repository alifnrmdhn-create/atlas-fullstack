import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { router } from '@inertiajs/react'
import { Command } from 'cmdk'
import { Search, Sun, Moon, ArrowRight, Plus, Download } from 'lucide-react'
import { useEscKey } from '../hooks/useEscKey'
import { NAV_SECTIONS } from '../lib/nav-config'
import { TOPBAR_ACTIONS, TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import type { ResolvedTheme } from '../lib/theme'

type Props = {
  open: boolean
  onClose: () => void
  resolvedTheme: ResolvedTheme
  onToggleTheme: () => void
}

/**
 * Global ⌘K command palette.
 *
 * Sections:
 *   - Navigasi   → all top-level pages (uses NAV_SECTIONS)
 *   - Aksi       → toggle theme + contextual actions from TOPBAR_ACTIONS
 *   - Pencarian  → fallback to /search?q=… when query is non-empty
 *
 * Selecting an item closes the palette and either navigates (Inertia) or
 * dispatches the topbar-action event so existing listeners pick it up.
 */
export function CommandPalette({ open, onClose, resolvedTheme, onToggleTheme }: Props) {
  const [query, setQuery] = useState('')

  // Reset query whenever palette opens
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  useEscKey(onClose, open)

  if (!open) return null

  const navigate = (path: string) => {
    onClose()
    router.visit(path)
  }

  const dispatchAction = (id: string, page: string) => {
    onClose()
    window.dispatchEvent(
      new CustomEvent(TOPBAR_ACTION_EVENT, { detail: { id, page } }),
    )
  }

  const trimmed = query.trim()

  return createPortal(
    <div
      className="cmdk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Command className="cmdk-root" loop label="Command palette">
        <div className="cmdk-input-wrap">
          <Search size={15} aria-hidden="true" className="cmdk-input-icon" />
          <Command.Input
            className="cmdk-input"
            value={query}
            onValueChange={setQuery}
            placeholder="Ketik halaman, aksi, atau pencarian…"
            autoFocus
          />
          <kbd className="cmdk-input-kbd">ESC</kbd>
        </div>

        <Command.List className="cmdk-list">
          <Command.Empty className="cmdk-empty">
            Tidak ada hasil untuk "{trimmed}"
          </Command.Empty>

          {/* Navigasi */}
          <Command.Group heading="Navigasi" className="cmdk-group">
            {NAV_SECTIONS.flatMap((section) =>
              section.items.map((item) => (
                <Command.Item
                  key={item.path}
                  className="cmdk-item"
                  value={`${item.label} ${section.label} ${item.path}`}
                  onSelect={() => navigate(item.path)}
                >
                  <ArrowRight size={13} className="cmdk-item-icon" aria-hidden="true" />
                  <span className="cmdk-item-label">{item.label}</span>
                  <span className="cmdk-item-meta">{section.label}</span>
                </Command.Item>
              )),
            )}
          </Command.Group>

          {/* Aksi */}
          <Command.Group heading="Aksi" className="cmdk-group">
            <Command.Item
              className="cmdk-item"
              value="toggle theme dark light mode tema gelap terang"
              onSelect={() => {
                onClose()
                onToggleTheme()
              }}
            >
              {resolvedTheme === 'dark' ? (
                <Sun size={13} className="cmdk-item-icon" aria-hidden="true" />
              ) : (
                <Moon size={13} className="cmdk-item-icon" aria-hidden="true" />
              )}
              <span className="cmdk-item-label">
                {resolvedTheme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              </span>
              <span className="cmdk-item-meta">Toggle theme</span>
            </Command.Item>

            {Object.entries(TOPBAR_ACTIONS).map(([page, action]) => {
              const Icon = action.icon === 'Download' ? Download : Plus
              return (
                <Command.Item
                  key={`${page}::${action.id}`}
                  className="cmdk-item"
                  value={`${action.label} ${page} ${action.id}`}
                  onSelect={() => dispatchAction(action.id, page)}
                >
                  <Icon size={13} className="cmdk-item-icon" aria-hidden="true" />
                  <span className="cmdk-item-label">{action.label}</span>
                  <span className="cmdk-item-meta">{page}</span>
                </Command.Item>
              )
            })}
          </Command.Group>

          {/* Pencarian fallback */}
          {trimmed.length > 0 ? (
            <Command.Group heading="Pencarian" className="cmdk-group">
              <Command.Item
                className="cmdk-item"
                value={`__search__ ${trimmed}`}
                onSelect={() => navigate(`/search?q=${encodeURIComponent(trimmed)}`)}
              >
                <Search size={13} className="cmdk-item-icon" aria-hidden="true" />
                <span className="cmdk-item-label">
                  Cari "<strong>{trimmed}</strong>" di semua tempat
                </span>
                <span className="cmdk-item-meta">Search</span>
              </Command.Item>
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
    </div>,
    document.body,
  )
}
