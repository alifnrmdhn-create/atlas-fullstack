import { useEffect, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Calendar } from 'lucide-react'

/**
 * Monthly Reports context panel — period + status filter.
 *
 * Selections sync to the URL query string. MonthlyReportsView keeps its
 * own toolbar year selector for now; once it's wired to read these
 * params, the panel becomes the single source. Stale-state still useful
 * because the URL is shareable.
 *
 * Status values mirror the STATUS map in types/monthlyReports.ts:
 * DRAFT | SUBMITTED | REVIEWED | APPROVED | REJECTED.
 */

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]

const STATUS_OPTIONS: Array<{ value: string; label: string; tone: 'gray' | 'amber' | 'blue' | 'green' | 'red' }> = [
  { value: 'DRAFT', label: 'Draft', tone: 'gray' },
  { value: 'SUBMITTED', label: 'Submitted', tone: 'amber' },
  { value: 'REVIEWED', label: 'Reviewed', tone: 'blue' },
  { value: 'APPROVED', label: 'Approved', tone: 'green' },
  { value: 'REJECTED', label: 'Rejected', tone: 'red' },
]

function readQuery(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function readYear(): number {
  const raw = readQuery().get('year')
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && YEARS.includes(n) ? n : CURRENT_YEAR
}

function readStatusSet(): Set<string> {
  const raw = readQuery().get('status') ?? ''
  return new Set(raw.split(',').filter(Boolean))
}

export function MonthlyReportsFilterPanel() {
  const { url } = usePage()
  const [year, setYear] = useState<number>(() => readYear())
  const [status, setStatus] = useState<Set<string>>(() => readStatusSet())

  useEffect(() => {
    setYear(readYear())
    setStatus(readStatusSet())
  }, [url])

  const updateUrl = (nextYear: number, nextStatus: Set<string>) => {
    const params = readQuery()
    if (nextYear !== CURRENT_YEAR) params.set('year', String(nextYear))
    else params.delete('year')
    if (nextStatus.size > 0) params.set('status', Array.from(nextStatus).join(','))
    else params.delete('status')
    const qs = params.toString()
    router.visit(`/laporan-bulanan${qs ? '?' + qs : ''}`, {
      preserveState: true,
      preserveScroll: true,
      replace: true,
    })
  }

  const toggleStatus = (value: string) => {
    const next = new Set(status)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setStatus(next)
    updateUrl(year, next)
  }

  const setYearAndPush = (next: number) => {
    setYear(next)
    updateUrl(next, status)
  }

  const reset = () => {
    setYear(CURRENT_YEAR)
    setStatus(new Set())
    updateUrl(CURRENT_YEAR, new Set())
  }

  const hasActive = year !== CURRENT_YEAR || status.size > 0

  return (
    <>
      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <span className="context-panel__section-icon" aria-hidden="true">
            <Calendar size={13} />
          </span>
          <h3 className="context-panel__section-title">Year</h3>
          {hasActive ? (
            <button type="button" className="context-panel__reset" onClick={reset}>
              Reset
            </button>
          ) : null}
        </header>
        <div className="context-panel__section-body">
          <div className="context-panel__year-row">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                className={`context-panel__year-pill${y === year ? ' is-active' : ''}`}
                onClick={() => setYearAndPush(y)}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="context-panel__section">
        <header className="context-panel__section-header">
          <h3 className="context-panel__section-title">Status</h3>
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
    </>
  )
}
