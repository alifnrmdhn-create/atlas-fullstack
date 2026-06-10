// @refresh reset
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CommentItem, PresenceUser } from '../types'
import { useEscKey } from '../hooks/useEscKey'

type IconName =
  | 'pulse'
  | 'alert'
  | 'target'
  | 'users'
  | 'mail'
  | 'stack'
  | 'shield'
  | 'calendar'
  | 'message'
  | 'empty'
  | 'trend'

type Tone = 'default' | 'critical' | 'warn' | 'positive'
type AvatarTone = 'purple' | 'blue' | 'green' | 'yellow' | 'red' | 'cyan' | 'pink' | 'orange'

const ICON_PATHS: Record<IconName, ReactNode> = {
  pulse: (
    <>
      <path d="M3 12h4l2.3-5 3.4 10 2.1-5H21" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 21 19H3L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M22 12h-3" />
      <path d="M12 22v-3" />
      <path d="M2 12h3" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
      <circle cx="9.5" cy="8" r="3" />
      <path d="M20 20v-1.3a3.3 3.3 0 0 0-2.4-3.2" />
      <path d="M16.5 5.2a3 3 0 0 1 0 5.6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m5 7 7 6 7-6" />
    </>
  ),
  stack: (
    <>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19 6v5c0 4.7-2.8 8.5-7 10-4.2-1.5-7-5.3-7-10V6l7-3Z" />
      <path d="m9.5 12 1.7 1.7 3.6-3.9" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h3" />
    </>
  ),
  message: (
    <>
      <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      <path d="M8 10h8" />
      <path d="M8 13h5" />
    </>
  ),
  empty: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </>
  ),
  trend: (
    <>
      <path d="M4 16 9 11l3 3 8-8" />
      <path d="M14 6h6v6" />
    </>
  ),
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const angleInRadians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  }
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

export function PanelHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose?: () => void }) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {onClose && (
        <button className="panel-close-btn" onClick={onClose} title="Close panel (Esc)" type="button">
          <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
          <kbd>Esc</kbd>
        </button>
      )}
    </div>
  )
}

