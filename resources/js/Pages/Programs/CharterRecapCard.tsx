import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import type { CharterHealth, CharterPayload, MonthKey } from '../../types/charter'
import { MONTH_KEYS } from '../../types/charter'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { ActivityTimelineTable } from './Charter/ActivityTimelineTable'
import './Charter/charter.css'

/**
 * One condensed Charter card for the multi-program "Charter" recap view
 * (Portfolio tab → Charter sub-view).
 *
 * Distinct from the full single-program Charter page (`/programs/{id}/charter`):
 * this is a SCANNABLE summary — header strip + the signature activity timeline
 * + a thin facts strip (achievement / current update / next step). The full
 * charter (StatusPanel, PICA grid, KPI table) is one click away via the header.
 *
 * Charter payload is fetched lazily (Accept: application/json on the same
 * route) only when the card scrolls into view — so a 20-card page never fires
 * 20 simultaneous requests. Reuses ActivityTimelineTable verbatim.
 */

type RosterSeed = {
  id: number
  code: string
  name: string
  progressPercent: number
}

type Props = {
  /** Lightweight portfolio row — rendered immediately as the card skeleton/header. */
  seed: RosterSeed
}

const HEALTH_LABEL: Record<CharterHealth, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  TERLAMBAT: 'Delayed',
  COMPLETED: 'Completed',
}

const HEALTH_TONE: Record<CharterHealth, string> = {
  ON_TRACK: 'green',
  AT_RISK: 'yellow',
  TERLAMBAT: 'red',
  COMPLETED: 'green',
}

function lastMeasuredMonth(
  months: Record<MonthKey, { target: number | null; real: number | null }>,
): MonthKey | null {
  for (let i = MONTH_KEYS.length - 1; i >= 0; i--) {
    const m = MONTH_KEYS[i]
    const cell = months[m]
    if (cell.real !== null || cell.target !== null) return m
  }
  return null
}

function fmtNum(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export function CharterRecapCard({ seed }: Props) {
  const { t } = useTranslation()
  const navigate = useInertiaNavigate()
  const ref = useRef<HTMLElement | null>(null)
  const [data, setData] = useState<CharterPayload | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  // Lazy fetch on first intersection. Once loaded, stays loaded.
  useEffect(() => {
    const el = ref.current
    if (!el || data || status === 'loading') return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some(e => e.isIntersecting)) return
        io.disconnect()
        setStatus('loading')
        api
          .get<{ data: CharterPayload }>(`/programs/${seed.id}/charter`)
          .then(res => { setData(res.data); setStatus('idle') })
          .catch(() => setStatus('error'))
      },
      { rootMargin: '300px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seed.id, data, status])

  const openFull = () => navigate(`/programs/${seed.id}/charter`)

  const health = data?.status.health
  const log = data?.latestProgressLog
  const kpiRow = data?.kpiHistory.rows[0] ?? null
  const kpiMonth = kpiRow ? lastMeasuredMonth(kpiRow.months) : null

  return (
    <article ref={ref} className="crc-card" data-program-id={seed.id}>
      {/* Header strip — always shown immediately from the seed row. */}
      <header className="crc-head">
        <button type="button" className="crc-head__main" onClick={openFull} title={t('Open full Charter')}>
          <span className="code-badge crc-head__code">{seed.code}</span>
          <span className="crc-head__name">{data?.program.name ?? seed.name}</span>
        </button>
        <div className="crc-head__meta">
          {health && (
            <span className={`crc-pill crc-pill--${HEALTH_TONE[health]}`}>{t(HEALTH_LABEL[health])}</span>
          )}
          <span className="crc-head__progress">{seed.progressPercent}%</span>
          {data?.program.pic?.name && (
            <span className="crc-head__pic" title={data.program.pic.position}>{data.program.pic.name}</span>
          )}
          <button type="button" className="crc-head__open" onClick={openFull} aria-label={t('Open full Charter')}>
            {t('Open Charter')}
            <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10" aria-hidden="true">
              <path d="M3 6h6M6 3l3 3-3 3" />
            </svg>
          </button>
        </div>
      </header>

      {/* Body — charter essence once loaded. */}
      {status === 'error' ? (
        <div className="crc-body crc-body--state">
          <span>{t("Couldn't load charter.")}</span>
          <button type="button" className="crc-retry" onClick={() => setStatus('idle')}>{t('Retry')}</button>
        </div>
      ) : !data ? (
        <div className="crc-body crc-body--state crc-body--loading" aria-hidden="true">
          <div className="crc-skel" />
          <div className="crc-skel crc-skel--short" />
        </div>
      ) : (
        <div className="crc-body">
          <div className="crc-timeline">
            <ActivityTimelineTable
              activities={data.activities}
              period={data.program.period}
              currentMonth={data.program.currentMonth}
            />
          </div>

          <dl className="crc-facts">
            <div className="crc-fact">
              <dt>{t('% Achievement')}</dt>
              <dd className="crc-fact__big">
                {data.status.achievementPct !== null ? `${data.status.achievementPct}%` : '—'}
                {data.status.totalCount > 0 && (
                  <span className="crc-fact__sub">
                    {t('{{done}}/{{total}} done', { done: data.status.completedCount, total: data.status.totalCount })}
                  </span>
                )}
              </dd>
            </div>
            <div className="crc-fact">
              <dt>{t('Current update')}{log?.asOfMonth ? ` · ${log.asOfMonth}` : ''}</dt>
              <dd className={log?.updateNote ? '' : 'crc-fact__muted'}>
                {log?.updateNote ?? t('No recent progress update.')}
              </dd>
            </div>
            <div className="crc-fact">
              <dt>{t('Next step')}</dt>
              <dd className={log?.nextStep ? '' : 'crc-fact__muted'}>
                {log?.nextStep ?? t('Not yet defined.')}
              </dd>
            </div>
            {kpiRow && kpiMonth && (
              <div className="crc-fact">
                <dt>{t('KPI')} · {kpiMonth}</dt>
                <dd>
                  {t('Real {{real}} / Target {{target}}', {
                    real: fmtNum(kpiRow.months[kpiMonth].real),
                    target: fmtNum(kpiRow.months[kpiMonth].target),
                  })}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </article>
  )
}
