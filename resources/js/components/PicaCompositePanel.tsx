/**
 * PICA Composite Panel — Sprint 3
 *
 * Disposable view yang menyatukan 3 sumber data existing (Blocker, ProgressLog,
 * MeetingActionItem continuity) jadi struktur PICA agenda rapat koordinasi.
 *
 * Tidak ada storage baru — view-only composite. Inline edit countermeasure
 * dilakukan via PATCH /blockers/{id}/resolution.
 *
 * Realtime collab light: subscribe blocker:changed events lewat workspace SSE
 * existing. Saat broadcast diterima untuk blocker yang sedang ditampilkan,
 * highlight + offer refresh.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { CollapsibleSection } from './ui'
import type { MeetingType } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────
type BlockerSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

type PicaBlocker = {
  id: number
  code: string
  title: string
  description: string | null
  severity: BlockerSeverity
  status: string
  rootCause: string | null
  resolution: string | null
  workItemId: number
  assignedTo: number | null
  createdBy: number
  createdAt: string
  updatedAt: string
  task?: { id: number; title: string; initiativeId: number }
  assignee?: { id: number; name: string; roleType: string; positionTitle?: string }
  creator?: { id: number; name: string }
}

type ProgressLog = {
  id: number
  period: string
  healthAtTime: string
  narrative: string
  kendala: string | null
  dukunganDibutuhkan: string | null
  createdById: number
  createdByName: string | null
  createdAt: string
}

type ContinuityItem = {
  id: number
  title: string
  status: string
  dueDate: string | null
  assignedTo?: { id: number; name: string; roleType: string }
}

type Continuity = {
  previousMeeting: { id: number; title: string; startAt: string } | null
  unresolvedItems: ContinuityItem[]
  completionRate: number | null
  totalItems: number
}

type PicaPayload = {
  data: {
    openBlockers: PicaBlocker[]
    latestProgressLog: ProgressLog | null
    continuity: Continuity
  } | null
  note?: string
}

type Props = {
  meetingId: number
  meetingType: MeetingType
  linkedProgramId: number | null | undefined
  isOrganizer: boolean
  onCreateActionItem?: (prefill: { title: string; description?: string; linkedWorkItemId?: number }) => void
}

// dark-allow: fill badge severity ber-teks putih — butuh fill gelap konsisten
// dua theme (token status base jadi terang di dark → kontras teks putih pecah)
const SEVERITY_COLOR: Record<BlockerSeverity, string> = {
  CRITICAL: '#c5302d',
  HIGH:     '#d97706',
  MEDIUM:   '#9b6b00',
  LOW:      '#6b7280',
}

// ── Component ──────────────────────────────────────────────────────────────
export function PicaCompositePanel({
  meetingId, meetingType, linkedProgramId, isOrganizer, onCreateActionItem,
}: Props) {
  const { t } = useTranslation()
  const isRelevant = meetingType === 'RAPAT_KOORDINASI' && Boolean(linkedProgramId)
  const [data, setData] = useState<PicaPayload['data']>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.get<PicaPayload>(`/meetings/${meetingId}/pica-context`)
      .then(payload => {
        if (cancelled) return
        setData(payload.data)
        setNote(payload.note ?? null)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err?.message || t('Failed to load PICA context'))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [meetingId, refreshTick])

  // Realtime collab: subscribe blocker:changed events.
  // workspace SSE sudah running globally; kita tap event listener via DOM.
  useEffect(() => {
    if (!data) return
    const handler = (e: Event) => {
      const event = (e as CustomEvent<{ id: number; action: string }>).detail
      if (!event) return
      if (event.action === 'resolution-updated' && data.openBlockers.some(b => b.id === event.id)) {
        // Refresh agar resolution terbaru tampil
        setRefreshTick(t => t + 1)
      }
    }
    window.addEventListener('atlas:blocker:changed', handler)
    return () => window.removeEventListener('atlas:blocker:changed', handler)
  }, [data])

  const summary = data
    ? t('{{problems}} problem · {{carryover}} action carryover', {
        problems: data.openBlockers.length,
        carryover: data.continuity.unresolvedItems.length,
      })
    : undefined

  // Section header tetap visible meskipun collapsed (dari CollapsibleSection primitive)
  return (
    <CollapsibleSection
      title={t('PICA — Meeting Discussion Material')}
      count={data ? data.openBlockers.length + data.continuity.unresolvedItems.length : undefined}
      summary={summary}
      defaultOpen={isRelevant}
      persistKey={`pica.collapsed.${meetingType}`}
    >
      {loading && (
        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
          {t('Loading PICA context…')}
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--red, #c33)' }}>
          {error}
          <button
            type="button"
            onClick={() => setRefreshTick(t => t + 1)}
            style={{ marginLeft: 8, fontSize: 11, textDecoration: 'underline', background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }}
          >
            {t('Try again')}
          </button>
        </div>
      )}

      {!loading && !error && note && (
        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {note}
        </div>
      )}

      {!loading && !error && data && (
        <div className="pica-panel">
          <ContinuitySection continuity={data.continuity} />

          {data.openBlockers.length === 0 ? (
            <EmptyPicaState hasContinuity={data.continuity.unresolvedItems.length > 0} />
          ) : (
            <div className="pica-grid">
              <div className="pica-grid__head">
                <div>{t('Problem')}</div>
                <div>{t('Issue / Root Cause')}</div>
                <div>{t('Countermeasure')}</div>
                <div>{t('Action')}</div>
              </div>
              {data.openBlockers.map(b => (
                <PicaRow
                  key={b.id}
                  blocker={b}
                  fallbackKendala={data.latestProgressLog?.kendala ?? null}
                  isOrganizer={isOrganizer}
                  onCountermeasureSaved={() => setRefreshTick(t => t + 1)}
                  onCreateAction={onCreateActionItem}
                />
              ))}
            </div>
          )}

          {data.latestProgressLog && (
            <ProgressLogContext log={data.latestProgressLog} />
          )}
        </div>
      )}
    </CollapsibleSection>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ContinuitySection({ continuity }: { continuity: Continuity }) {
  const { t } = useTranslation()
  if (!continuity.previousMeeting) {
    return (
      <div className="pica-continuity pica-continuity--empty">
        <span className="pica-continuity__label">{t('Continuity')}</span>
        <span className="pica-continuity__text">{t('This is the first coordination meeting for this program.')}</span>
      </div>
    )
  }
  const rate = continuity.completionRate
  const rateColor = rate === null ? 'muted' : rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red'
  return (
    <div className="pica-continuity">
      <div className="pica-continuity__head">
        <span className="pica-continuity__label">{t('Continuity from previous meeting')}</span>
        <span className="pica-continuity__meeting">{continuity.previousMeeting.title}</span>
        {rate !== null && (
          <span className={`pica-continuity__rate pica-continuity__rate--${rateColor}`}>
            {t('{{rate}}% complete ({{done}}/{{total}})', {
              rate,
              done: continuity.totalItems - continuity.unresolvedItems.length,
              total: continuity.totalItems,
            })}
          </span>
        )}
      </div>
      {continuity.unresolvedItems.length > 0 && (
        <ul className="pica-continuity__list">
          {continuity.unresolvedItems.map(item => (
            <li key={item.id} className="pica-continuity__item">
              <span className="pica-continuity__item-status">{item.status}</span>
              <span className="pica-continuity__item-title">{item.title}</span>
              {item.assignedTo && <span className="pica-continuity__item-assignee">{item.assignedTo.name}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EmptyPicaState({ hasContinuity }: { hasContinuity: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="pica-empty">
      <strong>{t('No open problems in this program.')}</strong>
      <p>
        {hasContinuity
          ? t('The meeting agenda can focus on continuity items and strategic discussion.')
          : t('Great — this is a good moment for strategic discussion or a preview of upcoming risks.')}
      </p>
    </div>
  )
}

function ProgressLogContext({ log }: { log: ProgressLog }) {
  const { t } = useTranslation()
  if (!log.kendala && !log.dukunganDibutuhkan) return null
  return (
    <div className="pica-progress-log">
      <div className="pica-progress-log__head">
        <span className="pica-progress-log__label">{t('Context from latest Progress Log')}</span>
        <span className="pica-progress-log__period">{t('Period {{period}}', { period: log.period })}</span>
      </div>
      {log.kendala && (
        <div className="pica-progress-log__row">
          <span className="pica-progress-log__row-label">{t('Obstacle')}</span>
          <span>{log.kendala}</span>
        </div>
      )}
      {log.dukunganDibutuhkan && (
        <div className="pica-progress-log__row">
          <span className="pica-progress-log__row-label">{t('Support needed')}</span>
          <span>{log.dukunganDibutuhkan}</span>
        </div>
      )}
    </div>
  )
}

// ── PicaRow with inline countermeasure editor ──────────────────────────────

function PicaRow({
  blocker, fallbackKendala, isOrganizer,
  onCountermeasureSaved, onCreateAction,
}: {
  blocker: PicaBlocker
  fallbackKendala: string | null
  isOrganizer: boolean
  onCountermeasureSaved: () => void
  onCreateAction?: (prefill: { title: string; description?: string; linkedWorkItemId?: number }) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(blocker.resolution ?? '')
  const [saving, setSaving] = useState(false)
  const [conflictMsg, setConflictMsg] = useState<string | null>(null)

  const issueText = blocker.rootCause || fallbackKendala || '—'
  const sevColor = SEVERITY_COLOR[blocker.severity]

  const handleSave = async () => {
    setSaving(true)
    setConflictMsg(null)
    try {
      await api.patch(`/blockers/${blocker.id}/resolution`, {
        resolution: draft.trim(),
        expectedUpdatedAt: blocker.updatedAt,
      })
      setEditing(false)
      onCountermeasureSaved()
    } catch (err) {
      const e = err as { status?: number; message?: string; data?: { currentResolution?: string } }
      if (e.status === 409) {
        setConflictMsg(e.message || t('A newer version from a colleague was saved first.'))
      } else {
        setConflictMsg(e.message || t('Failed to save'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setDraft(blocker.resolution ?? '')
    setConflictMsg(null)
  }

  return (
    <div className="pica-row">
      {/* Problem */}
      <div className="pica-cell pica-cell--problem">
        <div className="pica-cell__head">
          <span className="pica-cell__sev" style={{ background: sevColor }}>{blocker.severity}</span>
          <span className="pica-cell__code">{blocker.code}</span>
        </div>
        <div className="pica-cell__title">{blocker.title}</div>
        {blocker.task && (
          <div className="pica-cell__meta">{t('Task: {{title}}', { title: blocker.task.title })}</div>
        )}
      </div>

      {/* Issue / Akar masalah */}
      <div className="pica-cell pica-cell--issue">
        <div className="pica-cell__text">{issueText}</div>
        {!blocker.rootCause && fallbackKendala && (
          <div className="pica-cell__meta-faint">{t('from ProgressLog')}</div>
        )}
      </div>

      {/* Countermeasure (editable) */}
      <div className="pica-cell pica-cell--countermeasure">
        {!editing ? (
          <>
            <div className="pica-cell__text">
              {blocker.resolution || <em style={{ color: 'var(--text-muted)' }}>{t('No countermeasure yet')}</em>}
            </div>
            <button
              type="button"
              className="pica-cell__edit-btn"
              onClick={() => setEditing(true)}
            >
              {blocker.resolution ? t('Edit') : t('Write countermeasure')}
            </button>
          </>
        ) : (
          <div className="pica-cell__editor">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder={t('Write the corrective action…')}
              className="pica-cell__textarea"
            />
            {conflictMsg && (
              <div className="pica-cell__conflict">{conflictMsg}</div>
            )}
            <div className="pica-cell__editor-actions">
              <button type="button" onClick={handleCancel} disabled={saving} className="btn btn--ghost btn--sm">
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || draft.trim().length === 0}
                className="btn btn--primary btn--sm"
              >
                {saving ? t('Saving…') : t('Save')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="pica-cell pica-cell--action">
        {onCreateAction && isOrganizer ? (
          <button
            type="button"
            className="pica-cell__action-btn"
            onClick={() => onCreateAction?.({
              title: t('Follow-up: {{title}}', { title: blocker.title }),
              description: blocker.resolution || blocker.description || undefined,
              linkedWorkItemId: blocker.workItemId,
            })}
          >
            {t('+ Create Action Item')}
          </button>
        ) : (
          <span className="pica-cell__hint">
            {isOrganizer ? '—' : t('Organizer only')}
          </span>
        )}
        {blocker.assignee && (
          <div className="pica-cell__meta-faint">{t('Assignee: {{name}}', { name: blocker.assignee.name })}</div>
        )}
      </div>
    </div>
  )
}
