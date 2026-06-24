import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { api } from '../lib/api'
import i18n from '../lib/i18n'

type WeekCell = {
  week: string
  tone: 'done' | 'planned' | 'gap' | 'empty'
  hasPlan: boolean
  hasActual: boolean
}

type MatrixRow = {
  id: number
  code: string
  name: string
  healthStatus: string | null
  progressPercent: number
  weeks: WeekCell[]
}

type MatrixData = {
  data: MatrixRow[]
  weeks: string[]
  currentWeek: string
}

const TONE_COLOR: Record<string, string> = {
  done:    'var(--green)',
  planned: 'var(--yellow)',
  gap:     'var(--red)',
  empty:   'var(--panel-border)',
}

const toneLabels = (): Record<string, string> => ({
  done:    i18n.t('Actual activity recorded'),
  planned: i18n.t('Planned, not yet done'),
  gap:     i18n.t('Expected, but empty'),
  empty:   i18n.t('No plan'),
})

export function MonitoringMatrix() {
  const { t } = useTranslation()
  const navigate = useInertiaNavigate()
  const [data, setData] = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get<{ data: MatrixRow[]; weeks: string[]; currentWeek: string }>('/programs/execution-matrix?weeks=7')
      .then(res => {
        if (res && Array.isArray(res.data)) {
          setData({ data: res.data, weeks: res.weeks ?? [], currentWeek: res.currentWeek ?? '' })
        } else {
          setError(t('Invalid response format'))
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : t('Failed to load matrix')))
      .finally(() => setLoading(false))
  }, [t])

  if (loading) return <div className="monitoring-matrix__loading">{t('Loading monitoring matrix…')}</div>
  if (error)   return <div className="monitoring-matrix__error">{error}</div>
  if (!data?.data?.length) return (
    <div className="monitoring-matrix__empty">
      <p>{t('No active programs to display.')}</p>
    </div>
  )

  return (
    <div className="monitoring-matrix">
      <div className="monitoring-matrix__legend">
        {Object.entries(toneLabels()).map(([tone, label]) => (
          <span key={tone} className="monitoring-matrix__legend-item">
            <span className="monitoring-matrix__dot" style={{ background: TONE_COLOR[tone] }} />
            {label}
          </span>
        ))}
      </div>

      <div className="monitoring-matrix__scroll">
        <table className="monitoring-matrix__table">
          <thead>
            <tr>
              <th className="monitoring-matrix__th-name">{t('Program')}</th>
              <th className="monitoring-matrix__th-prog">{t('Progress')}</th>
              {data.weeks.map(w => (
                <th key={w} className={`monitoring-matrix__th-week${w === data.currentWeek ? ' monitoring-matrix__th-week--current' : ''}`}>
                  {w.replace(/^\d{4}-/, '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map(row => (
              <tr key={row.id} className="monitoring-matrix__row" onClick={() => navigate(`/programs/${row.id}`)}>
                <td className="monitoring-matrix__td-name">
                  <span className="code-badge">{row.code}</span>
                  <span className="monitoring-matrix__prog-name" title={row.name}>{row.name}</span>
                </td>
                <td className="monitoring-matrix__td-prog">
                  <div className="progress-bar progress-bar--inline">
                    <div className="progress-bar__fill" style={{ width: `${row.progressPercent}%` }} />
                  </div>
                  <span className="monitoring-matrix__prog-pct">{row.progressPercent}%</span>
                </td>
                {row.weeks.map(cell => (
                  <td key={cell.week} className={`monitoring-matrix__td-week${cell.week === data.currentWeek ? ' monitoring-matrix__td-week--current' : ''}`}>
                    <div
                      className="monitoring-matrix__cell"
                      style={{ background: TONE_COLOR[cell.tone] }}
                      title={`${cell.week}: ${toneLabels()[cell.tone]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
