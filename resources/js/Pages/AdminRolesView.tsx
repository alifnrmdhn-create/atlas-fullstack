import { useState, useEffect } from 'react'
import { useWorkspace } from '../context/workspace'
import { api } from '../lib/api'

type RoleConfig = {
  role: string
  label: string
  description: string
  line?: string
  bodLevel?: string
  badgeColor: string
}

type PermRow = {
  role: string
  viewAll: boolean | 'own'
  manageUsers: boolean
  manageParams: boolean
  createProgram: boolean
  editProgram: boolean | 'own'
  viewReports: boolean
}

const PERM_MATRIX: PermRow[] = [
  { role: 'SUPERADMIN', viewAll: true,  manageUsers: true,  manageParams: true,  createProgram: true,  editProgram: true,  viewReports: true  },
  { role: 'ADMIN',      viewAll: true,  manageUsers: true,  manageParams: true,  createProgram: true,  editProgram: true,  viewReports: true  },
  { role: 'BOD',        viewAll: true,  manageUsers: false, manageParams: false, createProgram: false, editProgram: false, viewReports: true  },
  { role: 'KADIV',      viewAll: false, manageUsers: false, manageParams: false, createProgram: true,  editProgram: true,  viewReports: true  },
  { role: 'KASUBDIV',   viewAll: false, manageUsers: false, manageParams: false, createProgram: false, editProgram: 'own', viewReports: true  },
  { role: 'ASISTEN',    viewAll: false, manageUsers: false, manageParams: false, createProgram: false, editProgram: 'own', viewReports: true  },
  { role: 'OFFICER',    viewAll: false, manageUsers: false, manageParams: false, createProgram: false, editProgram: false, viewReports: false },
]

const PERM_COLUMNS: { key: keyof Omit<PermRow, 'role'>; label: string }[] = [
  { key: 'viewAll',       label: 'View All'       },
  { key: 'manageUsers',   label: 'Manage Users'   },
  { key: 'manageParams',  label: 'Manage Params'  },
  { key: 'createProgram', label: 'Create Program' },
  { key: 'editProgram',   label: 'Edit Program'   },
  { key: 'viewReports',   label: 'View Reports'   },
]

function PermCell({ value }: { value: boolean | 'own' }) {
  if (value === true) {
    return <span className="perm-matrix__check">✓</span>
  }
  if (value === 'own') {
    return <span className="perm-matrix__check perm-matrix__check--own">✓ (own)</span>
  }
  return <span className="perm-matrix__dash">–</span>
}

export function AdminRolesView() {
  const { currentUser } = useWorkspace()
  const isSuperAdmin = ['superadmin','SUPERADMIN'].includes(currentUser?.roleType ?? '')

  const [roleConfigs, setRoleConfigs] = useState<RoleConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [activeRole, setActiveRole] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [savedRole, setSavedRole] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    api.get<{ data: RoleConfig[] } | RoleConfig[]>('/role-configs').then((res) => {
      if (cancelled) return
      const data = Array.isArray(res) ? res : (res as { data: RoleConfig[] }).data ?? []
      setRoleConfigs(data)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  function handleRowClick(config: RoleConfig) {
    if (!isSuperAdmin) return
    if (activeRole === config.role) {
      setActiveRole(null)
      setEditDesc('')
      setSaveError(null)
    } else {
      setActiveRole(config.role)
      setEditDesc(config.description)
      setSaveError(null)
    }
  }

  async function handleDescSave(role: string) {
    setSavingRole(role)
    setSaveError(null)
    try {
      await api.put(`/role-configs/${role}`, { description: editDesc })
      setRoleConfigs((prev) =>
        prev.map((rc) => (rc.role === role ? { ...rc, description: editDesc } : rc)),
      )
      setSavedRole(role)
      setTimeout(() => setSavedRole(null), 2000)
      setActiveRole(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSavingRole(null)
    }
  }

  return (
    <div className="view-admin-roles">
      <div className="view-toolbar">
        <h2 className="view-toolbar__title">Roles &amp; Permissions</h2>
        <div className="view-toolbar__sep" />
        <span className="view-toolbar__subtitle">Kelola konfigurasi peran dan lihat matriks izin sistem.</span>
      </div>

      <div className="admin-roles-layout">
        {/* Left — Role List */}
        <div className="panel">
          <div className="panel__header">
            <span className="panel__title text-sm">Daftar Peran</span>
          </div>
          {loading ? (
            <div className="panel__body">
              <span className="text-muted text-sm">Memuat…</span>
            </div>
          ) : roleConfigs.length === 0 ? (
            <div className="panel__body">
              <span className="text-muted text-sm">Tidak ada data peran.</span>
            </div>
          ) : (
            <ul className="roles-list">
              {roleConfigs.map((config) => {
                const isActive = activeRole === config.role
                return (
                  <li
                    key={config.role}
                    className={`roles-list__row${isActive ? ' roles-list__row--active' : ''}`}
                    onClick={() => handleRowClick(config)}
                    data-clickable={isSuperAdmin ? 'true' : 'false'}
                  >
                    <span
                      className={`roles-list__code badge badge--${config.badgeColor}`}
                    >
                      {config.role}
                    </span>
                    <div className="roles-list__info">
                      <div className="roles-list__label text-strong text-sm">
                        {config.label}
                      </div>
                      {config.line && (
                        <div className="roles-list__line text-xs text-muted">
                          {config.line}
                          {config.bodLevel ? ` · BOD ${config.bodLevel}` : ''}
                        </div>
                      )}
                      {isActive && isSuperAdmin ? (
                        <div
                          className="roles-list__desc"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <textarea
                            className="form-input roles-list__textarea"
                            rows={3}
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            disabled={savingRole === config.role}
                          />
                          <div className="roles-list__save-row">
                            <button
                              className="btn btn--primary btn--sm"
                              onClick={() => handleDescSave(config.role)}
                              disabled={savingRole === config.role}
                            >
                              {savingRole === config.role ? 'Menyimpan…' : 'Simpan'}
                            </button>
                            <button
                              className="btn btn--sm"
                              onClick={() => {
                                setActiveRole(null)
                                setEditDesc('')
                                setSaveError(null)
                              }}
                              disabled={savingRole === config.role}
                            >
                              Batal
                            </button>
                            {savedRole === config.role && (
                              <span className="badge badge--green text-xs">Tersimpan</span>
                            )}
                            {saveError && activeRole === config.role && (
                              <span className="badge badge--red text-xs">{saveError}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="roles-list__desc text-sm text-muted">
                          {config.description}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Right — Permission Matrix */}
        <div className="panel">
          <div className="panel__header">
            <span className="panel__title text-sm">Matriks Izin</span>
          </div>
          <div className="panel__body perm-matrix-wrap">
            <table className="perm-matrix">
              <thead>
                <tr>
                  <th className="text-sm text-muted perm-matrix__header-cell perm-matrix__header-cell--role">
                    Peran
                  </th>
                  {PERM_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="text-xs text-muted perm-matrix__header-cell"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERM_MATRIX.map((row) => (
                  <tr key={row.role}>
                    <td className="perm-matrix__role-cell">
                      <span className="code-badge text-xs">{row.role}</span>
                    </td>
                    {PERM_COLUMNS.map((col) => (
                      <td key={col.key} className="perm-matrix__value-cell">
                        <PermCell value={row[col.key] as boolean | 'own'} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