export function CommentThreadList({
  comments,
  onReact,
  onReply,
  onDelete,
  currentUserId,
}: {
  comments: CommentItem[]
  onReact: (commentId: number) => void
  onReply: (commentId: number) => void
  onDelete?: (commentId: number) => void
  currentUserId?: number
}) {
  const topLevelComments = comments.filter((comment) => !comment.parentCommentId)

  if (topLevelComments.length === 0) {
    return <SectionState title="No notes yet" text="Write a decision, follow-up, or escalation note below." compact />
  }

  const canDelete = (comment: CommentItem) => !!onDelete && (comment.createdBy === currentUserId)

  return (
    <div className="comment-thread-list">
      {topLevelComments.map((comment) => (
        <article className="comment-card" key={comment.id}>
          <div className="message-card__meta">
            <div>
              <strong>{comment.authorName ?? 'Unknown'}</strong>
              <span>{comment.authorRole ?? 'Contributor'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{formatDate(comment.createdAt)}</span>
              {canDelete(comment) && (
                <button
                  className="ghost-button"
                  onClick={() => onDelete!(comment.id)}
                  style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 4px' }}
                  title="Delete comment"
                  type="button"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <RichTextPreview emptyText="" value={comment.commentText} />
          <div className="message-card__actions">
            <button className="ghost-button" onClick={() => onReact(comment.id)} type="button">
              👍 {comment.reactions[':thumbsup:']?.length ?? 0}
            </button>
            <button className="ghost-button" onClick={() => onReply(comment.id)} type="button">
              Reply {comment.replyCount > 0 ? `(${comment.replyCount})` : ''}
            </button>
            {comment.isPinned ? <span className="subtle">Pinned</span> : null}
            {comment.isEdited ? <span className="subtle">Edited</span> : null}
          </div>

          {comments.filter((reply) => reply.parentCommentId === comment.id).length > 0 ? (
            <div className="comment-replies">
              {comments
                .filter((reply) => reply.parentCommentId === comment.id)
                .map((reply) => (
                  <article className="comment-reply" key={reply.id}>
                    <div className="message-card__meta">
                      <div>
                        <strong>{reply.authorName ?? 'Unknown'}</strong>
                        <span>{reply.authorRole ?? 'Contributor'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{formatDate(reply.createdAt)}</span>
                        {canDelete(reply) && (
                          <button
                            className="ghost-button"
                            onClick={() => onDelete!(reply.id)}
                            style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 4px' }}
                            title="Delete comment"
                            type="button"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <RichTextPreview emptyText="" value={reply.commentText} />
                    <div className="message-card__actions">
                      <button className="ghost-button" onClick={() => onReact(reply.id)} type="button">
                        👍 {reply.reactions[':thumbsup:']?.length ?? 0}
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}

export function SvgIcon({
  name,
  className = '',
}: {
  name: IconName
  className?: string
}) {
  return (
    <span className={`svg-icon ${className}`.trim()} aria-hidden="true">
      <svg fill="none" viewBox="0 0 24 24">
        {ICON_PATHS[name]}
      </svg>
    </span>
  )
}

export function MiniDonut({
  segments,
  value,
  label,
}: {
  segments: Array<{ label: string; value: number; color: string }>
  value: string
  label: string
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const radius = 32
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="mini-donut">
      <svg className="mini-donut__chart" viewBox="0 0 96 96">
        <circle className="mini-donut__track" cx="48" cy="48" r={radius} />
        {total > 0
          ? segments.map((segment) => {
              const length = (segment.value / total) * circumference
              const dashOffset = -offset
              offset += length

              return (
                <circle
                  className="mini-donut__segment"
                  cx="48"
                  cy="48"
                  key={segment.label}
                  r={radius}
                  stroke={segment.color}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashOffset}
                />
              )
            })
          : null}
      </svg>
      <div className="mini-donut__center">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

export function GaugeArc({
  value,
  max = 20,
  tone = 'default',
}: {
  value: number
  max?: number
  tone?: 'default' | 'warn' | 'critical' | 'positive'
}) {
  const normalized = clamp(value / max, 0, 1)
  const endAngle = 180 * normalized
  const toneClass = tone === 'default' ? '' : ` gauge-arc--${tone}`

  return (
    <div className={`gauge-arc${toneClass}`}>
      <svg viewBox="0 0 120 72" aria-hidden="true">
        <path className="gauge-arc__track" d={describeArc(60, 60, 42, 270, 90)} />
        <path className="gauge-arc__value" d={describeArc(60, 60, 42, 270, 270 + endAngle)} />
      </svg>
      <strong>{value}</strong>
    </div>
  )
}

export function RiskBar({
  value,
  max = 20,
  label,
}: {
  value: number
  max?: number
  label?: string
}) {
  const pct = Math.round(clamp((value / max) * 100, 0, 100))
  const tone = value >= 15 ? 'critical' : value >= 8 ? 'warn' : 'positive'

  return (
    <div className={`risk-bar risk-bar--${tone}`}>
      <div className="risk-bar__track">
        <div className="risk-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="risk-bar__meta">
        <strong>{value}</strong>
        <span>{label ?? `Risk ${pct}%`}</span>
      </div>
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: number
  hint: string
  icon?: IconName
  tone?: Tone
}) {
  return (
    <article className={`stat-card ${tone !== 'default' ? `stat-card--${tone}` : ''}`.trim()}>
      <div className="stat-card__head">
        <p className="stat-card__label">{label}</p>
        {icon ? <SvgIcon className="stat-card__icon" name={icon} /> : null}
      </div>
      <div className="stat-card__body">
        <strong className="stat-card__value">{value}</strong>
        <span className="stat-card__sub">{hint}</span>
      </div>
    </article>
  )
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

const HEALTH_LABELS: Record<string, string> = {
  GREEN:   'On Track',
  YELLOW:  'At Risk',
  RED:     'Delayed',
  OVERDUE: 'Overdue',
}
export function HealthPill({ status, title }: { status: 'GREEN' | 'YELLOW' | 'RED' | 'OVERDUE'; title?: string }) {
  return (
    <span className={`health-pill health-pill--${status.toLowerCase()}`} title={title}>
      {HEALTH_LABELS[status] ?? status}
    </span>
  )
}

const AVATAR_TONES: AvatarTone[] = ['purple', 'blue', 'green', 'yellow', 'red', 'cyan', 'pink', 'orange']

function avatarTone(name: string): AvatarTone {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  const tone = avatarTone(name)
  const dimension = Math.max(18, size)
  const fontSize = Math.max(9, Math.round(dimension * 0.34))
  return (
    <span
      className="avatar"
      data-tone={tone}
      style={{ width: dimension, height: dimension, fontSize }}
    >
      {initials}
    </span>
  )
}

const PRESENCE_STATUS_LABEL: Record<string, string> = {
  ONLINE: 'Online',
  AWAY: 'Away',
  DO_NOT_DISTURB: 'Heads-down',
  OFFLINE: 'Offline',
}

const ACTIVE_THRESHOLD_MS  = 5  * 60_000  // 5 min  → ONLINE demoted to away
const OFFLINE_THRESHOLD_MS = 10 * 60_000  // 10 min → any non-OFFLINE demoted to offline (matches backend GhostCleanup)

export function effectivePresenceSlug(status: string, lastActivityAt: string): string {
  if (status === 'OFFLINE') return 'offline'
  const msSince = Date.now() - new Date(lastActivityAt).getTime()
  if (msSince > OFFLINE_THRESHOLD_MS) return 'offline'
  if (msSince <= ACTIVE_THRESHOLD_MS && status !== 'DO_NOT_DISTURB') return 'online'
  if (status === 'ONLINE' && msSince > ACTIVE_THRESHOLD_MS) return 'away'
  return status.toLowerCase().replace(/_/g, '-')
}

function UserAvatar({ avatarUrl, name, className }: { avatarUrl?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  // Filter out garbage values (DB sometimes stores 2-letter initials instead of a URL).
  // A real avatar must be an absolute URL, root-absolute path, or data: URI — never
  // a bare token that the browser would interpret as a relative path and 404 on.
  const looksLikeUrl = !!avatarUrl && /^(https?:\/\/|\/|data:)/.test(avatarUrl)
  if (looksLikeUrl && !failed) {
    return (
      <img
        className={className ?? 'presence-row__avatar-img'}
        src={avatarUrl}
        alt={name}
        onError={() => setFailed(true)}
      />
    )
  }
  return <Avatar name={name} />
}

type TimeAge = 'fresh' | 'today' | 'old'

export function formatRelativeTime(isoString: string): { text: string; age: TimeAge } {
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60)  return { text: 'just now', age: 'fresh' }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)  return { text: `${minutes}m ago`, age: 'fresh' }
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return { text: `${hours}h ago`, age: 'today' }
  const days = Math.floor(hours / 24)
  if (days < 7)      return { text: `${days}d ago`, age: 'old' }
  return { text: new Date(isoString).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }), age: 'old' }
}

export function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase()
          ? <mark key={i} className="presence-highlight">{part}</mark>
          : part
      )}
    </>
  )
}

export function PresenceRow({
  presence,
  onDm,
  onHover,
  onHoverEnd,
  compact = false,
  highlightQuery = '',
  isFlashing = false,
}: {
  presence: PresenceUser
  onDm?: (userId: number) => void
  onHover?: (user: PresenceUser, rect: DOMRect) => void
  onHoverEnd?: () => void
  compact?: boolean
  highlightQuery?: string
  isFlashing?: boolean
}) {
  const slug = effectivePresenceSlug(presence.status, presence.lastActivityAt)
  const isOffline = presence.status === 'OFFLINE'
  const { text: timeText, age } = formatRelativeTime(presence.lastActivityAt)

  const statusLine = presence.statusMessage
    ? `${presence.statusEmoji ? resolveEmoji(presence.statusEmoji) + ' ' : ''}${presence.statusMessage}`
    : `${PRESENCE_STATUS_LABEL[presence.status]}`

  const userName = presence.user?.name ?? 'User'
  const avatarEl = <UserAvatar avatarUrl={presence.user?.avatarUrl} name={userName} />

  const subParts = [
    !compact && presence.user?.positionTitle ? presence.user.positionTitle : null,
    statusLine,
  ].filter(Boolean)

  const timeTone = age === 'old' ? 'stale' : 'muted'

  return (
    <div
      className={`presence-row list-row presence-row--${slug}${compact ? ' presence-row--compact' : ''}${isFlashing ? ' presence-row--flashing' : ''}`}
      onMouseEnter={onHover ? (e) => onHover(presence, (e.currentTarget as HTMLDivElement).getBoundingClientRect()) : undefined}
      onMouseLeave={onHoverEnd}
    >
      <div className="presence-row__avatar-wrap">
        {avatarEl}
        <span className={`presence-dot presence-dot--${slug}`} />
      </div>
      <div className="presence-row__info">
        <div className={`presence-row__name${isOffline ? ' presence-row__name--offline' : ''}`}>
          <HighlightText text={userName} query={highlightQuery} />
        </div>
        <div className="presence-row__sub">
          {subParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="presence-row__sep">·</span>}
              {part}
            </span>
          ))}
          {!compact && subParts.length > 0 && (
            <>
              <span className="presence-row__sep">·</span>
              <span className={`presence-row__time presence-row__time--${timeTone}`}>{timeText}</span>
            </>
          )}
          {!compact && subParts.length === 0 && (
            <span className={`presence-row__time presence-row__time--${timeTone}`}>{timeText}</span>
          )}
        </div>
      </div>
      {onDm && (
        <button
          className="presence-row__dm-btn"
          onClick={(e) => { e.stopPropagation(); onDm(presence.userId) }}
          title={`Message ${userName}`}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M14 2H2C1.45 2 1 2.45 1 3v9c0 .55.45 1 1 1h2v2.5l3.5-2.5H14c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  text,
  icon = 'empty',
  compact = false,
}: {
  title: string
  text: string
  icon?: IconName
  compact?: boolean
}) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`.trim()}>
      <div className="empty-state__icon-wrap">
        <SvgIcon className="empty-state__icon" name={icon} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

/** Empty/loading state untuk section. Tone variants memberi context warna —
 * 'success' (positif, ✓ tidak ada masalah), 'info' (netral), 'warning'
 * (perhatian), 'default' (sparse, neutral). Icon accepts string emoji
 * (legacy) atau ReactNode (SVG). CTA optional menambah tindak lanjut. */
export function SectionState({
  title,
  text,
  compact = false,
  icon,
  tone = 'default',
  cta,
}: {
  title: string
  text: string
  compact?: boolean
  icon?: ReactNode
  tone?: 'default' | 'success' | 'info' | 'warning'
  cta?: { label: string; onClick: () => void } | { label: string; href: string }
}) {
  return (
    <div className={`section-state section-state--${tone}${compact ? ' section-state--compact' : ''}`}>
      {icon && <span className="section-state__icon">{icon}</span>}
      <strong>{title}</strong>
      <p>{text}</p>
      {cta && (
        'href' in cta ? (
          <a className="section-state__cta" href={cta.href}>{cta.label}</a>
        ) : (
          <button className="section-state__cta" onClick={cta.onClick} type="button">{cta.label}</button>
        )
      )}
    </div>
  )
}

export function InlineNotice({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'error'
}) {
  return <div className={`inline-notice inline-notice--${tone}`}>{children}</div>
}

export function SkeletonBlock({
  width = '100%',
  height = 14,
  className = '',
}: {
  width?: string
  height?: number
  className?: string
}) {
  return <div className={`skeleton-block ${className}`.trim()} style={{ width, height }} />
}

export function SkeletonStack({
  lines = [100, 86, 72],
  className = '',
}: {
  lines?: number[]
  className?: string
}) {
  return (
    <div className={`skeleton-stack ${className}`.trim()}>
      {lines.map((width, index) => (
        <SkeletonBlock height={index === 0 ? 16 : 12} key={`${width}-${index}`} width={`${width}%`} />
      ))}
    </div>
  )
}

// ── CollapsibleSection ────────────────────────────────────────────────────
// Sprint 2: extract pattern dari TaskDetailView ke primitive reusable.
// Persist state ke localStorage saat persistKey diberikan.
const COLLAPSE_STORAGE_PREFIX = 'atlas.collapsible.v1.'

function readCollapsedPref(persistKey?: string): boolean | null {
  if (!persistKey) return null
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_PREFIX + persistKey)
    if (raw === null) return null
    return raw === '1'
  } catch { return null }
}

function writeCollapsedPref(persistKey: string, collapsed: boolean) {
  try { localStorage.setItem(COLLAPSE_STORAGE_PREFIX + persistKey, collapsed ? '1' : '0') } catch {}
}

export function CollapsibleSection({
  title,
  count,
  summary,
  defaultOpen = true,
  persistKey,
  children,
  className = '',
}: {
  title: string
  count?: number
  summary?: string
  defaultOpen?: boolean
  persistKey?: string
  children: ReactNode
  className?: string
}) {
  const initialCollapsed = (() => {
    const stored = readCollapsedPref(persistKey)
    if (stored !== null) return stored
    return !defaultOpen
  })()
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  useEffect(() => {
    if (persistKey) writeCollapsedPref(persistKey, collapsed)
  }, [collapsed, persistKey])

  return (
    <section className={`collapsible-section ${collapsed ? 'is-collapsed' : 'is-open'} ${className}`.trim()}>
      <button
        type="button"
        className="collapsible-section__header"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(c => !c)}
      >
        <span className="collapsible-section__chevron" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2 4 3 3 3-3" />
          </svg>
        </span>
        <strong className="collapsible-section__title">{title}</strong>
        {typeof count === 'number' && (
          <span className="collapsible-section__count">{count}</span>
        )}
        {summary && <span className="collapsible-section__summary">{summary}</span>}
      </button>
      {!collapsed && <div className="collapsible-section__body">{children}</div>}
    </section>
  )
}

// ── SidePanel ──────────────────────────────────────────────────────────────
// Sprint 4: slide-in dari kanan untuk triage UX (Linear/Asana style).
// Mobile (<768px): jadi full-screen modal.
// Pakai useEscKey untuk close on Escape.
export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 420,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEscKey(onClose, open)

  if (!open) return null
  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="side-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-panel-title"
        style={{ '--side-panel-width': `${width}px` } as React.CSSProperties}
      >
        <header className="side-panel__header">
          <div>
            <h3 id="side-panel-title" className="side-panel__title">{title}</h3>
            {subtitle && <p className="side-panel__subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="side-panel__close"
            onClick={onClose}
            aria-label="Close panel"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2 12 12M12 2 2 12" />
            </svg>
          </button>
        </header>
        <div className="side-panel__body">{children}</div>
        {footer && <footer className="side-panel__footer">{footer}</footer>}
      </aside>
    </>
  )
}

// ── AgingIndicator ─────────────────────────────────────────────────────────
// Sprint 4: warna decay subtle berdasarkan threshold dari config/atlas-thresholds.
// Default thresholds (kalau tidak diberikan props):
//   green  < 3 hari
//   yellow 3–6 hari
//   orange 7–13 hari
//   red    14+ hari
export function AgingIndicator({
  days,
  thresholds = { yellow: 3, orange: 7, red: 14 },
  showText = true,
  className = '',
}: {
  days: number
  thresholds?: { yellow: number; orange: number; red: number }
  showText?: boolean
  className?: string
}) {
  const tone =
    days >= thresholds.red    ? 'red'    :
    days >= thresholds.orange ? 'orange' :
    days >= thresholds.yellow ? 'yellow' : 'green'
  const label = days === 0 ? 'just now' : `${days}d`
  return (
    <span
      className={`aging-indicator aging-indicator--${tone} ${className}`.trim()}
      title={`Aging: ${days} days`}
    >
      <span className="aging-indicator__dot" aria-hidden="true" />
      {showText && <span className="aging-indicator__label">{label}</span>}
    </span>
  )
}

// ── ForecastBadge ──────────────────────────────────────────────────────────
// Sprint 5: linear forecast indicator (honest labeled).
// Tidak menerima props ramai — terima value + status + method label.
export function ForecastBadge({
  value,
  status,
  method = 'Linear estimate based on YTD achievement. Does not account for seasonality. To be refined in Sprint 6.',
  className = '',
}: {
  value: number | string
  status: 'green' | 'yellow' | 'red' | 'muted'
  method?: string
  className?: string
}) {
  return (
    <span
      className={`forecast-badge forecast-badge--${status} ${className}`.trim()}
      title={method}
    >
      <span className="forecast-badge__icon" aria-hidden="true">↗</span>
      <span className="forecast-badge__label">Forecast {typeof value === 'number' ? value.toFixed(1) : value}</span>
    </span>
  )
}

// ── DataSourceBadge ────────────────────────────────────────────────────────
// Sprint 2: label honest untuk data dummy/non-real. Hilang saat data riil
// terintegrasi (Sprint 6).
export function DataSourceBadge({
  type = 'dummy',
  tooltip,
  className = '',
}: {
  type?: 'dummy' | 'partial' | 'live'
  tooltip?: string
  className?: string
}) {
  const label = type === 'dummy' ? 'Demo' : type === 'partial' ? 'Partial' : 'Live'
  const defaultTooltip = type === 'dummy'
    ? 'Demo data. Real-data integration in Sprint 6 milestone.'
    : type === 'partial' ? 'Partly real data, partly demo.' : 'Live data from the system.'
  return (
    <span
      className={`data-source-badge data-source-badge--${type} ${className}`.trim()}
      title={tooltip || defaultTooltip}
      aria-label={tooltip || defaultTooltip}
    >
      <span className="data-source-badge__dot" aria-hidden="true" />
      {label}
    </span>
  )
}

export function ComposerTools({
  tools,
  onInsert,
}: {
  tools: Array<{ label: string; value: string }>
  onInsert: (value: string) => void
}) {
  return (
    <div className="composer-tools">
      {tools.map((tool) => (
        <button className="ghost-button ghost-button--chip" key={tool.label} onClick={() => onInsert(tool.value)} type="button">
          {tool.label}
        </button>
      ))}
    </div>
  )
}

export function ComposerModeToggle({
  mode,
  onModeChange,
}: {
  mode: 'edit' | 'preview'
  onModeChange: (mode: 'edit' | 'preview') => void
}) {
  return (
    <div className="composer-mode-toggle" role="tablist" aria-label="Composer mode">
      <button
        className={`ghost-button ghost-button--chip ${mode === 'edit' ? 'is-active' : ''}`}
        onClick={() => onModeChange('edit')}
        type="button"
      >
        Edit
      </button>
      <button
        className={`ghost-button ghost-button--chip ${mode === 'preview' ? 'is-active' : ''}`}
        onClick={() => onModeChange('preview')}
        type="button"
      >
        Preview
      </button>
    </div>
  )
}

// Common emoji shortcodes (Slack-style :name:)
export const EMOJI_SHORTCODES: Record<string, string> = {
  // ── Reactions & sentiment ──────────────────────────────────
  thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎',
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚',
  blue_heart: '💙', purple_heart: '💜', black_heart: '🖤', white_heart: '🤍',
  broken_heart: '💔', heart_on_fire: '❤️‍🔥', revolving_hearts: '💞',
  fire: '🔥', rocket: '🚀', eyes: '👀', hundred: '💯', '100': '💯',
  white_check_mark: '✅', check: '✅', x: '❌', tada: '🎉', party: '🎉',
  confetti_ball: '🎊', balloon: '🎈', sparkles: '✨', star: '⭐', star2: '🌟',
  boom: '💥', zap: '⚡', warning: '⚠️', rotating_light: '🚨',
  // ── Faces ─────────────────────────────────────────────────
  smile: '😄', grinning: '😀', laughing: '😆', joy: '😂', rofl: '🤣',
  slightly_smiling_face: '🙂', wink: '😉', blush: '😊', innocent: '😇',
  heart_eyes: '😍', kissing_heart: '😘', yum: '😋', stuck_out_tongue: '😛',
  stuck_out_tongue_winking_eye: '😜', money_mouth_face: '🤑',
  hugging_face: '🤗', thinking: '🤔', thinking_face: '🤔',
  zipper_mouth_face: '🤐', raised_eyebrow: '🤨', neutral_face: '😐',
  expressionless: '😑', no_mouth: '😶', smirk: '😏', unamused: '😒',
  roll_eyes: '🙄', grimacing: '😬', lying_face: '🤥', relieved: '😌',
  pensive: '😔', sleepy: '😪', drooling_face: '🤤', sleeping: '😴',
  mask: '😷', face_with_thermometer: '🤒', sneezing_face: '🤧',
  hot_face: '🥵', cold_face: '🥶', woozy_face: '🥴', dizzy_face: '😵',
  exploding_head: '🤯', cowboy_hat_face: '🤠', partying_face: '🥳',
  sunglasses: '😎', nerd_face: '🤓', monocle_face: '🧐',
  cry: '😢', sob: '😭', scream: '😱', fearful: '😨', cold_sweat: '😰',
  sweat_smile: '😅', sweat: '😓', weary: '😩', tired_face: '😫',
  yawning_face: '🥱', triumph: '😤', rage: '😡', angry: '😠',
  skull: '💀', ghost: '👻', alien: '👽', robot: '🤖', poop: '💩',
  clown_face: '🤡', flushed: '😳', pleading_face: '🥺',
  // ── Hands & gestures ──────────────────────────────────────
  wave: '👋', raised_hand: '✋', hand: '✋', vulcan_salute: '🖖',
  ok_hand: '👌', pinched_fingers: '🤌', pinching_hand: '🤏',
  crossed_fingers: '🤞', love_you_gesture: '🤟', metal: '🤘',
  call_me_hand: '🤙', point_left: '👈', point_right: '👉',
  point_up: '☝️', point_up_2: '👆', point_down: '👇',
  thumbsup_tone1: '👍🏻', clap: '👏', raised_hands: '🙌',
  open_hands: '👐', pray: '🙏', handshake: '🤝', muscle: '💪',
  writing_hand: '✍️', nail_care: '💅', selfie: '🤳',
  v: '✌️', fist: '✊', oncoming_fist: '👊', left_facing_fist: '🤛',
  right_facing_fist: '🤜', shrug: '🤷', facepalm: '🤦',
  // ── People & roles ────────────────────────────────────────
  bust_in_silhouette: '👤', busts_in_silhouette: '👥',
  speaking_head: '🗣️', brain: '🧠', technologist: '🧑‍💻',
  office_worker: '🧑‍💼', scientist: '🧑‍🔬', teacher: '🧑‍🏫',
  factory_worker: '🧑‍🏭', mechanic: '🧑‍🔧', farmer: '🧑‍🌾',
  astronaut: '🧑‍🚀', firefighter: '🧑‍🚒', construction_worker: '👷',
  police_officer: '👮', guard: '💂', detective: '🕵️',
  superhero: '🦸', mage: '🧙', santa: '🎅',
  // ── Nature & weather ──────────────────────────────────────
  sunny: '☀️', sun: '☀️', sun_with_face: '🌞', partly_sunny: '⛅',
  cloud: '☁️', rain_cloud: '🌧️', thunder_cloud_and_rain: '⛈️',
  snowflake: '❄️', snowman: '⛄', umbrella: '☂️',
  rainbow: '🌈', cyclone: '🌀', fog: '🌫️', ocean: '🌊',
  droplet: '💧', sweat_drops: '💦', high_brightness: '🔆',
  seedling: '🌱', herb: '🌿', four_leaf_clover: '🍀',
  rose: '🌹', sunflower: '🌻', cherry_blossom: '🌸', blossom: '🌼',
  leaves: '🍃', fallen_leaf: '🍂', maple_leaf: '🍁',
  deciduous_tree: '🌳', evergreen_tree: '🌲', palm_tree: '🌴',
  mushroom: '🍄', earth_africa: '🌍', earth_americas: '🌎',
  earth_asia: '🌏', globe_with_meridians: '🌐', world_map: '🗺️',
  moon: '🌙', full_moon: '🌕', crescent_moon: '🌙',
  // ── Animals ───────────────────────────────────────────────
  dog: '🐶', cat: '🐱', mouse: '🐭', rabbit: '🐰', fox_face: '🦊',
  bear: '🐻', panda_face: '🐼', koala: '🐨', tiger: '🐯',
  lion: '🦁', cow: '🐮', pig: '🐷', frog: '🐸', monkey: '🐒',
  monkey_face: '🐵', chicken: '🐔', penguin: '🐧', bird: '🐦',
  eagle: '🦅', owl: '🦉', duck: '🦆', bat: '🦇', wolf: '🐺',
  horse: '🐴', unicorn: '🦄', bee: '🐝', butterfly: '🦋',
  bug: '🐛', ant: '🐜', turtle: '🐢', snake: '🐍', dragon: '🐉',
  whale: '🐳', dolphin: '🐬', fish: '🐟', shark: '🦈', octopus: '🐙',
  // ── Food & drink ──────────────────────────────────────────
  coffee: '☕', tea: '🍵', beer: '🍺', beers: '🍻', wine_glass: '🍷',
  cocktail: '🍸', champagne: '🍾', milk_glass: '🥛',
  pizza: '🍕', hamburger: '🍔', fries: '🍟', hotdog: '🌭',
  sandwich: '🥪', taco: '🌮', burrito: '🌯', sushi: '🍣',
  ramen: '🍜', spaghetti: '🍝', rice: '🍚', bread: '🍞',
  cookie: '🍪', cake: '🎂', doughnut: '🍩', ice_cream: '🍦',
  chocolate_bar: '🍫', candy: '🍬', apple: '🍎', banana: '🍌',
  grapes: '🍇', strawberry: '🍓', watermelon: '🍉', lemon: '🍋',
  peach: '🍑', cherries: '🍒', tomato: '🍅', avocado: '🥑',
  broccoli: '🥦', corn: '🌽', carrot: '🥕', salad: '🥗',
  // ── Transport ─────────────────────────────────────────────
  car: '🚗', taxi: '🚕', bus: '🚌', truck: '🚚', train: '🚂',
  airplane: '✈️', helicopter: '🚁', ship: '🚢', bike: '🚲',
  motorcycle: '🏍️', anchor: '⚓', construction: '🚧',
  // ── Buildings & places ────────────────────────────────────
  house: '🏠', office: '🏢', factory: '🏭', hospital: '🏥',
  bank: '🏦', school: '🏫', hotel: '🏨', convenience_store: '🏪',
  department_store: '🏬', european_castle: '🏰', stadium: '🏟️',
  classical_building: '🏛️', building_construction: '🏗️',
  cityscape: '🏙️', national_park: '🏞️', sunrise: '🌅',
  // ── Office & documents ────────────────────────────────────
  memo: '📝', pencil: '✏️', pencil2: '✏️', pen: '🖊️',
  black_nib: '✒️', bookmark: '🔖', label: '🏷️',
  book: '📖', open_book: '📖', books: '📚', closed_book: '📕',
  green_book: '📗', blue_book: '📘', orange_book: '📙',
  notebook: '📓', ledger: '📒', scroll: '📜', newspaper: '📰',
  newspaper_roll: '🗞️', page_facing_up: '📄', page_with_curl: '📃',
  bookmark_tabs: '📑', spiral_notepad: '🗒️', spiral_calendar: '🗓️',
  clipboard: '📋', card_index: '📇', file_cabinet: '🗄️',
  wastebasket: '🗑️', file_folder: '📁', open_file_folder: '📂',
  card_index_dividers: '🗂️', briefcase: '💼', luggage: '🧳',
  package: '📦', inbox_tray: '📥', outbox_tray: '📤',
  calendar: '📅', date: '📅', link: '🔗', paperclip: '📎',
  pushpin: '📌', pin: '📌', round_pushpin: '📍',
  // ── Charts & metrics ──────────────────────────────────────
  chart_with_upwards_trend: '📈', chart_with_downwards_trend: '📉',
  bar_chart: '📊', chart: '📊',
  // ── Money & finance ───────────────────────────────────────
  moneybag: '💰', coin: '🪙', dollar: '💵', euro: '💶',
  pound: '💷', yen: '💴', money_with_wings: '💸', credit_card: '💳',
  gem: '💎', receipt: '🧾', scales: '⚖️', atm: '🏧',
  // ── Communication ─────────────────────────────────────────
  bell: '🔔', no_bell: '🔕', mega: '📣', loudspeaker: '📢',
  speech_balloon: '💬', thought_balloon: '💭', left_speech_bubble: '🗨️',
  email: '📧', envelope: '✉️', telephone_receiver: '📞',
  phone: '📱', pager: '📟', fax: '📠', satellite: '📡',
  // ── Tech & tools ──────────────────────────────────────────
  computer: '💻', desktop_computer: '🖥️', printer: '🖨️',
  keyboard: '⌨️', mouse_three_button: '🖱️', floppy_disk: '💾',
  cd: '💿', dvd: '📀', battery: '🔋', electric_plug: '🔌',
  bulb: '💡', flashlight: '🔦', mag: '🔍', mag_right: '🎯',
  microscope: '🔬', telescope: '🔭', test_tube: '🧪', dna: '🧬',
  tools: '🛠️', hammer: '🔨', wrench: '🔧', gear: '⚙️',
  nut_and_bolt: '🔩', chains: '⛓️', toolbox: '🧰', hook: '🪝',
  // ── Security & status ─────────────────────────────────────
  lock: '🔒', unlock: '🔓', key: '🔑', shield: '🛡️', door: '🚪',
  no_entry: '⛔',
  no_entry_sign: '🚫', stop_sign: '🛑', parking: '🅿️',
  // ── Symbols & misc ────────────────────────────────────────
  recycle: '♻️', heavy_check_mark: '✔️', ballot_box_with_check: '☑️',
  question: '❓', exclamation: '❗', grey_question: '❔',
  grey_exclamation: '❕', information_source: 'ℹ️',
  trophy: '🏆', medal: '🏅', first_place_medal: '🥇',
  second_place_medal: '🥈', third_place_medal: '🥉', crown: '👑',
  dart: '🎯', target: '🎯', jigsaw: '🧩', chess_pawn: '♟️',
  video_game: '🎮', ticket: '🎫', tickets: '🎟️', art: '🎨',
  musical_note: '🎵', notes: '🎶', microphone: '🎤', headphones: '🎧',
  clock1: '🕐', alarm_clock: '⏰', hourglass: '⌛',
  hourglass_flowing_sand: '⏳', stopwatch: '⏱️', watch: '⌚',
  gift: '🎁', ribbon: '🎀',
  crystal_ball: '🔮', trident: '🔱', fleur_de_lis: '⚜️',
  infinity: '♾️', peace_symbol: '☮️',
  sos: '🆘', new: '🆕', up: '🆙', cool: '🆒', free: '🆓',
  ng: '🆖', ok: '🆗', id: '🆔', abc: '🔤',
  flag: '🚩', checkered_flag: '🏁', triangular_flag_on_post: '🚩',
  white_flag: '🏳️', crossed_flags: '🎌',
  shopping_cart: '🛒', shopping_bags: '🛍️', broom: '🧹',
  basket: '🧺', soap: '🧼', sponge: '🧽', thread: '🧵',
  yarn: '🧶', safety_pin: '🧷', teddy_bear: '🧸',
  soccer: '⚽', basketball: '🏀', football: '🏈', baseball: '⚾',
  tennis: '🎾', volleyball: '🏐', golf: '⛳', fishing_pole_and_fish: '🎣',
  bow_and_arrow: '🏹', boxing_glove: '🥊', ski: '🎿',
  running: '🏃', walking: '🚶', swimmer: '🏊', surfer: '🏄',
  bicyclist: '🚴', horse_racing: '🏇',

  // ── Extended faces & smileys (WhatsApp iOS/Android) ───────
  slightly_frowning_face: '🙁', frowning_face: '☹️', anguished: '😧',
  disappointed: '😞', worried: '😟', confounded: '😖', persevere: '😣',
  hushed: '😯', astonished: '😲', see_no_evil: '🙈',
  hear_no_evil: '🙉', speak_no_evil: '🙊', open_mouth: '😮',
  face_with_open_mouth: '😮', face_exhaling: '😮‍💨',
  face_in_clouds: '😶‍🌫️', dotted_line_face: '🫥',
  saluting_face: '🫡', melting_face: '🫠', face_holding_back_tears: '🥹',
  smiling_face_with_tear: '🥲', disguised_face: '🥸',
  face_with_peeking_eye: '🫣', face_with_open_eyes_hand_over_mouth: '🫢',
  shushing_face: '🤫', face_with_raised_eyebrow: '🤨',
  star_struck: '🤩', face_vomiting: '🤮',
  ninja: '🥷',
  skull_and_crossbones: '☠️', japanese_ogre: '👹', japanese_goblin: '👺',
  space_invader: '👾', imp: '👿', anger: '💢', zzz: '💤',
  speech_balloon_right: '💬', anger_right: '🗯️', splashing_sweat: '💦',
  droplet_small: '💧', hole: '🕳️', bomb: '💣',
  // ── Additional hands & body ───────────────────────────────
  backhand_index_pointing_up: '👆', index_pointing_up: '☝️',
  hand_with_fingers_splayed: '🖐️', raised_back_of_hand: '🤚',
  foot: '🦶', leg: '🦵', ear_with_hearing_aid: '🦻',
  mechanical_arm: '🦾', mechanical_leg: '🦿',
  man_shrugging: '🤷‍♂️', woman_shrugging: '🤷‍♀️',
  man_facepalming: '🤦‍♂️', woman_facepalming: '🤦‍♀️',
  man_gesturing_ok: '🙆‍♂️', woman_gesturing_ok: '🙆‍♀️',
  man_gesturing_no: '🙅‍♂️', woman_gesturing_no: '🙅‍♀️',
  man_raising_hand: '🙋‍♂️', woman_raising_hand: '🙋‍♀️',
  man_bowing: '🙇‍♂️', woman_bowing: '🙇‍♀️',
  man_tipping_hand: '💁‍♂️', woman_tipping_hand: '💁‍♀️',
  information_desk_person: '💁', raising_hand: '🙋', bow: '🙇',
  dancer: '💃', man_dancing: '🕺', people_hugging: '🫂',
  heart_hands: '🫶', index_pointing_at_the_viewer: '🫵',
  // ── Families & relationships ──────────────────────────────
  couple: '👫', two_men_holding_hands: '👬', two_women_holding_hands: '👭',
  couplekiss: '💏', couple_with_heart: '💑',
  baby: '👶', girl: '👧', boy: '👦', woman: '👩', man: '👨',
  older_woman: '👵', older_man: '👴', family: '👨‍👩‍👦',
  pregnant_woman: '🤰', breast_feeding: '🤱', mx_claus: '🧑‍🎄',
  // ── Clothing & accessories ────────────────────────────────
  eyeglasses: '👓', dark_sunglasses: '🕶️', goggles: '🥽',
  lab_coat: '🥼', safety_vest: '🦺', necktie: '👔',
  shirt: '👕', jeans: '👖', scarf: '🧣', gloves: '🧤',
  coat: '🧥', socks: '🧦', dress: '👗', kimono: '👘',
  sari: '🥻', one_piece_swimsuit: '🩱', swim_brief: '🩲',
  shorts: '🩳', bikini: '👙', womans_clothes: '👚',
  purse: '👛', handbag: '👜', pouch: '👝', school_satchel: '🎒',
  thong_sandal: '🩴', mans_shoe: '👞', running_shoe: '👟',
  hiking_boot: '🥾', flat_shoe: '🥿', high_heel: '👠',
  sandal: '👡', ballet_shoes: '🩰', boot: '👢',
  womans_hat: '👒', top_hat: '🎩', graduation_cap: '🎓',
  billed_cap: '🧢', helmet: '⛑️', ring: '💍',
  // ── More animals & nature ─────────────────────────────────
  gorilla: '🦍', orangutan: '🦧', guide_dog: '🦮',
  service_dog: '🐕‍🦺', poodle: '🐩', dachshund: '🌭',
  fox: '🦊', raccoon: '🦝', cat2: '🐈', black_cat: '🐈‍⬛',
  rooster: '🐓', turkey: '🦃', peacock: '🦚', parrot: '🦜',
  swan: '🦢', flamingo: '🦩', dodo: '🦤', feather: '🪶',
  mammoth: '🦣', beaver: '🦫', polar_bear: '🐻‍❄️', bison: '🦬',
  kangaroo: '🦘', llama: '🦙', giraffe: '🦒', zebra: '🦓',
  hippopotamus: '🦛', rhinoceros: '🦏', elephant: '🐘',
  camel: '🐫', dromedary_camel: '🐪', rat: '🐀', chipmunk: '🐿️',
  hedgehog: '🦔', sloth: '🦥', otter: '🦦', skunk: '🦨',
  badger: '🦡', feet: '🐾', feather2: '🪶',
  ladybug: '🐞', snail: '🐌', worm: '🪱', mosquito: '🦟',
  cricket: '🦗', cockroach: '🪳', fly: '🪰', beetle: '🪲',
  microbe: '🦠', sauropod: '🦕', t_rex: '🦖',
  crocodile: '🐊', lizard: '🦎', komodo_dragon: '🐊',
  seal: '🦭', lobster: '🦞', shrimp: '🦐', squid: '🦑',
  oyster: '🦪', coral: '🪸', jellyfish: '🪼',
  // ── More food & drink ─────────────────────────────────────
  fried_egg: '🍳', bacon: '🥓', pancakes: '🥞', waffle: '🧇',
  butter: '🧈', cheese: '🧀', leafy_green: '🥬', cucumber: '🥒',
  bell_pepper: '🫑', garlic: '🧄', onion: '🧅', potato: '🥔',
  sweet_potato: '🍠', peanuts: '🥜', beans: '🫘', chestnut: '🌰',
  bread2: '🫓', flatbread: '🫓', bagel: '🥯', croissant: '🥐',
  baguette_bread: '🥖', pretzel: '🥨', falafel: '🧆',
  egg: '🥚', cooking: '🍳', shallow_pan_of_food: '🥘',
  pot_of_food: '🍲', fondue: '🫕', bowl_with_spoon: '🥣',
  green_salad: '🥗', popcorn: '🍿', butter2: '🧈', salt: '🧂',
  canned_food: '🥫', bento: '🍱', dumpling: '🥟', fried_shrimp: '🍤',
  rice_ball: '🍙', rice_cracker: '🍘', fish_cake: '🍥',
  fortune_cookie: '🥠', moon_cake: '🥮', oden: '🍢', spaghetti2: '🍝',
  curry: '🍛', stew: '🍲', steaming_bowl: '🍜', hot_pot: '🫕',
  cupcake: '🧁', shortcake: '🍰', pie: '🥧', custard: '🍮',
  lollipop: '🍭', hard_candy: '🍬', chocolate: '🍫',
  popcorn2: '🍿', honey_pot: '🍯', salt2: '🧂',
  beverage_box: '🧃', bubble_tea: '🧋', mate: '🧉',
  ice_cube: '🧊', cup_with_straw: '🥤', teapot: '🫖',
  fork_and_knife: '🍴', spoon: '🥄', chopsticks: '🥢',
  fork_knife_plate: '🍽️',
  // ── More travel & places ──────────────────────────────────
  world_map2: '🗺️', compass2: '🧭', mountain: '⛰️',
  mountain_snow: '🏔️', camping: '🏕️', beach_umbrella: '🏖️',
  desert: '🏜️', desert_island: '🏝️', stadium2: '🏟️',
  comet: '☄️', milky_way: '🌌', night_with_stars: '🌃',
  city_sunrise2: '🌇', city_sunset2: '🌆', bridge_at_night: '🌉',
  foggy: '🌁', sunrise_over_mountains: '🌄', sunrise2: '🌅',
  shooting_star: '🌠', fireworks: '🎆', sparkler: '🎇',
  globe: '🌐', earth: '🌍',
  tram: '🚊', metro: '🚇', light_rail: '🚈', station: '🚉',
  monorail: '🚝', mountain_railway: '🚞', steam_locomotive: '🚂',
  railway_car: '🚃', bullettrain_side: '🚄', bullettrain_front: '🚅',
  articulated_lorry: '🚛', tractor: '🚜', racing_car: '🏎️',
  motor_scooter: '🛵', kick_scooter: '🛴', auto_rickshaw: '🛺',
  minibus: '🚐', ambulance: '🚑', fire_engine: '🚒',
  police_car: '🚓', oncoming_police_car: '🚔', oncoming_bus: '🚍',
  oncoming_automobile: '🚘', aerial_tramway: '🚡', mountain_cableway: '🚠',
  suspension_railway: '🚟', boat: '⛵', canoe: '🛶',
  speedboat: '🚤', passenger_ship: '🛳️', ferry: '⛴️',
  motor_boat: '🛥️', sailboat: '⛵', rowboat2: '🚣',
  seat: '💺', parachute: '🪂', luggage2: '🧳', construction_site: '🏗️',
  // ── Activities & sports ───────────────────────────────────
  medal_sports: '🏅', military_medal: '🎖️', reminder_ribbon: '🎗️',
  badminton: '🏸', table_tennis_paddle_and_ball: '🏓', ice_hockey: '🏒',
  field_hockey: '🏑', lacrosse: '🥍', cricket_game: '🏏',
  softball: '🥎', flying_disc: '🥏', goal_net: '🥅',
  curling_stone: '🥌', sled: '🛷', snowboarder: '🏂',
  person_fencing: '🤺', gymnast: '🤸', weightlifter: '🏋️',
  climber: '🧗', skier: '⛷️', water_polo: '🤽', handball: '🤾',
  juggling: '🤹', yoga: '🧘', swimming_man: '🏊‍♂️',
  lotus_position: '🧘', person_in_steamy_room: '🧖',
  // ── Objects & misc ────────────────────────────────────────
  candle: '🕯️', light_bulb: '💡', lantern: '🏮', diwali_lamp: '🪔',
  notebook_with_cover: '📔', ledger2: '📒', books2: '📚',
  card_file_box: '🗃️', ballot_box: '🗳️', file_box: '🗄️',
  wastebasket2: '🗑️', compression: '🗜️', card_box: '📦',
  postal_horn: '📯', newspaper2: '📰', inbox: '📥', outbox: '📤',
  package2: '📦', shopping_bags2: '🛍️', receipt2: '🧾',
  map: '🗺️', compass3: '🧭', scissors: '✂️', tape: '🖇️',
  pencil3: '📝', crayon: '🖍️', paintbrush: '🖌️', magnifier: '🔎',
  microscope2: '🔬', telescope2: '🔭', satellite_dish: '📡',
  syringe: '💉', pill: '💊', stethoscope: '🩺', adhesive_bandage: '🩹',
  drop_of_blood: '🩸', crutch: '🩼', xray: '🩻',
  bucket: '🪣', plunger: '🪠', ladder: '🪜', screwdriver: '🪛',
  hook2: '🪝', toolbox2: '🧰', bricks: '🧱', wood: '🪵',
  hut: '🛖', rock: '🪨', mirror2: '🪞', window2: '🪟',
  chair2: '🪑', fire_extinguisher: '🧯', shopping_cart2: '🛒',
  gift_heart: '💝', ribbon2: '🎀', gift2: '🎁',
  joystick: '🕹️', teddy_bear2: '🧸', pinata: '🪅', nesting_dolls: '🪆',
  magic_wand: '🪄', kite: '🪁', boomerang: '🪃',
  yo_yo: '🪀', puzzle_piece: '🧩', placard: '🪧',
  thread2: '🧵', yarn2: '🧶', safety_pin2: '🧷', sewing_needle: '🪡',
  knot: '🪢', nazar_amulet: '🧿', hamsa: '🪬',
  flute: '🪈', maracas: '🪇', accordion2: '🪗', banjo2: '🪕',
  guitar: '🎸', trumpet: '🎺', violin: '🎻', drum: '🥁', cymbals: '🪘',
  microphone2: '🎙️', studio_microphone: '🎙️',
  // ── Symbols extended ──────────────────────────────────────
  red_circle: '🔴', orange_circle: '🟠', yellow_circle: '🟡',
  green_circle: '🟢', blue_circle: '🔵', purple_circle: '🟣',
  brown_circle: '🟤', black_circle: '⚫', white_circle: '⚪',
  red_square: '🟥', orange_square: '🟧', yellow_square: '🟨',
  green_square: '🟩', blue_square: '🟦', purple_square: '🟪',
  brown_square: '🟫', black_large_square: '⬛', white_large_square: '⬜',
  small_red_triangle: '🔺', small_red_triangle_down: '🔻',
  diamond_shape_with_dot: '💠', large_blue_diamond: '🔷',
  large_orange_diamond: '🔶', small_blue_diamond: '🔹',
  small_orange_diamond: '🔸', radio_button: '🔘', white_square_button: '🔳',
  black_square_button: '🔲', checkered_flag2: '🏁',
  arrow_up: '⬆️', arrow_down: '⬇️', arrow_left: '⬅️', arrow_right: '➡️',
  arrow_upper_right: '↗️', arrow_lower_right: '↘️',
  arrow_lower_left: '↙️', arrow_upper_left: '↖️',
  arrow_up_down: '↕️', left_right_arrow: '↔️',
  arrows_counterclockwise: '🔄', arrow_clockwise: '🔃',
  twisted_rightwards_arrows: '🔀', repeat: '🔁', repeat_one: '🔂',
  fast_forward: '⏩', rewind: '⏪', next_track: '⏭️', last_track: '⏮️',
  stop_button: '⏹️', record_button: '⏺️', eject: '⏏️', cinema: '🎦',
  mute: '🔇', speaker: '🔈', sound: '🔉', loud_sound: '🔊',
  bell2: '🔔', no_bell2: '🔕', mega2: '📣', loudspeaker2: '📢',
  hash: '#️⃣', asterisk: '*️⃣', zero: '0️⃣', one: '1️⃣', two: '2️⃣',
  three: '3️⃣', four: '4️⃣', five: '5️⃣', six: '6️⃣', seven: '7️⃣',
  eight: '8️⃣', nine: '9️⃣', ten: '🔟',
  keycap_ten: '🔟', capital_abcd: '🔠', abcd: '🔡', symbols: '🔣',
  abc2: '🔤', a: '🅰️', b: '🅱️', o2: '🅾️', parking2: '🅿️',
  soon: '🔜', back: '🔙', end: '🔚', on: '🔛', top: '🔝',
  cinema2: '🎦', signal_strength: '📶', koko: '🈁', vs: '🆚',
  accept: '🉑', cl: '🆑', cool2: '🆒', free2: '🆓',
  id2: '🆔', new2: '🆕', ng2: '🆖', ok2: '🆗', sos2: '🆘',
  up2: '🆙', vs2: '🆚', secret: '㊙️', congratulations: '㊗️',
  u5272: '🈹', u5408: '🈴', u55b6: '🈺', u6307: '🈯',
  // ── Flags (most common) ───────────────────────────────────
  flag_id: '🇮🇩', flag_us: '🇺🇸', flag_gb: '🇬🇧', flag_jp: '🇯🇵',
  flag_cn: '🇨🇳', flag_kr: '🇰🇷', flag_de: '🇩🇪', flag_fr: '🇫🇷',
  flag_au: '🇦🇺', flag_ca: '🇨🇦', flag_in: '🇮🇳', flag_sg: '🇸🇬',
  flag_my: '🇲🇾', flag_ph: '🇵🇭', flag_th: '🇹🇭',
  indonesia: '🇮🇩', us: '🇺🇸', uk: '🇬🇧', japan: '🇯🇵', china: '🇨🇳',
}

/** Resolve a Slack-style :emoji_code: to its Unicode emoji character.
 *  Returns the original code (with colons) if unknown. */
export function resolveEmoji(code: string): string {
  // Accept both ':name:' and 'name'
  const key = code.startsWith(':') && code.endsWith(':') ? code.slice(1, -1) : code
  return EMOJI_SHORTCODES[key] ?? code
}

const SPECIAL_MENTIONS = new Set(['channel', 'here', 'everyone', 'all'])

type RichOpts = { mentionNames?: string[]; currentUserName?: string; taskCodes?: string[] }

// Tokenize a single text segment into ReactNode array.
// Handles (in order):
// 1. **bold**, __bold__
// 2. _italic_, *italic*
// 3. `code`
// 4. ~strike~
// 5. :emoji_shortcodes:
// 6. @special mentions (channel, here, everyone, all)
// 7. @user mentions (from mentionNames)
function renderRichSegment(text: string, opts: RichOpts): ReactNode {
  // Combined regex with named-style alternation. Order matters — longest patterns first.
  // eslint-disable-next-line no-useless-escape -- escape eksplisit dipertahankan demi keterbacaan tokenizer; menghapusnya identik secara semantik tapi rawan salah-edit
  const TOKEN_RE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+?`|~[^~\n]+?~|_[^_\n]+?_|\*[^*\n]+?\*|:[a-z0-9_+\-]+:|@WI-[A-Z0-9-]+|@(?:channel|here|everyone|all)\b|@[A-Za-zÀ-ÿ0-9._-]+(?:\s[A-Za-zÀ-ÿ0-9._-]+)*)/g
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const token = match[0]
    parts.push(renderToken(token, key++, opts))
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? <>{parts}</> : text
}

function renderToken(token: string, key: number, opts: RichOpts): ReactNode {
  // Bold: **text** or __text__
  if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
    return <strong key={`b-${key}`}>{token.slice(2, -2)}</strong>
  }
  // Inline code: `code`
  if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
    return <code className="rich-inline-code" key={`c-${key}`}>{token.slice(1, -1)}</code>
  }
  // Strike: ~text~
  if (token.startsWith('~') && token.endsWith('~') && token.length > 2) {
    return <s key={`s-${key}`}>{token.slice(1, -1)}</s>
  }
  // Italic: _text_ or *text*
  if ((token.startsWith('_') && token.endsWith('_')) || (token.startsWith('*') && token.endsWith('*'))) {
    return <em key={`i-${key}`}>{token.slice(1, -1)}</em>
  }
  // Emoji shortcode: :name:
  if (token.startsWith(':') && token.endsWith(':') && token.length > 2) {
    const code = token.slice(1, -1)
    const emoji = EMOJI_SHORTCODES[code]
    if (emoji) return <span key={`e-${key}`}>{emoji}</span>
    return token
  }
  // @mentions
  if (token.startsWith('@')) {
    const name = token.slice(1)
    // Work item mention @WI-XX
    if (name.startsWith('WI-')) {
      const isKnown = opts.taskCodes?.includes(name)
      return <span className={`mention mention--task ${!isKnown ? 'mention--task-unknown' : ''}`} key={`mwi-${key}`}>📋 {name}</span>
    }
    // Special mentions
    if (SPECIAL_MENTIONS.has(name.toLowerCase())) {
      return <span className="mention mention--special" key={`ms-${key}`}>@{name}</span>
    }
    // Resolve longest matching user name (because regex matched greedily)
    if (opts.mentionNames) {
      const sorted = [...opts.mentionNames].sort((a, b) => b.length - a.length)
      for (const memberName of sorted) {
        if (name === memberName || name.startsWith(memberName + ' ') || name === memberName) {
          const isSelf = opts.currentUserName === memberName
          const rest = name.slice(memberName.length)
          return (
            <>
              <span className={`mention ${isSelf ? 'mention--self' : ''}`} key={`m-${key}`}>@{memberName}</span>
              {rest}
            </>
          )
        }
      }
    }
    return token
  }
  return token
}

export function RichTextPreview({
  value,
  emptyText = 'Nothing to preview yet.',
  compact = false,
  mentionNames,
  currentUserName,
  taskCodes,
}: {
  value: string
  emptyText?: string
  compact?: boolean
  mentionNames?: string[]
  currentUserName?: string
  taskCodes?: string[]
}) {
  const trimmed = value.trim()

  if (!trimmed) {
    return (
      <div className={`rich-preview rich-preview--empty ${compact ? 'rich-preview--compact' : ''}`.trim()}>
        <p>{emptyText}</p>
      </div>
    )
  }

  const blocks = trimmed.split(/\n{2,}/)

  return (
    <div className={`rich-preview ${compact ? 'rich-preview--compact' : ''}`.trim()}>
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter(Boolean)

        if (lines.every((line) => line.startsWith('- '))) {
          return (
            <ul className="rich-preview__list" key={`list-${index}`}>
              {lines.map((line, itemIndex) => (
                <li key={`${line}-${itemIndex}`}>{renderRichSegment(line.slice(2), { mentionNames, currentUserName, taskCodes })}</li>
              ))}
            </ul>
          )
        }

        if (lines.every((line) => line.startsWith('> '))) {
          return (
            <blockquote className="rich-preview__quote" key={`quote-${index}`}>
              {renderRichSegment(lines.map((line) => line.slice(2)).join(' '), { mentionNames, currentUserName, taskCodes })}
            </blockquote>
          )
        }

        if (block.startsWith('```') && block.endsWith('```')) {
          return (
            <pre className="rich-preview__code" key={`code-${index}`}>
              <code>{block.replace(/^```\n?/, '').replace(/\n?```$/, '')}</code>
            </pre>
          )
        }

        return (
          <p className="rich-preview__paragraph" key={`paragraph-${index}`}>
            {renderRichSegment(block, { mentionNames, currentUserName, taskCodes })}
          </p>
        )
      })}
    </div>
  )
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
