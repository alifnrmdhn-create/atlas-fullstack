import { useState, useEffect, useId } from 'react'
import type { FormEvent } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import './AdminViews.css'
import { api } from '../lib/api'

type DirectorateRecord = {
  id: number
  code: string
  name: string
  shortName?: string | null
  domain?: string | null
  isActive?: boolean
  unitCount?: number
}

type UnitRecord = {
  id: number
  code: string
  name: string
  description?: string | null
  unitType: string
  directorateId?: number | null
  isActive?: boolean
  directorate?: { id: number; code: string; name: string } | null
}

type DirectoratesResponse = { data: DirectorateRecord[] }
type UnitsResponse = { data: UnitRecord[] }

const emptyDirForm = () => ({ code: '', name: '', shortName: '', domain: '', isActive: true })
const emptyUnitForm = () => ({ code: '', name: '', description: '', unitType: 'DIVISION', directorateId: '', isActive: true })

export function AdminOrgsView() {
  const { currentUser } = useWorkspace()

  const [directorates, setDirectorates] = useState<DirectorateRecord[]>([])
  const [units, setUnits] = useState<UnitRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [directoratesError, setDirectoratesError] = useState(false)
  const [unitsError, setUnitsError] = useState(false)

  // Directorate modal
  const [dirModal, setDirModal] = useState<'create' | 'edit' | null>(null)
  const directorateDialogRef = useDialogFocus<HTMLDivElement>(dirModal !== null)
  const directorateTitleId = useId()
  const directorateDescId = useId()
  const [editingDir, setEditingDir] = useState<DirectorateRecord | null>(null)
  const [dirForm, setDirForm] = useState(emptyDirForm())
  const [dirSaving, setDirSaving] = useState(false)
  const [dirError, setDirError] = useState<string | null>(null)
  useEscKey(() => {
    if (dirSaving) return
    const baseline = editingDir
      ? { code: editingDir.code, name: editingDir.name, shortName: editingDir.shortName ?? '',
          domain: editingDir.domain ?? '', isActive: editingDir.isActive ?? true }
      : emptyDirForm()
    const dirty = (Object.keys(baseline) as Array<keyof typeof baseline>).some(k => dirForm[k] !== baseline[k])
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    setDirModal(null); setEditingDir(null); setDirError(null)
  }, dirModal !== null)
  const [deleteDirId, setDeleteDirId] = useState<number | null>(null)
  const deleteDirectorateDialogRef = useDialogFocus<HTMLDivElement>(deleteDirId !== null)
  const deleteDirectorateTitleId = useId()
  const deleteDirectorateDescId = useId()
  const [deleteDirSaving, setDeleteDirSaving] = useState(false)
  useEscKey(() => { if (!deleteDirSaving) setDeleteDirId(null) }, deleteDirId !== null)

  // Unit modal
  const [unitModal, setUnitModal] = useState<'create' | 'edit' | null>(null)
  const unitDialogRef = useDialogFocus<HTMLDivElement>(unitModal !== null)
  const unitTitleId = useId()
  const unitDescId = useId()
  const [editingUnit, setEditingUnit] = useState<UnitRecord | null>(null)
  const [unitForm, setUnitForm] = useState(emptyUnitForm())
  const [unitSaving, setUnitSaving] = useState(false)
  const [unitError, setUnitError] = useState<string | null>(null)
  useEscKey(() => {
    if (unitSaving) return
    const baseline = editingUnit
      ? { code: editingUnit.code, name: editingUnit.name, description: editingUnit.description ?? '',
          unitType: editingUnit.unitType, directorateId: String(editingUnit.directorateId ?? ''),
          isActive: editingUnit.isActive ?? true }
      : emptyUnitForm()
    const dirty = (Object.keys(baseline) as Array<keyof typeof baseline>).some(k => unitForm[k] !== baseline[k])
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    setUnitModal(null); setEditingUnit(null); setUnitError(null)
  }, unitModal !== null)
  const [deleteUnitId, setDeleteUnitId] = useState<number | null>(null)
  const deleteUnitDialogRef = useDialogFocus<HTMLDivElement>(deleteUnitId !== null)
  const deleteUnitTitleId = useId()
  const deleteUnitDescId = useId()
  const [deleteUnitSaving, setDeleteUnitSaving] = useState(false)
  useEscKey(() => { if (!deleteUnitSaving) setDeleteUnitId(null) }, deleteUnitId !== null)

  const isAuthorized = ['admin', 'superadmin', 'ADMIN', 'SUPERADMIN'].includes(currentUser?.roleType ?? '')

  function reload() {
    setLoading(true)
    const fd = api.get<DirectoratesResponse>('/organization/directorates')
      .then(res => setDirectorates(res.data))
      .catch(() => { setDirectoratesError(true); setDirectorates([]) })
    const fu = api.get<UnitsResponse>('/organization/units')
      .then(res => setUnits(res.data))
      .catch(() => { setUnitsError(true); setUnits([]) })
    Promise.allSettled([fd, fu]).finally(() => setLoading(false))
  }

  useEffect(() => { if (isAuthorized) reload() }, [isAuthorized])

  function unitsForDirectorate(directorateId: number): UnitRecord[] {
    return units.filter(u => u.directorateId === directorateId)
  }

  // ── Directorate handlers ─────────────────────────────────────────────────

  function openCreateDir() {
    setDirForm(emptyDirForm())
    setEditingDir(null)
    setDirError(null)
    setDirModal('create')
  }

  function openEditDir(dir: DirectorateRecord) {
    setDirForm({ code: dir.code, name: dir.name, shortName: dir.shortName ?? '', domain: dir.domain ?? '', isActive: dir.isActive ?? true })
    setEditingDir(dir)
    setDirError(null)
    setDirModal('edit')
  }

  async function submitDirForm(e: FormEvent) {
    e.preventDefault()
    if (!dirForm.code.trim() || !dirForm.name.trim()) { setDirError('Code and name are required.'); return }
    setDirSaving(true)
    setDirError(null)
    try {
      const payload = {
        code: dirForm.code.trim(),
        name: dirForm.name.trim(),
        shortName: dirForm.shortName.trim() || undefined,
        domain: dirForm.domain.trim() || undefined,
        isActive: dirForm.isActive,
      }
      if (dirModal === 'edit' && editingDir) {
        await api.patch(`/organization/directorates/${editingDir.id}`, payload)
      } else {
        await api.post('/organization/directorates', payload)
      }
      setDirModal(null)
      reload()
    } catch (err) {
      setDirError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setDirSaving(false)
    }
  }

  async function doDeleteDir() {
    if (!deleteDirId) return
    setDeleteDirSaving(true)
    try {
      await api.delete(`/organization/directorates/${deleteDirId}`)
      setDeleteDirId(null)
      reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete directorate.')
    } finally {
      setDeleteDirSaving(false)
    }
  }

  // ── Unit handlers ─────────────────────────────────────────────────────────

  function openCreateUnit() {
    setUnitForm(emptyUnitForm())
    setEditingUnit(null)
    setUnitError(null)
    setUnitModal('create')
  }

  function openEditUnit(unit: UnitRecord) {
    setUnitForm({
      code: unit.code,
      name: unit.name,
      description: unit.description ?? '',
      unitType: unit.unitType,
      directorateId: unit.directorateId ? String(unit.directorateId) : '',
      isActive: unit.isActive ?? true,
    })
    setEditingUnit(unit)
    setUnitError(null)
    setUnitModal('edit')
  }

  async function submitUnitForm(e: FormEvent) {
    e.preventDefault()
    if (!unitForm.code.trim() || !unitForm.name.trim()) { setUnitError('Code and name are required.'); return }
    setUnitSaving(true)
    setUnitError(null)
    try {
      const payload = {
        code: unitForm.code.trim(),
        name: unitForm.name.trim(),
        description: unitForm.description.trim() || undefined,
        unitType: unitForm.unitType,
        directorateId: unitForm.directorateId ? Number(unitForm.directorateId) : undefined,
        isActive: unitForm.isActive,
      }
      if (unitModal === 'edit' && editingUnit) {
        await api.patch(`/organization/units/${editingUnit.id}`, payload)
      } else {
        await api.post('/organization/units', payload)
      }
      setUnitModal(null)
      reload()
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setUnitSaving(false)
    }
  }

  async function doDeleteUnit() {
    if (!deleteUnitId) return
    setDeleteUnitSaving(true)
    try {
      await api.delete(`/organization/units/${deleteUnitId}`)
      setDeleteUnitId(null)
      reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete unit.')
    } finally {
      setDeleteUnitSaving(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="ds admin-v2 view-admin-orgs ds-stagger">
        <div className="panel">
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            Access denied. This page is for admins and superadmins only.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ds admin-v2 view-admin-orgs ds-stagger">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Company &amp; Organization Entities</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Manage the directorate structure and organization units.</span>
        {!loading && (
          <>
            <div className="view-toolbar__sep" />
            <div className="view-toolbar__right">
              <div className="view-toolbar__stats">
                <span>{directorates.length} <em>directorates</em></span>
                <span>{units.length} <em>units</em></span>
              </div>
            </div>
          </>
        )}
      </div>

      {!loading && (
        <div className="admin-orgs-layout">
          {/* ── Directorates column ── */}
          <div className="admin-orgs-col">
            <div className="panel__header">
              <h3 className="panel__title">Directorates</h3>
              {!directoratesError && <span className="badge badge--blue">{directorates.length}</span>}
              <div className="admin-header-actions">
                <button className="btn-create" onClick={openCreateDir} type="button">+ New</button>
              </div>
            </div>

            {directoratesError ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">Data not available yet</p>
              </div>
            ) : directorates.length === 0 ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">No directorate data.</p>
              </div>
            ) : (
              <div className="admin-card-stack">
                {directorates.map(dir => {
                  const childUnits = unitsForDirectorate(dir.id)
                  return (
                    <div className="directorate-card" key={dir.id}>
                      <div className="admin-inline-row">
                        <span className="directorate-card__code code-badge">{dir.code}</span>
                        <span className="directorate-card__name text-strong admin-card-title">{dir.name}</span>
                        <div className="admin-inline-actions">
                          <button
                            className="icon-btn admin-inline-action-btn"
                            onClick={() => openEditDir(dir)}
                            type="button"
                          >Edit</button>
                          <button
                            className="icon-btn icon-btn--danger admin-inline-action-btn"
                            onClick={() => setDeleteDirId(dir.id)}
                            type="button"
                          >Delete</button>
                        </div>
                      </div>
                      <div className="directorate-card__meta admin-card-meta">
                        {dir.domain && <span className="text-xs text-muted">{dir.domain}</span>}
                        <span className="text-xs text-muted">{childUnits.length} units</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Units column ── */}
          <div className="admin-orgs-col admin-orgs-col--wide">
            <div className="panel__header">
              <h3 className="panel__title">Organization Units</h3>
              {!unitsError && <span className="badge badge--blue">{units.length}</span>}
              <div className="admin-header-actions">
                <button className="btn-create" onClick={openCreateUnit} type="button">+ New</button>
              </div>
            </div>

            {unitsError ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">Data not available yet</p>
              </div>
            ) : units.length === 0 ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">No unit data.</p>
              </div>
            ) : (
              <div className="panel">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Unit Name</th>
                      <th>Directorate</th>
                      <th>Type</th>
                      <th className="admin-table-actions-col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(unit => (
                      <tr key={unit.id}>
                        <td data-label="Code"><span className="code-badge">{unit.code}</span></td>
                        <td data-label="Unit Name"><span className="text-strong admin-cell-title">{unit.name}</span></td>
                        <td data-label="Directorate"><span className="text-sm text-muted">{unit.directorate?.name ?? '–'}</span></td>
                        <td data-label="Type"><span className="text-sm text-muted">{unit.unitType}</span></td>
                        <td>
                          <div className="admin-row-actions">
                            <button
                              className="icon-btn admin-inline-action-btn"
                              onClick={() => openEditUnit(unit)}
                              type="button"
                            >Edit</button>
                            <button
                              className="icon-btn icon-btn--danger admin-inline-action-btn"
                              onClick={() => setDeleteUnitId(unit.id)}
                              type="button"
                            >Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="panel admin-panel-state">
          <span className="text-muted text-sm">Loading organization data…</span>
        </div>
      )}

      {/* ── Directorate modal ── */}
      {dirModal && (
        <div className="overlay-backdrop" onClick={() => setDirModal(null)}>
          <div aria-describedby={directorateDescId} aria-labelledby={directorateTitleId} aria-modal="true" className="modal-panel admin-modal-panel" ref={directorateDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Organization</span>
                <h3 className="modal-title" id={directorateTitleId}>{dirModal === 'create' ? 'Add Directorate' : 'Edit Directorate'}</h3>
                <p className="modal-subtitle" id={directorateDescId}>
                  Manage the directorate identity so units, positions, and the organization structure have a clean parent reference.
                </p>
              </div>
              <button aria-label="Close" className="modal__close" onClick={() => setDirModal(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form className="admin-modal-form" onSubmit={(e) => void submitDirForm(e)}>
              <div className="modal-body">
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Directorate Identity</h4>
                    <p>Use a stable code and name, since both serve as the primary reference across many admin screens.</p>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Code *</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, code: e.target.value }))}
                      placeholder="e.g. DIR-KMR"
                      type="text"
                      value={dirForm.code}
                    />
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Name *</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Finance Directorate"
                      type="text"
                      value={dirForm.name}
                    />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Additional Metadata</h4>
                    <p>Short name and domain help with concise labeling in organization views and analytics.</p>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Short Name</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, shortName: e.target.value }))}
                      placeholder="e.g. KMR"
                      type="text"
                      value={dirForm.shortName}
                    />
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Domain / Field</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, domain: e.target.value }))}
                      placeholder="e.g. Finance & Risk Management"
                      type="text"
                      value={dirForm.domain}
                    />
                  </div>
                  <label className="admin-checkbox-row">
                    <input
                      checked={dirForm.isActive}
                      onChange={e => setDirForm(f => ({ ...f, isActive: e.target.checked }))}
                      type="checkbox"
                    />
                    Active
                  </label>
                </section>
                {dirError && <p className="admin-message admin-message--error">{dirError}</p>}
              </div>
              <div className="modal-footer admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setDirModal(null)} type="button">Cancel</button>
                <button className="profile-save-btn" disabled={dirSaving} type="submit">
                  {dirSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Unit modal ── */}
      {unitModal && (
        <div className="overlay-backdrop" onClick={() => setUnitModal(null)}>
          <div aria-describedby={unitDescId} aria-labelledby={unitTitleId} aria-modal="true" className="modal-panel admin-modal-panel" ref={unitDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Organization</span>
                <h3 className="modal-title" id={unitTitleId}>{unitModal === 'create' ? 'Add Unit' : 'Edit Unit'}</h3>
                <p className="modal-subtitle" id={unitDescId}>
                  Set up the unit or division so the organization hierarchy stays clear, including its link to the parent directorate.
                </p>
              </div>
              <button aria-label="Close" className="modal__close" onClick={() => setUnitModal(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form className="admin-modal-form" onSubmit={(e) => void submitUnitForm(e)}>
              <div className="modal-body">
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Unit Identity</h4>
                    <p>Set the code, type, and unit name so its structure stays consistent across all organization screens.</p>
                  </div>
                  <div className="admin-form-grid admin-form-grid--2">
                    <div className="profile-form__field">
                      <label className="profile-form__label">Code *</label>
                      <input
                        className="profile-input"
                        onChange={e => setUnitForm(f => ({ ...f, code: e.target.value }))}
                        placeholder="e.g. KMR-01"
                        type="text"
                        value={unitForm.code}
                      />
                    </div>
                    <div className="profile-form__field">
                      <label className="profile-form__label">Unit Type</label>
                      <select
                        className="profile-input"
                        onChange={e => setUnitForm(f => ({ ...f, unitType: e.target.value }))}
                        value={unitForm.unitType}
                      >
                        <option value="DIVISION">DIVISION</option>
                        <option value="SUBDIVISION">SUBDIVISION</option>
                        <option value="DEPARTMENT">DEPARTMENT</option>
                        <option value="SECTION">SECTION</option>
                      </select>
                    </div>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Name *</label>
                    <input
                      className="profile-input"
                      onChange={e => setUnitForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Accounting Division"
                      type="text"
                      value={unitForm.name}
                    />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Structure Links</h4>
                    <p>Use this section to link the unit to a directorate and add a brief description if needed.</p>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Directorate</label>
                    <select
                      className="profile-input"
                      onChange={e => setUnitForm(f => ({ ...f, directorateId: e.target.value }))}
                      value={unitForm.directorateId}
                    >
                      <option value="">— None —</option>
                      {directorates.map(d => (
                        <option key={d.id} value={String(d.id)}>{d.code} — {d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Description</label>
                    <input
                      className="profile-input"
                      onChange={e => setUnitForm(f => ({ ...f, description: e.target.value }))}
                      type="text"
                      value={unitForm.description}
                    />
                  </div>
                  <label className="admin-checkbox-row">
                    <input
                      checked={unitForm.isActive}
                      onChange={e => setUnitForm(f => ({ ...f, isActive: e.target.checked }))}
                      type="checkbox"
                    />
                    Active
                  </label>
                </section>
                {unitError && <p className="admin-message admin-message--error">{unitError}</p>}
              </div>
              <div className="modal-footer admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setUnitModal(null)} type="button">Cancel</button>
                <button className="profile-save-btn" disabled={unitSaving} type="submit">
                  {unitSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete directorate confirm ── */}
      {deleteDirId !== null && (
        <div className="overlay-backdrop" onClick={() => setDeleteDirId(null)}>
          <div aria-describedby={deleteDirectorateDescId} aria-labelledby={deleteDirectorateTitleId} aria-modal="true" className="modal-panel admin-modal-panel admin-modal-panel--compact" ref={deleteDirectorateDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-headcopy">
                <h3 className="modal-title admin-modal-title--danger" id={deleteDirectorateTitleId}>Delete Directorate?</h3>
                <p className="modal-subtitle" id={deleteDirectorateDescId}>This action affects all structure references under this directorate.</p>
              </div>
              <button aria-label="Close" className="modal__close" onClick={() => setDeleteDirId(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="admin-confirm-body">
              <div className="modal-helper-note modal-helper-note--danger">
                This action cannot be undone. All linked units will lose their directorate reference.
              </div>
              <div className="admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setDeleteDirId(null)} type="button">Cancel</button>
                <button className="settings-danger-btn" disabled={deleteDirSaving} onClick={() => void doDeleteDir()} type="button">
                  {deleteDirSaving ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete unit confirm ── */}
      {deleteUnitId !== null && (
        <div className="overlay-backdrop" onClick={() => setDeleteUnitId(null)}>
          <div aria-describedby={deleteUnitDescId} aria-labelledby={deleteUnitTitleId} aria-modal="true" className="modal-panel admin-modal-panel admin-modal-panel--compact" ref={deleteUnitDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-headcopy">
                <h3 className="modal-title admin-modal-title--danger" id={deleteUnitTitleId}>Delete Unit?</h3>
                <p className="modal-subtitle" id={deleteUnitDescId}>Deleting this unit affects positions, users, and downstream structure references.</p>
              </div>
              <button aria-label="Close" className="modal__close" onClick={() => setDeleteUnitId(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="admin-confirm-body">
              <div className="modal-helper-note modal-helper-note--danger">
                This action cannot be undone. All positions and users linked to this unit will lose their unit reference.
              </div>
              <div className="admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setDeleteUnitId(null)} type="button">Cancel</button>
                <button className="settings-danger-btn" disabled={deleteUnitSaving} onClick={() => void doDeleteUnit()} type="button">
                  {deleteUnitSaving ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminOrgsView
