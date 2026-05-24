import { useEffect, useState } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import { useOnboardingTour } from '../../hooks/useOnboardingTour'
import { useRealtime } from '../../hooks/useRealtime'
import { api } from '../../lib/api'
import { Card, Pill } from '../../design-system'
import { ForecastBadge } from '../../components/ui'
import { computeForecastFromStrings } from '../../lib/forecast'
import { scoreTone, fillRatio, realisasiPercent } from './_shared'
import './Performance.css'

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

function ledgerTone(pct: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (pct === null) return 'neutral'
  if (pct >= 80) return 'green'
  if (pct >= 60) return 'amber'
  return 'red'
}

function CommitmentLedgerSection({ userId }: { userId: number }) {
  const enabled = useFeatureFlag('commitment-ledger')
  const [data, setData] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Ledger di-derive on-the-fly dari Task + MeetingActionItem + Assignment.
  // Subscribe ke ticks ketiganya supaya bilamana ada status update,
  // hit rate + streak auto-refresh tanpa user F5.
  const { ticks } = useRealtime()
  const ledgerSignal = ticks.assignment + ticks.task + ticks.meeting

  useOnboardingTour('commitment-ledger', { trigger: enabled && !!data })

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    let cancelled = false
    api.get<{ data: LedgerData }>(`/performance/individu/${userId}/ledger`)
      .then(payload => { if (!cancelled) { setData(payload.data); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError((err as Error).message); setLoading(false) } })
    return () => { cancelled = true }
  }, [enabled, userId, ledgerSignal])

  if (!enabled) return null

  return (
    <section className="perf__section">
      <span className="perf__section-label">Komitmen Saya</span>
      {loading && <div style={{ fontSize: 12, color: 'var(--ds-text-tertiary)', padding: '8px 0' }}>Memuat ledger…</div>}
      {error && (
        <Card padding="md" style={{ borderColor: 'var(--ds-red-500)' }}>
          <div style={{ fontSize: 13, color: 'var(--ds-red-600)' }}>{error}</div>
        </Card>
      )}
      {!loading && !error && data && (() => {
        // Detect sparse data — when weeks with actual tasks < 4, the
        // aggregate hit-rate is statistically meaningless. Mute the
        // alarm color and show a clarifying hint.
        const weeksWithData = data.weeks.filter(w => w.total > 0).length
        const sparseData = weeksWithData < 4
        const consistencyColor = sparseData
          ? 'var(--ds-text-secondary)'
          : `var(--ds-${ledgerTone(data.hitRateAggregate)}-600)`
        return (
        <Card padding="md" data-tour="commitment-ledger">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 32, marginBottom: 16 }}>
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--ds-text-tertiary)', marginBottom: 4,
              }}>
                Consistency ({data.lookbackWeeks} minggu)
              </div>
              <div style={{
                fontSize: 24, fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: consistencyColor,
              }}>
                {data.hitRateAggregate !== null ? `${data.hitRateAggregate.toFixed(1)}%` : '—'}
              </div>
              {sparseData && (
                <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary)', marginTop: 4 }}>
                  Belum cukup data — {weeksWithData} dari {data.lookbackWeeks} minggu tercatat
                </div>
              )}
            </div>
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--ds-text-tertiary)', marginBottom: 4,
              }}>
                Streak ≥{data.streakMinPct}%
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-text-primary)' }}>
                {data.streak > 0 ? `${data.streak}` : '—'}
                {data.streak > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ds-text-tertiary)', marginLeft: 6 }}>
                    minggu
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 64 }}>
            {data.weeks.map(w => {
              const t = ledgerTone(w.hitRate)
              const colors = {
                green: 'var(--ds-green-500)',
                amber: 'var(--ds-amber-500)',
                red: 'var(--ds-red-500)',
                neutral: 'var(--ds-neutral-300)',
              }
              return (
                <div
                  key={w.weekKey}
                  title={`${w.weekKey}: ${w.hits}/${w.total} (${w.hitRate ?? 0}%)`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max((w.hitRate ?? 0) / 110 * 100, 6)}%`,
                      background: colors[t],
                      borderRadius: 2,
                      minHeight: 4,
                    }}
                  />
                  <span style={{ fontSize: 9, color: 'var(--ds-text-tertiary)' }}>{w.weekKey.slice(-3)}</span>
                </div>
              )
            })}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--ds-text-tertiary)',
            marginTop: 12, lineHeight: 1.5,
          }}>
            Sumber: Tasks + Action Items + Penugasan dengan dueDate dalam window. Hit = selesai sebelum due.
          </div>
        </Card>
        )
      })()}
    </section>
  )
}

export default function IndividuDetailView() {
  const { karyawan, kpiItems, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()

  const tone = scoreTone(karyawan.nilai)
  const bar = fillRatio(karyawan.nilai) * 100

  return (
    <>
      <Head title={`KPI — ${karyawan.nama}`} />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/individu')} type="button">
                <IconBack />
                Kembali
              </button>
              <h1 className="perf__title">{karyawan.nama}</h1>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periode}
              </span>
            </div>
          </header>

          {/* ─── Subject card ─────────────────────── */}
          <Card padding="lg" className="perf__section perf-subject">
            <div className="perf-subject__row">
              <div className="perf-subject__meta">
                <span className="perf-subject__eyebrow">Individu</span>
                <div className="perf-subject__name">{karyawan.nama}</div>
                <div className="perf-subject__jabatan">{karyawan.jabatan}</div>
                <div className="perf-subject__chips">
                  <Pill variant="mono">{karyawan.unit}</Pill>
                  <Pill tone="neutral" variant="soft">{karyawan.jumlah_kpi} KPI items</Pill>
                  <Pill tone="neutral" variant="soft">Bobot total 100%</Pill>
                </div>
              </div>
              <div className="perf-subject__score">
                <span className="perf-subject__score-value" data-tone={tone}>
                  {karyawan.nilai.toFixed(2)}
                </span>
                <span className="perf-subject__score-label">Nilai {periode}</span>
              </div>
            </div>
            <div className="perf-subject__bar">
              <div className="perf-subject__bar-fill" data-tone={tone} style={{ width: `${bar}%` }} />
            </div>
          </Card>

          {/* ─── KPI list ─────────────────────────── */}
          <section className="perf__section">
            <span className="perf__section-label">Rincian KPI</span>
            {kpiItems.length === 0 ? (
              <Card padding="md" className="perf-empty">
                <div className="perf-empty__title">Belum ada KPI individu</div>
                <div>KPI untuk karyawan ini belum terdaftar pada periode {periode}.</div>
              </Card>
            ) : (
            <div className="perf-kpi-list">
              {kpiItems.map(item => {
                const pct = realisasiPercent(item.sasaran, item.realisasi, item.polaritas)
                const skorPct = item.bobot > 0 ? (item.skor / item.bobot) * 100 : 0
                const itemTone = scoreTone(skorPct)
                const barWidth = Math.min(pct, 100)
                const forecast = computeForecastFromStrings({
                  periode: item.periode,
                  sasaran: item.sasaran,
                  realisasi: item.realisasi,
                  polaritas: item.polaritas,
                })

                return (
                  <article key={item.kode} className="perf-kpi">
                    <span className="perf-kpi__num">{item.no}</span>
                    <div className="perf-kpi__main">
                      <h3 className="perf-kpi__title">{item.nama}</h3>
                      <div className="perf-kpi__meta">
                        <Pill variant="mono">{item.kode}</Pill>
                        <span className={`perf-kpi__meta-chip perf-kpi__meta-chip--${item.polaritas === 'maximize' ? 'max' : 'min'}`}>
                          {item.polaritas === 'maximize' ? '↑ Maximize' : '↓ Minimize'}
                        </span>
                        <span className="perf-kpi__meta-chip">{item.satuan}</span>
                        <span className="perf-kpi__meta-chip">{item.periode}</span>
                        {forecast && <ForecastBadge value={forecast.value} status={forecast.status} />}
                      </div>
                      <div className="perf-kpi__realisasi">
                        <div className="perf-kpi__realisasi-block">
                          <span className="perf-kpi__realisasi-label">Sasaran</span>
                          <span className="perf-kpi__realisasi-value">{item.sasaran}</span>
                        </div>
                        <span className="perf-kpi__realisasi-arrow">→</span>
                        <div className="perf-kpi__realisasi-block">
                          <span className="perf-kpi__realisasi-label">Realisasi</span>
                          <span className="perf-kpi__realisasi-value" data-tone={itemTone}>{item.realisasi}</span>
                        </div>
                      </div>
                      <div className="perf-kpi__bar">
                        <div className="perf-kpi__bar-fill" data-tone={itemTone} style={{ width: `${barWidth}%` }} />
                      </div>
                      {item.definisi && (
                        <p className="perf-kpi__definisi">{item.definisi}</p>
                      )}
                    </div>
                    <div className="perf-kpi__right">
                      <span className="perf-kpi__skor" style={{ color: `var(--ds-${itemTone}-600)` }}>
                        {item.skor.toFixed(2)}
                      </span>
                      <span className="perf-kpi__bobot">Bobot {item.bobot}%</span>
                    </div>
                  </article>
                )
              })}
            </div>
            )}
          </section>

          {/* ─── Commitment Ledger ──────────────── */}
          <CommitmentLedgerSection userId={Number(karyawan.id)} />
        </div>
      </div>
    </>
  )
}

function IconBack() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 2-4 4 4 4" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="1" y="2" width="12" height="11" rx="1.5" />
      <path d="M1 6h12M5 2v2M9 2v2" />
    </svg>
  )
}
