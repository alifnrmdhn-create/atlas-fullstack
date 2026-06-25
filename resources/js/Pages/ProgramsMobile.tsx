import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { getProgramHealthDisplay } from '../lib/programStatus'
import type { Program } from '../types'
import '../styles/mobile-native.css'

type HealthFilter = 'all' | 'GREEN' | 'YELLOW' | 'RED' | 'COMPLETED'

/* Hari menuju target — runtime FE, `new Date()` aman. */
function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/**
 * ProgramsMobile — daftar program mobile-native (≤640) ala app: search +
 * filter chips status + kartu padat. Render oleh ProgramsView saat phone;
 * DESKTOP tetap tab portfolio/timeline penuh. Reuse `programs` + `blockers`
 * dari workspace + `getProgramHealthDisplay` (vocab On Track/At Risk/Delayed/
 * Overdue/Completed) — nol perubahan server.
 */
export default function ProgramsMobile() {
  const { programs, blockers, currentUser, normalizeHealthStatus } = useWorkspace()
  const { t } = useTranslation()
  const navigate = useInertiaNavigate()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<HealthFilter>('all')
  const [mineOnly, setMineOnly] = useState(false)

  const blockerCount = useMemo(() => {
    const acc: Record<number, number> = {}
    for (const b of blockers ?? []) {
      const pid = b.task?.workstream?.program?.id
      if (pid != null && b.status !== 'RESOLVED') acc[pid] = (acc[pid] ?? 0) + 1
    }
    return acc
  }, [blockers])

  const isMine = (p: Program) =>
    p.ownerId === currentUser?.id || (p.picPersons ?? []).some(pic => pic.id === currentUser?.id)

  const counts = useMemo(() => {
    const base = programs ?? []
    const scoped = mineOnly ? base.filter(isMine) : base
    return {
      all: scoped.length,
      GREEN: scoped.filter(p => p.status !== 'COMPLETED' && normalizeHealthStatus(p.healthStatus) === 'GREEN').length,
      YELLOW: scoped.filter(p => p.status !== 'COMPLETED' && normalizeHealthStatus(p.healthStatus) === 'YELLOW').length,
      RED: scoped.filter(p => p.status !== 'COMPLETED' && normalizeHealthStatus(p.healthStatus) === 'RED').length,
      COMPLETED: scoped.filter(p => p.status === 'COMPLETED').length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs, mineOnly, currentUser?.id])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (programs ?? [])
      .filter(p => (mineOnly ? isMine(p) : true))
      .filter(p => {
        if (filter === 'all') return true
        if (filter === 'COMPLETED') return p.status === 'COMPLETED'
        return p.status !== 'COMPLETED' && normalizeHealthStatus(p.healthStatus) === filter
      })
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs, search, filter, mineOnly, currentUser?.id])

  const chips: { key: HealthFilter; label: string; n: number; tone: string }[] = [
    { key: 'all', label: t('All'), n: counts.all, tone: 'neutral' },
    { key: 'GREEN', label: t('On Track'), n: counts.GREEN, tone: 'green' },
    { key: 'YELLOW', label: t('At Risk'), n: counts.YELLOW, tone: 'amber' },
    { key: 'RED', label: t('Delayed'), n: counts.RED, tone: 'red' },
    { key: 'COMPLETED', label: t('Completed'), n: counts.COMPLETED, tone: 'neutral' },
  ]

  return (
    <div className="pm">
      <header className="pm__head">
        <h1 className="pm__title">{t('Programs')}</h1>
        <span className="pm__count">{counts.all}</span>
      </header>

      <div className="pm__search">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="9" cy="9" r="6" /><path d="m17 17-3.2-3.2" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('Search programs…')}
          aria-label={t('Search programs…')}
        />
      </div>

      <div className="pm__chips" role="tablist" aria-label={t('Filter by status')}>
        {chips.map(c => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={filter === c.key}
            className={`pm__chip pm__chip--${c.tone}${filter === c.key ? ' pm__chip--on' : ''}`}
            onClick={() => setFilter(c.key)}
          >
            {c.label}<span className="pm__chip-n">{c.n}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`pm__mine${mineOnly ? ' pm__mine--on' : ''}`}
        onClick={() => setMineOnly(v => !v)}
        aria-pressed={mineOnly}
      >
        <span className="pm__mine-box" aria-hidden="true">{mineOnly ? '✓' : ''}</span>
        {t('My programs only')}
      </button>

      {visible.length === 0 ? (
        <div className="pm__empty">{t('No programs match your filters.')}</div>
      ) : (
        <div className="pm__list">
          {visible.map(p => {
            const hd = getProgramHealthDisplay(p)
            const days = p.status === 'COMPLETED' ? null : daysUntil(p.targetEndDate)
            const bc = blockerCount[p.id] ?? 0
            const dl = days === null ? null
              : days < 0 ? { label: t('{{count}}d overdue', { count: Math.abs(days) }), tone: 'red' }
              : days === 0 ? { label: t('Due today'), tone: 'red' }
              : days <= 7 ? { label: t('{{count}}d left', { count: days }), tone: 'amber' }
              : { label: t('{{count}}d left', { count: days }), tone: 'muted' }
            return (
              <button key={p.id} type="button" className="pm-card" onClick={() => navigate(`/programs/${p.id}`)}>
                <div className="pm-card__top">
                  <span className="pm-card__code">{p.code}</span>
                  <span className={`pm-card__pill pm-card__pill--${hd.slug}`}>{hd.label}</span>
                </div>
                <p className="pm-card__name">{p.name}</p>
                <div className="pm-card__progress">
                  <div className="pm-card__track">
                    <div className={`pm-card__fill pm-card__fill--${hd.slug}`} style={{ width: `${Math.max(p.progressPercent, 2)}%` }} />
                  </div>
                  <span className="pm-card__pct">{p.progressPercent}%</span>
                </div>
                <div className="pm-card__meta">
                  <span>{t('{{count}} workstreams', { count: p.workstreamCount })}</span>
                  {dl ? <span className={`pm-card__dl pm-card__dl--${dl.tone}`}>{dl.label}</span> : null}
                  {bc > 0 ? <span className="pm-card__blocker">{t('{{count}} blocker', { count: bc })}</span> : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
      <div className="hm__bottom-space" aria-hidden="true" />
    </div>
  )
}
