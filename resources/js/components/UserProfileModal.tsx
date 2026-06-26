import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, looksLikeAvatarUrl, formatRelativeTime, effectivePresenceSlug } from './ui'
import { ImageLightbox } from './ImageLightbox'
import { Button, Pill, Stat } from '../design-system'
import { useEscKey } from '../hooks/useEscKey'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { ProfileViewerContext } from '../contexts/profileViewer'
import { api } from '../lib/api'
import type { UserProfileData } from '../types'
import './UserProfileModal.css'

// Context + hook didefinisikan di contexts/profileViewer (anti circular import
// dengan <Avatar>). Di-re-export agar import lama tetap jalan.
export { useProfileViewer } from '../contexts/profileViewer'

const presenceTone = (slug: string): 'green' | 'amber' | 'red' | 'neutral' =>
  slug === 'online' ? 'green'
  : slug === 'away' ? 'amber'
  : slug === 'do-not-disturb' ? 'red'
  : 'neutral'

// Angka 0 di-mute agar metrik yang non-nol menonjol (bukan jadi "0 0 0" datar).
const WorkloadValue = ({ n }: { n: number }) =>
  <span className={n === 0 ? 'upm-zero' : undefined}>{n}</span>

const slugLabel = (slug: string): string =>
  slug === 'online' ? 'Online'
  : slug === 'away' ? 'Away'
  : slug === 'do-not-disturb' ? 'Heads-down'
  : 'Offline'

/**
 * UserProfileModal — pop-up profil read-only orang lain. Dibuka via
 * useProfileViewer().openProfile(userId). Foto bisa diklik → ImageLightbox
 * (preview penuh). Aksi "Send DM" mirror handleOpenDm dari Presence. Klik
 * atasan langsung → onNavigate(id) membuka profil berikutnya (remount via key).
 */
