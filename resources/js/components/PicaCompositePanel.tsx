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
        setError(err?.message || 'Gagal memuat konteks PICA')
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
    ? `${data.openBlockers.length} problem · ${data.continuity.unresolvedItems.length} action carryover`
    : undefined

  // Section header tetap visible meskipun collapsed (dari CollapsibleSection primitive)
  return (
    <CollapsibleSection
      title="PICA — Bahan Diskusi Rapat"
      count={data ? data.openBlockers.length + data.continuity.unresolvedItems.length : undefined}
      summary={summary}
      defaultOpen={isRelevant}
      persistKey={`pica.collapsed.${meetingType}`}
    >
      {loading && (
        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Memuat konteks PICA…
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
            Coba lagi
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
                <div>Problem</div>
                <div>Issue / Akar Masalah</div>
                <div>Countermeasure</div>
                <div>Action</div>
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
  if (!continuity.previousMeeting) {
    return (
      <div className="pica-continuity pica-continuity--empty">
        <span className="pica-continuity__label">Continuity</span>
        <span className="pica-continuity__text">Ini rapat koordinasi pertama untuk program ini.</span>
      </div>
    )
  }
  const rate = continuity.completionRate
  const rateColor = rate === null ? 'muted' : rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red'
  return (
    <div className="pica-continuity">
      <div className="pica-continuity__head">
        <span className="pica-continuity__label">Continuity dari rapat sebelumnya</span>
        <span className="pica-continuity__meeting">{continuity.previousMeeting.title}</span>
        {rate !== null && (
          <span className={`pica-continuity__rate pica-continuity__rate--${rateColor}`}>
            {rate}% selesai ({continuity.totalItems - continuity.unresolvedItems.length}/{continuity.totalItems})
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
  return (
    <div className="pica-empty">
      <strong>Tidak ada problem terbuka di program ini.</strong>
      <p>
        {hasContinuity
          ? 'Agenda rapat bisa fokus ke continuity items dan diskusi strategis.'
          : 'Bagus — ini momen tepat untuk strategic discussion atau preview risiko ke depan.'}
      </p>
    </div>
  )
}

function ProgressLogContext({ log }: { log: ProgressLog }) {
  if (!log.kendala && !log.dukunganDibutuhkan) return null
  return (
    <div className="pica-progress-log">
      <div className="pica-progress-log__head">
        <span className="pica-progress-log__label">Konteks dari ProgressLog terbaru</span>
        <span className="pica-progress-log__period">Periode {log.period}</span>
      </div>
      {log.kendala && (
        <div className="pica-progress-log__row">
          <span className="pica-progress-log__row-label">Kendala</span>
          <span>{log.kendala}</span>
        </div>
      )}
      {log.dukunganDibutuhkan && (
        <div className="pica-progress-log__row">
          <span className="pica-progress-log__row-label">Dukungan dibutuhkan</span>
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
        setConflictMsg(e.message || 'Versi terbaru dari rekan kerja masuk lebih dulu.')
      } else {
        setConflictMsg(e.message || 'Gagal menyimpan')
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
          <div className="pica-cell__meta">Task: {blocker.task.title}</div>
        )}
      </div>

      {/* Issue / Akar masalah */}
      <div className="pica-cell pica-cell--issue">
        <div className="pica-cell__text">{issueText}</div>
        {!blocker.rootCause && fallbackKendala && (
          <div className="pica-cell__meta-faint">dari ProgressLog</div>
        )}
      </div>

      {/* Countermeasure (editable) */}
      <div className="pica-cell pica-cell--countermeasure">
        {!editing ? (
          <>
            <div className="pica-cell__text">
              {blocker.resolution || <em style={{ color: 'var(--text-muted)' }}>Belum ada countermeasure</em>}
            </div>
            <button
              type="button"
              className="pica-cell__edit-btn"
              onClick={() => setEditing(true)}
            >
              {blocker.resolution ? 'Edit' : 'Tulis countermeasure'}
            </button>
          </>
        ) : (
          <div className="pica-cell__editor">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Tulis langkah perbaikan…"
              className="pica-cell__textarea"
            />
            {conflictMsg && (
              <div className="pica-cell__conflict">{conflictMsg}</div>
            )}
            <div className="pica-cell__editor-actions">
              <button type="button" onClick={handleCancel} disabled={saving} className="btn btn--ghost btn--sm">
                Batal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || draft.trim().length === 0}
                className="btn btn--primary btn--sm"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
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
              title: `Tindak lanjut: ${blocker.title}`,
              description: blocker.resolution || blocker.description || undefined,
              linkedWorkItemId: blocker.workItemId,
            })}
          >
            + Buat Action Item
          </button>
        ) : (
          <span className="pica-cell__hint">
            {isOrganizer ? '—' : 'Hanya organizer'}
          </span>
        )}
        {blocker.assignee && (
          <div className="pica-cell__meta-faint">Assignee: {blocker.assignee.name}</div>
        )}
      </div>
    </div>
  )
}
