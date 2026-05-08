/**
 * Pilot DKM Metrics Dashboard — Post-MVP.
 * Admin-only halaman untuk evaluasi pilot Sprint 4.
 */
import { usePage } from '@inertiajs/react'
import { useState } from 'react'
import { api } from '../lib/api'

type StatusBreakdown = Record<string, number>

type Metrics = {
  directorate: { code: string; name: string } | null
  totalUsers: number
  totalEscalations: number
  avgDispositionDays: number | null
  hitRatePct: number | null
  activeUsersPct: number | null
  statusBreakdown: StatusBreakdown
  computedAt: string
  note?: string
}

type Criteria = {
  avg_time_to_disposition_days?: number
  min_hit_rate_aggregate_pct?: number
  min_user_satisfaction_score?: number
  min_active_users_pct?: number
  evaluation_period_weeks?: number
}

type PageProps = {
  metrics: Metrics
  criteria: Criteria
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Comparison = 'pass' | 'fail' | 'unknown'

/** Compare actual vs target. directionMin = true berarti actual >= target = pass. */
function compare(actual: number | null, target: number | undefined, directionMin: boolean): Comparison {
  if (actual === null || target === undefined) return 'unknown'
  return directionMin ? (actual >= target ? 'pass' : 'fail') : (actual <= target ? 'pass' : 'fail')
}

function MetricCard({
  label, value, target, comparison, suffix, helper,
}: {
  label: string
  value: string | number | null
  target?: string | number
  comparison: Comparison
  suffix?: string
  helper?: string
}) {
  const tone = comparison === 'pass' ? 'green' : comparison === 'fail' ? 'red' : 'muted'
  return (
    <div className="pilot-card">
      <span className="pilot-card__label">{label}</span>
      <div className="pilot-card__value-row">
        <span className={`pilot-card__value pilot-card__value--${tone}`}>
          {value === null || value === undefined ? '—' : value}
          {value !== null && suffix ? <span className="pilot-card__suffix"> {suffix}</span> : null}
        </span>
        {target !== undefined && (
          <span className="pilot-card__target">target: {target}{suffix ? ` ${suffix}` : ''}</span>
        )}
      </div>
      {helper && <span className="pilot-card__helper">{helper}</span>}
    </div>
  )
}

export default function AdminPilotMetricsView() {
  const { metrics: initial, criteria } = usePage<PageProps>().props
  const [metrics, setMetrics] = useState<Metrics>(initial)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await api.get<{ data: Metrics; criteria: Criteria }>('/admin/pilot-metrics/api')
      setMetrics(res.data)
    } finally {
      setRefreshing(false)
    }
  }

  const dispositionCmp = compare(metrics.avgDispositionDays, criteria.avg_time_to_disposition_days, false)
  const hitRateCmp = compare(metrics.hitRatePct, criteria.min_hit_rate_aggregate_pct, true)
  const activeUsersCmp = compare(metrics.activeUsersPct, criteria.min_active_users_pct, true)

  const passCount = [dispositionCmp, hitRateCmp, activeUsersCmp].filter(c => c === 'pass').length
  const evalTotal = [dispositionCmp, hitRateCmp, activeUsersCmp].filter(c => c !== 'unknown').length

  return (
    <div className="view-pilot-metrics">
      <div className="perf-toolbar">
        <span className="perf-toolbar__title">Pilot DKM — Metrics Dashboard</span>
        <div className="perf-toolbar__sep" />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Last computed: {formatDate(metrics.computedAt)}
        </span>
        <div className="perf-toolbar__right">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? 'Memuat…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="pilot-metrics-page">
        {metrics.note && (
          <div className="pilot-note">{metrics.note}</div>
        )}

        {/* Summary banner */}
        <div className="pilot-banner">
          <div>
            <span className="pilot-banner__label">Status pilot</span>
            <span className="pilot-banner__value">
              {evalTotal === 0 ? 'Belum ada data' : `${passCount}/${evalTotal} kriteria terpenuhi`}
            </span>
          </div>
          {metrics.directorate && (
            <span className="pilot-banner__directorate">
              {metrics.directorate.name} ({metrics.directorate.code})
            </span>
          )}
          <span className="pilot-banner__users">
            {metrics.totalUsers} user aktif · {metrics.totalEscalations} total eskalasi
          </span>
        </div>

        {/* Metric cards */}
        <div className="pilot-cards-grid">
          <MetricCard
            label="Avg Time-to-Disposition"
            value={metrics.avgDispositionDays}
            target={criteria.avg_time_to_disposition_days}
            comparison={dispositionCmp}
            suffix="hari"
            helper="REQUESTED → COMMITTED/DECLINED. Lebih cepat = lebih baik."
          />
          <MetricCard
            label="Hit Rate (CLEARED)"
            value={metrics.hitRatePct}
            target={criteria.min_hit_rate_aggregate_pct}
            comparison={hitRateCmp}
            suffix="%"
            helper="% eskalasi yang berhasil dibersihkan dari total."
          />
          <MetricCard
            label="Active Users"
            value={metrics.activeUsersPct}
            target={criteria.min_active_users_pct}
            comparison={activeUsersCmp}
            suffix="%"
            helper="% DKM users yang pernah create atau disposition eskalasi."
          />
        </div>

        {/* Status breakdown */}
        {Object.keys(metrics.statusBreakdown).length > 0 && (
          <div className="pilot-section">
            <h3 className="pilot-section__title">Distribusi Status Eskalasi</h3>
            <div className="pilot-status-grid">
              {Object.entries(metrics.statusBreakdown).map(([status, count]) => (
                <div key={status} className="pilot-status-item">
                  <span className="pilot-status-item__count">{count}</span>
                  <span className="pilot-status-item__label">{status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {criteria.evaluation_period_weeks && (
          <p className="pilot-footer-note">
            Evaluation window: {criteria.evaluation_period_weeks} minggu sejak rilis pilot.
            Kriteria sukses dikonfigurasi di <code>config/atlas-thresholds.php</code>.
          </p>
        )}
      </div>
    </div>
  )
}
