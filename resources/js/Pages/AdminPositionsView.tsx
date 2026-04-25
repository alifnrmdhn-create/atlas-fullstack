import { useState, useEffect, useCallback, useId } from 'react'
import { useWorkspace } from '../context/workspace'
import { api } from '../lib/api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'

type PositionDirectorate = { id: number; code: string; name: string }
type PositionUnit = { id: number; code: string; name: string }
type PositionHolder = { id: number; name: string; roleType: string }

type PositionRecord = {
  id: number
  title: string
  code?: string
  levelCode?: string
  level?: number
  isActive: boolean
  reportsToPositionId?: number
  directorate?: PositionDirectorate
  unit?: PositionUnit
  currentHolder?: PositionHolder
}

type UserOption = {
  id: number
  name: string
  nik?: string
  email: string
  roleType: string
  positionTitle?: string
}

type DirectorateOption = { id: number; code: string; name: string }
type UnitOption = { id: number; code: string; name: string; directorateId: number }

type PositionsResponse = { data: PositionRecord[]; total: number }
type UsersResponse = { data: UserOption[]; total: number }
type DirectoratesResponse = { data: DirectorateOption[] }
type UnitsResponse = { data: UnitOption[]; total: number }

const LEVEL_LABEL: Record<number, string> = { 1: 'BOD-1', 2: 'BOD-2', 3: 'BOD-3' }
const LEVEL_BADGE: Record<number, string> = { 1: 'badge--red', 2: 'badge--yellow', 3: 'badge--green' }

