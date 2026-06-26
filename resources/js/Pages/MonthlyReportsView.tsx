import { useState, useCallback, useEffect, useId, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { usePage } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { api } from '../lib/api'
import {
  type Report,
  MON, CY, YEARS, STATUS,
} from '../types/monthlyReports'
import './MonthlyReports.css'

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children, footer }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { t } = useTranslation()
  const dialogRef = useDialogFocus<HTMLDivElement>(true)
  useEscKey(onClose, true)
  const titleId = useId()
  const subtitleId = useId()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div aria-describedby={subtitle ? subtitleId : undefined} aria-labelledby={titleId} aria-modal="true" className="modal-surface mr-modal-surface" ref={dialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-headcopy">
            <span className="modal-kicker">{t('Monthly Reports')}</span>
            <span className="modal-title" id={titleId}>{title}</span>
            {subtitle ? <p className="modal-subtitle" id={subtitleId}>{subtitle}</p> : null}
          </div>
          <button aria-label={t('Close')} className="modal__close" onClick={onClose} type="button">
            <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer mr-modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

// ── Main view (list only) ─────────────────────────────────────────────────────

export function MonthlyReportsView() {
  const { t } = useTranslation()
  const navigate = useInertiaNavigate()
  const { currentUser } = useWorkspace()
  const role   = currentUser?.roleType?.toUpperCase() ?? ''
  const myUnit = currentUser?.unit

  const isKASUBDIV = role === 'KASUBDIV'
  const isKADIV    = role === 'KADIV'
  const canCreate  = ['ASISTEN','KASUBDIV','KADIV'].includes(role)
  const canSeeAll  = role === 'BOD'

  const [year, setYear]       = useState(CY)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Sync year + status filter from URL (?year=, ?status=) — written by Context Panel.
  // Status is applied client-side; year drives the API call via existing `load()`.
  const { url } = usePage()
  const urlStatusFilter = useMemo<Set<string>>(() => {
    const qs = url.split('?')[1] ?? ''
    const raw = new URLSearchParams(qs).get('status') ?? ''
    return new Set(raw.split(',').filter(Boolean))
  }, [url])
  useEffect(() => {
    const qs = url.split('?')[1] ?? ''
    const rawYear = new URLSearchParams(qs).get('year')
    const yearNum = rawYear ? Number(rawYear) : NaN
    if (Number.isFinite(yearNum) && YEARS.includes(yearNum) && yearNum !== year) {
      setYear(yearNum)
    }
  }, [url, year])

  const [modal, setModal]   = useState<null | 'create' | 'upload'>(null)
  const [uploadId, setUploadId] = useState<number | null>(null)

  const [createForm, setCreateForm] = useState({ month: new Date().getMonth() + 1, year: CY })
  const [busy, setBusy]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const q = new URLSearchParams({ year: String(year) })
      if (!canSeeAll && myUnit?.id) q.set('unitId', String(myUnit.id))
      const res = await api.get<{ data: Report[] }>(`/monthly-reports?${q}`)
      setReports(res.data)
    } catch (e) { setError(e instanceof Error ? e.message : t('Failed to load')) }
    finally { setLoading(false) }
  }, [year, canSeeAll, myUnit?.id])

  useEffect(() => { void load() }, [load])

  async function doCreate() {
    setBusy(true)
    try { await api.post('/monthly-reports', createForm); setModal(null); await load() }
    catch (e) { alert(e instanceof Error ? e.message : t('Failed')) }
    finally { setBusy(false) }
  }

  async function doUpload(id: number, file: File) {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.upload<{ data: Report }>(`/monthly-reports/${id}/upload`, fd)
      setModal(null); await load()
    } catch (e) { alert(e instanceof Error ? e.message : t('Upload failed')) }
    finally { setUploading(false) }
  }

  async function doSubmit(id: number) {
    if (!confirm(t('Submit this report for review?'))) return
    setBusy(true)
    try { await api.post(`/monthly-reports/${id}/submit`, {}); await load() }
    catch (e) { alert(e instanceof Error ? e.message : t('Failed')) }
    finally { setBusy(false) }
  }

  async function doDelete(id: number) {
    if (!confirm(t('Delete this draft report?'))) return
    try { await api.delete(`/monthly-reports/${id}`); await load() }
    catch (e) { alert(e instanceof Error ? e.message : t('Failed')) }
  }

  function openReport(id: number) {
    navigate(`/laporan-bulanan/${id}`)
  }

  const canApprove = (r: Report) =>
    (isKASUBDIV && r.status === 'SUBMITTED') || (isKADIV && r.status === 'REVIEWED')

  const approved = reports.filter(r => r.status === 'APPROVED').length
  const pending  = reports.filter(r => ['SUBMITTED','REVIEWED'].includes(r.status)).length
  const rejected = reports.filter(r => r.status === 'REJECTED').length
  const drafts   = reports.filter(r => r.status === 'DRAFT').length
  const total    = reports.length

  // Apply URL status filter only to the rendered list, not the summary counts.
  const visibleReports = urlStatusFilter.size > 0
    ? reports.filter(r => urlStatusFilter.has(r.status))
    : reports

  const unitGroups = canSeeAll
    ? [...new Map(visibleReports.map(r => [r.unitId, r.unit])).entries()]
        .map(([uid, unit]) => ({ unit, rows: visibleReports.filter(r => r.unitId === uid) }))
        .sort((a, b) => a.unit.name.localeCompare(b.unit.name))
    : [{ unit: myUnit ?? { id: 0, code: '', name: '' }, rows: visibleReports }]

  return (
    <div className="view-mr">

      {/* ── Toolbar ── */}
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">{t('Monthly Reports')}</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">{t('Monthly division output — upload, review, tiered approval')}</span>
        <div className="mr-toolbar-controls">
          <select className="form-select mr-toolbar-year"
            value={year} onChange={e => { setYear(Number(e.target.value)) }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {canCreate && (
            <button className="btn btn--primary btn--sm" onClick={() => setModal('create')}>
              {t('+ New Report')}
            </button>
          )}
        </div>
      </div>

      {/* ── Stat strip ── */}
      <div className="mr-strip">
        <div className="mr-strip__card neutral">
          <div className="mr-strip__icon-wrap neutral"><span className="mr-strip__icon">📋</span></div>
          <div className="mr-strip__content">
            <span className="mr-strip__val">{total}</span>
            <span className="mr-strip__lbl">{t('Total Reports')}</span>
          </div>
          {total > 0 && <div className="mr-strip__progress"><div className="mr-strip__progress-fill neutral" style={{ width: '100%' }} /></div>}
        </div>
        <div className="mr-strip__card green">
          <div className="mr-strip__icon-wrap green"><span className="mr-strip__icon">✓</span></div>
          <div className="mr-strip__content">
            <span className="mr-strip__val green">{approved}</span>
            <span className="mr-strip__lbl">{t('Approved')}</span>
          </div>
          {total > 0 && <div className="mr-strip__progress"><div className="mr-strip__progress-fill green" style={{ width: `${(approved / total) * 100}%` }} /></div>}
        </div>
        <div className="mr-strip__card amber">
          <div className="mr-strip__icon-wrap amber"><span className="mr-strip__icon">⏳</span></div>
          <div className="mr-strip__content">
            <span className="mr-strip__val amber">{pending}</span>
            <span className="mr-strip__lbl">{t('Awaiting Review')}</span>
          </div>
          {total > 0 && <div className="mr-strip__progress"><div className="mr-strip__progress-fill amber" style={{ width: `${(pending / total) * 100}%` }} /></div>}
        </div>
        <div className="mr-strip__card muted">
          <div className="mr-strip__icon-wrap muted"><span className="mr-strip__icon">✏️</span></div>
          <div className="mr-strip__content">
            <span className="mr-strip__val muted">{drafts}</span>
            <span className="mr-strip__lbl">{t('Draft')}</span>
          </div>
          {total > 0 && <div className="mr-strip__progress"><div className="mr-strip__progress-fill muted" style={{ width: `${(drafts / total) * 100}%` }} /></div>}
        </div>
        {rejected > 0 && (
          <div className="mr-strip__card red">
            <div className="mr-strip__icon-wrap red"><span className="mr-strip__icon">✕</span></div>
            <div className="mr-strip__content">
              <span className="mr-strip__val red">{rejected}</span>
              <span className="mr-strip__lbl">{t('Rejected')}</span>
            </div>
            {total > 0 && <div className="mr-strip__progress"><div className="mr-strip__progress-fill red" style={{ width: `${(rejected / total) * 100}%` }} /></div>}
          </div>
        )}
      </div>

      {/* ── Report list ── */}
      {loading ? (
        <div className="mr-state">
          <span className="mr-state__copy">{t('Loading reports…')}</span>
        </div>
      ) : error ? (
        <div className="mr-state mr-state--error">
          <span className="mr-state__copy">{error}</span>
        </div>
      ) : (
        <div className="mr-index">
          {total === 0 && (
            <div className="mr-index__empty">
              <span className="mr-index__empty-icon">📋</span>
              <span>{t('No reports for {{year}}', { year })}</span>
              {canCreate && (
                <button className="mr-btn primary" onClick={() => setModal('create')}>
                  {t('+ Create First Report')}
                </button>
              )}
            </div>
          )}

          {unitGroups.map(({ unit, rows }) => (
            <div key={unit.id} className="mr-index__group">
              {canSeeAll && (
                <div className="mr-index__group-header">
                  <span className="mr-index__group-name">{unit.name}</span>
                  <span className="mr-index__group-count">{t('{{count}} report', { count: rows.length })}</span>
                </div>
              )}
              <div className="mr-index__cards">
                {rows.map(r => {
                  const st         = STATUS[r.status] ?? STATUS.DRAFT
                  const cnt        = r.metrics_count ?? 0
                  const approvable = canApprove(r)
                  return (
                    <div key={r.id} className={`mr-card ${st.row}${approvable ? ' needs-action' : ''}`}>
                      {/* Status band */}
                      <div className="mr-card__band" />

                      <button
                        type="button"
                        className="mr-card__main"
                        onClick={() => openReport(r.id)}
                        aria-label={t('Open report dashboard for {{period}}', { period: `${MON[r.month - 1]} ${r.year}${r.unit.name ? ` ${r.unit.name}` : ''}` })}
                      >
                        {/* Period block */}
                        <span className="mr-card__period">
                          <span className="mr-card__mon">{MON[r.month - 1]}</span>
                          <span className="mr-card__yr">{r.year}</span>
                        </span>

                        {/* Main info */}
                        <span className="mr-card__body">
                          <span className="mr-card__row1">
                            <span className={`mr-badge ${st.cls}`}>{t(st.label)}</span>
                            {approvable && (
                              <span className="mr-card__action-pill">{t('Needs your action')}</span>
                            )}
                          </span>
                          {!canSeeAll && r.unit.name && (
                            <span className="mr-card__unit">{r.unit.name}</span>
                          )}
                          <span className="mr-card__meta">
                            {cnt > 0
                              ? <span>{t('{{count}} indicators', { count: cnt })}</span>
                              : <span className="mr-card__no-data">{t('No data yet')}</span>
                            }
                            {r.submittedBy && (
                              <span>· {r.submittedBy.name}</span>
                            )}
                          </span>
                        </span>
                      </button>

                      {/* Quick actions */}
                      <div className="mr-card__actions">
                        {r.status === 'DRAFT' && (
                          <button type="button" className="mr-btn" title={t('Upload Excel')}
                            onClick={() => { setUploadId(r.id); setModal('upload') }}>
                            {t('↑ Upload')}
                          </button>
                        )}
                        {r.status === 'DRAFT' && cnt > 0 && (
                          <button type="button" className="mr-btn primary" disabled={busy}
                            onClick={() => void doSubmit(r.id)}>
                            {t('Submit')}
                          </button>
                        )}
                        {r.status === 'DRAFT' && (
                          <button type="button" className="mr-btn danger" title={t('Delete')}
                            onClick={() => void doDelete(r.id)}>
                            ✕
                          </button>
                        )}
                        <button
                          type="button"
                          className="mr-card__open-btn"
                          onClick={() => openReport(r.id)}>
                          {t('Open Dashboard →')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: Create ── */}
      {modal === 'create' && (
        <Modal
          title={t('New Report')}
          subtitle={t('Pick the reporting period to open as a draft, then continue filling in its indicators.')}
          onClose={() => setModal(null)}
          footer={(
            <>
              <button className="btn" onClick={() => setModal(null)} type="button">{t('Cancel')}</button>
              <button className="btn btn--primary" disabled={busy} onClick={doCreate} type="button">
                {busy ? t('Creating…') : t('Create Draft')}
              </button>
            </>
          )}
        >
          <section className="modal-section">
            <div className="modal-section__intro">
              <h4>{t('Reporting period')}</h4>
              <p>{t('Set the month and year so the new draft is tied directly to the correct reporting cycle.')}</p>
            </div>
            <div className="form-group">
              <label className="form-label">{t('Month')}</label>
              <select className="form-select" value={createForm.month}
                onChange={e => setCreateForm(f => ({ ...f, month: Number(e.target.value) }))}>
                {MON.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group mr-form-group--spaced">
              <label className="form-label">{t('Year')}</label>
              <select className="form-select" value={createForm.year}
                onChange={e => setCreateForm(f => ({ ...f, year: Number(e.target.value) }))}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </section>
        </Modal>
      )}

      {/* ── Modal: Upload ── */}
      {modal === 'upload' && uploadId !== null && (
        <Modal
          title={t('Upload Excel Data')}
          subtitle={t('Import indicator data from the Excel template so the draft can be processed at once.')}
          onClose={() => setModal(null)}
        >
          <section className="modal-section modal-section--soft">
            <div className="modal-section__intro">
              <h4>{t('File template')}</h4>
              <p>{t('Keep the column order matching the template so the import runs smoothly.')}</p>
            </div>
            <div className="mr-template-box">
              <div className="mr-template-box__title">{t('Excel Template Format — 7 Columns')}</div>
              <div className="mr-template-box__cols">
                {['A: Section','B: Category','C: Label','D: Unit','E: RKAP','F: Actual','G: Prior Year'].map(c => (
                  <span className="mr-template-box__col" key={c}>{t(c)}</span>
                ))}
              </div>
              <div className="mr-template-box__note">
                {t('Section: OPERASIONAL or KEUANGAN. Row 1 is the header and will be skipped.')}
              </div>
            </div>
          </section>
          <section className="modal-section">
            <button
              type="button"
              className="mr-drop"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void doUpload(uploadId, f) }}>
              <span className="mr-drop__icon">{uploading ? '⏳' : '📂'}</span>
              <span className="mr-drop__text">
                {uploading ? t('Uploading and processing…') : t('Click or drag an Excel file here')}
              </span>
              <span className="mr-drop__sub">{t('.xlsx or .xls · Max 10 MB')}</span>
            </button>
          </section>
          <input ref={fileRef} className="mr-file-input-hidden" type="file" accept=".xlsx,.xls"
            onChange={e => { const f = e.target.files?.[0]; if (f) void doUpload(uploadId, f) }} />
        </Modal>
      )}
    </div>
  )
}

export default MonthlyReportsView
