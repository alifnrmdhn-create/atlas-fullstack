import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { InlineNotice, SectionState, SkeletonBlock, SkeletonStack } from '../components/ui'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import './SmallPagesViews.css'

const SEARCH_PRESETS = [
  'blocker kritis',
  'forecast accuracy',
  'in:#kmr-general',
  'from:direksi',
  'type:work_items',
]

const SEARCH_OPERATORS = [
  { op: 'from:', desc: 'Filter by author' },
  { op: 'in:', desc: 'Limit to channel/area' },
  { op: 'type:', desc: 'Focus on result type' },
  { op: 'during:', desc: 'Filter by date range' },
]

export function SearchView() {
  const {
    searchResults, searchTotal, query, setQuery,
    searching, searchError, savedSearches,
    runSearch, openTaskWorkspace, openProgramWorkspace,
    formatDate,
  } = useWorkspace()
  const navigate = useInertiaNavigate()

  const [searchType, setSearchType] = useState('ALL')

  // Deep-view entry: the ⌘K palette routes "lihat semua hasil" here with
  // ?q=… — pre-fill the box and run the search once on mount so the page
  // lands populated instead of empty.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')?.trim()
    if (q) { setQuery(q); void runSearch(q, 'ALL') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void runSearch(query, searchType)
  }

  const openResult = (result: { type: string; id: number; title: string }) => {
    if (result.type === 'TASK' || result.type === 'TASKS') {
      openTaskWorkspace(result.id)
      navigate('/execution')
      return
    }
    if (result.type === 'PROGRAM') {
      openProgramWorkspace(result.id)
      navigate('/programs')
      return
    }
    if (result.type === 'MEETING') {
      navigate('/jadwal')
      return
    }
    if (result.type === 'COMMENT') {
      const match = result.title.match(/#(\d+)/)
      if (match) {
        if (result.title.includes('TASK')) { openTaskWorkspace(Number(match[1])); navigate('/execution') }
        else if (result.title.includes('PROGRAM')) { openProgramWorkspace(Number(match[1])); navigate('/programs') }
      }
    }
  }

  const resultMix = {
    messages: searchResults.filter(r => r.type === 'CHANNEL_MESSAGES' || r.type === 'CHANNEL_MESSAGE').length,
    comments: searchResults.filter(r => r.type === 'COMMENTS' || r.type === 'COMMENT').length,
    tasks: searchResults.filter(r => r.type === 'TASKS' || r.type === 'TASK').length,
    programs: searchResults.filter(r => r.type === 'PROGRAM').length,
    meetings: searchResults.filter(r => r.type === 'MEETING').length,
  }

  const showEmptyState = !query && !searching && searchResults.length === 0

  return (
    <div className="ds search-v2 view-search">
      {/* `ds-stagger`: motion standardization (no inline modal). */}
      <div className="search-v2__inner ds-stagger">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Search & Discovery</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Find programs, messages, and documents across the workspace.</span>
        {searchTotal > 0 && (
          <>
            <div className="view-toolbar__sep" />
            <div className="view-toolbar__right">
              <div className="view-toolbar__stats">
                <span>{searchTotal} <em>results</em></span>
                {resultMix.tasks > 0 && <span>{resultMix.tasks} <em>task</em></span>}
                {resultMix.programs > 0 && <span>{resultMix.programs} <em>program</em></span>}
                {resultMix.meetings > 0 && <span>{resultMix.meetings} <em>meeting</em></span>}
                {resultMix.comments > 0 && <span>{resultMix.comments} <em>comments</em></span>}
                {resultMix.messages > 0 && <span>{resultMix.messages} <em>messages</em></span>}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="search-workspace">
        {/* Main search area */}
        <div className="search-main">
          <div className="section-block">
            <form className="search-form" onSubmit={handleSubmit}>
              <div className="search-form__input-row">
                <div className="search-form__input-wrap">
                  <svg className="search-form__icon" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 16 16" width="16">
                    <circle cx="7" cy="7" r="5" />
                    <path d="m11.5 11.5 3 3" />
                  </svg>
                  <input
                    autoFocus
                    className="search-form__input"
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search messages, tasks, comments…"
                    value={query}
                  />
                </div>
                <select
                  className="search-form__type"
                  onChange={(e) => setSearchType(e.target.value)}
                  value={searchType}
                >
                  <option value="ALL">All</option>
                  <option value="CHANNEL_MESSAGES">Messages</option>
                  <option value="COMMENTS">Comments</option>
                  <option value="TASKS">Tasks</option>
                  <option value="PROGRAMS">Programs</option>
                  <option value="MEETINGS">Meetings</option>
                </select>
                <button className="search-form__submit" type="submit">Search</button>
              </div>
            </form>

            {/* Suggested presets */}
            <div className="search-presets">
              <span className="search-presets__label">Suggested:</span>
              {SEARCH_PRESETS.map((preset) => (
                <button
                  className="search-preset-chip"
                  key={preset}
                  onClick={() => { setQuery(preset); void runSearch(preset, searchType) }}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Hint / result meta */}
            <div className="search-meta">
              {searching ? (
                <span className="search-hint">Searching…</span>
              ) : searchResults.length > 0 ? (
                <div className="search-mix">
                  <span className="search-hint">{searchTotal} results</span>
                  <span className="search-mix__stat">{resultMix.tasks} task</span>
                  <span className="search-mix__stat">{resultMix.programs} program</span>
                  <span className="search-mix__stat">{resultMix.meetings} meeting</span>
                  <span className="search-mix__stat">{resultMix.comments} comments</span>
                  <span className="search-mix__stat">{resultMix.messages} messages</span>
                </div>
              ) : query ? (
                <span className="search-hint">No results for "{query}"</span>
              ) : (
                <span className="search-hint">Type and press Enter to search</span>
              )}
            </div>

            {searchError ? <InlineNotice tone="error">{searchError}</InlineNotice> : null}

            {/* Empty state — before any search */}
            {showEmptyState && (
              <div className="empty-state" style={{ padding: '28px 0 4px' }}>
                <svg
                  className="empty-state-icon"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path strokeLinecap="round" d="m15.5 15.5 5 5" />
                </svg>
                <div className="empty-state-title">Search across ATLAS</div>
                <div className="empty-state-desc">Programs, tasks, messages, blockers — find it all here.</div>
              </div>
            )}

            {/* Results */}
            {searching ? (
              <div className="search-results">
                {[0, 1, 2, 3].map(i => (
                  <div className="search-result-skeleton" key={i}>
                    <SkeletonBlock height={16} width="45%" />
                    <SkeletonStack lines={[90, 75]} />
                    <SkeletonBlock height={11} width="30%" />
                  </div>
                ))}
              </div>
            ) : searchResults.length > 0 ? (
              <div className="search-results">
                {searchResults.map((result) => (
                  <button
                    className="search-result"
                    key={`${result.type}-${result.id}`}
                    onClick={() => openResult(result)}
                  >
                    <div className="search-result__top">
                      <strong className="search-result__title">{result.title}</strong>
                      <span className="badge">{result.type.replace('_', ' ')}</span>
                    </div>
                    <p className="search-result__snippet">{result.snippet}</p>
                    <div className="search-result__meta">
                      <span>{result.author ?? 'Unknown'}</span>
                      <span>·</span>
                      <time>{formatDate(result.createdAt)}</time>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Sidebar: saved searches + operators */}
        <aside className="search-sidebar right-rail">

          {/* Saved Searches */}
          <div className="section-block">
            <div className="section-header">
              <h3 className="section-title" style={{ fontSize: 13 }}>Saved Searches</h3>
              <span className="section-badge">{savedSearches.length}</span>
            </div>
            {savedSearches.length > 0 ? (
              <div className="saved-list">
                {savedSearches.map((ss) => (
                  <button
                    className="saved-item-card"
                    key={ss.id}
                    onClick={() => { setQuery(ss.searchQuery); void runSearch(ss.searchQuery, searchType) }}
                    type="button"
                  >
                    <div className="saved-item__top">
                      <strong style={{ fontSize: 13 }}>{ss.name}</strong>
                      {ss.isShared
                        ? <span className="status-badge leading">Shared</span>
                        : <span className="status-badge muted">Personal</span>
                      }
                    </div>
                    {ss.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 6px' }}>{ss.description}</p>
                    )}
                    <code className="search-query-chip">{ss.searchQuery}</code>
                  </button>
                ))}
              </div>
            ) : (
              <SectionState title="No saved searches yet" text="Save searches you use often." compact />
            )}
          </div>

          {/* Search Operators */}
          <div className="section-block">
            <div className="section-header">
              <h3 className="section-title" style={{ fontSize: 13 }}>Search Operators</h3>
            </div>
            <div className="operator-list">
              {SEARCH_OPERATORS.map(({ op, desc }) => (
                <div className="operator-row" key={op}>
                  <code className="op-chip">{op}</code>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      </div>
    </div>
  )
}

export default SearchView
