import { useState, useEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { SkeletonCardList } from '../components/ui'
import { useDialogFocus } from '../hooks/useDialogFocus'
import './AdminViews.css'
import { useEscKey } from '../hooks/useEscKey'
import { formatRoleLabel } from '../lib/roleLabel'

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
  reportsToPositionId?: number | null
  reportsTo?: { id: number; code: string; name: string } | null
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

// Kumpulan id keturunan (langsung+tak langsung) dari sebuah posisi — dipakai untuk
// menyaring opsi "Reports To" agar tak bisa memilih dirinya sendiri / bawahannya
// (mencegah lingkar). Server tetap otoritatif (assertNoCycle).
function collectDescendantIds(positions: PositionRecord[], rootId: number): Set<number> {
  const childrenOf = new Map<number, number[]>()
  for (const p of positions) {
    if (p.reportsToPositionId != null) {
      const arr = childrenOf.get(p.reportsToPositionId) ?? []
      arr.push(p.id)
      childrenOf.set(p.reportsToPositionId, arr)
    }
  }
  const out = new Set<number>()
  const stack = [...(childrenOf.get(rootId) ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    stack.push(...(childrenOf.get(id) ?? []))
  }
  return out
}

export function AdminPositionsView() {
  const { t } = useTranslation()
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
    }).catch((err) => console.error('[Atlas] Silent failure in AdminPositionsView.tsx:', err))
  }, [])

  const emptyPosForm = { code: '', name: '', levelCode: 'BOD-4', roleType: 'ASISTEN', directorateId: '', divisionId: '', reportsToPositionId: '', isActive: true }

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
        reportsToPositionId: cpPosForm.reportsToPositionId ? Number(cpPosForm.reportsToPositionId) : null,
        isActive: cpPosForm.isActive,
      })
      closeCreatePos()
      loadPositions()
    } catch (err) {
      setCpPosError(err instanceof Error ? err.message : t('Failed to create position.'))
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
      reportsToPositionId: String(pos.reportsToPositionId ?? ''),
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
        reportsToPositionId: epPosForm.reportsToPositionId ? Number(epPosForm.reportsToPositionId) : null,
        isActive: epPosForm.isActive,
      })
      closeEditPos()
      loadPositions()
    } catch (err) {
      setEpPosError(err instanceof Error ? err.message : t('Failed to save.'))
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('Failed to load position data.')))
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
      .catch((err) => { console.error('[Atlas] Silent failure in AdminPositionsView.tsx:', err); setUserOptions([]) })
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
      setSaveError(err instanceof Error ? err.message : t('Failed to save.'))
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
      <div className="ds admin-v2 view-admin-positions ds-stagger">
        <div className="panel">
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">
            {t('Access denied. This page is for admins and superadmins only.')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ds admin-v2 view-admin-positions ds-stagger">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">{t('Position Management')}</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">{t('Manage the position and role structure within the organization.')}</span>
        <div className="view-toolbar__right">
          {!loading && (
            <div className="view-toolbar__stats">
              <span>{total} <em>{t('positions')}</em></span>
            </div>
          )}
          <button className="toolbar-action-btn" onClick={openCreatePos}>{t('+ Add Position')}</button>
        </div>
      </div>

      {!loading && !error && (
        <div className="admin-positions-stats">
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val">{total}</span>
            <span className="text-muted text-xs">{t('Total Positions')}</span>
          </div>
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val admin-positions-stat-card__val--success">{activeCount}</span>
            <span className="text-muted text-xs">{t('Active')}</span>
          </div>
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val admin-positions-stat-card__val--warning">{vacantCount}</span>
            <span className="text-muted text-xs">{t('Vacant')}</span>
          </div>
          <div className="admin-positions-stat-card">
            <span className="text-strong admin-positions-stat-card__val">{avgLevel}</span>
            <span className="text-muted text-xs">{t('Average Level')}</span>
          </div>
        </div>
      )}

      <div className="panel">
        {error && (
          <p className="text-sm admin-message admin-message--error">{error}</p>
        )}
        {!error && !loading && positions.length === 0 && (
          <p className="text-muted text-sm admin-state-copy admin-state-copy--center">{t('No position data.')}</p>
        )}
        {!error && (loading || positions.length > 0) && (
          <table className="reports-table">
            <thead>
              <tr>
                <th>{t('Code')}</th>
                <th>{t('Position')}</th>
                <th>{t('Level')}</th>
                <th>{t('Unit')}</th>
                <th>{t('Directorate')}</th>
                <th>{t('Reports To')}</th>
                <th>{t('Holder')}</th>
                <th>{t('Status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="admin-table-placeholder">
                    <SkeletonCardList count={5} label={t('Loading data…')} />
                  </td>
                </tr>
              ) : positions.map(pos => (
                <tr key={pos.id}>
                  <td data-label="Code">
                    {pos.code
                      ? <span className="code-badge">{pos.code}</span>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td data-label="Position">
                    <span className="text-strong admin-cell-title">{pos.title}</span>
                  </td>
                  <td data-label="Level">
                    {pos.level !== undefined && pos.level !== null
                      ? <span className={`badge ${LEVEL_BADGE[pos.level] ?? ''}`}>{LEVEL_LABEL[pos.level] ?? pos.level}</span>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td data-label="Unit">
                    {pos.unit
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{pos.unit.code}</span>
                          <span className="text-xs text-muted">{pos.unit.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td data-label="Directorate">
                    {pos.directorate
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{pos.directorate.code}</span>
                          <span className="text-xs text-muted">{pos.directorate.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td data-label="Reports To">
                    {pos.reportsTo
                      ? <div className="admin-cell-inline">
                          <span className="code-badge">{pos.reportsTo.code}</span>
                          <span className="text-xs text-muted">{pos.reportsTo.name}</span>
                        </div>
                      : <span className="text-muted text-xs">–</span>}
                  </td>
                  <td data-label="Holder">
                    {pos.currentHolder
                      ? <div className="admin-cell-stack">
                          <span className="text-sm admin-cell-name">{pos.currentHolder.name}</span>
                          <span className="text-xs text-muted">{formatRoleLabel(pos.currentHolder.roleType)}</span>
                        </div>
                      : <span className="badge badge--yellow">{t('Vacant')}</span>}
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${pos.isActive ? 'badge--green' : 'badge--red'}`}>
                      {pos.isActive ? t('Active') : t('Inactive')}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button className="btn btn--sm btn--ghost" onClick={() => openAssign(pos)}>
                        {pos.currentHolder ? t('Replace') : t('Assign')}
                      </button>
                      <button className="btn btn--sm btn--ghost" onClick={() => openEditPos(pos)}>{t('Edit')}</button>
                      <button
                        className="btn btn--sm btn--ghost admin-row-status-btn admin-row-status-btn--danger"
                        onClick={() => setConfirmDeletePosId(confirmDeletePosId === pos.id ? null : pos.id)}
                      >
                        {t('Delete')}
                      </button>
                    </div>
                    {confirmDeletePosId === pos.id && (
                      <div className="admin-inline-confirm">
                        <span className="admin-inline-confirm__label">{t('Delete this?')}</span>
                        <button
                          className="btn btn--sm btn--danger admin-inline-confirm__btn"
                          disabled={deletePosSaving}
                          onClick={() => void handleDeletePos(pos.id)}
                        >
                          {deletePosSaving ? '…' : t('Yes')}
                        </button>
                        <button
                          className="btn btn--sm btn--ghost admin-inline-confirm__btn"
                          disabled={deletePosSaving}
                          onClick={() => setConfirmDeletePosId(null)}
                        >
                          {t('Cancel')}
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
        // Opsi atasan: semua posisi, kecuali diri sendiri & keturunannya (cegah lingkar).
        const excludedParentIds = editingPos
          ? new Set<number>([editingPos.id, ...collectDescendantIds(positions, editingPos.id)])
          : new Set<number>()
        const reportsToOptions = positions
          .filter(p => !excludedParentIds.has(p.id))
          .sort((a, b) => a.title.localeCompare(b.title))
        // Portal-mounted untuk modal-safety di bawah ds-stagger parent wrapper.
        return createPortal(
          <div className="modal-backdrop" onClick={closeModal}>
            <div aria-describedby={positionFormDescId} aria-labelledby={positionFormTitleId} aria-modal="true" className="modal modal--wide" ref={positionFormDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <div className="modal-headcopy">
                  <span className="modal-kicker">{t('Position Setup')}</span>
                  <h3 className="modal__title" id={positionFormTitleId}>{isEdit ? t('Edit Position') : t('Add New Position')}</h3>
                  <p className="modal-subtitle" id={positionFormDescId}>
                    {t('Define the position identity, organization-structure mapping, and active status in one focused form.')}
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
                      <h4>{t('Position Identity')}</h4>
                      <p>{t('Set the code, name, level, and base role used across the organization structure and user assignments.')}</p>
                    </div>
                    <div className="admin-form-grid admin-form-grid--name">
                      <div className="modal-field">
                        <label className="modal-label">{t('Code')} <span className="admin-required">*</span></label>
                        <input className="form-input" required minLength={2} maxLength={40} type="text" placeholder={t('e.g. DIR-001')} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                      </div>
                      <div className="modal-field">
                        <label className="modal-label">{t('Position Name')} <span className="admin-required">*</span></label>
                        <input className="form-input" required minLength={2} maxLength={120} type="text" placeholder={t('Position name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                    </div>
                    <div className="admin-form-grid admin-form-grid--2">
                      <div className="modal-field">
                        <label className="modal-label">{t('Level Code')} <span className="admin-required">*</span></label>
                        <select className="form-input" value={form.levelCode} onChange={e => setForm(f => ({ ...f, levelCode: e.target.value }))}>
                          {['BOD','BOD-1','BOD-2','BOD-3','BOD-4','M1','M2','M3','S1','S2'].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="modal-field">
                        <label className="modal-label">{t('Role Type')} <span className="admin-required">*</span></label>
                        <select className="form-input" value={form.roleType} onChange={e => setForm(f => ({ ...f, roleType: e.target.value }))}>
                          {['BOD','KADIV','KASUBDIV','ASISTEN','OFFICER','ADMIN'].map(r => <option key={r} value={r}>{formatRoleLabel(r)}</option>)}
                        </select>
                      </div>
                    </div>
                  </section>
                  <section className="modal-section modal-section--soft">
                    <div className="modal-section__intro">
                      <h4>{t('Organization Structure')}</h4>
                      <p>{t('Link the position to the relevant directorate and unit so structure filters and transfers work more precisely.')}</p>
                    </div>
                    <div className="admin-form-grid admin-form-grid--2">
                      <div className="modal-field">
                        <label className="modal-label">{t('Directorate')}</label>
                        <select className="form-input" value={form.directorateId} onChange={e => setForm(f => ({ ...f, directorateId: e.target.value, divisionId: '' }))}>
                          <option value="">{t('— Not Specified —')}</option>
                          {directorates.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                        </select>
                      </div>
                      <div className="modal-field">
                        <label className="modal-label">{t('Unit / Division')}</label>
                        <select className="form-input" value={form.divisionId} onChange={e => setForm(f => ({ ...f, divisionId: e.target.value }))}>
                          <option value="">{t('— Not Specified —')}</option>
                          {filteredUnits.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="modal-field">
                      <label className="modal-label">{t('Reports To (Superior)')}</label>
                      <select className="form-input" value={form.reportsToPositionId} onChange={e => setForm(f => ({ ...f, reportsToPositionId: e.target.value }))}>
                        <option value="">{t('— No superior (top of structure) —')}</option>
                        {reportsToOptions.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.title}</option>)}
                      </select>
                      <span className="text-xs text-muted">{t('Determines the direct supervisor of the position holder (used for escalation & approval).')}</span>
                    </div>
                    <label className="admin-checkbox-row">
                      <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                      {t('Active Position')}
                    </label>
                  </section>
                </div>
                <div className="modal__footer">
                  <button className="btn btn--ghost" type="button" onClick={closeModal} disabled={saving}>{t('Cancel')}</button>
                  <button className="profile-save-btn" type="submit" disabled={saving || !form.code.trim() || !form.name.trim()}>
                    {saving ? t('Saving…') : isEdit ? t('Save Changes') : t('Add Position')}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      })()}

      {/* Assign Modal — portal-mounted. */}
      {assignTarget && createPortal(
        <div className="modal-backdrop" onClick={closeAssign}>
          <div aria-describedby={assignDialogDescId} aria-labelledby={assignDialogTitleId} aria-modal="true" className="modal" ref={assignDialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">{t('Role Assignment')}</span>
                <h3 className="modal__title" id={assignDialogTitleId}>{t('Assign Position Holder')}</h3>
                <p className="modal-subtitle" id={assignDialogDescId}>
                  {t('Choose the most suitable user to hold this position, or leave it vacant during a transition.')}
                </p>
              </div>
              <button className="modal__close" onClick={closeAssign} type="button"><svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg></button>
            </div>

            <div className="modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>{t('Position Context')}</h4>
                  <p>{t('Review the position to be filled, its unit, and the current holder before changing the assignment.')}</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Position')}</label>
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
                  <label className="modal-label">{t('Current Holder')}</label>
                  {assignTarget.currentHolder
                    ? <span className="text-sm">{assignTarget.currentHolder.name}</span>
                    : <span className="badge badge--yellow admin-badge--fit">{t('Vacant')}</span>}
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>{t('Select New Holder')}</h4>
                  <p>{t('Search by name, NIK, or email. You can also leave the position vacant during a transition period.')}</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Search & Select New User')}</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={t('Search name, NIK, or email…')}
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
                          <span className="text-xs text-muted">{u.positionTitle ?? formatRoleLabel(u.roleType)}</span>
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
                    {t('Clear the selection to remove the current holder without immediately assigning a replacement.')}
                  </div>
                )}
              </section>
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>{t('Administrative Notes')}</h4>
                  <p>{t('Record the decree reference or a brief reason so the assignment history is easy to trace later.')}</p>
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Decree Number')} <span className="text-muted">{t('(optional)')}</span></label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={t('e.g. SK-001/2026')}
                    value={skNumber}
                    onChange={e => setSkNumber(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">{t('Reason / Notes')} <span className="text-muted">{t('(optional)')}</span></label>
                  <textarea
                    className="form-input admin-textarea-vertical"
                    rows={2}
                    placeholder={t('e.g. Regular transfer, promotion, etc.')}
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
              <button className="btn btn--ghost" onClick={closeAssign} disabled={saving}>{t('Cancel')}</button>
              <button
                className="btn btn--primary"
                onClick={handleAssign}
                disabled={saving || (!selectedUser && !assignTarget.currentHolder)}
              >
                {saving ? t('Saving…') : selectedUser ? t('Assign Holder') : t('Vacate Position')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default AdminPositionsView
