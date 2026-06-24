import { useState, useEffect, useId } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { formatKpiValue } from '../lib/kpi'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import './ConditionReportModal.css'

export type HealthAtTime = 'on_track' | 'at_risk' | 'terlambat' | 'overdue'

type KpiRow = {
  id: number
  name: string
  targetValue: number | null
  actualValue: number | null
  unitOfMeasure: string | null
  dataType: string | null
}

/** "2026-W26" → Friday's date (YYYY-MM-DD), used as KPI measurementDate. */
function isoWeekToFriday(period: string): string {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(period)
  if (!m) return new Date().toISOString().slice(0, 10)
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  const jan4 = new Date(year, 0, 4)
  const jan4IsoDay = ((jan4.getDay() + 6) % 7) + 1
  const w01Mon = new Date(year, 0, 4 - jan4IsoDay + 1)
  const friday = new Date(w01Mon)
  friday.setDate(w01Mon.getDate() + (week - 1) * 7 + 4)
  return friday.toISOString().slice(0, 10)
}

type Props = {
  programId: number
  programCode: string
  programName: string
  /** Auto-derived health label (badge) shown for contrast against the reported one. */
  autoHealthLabel?: string
  onClose: () => void
  onSaved: (period: string, healthAtTime: HealthAtTime) => void
}

type Form = {
  period: string
  healthAtTime: HealthAtTime
  narrative: string
  kendala: string
  correctiveAction: string
  nextStep: string
  dukunganDibutuhkan: string
}

const EMPTY: Form = {
  period: '', healthAtTime: 'on_track', narrative: '',
  kendala: '', correctiveAction: '', nextStep: '', dukunganDibutuhkan: '',
}

// Segmented status options — the 4 reporting-period classifications, surfaced
// front-and-center (the feedback: these 4 must live in the work area, not buried
// in a dropdown inside Program detail).
const STATUS_OPTIONS: Array<{ value: HealthAtTime; label: string; tone: string }> = [
  { value: 'on_track',  label: 'On Track',  tone: 'green' },
  { value: 'at_risk',   label: 'At Risk',   tone: 'amber' },
  { value: 'terlambat', label: 'Delayed',   tone: 'red' },
  { value: 'overdue',   label: 'Overdue',   tone: 'gray' },
]

/** "2026-W26" → "Week 26 · 2026" */
function weekLabel(period: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(period)
  if (!m) return period
  return `Week ${Number(m[2])} · ${m[1]}`
}

/**
 * Standalone "Report Condition" modal — the single-door entry for a PIC to log
 * the program's reporting-period condition (4-status + PICA narrative) from the
 * Workboard. Talks to the existing reflection contract:
 *   GET  /programs/{id}/reflection-meta  → current week + prefill + existing log
 *   POST /programs/{id}/progress-log     → upsert the weekly reflection
 * Auto-derived Program.healthStatus is untouched (prefer-derived); this records
 * the PIC's reported assessment alongside it.
 */
