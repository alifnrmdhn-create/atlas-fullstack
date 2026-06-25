import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useEscKey } from '../hooks/useEscKey'
import { useWorkspace } from '../hooks/useWorkspace'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { PresenceRow, SectionState, Avatar, resolveEmoji, formatRelativeTime, effectivePresenceSlug } from '../components/ui'
import { api } from '../lib/api'
import type { PresenceStatus, PresenceUser } from '../types'
import { ActivityView } from './ActivityView'
import { PageHeader } from '../design-system'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import './PresenceView.css'

type PresenceTab = 'kehadiran' | 'aktivitas'

// ── Emoji groups & presets ───────────────────────────────────
const EMOJI_GROUPS: Array<{ label: string; emojis: string[] }> = [
  { label: 'Work',     emojis: ['💻', '📊', '📈', '📋', '📝', '🗂️', '📌', '🔍', '⚙️', '🏗️'] },
  { label: 'Meeting',  emojis: ['🎙️', '📞', '🤝', '👥', '🗣️', '📡', '🖥️', '📺'] },
  { label: 'Mood',     emojis: ['😊', '🙂', '😄', '🤔', '😴', '😤', '🧐', '🫡', '💪', '🎯'] },
  { label: 'Activity', emojis: ['☕', '🍵', '🚶', '🏃', '✈️', '🏠', '🌿', '📖', '🎧', '🔕'] },
  { label: 'Status',   emojis: ['✅', '⏳', '🔄', '⚡', '🚀', '🛑', '⚠️', '📢', '🔔', '💡'] },
]

const PRESETS: Array<{ emoji: string; message: string; status: PresenceStatus; isOoo?: boolean }> = [
  { emoji: '💻', message: 'Working',              status: 'ONLINE' },
  { emoji: '🎙️', message: 'In a meeting',         status: 'DO_NOT_DISTURB' },
  { emoji: '☕',  message: 'On a short break',     status: 'AWAY' },
  { emoji: '📊', message: 'Portfolio coordination', status: 'ONLINE' },
  { emoji: '🔍', message: 'Deep work — focused',  status: 'DO_NOT_DISTURB' },
  { emoji: '✈️', message: 'Business trip',         status: 'AWAY' },
  { emoji: '🏠', message: 'Work from home',       status: 'ONLINE' },
  { emoji: '🔕', message: 'Do not disturb',       status: 'DO_NOT_DISTURB' },
  { emoji: '🏖️', message: 'OOO — until …',         status: 'OFFLINE', isOoo: true },
]

const STATUS_ORDER: Record<PresenceStatus, number> = { ONLINE: 0, AWAY: 1, DO_NOT_DISTURB: 2, OFFLINE: 3 }

// PTPN role hierarchy weight — higher = more senior. Used as secondary
// sort key within the same presence status (Kasubdiv before Asisten before Officer).
const ROLE_RANK: Record<string, number> = {
  SUPERADMIN: 100, ADMIN: 90, BOD: 80, KADIV: 70, KASUBDIV: 60, ASISTEN: 50, OFFICER: 40,
}
const roleRank = (r?: string | null) => ROLE_RANK[r?.toUpperCase() ?? ''] ?? 0

const OFFLINE_SHOW_DEFAULT = 3

type FilterMode = 'all' | 'active' | 'available' | 'mine'
type Density    = 'comfortable' | 'compact'
type SortMode   = 'status' | 'name'

function isActive(u: PresenceUser)    { return effectivePresenceSlug(u.status, u.lastActivityAt) !== 'offline' }
function isAvailable(u: PresenceUser) { return effectivePresenceSlug(u.status, u.lastActivityAt) === 'online' }

function statusBadge(status: PresenceStatus) {
  if (status === 'ONLINE')         return <span className="status-badge on-track">{i18n.t('Online')}</span>
  if (status === 'AWAY')           return <span className="status-badge at-risk">{i18n.t('Away')}</span>
  if (status === 'DO_NOT_DISTURB') return <span className="status-badge heads-down">{i18n.t('Heads-down')}</span>
  return <span className="status-badge offline">{i18n.t('Offline')}</span>
}

