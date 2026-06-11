/**
 * Sprint 4 — Clear the Path UI Components.
 *
 * Tiga komponen yang dipakai di banyak tempat:
 *   - EscalationButton       : tombol "Request Manager Support"
 *   - EscalationCreateModal  : form create escalation
 *   - EscalationTriagePanel  : side panel disposition (Commit/Reroute/Decline)
 *
 * Semua di-gate via useFeatureFlag('clear-the-path'). Kalau flag off, button
 * tidak render sama sekali (silent skip — bukan disabled).
 */
import { useEffect, useId, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { api } from '../lib/api'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useOnboardingTour } from '../hooks/useOnboardingTour'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
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

  // Trigger tour saat tombol pertama kali render (first time user lihat fitur)
  useOnboardingTour('clear-path-button', { trigger: enabled })

  if (!enabled) return null

  return (
    <>
      <button
        type="button"
        className={`btn btn--ghost ${size === 'sm' ? 'btn--sm' : ''}`}
        onClick={() => setOpen(true)}
        title="Escalate to your manager"
        data-tour="escalation-button"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 12V2M3 6l4-4 4 4" />
        </svg>
        Request Manager Support
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

  const isDirty = title !== prefillTitle || description !== prefillDescription
  const safeClose = () => {
    if (saving) return
    if (isDirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }
  useEscKey(safeClose, true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (title.trim().length < 3) { setError('Title must be at least 3 characters.'); return }
    setSaving(true)
    try {
      const payload = await api.post<{ data: EscalationRequest }>('/escalations', {
        sourceType, sourceId, title: title.trim(),
        description: description.trim() || null,
        linkedProgramId: linkedProgramId ?? null,
      })
      onCreated?.(payload.data)
    } catch (err) {
      setError((err as Error).message || 'Failed to submit escalation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={safeClose}>
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
              <h3 id={titleId} className="modal__title">Request Manager Support</h3>
              <p className="modal-subtitle">This is automatically routed to your direct manager for disposition.</p>
            </div>
            <button type="button" className="modal__close" onClick={safeClose} aria-label="Close">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m1 1 10 10M11 1 1 11" />
              </svg>
            </button>
          </div>
          <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Title *</span>
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
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Additional context (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What's making this stuck? What do you need from your manager?"
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
            <button type="button" className="btn btn--ghost" onClick={safeClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving || title.trim().length < 3}>
              {saving ? 'Submitting…' : 'Submit Escalation'}
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

  // Threshold aging dari server (config + override admin /admin/thresholds) —
  // dulu AgingIndicator selalu jatuh ke default hardcoded-nya sehingga knob
  // admin tanpa efek (audit temuan A5). undefined → default komponen.
  const escalationAging = (usePage().props as {
    thresholds?: { escalationAging?: { yellow: number; orange: number; red: number } }
  }).thresholds?.escalationAging

  // Trigger tour saat panel pertama kali dibuka
  useOnboardingTour('triage-panel', { trigger: true })

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
      setError((err as Error).message || 'Action failed.')
    } finally {
      setSaving(false)
    }
  }

  // Saving guard: Escape & backdrop click di SidePanel jangan menutup panel
  // saat ada request in-flight. Saat user sedang di sub-form (mode != 'view'),
  // serahkan Escape ke sub-form yang akan step-back ke 'view'; tanpa cek ini
  // window listener parent akan fire bareng dan menutup panel sekaligus.
  // Form-level dirty confirm dipegang masing-masing sub-form.
  const safeClose = () => {
    if (saving) return
    if (mode !== 'view') return
    onClose()
  }

  return (
    <SidePanel
      open
      onClose={safeClose}
      title={request.title}
      subtitle={`${request.code} · diajukan oleh ${request.requester?.name ?? '—'}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge badge--${statusToTone(request.status)}`}>{statusLabel(request.status)}</span>
        <AgingIndicator days={request.agingDays} thresholds={escalationAging} />
        {request.linkedProgram && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Program: {request.linkedProgram.code}
          </span>
        )}
      </div>

      {request.description && (
        <Section label="Context">
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
              Mark Resolved (Cleared)
            </button>
          )}
          {!canDispose && !canResolve && !isRequester && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No actions available to you.</p>
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
        <p style={{ margin: '0 0 4px' }}>Manager committed to resolve{req.commitmentDueDate ? ` by ${formatDate(req.commitmentDueDate)}` : ''}.</p>
        {req.commitmentNote && <p style={{ margin: 0, color: 'var(--text-muted)' }}>"{req.commitmentNote}"</p>}
      </div>
    )
  }
  if (req.status === 'CLEARED' && req.resolutionNote) {
    return <p style={{ fontSize: 12, margin: 0 }}>✓ Resolved: {req.resolutionNote}</p>
  }
  if (req.status === 'DECLINED' && req.declinedReason) {
    return <p style={{ fontSize: 12, margin: 0, color: 'var(--text-muted)' }}>✗ Declined: {req.declinedReason}</p>
  }
  if (req.status === 'REROUTED') {
    return <p style={{ fontSize: 12, margin: 0 }}>↻ Rerouted to {req.reroutedTo?.name ?? '—'}</p>
  }
  return null
}

function CommitForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (due: string, note: string) => void }) {
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const safeCancel = makeSafeCancel(saving, due !== '' || note !== '', onCancel)
  useEscKey(safeCancel, true)
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(due, note) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Target completion date (optional)</span>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} min={new Date().toISOString().slice(0, 10)} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Notes (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Commit" onCancel={safeCancel} />
    </form>
  )
}

function DeclineForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const safeCancel = makeSafeCancel(saving, reason !== '', onCancel)
  useEscKey(safeCancel, true)
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Decline reason *</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required minLength={5} maxLength={1000} autoFocus style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Decline" disabled={reason.trim().length < 5} onCancel={safeCancel} />
    </form>
  )
}

function ResolveForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('')
  const safeCancel = makeSafeCancel(saving, note !== '', onCancel)
  useEscKey(safeCancel, true)
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(note) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Resolution note *</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} required minLength={5} maxLength={1000} autoFocus style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Mark Resolved" disabled={note.trim().length < 5} onCancel={safeCancel} />
    </form>
  )
}

function RerouteForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel: () => void; onSubmit: (targetId: number, note: string) => void }) {
  const [targetId, setTargetId] = useState('')
  const [note, setNote] = useState('')
  const id = parseInt(targetId, 10)
  const safeCancel = makeSafeCancel(saving, targetId !== '' || note !== '', onCancel)
  useEscKey(safeCancel, true)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (id) onSubmit(id, note) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Target user ID *</span>
        <input type="number" value={targetId} onChange={(e) => setTargetId(e.target.value)} required autoFocus style={inputStyle} />
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>MVP: manual user ID input. Next sprint: typeahead picker.</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Notes (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <FormActions saving={saving} primaryLabel="Reroute" disabled={!id} onCancel={safeCancel} />
    </form>
  )
}

/**
 * Bungkus onCancel agar:
 *   - Diam saat ada async in-flight (saving=true)
 *   - Tampilkan confirm() saat ada perubahan yg belum disimpan
 * Dipakai untuk Escape (via useEscKey) dan tombol Batal di sub-form triage.
 */
function makeSafeCancel(saving: boolean, isDirty: boolean, onCancel: () => void): () => void {
  return () => {
    if (saving) return
    if (isDirty && !window.confirm('Discard unsaved changes?')) return
    onCancel()
  }
}

function FormActions({ saving, primaryLabel, disabled, onCancel }: { saving: boolean; primaryLabel: string; disabled?: boolean; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="submit" className="btn btn--primary btn--sm" disabled={saving || disabled}>
        {saving ? 'Saving…' : primaryLabel}
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
    REQUESTED: 'Awaiting',
    COMMITTED: 'Committed',
    IN_PROGRESS: 'In Progress',
    CLEARED: 'Resolved',
    DECLINED: 'Declined',
    REROUTED: 'Rerouted',
  } as const)[s] ?? s
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}
