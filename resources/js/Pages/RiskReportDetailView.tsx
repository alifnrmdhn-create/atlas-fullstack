import { useState, useEffect, useCallback } from 'react'
import { usePage } from '@inertiajs/react'
import { useWorkspace } from '../context/workspace'
import { api } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import type { RiskReport } from '../types/monthlyReports'
import { MonthlyReportDetailDIMR } from './MonthlyReportDetailDIMR'

export function RiskReportDetailView() {
  const page = usePage<{ report?: { id: number } }>()
  const reportId = page.props.report?.id != null ? String(page.props.report.id) : undefined
  const navigate = useInertiaNavigate()
  const { currentUser } = useWorkspace()

  const [report, setReport] = useState<RiskReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!reportId) return
    setLoading(true)
    setError(null)
    api.get<{ data: RiskReport }>(`/risk-reports/${reportId}`)
      .then(j => setReport(j.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Gagal memuat laporan risiko.'))
      .finally(() => setLoading(false))
  }, [reportId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="view-risk-report-detail">
        <div className="schedule-empty">
          <span className="text-muted text-sm">Memuat laporan risiko…</span>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="view-risk-report-detail">
        <div className="schedule-empty">
          <div className="schedule-empty__icon">⚠️</div>
          <p className="schedule-empty__title">Laporan tidak ditemukan</p>
          <p className="schedule-empty__sub">{error ?? 'Laporan risiko tidak tersedia.'}</p>
          <button className="btn btn--ghost schedule-empty__action" onClick={() => navigate('/laporan-risiko')}>
            Kembali ke daftar
          </button>
        </div>
      </div>
    )
  }

  return (
    <MonthlyReportDetailDIMR
      report={report}
      onBack={() => navigate('/laporan-risiko')}
      onRefresh={load}
      userId={currentUser?.id ?? 0}
      userRole={currentUser?.roleType ?? ''}
    />
  )
}

export default RiskReportDetailView
