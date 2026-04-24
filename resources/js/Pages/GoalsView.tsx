import { useState, useEffect, useCallback, useId } from 'react'
import type { FormEvent } from 'react'
import { useWorkspace } from '../context/workspace'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { api } from '../lib/api'
import type { Kpi } from '../types'

// ── KPI form helpers ────────────────────────────────────────────────────────

type KpiForm = {
  code: string; name: string; description: string; metricType: string
  dataType: string; targetValue: string; unitOfMeasure: string
  reviewFrequency: string; isLeadingIndicator: boolean; isActive: boolean
}

const emptyKpiForm = (): KpiForm => ({
  code: '', name: '', description: '', metricType: 'PERCENTAGE', dataType: 'NUMERIC',
  targetValue: '', unitOfMeasure: '', reviewFrequency: 'MONTHLY',
  isLeadingIndicator: false, isActive: true,
})

const inferKpiDataType = (unitOfMeasure: string, metricType: string) => {
  const unit = unitOfMeasure.trim().toLowerCase()
  if (unit.startsWith('rp') || metricType === 'CURRENCY') return 'CURRENCY'
  if (unit === '%' || unit.includes('persen') || metricType === 'PERCENTAGE') return 'PERCENTAGE'
  return 'NUMERIC'
}

const KPI_HEALTH_CLASS: Record<string, string> = {
  GREEN: 'on-track',
  YELLOW: 'at-risk',
  RED: 'off-track',
}

const KPI_HEALTH_LABEL: Record<string, string> = {
  GREEN: 'On Track',
  YELLOW: 'At Risk',
  RED: 'Off Track',
}

function getAlignmentTone(pct: number): 'green' | 'yellow' | 'red' {
  if (pct > 90) return 'green'
  if (pct >= 85) return 'yellow'
  return 'red'
}

function getDeadlineTone(daysLeft: number): 'overdue' | 'today' | 'soon' | 'calm' {
  if (daysLeft < 0) return 'overdue'
  if (daysLeft === 0) return 'today'
  if (daysLeft <= 14) return 'soon'
  return 'calm'
}

function getDeadlineLabel(daysLeft: number): string {
  if (daysLeft < 0) return 'Overdue'
  if (daysLeft === 0) return 'Hari ini'
  return `${daysLeft}h`
}

// ── KPI table section ───────────────────────────────────────────────────────

