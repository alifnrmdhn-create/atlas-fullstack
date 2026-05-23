import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePage } from '@inertiajs/react'
import { api } from '../lib/api'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useEscKey } from '../hooks/useEscKey'
import { MON_FULL, STATUS } from '../types/monthlyReports'

type RiskReportSummary = {
  id: number
  month: number
  year: number
  status: string
  compositeRating: string | null
  rmiScore: string | null
  submittedAt: string | null
  approvedAt: string | null
  unit: { id: number; code: string; name: string }
  submittedBy: { id: number; name: string } | null
  approvals: { id: number; approver: { id: number; name: string; roleType: string } }[]
  _count?: { riskSnapshots?: number; lossEvents?: number }
  risk_snapshots_count?: number
  loss_events_count?: number
}

const COMPOSITE_META: Record<string, { label: string; color: string }> = {
  LOW:              { label: 'Low',              color: '#22c55e' },
  LOW_TO_MODERATE:  { label: 'Low–Moderate',    color: '#84cc16' },
  MODERATE:         { label: 'Moderate',         color: '#f59e0b' },
  MODERATE_TO_HIGH: { label: 'Moderate–High',   color: '#f97316' },
  HIGH:             { label: 'High',             color: '#ef4444' },
}

export function RiskReportsView() {
  const navigate = useInertiaNavigate()
  const { currentUser } = useWorkspace()

  const [reports, setReports] = useState<RiskReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)

  // Sync filters from URL (?year=, ?status=) — written by the Context Panel.
  const { url } = usePage()
  useEffect(() => {
    const qs = url.split('?')[1] ?? ''
    const params = new URLSearchParams(qs)
    const rawYear = params.get('year')
    const yearNum = rawYear ? Number(rawYear) : NaN
    if (Number.isFinite(yearNum)) setYearFilter(yearNum)
    const rawStatus = params.get('status')
    setStatusFilter(rawStatus && ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(rawStatus) ? rawStatus : 'all')
  }, [url])

  const loadReports = () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ year: String(yearFilter) })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    api.get<{ data: RiskReportSummary[] }>(`/risk-reports?${params}`)
      .then(j => setReports(j.data ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Gagal memuat laporan risiko.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ year: String(yearFilter) })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    api.get<{ data: RiskReportSummary[] }>(`/risk-reports?${params}`)
      .then(j => { if (!cancelled) setReports(j.data ?? []) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat laporan risiko.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [yearFilter, statusFilter])

  const years = [2025, 2026, 2027]

  const grouped = reports.reduce<Record<string, RiskReportSummary[]>>((acc, r) => {
    const key = r.unit.name
    ;(acc[key] ??= []).push(r)
    return acc
  }, {})

  return (
    <div className="view-risk-reports">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Risk Reports</h2>
        <div className="view-toolbar__sep" />
        <div className="view-toggle">
          {years.map(y => (
            <button
              key={y}
              className={`view-toggle-btn${yearFilter === y ? ' active' : ''}`}
              onClick={() => setYearFilter(y)}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="view-toggle">
          {(['all', 'DRAFT', 'SUBMITTED', 'APPROVED'] as const).map(s => (
            <button
              key={s}
              className={`view-toggle-btn${statusFilter === s ? ' active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'Semua' : STATUS[s]?.label ?? s}
            </button>
          ))}
        </div>
        <button className="view-toggle-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowCreate(true)}>
          + Buat Laporan
        </button>
      </div>

      <div className="risk-reports-body">
        {loading && (
          <div className="schedule-empty">
            <span className="text-muted text-sm">Memuat laporan risiko…</span>
          </div>
        )}

        {error && (
          <div className="schedule-empty">
            <span className="text-sm schedule-feedback schedule-feedback--danger">{error}</span>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className="schedule-empty">
            <div className="schedule-empty__icon">🛡</div>
            <p className="schedule-empty__title">Belum ada laporan risiko</p>
            <p className="schedule-empty__sub">Laporan risiko DIMR untuk tahun {yearFilter} belum tersedia.</p>
          </div>
        )}

        {!loading && !error && Object.entries(grouped).map(([unitName, unitReports]) => (
          <div key={unitName} className="risk-reports-group">
            <div className="risk-reports-group__header">
              <span className="risk-reports-group__name">{unitName}</span>
              <span className="risk-reports-group__count">{unitReports.length} laporan</span>
            </div>
            <div className="risk-reports-table">
              <div className="risk-reports-table__head">
                <span>Periode</span>
                <span>Status</span>
                <span>Composite Rating</span>
                <span>RMI Score</span>
                <span>Risiko</span>
                <span>Loss Events</span>
                <span>Submitted</span>
              </div>
              {unitReports
                .sort((a, b) => b.month - a.month)
                .map(r => {
                  const statusMeta = STATUS[r.status]
                  const compositeMeta = r.compositeRating ? COMPOSITE_META[r.compositeRating] : null
                  const riskCount = r._count?.riskSnapshots ?? r.risk_snapshots_count ?? 0
                  const lossEventCount = r._count?.lossEvents ?? r.loss_events_count ?? 0
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`risk-reports-table__row risk-reports-table__row--${statusMeta?.row ?? 'neutral'}`}
                      onClick={() => navigate(`/laporan-risiko/${r.id}`)}
                    >
                      <span className="risk-reports-table__period">
                        {MON_FULL[r.month - 1]} {r.year}
                      </span>
                      <span>
                        <span className={`mr-status-badge mr-status-badge--${statusMeta?.cls ?? 'neutral'}`}>
                          {statusMeta?.label ?? r.status}
                        </span>
                      </span>
                      <span>
                        {compositeMeta ? (
                          <span className="risk-reports-table__rating" style={{ color: compositeMeta.color }}>
                            ● {compositeMeta.label}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </span>
                      <span className="risk-reports-table__rmi">
                        {r.rmiScore != null ? Number(r.rmiScore).toFixed(2) : '—'}
                      </span>
                      <span className="risk-reports-table__count">
                        {riskCount > 0 ? `${riskCount} risiko` : '—'}
                      </span>
                      <span className="risk-reports-table__count">
                        {lossEventCount > 0 ? `${lossEventCount} kejadian` : '—'}
                      </span>
                      <span className="risk-reports-table__submitted text-muted">
                        {r.submittedBy
                          ? r.submittedBy.name.split(' ')[0]
                          : r.status === 'DRAFT' ? 'Belum' : '—'}
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateRiskReportModal
          userId={currentUser?.id ?? 0}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); loadReports(); navigate(`/laporan-risiko/${id}`) }}
        />
      )}
    </div>
  )
}

export default RiskReportsView

// ── Create Risk Report Modal ──────────────────────────────────────────────────

type OrgUnit = { id: number; code: string; name: string }

function CreateRiskReportModal({ userId, onClose, onCreated }: {
  userId: number
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const now = new Date()
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [year, setYear]     = useState(now.getFullYear())
  const [unitId, setUnitId] = useState('')
  const [units, setUnits]   = useState<OrgUnit[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  useEscKey(() => {
    if (saving) return
    // Dirty: user sudah memilih unit atau mengubah bulan/tahun dari default
    const dirty = unitId !== '' || month !== now.getMonth() + 1 || year !== now.getFullYear()
    if (dirty && !window.confirm('Buang perubahan yang belum disimpan?')) return
    onClose()
  }, true)

  useEffect(() => {
    api.get<{ data: OrgUnit[] }>('/organization/units')
      .then(j => setUnits(j.data ?? []))
      .catch((err) => console.error('[Atlas] Silent failure in RiskReportsView.tsx:', err))
  }, [])

  const save = async () => {
    if (!unitId) { setErr('Pilih unit terlebih dahulu.'); return }
    setSaving(true); setErr(null)
    try {
      const res = await api.post<{ data: { id: number } }>('/risk-reports', {
        month: Number(month),
        year: Number(year),
        unitId: Number(unitId),
        createdById: userId,
      })
      onCreated(res.data.id)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal membuat laporan') }
    finally { setSaving(false) }
  }

  const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  const YEARS  = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  // Phase 5B: portal-mount ke document.body — modal-safe walaupun parent
  // page punya transform animation. RiskReportsView main wrapper di future
  // bisa dapat ds-stagger; modal tetap aman.
  return createPortal(
    <div className="dimr-modal-backdrop" onClick={onClose}>
      <div className="dimr-modal" onClick={e => e.stopPropagation()}>
        <div className="dimr-modal__header">
          <span className="dimr-modal__title">Buat Laporan Risiko Baru</span>
          <button className="dimr-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="dimr-modal__body">
          <label className="dimr-form-label">Unit / Divisi</label>
          <select className="dimr-form-select" value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">— Pilih unit —</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label className="dimr-form-label">Bulan</label>
              <select className="dimr-form-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="dimr-form-label">Tahun</label>
              <select className="dimr-form-select" value={year} onChange={e => setYear(Number(e.target.value))}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {err && <p className="dimr-form-error">{err}</p>}
        </div>
        <div className="dimr-modal__footer">
          <button className="mrd-btn" onClick={onClose} disabled={saving}>Batal</button>
          <button className="mrd-btn primary" onClick={save} disabled={saving}>
            {saving ? 'Membuat…' : 'Buat Laporan'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
