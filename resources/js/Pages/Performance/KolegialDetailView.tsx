import { useState } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Card, Pill } from '../../design-system'
import { ForecastBadge } from '../../components/ui'
import { computeForecast } from '../../lib/forecast'
import { scoreTone, fillRatio, realisasiPercent, formatVal } from './_shared'
import { InsightPanel, type InsightPayload } from './InsightPanel'
import './Performance.css'

type KpiItem = {
  kode: string
  nama: string
  satuan: string
  polaritas: 'maximize' | 'minimize'
  bobot: number
  target: number
  realisasi: number
  skor: number
}

type KpiGroup = {
  perspektif: string
  perspektif_key: string
  color: 'green' | 'yellow' | 'red'
  pct: number
  items: KpiItem[]
}

type Direktur = {
  kode: string
  nama: string
  jabatan: string
  slug: string
}

type PageProps = {
  direktur: Direktur
  kpiGroups: KpiGroup[]
  insight: InsightPayload
  periode: string
}

const PERSPEKTIF_COLORS: Record<string, string> = {
  ekonomi_sosial: 'var(--ds-green-500)',
  imb:            '#6366F1',
  teknologi:      '#06B6D4',
  investasi:      'var(--ds-amber-500)',
  talenta:        '#A855F7',
}

export default function KolegialDetailView() {
  const { direktur, kpiGroups, insight, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const totalSkor = kpiGroups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.skor, 0), 0)
  const totalTone = scoreTone(totalSkor)
  const totalBar = fillRatio(totalSkor) * 100
  const totalKpi = kpiGroups.reduce((n, g) => n + g.items.length, 0)

  const visibleGroups = activeFilter === 'all'
    ? kpiGroups
    : kpiGroups.filter(g => g.perspektif_key === activeFilter)

  return (
    <>
      <Head title={`KPI Kolegial — ${direktur.jabatan}`} />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/kolegial')} type="button">
                <IconBack />
                Kembali
              </button>
              <h1 className="perf__title">KPI Kolegial — {direktur.jabatan}</h1>
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
                <span className="perf-subject__eyebrow">{direktur.jabatan}</span>
                <div className="perf-subject__name">{direktur.nama}</div>
                <div className="perf-subject__chips">
                  <Pill variant="mono">{direktur.kode}</Pill>
                  <Pill tone="neutral" variant="soft">{periode}</Pill>
                  <Pill tone="neutral" variant="soft">{totalKpi} KPI items</Pill>
                </div>
              </div>
              <div className="perf-subject__score">
                <span className="perf-subject__score-value" data-tone={totalTone}>
                  {totalSkor.toFixed(2)}<span style={{ fontSize: 18, color: 'var(--ds-text-tertiary)', marginLeft: 4 }}>%</span>
                </span>
                <span className="perf-subject__score-label">Total nilai</span>
              </div>
            </div>
            <div className="perf-subject__bar">
              <div className="perf-subject__bar-fill" data-tone={totalTone} style={{ width: `${totalBar}%` }} />
            </div>
          </Card>

          {/* ─── Insight Utama (auto-derived) ───── */}
          <section className="perf__section">
            <InsightPanel insight={insight} />
          </section>

          {kpiGroups.length === 0 ? (
            <Card padding="lg" className="perf__section perf-empty">
              <div className="perf-empty__title">Belum ada rincian KPI</div>
              <div>KPI breakdown untuk {direktur.jabatan} belum terdaftar pada periode {periode}.</div>
            </Card>
          ) : (
          <>
          {/* ─── Perspektif filter ───────────────── */}
          <div className="perf-filter-row">
            <button
              type="button"
              className="perf-filter"
              data-active={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
            >
              Semua perspektif
            </button>
            {kpiGroups.map(g => (
              <button
                key={g.perspektif_key}
                type="button"
                className="perf-filter"
                data-active={activeFilter === g.perspektif_key}
                onClick={() => setActiveFilter(g.perspektif_key)}
              >
                <span className="perf-filter__dot" style={{ background: PERSPEKTIF_COLORS[g.perspektif_key] ?? 'var(--ds-text-tertiary)' }} />
                {g.perspektif}
              </button>
            ))}
          </div>

          {/* ─── KPI groups ───────────────────────── */}
          {visibleGroups.map(group => (
            <section key={group.perspektif_key} className="perf__section">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: PERSPEKTIF_COLORS[group.perspektif_key] ?? 'var(--ds-text-tertiary)',
                }} />
                <span className="perf__section-label" style={{ margin: 0 }}>{group.perspektif}</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  color: `var(--ds-${scoreTone(group.pct)}-600)`,
                  marginLeft: 'auto',
                }}>
                  {group.pct.toFixed(1)}%
                </span>
              </div>

              <div className="perf-kpi-list">
                {group.items.map((item, idx) => {
                  const pct = realisasiPercent(item.target, item.realisasi, item.polaritas)
                  const itemTone = scoreTone(pct)
                  const barWidth = Math.min(pct, 100)
                  const forecast = computeForecast({
                    periode,
                    target: item.target,
                    realisasi: item.realisasi,
                    polaritas: item.polaritas,
                  })

                  return (
                    <article key={item.kode} className="perf-kpi">
                      <span className="perf-kpi__num">{idx + 1}</span>
                      <div className="perf-kpi__main">
                        <h3 className="perf-kpi__title">{item.nama}</h3>
                        <div className="perf-kpi__meta">
                          <Pill variant="mono">{item.kode}</Pill>
                          <span className={`perf-kpi__meta-chip perf-kpi__meta-chip--${item.polaritas === 'maximize' ? 'max' : 'min'}`}>
                            {item.polaritas === 'maximize' ? '↑ Maximize' : '↓ Minimize'}
                          </span>
                          <span className="perf-kpi__meta-chip">{item.satuan}</span>
                          {forecast && <ForecastBadge value={forecast.value} status={forecast.status} />}
                        </div>
                        <div className="perf-kpi__realisasi">
                          <div className="perf-kpi__realisasi-block">
                            <span className="perf-kpi__realisasi-label">Sasaran</span>
                            <span className="perf-kpi__realisasi-value">{formatVal(item.target, item.satuan)}</span>
                          </div>
                          <span className="perf-kpi__realisasi-arrow">→</span>
                          <div className="perf-kpi__realisasi-block">
                            <span className="perf-kpi__realisasi-label">Realisasi</span>
                            <span className="perf-kpi__realisasi-value" data-tone={itemTone}>
                              {formatVal(item.realisasi, item.satuan)}
                            </span>
                          </div>
                        </div>
                        <div className="perf-kpi__bar">
                          <div className="perf-kpi__bar-fill" data-tone={itemTone} style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>
                      <div className="perf-kpi__right">
                        <span className="perf-kpi__skor" data-tone={itemTone} style={{ color: `var(--ds-${itemTone}-600)` }}>
                          {item.skor.toFixed(1)}
                        </span>
                        <span className="perf-kpi__bobot">Bobot {item.bobot}%</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
          </>
          )}
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