export function AdminPositionsView() {
  const { currentUser } = useWorkspace()

  const [positions, setPositions] = useState<PositionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Org data for form selects
  const [directorates, setDirectorates] = useState<DirectorateOption[]>([])
  const [units, setUnits] = useState<UnitOption[]>([])
  useEffect(() => {
    Promise.all([
      api.get<DirectoratesResponse>('/organization/directorates'),
      api.get<UnitsResponse>('/organization/units'),
    ]).then(([dr, ur]) => {
      setDirectorates(dr.data ?? [])
      setUnits(ur.data ?? [])
    }).catch(() => {})
  }, [])

  const emptyPosForm = { code: '', name: '', levelCode: 'BOD-4', roleType: 'ASISTEN', directorateId: '', divisionId: '', isActive: true }

  // Create position modal
  const [showCreatePos, setShowCreatePos] = useState(false)
  const [cpPosForm, setCpPosForm] = useState(emptyPosForm)
  const [cpPosSaving, setCpPosSaving] = useState(false)
  const [cpPosError, setCpPosError] = useState<string | null>(null)

  const openCreatePos = () => { setCpPosForm(emptyPosForm); setCpPosError(null); setShowCreatePos(true) }
  const closeCreatePos = () => { setShowCreatePos(false); setCpPosError(null) }
  useEscKey(closeCreatePos, showCreatePos)

  const handleCreatePos = async (e: React.FormEvent) => {
    e.preventDefault()
    setCpPosSaving(true)
    setCpPosError(null)
    try {
      await api.post('/organization/positions', {
        code: cpPosForm.code.trim(),
        name: cpPosForm.name.trim(),
        levelCode: cpPosForm.levelCode,
        roleType: cpPosForm.roleType,
        directorateId: cpPosForm.directorateId ? Number(cpPosForm.directorateId) : undefined,
        divisionId: cpPosForm.divisionId ? Number(cpPosForm.divisionId) : undefined,
        isActive: cpPosForm.isActive,
      })
      closeCreatePos()
      loadPositions()
    } catch (err) {
      setCpPosError(err instanceof Error ? err.message : 'Gagal membuat jabatan.')
    } finally {
      setCpPosSaving(false)
    }
  }

  // Edit position modal
  const [editingPos, setEditingPos] = useState<PositionRecord | null>(null)
  const positionFormDialogRef = useDialogFocus<HTMLDivElement>(showCreatePos || editingPos !== null)
  const positionFormTitleId = useId()
  const positionFormDescId = useId()
  const [epPosForm, setEpPosForm] = useState(emptyPosForm)
  const [epPosSaving, setEpPosSaving] = useState(false)
  const [epPosError, setEpPosError] = useState<string | null>(null)

  const openEditPos = (pos: PositionRecord) => {
    setEditingPos(pos)
    setEpPosForm({
      code: pos.code ?? '',
      name: pos.title,
      levelCode: pos.levelCode ?? 'BOD-4',
      roleType: pos.currentHolder?.roleType ?? 'ASISTEN',
      directorateId: String(pos.directorate?.id ?? ''),
      divisionId: String(pos.unit?.id ?? ''),
      isActive: pos.isActive,
    })
    setEpPosError(null)
  }
  const closeEditPos = () => { setEditingPos(null); setEpPosError(null) }
  useEscKey(closeEditPos, editingPos !== null)

  const handleEditPos = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPos) return
    setEpPosSaving(true)
    setEpPosError(null)
    try {
      await api.patch(`/organization/positions/${editingPos.id}`, {
        code: epPosForm.code.trim(),
        name: epPosForm.name.trim(),
        levelCode: epPosForm.levelCode,
        roleType: epPosForm.roleType,
        directorateId: epPosForm.directorateId ? Number(epPosForm.directorateId) : null,
        divisionId: epPosForm.divisionId ? Number(epPosForm.divisionId) : null,
        isActive: epPosForm.isActive,
      })
      closeEditPos()
      loadPositions()
    } catch (err) {
      setEpPosError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setEpPosSaving(false)
    }
  }

  // Delete position
  const [confirmDeletePosId, setConfirmDeletePosId] = useState<number | null>(null)
  const [deletePosSaving, setDeletePosSaving] = useState(false)

  const handleDeletePos = async (id: number) => {
    setDeletePosSaving(true)
    try {
      await api.delete(`/organization/positions/${id}`)
      setConfirmDeletePosId(null)
      loadPositions()
    } catch { /* ignore */ } finally {
      setDeletePosSaving(false)
    }
  }

  // Assign modal state
  const [assignTarget, setAssignTarget] = useState<PositionRecord | null>(null)
  const assignDialogRef = useDialogFocus<HTMLDivElement>(assignTarget !== null)
  const assignDialogTitleId = useId()
  const assignDialogDescId = useId()
  const [userSearch, setUserSearch] = useState('')
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null)
  const [mutationReason, setMutationReason] = useState('')
  const [skNumber, setSkNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isAuthorized =
    ['admin', 'superadmin', 'ADMIN', 'SUPERADMIN'].includes(currentUser?.roleType ?? '')

  const loadPositions = useCallback(() => {
    setLoading(true)
    setError(null)
    api.get<PositionsResponse>('/organization/positions')
      .then(res => {
        const sorted = [...res.data].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.title.localeCompare(b.title))
        setPositions(sorted)
        setTotal(res.total)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Gagal memuat data jabatan.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isAuthorized) loadPositions()
  }, [isAuthorized, loadPositions])

  // Load users for assign modal (debounced by search)
  useEffect(() => {
    if (!assignTarget) return
    const params = new URLSearchParams()
    if (userSearch.trim()) params.set('search', userSearch.trim())
    api.get<UsersResponse>(`/users?${params}`)
      .then(res => setUserOptions(res.data.slice(0, 50)))
      .catch(() => setUserOptions([]))
  }, [userSearch, assignTarget])

  const openAssign = (pos: PositionRecord) => {
    setAssignTarget(pos)
    setSelectedUser(pos.currentHolder ? { id: pos.currentHolder.id, name: pos.currentHolder.name, roleType: pos.currentHolder.roleType, email: '' } : null)
    setUserSearch('')
    setMutationReason('')
    setSkNumber('')
    setSaveError(null)
  }

  const closeAssign = () => {
    setAssignTarget(null)
    setSelectedUser(null)
    setSaveError(null)
  }
  useEscKey(closeAssign, assignTarget !== null)

  const handleAssign = async () => {
    if (!assignTarget) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.patch(`/organization/positions/${assignTarget.id}/assign`, {
        userId: selectedUser?.id ?? null,
        mutationType: 'assignment',
        mutationReason: mutationReason || undefined,
        skNumber: skNumber || undefined,
      })
      loadPositions()
      closeAssign()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  const activeCount = positions.filter(p => p.isActive).length
  const vacantCount = positions.filter(p => !p.currentHolder).length
  const levelsWithValue = positions.filter(p => p.level !== undefined && p.level !== null)
  const avgLevel = levelsWithValue.length > 0
    ? (levelsWithValue.reduce((s, p) => s + (p.level ?? 0), 0) / levelsWithValue.length).toFixed(1)
    : '–'

  if (!isAuthorized) {
    return (
      <div className="view-admin-positions">
        <div className="panel">
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            Akses ditolak. Halaman ini hanya untuk admin dan superadmin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-admin-positions">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Manajemen Jabatan</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Kelola struktur jabatan dan posisi dalam organisasi.</span>
        <div className="view-toolbar__right">
          {!loading && (
            <div className="view-toolbar__stats">
              <span>{total} <em>jabatan</em></span>
            </div>
          )}
          <button className="toolbar-action-btn" onClick={openCreatePos}>+ Buat Jabatan</button>
        </div>
      </div>

      {!loading && !error && (
        <div className="admin-positions-stats">
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val">{total}</span>
            <span className="text-muted text-xs">Total Jabatan</span>
          </div>
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val admin-positions-stat-card__val--success">{activeCount}</span>
            <span className="text-muted text-xs">Aktif</span>
          </div>
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val admin-positions-stat-card__val--warning">{vacantCount}</span>
            <span className="text-muted text-xs">Kosong</span>
          </div>
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val">{avgLevel}</span>
            <span className="text-muted text-xs">Rata-rata Level</span>
          </div>
        </div>
      )}

      <div className="panel">
        {error && (
          <p className="text-sm admin-message admin-message--error">{error}</p>
        )}
        {!error && !loading && positions.length === 0 && (
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">Tidak ada data jabatan.</p>
        )}
        {!error && (loading || positions.length > 0) && (
          <table className="reports-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Jabatan</th>
                <th>Level</th>
                <th>Unit</th>
                <th>Direktorat</th>
                <th>Pemegang</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="admin-table-placeholder">
                    <span className="text-muted text-sm">Memuat data…</span>
                  </td>
                </tr>
              ) : positions.map(pos => (
                <tr key={pos.id}>
                  <td>
                    {pos.code
                      ? <span className="code-badge">{pos.code}</span>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td>
                    <span className="text-strong admin-cell-title">{pos.title}</span>
                  </td>
                  <td>
                    {pos.level !== undefined && pos.level !== null
                      ? <span className={`badge ${LEVEL_BADGE[pos.level] ?? ''}`}>{LEVEL_LABEL[pos.level] ?? pos.level}</span>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td>
                    {pos.unit
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{pos.unit.code}</span>
                          <span className="text-xs text-muted">{pos.unit.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td>
                    {pos.directorate
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{pos.directorate.code}</span>
                          <span className="text-xs text-muted">{pos.directorate.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td>
                    {pos.currentHolder
                      ? <div className="admin-cell-stack">
                          <span className="text-sm admin-cell-name">{pos.currentHolder.name}</span>
                          <span className="text-xs text-muted">{pos.currentHolder.roleType}</span>
                        </div>
                      : <span className="badge badge--yellow">Kosong</span>}
                  </td>
                  <td>
                    <span className={`badge ${pos.isActive ? 'badge--green' : 'badge--red'}`}>
                      {pos.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button className="btn btn--sm btn--ghost" onClick={() => openAssign(pos)}>
                        {pos.currentHolder ? 'Ganti' : 'Assign'}
                      </button>
                      <button className="btn btn--sm btn--ghost" onClick={() => openEditPos(pos)}>Edit</button>
                      <button
                        className="btn btn--sm btn--ghost admin-row-status-btn admin-row-status-btn--danger"
                        onClick={() => setConfirmDeletePosId(confirmDeletePosId === pos.id ? null : pos.id)}
                      >
                        Hapus
                      </button>
                    </div>
                    {confirmDeletePosId === pos.id && (
                      <div className="admin-inline-confirm">
                        <span className="admin-inline-confirm__label">Yakin hapus?</span>
                        <button
                          className="btn btn--sm btn--danger admin-inline-confirm__btn"
                          disabled={deletePosSaving}
                          onClick={() => void handleDeletePos(pos.id)}
                        >
                          {deletePosSaving ? '…' : 'Ya'}
                        </button>
                        <button
                          className="btn btn--sm btn--ghost admin-inline-confirm__btn"
                          disabled={deletePosSaving}
                          onClick={() => setConfirmDeletePosId(null)}
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Position Modal (shared form) */}
      {(showCreatePos || editingPos) && (() => {
        const isEdit = !!editingPos
        const form = isEdit ? epPosForm : cpPosForm
        const setForm = isEdit ? setEpPosForm : setCpPosForm
        const onSubmit = isEdit ? handleEditPos : handleCreatePos
        const saving = isEdit ? epPosSaving : cpPosSaving
        const formError = isEdit ? epPosError : cpPosError
        const closeModal = isEdit ? closeEditPos : closeCreatePos
        const filteredUnits = form.directorateId
          ? units.filter(u => u.directorateId === Number(form.directorateId))
          : units
        return (
          <div className="modal-backdrop" onClick={closeModal}>
            <div aria-describedby={positionFormDescId} aria-labelledby={positionFormTitleId} aria-modal="true" className="modal modal--wide" ref={positionFormDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <div className="modal-headcopy">
                  <span className="modal-kicker">Position Setup</span>
                  <h3 className="modal__title" id={positionFormTitleId}>{isEdit ? 'Edit Jabatan' : 'Buat Jabatan Baru'}</h3>
                  <p className="modal-subtitle" id={positionFormDescId}>
                    Definisikan identitas jabatan, pemetaan struktur organisasi, dan status aktifnya dalam satu form yang lebih terarah.
                  </p>
                </div>
                <button className="modal__close" onClick={closeModal} type="button">
                  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
                </button>
              </div>
              <form onSubmit={onSubmit}>
                <div className="modal__body">
                  {formError && (
                    <div className="inline-notice inline-notice--error admin-inline-error">{formError}</div>
                  )}
                  <section className="modal-section">
                    <div className="modal-section__intro">
                      <h4>Identitas Jabatan</h4>
                      <p>Tentukan kode, nama, level, dan role dasar yang akan dipakai lintas struktur organisasi dan assignment user.</p>
                    </div>
                    <div className="admin-form-grid admin-form-grid--name">
                      <div className="modal-field">
                        <label className="modal-label">Kode <span className="admin-required">*</span></label>
                        <input className="form-input" required minLength={2} maxLength={40} type="text" placeholder="e.g. DIR-001" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                      </div>
                      <div className="modal-field">
                        <label className="modal-label">Nama Jabatan <span className="admin-required">*</span></label>
                        <input className="form-input" required minLength={2} maxLength={120} type="text" placeholder="Nama jabatan" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                    </div>
                    <div className="admin-form-grid admin-form-grid--2">
                      <div className="modal-field">
                        <label className="modal-label">Level Code <span className="admin-required">*</span></label>
                        <select className="form-input" value={form.levelCode} onChange={e => setForm(f => ({ ...f, levelCode: e.target.value }))}>
                          {['BOD-1','BOD-2','BOD-3','BOD-4','M1','M2','M3','S1','S2'].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="modal-field">
                        <label className="modal-label">Role Type <span className="admin-required">*</span></label>
                        <select className="form-input" value={form.roleType} onChange={e => setForm(f => ({ ...f, roleType: e.target.value }))}>
                          {['BOD','KADIV','KASUBDIV','ASISTEN','OFFICER','ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                  </section>
                  <section className="modal-section modal-section--soft">
                    <div className="modal-section__intro">
                      <h4>Struktur Organisasi</h4>
                      <p>Hubungkan jabatan ke direktorat dan unit yang relevan agar filter struktur serta mutasi bekerja lebih presisi.</p>
                    </div>
                    <div className="admin-form-grid admin-form-grid--2">
                      <div className="modal-field">
                        <label className="modal-label">Direktorat</label>
                        <select className="form-input" value={form.directorateId} onChange={e => setForm(f => ({ ...f, directorateId: e.target.value, divisionId: '' }))}>
                          <option value="">— Tidak Ditentukan —</option>
                          {directorates.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                        </select>
                      </div>
                      <div className="modal-field">
                        <label className="modal-label">Unit / Divisi</label>
                        <select className="form-input" value={form.divisionId} onChange={e => setForm(f => ({ ...f, divisionId: e.target.value }))}>
                          <option value="">— Tidak Ditentukan —</option>
                          {filteredUnits.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <label className="admin-checkbox-row">
                      <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                      Jabatan Aktif
                    </label>
                  </section>
                </div>
                <div className="modal__footer">
                  <button className="btn btn--ghost" type="button" onClick={closeModal} disabled={saving}>Batal</button>
                  <button className="profile-save-btn" type="submit" disabled={saving || !form.code.trim() || !form.name.trim()}>
                    {saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Buat Jabatan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}

      {/* Assign Modal */}
      {assignTarget && (
        <div className="modal-backdrop" onClick={closeAssign}>
          <div aria-describedby={assignDialogDescId} aria-labelledby={assignDialogTitleId} aria-modal="true" className="modal" ref={assignDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Role Assignment</span>
                <h3 className="modal__title" id={assignDialogTitleId}>Assign Pemegang Jabatan</h3>
                <p className="modal-subtitle" id={assignDialogDescId}>
                  Pilih pengguna yang paling tepat untuk menduduki jabatan ini atau kosongkan posisinya bila sedang transisi.
                </p>
              </div>
              <button className="modal__close" onClick={closeAssign} type="button"><svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg></button>
            </div>

            <div className="modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Konteks Jabatan</h4>
                  <p>Tinjau dulu posisi yang akan diisi, unitnya, dan siapa pemegang saat ini sebelum mengganti assignment.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Jabatan</label>
                  <div className="admin-cell-inline admin-cell-inline--gap-md">
                    {assignTarget.code && <span className="code-badge">{assignTarget.code}</span>}
                    <span className="text-sm text-strong">{assignTarget.title}</span>
                  </div>
                  {assignTarget.unit && (
                    <span className="text-xs text-muted admin-field-help admin-field-help--tight">
                      {assignTarget.unit.code} · {assignTarget.unit.name}
                    </span>
                  )}
                </div>
                <div className="modal-field">
                  <label className="modal-label">Pemegang Saat Ini</label>
                  {assignTarget.currentHolder
                    ? <span className="text-sm">{assignTarget.currentHolder.name}</span>
                    : <span className="badge badge--yellow admin-badge--fit">Kosong</span>}
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Pilih Pemegang Baru</h4>
                  <p>Cari nama, NIK, atau email. Anda juga bisa membiarkan jabatan kosong untuk sementara selama masa transisi.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Cari & Pilih Pengguna Baru</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Cari nama, NIK, atau email…"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                  {userOptions.length > 0 && (
                    <div className="user-picker-list">
                      {userOptions.map(u => (
                        <button
                          key={u.id}
                          className={`user-picker-item${selectedUser?.id === u.id ? ' user-picker-item--selected' : ''}`}
                          onClick={() => setSelectedUser(u)}
                          type="button"
                        >
                          <span className="text-sm text-strong">{u.name}</span>
                          <span className="text-xs text-muted">{u.positionTitle ?? u.roleType}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedUser && (
                    <div className="selected-user-chip">
                      <span>✓ {selectedUser.name}</span>
                      <button type="button" onClick={() => setSelectedUser(null)}><svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg></button>
                    </div>
                  )}
                </div>
                {assignTarget.currentHolder && !selectedUser && (
                  <div className="modal-helper-note">
                    Kosongkan pilihan untuk mencabut pemegang jabatan saat ini tanpa langsung menetapkan pengganti.
                  </div>
                )}
              </section>
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Catatan Administratif</h4>
                  <p>Simpan referensi SK atau alasan singkat supaya histori assignment mudah ditelusuri kembali.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Nomor SK <span className="text-muted">(opsional)</span></label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="misal: SK-001/2026"
                    value={skNumber}
                    onChange={e => setSkNumber(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Alasan / Keterangan <span className="text-muted">(opsional)</span></label>
                  <textarea
                    className="form-input admin-textarea-vertical"
                    rows={2}
                    placeholder="misal: Mutasi reguler, promosi, dll."
                    value={mutationReason}
                    onChange={e => setMutationReason(e.target.value)}
                  />
                </div>
              </section>
              {saveError && (
                <p className="text-sm admin-message admin-message--error">{saveError}</p>
              )}
            </div>

            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={closeAssign} disabled={saving}>Batal</button>
              <button
                className="btn btn--primary"
                onClick={handleAssign}
                disabled={saving || (!selectedUser && !assignTarget.currentHolder)}
              >
                {saving ? 'Menyimpan…' : selectedUser ? 'Assign Pemegang' : 'Kosongkan Jabatan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPositionsView
