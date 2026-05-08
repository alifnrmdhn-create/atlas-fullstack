/**
 * Sprint 4 — Clear the Path UI Components.
 *
 * Tiga komponen yang dipakai di banyak tempat:
 *   - EscalationButton       : tombol "Butuh Dukungan Atasan"
 *   - EscalationCreateModal  : form create escalation
 *   - EscalationTriagePanel  : side panel disposition (Commit/Reroute/Decline)
 *
 * Semua di-gate via useFeatureFlag('clear-the-path'). Kalau flag off, button
 * tidak render sama sekali (silent skip — bukan disabled).
 */
import { useEffect, useId, useState } from 'react'
import { api } from '../lib/api'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { AgingIndicator, SidePanel } from './ui'

export type EscalationSourceType = 'BLOCKER' | 'PROGRESS_LOG' | 'ACTION_ITEM' | 'AD_HOC'
export type EscalationStatus = 'REQUESTED' | 'COMMITTED' | 'IN_PROGRESS' | 'CLEARED' | 'DECLINED' | 'REROUTED'

export type EscalationRequest = {
  id: number
  code: string
  sourceType: EscalationSourceType
  sourceId: number | null
  requestedById: number
  requestedAt: string
  title: string
  description: string | null
  escalatedToId: number
  linkedProgramId: number | null
  status: EscalationStatus
  committedAt: string | null
  commitmentDueDate: string | null
  commitmentNote: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  reroutedToId: number | null
  declinedReason: string | null
  agingDays: number
  createdAt: string
  updatedAt: string
  requester?: { id: number; name: string; roleType?: string; positionTitle?: string }
  escalatedTo?: { id: number; name: string; roleType?: string; positionTitle?: string }
  reroutedTo?: { id: number; name: string }
  linkedProgram?: { id: number; code: string; name: string }
}

// ── EscalationButton ───────────────────────────────────────────────────────
export function EscalationButton({
  sourceType,
  sourceId,
  prefillTitle,
  prefillDescription,
  linkedProgramId,
  onCreated,
  size = 'md',
}: {
  sourceType: EscalationSourceType
  sourceId?: number | null
  prefillTitle?: string
  prefillDescription?: string
  linkedProgramId?: number | null
  onCreated?: (req: EscalationRequest) => void
  size?: 'sm' | 'md'
}) {
  const enabled = useFeatureFlag('clear-the-path')
  const [open, setOpen] = useState(false)

  if (!enabled) return null

  return (
    <>
      <button
        type="button"
        className={`btn btn--ghost ${size === 'sm' ? 'btn--sm' : ''}`}
        onClick={() => setOpen(true)}
        title="Eskalasi ke atasan langsung"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 12V2M3 6l4-4 4 4" />
        </svg>
        Butuh Dukungan Atasan
      </button>
      {open && (
        <EscalationCreateModal
          sourceType={sourceType}
          sourceId={sourceId ?? null}
          prefillTitle={prefillTitle}
          prefillDescription={prefillDescription}
          linkedProgramId={linkedProgramId ?? null}
          onClose={() => setOpen(false)}
          onCreated={(req) => { setOpen(false); onCreated?.(req) }}
        />
      )}
    </>
  )
}

