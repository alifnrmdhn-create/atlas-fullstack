import { useEffect, useState } from 'react'
import { router, usePage } from '@inertiajs/react'

/**
 * Programs context panel — filter UI.
 *
 * Selections sync to URL query string (?status=terlambat,at_risk&...) so
 * filtered views are shareable via copy-link. ProgramsView reads the
 * same params (or will, once wiring follow-up lands) and applies them
 * to its list.
 *
 * Filter dimensions (M6 first cut):
 *   - Status: on_track | at_risk | terlambat
 *   - Health: stale (>30d sejak update terakhir)
 *
 * Direktorat filter is intentionally deferred — the list is dynamic
 * (loaded from API) and warrants its own dropdown work in M6.1.
 */

const STATUS_OPTIONS: Array<{ value: string; label: string; tone: 'green' | 'amber' | 'red' }> = [
  { value: 'on_track', label: 'On Track', tone: 'green' },
  { value: 'at_risk', label: 'At Risk', tone: 'amber' },
  { value: 'terlambat', label: 'Delayed', tone: 'red' },
]

function readQuery(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function readStatusSet(): Set<string> {
  const raw = readQuery().get('status') ?? ''
  return new Set(raw.split(',').filter(Boolean))
}

function readStaleOnly(): boolean {
  return readQuery().get('stale') === '1'
}

export function ProgramsFilterPanel() {
  const { url } = usePage()
  const [status, setStatus] = useState<Set<string>>(() => readStatusSet())
  const [staleOnly, setStaleOnly] = useState<boolean>(() => readStaleOnly())

  // Re-sync when URL changes externally (back/forward, deep link)
  useEffect(() => {
    setStatus(readStatusSet())
    setStaleOnly(readStaleOnly())
  }, [url])

  const updateUrl = (nextStatus: Set<string>, nextStale: boolean) => {
    const params = readQuery()
    if (nextStatus.size > 0) params.set('status', Array.from(nextStatus).join(','))
    else params.delete('status')
    if (nextStale) params.set('stale', '1')
    else params.delete('stale')
    const qs = params.toString()
    const target = `/programs${qs ? '?' + qs : ''}`
    router.visit(target, { preserveState: true, preserveScroll: true, replace: true })
  }

  const toggleStatus = (value: string) => {
    const next = new Set(status)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setStatus(next)
    updateUrl(next, staleOnly)
  }

  const toggleStale = () => {
    const next = !staleOnly
    setStaleOnly(next)
    updateUrl(status, next)
  }

  const reset = () => {
    setStatus(new Set())
    setStaleOnly(false)
    updateUrl(new Set(), false)
  }

  const hasActive = status.size > 0 || staleOnly

  return (
    <>
      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <h3 className="context-panel__section-title">Status</h3>
          {hasActive ? (
            <button
              type="button"
              className="context-panel__reset"
              onClick={reset}
            >
              Reset
            </button>
          ) : null}
        </header>
        <div className="context-panel__section-body">
          {STATUS_OPTIONS.map((opt) => {
            const checked = status.has(opt.value)
            return (
              <label key={opt.value} className="context-panel__check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleStatus(opt.value)}
                />
                <span className={`context-panel__dot context-panel__dot--${opt.tone}`} aria-hidden="true" />
                <span className="context-panel__check-label">{opt.label}</span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <h3 className="context-panel__section-title">Lainnya</h3>
        </header>
        <div className="context-panel__section-body">
          <label className="context-panel__check">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={toggleStale}
            />
            <span className="context-panel__check-label">
              Stale &gt;30 hari
              <span className="context-panel__check-hint">tidak ada update</span>
            </span>
          </label>
        </div>
      </section>
    </>
  )
}
