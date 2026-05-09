import { useState, useEffect, useId } from 'react'
import type { FormEvent } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useDialogFocus } from '../hooks/useDialogFocus'
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
  const [deleteDirId, setDeleteDirId] = useState<number | null>(null)
  const deleteDirectorateDialogRef = useDialogFocus<HTMLDivElement>(deleteDirId !== null)
  const deleteDirectorateTitleId = useId()
  const deleteDirectorateDescId = useId()
  const [deleteDirSaving, setDeleteDirSaving] = useState(false)

  // Unit modal
  const [unitModal, setUnitModal] = useState<'create' | 'edit' | null>(null)
  const unitDialogRef = useDialogFocus<HTMLDivElement>(unitModal !== null)
  const unitTitleId = useId()
  const unitDescId = useId()
  const [editingUnit, setEditingUnit] = useState<UnitRecord | null>(null)
  const [unitForm, setUnitForm] = useState(emptyUnitForm())
  const [unitSaving, setUnitSaving] = useState(false)
  const [unitError, setUnitError] = useState<string | null>(null)
  const [deleteUnitId, setDeleteUnitId] = useState<number | null>(null)
  const deleteUnitDialogRef = useDialogFocus<HTMLDivElement>(deleteUnitId !== null)
  const deleteUnitTitleId = useId()
  const deleteUnitDescId = useId()
  const [deleteUnitSaving, setDeleteUnitSaving] = useState(false)

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
    if (!dirForm.code.trim() || !dirForm.name.trim()) { setDirError('Kode dan nama wajib diisi.'); return }
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
      setDirError(err instanceof Error ? err.message : 'Gagal menyimpan.')
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
      alert(err instanceof Error ? err.message : 'Gagal menghapus direktorat.')
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
    if (!unitForm.code.trim() || !unitForm.name.trim()) { setUnitError('Kode dan nama wajib diisi.'); return }
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
      setUnitError(err instanceof Error ? err.message : 'Gagal menyimpan.')
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
      alert(err instanceof Error ? err.message : 'Gagal menghapus unit.')
    } finally {
      setDeleteUnitSaving(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="ds admin-v2 view-admin-orgs">
        <div className="panel">
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            Akses ditolak. Halaman ini hanya untuk admin dan superadmin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ds admin-v2 view-admin-orgs">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Perusahaan &amp; Entitas Organisasi</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Kelola struktur direktif dan unit organisasi.</span>
        {!loading && (
          <>
            <div className="view-toolbar__sep" />
            <div className="view-toolbar__right">
              <div className="view-toolbar__stats">
                <span>{directorates.length} <em>direktorat</em></span>
                <span>{units.length} <em>unit</em></span>
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
              <h3 className="panel__title">Direktorat</h3>
              {!directoratesError && <span className="badge badge--blue">{directorates.length}</span>}
              <div className="admin-header-actions">
                <button className="btn-create" onClick={openCreateDir} type="button">+ Baru</button>
              </div>
            </div>

            {directoratesError ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">Data belum tersedia</p>
              </div>
            ) : directorates.length === 0 ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">Tidak ada data direktorat.</p>
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
                          >Hapus</button>
                        </div>
                      </div>
                      <div className="directorate-card__meta admin-card-meta">
                        {dir.domain && <span className="text-xs text-muted">{dir.domain}</span>}
                        <span className="text-xs text-muted">{childUnits.length} unit</span>
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
              <h3 className="panel__title">Unit Organisasi</h3>
              {!unitsError && <span className="badge badge--blue">{units.length}</span>}
              <div className="admin-header-actions">
                <button className="btn-create" onClick={openCreateUnit} type="button">+ Baru</button>
              </div>
            </div>

            {unitsError ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">Data belum tersedia</p>
              </div>
            ) : units.length === 0 ? (
              <div className="panel">
                <p className="text-muted text-sm admin-state-copy admin-state-copy--center">Tidak ada data unit.</p>
              </div>
            ) : (
              <div className="panel">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama Unit</th>
                      <th>Direktorat</th>
                      <th>Tipe</th>
                      <th className="admin-table-actions-col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(unit => (
                      <tr key={unit.id}>
                        <td><span className="code-badge">{unit.code}</span></td>
                        <td><span className="text-strong admin-cell-title">{unit.name}</span></td>
                        <td><span className="text-sm text-muted">{unit.directorate?.name ?? '–'}</span></td>
                        <td><span className="text-sm text-muted">{unit.unitType}</span></td>
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
                            >Hapus</button>
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
          <span className="text-muted text-sm">Memuat data organisasi…</span>
        </div>
      )}

      {/* ── Directorate modal ── */}
      {dirModal && (
        <div className="overlay-backdrop" onClick={() => setDirModal(null)}>
          <div aria-describedby={directorateDescId} aria-labelledby={directorateTitleId} aria-modal="true" className="modal-panel admin-modal-panel" ref={directorateDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Organization</span>
                <h3 className="modal-title" id={directorateTitleId}>{dirModal === 'create' ? 'Tambah Direktorat' : 'Edit Direktorat'}</h3>
                <p className="modal-subtitle" id={directorateDescId}>
                  Kelola identitas direktorat agar unit, jabatan, dan struktur organisasi punya referensi induk yang rapi.
                </p>
              </div>
              <button aria-label="Tutup" className="modal__close" onClick={() => setDirModal(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form className="admin-modal-form" onSubmit={(e) => void submitDirForm(e)}>
              <div className="modal-body">
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Identitas Direktorat</h4>
                    <p>Gunakan kode dan nama yang stabil karena keduanya akan menjadi referensi utama di banyak layar admin.</p>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Kode *</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, code: e.target.value }))}
                      placeholder="cth. DIR-KMR"
                      type="text"
                      value={dirForm.code}
                    />
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Nama *</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="cth. Direktorat Keuangan"
                      type="text"
                      value={dirForm.name}
                    />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Metadata Tambahan</h4>
                    <p>Nama singkat dan domain akan membantu pelabelan singkat di tampilan organisasi dan analitik.</p>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Nama Singkat</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, shortName: e.target.value }))}
                      placeholder="cth. KMR"
                      type="text"
                      value={dirForm.shortName}
                    />
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Domain / Bidang</label>
                    <input
                      className="profile-input"
                      onChange={e => setDirForm(f => ({ ...f, domain: e.target.value }))}
                      placeholder="cth. Keuangan & Manajemen Risiko"
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
                    Aktif
                  </label>
                </section>
                {dirError && <p className="admin-message admin-message--error">{dirError}</p>}
              </div>
              <div className="modal-footer admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setDirModal(null)} type="button">Batal</button>
                <button className="profile-save-btn" disabled={dirSaving} type="submit">
                  {dirSaving ? 'Menyimpan…' : 'Simpan'}
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
                <h3 className="modal-title" id={unitTitleId}>{unitModal === 'create' ? 'Tambah Unit' : 'Edit Unit'}</h3>
                <p className="modal-subtitle" id={unitDescId}>
                  Atur unit atau divisi agar hierarki organisasi tetap terbaca, termasuk kaitannya ke direktorat induk.
                </p>
              </div>
              <button aria-label="Tutup" className="modal__close" onClick={() => setUnitModal(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form className="admin-modal-form" onSubmit={(e) => void submitUnitForm(e)}>
              <div className="modal-body">
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Identitas Unit</h4>
                    <p>Tentukan kode, tipe, dan nama unit agar strukturnya konsisten di seluruh layar organisasi.</p>
                  </div>
                  <div className="admin-form-grid admin-form-grid--2">
                    <div className="profile-form__field">
                      <label className="profile-form__label">Kode *</label>
                      <input
                        className="profile-input"
                        onChange={e => setUnitForm(f => ({ ...f, code: e.target.value }))}
                        placeholder="cth. KMR-01"
                        type="text"
                        value={unitForm.code}
                      />
                    </div>
                    <div className="profile-form__field">
                      <label className="profile-form__label">Tipe Unit</label>
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
                    <label className="profile-form__label">Nama *</label>
                    <input
                      className="profile-input"
                      onChange={e => setUnitForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="cth. Divisi Akuntansi"
                      type="text"
                      value={unitForm.name}
                    />
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Keterkaitan Struktur</h4>
                    <p>Gunakan bagian ini untuk menghubungkan unit ke direktorat dan menambahkan deskripsi singkat bila perlu.</p>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Direktorat</label>
                    <select
                      className="profile-input"
                      onChange={e => setUnitForm(f => ({ ...f, directorateId: e.target.value }))}
                      value={unitForm.directorateId}
                    >
                      <option value="">— Tidak ada —</option>
                      {directorates.map(d => (
                        <option key={d.id} value={String(d.id)}>{d.code} — {d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="profile-form__field">
                    <label className="profile-form__label">Deskripsi</label>
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
                    Aktif
                  </label>
                </section>
                {unitError && <p className="admin-message admin-message--error">{unitError}</p>}
              </div>
              <div className="modal-footer admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setUnitModal(null)} type="button">Batal</button>
                <button className="profile-save-btn" disabled={unitSaving} type="submit">
                  {unitSaving ? 'Menyimpan…' : 'Simpan'}
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
                <h3 className="modal-title admin-modal-title--danger" id={deleteDirectorateTitleId}>Hapus Direktorat?</h3>
                <p className="modal-subtitle" id={deleteDirectorateDescId}>Aksi ini akan memengaruhi seluruh referensi struktur yang berada di bawah direktorat tersebut.</p>
              </div>
              <button aria-label="Tutup" className="modal__close" onClick={() => setDeleteDirId(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="admin-confirm-body">
              <div className="modal-helper-note modal-helper-note--danger">
                Tindakan ini tidak dapat diurungkan. Semua unit yang terhubung akan kehilangan referensi direktorat.
              </div>
              <div className="admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setDeleteDirId(null)} type="button">Batal</button>
                <button className="settings-danger-btn" disabled={deleteDirSaving} onClick={() => void doDeleteDir()} type="button">
                  {deleteDirSaving ? 'Menghapus…' : 'Hapus'}
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
                <h3 className="modal-title admin-modal-title--danger" id={deleteUnitTitleId}>Hapus Unit?</h3>
                <p className="modal-subtitle" id={deleteUnitDescId}>Penghapusan unit akan berdampak pada jabatan, user, dan referensi struktur turunannya.</p>
              </div>
              <button aria-label="Tutup" className="modal__close" onClick={() => setDeleteUnitId(null)} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <div className="admin-confirm-body">
              <div className="modal-helper-note modal-helper-note--danger">
                Tindakan ini tidak dapat diurungkan. Semua jabatan dan pengguna yang terhubung ke unit ini akan kehilangan referensi unit.
              </div>
              <div className="admin-modal-actions">
                <button className="btn btn--ghost" onClick={() => setDeleteUnitId(null)} type="button">Batal</button>
                <button className="settings-danger-btn" disabled={deleteUnitSaving} onClick={() => void doDeleteUnit()} type="button">
                  {deleteUnitSaving ? 'Menghapus…' : 'Hapus'}
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