export function ConditionReportModal({
  programId, programCode, programName, autoHealthLabel, onClose, onSaved,
}: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const descId = useId()
  const dialogRef = useDialogFocus<HTMLDivElement>(true)

  const [form, setForm] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLate, setIsLate] = useState(false)
  const [hasExisting, setHasExisting] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [kpis, setKpis] = useState<KpiRow[]>([])
  const [kpiActuals, setKpiActuals] = useState<Record<number, string>>({})
  const [kpiWarning, setKpiWarning] = useState<string | null>(null)
  const [canReport, setCanReport] = useState(true)

  useEscKey(() => { if (!saving) onClose() }, true)

  // Load current-week meta: prefill from auto health, or the existing log if the
  // PIC already reported this week (so they edit, not blind-restart).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get<{ data: {
      weekIso: string
      state?: string
      prefill?: { healthAtTime?: HealthAtTime; narrative?: string; kendala?: string }
      existing?: {
        period: string; healthAtTime: HealthAtTime; narrative: string
        kendala: string | null; correctiveAction: string | null
        nextStep: string | null; dukunganDibutuhkan: string | null; isLate: boolean
      } | null
      kpis?: KpiRow[]
      canReport?: boolean
    } }>(`/programs/${programId}/reflection-meta`)
      .then(res => {
        if (cancelled) return
        const d = res.data
        setKpis(d.kpis ?? [])
        setCanReport(d.canReport ?? true)
        const ex = d.existing
        if (ex) {
          setHasExisting(true)
          setForm({
            period: ex.period,
            healthAtTime: ex.healthAtTime,
            narrative: ex.narrative,
            kendala: ex.kendala ?? '',
            correctiveAction: ex.correctiveAction ?? '',
            nextStep: ex.nextStep ?? '',
            dukunganDibutuhkan: ex.dukunganDibutuhkan ?? '',
          })
          setFollowUpOpen(
            !!(ex.kendala || ex.correctiveAction || ex.nextStep || ex.dukunganDibutuhkan),
          )
        } else {
          // Meeting→reflection bridge: ProgramDetailView hands off via this
          // sessionStorage key. Consume it (narrative/kendala) and clear.
          let bridge: { narrative?: string; kendala?: string } = {}
          try {
            const raw = sessionStorage.getItem(`atlas:progress-log-prefill.${programId}`)
            if (raw) { bridge = JSON.parse(raw); sessionStorage.removeItem(`atlas:progress-log-prefill.${programId}`) }
          } catch { /* malformed — ignore */ }
          const narrative = bridge.narrative ?? d.prefill?.narrative ?? ''
          const kendala = bridge.kendala ?? d.prefill?.kendala ?? ''
          setForm({
            ...EMPTY,
            period: d.weekIso,
            healthAtTime: d.prefill?.healthAtTime ?? 'on_track',
            narrative,
            kendala,
          })
          setFollowUpOpen(!!kendala)
        }
        setIsLate(d.state === 'late' || d.state === 'missed')
      })
      .catch(() => { if (!cancelled) setError(t('Failed to load this week’s reporting window.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [programId, t])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.narrative.trim()) {
      setError(t('Please describe this week’s progress.'))
      return
    }
    setSaving(true)
    setError(null)
    setKpiWarning(null)
    try {
      await api.post(`/programs/${programId}/progress-log`, {
        period: form.period,
        healthAtTime: form.healthAtTime,
        narrative: form.narrative.trim(),
        kendala: form.kendala.trim() || null,
        correctiveAction: form.correctiveAction.trim() || null,
        nextStep: form.nextStep.trim() || null,
        dukunganDibutuhkan: form.dukunganDibutuhkan.trim() || null,
      })

      // KPI actuals ride along with the weekly condition report (realization =
      // Do). Recorded as the Friday measurement of this ISO week. A KPI failure
      // is non-fatal — the condition report is already saved; surface a warning.
      const entries = Object.entries(kpiActuals)
        .filter(([, v]) => v.trim() !== '' && !Number.isNaN(Number(v)))
      if (entries.length > 0) {
        const measurementDate = isoWeekToFriday(form.period)
        const settled = await Promise.allSettled(entries.map(([kpiId, value]) =>
          api.post(`/kpis/${kpiId}/values`, { measurementDate, actualValue: Number(value) }),
        ))
        const failed = settled.filter(r => r.status === 'rejected').length
        if (failed > 0) {
          // The condition report itself IS saved — acknowledge it (board badge +
          // "Reported" pill) so the user gets positive feedback, then keep the
          // modal open with a warning so they can retry just the KPI values.
          onSaved(form.period, form.healthAtTime)
          setKpiWarning(t('Condition saved, but {{count}} KPI value(s) failed to record. You can retry below.', { count: failed }))
          setSaving(false)
          return
        }
      }

      onSaved(form.period, form.healthAtTime)
      onClose()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? t('Failed to save. Please try again.'))
      setSaving(false)
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="modal-backdrop cond-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        ref={dialogRef}
        className="modal modal--wide cond-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal__header">
          <div className="modal-headcopy">
            <span className="modal-kicker">
              {programCode}{form.period ? ` · ${weekLabel(form.period)}` : ''}
            </span>
            <h3 className="modal__title" id={titleId}>{t('Report Condition')}</h3>
            <p className="modal-subtitle" id={descId}>{programName}</p>
          </div>
          <button className="modal__close" onClick={onClose} aria-label={t('Close')} disabled={saving}>×</button>
        </div>

        {loading ? (
          <div className="cond-loading">{t('Loading…')}</div>
        ) : !canReport ? (
          <div className="cond-forbidden">
            <p className="cond-forbidden__msg">
              {t('Only the program PIC (owner or co-PIC) can report the condition.')}
            </p>
            {autoHealthLabel && (
              <p className="cond-forbidden__sub">{t('System reads')}: <strong>{autoHealthLabel}</strong></p>
            )}
            <div className="cond-actions">
              <button type="button" className="btn btn--primary" onClick={onClose}>{t('Close')}</button>
            </div>
          </div>
        ) : (
          <form className="reflection-form cond-form" onSubmit={submit}>
            <div className="cond-scroll">
            {(hasExisting || isLate) && (
              <div className={`cond-banner${isLate ? ' cond-banner--late' : ''}`}>
                {hasExisting && <span>{t('You already reported this week — saving updates it.')}</span>}
                {isLate && <span className="cond-banner__late">{t('Submitted after the Saturday deadline.')}</span>}
              </div>
            )}

            <div className="reflection-form__section">
              <div className="reflection-form__section-head">
                <span className="reflection-form__section-title">{t('Condition this week')}</span>
                {autoHealthLabel && (
                  <span className="cond-auto-hint">{t('System reads')}: <strong>{autoHealthLabel}</strong></span>
                )}
              </div>

              {/* Segmented 4-status picker — the heart of the feature */}
              <div className="cond-status" role="radiogroup" aria-label={t('Condition this week')}>
                {STATUS_OPTIONS.map(opt => (
                  <button
                    type="button"
                    key={opt.value}
                    role="radio"
                    aria-checked={form.healthAtTime === opt.value}
                    className={`cond-status__opt cond-status__opt--${opt.tone}${form.healthAtTime === opt.value ? ' is-selected' : ''}`}
                    onClick={() => set('healthAtTime', opt.value)}
                  >
                    <span className="cond-status__dot" aria-hidden="true" />
                    {t(opt.label)}
                  </button>
                ))}
              </div>

              <div className="reflection-form__row">
                <label className="reflection-form__label" htmlFor="cond-narrative">
                  {t('Current Progress')} <span className="reflection-form__required">*</span>
                </label>
                <textarea
                  id="cond-narrative"
                  className="reflection-form__input reflection-form__textarea"
                  rows={3}
                  value={form.narrative}
                  onChange={e => set('narrative', e.target.value)}
                  placeholder={t('e.g. BCMS workshop done with 3 stakeholders. Draft 80% — KADIV review next week.')}
                  required
                />
              </div>
            </div>

            {kpis.length > 0 && (
              <div className="reflection-form__section">
                <div className="reflection-form__section-head">
                  <span className="reflection-form__section-title">{t('KPI Actuals This Week')}</span>
                  <span className="reflection-form__section-sub">{t('optional · fill only what changed')}</span>
                </div>
                <div className="cond-kpis">
                  {kpis.map(kpi => {
                    const target = formatKpiValue(kpi.targetValue ?? undefined, kpi.unitOfMeasure ?? '', kpi.dataType ?? undefined)
                    const last = kpi.actualValue != null
                      ? formatKpiValue(kpi.actualValue, kpi.unitOfMeasure ?? '', kpi.dataType ?? undefined)
                      : null
                    return (
                      <div key={kpi.id} className="cond-kpi">
                        <div className="cond-kpi__meta">
                          <span className="cond-kpi__name">{kpi.name}</span>
                          <span className="cond-kpi__sub">
                            {t('Target')} {target}{last ? ` · ${t('last')} ${last}` : ` · ${t('no actual yet')}`}
                          </span>
                        </div>
                        <input
                          className="reflection-form__input cond-kpi__input"
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={kpiActuals[kpi.id] ?? ''}
                          onChange={e => setKpiActuals(s => ({ ...s, [kpi.id]: e.target.value }))}
                          placeholder={last ?? '—'}
                          aria-label={t('New actual for {{name}}', { name: kpi.name })}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="reflection-form__section reflection-form__section--collapsible" data-expanded={followUpOpen}>
              <button
                type="button"
                className="reflection-form__section-toggle"
                onClick={() => setFollowUpOpen(v => !v)}
                aria-expanded={followUpOpen}
                aria-controls="cond-followup"
              >
                <span className="reflection-form__section-toggle-icon" aria-hidden="true">{followUpOpen ? '−' : '+'}</span>
                <span className="reflection-form__section-title">{t('Follow-up Details')}</span>
                <span className="reflection-form__section-sub">{t('Obstacles, corrective actions, next steps, support')}</span>
              </button>
              {followUpOpen && (
                <div className="reflection-form__section-body" id="cond-followup">
                  <div className="reflection-form__grid">
                    <div className="reflection-form__row">
                      <label className="reflection-form__label" htmlFor="cond-kendala">{t('Obstacle')}</label>
                      <textarea id="cond-kendala" className="reflection-form__input reflection-form__textarea" rows={2}
                        value={form.kendala} onChange={e => set('kendala', e.target.value)} />
                    </div>
                    <div className="reflection-form__row">
                      <label className="reflection-form__label" htmlFor="cond-corrective">{t('Corrective Action')}</label>
                      <textarea id="cond-corrective" className="reflection-form__input reflection-form__textarea" rows={2}
                        value={form.correctiveAction} onChange={e => set('correctiveAction', e.target.value)} />
                    </div>
                    <div className="reflection-form__row">
                      <label className="reflection-form__label" htmlFor="cond-nextstep">{t('Next Step')}</label>
                      <textarea id="cond-nextstep" className="reflection-form__input reflection-form__textarea" rows={2}
                        value={form.nextStep} onChange={e => set('nextStep', e.target.value)} />
                    </div>
                    <div className="reflection-form__row">
                      <label className="reflection-form__label" htmlFor="cond-dukungan">{t('Support Needed')}</label>
                      <textarea id="cond-dukungan" className="reflection-form__input reflection-form__textarea" rows={2}
                        value={form.dukunganDibutuhkan} onChange={e => set('dukunganDibutuhkan', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            </div>{/* /.cond-scroll */}

            {error && <div className="cond-error" role="alert">{error}</div>}
            {kpiWarning && <div className="cond-error cond-error--warn" role="alert">{kpiWarning}</div>}

            <div className="cond-actions">
              <button type="button" className="btn" onClick={onClose} disabled={saving}>{t('Cancel')}</button>
              <button type="submit" className="btn btn--primary" disabled={saving || loading}>
                {saving ? t('Saving…') : hasExisting ? t('Update Report') : t('Save Report')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
