/**
 * Quick-action panel untuk item Focus — menutup loop di tempat tanpa pindah halaman.
 *
 *   - blocker → Mark resolved (PUT /blockers/{id}/status RESOLVED + resolution)
 *   - task    → Log progress  (PUT /tasks/{id}/progress percentComplete + note)
 *
 * Footer selalu menyediakan "Open full detail →" untuk yang butuh konteks lengkap.
 * Hanya dibuka untuk role yang boleh mutasi (gating di pemanggil — BOD read-only
 * tetap navigate biasa).
 */
import { useState } from 'react'
import { api } from '../lib/api'
import { SidePanel } from './ui'

type QuickKind = 'blocker' | 'task'

export function FocusQuickPanel({
  kind,
  entityId,
  title,
  prefillPercent = 0,
  onClose,
  onActed,
  onOpenDetail,
}: {
  kind: QuickKind
  entityId: number
  title: string
  prefillPercent?: number
  onClose: () => void
  /** Dipanggil setelah aksi berhasil — pemanggil refresh + dismiss. */
  onActed: () => void
  onOpenDetail: () => void
}) {
  const [percent, setPercent] = useState(prefillPercent)
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = kind === 'task'
    ? percent !== prefillPercent || note.trim() !== ''
    : resolution.trim() !== ''

  const safeClose = () => {
    if (saving) return
    if (isDirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      if (kind === 'blocker') {
        await api.put(`/blockers/${entityId}/status`, { status: 'RESOLVED', resolution: resolution.trim() || null })
      } else {
        await api.put(`/tasks/${entityId}/progress`, { percentComplete: percent, note: note.trim() || null })
      }
      onActed()
    } catch (err) {
      setError((err as Error).message || 'Action failed.')
      setSaving(false)
    }
  }

  return (
    <SidePanel
      open
      onClose={safeClose}
      title={title}
      subtitle={kind === 'blocker' ? 'Resolve blocker' : 'Log progress'}
      footer={
        <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenDetail}>
          Open full detail →
        </button>
      }
    >
      {error && (
        <div style={{ padding: '8px 10px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 4, fontSize: 12 }}>
          {error}
        </div>
      )}

      {kind === 'blocker' && (
        <form onSubmit={(e) => { e.preventDefault(); void submit() }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: 'var(--text-muted)' }}>
            Menandai blocker ini selesai. Bila ini blocker terakhir di task-nya, task otomatis ter-unblock.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Resolution note (optional)</span>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              placeholder="Bagaimana blocker ini diselesaikan?"
              style={{ padding: '6px 10px', border: '1px solid var(--panel-border)', borderRadius: 4, font: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={safeClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
              {saving ? 'Saving…' : 'Mark resolved'}
            </button>
          </div>
        </form>
      )}

      {kind === 'task' && (
        <form onSubmit={(e) => { e.preventDefault(); void submit() }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, lineHeight: 1.5, margin: 0, color: 'var(--text-muted)' }}>
            Pintasan cepat — update ini tersimpan ke task yang sama di Workboard.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Progress: {percent}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Update note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Apa yang sudah dikerjakan / kendala?"
              style={{ padding: '6px 10px', border: '1px solid var(--panel-border)', borderRadius: 4, font: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={safeClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save progress'}
            </button>
          </div>
        </form>
      )}
    </SidePanel>
  )
}
