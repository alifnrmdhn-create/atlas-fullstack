/**
 * Disposition panel untuk item "Needs Action" di Focus.
 *
 * Sebelumnya klik item Needs Action cuma melempar user ke workspace program —
 * tidak ada cara menutup loop, sehingga atasan bingung "follow-up-nya kemana".
 * Panel ini memberi 3 jalur tindak lanjut yang konsisten dengan Clear the Path:
 *
 *   - Berikan dukungan ke PIC  → kirim arahan (notifikasi ke owner program)
 *   - Teruskan ke atas         → buat escalation (Clear the Path) ke atasan
 *   - Tandai sudah ditangani   → dismiss
 *
 * Tiap aksi memanggil POST /focus/dispositions sehingga item keluar dari Focus
 * (backend menyembunyikannya dari needsAction selama mute window). Reroute butuh
 * feature flag clear-the-path; dua aksi lain selalu tersedia.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import type { NeedsActionItem } from '../types'
import { api } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { SidePanel } from './ui'
import { EscalationCreateModal, type EscalationRequest } from './Escalation'

const tagLabel = (): Record<NeedsActionItem['tag'], string> => ({
  approval: i18n.t('Awaiting Approval'),
  blocker: i18n.t('Critical Blocker'),
  support: i18n.t('Needs Support'),
})

type Mode = 'view' | 'support'

export function NeedsActionPanel({
  item,
  onClose,
  onActed,
}: {
  item: NeedsActionItem
  onClose: () => void
  /** Dipanggil setelah disposition tersimpan — parent men-dismiss item & refresh. */
  onActed: (programId: number, tag: NeedsActionItem['tag']) => void
}) {
  const { t } = useTranslation()
  const navigate = useInertiaNavigate()
  const clearPathEnabled = useFeatureFlag('clear-the-path')
  const [mode, setMode] = useState<Mode>('view')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReroute, setShowReroute] = useState(false)

  const post = async (action: 'SUPPORTED' | 'HANDLED' | 'REROUTED', extra?: Record<string, unknown>) => {
    setSaving(true)
    setError(null)
    try {
      await api.post('/focus/dispositions', {
        programId: item.id,
        tag: item.tag,
        action,
        ...extra,
      })
      onActed(item.id, item.tag)
    } catch (err) {
      setError((err as Error).message || t('Action failed.'))
      setSaving(false)
    }
  }

  const safeClose = () => {
    if (saving) return
    if (mode === 'support' && note.trim() !== '' && !window.confirm(t('Discard unsaved note?'))) return
    onClose()
  }

  const openProgram = () => {
    navigate(`/programs/${item.id}`)
    onClose()
  }

  return (
    <SidePanel
      open
      onClose={safeClose}
      title={item.name}
      subtitle={`${item.code}${item.divisi !== '-' ? ` · ${item.divisi}` : ''}`}
      footer={
        <button type="button" className="btn btn--ghost btn--sm" onClick={openProgram}>
          {t('Open program →')}
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge badge--${item.tag === 'blocker' ? 'red' : item.tag === 'approval' ? 'blue' : 'yellow'}`}>
          {tagLabel()[item.tag]}
        </span>
      </div>

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>
          {t('What needs attention')}
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{item.reason}</p>
      </div>

      {error && (
        <div style={{ padding: '8px 10px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 4, fontSize: 12 }}>
          {error}
        </div>
      )}

      {mode === 'view' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            {t('Follow up')}
          </div>
          {/* "Give support to the PIC" hanya untuk ATASAN yang men-disposition program
              orang lain — bukan saat user ADALAH PIC-nya (mengirim arahan ke diri
              sendiri = no-op; note nguap). Untuk owner, aksi yang berarti = eskalasi
              (Clear the Path) atau buka program untuk resolve blocker. */}
          {!item.isOwner && (
            <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => setMode('support')}>
              {t('Give support to the PIC')}
            </button>
          )}
          {clearPathEnabled && (
            <button type="button" className={`btn btn--sm ${item.isOwner ? 'btn--primary' : 'btn--ghost'}`} disabled={saving} onClick={() => setShowReroute(true)}>
              {t('Escalate upward (Clear the Path)')}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => post('HANDLED')}>
            {saving ? t('Saving…') : t('Mark as handled')}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {t('Once acted upon, this item leaves your Focus.')}
          </p>
        </div>
      )}

      {mode === 'support' && (
        <form
          onSubmit={(e) => { e.preventDefault(); void post('SUPPORTED', { note: note.trim() }) }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t('Guidance for the PIC *')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              minLength={5}
              maxLength={2000}
              required
              autoFocus
              placeholder={t('What is your support/guidance? This message is sent as a notification to the program PIC.')}
              style={{ padding: '6px 10px', border: '1px solid var(--panel-border)', borderRadius: 4, font: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => { setMode('view'); setNote('') }}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={saving || note.trim().length < 5}>
              {saving ? t('Sending…') : t('Send support')}
            </button>
          </div>
        </form>
      )}

      {showReroute && (
        <EscalationCreateModal
          // Eskalasi blocker → sumber BLOCKER presisi (bukan AD_HOC terputus) supaya
          // OrgSummaryService bisa men-dedup item "needs escalation" begitu diangkat,
          // dan resolusi eskalasi tertaut balik ke blocker-nya. Fallback AD_HOC bila
          // item tak membawa blockerId (mis. tag support/approval).
          sourceType={item.blockerId ? 'BLOCKER' : 'AD_HOC'}
          sourceId={item.blockerId ?? null}
          prefillTitle={item.name}
          prefillDescription={item.reason}
          linkedProgramId={item.id}
          onClose={() => setShowReroute(false)}
          onCreated={(req: EscalationRequest) => {
            setShowReroute(false)
            void post('REROUTED', { escalationId: req.id })
          }}
        />
      )}
    </SidePanel>
  )
}
