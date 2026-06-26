import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../hooks/useWorkspace'
import { scheduleOf, scheduleBucket } from '../lib/taskSchedule'
import { TaskDetailModal } from '../components/TaskDetailModal'
import { SectionState, looksLikeAvatarUrl } from '../components/ui'
import type { Task } from '../types'
import '../styles/mobile-native.css'

type LaneKey = 'all' | 'overdue' | 'at-risk' | 'on-track' | 'not-started' | 'completed'

const LANES: { key: Exclude<LaneKey, 'all'>; label: string; tone: string }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'red' },
  { key: 'at-risk', label: 'At Risk', tone: 'amber' },
  { key: 'on-track', label: 'On Track', tone: 'green' },
  { key: 'not-started', label: 'Not Started', tone: 'neutral' },
  { key: 'completed', label: 'Completed', tone: 'neutral' },
]

function initialsOf(name?: string): string {
  if (!name) return ''
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/**
 * WorkboardMobile — board task mobile-native (≤640) ala app: search + filter
 * lane chips + task list dikelompokkan per lane (urgensi). Render oleh
 * WorkboardView saat phone. Reuse `workGroups` + `lib/taskSchedule` (sumber
 * tunggal bucketing/vocab) + `TaskDetailModal` (panel detail identik desktop).
 */
export default function WorkboardMobile() {
  const { workGroups, workGroupsStatus, currentUser, normalizeHealthStatus } = useWorkspace()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [lane, setLane] = useState<LaneKey>('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [taskModalId, setTaskModalId] = useState<number | null>(null)
  const [originRect, setOriginRect] = useState<DOMRect | null>(null)

  const allTasks = useMemo(() => workGroups.flatMap(g => g.items), [workGroups])

  const isMine = (tk: Task) => tk.assignee?.id === currentUser?.id

  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allTasks
      .filter(tk => (mineOnly ? isMine(tk) : true))
      .filter(tk => !q || tk.title.toLowerCase().includes(q) || tk.code.toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, search, mineOnly, currentUser?.id])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: scoped.length, overdue: 0, 'at-risk': 0, 'on-track': 0, 'not-started': 0, completed: 0 }
    for (const tk of scoped) c[scheduleBucket(tk, normalizeHealthStatus)]++
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped])

  // Tugas per lane, diurutkan urgensi (rank kecil dulu).
  const grouped = useMemo(() => {
    const byLane: Record<string, Task[]> = { overdue: [], 'at-risk': [], 'on-track': [], 'not-started': [], completed: [] }
    for (const tk of scoped) byLane[scheduleBucket(tk, normalizeHealthStatus)]?.push(tk)
    for (const k of Object.keys(byLane)) {
      byLane[k].sort((a, b) => scheduleOf(a, normalizeHealthStatus).rank - scheduleOf(b, normalizeHealthStatus).rank)
    }
    return byLane
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped])

  const visibleLanes = LANES.filter(l => (lane === 'all' || lane === l.key) && grouped[l.key].length > 0)

  const openTask = (id: number, e: React.MouseEvent<HTMLButtonElement>) => {
    setOriginRect(e.currentTarget.getBoundingClientRect())
    setTaskModalId(id)
    window.history.pushState({ taskModalId: id }, '', `${window.location.pathname}?task=${id}`)
  }
  const closeTask = () => {
    setTaskModalId(null); setOriginRect(null)
    window.history.replaceState(null, '', window.location.pathname)
  }

  const chips: { key: LaneKey; label: string; tone: string }[] = [
    { key: 'all', label: t('All'), tone: 'neutral' },
    ...LANES.map(l => ({ key: l.key as LaneKey, label: t(l.label), tone: l.tone })),
  ]

  return (
    <div className="pm wb-m">
      <header className="pm__head">
        <h1 className="pm__title">{t('Workboard')}</h1>
        <span className="pm__count">{counts.all}</span>
      </header>

      <div className="pm__search">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="9" cy="9" r="6" /><path d="m17 17-3.2-3.2" />
        </svg>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search tasks…')} aria-label={t('Search tasks…')} />
      </div>

      <div className="pm__chips" role="tablist" aria-label={t('Filter by status')}>
        {chips.map(c => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={lane === c.key}
            className={`pm__chip pm__chip--${c.tone}${lane === c.key ? ' pm__chip--on' : ''}`}
            onClick={() => setLane(c.key)}
          >
            {c.label}<span className="pm__chip-n">{counts[c.key]}</span>
          </button>
        ))}
      </div>

      <button type="button" className={`pm__mine${mineOnly ? ' pm__mine--on' : ''}`} onClick={() => setMineOnly(v => !v)} aria-pressed={mineOnly}>
        <span className="pm__mine-box" aria-hidden="true">{mineOnly ? '✓' : ''}</span>
        {t('My tasks only')}
      </button>

      {workGroupsStatus.loading && allTasks.length === 0 ? (
        <div className="pm__empty">{t('Loading…')}</div>
      ) : workGroupsStatus.failed && allTasks.length === 0 ? (
        <SectionState title={t("Couldn't load tasks")} text={t('Check your connection and try again.')} />
      ) : visibleLanes.length === 0 ? (
        <div className="pm__empty">{t('No tasks match your filters.')}</div>
      ) : (
        <div className="wb-m__lanes">
          {visibleLanes.map(l => (
            <section key={l.key} className="wb-m__lane">
              <div className="wb-m__lane-head">
                <span className={`wb-m__lane-dot wb-m__lane-dot--${l.tone}`} aria-hidden="true" />
                <span className="wb-m__lane-label">{t(l.label)}</span>
                <span className="wb-m__lane-n">{grouped[l.key].length}</span>
              </div>
              <div className="pm__list">
                {grouped[l.key].map(tk => {
                  const sch = scheduleOf(tk, normalizeHealthStatus)
                  const slug = sch.tone === 'red' ? 'red' : sch.tone === 'amber' ? 'yellow' : sch.tone === 'done' ? 'completed' : sch.tone === 'grey' ? 'neutral' : 'green'
                  const prog = tk.workstream?.program
                  return (
                    <button key={tk.id} type="button" className="wb-m-card" onClick={e => openTask(tk.id, e)}>
                      <span className={`wb-m-card__rail wb-m-card__rail--${slug}`} aria-hidden="true" />
                      <div className="wb-m-card__body">
                        <p className="wb-m-card__title">{tk.title}</p>
                        <div className="wb-m-card__meta">
                          <span className="wb-m-card__code">{tk.code}</span>
                          {prog ? <span className="wb-m-card__prog">{prog.code}</span> : null}
                          {tk.blockerCount > 0 ? <span className="wb-m-card__blocker">{t('{{count}} blocker', { count: tk.blockerCount })}</span> : null}
                        </div>
                        <div className="wb-m-card__foot">
                          {sch.tone !== 'green' && sch.tone !== 'done' ? (
                            <span className={`wb-m-card__pill wb-m-card__pill--${slug}`}>{sch.label}</span>
                          ) : null}
                          <div className="wb-m-card__track">
                            <div className={`wb-m-card__fill wb-m-card__fill--${slug}`} style={{ width: `${Math.max(tk.percentComplete, 2)}%` }} />
                          </div>
                          <span className="wb-m-card__pct">{tk.percentComplete}%</span>
                          {tk.assignee?.name ? (
                            looksLikeAvatarUrl(tk.assignee.avatarUrl)
                              ? <img className="wb-m-card__avatar" src={tk.assignee.avatarUrl} alt={tk.assignee.name} title={tk.assignee.name} style={{ objectFit: 'cover' }} />
                              : <span className="wb-m-card__avatar" title={tk.assignee.name}>{initialsOf(tk.assignee.name)}</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="hm__bottom-space" aria-hidden="true" />

      {taskModalId !== null && (
        <TaskDetailModal taskId={taskModalId} originRect={originRect} onClose={closeTask} />
      )}
    </div>
  )
}
