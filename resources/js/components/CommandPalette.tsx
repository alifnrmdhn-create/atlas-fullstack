import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { router } from '@inertiajs/react'
import { Command } from 'cmdk'
import {
  Search, Sun, Moon, ArrowRight, Plus, Download,
  CheckSquare, Layers, GitBranch, CalendarDays, AlertTriangle, MessageSquare,
} from 'lucide-react'
import { useEscKey } from '../hooks/useEscKey'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { NAV_SECTIONS } from '../lib/nav-config'
import { TOPBAR_ACTIONS, TOPBAR_ACTION_EVENT } from '../lib/topbar-config'
import type { ResolvedTheme } from '../lib/theme'
import type { SearchResult } from '../types'

type Props = {
  open: boolean
  onClose: () => void
  resolvedTheme: ResolvedTheme
  onToggleTheme: () => void
}

/** Icon + Indonesian label per backend search result type. */
const TYPE_META: Record<string, { label: string; Icon: typeof Search }> = {
  TASK:             { label: 'Task',       Icon: CheckSquare },
  TASKS:            { label: 'Task',       Icon: CheckSquare },
  PROGRAM:          { label: 'Program',    Icon: Layers },
  WORKSTREAM:       { label: 'Workstream', Icon: GitBranch },
  MEETING:          { label: 'Meeting',    Icon: CalendarDays },
  BLOCKER:          { label: 'Blocker',    Icon: AlertTriangle },
  CHANNEL_MESSAGE:  { label: 'Pesan',      Icon: MessageSquare },
  CHANNEL_MESSAGES: { label: 'Pesan',      Icon: MessageSquare },
  COMMENT:          { label: 'Komentar',   Icon: MessageSquare },
  COMMENTS:         { label: 'Komentar',   Icon: MessageSquare },
}

const RESULT_LIMIT = 6
const MIN_QUERY = 2

/**
 * Global ⌘K command palette.
 *
 * Sections:
 *   - Hasil      → live workspace search results (calls GET /search), shown
 *                  first so Enter jumps straight to the top match
 *   - Navigasi   → all top-level pages (uses NAV_SECTIONS)
 *   - Aksi       → toggle theme + contextual actions from TOPBAR_ACTIONS
 *   - Pencarian  → "lihat semua hasil" → /search?q=… deep view
 *
 * Selecting an item closes the palette and either navigates (Inertia),
 * opens the relevant workspace, or dispatches the topbar-action event.
 */
export function CommandPalette({ open, onClose, resolvedTheme, onToggleTheme }: Props) {
  const { openTaskWorkspace, openProgramWorkspace } = useWorkspace()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  // Reset state whenever palette opens
  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setSearching(false) }
  }, [open])

  // Debounced federated search — fetch inline results as the user types.
  // Reuses the same GET /search endpoint the full Search page uses, but keeps
  // its own local state so the two surfaces never clobber each other.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < MIN_QUERY) { setResults([]); setSearching(false); return }
    let cancelled = false
    setSearching(true)
    const handle = setTimeout(() => {
      api
        .get<{ results: SearchResult[]; total: number }>(
          `/search?q=${encodeURIComponent(q)}&type=ALL&limit=${RESULT_LIMIT}&offset=0`,
        )
        .then((payload) => {
          if (!cancelled) { setResults(payload.results); setSearching(false) }
        })
        .catch(() => {
          if (!cancelled) { setResults([]); setSearching(false) }
        })
    }, 200)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [query, open])

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

  // Open the in-place workspace for a result, mirroring SearchView.openResult.
  const openResult = (result: SearchResult) => {
    onClose()
    switch (result.type) {
      case 'TASK':
      case 'TASKS':
        openTaskWorkspace(result.id); router.visit('/execution'); return
      case 'PROGRAM':
        openProgramWorkspace(result.id); router.visit('/programs'); return
      case 'WORKSTREAM':
        router.visit('/programs'); return
      case 'MEETING':
        router.visit('/jadwal'); return
      case 'BLOCKER':
        router.visit('/execution'); return
      case 'CHANNEL_MESSAGE':
      case 'CHANNEL_MESSAGES':
        router.visit('/channels'); return
      default:
        router.visit(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  const trimmed = query.trim()
  const hasQuery = trimmed.length >= MIN_QUERY

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

          {/* Hasil — live workspace search, shown first so Enter hits the top match */}
          {hasQuery ? (
            <Command.Group heading="Hasil" className="cmdk-group">
              {searching && results.length === 0 ? (
                <Command.Item
                  className="cmdk-item"
                  value={`${trimmed} __searching`}
                  disabled
                >
                  <Search size={13} className="cmdk-item-icon" aria-hidden="true" />
                  <span className="cmdk-item-label">Mencari…</span>
                </Command.Item>
              ) : null}
              {results.map((result) => {
                const meta = TYPE_META[result.type] ?? { label: result.type, Icon: Search }
                const Icon = meta.Icon
                return (
                  <Command.Item
                    key={`${result.type}-${result.id}`}
                    className="cmdk-item"
                    // Prefix with the raw query so cmdk's fuzzy filter never hides
                    // a server-matched result whose title lacks the typed chars.
                    value={`${trimmed} ${result.title} ${result.type} ${result.id}`}
                    onSelect={() => openResult(result)}
                  >
                    <Icon size={13} className="cmdk-item-icon" aria-hidden="true" />
                    <span className="cmdk-item-label">{result.title}</span>
                    <span className="cmdk-item-meta">{meta.label}</span>
                  </Command.Item>
                )
              })}
            </Command.Group>
          ) : null}

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

          {/* Pencarian — deep view escape hatch for filters/operators/saved searches */}
          {trimmed.length > 0 ? (
            <Command.Group heading="Pencarian" className="cmdk-group">
              <Command.Item
                className="cmdk-item"
                value={`__search__ ${trimmed}`}
                onSelect={() => navigate(`/search?q=${encodeURIComponent(trimmed)}`)}
              >
                <Search size={13} className="cmdk-item-icon" aria-hidden="true" />
                <span className="cmdk-item-label">
                  Lihat semua hasil untuk "<strong>{trimmed}</strong>"
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
