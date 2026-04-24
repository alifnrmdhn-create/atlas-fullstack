import { useState, useEffect, useCallback, useId } from 'react'
import { useWorkspace } from '../context/workspace'
import { api } from '../lib/api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
type UserUnit = { id: number; code: string; name: string }
type UserDirectorate = { id: number; code: string; name: string }
type UserPosition = { id: number; code: string; name: string; levelCode: string; roleType: string }

type UserRecord = {
  id: number
  userId: string
  nik?: string
  name: string
  email: string
  roleType: string
  isActive: boolean
  positionTitle?: string
  unit?: UserUnit
  directorate?: UserDirectorate
  position?: UserPosition
}

type PositionOption = {
  id: number
  title: string
  code?: string
  levelCode?: string
  level?: number
  unit?: { id: number; code: string; name: string }
  currentHolder?: { id: number; name: string }
}

type UsersResponse = { data: UserRecord[]; total: number }
type PositionsResponse = { data: PositionOption[]; total: number }

type ActiveFilter = 'all' | 'active' | 'inactive'

const ROLE_BADGE: Record<string, string> = {
  SUPERADMIN: 'badge--red',
  ADMIN: 'badge--blue',
  BOD: 'badge--red',
  KADIV: 'badge--yellow',
  KASUBDIV: 'badge--yellow',
  ASISTEN: 'badge--green',
  OFFICER: 'badge--green',
}

const ROLE_OPTIONS = ['all', 'ADMIN', 'BOD', 'KADIV', 'KASUBDIV', 'ASISTEN', 'OFFICER']