function KpiSection({
  title, badge, badgeTone, list, canManage, onEdit, onDelete,
}: {
  title: string
  badge: string
  badgeTone: 'leading' | 'lagging'
  list: Kpi[]
  canManage: boolean
  onEdit: (kpi: Kpi) => void
  onDelete: (kpi: Kpi) => void
}) {
  return (
    <div className="section-block">
      <div className="section-header">
        <h3 className="section-title goals-section-title">
          <span>{title}</span>
          <span className={`goals-section-title__pill goals-section-title__pill--${badgeTone}`}>
            {badge}
          </span>
        </h3>
        <span className="section-badge">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="section-state section-state--compact goals-section-empty">
          <strong>Belum ada KPI</strong>
          <p>Belum ada KPI dalam kategori ini.</p>
        </div>
      ) : (
        <table className="reports-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama KPI</th>
              <th className="goals-kpi-table__head--numeric">Target</th>
              <th>Satuan</th>
              <th>Tipe</th>
              <th>Frekuensi</th>
              <th>Status</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {list.map(kpi => {
              const health = kpi.status
              const healthClass = KPI_HEALTH_CLASS[health] ?? 'off-track'
              const healthLabel = KPI_HEALTH_LABEL[health] ?? 'Off Track'
              const freqLabel: Record<string, string> = {
                WEEKLY: 'Mingguan', MONTHLY: 'Bulanan',
                QUARTERLY: 'Kuartalan', ANNUALLY: 'Tahunan',
              }
              return (
                <tr key={kpi.id}>
                  <td><span className="code-badge">{kpi.code}</span></td>
                  <td>
                    <span className="goals-kpi-name">
                      {kpi.name}
                    </span>
                  </td>
                  <td className="goals-kpi-target">
                    {kpi.targetValue.toLocaleString('id-ID')}
                  </td>
                  <td><span className="text-xs text-muted">{kpi.unitOfMeasure ?? '–'}</span></td>
                  <td><span className="badge">{kpi.metricType}</span></td>
                  <td><span className="text-xs text-muted">{freqLabel[kpi.reviewFrequency ?? ''] ?? '–'}</span></td>
                  <td>
                    <span className={`status-badge goals-kpi-status ${healthClass}`}>
                      {healthLabel}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="goals-kpi-actions">
                        <button
                          className="btn btn--xs btn--ghost goals-kpi-action"
                          onClick={() => onEdit(kpi)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn--xs btn--ghost goals-kpi-action goals-kpi-action--danger"
                          onClick={() => onDelete(kpi)}
                          type="button"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

export function GoalsView() {
  const {
    kpis: workspaceKpis, dashboard,
    normalizeHealthStatus,
    currentUser,
  } = useWorkspace()

  const role = currentUser?.roleType?.toUpperCase() ?? ''
  const isStrategic = role === 'BOD' || role === 'KADIV'
  const canManage = ['SUPERADMIN', 'ADMIN', 'KADIV'].includes(role)

  const [kpis, setKpis] = useState<Kpi[]>(workspaceKpis)
  useEffect(() => { setKpis(workspaceKpis) }, [workspaceKpis])

  const refreshKpis = useCallback(() => {
    api.get<{ data: Kpi[] }>('/kpis')
      .then(res => setKpis(res.data ?? []))
      .catch(() => {})
  }, [])

  // ── KPI create/edit modal ────────────────────────────────────────────────
  const [showKpiModal, setShowKpiModal] = useState(false)
  const kpiDialogRef = useDialogFocus<HTMLDivElement>(showKpiModal)
  const kpiDialogTitleId = useId()
  const kpiDialogDescId = useId()
  const [editingKpi, setEditingKpi] = useState<Kpi | null>(null)
  const [kpiForm, setKpiForm] = useState<KpiForm>(emptyKpiForm())
  const [kpiSaving, setKpiSaving] = useState(false)
  const [kpiError, setKpiError] = useState<string | null>(null)

  const openCreateKpi = () => {
    setEditingKpi(null)
    setKpiForm(emptyKpiForm())
    setKpiError(null)
    setShowKpiModal(true)
  }

  const openEditKpi = (kpi: Kpi) => {
    setEditingKpi(kpi)
    setKpiForm({
      code: kpi.code,
      name: kpi.name,
      description: '',
      metricType: kpi.metricType ?? 'PERCENTAGE',
      dataType: kpi.dataType ?? 'NUMERIC',
      targetValue: String(kpi.targetValue),
      unitOfMeasure: kpi.unitOfMeasure ?? '',
      reviewFrequency: kpi.reviewFrequency ?? 'MONTHLY',
      isLeadingIndicator: kpi.isLeadingIndicator,
      isActive: true,
    })
    setKpiError(null)
    setShowKpiModal(true)
  }

  const submitKpiForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setKpiSaving(true)
    setKpiError(null)
    try {
      const payload = {
        code: kpiForm.code.trim(),
        name: kpiForm.name.trim(),
        description: kpiForm.description.trim() || undefined,
        metricType: kpiForm.metricType,
        dataType: inferKpiDataType(kpiForm.unitOfMeasure, kpiForm.metricType),
        targetValue: parseFloat(kpiForm.targetValue),
        unitOfMeasure: kpiForm.unitOfMeasure.trim() || undefined,
        reviewFrequency: kpiForm.reviewFrequency as 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
        isLeadingIndicator: kpiForm.isLeadingIndicator,
        isActive: kpiForm.isActive,
      }
      if (editingKpi) {
        await api.patch(`/kpis/${editingKpi.id}`, payload)
      } else {
        await api.post('/kpis', payload)
      }
      setShowKpiModal(false)
      setEditingKpi(null)
      refreshKpis()
    } catch (err: unknown) {
      setKpiError((err as { message?: string })?.message ?? 'Gagal menyimpan KPI.')
    } finally {
      setKpiSaving(false)
    }
  }

  // ── KPI delete ──────────────────────────────────────────────────────────
  const [confirmDeleteKpi, setConfirmDeleteKpi] = useState<Kpi | null>(null)
  const deleteKpiDialogRef = useDialogFocus<HTMLDivElement>(confirmDeleteKpi !== null)
  const deleteKpiTitleId = useId()
  const deleteKpiDescId = useId()
  const [kpiDeleteSaving, setKpiDeleteSaving] = useState(false)
  const [kpiDeleteError, setKpiDeleteError] = useState<string | null>(null)

  const doDeleteKpi = async () => {
    if (!confirmDeleteKpi) return
    setKpiDeleteSaving(true)
    setKpiDeleteError(null)
    try {
      await api.delete(`/kpis/${confirmDeleteKpi.id}`)
      setConfirmDeleteKpi(null)
      refreshKpis()
    } catch (err) {
      setKpiDeleteError(err instanceof Error ? err.message : 'Gagal menghapus KPI.')
    } finally {
      setKpiDeleteSaving(false)
    }
  }

  const leadingKpis = kpis.filter(k => k.isLeadingIndicator)
  const laggingKpis = kpis.filter(k => !k.isLeadingIndicator)
  const strategicItems = dashboard?.dimensions.strategic ?? []

  const overallScore = strategicItems.length > 0
    ? Math.round(strategicItems.reduce((s, i) => s + i.strategicAlignment, 0) / strategicItems.length)
    : null

  const onTrack  = kpis.filter(k => normalizeHealthStatus(k.status) === 'GREEN').length
  const atRisk   = kpis.filter(k => normalizeHealthStatus(k.status) === 'YELLOW').length
  const offTrack = kpis.filter(k => normalizeHealthStatus(k.status) === 'RED').length

  return (
    <div className="view-goals">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Goals & KPI</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">
          {isStrategic
            ? 'Kelola definisi KPI, target, dan keselarasan strategis portfolio.'
            : 'Kelola KPI dan target kinerja dalam lingkup unit Anda.'}
        </span>
        <div className="view-toolbar__right">
          <div className="view-toolbar__stats goals-toolbar-stats">
            <span className="goals-toolbar-stat">{kpis.length} <em>KPIs</em></span>
            <span className="goals-toolbar-stat goals-toolbar-stat--green">{onTrack} <em>on track</em></span>
            {atRisk > 0   && <span className="goals-toolbar-stat goals-toolbar-stat--yellow">{atRisk} <em>at risk</em></span>}
            {offTrack > 0 && <span className="goals-toolbar-stat goals-toolbar-stat--red">{offTrack} <em>off track</em></span>}
            {overallScore !== null && <span className="goals-toolbar-stat goals-toolbar-stat--blue">{overallScore}% <em>alignment</em></span>}
          </div>
          {canManage && (
            <button className="btn btn--primary btn--sm goals-toolbar-cta" onClick={openCreateKpi}>
              + Buat KPI
            </button>
          )}
        </div>
      </div>

      <div className="goals-workspace">
        {/* Left: KPI management tables */}
        <div className="goals-main">
          <KpiSection
            title="KPI Sinyal Utama"
            badge="Leading"
            badgeTone="leading"
            list={leadingKpis}
            canManage={canManage}
            onEdit={openEditKpi}
            onDelete={(k) => setConfirmDeleteKpi(k)}
          />
          <KpiSection
            title="Indikator Lagging"
            badge="Lagging"
            badgeTone="lagging"
            list={laggingKpis}
            canManage={canManage}
            onEdit={openEditKpi}
            onDelete={(k) => setConfirmDeleteKpi(k)}
          />
        </div>

        {/* Right: alignment rail */}
        <aside className="goals-rail right-rail">

          {/* Program Alignment */}
          {strategicItems.length > 0 && (
            <div className="section-block">
              <div className="section-header">
                <h3 className="section-title goals-rail-title">Program Alignment</h3>
              </div>
              <div className="goals-alignment-list">
                {[...strategicItems]
                  .sort((a, b) => b.strategicAlignment - a.strategicAlignment)
                  .map(item => {
                    const pct = item.strategicAlignment
                    const tone = getAlignmentTone(pct)
                    return (
                      <div className="goals-alignment-row" key={item.programId}>
                        <div className="goals-alignment-row__top">
                          <span className="goals-alignment-row__name">{item.program}</span>
                          <span className={`goals-alignment-row__pct goals-alignment-row__pct--${tone}`}>{pct}%</span>
                        </div>
                        <div className="goals-alignment-row__track">
                          <div className={`goals-alignment-row__fill goals-alignment-row__fill--${tone}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Upcoming Deadlines */}
          {dashboard?.dimensions.timeIntelligence && dashboard.dimensions.timeIntelligence.length > 0 && (
            <div className="section-block">
              <div className="section-header">
                <h3 className="section-title goals-rail-title">Upcoming Deadlines</h3>
              </div>
              <div className="goals-deadline-list">
                {dashboard.dimensions.timeIntelligence.slice(0, 6).map(item => {
                  const daysLeft = Math.ceil((new Date(item.targetCompletion).getTime() - Date.now()) / 86400000)
                  const deadlineTone = getDeadlineTone(daysLeft)
                  return (
                    <div className="list-row goals-deadline-row" key={item.id}>
                      <span className="code-badge goals-deadline-row__code">{item.code}</span>
                      <span className="goals-deadline-row__title">
                        {item.title}
                      </span>
                      <span className={`goals-deadline-row__days goals-deadline-row__days--${deadlineTone}`}>
                        {getDeadlineLabel(daysLeft)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </aside>
      </div>

      {/* ── Create / Edit KPI Modal ── */}
      {showKpiModal && (
        <div className="modal-backdrop" onClick={() => !kpiSaving && setShowKpiModal(false)}>
          <div aria-describedby={kpiDialogDescId} aria-labelledby={kpiDialogTitleId} aria-modal="true" className="modal modal--wide" ref={kpiDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Goals</span>
                <h3 className="modal__title" id={kpiDialogTitleId}>{editingKpi ? 'Edit KPI' : 'Buat KPI Baru'}</h3>
                <p className="modal-subtitle" id={kpiDialogDescId}>
                  {editingKpi
                    ? 'Perbarui definisi, target, dan aturan review agar KPI tetap relevan dan mudah dipantau.'
                    : 'Bangun KPI baru dengan identitas yang jelas, target terukur, dan ritme review yang konsisten.'}
                </p>
              </div>
              <button
                aria-label="Tutup"
                className="modal__close"
                disabled={kpiSaving}
                onClick={() => setShowKpiModal(false)}
                type="button"
              >
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={submitKpiForm}>
              <div className="modal__body goals-modal-body">
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Identitas KPI</h4>
                    <p>Tetapkan kode, nama, dan konteks singkat agar indikator mudah dikenali di dashboard.</p>
                  </div>
                  <div className="goals-form-grid goals-form-grid--name">
                    <div className="modal-field">
                      <label className="modal-label">Kode <span className="goals-required">*</span></label>
                      <input
                        autoFocus
                        className="form-input"
                        disabled={kpiSaving || !!editingKpi}
                        maxLength={40}
                        minLength={2}
                        onChange={e => setKpiForm(f => ({ ...f, code: e.target.value }))}
                        placeholder="KPI-001"
                        required
                        type="text"
                        value={kpiForm.code}
                      />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">Nama KPI <span className="goals-required">*</span></label>
                      <input
                        className="form-input"
                        disabled={kpiSaving}
                        maxLength={120}
                        minLength={2}
                        onChange={e => setKpiForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Nama indikator kinerja…"
                        required
                        type="text"
                        value={kpiForm.name}
                      />
                    </div>
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Deskripsi</label>
                    <textarea
                      className="form-input goals-textarea"
                      disabled={kpiSaving}
                      maxLength={400}
                      onChange={e => setKpiForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Penjelasan singkat tentang KPI ini…"
                      rows={2}
                      value={kpiForm.description}
                    />
                  </div>
                </section>

                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Target & review</h4>
                    <p>Pastikan angka target, satuan, dan frekuensi review selaras dengan cara KPI ini dinilai.</p>
                  </div>
                  <div className="goals-form-grid goals-form-grid--metrics">
                    <div className="modal-field">
                      <label className="modal-label">Target Value <span className="goals-required">*</span></label>
                      <input
                        className="form-input"
                        disabled={kpiSaving}
                        onChange={e => setKpiForm(f => ({ ...f, targetValue: e.target.value }))}
                        placeholder="100"
                        required
                        step="any"
                        type="number"
                        value={kpiForm.targetValue}
                      />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">Satuan</label>
                      <input
                        className="form-input"
                        disabled={kpiSaving}
                        maxLength={30}
                        onChange={e => setKpiForm(f => ({ ...f, unitOfMeasure: e.target.value }))}
                        placeholder="%, Rp, unit…"
                        type="text"
                        value={kpiForm.unitOfMeasure}
                      />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">Frekuensi Review</label>
                      <select
                        className="form-input"
                        disabled={kpiSaving}
                        onChange={e => setKpiForm(f => ({ ...f, reviewFrequency: e.target.value }))}
                        value={kpiForm.reviewFrequency}
                      >
                        <option value="WEEKLY">Mingguan</option>
                        <option value="MONTHLY">Bulanan</option>
                        <option value="QUARTERLY">Kuartalan</option>
                        <option value="ANNUALLY">Tahunan</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Perilaku metrik</h4>
                    <p>Tentukan karakter KPI dan tandai bila indikator ini berfungsi sebagai sinyal utama.</p>
                  </div>
                  <div className="goals-form-grid goals-form-grid--meta">
                    <div className="modal-field">
                      <label className="modal-label">Tipe Metrik</label>
                      <select
                        className="form-input"
                        disabled={kpiSaving}
                        onChange={e => setKpiForm(f => ({ ...f, metricType: e.target.value }))}
                        value={kpiForm.metricType}
                      >
                        <option value="PERCENTAGE">Persentase</option>
                        <option value="CURRENCY">Mata Uang</option>
                        <option value="COUNT">Jumlah</option>
                        <option value="RATIO">Rasio</option>
                        <option value="INDEX">Indeks</option>
                      </select>
                    </div>
                    <div className="modal-field goals-modal-field goals-modal-field--end">
                      <label className="goals-checkbox-row">
                        <input
                          checked={kpiForm.isLeadingIndicator}
                          disabled={kpiSaving}
                          onChange={e => setKpiForm(f => ({ ...f, isLeadingIndicator: e.target.checked }))}
                          type="checkbox"
                        />
                        Indikator Sinyal Utama (Leading)
                      </label>
                    </div>
                  </div>
                </section>

                {kpiError && <p className="text-sm goals-modal-error">{kpiError}</p>}
              </div>
              <div className="modal__footer">
                <button
                  className="btn btn--ghost"
                  disabled={kpiSaving}
                  onClick={() => setShowKpiModal(false)}
                  type="button"
                >
                  Batal
                </button>
                <button className="btn btn--primary" disabled={kpiSaving} type="submit">
                  {kpiSaving ? 'Menyimpan…' : editingKpi ? 'Simpan Perubahan' : 'Buat KPI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete KPI Confirmation ── */}
      {confirmDeleteKpi && (
        <div className="modal-backdrop" onClick={() => !kpiDeleteSaving && setConfirmDeleteKpi(null)}>
          <div aria-describedby={deleteKpiDescId} aria-labelledby={deleteKpiTitleId} aria-modal="true" className="modal goals-delete-modal" ref={deleteKpiDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <h3 className="modal__title" id={deleteKpiTitleId}>Hapus KPI?</h3>
                <p className="modal-subtitle" id={deleteKpiDescId}>Aksi ini permanen dan akan menghapus KPI beserta seluruh histori nilainya.</p>
              </div>
              <button
                aria-label="Tutup"
                className="modal__close"
                disabled={kpiDeleteSaving}
                onClick={() => { setConfirmDeleteKpi(null); setKpiDeleteError(null) }}
                type="button"
              >
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="modal__body">
              <p className="text-sm goals-delete-copy modal-helper-note modal-helper-note--danger">
                KPI <strong>{confirmDeleteKpi.name}</strong> [{confirmDeleteKpi.code}] akan dihapus permanen beserta seluruh riwayat nilainya.
              </p>
              {kpiDeleteError && <p className="wid-form__error" style={{ marginTop: 8 }}>{kpiDeleteError}</p>}
            </div>
            <div className="modal__footer">
              <button
                className="btn btn--ghost"
                disabled={kpiDeleteSaving}
                onClick={() => { setConfirmDeleteKpi(null); setKpiDeleteError(null) }}
                type="button"
              >
                Batal
              </button>
              <button
                className="btn btn--danger"
                disabled={kpiDeleteSaving}
                onClick={() => void doDeleteKpi()}
                type="button"
              >
                {kpiDeleteSaving ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
