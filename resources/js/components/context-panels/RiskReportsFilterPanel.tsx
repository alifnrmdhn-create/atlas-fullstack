import { useEffect, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Calendar } from 'lucide-react'

/**
 * Risk Reports filter panel.
 *
 * RiskReportsView already issues a /risk-reports?status=…&year=… API
 * call when its local state changes. This panel writes the same query
 * params to the URL so the view becomes shareable; reading the URL
 * back into the local state of RiskReportsView is a small follow-up.
 *
 * Status set is narrower than monthly reports (no REVIEWED / REJECTED
 * exposed by the page).
 */

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]

const STATUS_OPTIONS: Array<{ value: string; label: string; tone: 'gray' | 'amber' | 'green' }> = [
  { value: 'DRAFT', label: 'Draft', tone: 'gray' },
  { value: 'SUBMITTED', label: 'Submitted', tone: 'amber' },
  { value: 'APPROVED', label: 'Approved', tone: 'green' },
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

function readStatus(): string {
  const raw = readQuery().get('status') ?? ''
  return STATUS_OPTIONS.some((o) => o.value === raw) ? raw : 'all'
}

export function RiskReportsFilterPanel() {
  const { url } = usePage()
  const [year, setYear] = useState<number>(() => readYear())
  const [status, setStatus] = useState<string>(() => readStatus())

  useEffect(() => {
    setYear(readYear())
    setStatus(readStatus())
  }, [url])

  const updateUrl = (nextYear: number, nextStatus: string) => {
    const params = readQuery()
    if (nextYear !== CURRENT_YEAR) params.set('year', String(nextYear))
    else params.delete('year')
    if (nextStatus !== 'all') params.set('status', nextStatus)
    else params.delete('status')
    const qs = params.toString()
    router.visit(`/laporan-risiko${qs ? '?' + qs : ''}`, {
      preserveState: true,
      preserveScroll: true,
      replace: true,
    })
  }

  const setYearAndPush = (next: number) => {
    setYear(next)
    updateUrl(next, status)
  }

  const setStatusAndPush = (next: string) => {
    setStatus(next)
    updateUrl(year, next)
  }

  const reset = () => {
    setYear(CURRENT_YEAR)
    setStatus('all')
    updateUrl(CURRENT_YEAR, 'all')
  }

  const hasActive = year !== CURRENT_YEAR || status !== 'all'

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
          <label className="context-panel__check">
            <input
              type="radio"
              name="risk-status"
              checked={status === 'all'}
              onChange={() => setStatusAndPush('all')}
            />
            <span className="context-panel__check-label">All</span>
          </label>
          {STATUS_OPTIONS.map((opt) => (
            <label key={opt.value} className="context-panel__check">
              <input
                type="radio"
                name="risk-status"
                checked={status === opt.value}
                onChange={() => setStatusAndPush(opt.value)}
              />
              <span className={`context-panel__dot context-panel__dot--${opt.tone}`} aria-hidden="true" />
              <span className="context-panel__check-label">{opt.label}</span>
            </label>
          ))}
        </div>
      </section>
    </>
  )
}
