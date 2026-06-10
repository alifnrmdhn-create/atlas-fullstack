import { useState } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Card, Pill } from '../../design-system'
import { ForecastBadge } from '../../components/ui'
import { computeForecast } from '../../lib/forecast'
import { scoreTone, fillRatio, realisasiPercent, formatVal, formatNumber, formatPercent, formatPeriod, isZeroTargetMet } from './_shared'
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
  // Balanced Scorecard perspektif (KPI direktorat/divisi, mis. DIR-KMR)
  financial:      'var(--ds-green-500)',
  customer:       '#6366F1',
  ibp:            '#06B6D4',
  lng:            'var(--ds-amber-500)',
}

export default function KolegialDetailView() {
  const { direktur, kpiGroups, insight, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [lowestFirst, setLowestFirst] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const totalSkor = kpiGroups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.skor, 0), 0)
  const totalTone = scoreTone(totalSkor)
  const totalBar = fillRatio(totalSkor) * 100
  const totalKpi = kpiGroups.reduce((n, g) => n + g.items.length, 0)
  const periodeLabel = formatPeriod(periode)

  const itemPct = (i: KpiItem) => realisasiPercent(i.target, i.realisasi, i.polaritas)
  const attentionCount = kpiGroups.reduce(
    (n, g) => n + g.items.filter(i => itemPct(i) < 100).length, 0)

  // Triage pipeline: filter perspektif → filter status → sort. Grup yang
  // habis ter-filter di-drop supaya tidak menyisakan header kosong.
  const visibleGroups = (activeFilter === 'all'
    ? kpiGroups
    : kpiGroups.filter(g => g.perspektif_key === activeFilter))
    .map(g => {
      let items = attentionOnly ? g.items.filter(i => itemPct(i) < 100) : g.items
      if (lowestFirst) items = [...items].sort((a, b) => itemPct(a) - itemPct(b))
      return { ...g, items }
    })
    .filter(g => g.items.length > 0)

  const toggleGroup = (key: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <>
      <Head title={`KPI Collegial — ${direktur.jabatan}`} />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/kolegial')} type="button">
                <IconBack />
                Back
              </button>
              <h1 className="perf__title">KPI Collegial — {direktur.jabatan}</h1>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periodeLabel}
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
                  <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
                  <Pill tone="neutral" variant="soft">{totalKpi} KPI items</Pill>
                  {attentionCount > 0 && (
                    <Pill tone="amber" variant="soft">{attentionCount} below target</Pill>
                  )}
                </div>
              </div>
              <div className="perf-subject__score">
                <span className="perf-subject__score-value" data-tone={totalTone}>
                  {formatNumber(totalSkor)}<span style={{ fontSize: 18, color: 'var(--ds-text-tertiary)', marginLeft: 4 }}>%</span>
                </span>
                <span className="perf-subject__score-label">Total score</span>
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
              <div className="perf-empty__title">No KPI breakdown yet</div>
              <div>The KPI breakdown for {direktur.jabatan} is not registered for the {periodeLabel} period.</div>
            </Card>
          ) : (
          <>
          {/* ─── Perspektif filter + triage ───────── */}
          <div className="perf-filter-row">
            <button
              type="button"
              className="perf-filter"
              data-active={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
            >
              All perspectives
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
            <span className="perf-filter-row__spacer" aria-hidden />
            <button
              type="button"
              className="perf-filter perf-filter--triage"
              data-active={attentionOnly}
              onClick={() => setAttentionOnly(v => !v)}
              title="Show only KPIs below 100% achievement"
            >
              <span className="perf-filter__dot" style={{ background: 'var(--tone-amber)' }} />
              Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
            </button>
            <button
              type="button"
              className="perf-filter perf-filter--triage"
              data-active={lowestFirst}
              onClick={() => setLowestFirst(v => !v)}
              title="Sort lowest achievement first"
            >
              ↓ Lowest first
            </button>
          </div>

          {/* Penjelasan skala skor — angka kanan tiap KPI dulu tampil "4.4"
              tanpa konteks apa pun. */}
          <p className="perf-scale-note">
            Score = contribution to total (weight × achievement, achievement capped at 110%).
            Bar shows achievement vs target; tick marks the 100% line.
          </p>

          {/* ─── KPI groups ───────────────────────── */}
          {visibleGroups.length === 0 ? (
            <Card padding="md" className="perf-empty">
              <div className="perf-empty__title">Nothing needs attention</div>
              <div>All KPIs in this view meet 100% of target. Clear the filter to see everything.</div>
            </Card>
          ) : visibleGroups.map(group => {
            const isCollapsed = collapsed.has(group.perspektif_key)
            return (
            <section key={group.perspektif_key} className="perf__section">
              <button
                type="button"
                className="perf-group-head"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(group.perspektif_key)}
              >
                <span className="perf-group-head__chevron" data-collapsed={isCollapsed} aria-hidden>▾</span>
                <span className="perf-group-head__dot" style={{ background: PERSPEKTIF_COLORS[group.perspektif_key] ?? 'var(--ds-text-tertiary)' }} />
                <span className="perf__section-label perf-group-head__label">{group.perspektif}</span>
                <span className="perf-group-head__count">{group.items.length} KPI</span>
                <span className="perf-group-head__pct" data-tone={scoreTone(group.pct)}>
                  {formatPercent(group.pct, 1)}
                </span>
              </button>

              {!isCollapsed && (
              <div className="perf-kpi-list">
                {group.items.map((item, idx) => {
                  const pct = itemPct(item)
                  const itemTone = scoreTone(pct)
                  const barWidth = fillRatio(pct) * 100
                  const zeroMet = isZeroTargetMet(item.target, item.realisasi)
                  const forecast = zeroMet ? null : computeForecast({
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
                          {forecast && forecast.value > 0 && (
                            <ForecastBadge value={formatNumber(forecast.value, 1)} status={forecast.status} />
                          )}
                        </div>
                        {zeroMet ? (
                          /* "0 → 0" tampak rusak; zero-target (mis. Jumlah Fraud)
                             yang tercapai dikomunikasikan eksplisit. */
                          <div className="perf-kpi__realisasi">
                            <span className="perf-kpi__zero-met" data-tone="green">
                              ✓ Zero target met — target {formatVal(item.target, item.satuan)}, no occurrence
                            </span>
                          </div>
                        ) : (
                          <div className="perf-kpi__realisasi">
                            <div className="perf-kpi__realisasi-block">
                              <span className="perf-kpi__realisasi-label">Target</span>
                              <span className="perf-kpi__realisasi-value">{formatVal(item.target, item.satuan)}</span>
                            </div>
                            <span className="perf-kpi__realisasi-arrow">→</span>
                            <div className="perf-kpi__realisasi-block">
                              <span className="perf-kpi__realisasi-label">Realization</span>
                              <span className="perf-kpi__realisasi-value" data-tone={itemTone}>
                                {formatVal(item.realisasi, item.satuan)}
                              </span>
                            </div>
                            <span className="perf-kpi__pct" data-tone={itemTone}>{formatPercent(pct, 0)} of target</span>
                          </div>
                        )}
                        <div className="perf-kpi__bar perf-kpi__bar--ticked">
                          <div className="perf-kpi__bar-fill" data-tone={itemTone} style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>
                      <div className="perf-kpi__right">
                        <span className="perf-kpi__skor" data-tone={itemTone}>
                          {formatNumber(item.skor, 1)}
                        </span>
                        <span className="perf-kpi__bobot">Weight {item.bobot}%</span>
                      </div>
                    </article>
                  )
                })}
              </div>
              )}
            </section>
            )
          })}
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
