/**
 * Admin Thresholds — Post-MVP.
 * Superadmin dynamic config untuk threshold values yang tadinya hardcoded
 * di config/atlas-thresholds.php. Live tanpa restart.
 */
import { useState } from 'react'
import { usePage } from '@inertiajs/react'
import { api } from '../lib/api'
import './AdminViews.css'

type FieldDef = {
  label: string
  type: 'int' | 'float' | 'string'
  unit?: string
}

type CategorySection = {
  category: string
  title: string
  helper: string
  fields: Record<string, FieldDef>
}

type OverrideRow = {
  key: string
  value: unknown
  category: string
  description?: string | null
  updatedAt: string
}

type PageProps = {
  schema: CategorySection[]
  defaults: Record<string, Record<string, unknown>>  // {category: {key: defaultValue}}
  overrides: Record<string, OverrideRow>             // {key: row}
}

/** Resolve dotted path dari defaults dict. */
function resolveDefault(defaults: PageProps['defaults'], key: string): unknown {
  const parts = key.split('.')
  let current: unknown = defaults
  for (const p of parts) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[p]
  }
  return current
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function FieldRow({
  fullKey, def, category, defaultValue, override, onSave, onReset,
}: {
  fullKey: string
  def: FieldDef
  category: string
  defaultValue: unknown
  override: OverrideRow | null
  onSave: (value: number | string) => Promise<void>
  onReset: () => Promise<void>
}) {
  const currentValue = override ? override.value : defaultValue
  const [draft, setDraft] = useState<string>(formatValue(currentValue))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCustomized = override !== null

  const handleSave = async () => {
    setError(null)
    let parsed: number | string = draft
    if (def.type === 'int') {
      const n = parseInt(draft, 10)
      if (isNaN(n)) { setError('Harus angka bulat'); return }
      parsed = n
    } else if (def.type === 'float') {
      const n = parseFloat(draft)
      if (isNaN(n)) { setError('Harus angka'); return }
      parsed = n
    }
    setSaving(true)
    try { await onSave(parsed) }
    catch (e) { setError((e as Error).message || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleReset = async () => {
    if (!isCustomized) return
    setSaving(true)
    try {
      await onReset()
      setDraft(formatValue(defaultValue))
    } catch (e) {
      setError((e as Error).message || 'Gagal reset')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="threshold-row">
      <div className="threshold-row__main">
        <label className="threshold-row__label">
          {def.label}
          {isCustomized && <span className="threshold-row__customized" title="Custom override aktif">●</span>}
        </label>
        <span className="threshold-row__key">{fullKey}</span>
      </div>
      <div className="threshold-row__input-wrap">
        <input
          className="threshold-row__input"
          type={def.type === 'string' ? 'text' : 'number'}
          step={def.type === 'float' ? '0.01' : '1'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
        />
        {def.unit && <span className="threshold-row__unit">{def.unit}</span>}
      </div>
      <div className="threshold-row__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => void handleSave()}
          disabled={saving || draft === formatValue(currentValue)}
        >
          {saving ? '…' : 'Save'}
        </button>
        {isCustomized && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => void handleReset()}
            disabled={saving}
            title={`Reset ke default: ${formatValue(defaultValue)}`}
          >
            Reset
          </button>
        )}
      </div>
      {error && <div className="threshold-row__error">{error}</div>}
      {isCustomized && (
        <div className="threshold-row__hint">
          Default: <code>{formatValue(defaultValue)}</code>
        </div>
      )}
    </div>
  )
}

export default function AdminThresholdsView() {
  const initial = usePage<PageProps>().props
  const [overrides, setOverrides] = useState<Record<string, OverrideRow>>(initial.overrides)

  const handleSave = async (key: string, category: string, value: number | string): Promise<void> => {
    const res = await api.patch<{ data: OverrideRow }>('/admin/thresholds', {
      key, value, category,
    })
    setOverrides(prev => ({ ...prev, [key]: res.data }))
  }

  const handleReset = async (key: string): Promise<void> => {
    await api.post('/admin/thresholds/reset', { key })
    setOverrides(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  return (
    <div className="ds admin-v2 view-thresholds">
      <div className="perf-toolbar">
        <span className="perf-toolbar__title">Threshold Settings</span>
        <div className="perf-toolbar__sep" />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Konfigurasi dinamis perilaku sistem PDCA. Live — tanpa restart.
        </span>
      </div>

      <div className="thresholds-page">
        <div className="thresholds-banner">
          <strong>⚠ Hati-hati</strong> — angka di sini mempengaruhi perilaku sistem yang dirasakan
          semua user. Ubah satu setting pada satu waktu, observasi efek 1–2 hari, lalu adjust lagi
          jika perlu. Cache TTL 60 detik — efek terlihat dalam 1 menit.
        </div>

        {initial.schema.map(section => (
          <section key={section.category} className="thresholds-section">
            <header className="thresholds-section__head">
              <h3 className="thresholds-section__title">{section.title}</h3>
              <p className="thresholds-section__helper">{section.helper}</p>
            </header>
            <div className="thresholds-section__rows">
              {Object.entries(section.fields).map(([fullKey, def]) => (
                <FieldRow
                  key={fullKey}
                  fullKey={fullKey}
                  def={def}
                  category={section.category}
                  defaultValue={resolveDefault(initial.defaults, fullKey)}
                  override={overrides[fullKey] ?? null}
                  onSave={(value) => handleSave(fullKey, section.category, value)}
                  onReset={() => handleReset(fullKey)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