// ── EscalationCreateModal ──────────────────────────────────────────────────
export function EscalationCreateModal({
  sourceType, sourceId, prefillTitle = '', prefillDescription = '', linkedProgramId,
  onClose, onCreated,
}: {
  sourceType: EscalationSourceType
  sourceId: number | null
  prefillTitle?: string
  prefillDescription?: string
  linkedProgramId?: number | null
  onClose: () => void
  onCreated?: (req: EscalationRequest) => void
}) {
  const titleId = useId()
  const dialogRef = useDialogFocus<HTMLDivElement>(true)
  const [title, setTitle] = useState(prefillTitle)
  const [description, setDescription] = useState(prefillDescription)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (title.trim().length < 3) { setError('Judul minimal 3 karakter.'); return }
    setSaving(true)
    try {
      const payload = await api.post<{ data: EscalationRequest }>('/escalations', {
        sourceType, sourceId, title: title.trim(),
        description: description.trim() || null,
        linkedProgramId: linkedProgramId ?? null,
      })
      onCreated?.(payload.data)
    } catch (err) {
      setError((err as Error).message || 'Gagal mengajukan eskalasi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal escalation-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <form onSubmit={handleSubmit}>
          <div className="modal__header">
            <div className="modal-headcopy">
              <span className="modal-kicker">Clear the Path</span>
              <h3 id={titleId} className="modal__title">Butuh Dukungan Atasan</h3>
              <p className="modal-subtitle">Sistem akan otomatis mengarahkan ke atasan langsung Anda untuk disposition.</p>
            </div>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Tutup">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m1 1 10 10M11 1 1 11" />
              </svg>
            </button>
          </div>
          <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Judul *</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                autoFocus
                style={{ padding: '6px 10px', border: '1px solid var(--panel-border)', borderRadius: 4, font: 'inherit' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Konteks tambahan (opsional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Apa yang membuat ini stuck? Apa yang Anda butuhkan dari atasan?"
                style={{ padding: '6px 10px', border: '1px solid var(--panel-border)', borderRadius: 4, font: 'inherit', resize: 'vertical' }}
              />
            </label>
            {error && (
              <div style={{ padding: '6px 10px', background: 'color-mix(in srgb, #c5302d 8%, transparent)', color: '#c5302d', borderRadius: 4, fontSize: 12 }}>
                {error}
              </div>
            )}
          </div>
          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="btn btn--primary" disabled={saving || title.trim().length < 3}>
              {saving ? 'Mengirim…' : 'Ajukan Eskalasi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── EscalationTriagePanel ──────────────────────────────────────────────────
type TriageMode = 'view' | 'commit' | 'reroute' | 'decline' | 'resolve'

export function EscalationTriagePanel({
  request, currentUserId, onClose, onUpdated,
}: {
  request: EscalationRequest
  currentUserId: number
  onClose: () => void
  onUpdated: (next: EscalationRequest) => void
}) {
  const [mode, setMode] = useState<TriageMode>('view')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTarget = request.escalatedToId === currentUserId
  const isRequester = request.requestedById === currentUserId
  const canDispose = isTarget && request.status === 'REQUESTED'
  const canResolve = isTarget && (request.status === 'COMMITTED' || request.status === 'IN_PROGRESS')

  // Keyboard shortcuts (C/R/D) saat mode view & canDispose
  useEffect(() => {
    if (mode !== 'view' || !canDispose) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key.toLowerCase() === 'c') setMode('commit')
      else if (e.key.toLowerCase() === 'r') setMode('reroute')
      else if (e.key.toLowerCase() === 'd') setMode('decline')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, canDispose])

  const performAction = async (path: string, body: Record<string, unknown>) => {
    setSaving(true); setError(null)
    try {
      const payload = await api.post<{ data: EscalationRequest }>(`/escalations/${request.id}/${path}`, body)
      onUpdated(payload.data)
    } catch (err) {
      setError((err as Error).message || 'Gagal melakukan aksi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidePanel
      open
      onClose={onClose}
      title={request.title}
      subtitle={`${request.code} · diajukan oleh ${request.requester?.name ?? '—'}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge badge--${statusToTone(request.status)}`}>{statusLabel(request.status)}</span>
        <AgingIndicator days={request.agingDays} />
        {request.linkedProgram && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Program: {request.linkedProgram.code}
          </span>
        )}
      </div>

      {request.description && (
        <Section label="Konteks">
          <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{request.description}</p>
        </Section>
      )}

      {request.status !== 'REQUESTED' && (
        <Section label="Disposition">
          <DispositionDetails req={request} />
        </Section>
      )}

      {error && (
        <div style={{ padding: '8px 10px', background: 'color-mix(in srgb, #c5302d 8%, transparent)', color: '#c5302d', borderRadius: 4, fontSize: 12 }}>
          {error}
        </div>
      )}

      {mode === 'view' && (
        <>
          {canDispose && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setMode('commit')}>
                Commit (C)
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode('reroute')}>
                Reroute (R)
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode('decline')}>
                Decline (D)
              </button>
            </div>
          )}
          {canResolve && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setMode('resolve')}>
              Tandai Selesai (Cleared)
            </button>
          )}
          {!canDispose && !canResolve && !isRequester && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tidak ada aksi tersedia untuk Anda.</p>
          )}
        </>
      )}

      {mode === 'commit' && (
        <CommitForm
          saving={saving}
          onCancel={() => setMode('view')}
          onSubmit={(due, note) => performAction('commit', { commitmentDueDate: due || null, commitmentNote: note || null })}
        />
      )}

      {mode === 'decline' && (
        <DeclineForm
          saving={saving}
          onCancel={() => setMode('view')}
          onSubmit={(reason) => performAction('decline', { declinedReason: reason })}
        />
      )}

      {mode === 'resolve' && (
        <ResolveForm
          saving={saving}
          onCancel={() => setMode('view')}
          onSubmit={(note) => performAction('resolve', { resolutionNote: note })}
        />
      )}

      {mode === 'reroute' && (
        <RerouteForm
          saving={saving}
          onCancel={() => setMode('view')}
          onSubmit={(targetId, note) => performAction('reroute', { reroutedToId: targetId, commitmentNote: note || null })}
        />
      )}
    </SidePanel>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function DispositionDetails({ req }: { req: EscalationRequest }) {
  if (req.status === 'COMMITTED' || req.status === 'IN_PROGRESS') {
    return (
      <div style={{ fontSize: 12, color: 'var(--text)' }}>
        <p style={{ margin: '0 0 4px' }}>Atasan commit menyelesaikan{req.commitmentDueDate ? ` sebelum ${formatDate(req.commitmentDueDate)}` : ''}.</p>
        {req.commitmentNote && <p style={{ margin: 0, color: 'var(--text-muted)' }}>"{req.commitmentNote}"</p>}
      </div>
    )
  }
  if (req.status === 'CLEARED' && req.resolutionNote) {
    return <p style={{ fontSize: 12, margin: 0 }}>✓ Diselesaikan: {req.resolutionNote}</p>
  }
  if (req.status === 'DECLINED' && req.declinedReason) {
    return <p style={{ fontSize: 12, margin: 0, color: 'var(--text-muted)' }}>✗ Ditolak: {req.declinedReason}</p>
  }
  if (req.status === 'REROUTED') {
    return <p style={{ fontSize: 12, margin: 0 }}>↻ Diteruskan ke {req.reroutedTo?.name ?? '—'}</p>
  }
  return null
}

function CommitForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (due: string, note: string) => void }) {
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(due, note) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Target tanggal selesai (opsional)</span>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} min={new Date().toISOString().slice(0, 10)} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Catatan (opsional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Commit" onCancel={onCancel} />
    </form>
  )
}

function DeclineForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Alasan menolak *</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required minLength={5} maxLength={1000} autoFocus style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Decline" disabled={reason.trim().length < 5} onCancel={onCancel} />
    </form>
  )
}

function ResolveForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(note) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Catatan penyelesaian *</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} required minLength={5} maxLength={1000} autoFocus style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Tandai Selesai" disabled={note.trim().length < 5} onCancel={onCancel} />
    </form>
  )
}

function RerouteForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (targetId: number, note: string) => void }) {
  const [targetId, setTargetId] = useState('')
  const [note, setNote] = useState('')
  const id = parseInt(targetId, 10)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (id) onSubmit(id, note) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>User ID target *</span>
        <input type="number" value={targetId} onChange={(e) => setTargetId(e.target.value)} required autoFocus style={inputStyle} />
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>MVP: input manual user ID. Sprint berikutnya: typeahead picker.</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Catatan (opsional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Reroute" disabled={!id} onCancel={onCancel} />
    </form>
  )
}

function FormActions({ saving, primaryLabel, disabled, onCancel }: { saving: boolean; primaryLabel: string; disabled?: boolean; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={saving}>Batal</button>
      <button type="submit" className="btn btn--primary btn--sm" disabled={saving || disabled}>
        {saving ? 'Menyimpan…' : primaryLabel}
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--panel-border)',
  borderRadius: 4,
  font: 'inherit',
  fontSize: 13,
}

function statusToTone(s: EscalationStatus): string {
  switch (s) {
    case 'REQUESTED': return 'yellow'
    case 'COMMITTED': case 'IN_PROGRESS': return 'green'
    case 'CLEARED': return 'green'
    case 'DECLINED': return 'red'
    case 'REROUTED': return 'muted'
    default: return 'muted'
  }
}

function statusLabel(s: EscalationStatus): string {
  return ({
    REQUESTED: 'Menunggu',
    COMMITTED: 'Di-commit',
    IN_PROGRESS: 'Berjalan',
    CLEARED: 'Selesai',
    DECLINED: 'Ditolak',
    REROUTED: 'Diteruskan',
  } as const)[s] ?? s
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