function ProfileModal({
  userId, onClose, onNavigate,
}: {
  userId: number
  onClose: () => void
  onNavigate: (id: number) => void
}) {
  const { t } = useTranslation()
  const navigate = useInertiaNavigate()
  const { currentUser, setSelectedChannelId, setSelectedThreadId, loadOverview } = useWorkspace()

  const [data, setData] = useState<UserProfileData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [lightbox, setLightbox] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dmBusy, setDmBusy] = useState(false)

  useEscKey(() => (lightbox ? setLightbox(false) : onClose()))

  useEffect(() => {
    let alive = true
    setStatus('loading')
    api.get<UserProfileData>(`/users/${userId}/profile`)
      .then((res) => { if (alive) { setData(res); setStatus('ready') } })
      .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [userId])

  const u = data?.user
  const photo = looksLikeAvatarUrl(u?.avatarUrl) ? u!.avatarUrl! : null
  const slug = data?.presence
    ? effectivePresenceSlug(data.presence.status, data.presence.lastActivityAt)
    : 'offline'
  const isSelf = currentUser?.id === userId

  const copyEmail = () => {
    if (!u?.email) return
    navigator.clipboard.writeText(u.email)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
      .catch(() => {})
  }

  const sendDm = async () => {
    if (dmBusy) return
    setDmBusy(true)
    try {
      const result = await api.post<{ data: { id: number } }>('/dm/open', { userId })
      await loadOverview('refresh')
      setSelectedChannelId(result.data.id)
      setSelectedThreadId(null)
      onClose()
      navigate('/channels')
    } catch {
      setDmBusy(false)
    }
  }

  return createPortal(
    <>
      <div className="upm-overlay" onClick={onClose} role="presentation">
        <div
          className="upm-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('Profile')}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="upm-close" onClick={onClose} type="button" aria-label={t('Close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {status === 'loading' && (
            <div className="upm-state">
              <div className="upm-spinner" aria-hidden />
              <span>{t('Loading…')}</span>
            </div>
          )}

          {status === 'error' && (
            <div className="upm-state">
              <span>{t('Could not load profile.')}</span>
              <Button variant="secondary" size="sm" onClick={onClose}>{t('Close')}</Button>
            </div>
          )}

          {status === 'ready' && u && (
            <>
              {/* ── Header: foto besar (klik → lightbox) + identitas ── */}
              <div className="upm-header">
                <button
                  className={`upm-avatar-btn${photo ? ' is-photo' : ''}`}
                  onClick={() => photo && setLightbox(true)}
                  type="button"
                  disabled={!photo}
                  aria-label={photo ? t('View full photo') : undefined}
                  title={photo ? t('View full photo') : undefined}
                >
                  <Avatar name={u.name} avatarUrl={u.avatarUrl} size={84} ring />
                  <span className={`upm-dot presence-dot presence-dot--${slug}`} />
                  {photo && (
                    <span className="upm-avatar-zoom" aria-hidden>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
                      </svg>
                    </span>
                  )}
                </button>

                <div className="upm-id">
                  <h2 className="upm-name">{u.name}</h2>
                  {u.positionTitle && <div className="upm-position">{u.positionTitle}</div>}
                  {(u.directorate || u.unit) && (
                    <div className="upm-org">
                      {u.directorate?.name}
                      {u.directorate && u.unit && <span className="upm-org-sep"> › </span>}
                      {u.unit?.name}
                    </div>
                  )}
                  <div className="upm-status-row">
                    <Pill tone={presenceTone(slug)} variant="soft" dot>
                      {t(slugLabel(slug))}
                    </Pill>
                    {data.presence?.statusMessage && (
                      <span className="upm-status-msg">{data.presence.statusMessage}</span>
                    )}
                    {data.presence?.lastActivityAt && (
                      <span className="upm-active">
                        {t('Active {{time}}', { time: formatRelativeTime(data.presence.lastActivityAt).text })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Kontak ── */}
              {(u.email || u.phone) && (
                <div className="upm-section">
                  {u.email && (
                    <button className={`upm-contact${copied ? ' is-copied' : ''}`} onClick={copyEmail} type="button" title={t('Click to copy email')}>
                      <svg className="upm-contact__ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                      </svg>
                      <span className="upm-contact__val">{u.email}</span>
                      <span className="upm-contact__hint">{copied ? t('✓ Copied!') : t('Copy')}</span>
                    </button>
                  )}
                  {u.phone && (
                    <a className="upm-contact" href={`tel:${u.phone}`}>
                      <svg className="upm-contact__ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
                      </svg>
                      <span className="upm-contact__val">{u.phone}</span>
                    </a>
                  )}
                </div>
              )}

              {/* ── Atasan langsung (klik → buka profilnya) ── */}
              {data.supervisor && (
                <div className="upm-section">
                  <div className="upm-section__label">{t('Reports to')}</div>
                  <button
                    className="upm-supervisor"
                    onClick={() => onNavigate(data.supervisor!.id)}
                    type="button"
                    title={t('View profile')}
                  >
                    <Avatar name={data.supervisor.name} avatarUrl={data.supervisor.avatarUrl} size={34} />
                    <span className="upm-supervisor__meta">
                      <span className="upm-supervisor__name">{data.supervisor.name}</span>
                      {data.supervisor.positionTitle && (
                        <span className="upm-supervisor__pos">{data.supervisor.positionTitle}</span>
                      )}
                    </span>
                    <svg className="upm-supervisor__chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              )}

              {/* ── Beban kerja ── */}
              <div className="upm-section">
                <div className="upm-section__label">{t('Workload')}</div>
                <div className="upm-stats">
                  <Stat size="md" label={t('Active tasks')} value={<WorkloadValue n={data.workload.activeTasks} />} />
                  <Stat size="md" label={t('Assignments')} value={<WorkloadValue n={data.workload.activeAssignments} />} />
                  <Stat size="md" label={t('Programs')} value={<WorkloadValue n={data.workload.programsOwned} />} />
                </div>
              </div>

              {/* ── Aksi ── */}
              {!isSelf && (
                <div className="upm-footer">
                  <Button
                    variant="primary"
                    onClick={sendDm}
                    disabled={dmBusy}
                    iconLeft={
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                        <path d="M14 2H2C1.45 2 1 2.45 1 3v9c0 .55.45 1 1 1h2v2.5l3.5-2.5H14c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      </svg>
                    }
                  >
                    {dmBusy ? t('Opening…') : t('Send DM')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {lightbox && photo && (
        // Lightbox dibuka DARI modal (z 9900) → butuh z lebih tinggi via varian.
        <ImageLightbox url={photo} name={u?.name ?? 'photo'} className="lightbox-overlay--above-modal" onClose={() => setLightbox(false)} />
      )}
    </>,
    document.body,
  )
}

/**
 * Provider global. Mount sekali (di app.tsx, dalam WorkspaceProvider agar
 * Send DM bisa akses workspace). Menyediakan openProfile(userId) ke seluruh app.
 */
export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<number | null>(null)
  const openProfile = useCallback((id: number) => setUserId(id), [])
  const closeProfile = useCallback(() => setUserId(null), [])

  return (
    <ProfileViewerContext.Provider value={{ openProfile, closeProfile }}>
      {children}
      {userId != null && (
        // key=userId → remount bersih saat pindah ke profil atasan (fetch ulang).
        <ProfileModal key={userId} userId={userId} onClose={closeProfile} onNavigate={openProfile} />
      )}
    </ProfileViewerContext.Provider>
  )
}
