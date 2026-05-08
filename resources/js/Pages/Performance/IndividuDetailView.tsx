import { useEffect, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import { api } from '../../lib/api'
import { ForecastBadge } from '../../components/ui'

type KpiItem = {
  no: number
  kode: string
  nama: string
  bobot: number
  satuan: string
  polaritas: 'maximize' | 'minimize'
  periode: string
  sasaran: string
  realisasi: string
  skor: number
  definisi: string | null
}

type Karyawan = {
  id: string
  nama: string
  jabatan: string
  unit: string
  nilai: number
  jumlah_kpi: number
}

type PageProps = {
  karyawan: Karyawan
  kpiItems: KpiItem[]
  periode: string
}

type LedgerWeek = {
  weekKey: string
  weekStart: string
  total: number
  hits: number
  misses: number
  hitRate: number | null
}

type LedgerData = {
  userId: number
  lookbackWeeks: number
  weeks: LedgerWeek[]
  hitRateAggregate: number | null
  streak: number
  streakMinPct: number
}

function CommitmentLedgerSection({ userId }: { userId: number }) {
  const enabled = useFeatureFlag('commitment-ledger')
  const [data, setData] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    let cancelled = false
    api.get<{ data: LedgerData }>(`/performance/individu/${userId}/ledger`)
      .then(payload => { if (!cancelled) { setData(payload.data); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError((err as Error).message); setLoading(false) } })
    return () => { cancelled = true }
  }, [enabled, userId])

  if (!enabled) return null

  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
        Komitmen Saya
      </div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Memuat ledger…</div>}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red, #c33)', padding: '8px 12px' }}>
          {error}
        </div>
      )}
      {!loading && !error && data && (
        <div className="ledger-card">
          <div className="ledger-summary">
            <div className="ledger-summary__metric">
              <span className="ledger-summary__label">Consistency ({data.lookbackWeeks} minggu)</span>
              <span className={`ledger-summary__value ledger-summary__value--${ledgerColor(data.hitRateAggregate)}`}>
                {data.hitRateAggregate !== null ? `${data.hitRateAggregate.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="ledger-summary__metric">
              <span className="ledger-summary__label">Streak ≥{data.streakMinPct}%</span>
              <span className="ledger-summary__value">
                {data.streak > 0 ? `${data.streak} minggu` : 'Belum ada'}
              </span>
            </div>
          </div>
          <div className="ledger-weeks">
            {data.weeks.map(w => (
              <div key={w.weekKey} className="ledger-week" title={`${w.weekKey}: ${w.hits}/${w.total} (${w.hitRate ?? 0}%)`}>
                <div
                  className={`ledger-week__bar ledger-week__bar--${ledgerColor(w.hitRate)}`}
                  style={{ height: `${Math.max((w.hitRate ?? 0) / 110 * 100, 4)}%` }}
                />
                <span className="ledger-week__label">{w.weekKey.slice(-3)}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Sumber: Tasks + Action Items + Penugasan dengan dueDate dalam window. Hit = selesai sebelum due.
          </div>
        </div>
      )}
    </div>
  )
}

function ledgerColor(pct: number | null): 'green' | 'yellow' | 'red' | 'muted' {
  if (pct === null) return 'muted'
  if (pct >= 80) return 'green'
  if (pct >= 60) return 'yellow'
  return 'red'
}

function scoreColor(val: number): 'green' | 'yellow' | 'red' {
  if (val >= 100) return 'green'
  if (val >= 80) return 'yellow'
  return 'red'
}

/**
 * Sprint 5 — Forecast linear berdasarkan periode YTD.
 * Asumsi periode MM/YYYY (mis. "Maret 2026" → bulan ke-3). Forecast = realisasi * (12 / monthsElapsed).
 * Status berbasis polarity:
 *   maximize: forecast >= target = green; >= 0.9 target = yellow; else red
 *   minimize: forecast <= target = green; <= 1.1 target = yellow; else red
 *
 * NOTE: linear extrapolation tidak cocok untuk KPI musiman (mis. produksi sawit).
 * Sprint 6 akan introduce seasonal adjustment.
 */
function computeForecast(item: KpiItem): { value: number; status: 'green' | 'yellow' | 'red' | 'muted' } | null {
  const periodMonth = item.periode.match(/Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember/)
  if (!periodMonth) return null
  const monthIndex = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].indexOf(periodMonth[0]) + 1
  if (monthIndex < 1 || monthIndex > 12) return null
  const target = parseFloat(item.sasaran.replace(',', '.'))
  const actual = parseFloat(item.realisasi.replace(',', '.'))
  if (isNaN(target) || isNaN(actual)) return null

  const forecast = actual * (12 / monthIndex)
  let status: 'green' | 'yellow' | 'red' = 'green'
  if (item.polaritas === 'maximize') {
    if (forecast < target * 0.9) status = 'red'
    else if (forecast < target) status = 'yellow'
  } else {
    if (forecast > target * 1.1) status = 'red'
    else if (forecast > target) status = 'yellow'
  }
  return { value: forecast, status }
}

function realisasiFillPct(sasaran: string, realisasi: string, polaritas: 'maximize' | 'minimize'): number {
  const t = parseFloat(sasaran.replace(',', '.'))
  const r = parseFloat(realisasi.replace(',', '.'))
  if (isNaN(t) || isNaN(r)) return 0
  if (t === 0) return r === 0 ? 100 : 0
  const ratio = polaritas === 'maximize' ? r / t : t / Math.max(Math.abs(r), 0.0001)
  return Math.min(Math.abs(ratio) * 100, 110)
}

export default function IndividuDetailView() {
  const { karyawan, kpiItems, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()

  const nilaiColor = scoreColor(karyawan.nilai)
  const headerBarWidth = Math.min((karyawan.nilai / 110) * 100, 100)

  return (
    <div className="view-performance">
      {/* Toolbar */}
      <div className="perf-toolbar">
        <button
          className="perf-toolbar__back"
          onClick={() => navigate('/performance/individu')}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m8 2-4 4 4 4" />
          </svg>
          Kembali
        </button>
        <div className="perf-toolbar__sep" />
        <span className="perf-toolbar__title">{karyawan.nama} ({karyawan.jumlah_kpi} KPI)</span>
        <div className="perf-toolbar__right">
          <span className={`badge badge--${nilaiColor}`} style={{ fontSize: 12, fontWeight: 700 }}>
            Nilai {periode}: {karyawan.nilai.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="perf-content">
        {/* Header */}
        <div className="perf-detail-header">
          <div className="perf-detail-header__top">
            <div className="perf-detail-header__meta">
              <div className="perf-detail-header__name">{karyawan.nama}</div>
              <div className="perf-detail-header__jabatan">{karyawan.jabatan}</div>
              <span className="perf-detail-header__unit">{karyawan.unit}</span>
            </div>
            <div className="perf-detail-header__score-badge">
              <div className={`perf-detail-header__score-value perf-detail-header__score-value--${nilaiColor}`}>
                {karyawan.nilai.toFixed(2)}
              </div>
              <div className="perf-detail-header__score-label">Nilai {periode}</div>
            </div>
          </div>
          <div className="perf-detail-header__progress">
            <div className="perf-detail-header__progress-bar">
              <div
                className={`perf-detail-header__progress-fill perf-detail-header__progress-fill--${nilaiColor}`}
                style={{ width: `${headerBarWidth}%` }}
              />
            </div>
          </div>
          <div className="perf-detail-header__meta-row">
            <span className="perf-detail-header__chip">{karyawan.jumlah_kpi} KPI items</span>
            <span className="perf-detail-header__chip">Bobot total 100%</span>
          </div>
        </div>

        {/* KPI items */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Rincian KPI
          </div>
          {kpiItems.map((item) => {
            const pct = realisasiFillPct(item.sasaran, item.realisasi, item.polaritas)
            const itemColor = scoreColor(pct > 0 ? (item.skor / (item.bobot)) * 100 : 0)
            const barWidth = Math.min(pct, 100)

            return (
              <div key={item.kode} className="perf-kpi-card">
                <div className="perf-kpi-card__header">
                  <span className="perf-kpi-card__num">{item.no}</span>
                  <span className="perf-kpi-card__kode">{item.kode}</span>
                  <span className="perf-kpi-card__bobot">Bobot {item.bobot}%</span>
                  <span className="perf-kpi-card__title">{item.nama}</span>
                  <span className="perf-kpi-card__skor">{item.skor.toFixed(2)}</span>
                </div>
                <div className="perf-kpi-card__body">
                  <div className="perf-kpi-card__pills">
                    <span className="perf-kpi-card__pill perf-kpi-card__pill--satuan">{item.satuan}</span>
                    <span className={`perf-kpi-card__pill perf-kpi-card__pill--${item.polaritas === 'maximize' ? 'max' : 'min'}`}>
                      {item.polaritas === 'maximize' ? '↑ Maximize' : '↓ Minimize'}
                    </span>
                    <span className="perf-kpi-card__pill perf-kpi-card__pill--periode">{item.periode}</span>
                    {(() => {
                      const f = computeForecast(item)
                      return f ? <ForecastBadge value={f.value} status={f.status} /> : null
                    })()}
                  </div>

                  <div className="perf-kpi-card__realisasi">
                    <div className="perf-kpi-card__val-block">
                      <span className="perf-kpi-card__val-label">Sasaran</span>
                      <span className="perf-kpi-card__val">{item.sasaran}</span>
                    </div>
                    <span className="perf-kpi-card__arrow">→</span>
                    <div className="perf-kpi-card__val-block perf-kpi-card__val-block--right">
                      <span className="perf-kpi-card__val-label">Realisasi</span>
                      <span className={`perf-kpi-card__val perf-kpi-card__val--${itemColor}`}>{item.realisasi}</span>
                    </div>
                  </div>

                  <div className="perf-kpi-card__bar">
                    <div
                      className={`perf-kpi-card__bar-fill perf-kpi-card__bar-fill--${itemColor}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {item.definisi && (
                    <div className="perf-kpi-card__definisi">{item.definisi}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Sprint 4 — Commitment Ledger */}
        <CommitmentLedgerSection userId={Number(karyawan.id)} />
      </div>
    </div>
  )
}