export function AdminUsersView() {
  const { currentUser } = useWorkspace()

  const [users, setUsers] = useState<UserRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')

  // Create user modal state
  const [showCreateUser, setShowCreateUser] = useState(false)
  const createUserDialogRef = useDialogFocus<HTMLDivElement>(showCreateUser)
  const createUserTitleId = useId()
  const createUserDescId = useId()
  const [cuForm, setCuForm] = useState({ name: '', email: '', userId: '', nik: '', phone: '', roleType: 'ASISTEN' })
  const [cuSelectedPos, setCuSelectedPos] = useState<PositionOption | null>(null)
  const [cuPosSearch, setCuPosSearch] = useState('')
  const [cuPosOptions, setCuPosOptions] = useState<PositionOption[]>([])
  const [cuSaving, setCuSaving] = useState(false)
  const [cuError, setCuError] = useState<string | null>(null)

  // Mutasi modal state
  const [mutasiTarget, setMutasiTarget] = useState<UserRecord | null>(null)
  const mutasiDialogRef = useDialogFocus<HTMLDivElement>(mutasiTarget !== null)
  const mutasiTitleId = useId()
  const mutasiDescId = useId()
  const [posSearch, setPosSearch] = useState('')
  const [posOptions, setPosOptions] = useState<PositionOption[]>([])
  const [allPositions, setAllPositions] = useState<PositionOption[]>([])
  const [selectedPos, setSelectedPos] = useState<PositionOption | null>(null)
  const [mutationReason, setMutationReason] = useState('')
  const [skNumber, setSkNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isAuthorized =
    ['admin', 'superadmin', 'ADMIN', 'SUPERADMIN'].includes(currentUser?.roleType ?? '')

  // Create user position search
  useEffect(() => {
    if (!showCreateUser) return
    if (!cuPosSearch.trim()) { setCuPosOptions(allPositions.slice(0, 50)); return }
    const q = cuPosSearch.toLowerCase()
    setCuPosOptions(
      allPositions.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.code ?? '').toLowerCase().includes(q) ||
        (p.unit?.name ?? '').toLowerCase().includes(q)
      ).slice(0, 50)
    )
  }, [cuPosSearch, allPositions, showCreateUser])

  const openCreateUser = () => {
    setCuForm({ name: '', email: '', userId: '', nik: '', phone: '', roleType: 'ASISTEN' })
    setCuSelectedPos(null)
    setCuPosSearch('')
    setCuError(null)
    setAllPositions([]) // force reload when modal opens
    setShowCreateUser(true)
  }

  const closeCreateUser = () => { setShowCreateUser(false); setCuError(null) }
  useEscKey(closeCreateUser, showCreateUser && mutasiTarget === null)

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCuSaving(true)
    setCuError(null)
    try {
      await api.post('/users', {
        name: cuForm.name.trim(),
        email: cuForm.email.trim(),
        userId: cuForm.userId.trim() || undefined,
        nik: cuForm.nik.trim() || undefined,
        phone: cuForm.phone.trim() || undefined,
        roleType: cuForm.roleType,
        positionId: cuSelectedPos?.id,
      })
      closeCreateUser()
      loadUsers()
    } catch (err) {
      setCuError(err instanceof Error ? err.message : 'Gagal membuat pengguna.')
    } finally {
      setCuSaving(false)
    }
  }

  const handleToggleActive = async (user: UserRecord) => {
    try {
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive })
      loadUsers()
    } catch { /* ignore */ }
  }

  const loadUsers = useCallback(() => {
    if (!isAuthorized) return
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (roleFilter !== 'all') params.set('role', roleFilter)
    if (activeFilter !== 'all') params.set('active', activeFilter === 'active' ? 'true' : 'false')
    const query = params.toString()

    setLoading(true)
    setError(null)
    api.get<UsersResponse>(`/users${query ? `?${query}` : ''}`)
      .then(res => { setUsers(res.data); setTotal(res.total) })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Gagal memuat data pengguna.'))
      .finally(() => setLoading(false))
  }, [search, roleFilter, activeFilter, isAuthorized])

  useEffect(() => { loadUsers() }, [loadUsers])

  // Load all positions once when modal opens
  useEffect(() => {
    if (!mutasiTarget || allPositions.length > 0) return
    api.get<PositionsResponse>('/organization/positions')
      .then(res => setAllPositions(res.data))
      .catch(() => setAllPositions([]))
  }, [mutasiTarget, allPositions.length])

  // Filter positions by search
  useEffect(() => {
    if (!posSearch.trim()) {
      setPosOptions(allPositions.slice(0, 50))
      return
    }
    const q = posSearch.toLowerCase()
    setPosOptions(
      allPositions.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.code ?? '').toLowerCase().includes(q) ||
        (p.unit?.name ?? '').toLowerCase().includes(q) ||
        (p.unit?.code ?? '').toLowerCase().includes(q)
      ).slice(0, 60)
    )
  }, [posSearch, allPositions])

  const openMutasi = (user: UserRecord) => {
    setMutasiTarget(user)
    setSelectedPos(user.position
      ? { id: user.position.id, title: user.position.name, code: user.position.code, levelCode: user.position.levelCode }
      : null
    )
    setPosSearch('')
    setMutationReason('')
    setSkNumber('')
    setSaveError(null)
    setAllPositions([]) // force reload
  }

  const closeMutasi = () => {
    setMutasiTarget(null)
    setSelectedPos(null)
    setSaveError(null)
  }
  useEscKey(closeMutasi, mutasiTarget !== null)

  const handleMutasi = async () => {
    if (!mutasiTarget || !selectedPos) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.patch(`/users/${mutasiTarget.id}`, {
        positionId: selectedPos.id,
        mutationType: 'mutation',
        mutationReason: mutationReason || undefined,
        skNumber: skNumber || undefined,
      })
      loadUsers()
      closeMutasi()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan mutasi.')
    } finally {
      setSaving(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="view-admin-users">
        <div className="panel">
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            Akses ditolak. Halaman ini hanya untuk admin dan superadmin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-admin-users">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Manajemen Pengguna</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Kelola akun, peran, dan akses pengguna workspace.</span>
        <input
          className="view-toolbar__search"
          type="text"
          placeholder="Cari nama, email, atau NIK…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="view-toolbar__search admin-toolbar-select"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          {ROLE_OPTIONS.map(r => (
            <option key={r} value={r}>{r === 'all' ? 'Semua Role' : r}</option>
          ))}
        </select>
        <div className="view-toggle admin-toolbar-toggle">
          {(['all', 'active', 'inactive'] as ActiveFilter[]).map(val => (
            <button
              key={val}
              className={`view-toggle-btn${activeFilter === val ? ' active' : ''}`}
              onClick={() => setActiveFilter(val)}
            >
              {val === 'all' ? 'Semua' : val === 'active' ? 'Aktif' : 'Nonaktif'}
            </button>
          ))}
        </div>
        <div className="view-toolbar__right">
          {!loading && (
            <div className="view-toolbar__stats">
              <span>{total} <em>pengguna</em></span>
            </div>
          )}
          <button className="toolbar-action-btn" onClick={openCreateUser}>+ Buat Pengguna</button>
        </div>
      </div>

      <div className="panel">
        {error && (
          <p className="text-sm admin-message admin-message--error">{error}</p>
        )}
        {!error && !loading && users.length === 0 && (
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            Tidak ada pengguna yang sesuai dengan filter.
          </p>
        )}
        {!error && (loading || users.length > 0) && (
          <table className="reports-table">
            <thead>
              <tr>
                <th>Nama / ID</th>
                <th>Role</th>
                <th>Jabatan</th>
                <th>Unit</th>
                <th>Direktorat</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="admin-table-placeholder">
                    <span className="text-muted text-sm">Memuat data…</span>
                  </td>
                </tr>
              ) : users.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="admin-cell-stack">
                      <span className="text-strong admin-cell-title">{user.name}</span>
                      <span className="code-badge">{user.userId}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${ROLE_BADGE[user.roleType] ?? ''}`}>{user.roleType}</span>
                  </td>
                  <td>
                    <div className="admin-cell-stack">
                      {user.position?.code && <span className="code-badge admin-code-badge--micro admin-code-badge--fit">{user.position.code}</span>}
                      <span className="text-sm text-muted">{user.position?.name ?? user.positionTitle ?? '–'}</span>
                    </div>
                  </td>
                  <td>
                    {user.unit
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{user.unit.code}</span>
                          <span className="text-xs text-muted">{user.unit.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td>
                    {user.directorate
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{user.directorate.code}</span>
                          <span className="text-xs text-muted">{user.directorate.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td>
                    <span className={`badge ${user.isActive ? 'badge--green' : 'badge--red'}`}>
                      {user.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button className="btn btn--sm btn--ghost" onClick={() => openMutasi(user)}>
                        Mutasi
                      </button>
                      <button
                        className={`btn btn--sm btn--ghost admin-row-status-btn ${user.isActive ? 'admin-row-status-btn--danger' : 'admin-row-status-btn--success'}`}
                        onClick={() => void handleToggleActive(user)}
                        title={user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Buat Pengguna Modal */}
      {showCreateUser && (
        <div className="modal-backdrop" onClick={closeCreateUser}>
          <div aria-describedby={createUserDescId} aria-labelledby={createUserTitleId} aria-modal="true" className="modal modal--wide" ref={createUserDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">User Management</span>
                <h3 className="modal__title" id={createUserTitleId}>Buat Pengguna Baru</h3>
                <p className="modal-subtitle" id={createUserDescId}>
                  Lengkapi identitas dasar, lalu hubungkan pengguna ke role dan jabatan yang tepat agar provisioning lebih konsisten.
                </p>
              </div>
              <button className="modal__close" onClick={closeCreateUser} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal__body">
                {cuError && (
                  <div className="inline-notice inline-notice--error admin-inline-error">{cuError}</div>
                )}
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>Identitas Pengguna</h4>
                    <p>Masukkan data dasar karyawan yang akan dipakai di direktori, assignment, dan berbagai picker lintas modul.</p>
                  </div>
                  <div className="admin-form-grid admin-form-grid--2">
                    <div className="modal-field">
                      <label className="modal-label">Nama Lengkap <span className="admin-required">*</span></label>
                      <input className="form-input" required minLength={1} type="text" placeholder="Nama lengkap karyawan" value={cuForm.name} onChange={e => setCuForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">Email <span className="admin-required">*</span></label>
                      <input className="form-input" required type="email" placeholder="email@perusahaan.co.id" value={cuForm.email} onChange={e => setCuForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="admin-form-grid admin-form-grid--3">
                    <div className="modal-field">
                      <label className="modal-label">ID Karyawan</label>
                      <input className="form-input" type="text" placeholder="e.g. EMP-001" value={cuForm.userId} onChange={e => setCuForm(f => ({ ...f, userId: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">NIK</label>
                      <input className="form-input" type="text" placeholder="Nomor Induk Karyawan" value={cuForm.nik} onChange={e => setCuForm(f => ({ ...f, nik: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">Telepon</label>
                      <input className="form-input" type="text" placeholder="+62…" value={cuForm.phone} onChange={e => setCuForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>Role & Jabatan</h4>
                    <p>Gunakan role untuk hak akses, lalu tautkan jabatan bila Anda ingin unit dan struktur organisasi ikut terbaca.</p>
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Role <span className="admin-required">*</span></label>
                    <select className="form-input" value={cuForm.roleType} onChange={e => setCuForm(f => ({ ...f, roleType: e.target.value }))}>
                      {['BOD','KADIV','KASUBDIV','ASISTEN','OFFICER','ADMIN'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Jabatan (opsional)</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Ketik nama atau kode jabatan…"
                      value={cuPosSearch}
                      onChange={e => { setCuPosSearch(e.target.value); setCuSelectedPos(null) }}
                    />
                    {cuPosOptions.length > 0 && !cuSelectedPos && cuPosSearch.trim() && (
                      <div className="user-picker-list">
                        {cuPosOptions.map(p => (
                          <button key={p.id} className="user-picker-item" type="button"
                            onClick={() => { setCuSelectedPos(p); setCuPosSearch('') }}>
                            <div className="admin-picker-title">
                              {p.code && <span className="code-badge admin-code-badge--micro">{p.code}</span>}
                              <span className="text-sm text-strong">{p.title}</span>
                            </div>
                            {p.unit && <span className="text-xs text-muted">{p.unit.name}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {cuSelectedPos && (
                      <div className="selected-user-chip">
                        <span>✓ {cuSelectedPos.code ? `[${cuSelectedPos.code}] ` : ''}{cuSelectedPos.title}</span>
                        <button type="button" onClick={() => { setCuSelectedPos(null); setCuPosSearch('') }}>
                          <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="modal-helper-note">
                    Jika jabatan dipilih, role dan unit akan disesuaikan otomatis. Password awal akun: <strong>DKMR2026</strong>.
                  </div>
                </section>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" type="button" onClick={closeCreateUser} disabled={cuSaving}>Batal</button>
                <button className="profile-save-btn" type="submit" disabled={cuSaving || !cuForm.name.trim() || !cuForm.email.trim()}>
                  {cuSaving ? 'Membuat…' : 'Buat Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mutasi Modal */}
      {mutasiTarget && (
        <div className="modal-backdrop" onClick={closeMutasi}>
          <div aria-describedby={mutasiDescId} aria-labelledby={mutasiTitleId} aria-modal="true" className="modal" ref={mutasiDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Organization Move</span>
                <h3 className="modal__title" id={mutasiTitleId}>Mutasi Jabatan</h3>
                <p className="modal-subtitle" id={mutasiDescId}>
                  Pindahkan pengguna ke jabatan baru sambil menyimpan alasan administratif dan referensi SK bila diperlukan.
                </p>
              </div>
              <button className="modal__close" onClick={closeMutasi} type="button"><svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg></button>
            </div>

            <div className="modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Subjek Mutasi</h4>
                  <p>Pastikan orang yang dipindahkan dan jabatan asalnya sudah benar sebelum menentukan tujuan baru.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Karyawan</label>
                  <div className="admin-cell-stack">
                    <span className="text-sm text-strong">{mutasiTarget.name}</span>
                    <span className="text-xs text-muted">{mutasiTarget.nik ?? mutasiTarget.userId}</span>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Jabatan Saat Ini</label>
                  {mutasiTarget.position
                    ? <div className="admin-cell-inline">
                        <span className="code-badge">{mutasiTarget.position.code}</span>
                        <span className="text-sm">{mutasiTarget.position.name}</span>
                      </div>
                    : <span className="text-muted text-xs">{mutasiTarget.positionTitle ?? 'Belum ada jabatan'}</span>}
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Jabatan Tujuan</h4>
                  <p>Cari jabatan berdasarkan nama, kode, atau unit. Jika sudah terisi pemegang lain, peringatan akan muncul di hasil pencarian.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Jabatan Baru</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Ketik untuk cari jabatan (nama, kode, atau unit)…"
                    value={posSearch}
                    onChange={e => setPosSearch(e.target.value)}
                    autoFocus
                  />
                  {posOptions.length > 0 && !selectedPos && (
                    <div className="user-picker-list">
                      {posOptions.map(p => (
                        <button
                          key={p.id}
                          className="user-picker-item"
                          onClick={() => { setSelectedPos(p); setPosSearch('') }}
                          type="button"
                        >
                          <div className="admin-picker-title admin-picker-title--wrap">
                            {p.code && <span className="code-badge admin-code-badge--micro">{p.code}</span>}
                            <span className="text-sm text-strong">{p.title}</span>
                            {p.currentHolder && (
                              <span className="text-xs admin-warning-text">
                                ⚠ {p.currentHolder.name}
                              </span>
                            )}
                          </div>
                          {p.unit && <span className="text-xs text-muted">{p.unit.code} · {p.unit.name}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedPos && (
                    <div className="selected-user-chip">
                      <span>✓ {selectedPos.code ? `[${selectedPos.code}] ` : ''}{selectedPos.title}</span>
                      <button type="button" onClick={() => { setSelectedPos(null); setPosSearch('') }}><svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg></button>
                    </div>
                  )}
                </div>
              </section>
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Catatan Administratif</h4>
                  <p>Lengkapi nomor SK dan alasan mutasi agar jejak perubahan posisi tetap terdokumentasi.</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Nomor SK <span className="text-muted">(opsional)</span></label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="misal: SK-001/DIR/2026"
                    value={skNumber}
                    onChange={e => setSkNumber(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Alasan Mutasi <span className="text-muted">(opsional)</span></label>
                  <textarea
                    className="form-input admin-textarea-vertical"
                    rows={2}
                    placeholder="misal: Mutasi reguler Q1 2026, promosi jabatan, dll."
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
              <button className="btn btn--ghost" onClick={closeMutasi} disabled={saving}>Batal</button>
              <button
                className="btn btn--primary"
                onClick={handleMutasi}
                disabled={saving || !selectedPos}
              >
                {saving ? 'Menyimpan…' : 'Simpan Mutasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