// ── Unit progress bar ────────────────────────────────────────
function UnitProgressBar({ users }: { users: PresenceUser[] }) {
  const total  = users.length
  const online = users.filter(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'online').length
  const away   = users.filter(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'away').length
  const dnd    = users.filter(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'do-not-disturb').length
  if (total === 0) return null
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`
  return (
    <div className="unit-progress-bar">
      {online > 0 && <div className="unit-progress-bar__seg unit-progress-bar__seg--online" style={{ width: pct(online) }} />}
      {away   > 0 && <div className="unit-progress-bar__seg unit-progress-bar__seg--away"   style={{ width: pct(away) }} />}
      {dnd    > 0 && <div className="unit-progress-bar__seg unit-progress-bar__seg--dnd"    style={{ width: pct(dnd) }} />}
    </div>
  )
}

function UnitStatBar({ users }: { users: PresenceUser[] }) {
  const { t } = useTranslation()
  const active = users.filter(isActive).length
  return (
    <span className="unit-stat-bar">
      {active > 0 && <><span className="unit-stat-bar__active">{t('{{count}} active', { count: active })}</span><span className="unit-stat-bar__sep">·</span></>}
      <span className="unit-stat-bar__total">{t('{{count}} members', { count: users.length })}</span>
    </span>
  )
}

// ── Emoji picker ─────────────────────────────────────────────
function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEscKey(() => setOpen(false), open)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="emoji-picker-field" ref={ref}>
      <button className="emoji-picker-field__trigger" onClick={() => setOpen(!open)} title={t('Select emoji')} type="button">
        <span className="emoji-picker-field__display">
          {value ? resolveEmoji(value) : <span className="emoji-picker-field__placeholder">😊</span>}
        </span>
        <span className="emoji-picker-field__caret">▾</span>
      </button>
      {value && (
        <button className="emoji-picker-field__clear" onClick={() => { onChange(''); setOpen(false) }} type="button">×</button>
      )}
      {open && (
        <div className="emoji-picker-popup">
          <div className="emoji-picker-popup__groups">
            {EMOJI_GROUPS.map(g => (
              <div className="emoji-picker-popup__group" key={g.label}>
                <div className="emoji-picker-popup__group-label">{t(g.label)}</div>
                <div className="emoji-picker-popup__grid">
                  {g.emojis.map(e => (
                    <button className={`emoji-picker-popup__btn${value === e ? ' is-selected' : ''}`} key={e}
                      onClick={() => { onChange(e); setOpen(false) }} type="button">{e}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hover profile card ───────────────────────────────────────
function HoverCard({
  presence, onDm, onClose, onCancelClose,
  anchorRect,
}: {
  presence: PresenceUser
  onDm: (userId: number) => void
  onClose: () => void
  /** Dipanggil saat cursor masuk popup — cancel pending close timer
   *  yang di-schedule oleh onMouseLeave dari trigger row. Tanpa ini,
   *  popup hilang mid-traversal karena 200ms timer terus jalan. */
  onCancelClose: () => void
  anchorRect: DOMRect
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const cardWidth = 260
  const cardHeight = 200
  const margin = 10

  let left = anchorRect.right + 8
  let top  = anchorRect.top
  if (left + cardWidth > window.innerWidth - margin)  left = anchorRect.left - cardWidth - 8
  if (left < margin) left = margin
  if (top + cardHeight > window.innerHeight - margin) top = window.innerHeight - cardHeight - margin
  if (top < margin) top = margin

  const { text: timeText } = formatRelativeTime(presence.lastActivityAt)
  const slug = effectivePresenceSlug(presence.status, presence.lastActivityAt)

  const copyEmail = () => {
    const email = presence.user?.email
    if (!email) return
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch((err) => console.error('[Atlas] Silent failure in PresenceView.tsx:', err))
  }

  return createPortal(
    <div
      className="presence-hover-card"
      style={{ position: 'fixed', top, left, width: cardWidth, zIndex: 9999 }}
      onMouseEnter={onCancelClose}
      onMouseLeave={onClose}
    >
      <div className="presence-hover-card__header">
        <div className="presence-hover-card__avatar-wrap">
          <Avatar name={presence.user?.name ?? 'U'} />
          <span className={`presence-dot presence-dot--${slug} presence-hover-card__dot`} />
        </div>
        <div className="presence-hover-card__meta">
          <div className="presence-hover-card__name">{presence.user?.name ?? t('Unknown')}</div>
          {presence.user?.positionTitle && (
            <div className="presence-hover-card__position">{presence.user.positionTitle}</div>
          )}
        </div>
      </div>

      <div className="presence-hover-card__body">
        {(presence.user?.unit || presence.user?.directorate) && (
          <div className="presence-hover-card__org">
            {presence.user.directorate?.name}
            {presence.user.unit && presence.user.directorate && <span> › </span>}
            {presence.user.unit?.name}
          </div>
        )}
        {presence.user?.email && (
          <button
            className={`presence-hover-card__email-btn${copied ? ' is-copied' : ''}`}
            onClick={copyEmail}
            title={t('Click to copy email')}
            type="button"
          >
            <span>{presence.user.email}</span>
            <span className="presence-hover-card__copy-hint">
              {copied ? t('✓ Copied!') : t('Copy')}
            </span>
          </button>
        )}
        <div className="presence-hover-card__status-row">
          {statusBadge(presence.status)}
          {presence.statusMessage && (
            <span className="presence-hover-card__msg">
              {presence.statusEmoji ? `${resolveEmoji(presence.statusEmoji)} ` : ''}{presence.statusMessage}
            </span>
          )}
        </div>
        <div className="presence-hover-card__time">{t('Active {{time}}', { time: timeText })}</div>
      </div>

      {presence.userId && (
        <div className="presence-hover-card__footer">
          <button
            className="presence-hover-card__dm-btn"
            onClick={() => onDm(presence.userId)}
            type="button"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M14 2H2C1.45 2 1 2.45 1 3v9c0 .55.45 1 1 1h2v2.5l3.5-2.5H14c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
            {t('Send DM')}
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

// ── Grouping logic ───────────────────────────────────────────
type UnitGroup        = { unitId: number | null; unitName: string; users: PresenceUser[] }
type DirectorateGroup = { dirId: number | null; dirName: string; directMembers: PresenceUser[]; units: UnitGroup[] }

function buildGroups(presence: PresenceUser[], sortMap: Map<string, SortMode>): DirectorateGroup[] {
  const dirMap = new Map<string, {
    dirId: number | null; dirName: string
    directMembers: PresenceUser[]
    unitMap: Map<string, { unitId: number | null; unitName: string; users: PresenceUser[] }>
  }>()

  for (const u of presence) {
    const dirId   = u.user?.directorate?.id ?? null
    const dirName = u.user?.directorate?.name ?? i18n.t('Other')
    const dirKey  = dirId != null ? String(dirId) : '__none__'
    const unitId  = u.user?.unit?.id ?? null

    if (!dirMap.has(dirKey)) dirMap.set(dirKey, { dirId, dirName, directMembers: [], unitMap: new Map() })
    const dir = dirMap.get(dirKey)!

    // Users with no unit go directly under the directorate header
    if (unitId === null) {
      dir.directMembers.push(u)
      continue
    }

    const unitName = u.user?.unit?.name ?? i18n.t('No Unit')
    const unitKey  = String(unitId)
    if (!dir.unitMap.has(unitKey)) dir.unitMap.set(unitKey, { unitId, unitName, users: [] })
    dir.unitMap.get(unitKey)!.users.push(u)
  }

  const dirs: DirectorateGroup[] = []
  for (const { dirId, dirName, directMembers, unitMap } of dirMap.values()) {
    const units: UnitGroup[] = []
    for (const { unitId, unitName, users } of unitMap.values()) {
      const uKey = `unit-${unitId}`
      const sort = sortMap.get(uKey) ?? 'status'
      const sorted = [...users].sort((a, b) => {
        if (sort === 'name') return (a.user?.name ?? '').localeCompare(b.user?.name ?? '')
        // Tier 1: status (active first)
        const statusDiff = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)
        if (statusDiff !== 0) return statusDiff
        // Tier 2: role rank (senior first — KASUBDIV → ASISTEN → OFFICER)
        const rankDiff = roleRank(b.user?.roleType) - roleRank(a.user?.roleType)
        if (rankDiff !== 0) return rankDiff
        // Tier 3: alphabetical
        return (a.user?.name ?? '').localeCompare(b.user?.name ?? '')
      })
      units.push({ unitId, unitName, users: sorted })
    }
    units.sort((a, b) => {
      const d = b.users.filter(isActive).length - a.users.filter(isActive).length
      return d !== 0 ? d : a.unitName.localeCompare(b.unitName)
    })
    // Sort direct members: status → role rank → name
    const sortedDirectMembers = [...directMembers].sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)
      if (statusDiff !== 0) return statusDiff
      const rankDiff = roleRank(b.user?.roleType) - roleRank(a.user?.roleType)
      if (rankDiff !== 0) return rankDiff
      return (a.user?.name ?? '').localeCompare(b.user?.name ?? '')
    })
    dirs.push({ dirId, dirName, directMembers: sortedDirectMembers, units })
  }

  dirs.sort((a, b) => {
    if (a.dirId === null && b.dirId !== null) return 1
    if (a.dirId !== null && b.dirId === null) return -1
    const da = a.units.reduce((s, u) => s + u.users.filter(isActive).length, 0)
    const db = b.units.reduce((s, u) => s + u.users.filter(isActive).length, 0)
    return db - da || a.dirName.localeCompare(b.dirName)
  })

  return dirs
}

// ── Toast ─────────────────────────────────────────────────────
function Toast({ msg, isError, onDone }: { msg: string; isError?: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(
    <div className={`presence-toast${isError ? ' presence-toast--error' : ''}`}>{msg}</div>,
    document.body,
  )
}

// ── Main view ────────────────────────────────────────────────
export function PresenceView() {
  const { t } = useTranslation()
  const { presence, currentUser, presenceDraft, setPresenceDraft, setPresence, setSelectedChannelId, setSelectedThreadId, loadOverview } = useWorkspace()
  const navigate  = useInertiaNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  // Tab Activity = leaderboard jam-aktif SEMUA user (data surveilans). Endpoint
  // /analytics/user-activity di-gate canManageUsers (admin/superadmin), jadi
  // non-admin selalu kena 403. Sembunyikan tab-nya agar mereka tak melihat tab
  // yang pasti gagal — mirror gate backend lewat isAdmin.
  const { isAdmin } = useRoleAccess()

  // ── Tab ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PresenceTab>('kehadiran')

  // ── UI state ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery]   = useState('')
  const [filterMode, setFilterMode]     = useState<FilterMode>('all')
  const [density, setDensity]           = useState<Density>('comfortable')
  const [collapsedDirs, setCollapsedDirs]   = useState<Set<string>>(new Set())
  const [collapsedUnits, setCollapsedUnits] = useState<Set<string>>(new Set())
  const [expandedOffline, setExpandedOffline] = useState<Set<string>>(new Set())
  const [unitSortMap, setUnitSortMap]   = useState<Map<string, SortMode>>(new Map())
  const manuallyToggledUnits = useRef<Set<string>>(new Set())
  const manuallyToggledDirs  = useRef<Set<string>>(new Set())

  // Hover card
  const [hovered, setHovered] = useState<{ user: PresenceUser; rect: DOMRect } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // OOO date
  const [oooDate, setOooDate] = useState('')
  const isOooActive = presenceDraft.statusEmoji === '🏖️' && presenceDraft.statusMessage.startsWith('OOO')
  // OOO baru dipilih (template "… s/d …") tapi tanggal kembali belum diisi.
  const isOooMissingDate = isOooActive && presenceDraft.statusMessage.endsWith('…')

  // Self-heal stale OFFLINE: kalau draft = OFFLINE tapi bukan dari OOO (mis. data lama
  // sebelum opsi manual "Offline" dihapus), normalize ke ONLINE. OFFLINE sekarang
  // murni derived (lihat atlas:ghost-cleanup) atau intentional via OOO preset.
  useEffect(() => {
    if (presenceDraft.status === 'OFFLINE' && !isOooActive) {
      setPresenceDraft(cur => ({ ...cur, status: 'ONLINE' }))
    }
  }, [presenceDraft.status, isOooActive, setPresenceDraft])

  // ── Flash detection (SSE changes) ────────────────────────
  const prevStatusRef = useRef<Map<number, PresenceStatus>>(new Map())
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    const prev = prevStatusRef.current
    const changed = new Set<number>()
    for (const p of presence) {
      const prevStatus = prev.get(p.userId)
      if (prevStatus !== undefined && prevStatus !== p.status) changed.add(p.userId)
      prev.set(p.userId, p.status)
    }
    if (changed.size > 0) {
      setFlashIds(changed)
      const t = setTimeout(() => setFlashIds(new Set()), 1200)
      return () => clearTimeout(t)
    }
  }, [presence])

  // ── Skeleton: show until first presence data arrives ─────
  const [presenceInitialized, setPresenceInitialized] = useState(false)
  useEffect(() => {
    if (presence.length > 0) setPresenceInitialized(true)
  }, [presence])
  const isLoadingPresence = !presenceInitialized

  // ── Local submit with loading + toast ────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null)

  const localHandleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return
    if (isOooMissingDate) {
      setToast({ msg: t('Enter a return date for Out of office first'), error: true })
      return
    }
    setIsSubmitting(true)
    try {
      await api.put('/users/me/status', presenceDraft)
      // Optimistic update row sendiri di main panel. Sejak realtime pindah ke
      // polling 2s (lihat memory project-sse-dropped-polling-only), tanpa ini
      // user lihat panel utama "tertinggal" sampai poll cycle berikutnya.
      if (currentUser) {
        const nowIso = new Date().toISOString()
        setPresence(prev => prev.map(p =>
          p.userId === currentUser.id
            ? { ...p, status: presenceDraft.status, statusEmoji: presenceDraft.statusEmoji, statusMessage: presenceDraft.statusMessage, lastActivityAt: nowIso }
            : p
        ))
      }
      setToast({ msg: t('Status updated successfully ✓'), error: false })
    } catch {
      setToast({ msg: t('Failed to update status — try again'), error: true })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Keyboard: `/` to focus search ────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // ── OOO date → message sync ───────────────────────────────
  useEffect(() => {
    if (!oooDate || !isOooActive) return
    const d = new Date(oooDate)
    const formatted = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    setPresenceDraft(cur => ({ ...cur, statusMessage: `OOO — until ${formatted}` }))
  }, [oooDate, isOooActive])

  // ── Filter ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = presence
    if (filterMode === 'active')    list = list.filter(isActive)
    if (filterMode === 'available') list = list.filter(isAvailable)
    if (filterMode === 'mine')      list = list.filter(u => u.user?.unit?.id != null && u.user.unit.id === currentUser?.unit?.id)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(u =>
        (u.user?.name ?? '').toLowerCase().includes(q) ||
        (u.user?.unit?.name ?? '').toLowerCase().includes(q) ||
        (u.user?.positionTitle ?? '').toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q)
      )
    }
    return list
  }, [presence, filterMode, searchQuery, currentUser])

  const groups = useMemo(() => buildGroups(filtered, unitSortMap), [filtered, unitSortMap])

  // ── Auto-collapse all-offline units & directorates ────────
  useEffect(() => {
    setCollapsedUnits(prev => {
      const next = new Set(prev)
      for (const dir of groups) {
        for (const unit of dir.units) {
          const key = unitKeyFor(dir, unit)
          if (manuallyToggledUnits.current.has(key)) continue
          if (unit.users.every(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'offline')) next.add(key); else next.delete(key)
        }
      }
      return next
    })
    setCollapsedDirs(prev => {
      const next = new Set(prev)
      for (const dir of groups) {
        const key = dirKeyFor(dir)
        if (manuallyToggledDirs.current.has(key)) continue
        const allOffline = dir.directMembers.every(p => effectivePresenceSlug(p.status, p.lastActivityAt) === 'offline')
                        && dir.units.every(u => u.users.every(p => effectivePresenceSlug(p.status, p.lastActivityAt) === 'offline'))
        if (allOffline) next.add(key); else next.delete(key)
      }
      return next
    })
  }, [groups])

  const dirKeyFor  = (d: DirectorateGroup) => d.dirId != null ? `dir-${d.dirId}` : 'dir-none'
  const unitKeyFor = (d: DirectorateGroup, u: UnitGroup) => u.unitId != null ? `unit-${u.unitId}` : `unit-none-${dirKeyFor(d)}`

  const toggleDir = (key: string) => {
    manuallyToggledDirs.current.add(key)
    setCollapsedDirs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const toggleUnit = (key: string) => {
    manuallyToggledUnits.current.add(key)
    setCollapsedUnits(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const toggleUnitSort = (key: string) => {
    setUnitSortMap(prev => {
      const n = new Map(prev)
      n.set(key, (n.get(key) ?? 'status') === 'status' ? 'name' : 'status')
      return n
    })
  }
  const toggleExpandOffline = (key: string) => {
    setExpandedOffline(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // ── Hover card handlers ───────────────────────────────────
  const handleHoverStart = (user: PresenceUser, rect: DOMRect) => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered({ user, rect }), 300)
  }
  const handleHoverEnd = () => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(null), 200)
  }
  // Cursor masuk popup → batalkan close timer supaya popup tetap aktif.
  // Popup tetap mounted sampai onMouseLeave-nya sendiri schedule ulang close.
  const handleCancelHoverEnd = () => {
    clearTimeout(hoverTimer.current)
  }
  // ── DM ────────────────────────────────────────────────────
  // Mirror pattern dari ChannelsViewWrapper.handleOpenDM. Wajib loadOverview
  // dulu supaya channels list di workspace context ter-refresh dengan DM yang
  // mungkin baru dibuat — tanpa ini, setSelectedChannelId menunjuk ke ID yang
  // belum ada di channels list, jadi ChannelsView mount tapi tidak bisa render
  // channel yang dipilih (hanya navigate tanpa buka chat).
  const handleOpenDm = async (userId: number) => {
    try {
      const result = await api.post<{ data: { id: number } }>('/dm/open', { userId })
      await loadOverview('refresh')
      setSelectedChannelId(result.data.id)
      setSelectedThreadId(null)
      navigate('/channels')
    } catch { /* non-fatal */ }
  }

  // ── Stats (use effective slug to match visual state) ──────
  const online  = presence.filter(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'online').length
  const away    = presence.filter(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'away').length
  const dnd     = presence.filter(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'do-not-disturb').length
  const offline = presence.filter(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'offline').length

  const applyPreset = (p: typeof PRESETS[number]) => {
    setPresenceDraft({ status: p.status, statusEmoji: p.emoji, statusMessage: p.message })
    if (p.isOoo) setOooDate('')
  }

  const filterLabels: Record<FilterMode, string> = {
    all: t('All'), active: t('Active only'), available: t('Available'), mine: t('My unit'),
  }

  return (
    <div className="ds presence-v2 view-presence">
      {/* `ds-stagger`: Phase 3 motion standardization. Modal sheet & confirm
          di page ini semua portal-mounted (createPortal). Modal-safe. */}
      <div className="presence-v2__inner ds-stagger">
      {/* ── Page header (design-system PageHeader) ── */}
      <PageHeader
        title={t('Presence')}
        subtitle={
          activeTab === 'kehadiran'
            ? t('Team presence status and activity in real time.')
            : t('Active duration per user based on actual usage time.')
        }
        actions={
          activeTab === 'kehadiran' ? (
            <div className="view-toolbar__stats presence-toolbar-stats">
              <span className="presence-toolbar-stat presence-toolbar-stat--online">{online} <em>{t('online')}</em></span>
              <span className="presence-sep">·</span>
              <span className="presence-toolbar-stat presence-toolbar-stat--away">{away} <em>{t('away')}</em></span>
              <span className="presence-sep">·</span>
              <span className="presence-toolbar-stat presence-toolbar-stat--dnd">{dnd} <em>{t('heads-down')}</em></span>
              <span className="presence-sep">·</span>
              <span className="presence-toolbar-stat presence-toolbar-stat--offline">{offline} <em>{t('offline')}</em></span>
            </div>
          ) : null
        }
      />

      {/* ── Tab nav ── */}
      <div className="presence-tab-nav">
        <button
          className={`presence-tab-btn${activeTab === 'kehadiran' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('kehadiran')}
          type="button"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {t('Presence')}
        </button>
        {isAdmin && (
          <button
            className={`presence-tab-btn${activeTab === 'aktivitas' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('aktivitas')}
            type="button"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 12l3-4 3 2 3-5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('Activity')}
          </button>
        )}
      </div>

      {isAdmin && activeTab === 'aktivitas' && <ActivityView />}

      {activeTab === 'kehadiran' && <>

      {/* ── Controls bar ── */}
      <div className="presence-controls-bar">
        <div className="presence-search-wrap">
          <svg className="presence-search-wrap__icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={searchRef}
            className="presence-search-wrap__input"
            placeholder={t('Search name, unit, position… [/]')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="presence-search-wrap__clear" onClick={() => setSearchQuery('')} type="button">×</button>
          )}
        </div>

        <div className="presence-filter-tabs">
          {(['all', 'active', 'available', 'mine'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              className={`presence-filter-tab${filterMode === mode ? ' is-active' : ''}`}
              onClick={() => setFilterMode(mode)}
              type="button"
            >
              {filterLabels[mode]}
            </button>
          ))}
        </div>

        <div className="presence-controls-bar__actions">
          <button
            className={`presence-density-btn${density === 'compact' ? ' is-active' : ''}`}
            onClick={() => setDensity(d => d === 'comfortable' ? 'compact' : 'comfortable')}
            title={density === 'comfortable' ? t('Compact view') : t('Normal view')}
            type="button"
          >
            {density === 'comfortable'
              ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2.5" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="11.5" width="14" height="2" rx="1" fill="currentColor"/></svg>
              : <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="1.4" rx=".7" fill="currentColor"/><rect x="1" y="4.8" width="14" height="1.4" rx=".7" fill="currentColor"/><rect x="1" y="8.6" width="14" height="1.4" rx=".7" fill="currentColor"/><rect x="1" y="12.4" width="14" height="1.4" rx=".7" fill="currentColor"/></svg>
            }
          </button>
        </div>
      </div>

      <div className="presence-workspace">
        {/* ── Main list ── */}
        <div className={`presence-main${density === 'compact' ? ' presence-main--compact' : ''}`}>
          {/* Skeleton loading */}
          {isLoadingPresence && (
            <div className="presence-skeleton-list">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="presence-skeleton-row">
                  <div className="presence-skeleton-avatar" />
                  <div className="presence-skeleton-info">
                    <div className="presence-skeleton-name" />
                    <div className="presence-skeleton-sub" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoadingPresence && filtered.length === 0 && presence.length > 0 && (
            <div className="section-block">
              <SectionState title={t('No results')} text={t('Try adjusting the filter or search query.')} />
            </div>
          )}

          {!isLoadingPresence && groups.map(dir => {
            const dKey           = dirKeyFor(dir)
            const isDirCollapsed = collapsedDirs.has(dKey)
            const dirActiveCount = dir.units.reduce((s, u) => s + u.users.filter(isActive).length, 0)
                                 + dir.directMembers.filter(isActive).length
            const dirTotalCount  = dir.units.reduce((s, u) => s + u.users.length, 0)
                                 + dir.directMembers.length

            return (
              <div className="presence-directorate" key={dKey}>
                <button className="presence-directorate__header" onClick={() => toggleDir(dKey)} type="button">
                  <span className="presence-directorate__chevron">{isDirCollapsed ? '▸' : '▾'}</span>
                  <span className="presence-directorate__name">{dir.dirName}</span>
                  <span className="presence-directorate__stats">
                    {dirActiveCount > 0 && <span className="presence-dir-badge presence-dir-badge--active">{t('{{count}} active', { count: dirActiveCount })}</span>}
                    <span className="presence-dir-badge">{t('{{count}} members', { count: dirTotalCount })}</span>
                  </span>
                </button>

                {/* Smooth collapse wrapper */}
                <div className={`presence-directorate__body-wrap${isDirCollapsed ? ' is-collapsed' : ''}`}>
                  <div className="presence-directorate__body">

                    {/* Direct members (BOD/no-unit) — rendered flat, no unit sub-group */}
                    {dir.directMembers.length > 0 && (
                      <div className="presence-list presence-dir__direct-members">
                        {dir.directMembers.map(u => (
                          <PresenceRow key={u.userId} presence={u} compact={density === 'compact'}
                            highlightQuery={searchQuery}
                            isFlashing={flashIds.has(u.userId)}
                            onDm={u.userId !== currentUser?.id ? handleOpenDm : undefined}
                            onHover={handleHoverStart} onHoverEnd={handleHoverEnd}
                          />
                        ))}
                      </div>
                    )}

                    {dir.units.map(unit => {
                      const uKey            = unitKeyFor(dir, unit)
                      const isUnitCollapsed = collapsedUnits.has(uKey)
                      const allOffline      = unit.users.every(u => effectivePresenceSlug(u.status, u.lastActivityAt) === 'offline')
                      const sortMode        = unitSortMap.get(uKey) ?? 'status'
                      const activeUsers     = unit.users.filter(isActive)
                      const offlineUsers    = unit.users.filter(u => !isActive(u))
                      const isOfflineExpanded = expandedOffline.has(uKey)
                      const visibleOffline  = isOfflineExpanded ? offlineUsers : offlineUsers.slice(0, OFFLINE_SHOW_DEFAULT)
                      const hiddenCount     = offlineUsers.length - OFFLINE_SHOW_DEFAULT

                      return (
                        <div className={`presence-unit${allOffline ? ' presence-unit--all-offline' : ''}`} key={uKey}>
                          <div className="presence-unit__header-row">
                            <button className="presence-unit__header" onClick={() => toggleUnit(uKey)} type="button">
                              <span className="presence-unit__chevron">{isUnitCollapsed ? '▸' : '▾'}</span>
                              <span className="presence-unit__name">{unit.unitName}</span>
                              <UnitStatBar users={unit.users} />
                            </button>
                            <button
                              className={`presence-unit__sort-btn${sortMode === 'name' ? ' is-active' : ''}`}
                              onClick={() => toggleUnitSort(uKey)}
                              title={sortMode === 'status' ? t('Sort A→Z') : t('Sort by status')}
                              type="button"
                            >
                              {sortMode === 'status'
                                ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 8h6M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                : <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l4-3 4 3M8 1v10M4 12l4 3 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              }
                            </button>
                          </div>

                          {/* Smooth collapse wrapper for unit content */}
                          <div className={`presence-unit__collapsible${isUnitCollapsed ? ' is-collapsed' : ''}`}>
                            <div className="presence-unit__collapsible-inner">
                              <UnitProgressBar users={unit.users} />
                              <div className="presence-list presence-unit__list">
                                {sortMode === 'status' ? (
                                  <>
                                    {activeUsers.map(u => (
                                      <PresenceRow key={u.userId} presence={u} compact={density === 'compact'}
                                        highlightQuery={searchQuery}
                                        isFlashing={flashIds.has(u.userId)}
                                        onDm={u.userId !== currentUser?.id ? handleOpenDm : undefined}
                                        onHover={handleHoverStart} onHoverEnd={handleHoverEnd}
                                      />
                                    ))}
                                    {visibleOffline.map(u => (
                                      <PresenceRow key={u.userId} presence={u} compact={density === 'compact'}
                                        highlightQuery={searchQuery}
                                        isFlashing={flashIds.has(u.userId)}
                                        onDm={u.userId !== currentUser?.id ? handleOpenDm : undefined}
                                        onHover={handleHoverStart} onHoverEnd={handleHoverEnd}
                                      />
                                    ))}
                                    {hiddenCount > 0 && !isOfflineExpanded && (
                                      <button className="presence-show-more" onClick={() => toggleExpandOffline(uKey)} type="button">
                                        {t('Show {{count}} more offline', { count: hiddenCount })}
                                      </button>
                                    )}
                                    {isOfflineExpanded && offlineUsers.length > OFFLINE_SHOW_DEFAULT && (
                                      <button className="presence-show-more" onClick={() => toggleExpandOffline(uKey)} type="button">
                                        {t('Show less')}
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  unit.users.map(u => (
                                    <PresenceRow key={u.userId} presence={u} compact={density === 'compact'}
                                      highlightQuery={searchQuery}
                                      isFlashing={flashIds.has(u.userId)}
                                      onDm={u.userId !== currentUser?.id ? handleOpenDm : undefined}
                                      onHover={handleHoverStart} onHoverEnd={handleHoverEnd}
                                    />
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

        </div>

        {/* ── Sidebar: update status ── */}
        <aside className="presence-sidebar right-rail">
          <div className="status-panel">
            {/* Header */}
            <div className="status-panel__header">
              <span className="status-panel__title">{t('My Status')}</span>
              <span className={`status-panel__dot status-panel__dot--${presenceDraft.status.toLowerCase().replace('_', '-')}`} />
            </div>

            {/* Live preview */}
            <div className="status-panel__preview">
              <span className="status-panel__preview-emoji">
                {presenceDraft.statusEmoji ? resolveEmoji(presenceDraft.statusEmoji) : '💬'}
              </span>
              <div className="status-panel__preview-text">
                <span className="status-panel__preview-msg">
                  {presenceDraft.statusMessage || <em className="status-panel__preview-empty">{t('No message')}</em>}
                </span>
                {statusBadge(presenceDraft.status)}
              </div>
            </div>

            {/* Quick set */}
            <div className="status-panel__section-label">{t('Quick Set')}</div>
            <div className="status-presets__list">
              {PRESETS.map(p => {
                const isActive = presenceDraft.statusEmoji === p.emoji
                              && presenceDraft.statusMessage.startsWith(p.isOoo ? 'OOO' : p.message)
                const statusSlug = p.status.toLowerCase().replace('_', '-')
                return (
                  <button
                    className={`status-preset-row${isActive ? ' is-active' : ''}`}
                    key={p.message} onClick={() => applyPreset(p)} type="button"
                  >
                    <span className="status-preset-row__emoji">{p.emoji}</span>
                    <span className="status-preset-row__label">{p.isOoo ? t('Out of office') : t(p.message)}</span>
                    <span className={`status-preset-row__dot status-preset-row__dot--${statusSlug}`} />
                  </button>
                )
              })}
            </div>

            {/* OOO date picker */}
            {isOooActive && (
              <div className="ooo-date-wrap">
                <label className="ooo-date-wrap__label">{t('Return date')}</label>
                <input
                  className="ooo-date-wrap__input"
                  type="date"
                  value={oooDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setOooDate(e.target.value)}
                />
              </div>
            )}

            {/* Divider */}
            <div className="status-panel__divider" />

            {/* Form */}
            <form className="status-form" onSubmit={localHandleSubmit}>
              {/* Status + Emoji on same row */}
              <div className="status-form__row">
                <label className="status-form__label status-form__label--grow">
                  {t('Status')}
                  {isOooActive ? (
                    <div className="status-form__ooo-indicator" title={t('Status is set by the Out of office preset. Choose another status in Quick Set to exit OOO.')}>
                      <span className="status-form__ooo-indicator-emoji">🏖️</span>
                      <span className="status-form__ooo-indicator-label">{t('Out of office')}</span>
                    </div>
                  ) : (
                    <select
                      className="status-form__select"
                      onChange={e => setPresenceDraft(cur => ({ ...cur, status: e.target.value as PresenceStatus }))}
                      value={presenceDraft.status === 'OFFLINE' ? 'ONLINE' : presenceDraft.status}
                    >
                      <option value="ONLINE">🟢 {t('Online')}</option>
                      <option value="AWAY">🟡 {t('Away')}</option>
                      <option value="DO_NOT_DISTURB">🟣 {t('Heads-down')}</option>
                    </select>
                  )}
                </label>
                <label className="status-form__label">
                  {t('Emoji')}
                  <EmojiPicker onChange={v => setPresenceDraft(cur => ({ ...cur, statusEmoji: v }))} value={presenceDraft.statusEmoji} />
                </label>
              </div>

              <label className="status-form__label">
                {t('Status message')}
                <input
                  className="status-form__input"
                  maxLength={120}
                  onChange={e => setPresenceDraft(cur => ({ ...cur, statusMessage: e.target.value }))}
                  placeholder={t('What are you up to?')}
                  value={presenceDraft.statusMessage}
                />
              </label>

              <button className="presence-update-btn" disabled={isSubmitting || isOooMissingDate} type="submit">
                {isSubmitting && <span className="presence-update-btn__spinner" />}
                {isSubmitting ? t('Saving…') : isOooMissingDate ? t('Enter a return date first') : t('Update Status')}
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* ── Hover card portal ── */}
      {hovered && (
        <HoverCard
          presence={hovered.user}
          anchorRect={hovered.rect}
          onDm={handleOpenDm}
          onClose={handleHoverEnd}
          onCancelClose={handleCancelHoverEnd}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast msg={toast.msg} isError={toast.error} onDone={() => setToast(null)} />
      )}

      </>}
      </div>
    </div>
  )
}

export default PresenceView
