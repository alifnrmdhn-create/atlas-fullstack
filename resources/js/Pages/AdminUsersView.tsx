import { useState, useEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { SkeletonCardList } from '../components/ui'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { formatRoleLabel } from '../lib/roleLabel'
import './AdminViews.css'
type UserUnit = { id: number; code: string; name: string }
type UserDirectorate = { id: number; code: string; name: string }
type UserPosition = { id: number; code: string; name: string; levelCode: string; roleType: string }

type UserRecord = {
  id: number
  userId: string
  nik?: string
  name: string
  email: string
  phone?: string
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
  roleType?: string
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
  const { t } = useTranslation()
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
  const [vacant, setVacant] = useState(false)
  const [mutationReason, setMutationReason] = useState('')
  const [skNumber, setSkNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Edit user modal state
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null)
  const editUserDialogRef = useDialogFocus<HTMLDivElement>(editTarget !== null)
  const editUserTitleId = useId()
  const editUserDescId = useId()
  const [euForm, setEuForm] = useState({ name: '', email: '', userId: '', nik: '', phone: '', password: '' })
  const [euSaving, setEuSaving] = useState(false)
  const [euError, setEuError] = useState<string | null>(null)

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
      setCuError(err instanceof Error ? err.message : t('Failed to create user.'))
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('Failed to load user data.')))
      .finally(() => setLoading(false))
  }, [search, roleFilter, activeFilter, isAuthorized, t])

  useEffect(() => { loadUsers() }, [loadUsers])

  // Load all positions once when modal opens
  useEffect(() => {
    if (!mutasiTarget || allPositions.length > 0) return
    api.get<PositionsResponse>('/organization/positions')
      .then(res => setAllPositions(res.data))
      .catch((err) => { console.error('[Atlas] Silent failure in AdminUsersView.tsx:', err); setAllPositions([]) })
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
    setVacant(false)
    setMutationReason('')
    setSkNumber('')
    setSaveError(null)
    setAllPositions([]) // force reload
  }

  const closeMutasi = () => {
    setMutasiTarget(null)
    setSelectedPos(null)
    setVacant(false)
    setSaveError(null)
  }
  useEscKey(closeMutasi, mutasiTarget !== null)

  const handleMutasi = async () => {
    if (!mutasiTarget || (!selectedPos && !vacant)) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.patch(`/users/${mutasiTarget.id}`, {
        positionId: vacant ? null : selectedPos!.id,
        mutationType: vacant ? 'vacated' : 'mutation',
        mutationReason: mutationReason || undefined,
        skNumber: skNumber || undefined,
      })
      loadUsers()
      closeMutasi()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('Failed to save transfer.'))
    } finally {
      setSaving(false)
    }
  }

  const openEditUser = (user: UserRecord) => {
    setEditTarget(user)
    setEuForm({
      name: user.name ?? '',
      email: user.email ?? '',
      userId: user.userId ?? '',
      nik: user.nik ?? '',
      phone: user.phone ?? '',
      password: '',
    })
    setEuError(null)
  }

  const closeEditUser = () => { setEditTarget(null); setEuError(null) }
  useEscKey(closeEditUser, editTarget !== null)

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    setEuSaving(true)
    setEuError(null)
    try {
      // Field opsional (userId/nik/phone) hanya dikirim bila terisi — kosongkan =
      // biarkan apa adanya, hindari bentrok unique pada string kosong.
      const payload: Record<string, string> = {
        name: euForm.name.trim(),
        email: euForm.email.trim(),
      }
      if (euForm.userId.trim()) payload.userId = euForm.userId.trim()
      if (euForm.nik.trim()) payload.nik = euForm.nik.trim()
      if (euForm.phone.trim()) payload.phone = euForm.phone.trim()
      if (euForm.password.trim()) payload.password = euForm.password
      await api.patch(`/users/${editTarget.id}`, payload)
      closeEditUser()
      loadUsers()
    } catch (err) {
      setEuError(err instanceof Error ? err.message : t('Failed to save changes.'))
    } finally {
      setEuSaving(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="ds admin-v2 view-admin-users ds-stagger">
        <div className="panel">
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            {t('Access denied. This page is for admins and superadmins only.')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ds admin-v2 view-admin-users">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">{t('User Management')}</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">{t('Manage workspace user accounts, roles, and access.')}</span>
        <input
          className="view-toolbar__search"
          type="text"
          placeholder={t('Search name, email, or NIK…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="view-toolbar__search admin-toolbar-select"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          {ROLE_OPTIONS.map(r => (
            <option key={r} value={r}>{r === 'all' ? t('All Roles') : formatRoleLabel(r)}</option>
          ))}
        </select>
        <div className="view-toggle admin-toolbar-toggle">
          {(['all', 'active', 'inactive'] as ActiveFilter[]).map(val => (
            <button
              key={val}
              className={`view-toggle-btn${activeFilter === val ? ' active' : ''}`}
              onClick={() => setActiveFilter(val)}
            >
              {val === 'all' ? t('All') : val === 'active' ? t('Active') : t('Inactive')}
            </button>
          ))}
        </div>
        <div className="view-toolbar__right">
          {!loading && (
            <div className="view-toolbar__stats">
              <span>{total} <em>{t('users')}</em></span>
            </div>
          )}
          <button className="toolbar-action-btn" onClick={openCreateUser}>{t('+ Add User')}</button>
        </div>
      </div>

      <div className="panel">
        {error && (
          <p className="text-sm admin-message admin-message--error">{error}</p>
        )}
        {!error && !loading && users.length === 0 && (
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            {t('No users match the current filter.')}
          </p>
        )}
        {!error && (loading || users.length > 0) && (
          <div className="table-scroll">
          <table className="reports-table">
            <thead>
              <tr>
                <th>{t('Name / ID')}</th>
                <th>{t('Role')}</th>
                <th>{t('Position')}</th>
                <th>{t('Unit')}</th>
                <th>{t('Directorate')}</th>
                <th>{t('Status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="admin-table-placeholder">
                    <SkeletonCardList count={5} label={t('Loading data…')} />
                  </td>
                </tr>
              ) : users.map(user => (
                <tr key={user.id}>
                  <td data-label={t('Name / ID')}>
                    <div className="admin-cell-stack">
                      <span className="text-strong admin-cell-title">{user.name}</span>
                      <span className="code-badge">{user.userId}</span>
                    </div>
                  </td>
                  <td data-label={t('Role')}>
                    <span className={`badge ${ROLE_BADGE[user.roleType] ?? ''}`}>{formatRoleLabel(user.roleType)}</span>
                  </td>
                  <td data-label={t('Position')}>
                    <div className="admin-cell-stack">
                      {user.position?.code && <span className="code-badge admin-code-badge--micro admin-code-badge--fit">{user.position.code}</span>}
                      <span className="text-sm text-muted">{user.position?.name ?? user.positionTitle ?? '–'}</span>
                    </div>
                  </td>
                  <td data-label={t('Unit')}>
                    {user.unit
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{user.unit.code}</span>
                          <span className="text-xs text-muted">{user.unit.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td data-label={t('Directorate')}>
                    {user.directorate
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{user.directorate.code}</span>
                          <span className="text-xs text-muted">{user.directorate.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td data-label={t('Status')}>
                    <span className={`badge ${user.isActive ? 'badge--green' : 'badge--red'}`}>
                      {user.isActive ? t('Active') : t('Inactive')}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button className="btn btn--sm btn--ghost" onClick={() => openEditUser(user)}>
                        {t('Edit')}
                      </button>
                      <button className="btn btn--sm btn--ghost" onClick={() => openMutasi(user)}>
                        {t('Transfer')}
                      </button>
                      <button
                        className={`btn btn--sm btn--ghost admin-row-status-btn ${user.isActive ? 'admin-row-status-btn--danger' : 'admin-row-status-btn--success'}`}
                        onClick={() => void handleToggleActive(user)}
                        title={user.isActive ? t('Deactivate') : t('Activate')}
                      >
                        {user.isActive ? t('Deactivate') : t('Activate')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Buat Pengguna Modal — portal-mounted ke document.body (modal-safe). */}
      {showCreateUser && createPortal(
        <div className="modal-backdrop" onClick={closeCreateUser}>
          <div aria-describedby={createUserDescId} aria-labelledby={createUserTitleId} aria-modal="true" className="modal modal--wide" ref={createUserDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{t('User Management')}</span>
                <h3 className="modal__title" id={createUserTitleId}>{t('Add New User')}</h3>
                <p className="modal-subtitle" id={createUserDescId}>
                  {t('Fill in the basic identity, then link the user to the right role and position for more consistent provisioning.')}
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
                    <h4>{t('User Identity')}</h4>
                    <p>{t("Enter the employee's basic details used across the directory, assignments, and pickers throughout the app.")}</p>
                  </div>
                  <div className="admin-form-grid admin-form-grid--2">
                    <div className="modal-field">
                      <label className="modal-label">{t('Full Name')} <span className="admin-required">*</span></label>
                      <input className="form-input" required minLength={1} type="text" placeholder={t("Employee's full name")} value={cuForm.name} onChange={e => setCuForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">{t('Email')} <span className="admin-required">*</span></label>
                      <input className="form-input" required type="email" placeholder="email@perusahaan.co.id" value={cuForm.email} onChange={e => setCuForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="admin-form-grid admin-form-grid--3">
                    <div className="modal-field">
                      <label className="modal-label">{t('Employee ID')}</label>
                      <input className="form-input" type="text" placeholder={t('e.g. EMP-001')} value={cuForm.userId} onChange={e => setCuForm(f => ({ ...f, userId: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">{t('NIK')}</label>
                      <input className="form-input" type="text" placeholder={t('Employee identification number')} value={cuForm.nik} onChange={e => setCuForm(f => ({ ...f, nik: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">{t('Phone')}</label>
                      <input className="form-input" type="text" placeholder="+62…" value={cuForm.phone} onChange={e => setCuForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>{t('Role & Position')}</h4>
                    <p>{t('Use role for access rights, then link a position if you want the unit and organization structure to be resolved too.')}</p>
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">{t('Role')} <span className="admin-required">*</span></label>
                    {cuSelectedPos ? (
                      <div className="form-input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge ${ROLE_BADGE[cuForm.roleType] ?? ''}`}>{formatRoleLabel(cuForm.roleType)}</span>
                        <span className="text-xs text-muted">{t('follows the selected position')}</span>
                      </div>
                    ) : (
                      <select className="form-input" value={cuForm.roleType} onChange={e => setCuForm(f => ({ ...f, roleType: e.target.value }))}>
                        {['BOD','KADIV','KASUBDIV','ASISTEN','OFFICER','ADMIN'].map(r => (
                          <option key={r} value={r}>{formatRoleLabel(r)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">{t('Position (optional)')}</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder={t('Type a position name or code…')}
                      value={cuPosSearch}
                      onChange={e => { setCuPosSearch(e.target.value); setCuSelectedPos(null) }}
                    />
                    {cuPosOptions.length > 0 && !cuSelectedPos && cuPosSearch.trim() && (
                      <div className="user-picker-list">
                        {cuPosOptions.map(p => (
                          <button key={p.id} className="user-picker-item" type="button"
                            onClick={() => { setCuSelectedPos(p); setCuPosSearch(''); if (p.roleType) setCuForm(f => ({ ...f, roleType: p.roleType as string })) }}>
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
                        <button type="button" onClick={() => { setCuSelectedPos(null); setCuPosSearch(''); setCuForm(f => ({ ...f, roleType: 'ASISTEN' })) }}>
                          <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="modal-helper-note">
                    {t('If a position is selected, role and unit are adjusted automatically. Default account password:')} <strong>DKMR2026</strong>.
                  </div>
                </section>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" type="button" onClick={closeCreateUser} disabled={cuSaving}>{t('Cancel')}</button>
                <button className="profile-save-btn" type="submit" disabled={cuSaving || !cuForm.name.trim() || !cuForm.email.trim()}>
                  {cuSaving ? t('Creating…') : t('Add User')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Edit User Modal — portal-mounted. */}
      {editTarget && createPortal(
        <div className="modal-backdrop" onClick={closeEditUser}>
          <div aria-describedby={editUserDescId} aria-labelledby={editUserTitleId} aria-modal="true" className="modal modal--wide" ref={editUserDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{t('User Management')}</span>
                <h3 className="modal__title" id={editUserTitleId}>{t('Edit User')}</h3>
                <p className="modal-subtitle" id={editUserDescId}>
                  {t('Update the account identity (name, login ID, NIK, contact) or reset the password. Role, position, and unit are changed via Transfer.')}
                </p>
              </div>
              <button className="modal__close" onClick={closeEditUser} type="button">
                <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
              </button>
            </div>
            <form onSubmit={handleEditUser}>
              <div className="modal__body">
                {euError && (
                  <div className="inline-notice inline-notice--error admin-inline-error">{euError}</div>
                )}
                <section className="modal-section">
                  <div className="modal-section__intro">
                    <h4>{t('User Identity')}</h4>
                    <p>{t('These fields drive the directory and login identity for')} <strong>{editTarget.name}</strong>.</p>
                  </div>
                  <div className="admin-form-grid admin-form-grid--2">
                    <div className="modal-field">
                      <label className="modal-label">{t('Full Name')} <span className="admin-required">*</span></label>
                      <input className="form-input" required minLength={1} type="text" value={euForm.name} onChange={e => setEuForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">{t('Email')} <span className="admin-required">*</span></label>
                      <input className="form-input" required type="email" value={euForm.email} onChange={e => setEuForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="admin-form-grid admin-form-grid--3">
                    <div className="modal-field">
                      <label className="modal-label">{t('Login ID')}</label>
                      <input className="form-input" type="text" placeholder={t('e.g. nama.lengkap')} value={euForm.userId} onChange={e => setEuForm(f => ({ ...f, userId: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">{t('NIK')}</label>
                      <input className="form-input" type="text" placeholder={t('Employee identification number')} value={euForm.nik} onChange={e => setEuForm(f => ({ ...f, nik: e.target.value }))} />
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">{t('Phone')}</label>
                      <input className="form-input" type="text" placeholder="+62…" value={euForm.phone} onChange={e => setEuForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                  </div>
                </section>
                <section className="modal-section modal-section--soft">
                  <div className="modal-section__intro">
                    <h4>{t('Reset Password')}</h4>
                    <p>{t('Leave blank to keep the current password. Minimum 6 characters; share the new password with the user securely.')}</p>
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">{t('New Password')}</label>
                    <input className="form-input" type="text" autoComplete="new-password" placeholder={t('Leave blank to keep unchanged')} value={euForm.password} onChange={e => setEuForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                </section>
              </div>
              <div className="modal__footer">
                <button className="btn btn--ghost" type="button" onClick={closeEditUser} disabled={euSaving}>{t('Cancel')}</button>
                <button className="profile-save-btn" type="submit" disabled={euSaving || !euForm.name.trim() || !euForm.email.trim()}>
                  {euSaving ? t('Saving…') : t('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Mutasi Modal — portal-mounted. */}
      {mutasiTarget && createPortal(
        <div className="modal-backdrop" onClick={closeMutasi}>
          <div aria-describedby={mutasiDescId} aria-labelledby={mutasiTitleId} aria-modal="true" className="modal" ref={mutasiDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{t('Organization Move')}</span>
                <h3 className="modal__title" id={mutasiTitleId}>{t('Position Transfer')}</h3>
                <p className="modal-subtitle" id={mutasiDescId}>
                  {t('Move the user to a new position while recording the administrative reason and decree reference if needed.')}
                </p>
              </div>
              <button className="modal__close" onClick={closeMutasi} type="button"><svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg></button>
            </div>

            <div className="modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>{t('Transfer Subject')}</h4>
                  <p>{t('Confirm the person being moved and their current position are correct before choosing the new destination.')}</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Employee')}</label>
                  <div className="admin-cell-stack">
                    <span className="text-sm text-strong">{mutasiTarget.name}</span>
                    <span className="text-xs text-muted">{mutasiTarget.nik ?? mutasiTarget.userId}</span>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Current Position')}</label>
                  {mutasiTarget.position
                    ? <div className="admin-cell-inline">
                        <span className="code-badge">{mutasiTarget.position.code}</span>
                        <span className="text-sm">{mutasiTarget.position.name}</span>
                      </div>
                    : <span className="text-muted text-xs">{mutasiTarget.positionTitle ?? t('No position yet')}</span>}
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>{t('Destination Position')}</h4>
                  <p>{t('Search positions by name, code, or unit. If already held by someone else, a warning appears in the search results.')}</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('New Position')}</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={t('Type to search positions (name, code, or unit)…')}
                    value={posSearch}
                    onChange={e => setPosSearch(e.target.value)}
                    disabled={vacant}
                    autoFocus
                  />
                  {!vacant && posOptions.length > 0 && !selectedPos && (
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
                  {!vacant && selectedPos && (
                    <div className="selected-user-chip">
                      <span>✓ {selectedPos.code ? `[${selectedPos.code}] ` : ''}{selectedPos.title}</span>
                      <button type="button" onClick={() => { setSelectedPos(null); setPosSearch('') }}><svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg></button>
                    </div>
                  )}
                </div>
                <label className="modal-checkrow">
                  <input
                    type="checkbox"
                    checked={vacant}
                    onChange={e => { setVacant(e.target.checked); if (e.target.checked) { setSelectedPos(null); setPosSearch('') } }}
                  />
                  <span>
                    <span className="text-sm text-strong">{t('Make vacant (remove from any position)')}</span>
                    <span className="text-xs text-muted">{t('The user keeps their account but no longer holds a position. Their current position becomes vacant.')}</span>
                  </span>
                </label>
              </section>
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>{t('Administrative Notes')}</h4>
                  <p>{t('Add the decree number and transfer reason so the position-change trail stays documented.')}</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Decree Number')} <span className="text-muted">{t('(optional)')}</span></label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={t('e.g. SK-001/DIR/2026')}
                    value={skNumber}
                    onChange={e => setSkNumber(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Transfer Reason')} <span className="text-muted">{t('(optional)')}</span></label>
                  <textarea
                    className="form-input admin-textarea-vertical"
                    rows={2}
                    placeholder={t('e.g. Regular Q1 2026 transfer, promotion, etc.')}
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
              <button className="btn btn--ghost" onClick={closeMutasi} disabled={saving}>{t('Cancel')}</button>
              <button
                className="btn btn--primary"
                onClick={handleMutasi}
                disabled={saving || (!selectedPos && !vacant)}
              >
                {saving ? t('Saving…') : vacant ? t('Save (Vacate)') : t('Save Transfer')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default AdminUsersView
