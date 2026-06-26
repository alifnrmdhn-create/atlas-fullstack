import { useState, useEffect, useId, useRef, useCallback, useMemo } from 'react'
import { usePage } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import { MonthlyReportDetailDIMR } from './MonthlyReportDetailDIMR'
import type { RiskReport } from '../types/monthlyReports'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useWorkspace } from '../hooks/useWorkspace'
import { api } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import {
  type Metric, type Report, type ProgramRef,
  STATUS, APPROVAL_ACTION,
  n, isNonNum, fmtVal, pctVs, perfCls, perfColor,
  periodLabel, reportTitle, prevYrLabel, fmtRp,
} from '../types/monthlyReports'
import './MonthlyReportDetail.css'

// ── Auto-Draft types ──────────────────────────────────────────────────────────

type AutoDraftProgram = {
  programId: number
  code: string
  name: string
  healthStatus: string | null
  healthLabel: string
  progressPercent: number
  totalTasks: number
  completedTasks: number
  activeBlockers: number
  latestLog: {
    period: string
    healthAtTime: string
    narrative: string
    kendala: string | null
    dukunganDibutuhkan: string | null
  } | null
  kpis: Array<{ name: string; actual: number; target: number; unit: string | null; pct: number | null }>
}

// ── On-track summary pill ─────────────────────────────────────────────────────

function OnTrackPill({ metrics }: { metrics: Metric[] }) {
  const { t } = useTranslation()
  const withTarget = metrics.filter(m => m.rkap != null && n(m.rkap) !== 0)
  if (withTarget.length === 0) return null
  const onTrack = withTarget.filter(m => (pctVs(m.realisasi, m.rkap) ?? 0) >= 100).length
  const cls = onTrack === withTarget.length ? 'green' : onTrack >= withTarget.length * 0.7 ? 'amber' : 'red'
  return (
    <span className={`mrd-ontrack-pill ${cls}`}>
      {t('{{onTrack}}/{{total}} on-track', { onTrack, total: withTarget.length })}
    </span>
  )
}

// ── Hero KPI card ─────────────────────────────────────────────────────────────

function HeroCard({ m }: { m: Metric; year: number }) {
  const pRkap = pctVs(m.realisasi, m.rkap)
  const pYoy  = pctVs(m.realisasi, m.tahunLalu)
  const val   = fmtRp(m.realisasi, m.satuan)
  const cls   = perfCls(pRkap)
  const tint  = cls ? `${cls}-tint` : ''
  const isNeg = n(m.realisasi) < 0

  return (
    <div className={`mrd-hero-card ${tint}`}>
      <div className="mrd-hero-label">{m.label === 'NOCF' ? 'Net Operating Cash Flow' : m.label}</div>
      <div className={`mrd-hero-val ${isNeg ? 'neg' : ''}`}>{val}</div>
      {m.rkap != null && n(m.rkap) !== 0 && (
        <div className="mrd-hero-target">vs {fmtRp(m.rkap, m.satuan)} <span title="Rencana Kerja & Anggaran Perusahaan">RKAP</span></div>
      )}
      <div className="mrd-hero-badges">
        {pRkap != null && (
          <span className={`mrd-hero-badge rkap ${cls}`} title="Rencana Kerja & Anggaran Perusahaan">
            {pRkap >= 100 ? '▲' : '▼'} {pRkap}% RKAP
          </span>
        )}
        {pYoy != null && (
          <span className={`mrd-hero-badge yoy ${pYoy >= 100 ? 'up' : 'down'}`}>
            {pYoy >= 100 ? '▲' : '▼'} {Math.abs(pYoy)}% YoY
          </span>
        )}
      </div>
      {pRkap != null && (
        <div className="mrd-hero-track">
          <div
            className="mrd-hero-track-fill"
            style={{ width: `${Math.min(Math.abs(pRkap), 100)}%`, background: perfColor(pRkap) }}
          />
          <div className="mrd-hero-track-marker" />
        </div>
      )}
    </div>
  )
}

// ── Rasio Keuangan card ───────────────────────────────────────────────────────

function RatioCard({ m, year }: { m: Metric; year: number }) {
  const pRkap = pctVs(m.realisasi, m.rkap)
  const lowerBetter = ['DER','BPP','Cost','Beban'].some(k => m.label.includes(k))
  const cls = pRkap == null ? '' : (lowerBetter
    ? (pRkap <= 100 ? 'green' : pRkap <= 110 ? 'amber' : 'red')
    : perfCls(pRkap))

  const rVal = n(m.realisasi)
  const rKap = n(m.rkap)
  const barPct = rKap ? Math.min((Math.abs(rVal) / Math.abs(rKap)) * 100, 150) : 0

  return (
    <div className="mrd-ratio-card">
      <div className="mrd-ratio-header">
        <div className="mrd-ratio-lbl">{m.label}</div>
        {cls && <div className={`mrd-ratio-dot ${cls}`} />}
      </div>
      <div className="mrd-ratio-row">
        <div className={`mrd-ratio-val ${cls}`}>
          {fmtVal(m.realisasi, m.satuan)}
          <span className="mrd-ratio-sat">{m.satuan}</span>
        </div>
        <div className="mrd-ratio-benchmarks">
          <span className="mrd-ratio-bench">
            <span className="mrd-ratio-bench-lbl" title="Rencana Kerja & Anggaran Perusahaan">RKAP</span>
            <span className="mrd-ratio-bench-val">{fmtVal(m.rkap, m.satuan)}</span>
          </span>
          <span className="mrd-ratio-bench">
            <span className="mrd-ratio-bench-lbl">{prevYrLabel(year)}</span>
            <span className="mrd-ratio-bench-val">{fmtVal(m.tahunLalu, m.satuan)}</span>
          </span>
        </div>
      </div>
      {rKap !== 0 && (
        <div className="mrd-ratio-gauge-wrap">
          <div className="mrd-ratio-gauge">
            <div className="mrd-ratio-gauge-fill" style={{ width: `${Math.min(barPct, 100)}%`, background: perfColor(pRkap) }} />
            <div className="mrd-ratio-gauge-target" />
          </div>
          {pRkap != null && (
            <span className={`mrd-ratio-pct ${cls}`}>{pRkap}%</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Operational category card ─────────────────────────────────────────────────

function OpsKategoryCard({ kategori, items }: { kategori: string; items: Metric[] }) {
  const { t } = useTranslation()
  const withRkap = items.filter(m => m.rkap != null && n(m.rkap) !== 0)
  const avgPct = withRkap.length
    ? Math.round(withRkap.reduce((s, m) => s + (pctVs(m.realisasi, m.rkap) ?? 100), 0) / withRkap.length)
    : null

  const [expanded, setExpanded] = useState(false)
  const displayItems = expanded ? items : items.slice(0, 4)

  return (
    <div className="mrd-ops-card">
      <button type="button" className="mrd-ops-card__head" onClick={() => setExpanded(e => !e)}>
        <span className="mrd-ops-card__title">{kategori}</span>
        <span className="mrd-ops-card__right">
          {avgPct != null && <span className={`mrd-ops-pct ${perfCls(avgPct)}`}>{avgPct}%</span>}
          <span className="mrd-ops-chevron">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>
      <div className="mrd-ops-card__metrics">
        {displayItems.map(m => {
          const p = pctVs(m.realisasi, m.rkap)
          return (
            <div className="mrd-ops-metric" key={m.id}>
              <div className="mrd-ops-metric__main">
                <span className="mrd-ops-metric__label">{m.label}</span>
                <span className="mrd-ops-metric__val">
                  {fmtVal(m.realisasi, m.satuan)}{isNonNum(m.satuan) ? ` ${m.satuan}` : ''}
                </span>
              </div>
              {p != null && m.rkap != null && n(m.rkap) !== 0 && (
                <div className="mrd-ops-metric__bar">
                  <div className="mrd-ops-metric__bar-fill"
                    style={{ width: `${Math.min(p, 100)}%`, background: perfColor(p) }} />
                </div>
              )}
            </div>
          )
        })}
        {!expanded && items.length > 4 && (
          <button type="button" className="mrd-ops-more" onClick={() => setExpanded(true)}>
            {t('+{{count}} more indicators', { count: items.length - 4 })}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Full data table ───────────────────────────────────────────────────────────

function FullDataTable({ metrics, month, year }: { metrics: Metric[]; month: number; year: number }) {
  const { t } = useTranslation()
  const categories = [...new Set(metrics.map(m => m.kategori || 'Other'))]
  return (
    <div className="mrd-full-table">
      {categories.map(kat => {
        const items = metrics.filter(m => (m.kategori || 'Other') === kat)
        return (
          <div key={kat} className="mrd-full-table__group">
            <div className="mrd-full-table__group-head">{kat}</div>
            <table className="mrd-table">
              <thead>
                <tr>
                  <th>{t('Description')}</th>
                  <th>{t('Unit')}</th>
                  <th className="mrd-table__th--right">{prevYrLabel(year)}</th>
                  <th className="mrd-table__th--right" title="Rencana Kerja & Anggaran Perusahaan">RKAP</th>
                  <th className="mrd-table__th--right">{periodLabel(month, year)}</th>
                  <th className="mrd-table__th--right" title="% capaian vs Rencana Kerja & Anggaran Perusahaan">% RKAP</th>
                  <th className="mrd-table__th--right">% YoY</th>
                </tr>
              </thead>
              <tbody>
                {items.map(m => {
                  const pR = pctVs(m.realisasi, m.rkap)
                  const pY = pctVs(m.realisasi, m.tahunLalu)
                  return (
                    <tr key={m.id}>
                      <td className="mrd-table__cell-label">{m.label}</td>
                      <td className="mrd-table__cell-unit">{m.satuan}</td>
                      <td className="mrd-table__cell-num">
                        {fmtVal(m.tahunLalu, m.satuan)}
                      </td>
                      <td className="mrd-table__cell-num">
                        {fmtVal(m.rkap, m.satuan)}
                      </td>
                      <td className="mrd-table__cell-num mrd-table__cell-num--strong">
                        {fmtVal(m.realisasi, m.satuan)}
                      </td>
                      <td className="mrd-table__cell-right">
                        {pR != null
                          ? <span className={`mrd-pct-badge ${perfCls(pR)}`}>{pR}%</span>
                          : <span className="mrd-table__dash">–</span>}
                      </td>
                      <td className="mrd-table__cell-right">
                        {pY != null
                          ? <span className={`mrd-table__trend ${perfCls(pY)}`}>{pY >= 100 ? '▲' : '▼'} {Math.abs(pY)}%</span>
                          : <span className="mrd-table__dash">–</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ── Custom % label at end of bar ──────────────────────────────────────────────

function BulletPctLabel(props: {
  x?: number; y?: number; width?: number; height?: number
  value?: number; payload?: { realLabel?: string }
}) {
  const { x = 0, y = 0, width = 0, height = 0, value, payload } = props
  if (value == null) return null
  const pct = Math.round(value)
  const label = payload?.realLabel ?? `${pct}%`
  return (
    <text
      x={x + width + 6} y={y + height / 2}
      fill="var(--text-strong)" fontSize={10} fontWeight={700}
      textAnchor="start" dominantBaseline="middle"
    >
      {label}
    </text>
  )
}

// ── Keuangan dashboard ────────────────────────────────────────────────────────

function KeuanganDashboard({ metrics, report }: { metrics: Metric[]; report: Report }) {
  const { t } = useTranslation()
  const [showTable, setShowTable] = useState(false)

  const HERO_LABELS = ['Penjualan Bersih', 'EBITDA', 'Laba Bersih', 'NOCF']
  const heroMetrics = HERO_LABELS
    .map(lbl => metrics.find(m => m.label.includes(lbl)))
    .filter(Boolean) as Metric[]

  const plItems    = metrics.filter(m => m.kategori === 'Laba Rugi')
  const rasioItems = metrics.filter(m => m.kategori === 'Rasio Keuangan')
  const otherKats  = [...new Set(
    metrics.filter(m => !['Laba Rugi','Rasio Keuangan'].includes(m.kategori)).map(m => m.kategori)
  )]

  // Bullet/variance chart: normalize to % of RKAP, one bar per metric
  const bulletData = plItems
    .filter(m => m.rkap != null && n(m.rkap) !== 0)
    .map(m => {
      const pct = pctVs(m.realisasi, m.rkap) ?? 0
      return {
        name: m.label,
        pct: Math.min(Math.max(pct, 0), 160),
        pctRaw: pct,
        color: perfColor(pct),
        realLabel: fmtRp(m.realisasi, m.satuan),
        rkapLabel: fmtRp(m.rkap, m.satuan),
      }
    })

  // Fallback: plain items without RKAP → show absolute M chart
  const noRkapItems = plItems.filter(m => m.rkap == null || n(m.rkap) === 0)
  const absData = noRkapItems.map(m => ({
    name: m.label,
    Realisasi: Math.round(n(m.realisasi) / 1000),
    color: 'var(--indigo)',
    realLabel: fmtRp(m.realisasi, m.satuan),
  }))

  const allFinMetrics = [...heroMetrics, ...rasioItems, ...plItems]

  return (
    <section id="section-keuangan" className="mrd-section">
      <div className="mrd-section-header">
        <div className="mrd-section-title">
          <span className="mrd-section-icon">💰</span>
          <span>{t('Financial Performance')}</span>
        </div>
        <div className="mrd-section-meta">
          <OnTrackPill metrics={allFinMetrics} />
          <span className="mrd-section-period">{periodLabel(report.month, report.year)}</span>
        </div>
      </div>

      {/* Hero KPI strip */}
      {heroMetrics.length > 0 && (
        <div className="mrd-hero-grid">
          {heroMetrics.map(m => (
            <HeroCard key={m.id} m={m} year={report.year} />
          ))}
        </div>
      )}

      {/* Bullet chart + Rasio */}
      <div className="mrd-row">
        {(bulletData.length > 0 || absData.length > 0) && (
          <div className="mrd-col-main">
            <div className="mrd-chart-box">
              <div className="mrd-chart-box-header">
                <span className="mrd-chart-lbl">{t('Laba Rugi — Actual vs RKAP')}</span>
                {bulletData.length > 0
                  ? <span className="mrd-chart-unit">{t('% of RKAP achieved')}</span>
                  : <span className="mrd-chart-unit">{t('Rp Billion')}</span>
                }
              </div>

              {bulletData.length > 0 ? (
                <>
                  <ResponsiveContainer height={Math.max(180, bulletData.length * 46)} width="100%">
                    <ComposedChart layout="vertical" data={bulletData}
                      margin={{ top: 4, right: 100, bottom: 4, left: 8 }}>
                      <CartesianGrid horizontal={false} stroke="var(--panel-border)" strokeDasharray="4 4" />
                      <XAxis
                        type="number" domain={[0, 140]}
                        tickFormatter={v => `${v}%`}
                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                        tickLine={false} axisLine={false}
                        ticks={[0, 25, 50, 75, 100, 125]}
                      />
                      <YAxis
                        type="category" dataKey="name" width={138}
                        tick={{ fontSize: 11, fill: 'var(--text-strong)' }}
                        tickLine={false} axisLine={false}
                      />
                      <ReferenceLine
                        x={100}
                        stroke="var(--text-muted)"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        label={{ value: '100%', position: 'insideTopRight', fontSize: 9, fill: 'var(--text-muted)', dy: -4 }}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: '1px solid var(--panel-border)',
                          boxShadow: 'var(--panel-shadow-md)',
                          padding: '8px 12px',
                          background: 'var(--panel)',
                          color: 'var(--text-strong)',
                        }}
                        formatter={((v: number, _name: string, props: { payload: typeof bulletData[0] }) => {
                          const d = props.payload
                          return [`${Math.round(v)}% RKAP · ${d.realLabel}`, t('Actual')]
                        }) as never}
                      />
                      <Bar dataKey="pct" radius={[0, 5, 5, 0]} barSize={16} minPointSize={3}>
                        {bulletData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.9} />)}
                        <LabelList content={((props: { index?: number }) => <BulletPctLabel {...(props as object)} payload={bulletData[props.index ?? 0]} />) as never} />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="mrd-chart-legend">
                    <span className="mrd-chart-legend__item"><span className="mrd-legend-dot mrd-legend-dot--green" />{t('≥ 100% RKAP')}</span>
                    <span className="mrd-chart-legend__item"><span className="mrd-legend-dot mrd-legend-dot--yellow" />85–99%</span>
                    <span className="mrd-chart-legend__item"><span className="mrd-legend-dot mrd-legend-dot--red" />{'< 85%'}</span>
                    <span className="mrd-chart-legend__note">{t('Dashed line = 100% target')}</span>
                  </div>
                </>
              ) : (
                <ResponsiveContainer height={Math.max(180, absData.length * 46)} width="100%">
                  <BarChart layout="vertical" data={absData}
                    barSize={14} margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={138} tick={{ fontSize: 11, fill: 'var(--text-strong)' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: '1px solid var(--panel-border)',
                        boxShadow: 'var(--panel-shadow-md)',
                        background: 'var(--panel)',
                        color: 'var(--text-strong)',
                      }}
                      formatter={((v: number) => [`Rp ${v.toLocaleString('id-ID')} B`, t('Actual')]) as never}
                    />
                    <Bar dataKey="Realisasi" radius={[0, 5, 5, 0]}>
                      {absData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      <LabelList content={((props: { index?: number }) => <BulletPctLabel {...(props as object)} payload={absData[props.index ?? 0]} />) as never} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {rasioItems.length > 0 && (
          <div className="mrd-col-side">
            <div className="mrd-chart-box">
              <div className="mrd-chart-box-header">
                <span className="mrd-chart-lbl">{t('Financial Ratios')}</span>
              </div>
              <div className="mrd-ratio-list">
                {rasioItems.map(m => (
                  <RatioCard key={m.id} m={m} year={report.year} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Other categories */}
      {otherKats.map(kat => {
        const items = metrics.filter(m => m.kategori === kat)
        return (
          <div key={kat} className="mrd-chart-box">
            <div className="mrd-chart-box-header">
              <span className="mrd-chart-lbl">{kat}</span>
            </div>
            <div className="mrd-mini-grid">
              {items.map(m => {
                const p    = pctVs(m.realisasi, m.rkap)
                const isNeg = n(m.realisasi) < 0
                return (
                  <div key={m.id} className={`mrd-mini-card ${p != null ? perfCls(p) + '-tint' : ''} ${isNeg ? 'neg' : ''}`}>
                    <div className={`mrd-mini-card__val ${isNeg ? 'neg' : ''}`}>{fmtRp(m.realisasi, m.satuan)}</div>
                    <div className="mrd-mini-card__lbl">{m.label}</div>
                    {p != null && (
                      <div className={`mrd-mini-card__pct ${perfCls(p)}`}>{p}% RKAP</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <button className="mrd-table-toggle" onClick={() => setShowTable(s => !s)}>
        {showTable ? t('▲ Hide Table') : t('▼ View Full Financial Data')}
      </button>
      {showTable && <FullDataTable metrics={metrics} month={report.month} year={report.year} />}
    </section>
  )
}

// ── Operasional dashboard ─────────────────────────────────────────────────────

function OperasionalDashboard({ metrics, report }: { metrics: Metric[]; report: Report }) {
  const { t } = useTranslation()
  const [showTable, setShowTable] = useState(false)
  const categories = [...new Set(metrics.map(m => m.kategori || 'Other'))]

  return (
    <section id="section-operasional" className="mrd-section">
      <div className="mrd-section-header">
        <div className="mrd-section-title">
          <span className="mrd-section-icon">⚙️</span>
          <span>{t('Operational Performance')}</span>
        </div>
        <div className="mrd-section-meta">
          <OnTrackPill metrics={metrics} />
          <span className="mrd-section-period">{periodLabel(report.month, report.year)}</span>
        </div>
      </div>
      <div className="mrd-ops-grid">
        {categories.map(kat => (
          <OpsKategoryCard key={kat} kategori={kat}
            items={metrics.filter(m => (m.kategori || 'Other') === kat)} />
        ))}
      </div>
      <button className="mrd-table-toggle" onClick={() => setShowTable(s => !s)}>
        {showTable ? t('▲ Hide Table') : t('▼ View Full Operational Data')}
      </button>
      {showTable && <FullDataTable metrics={metrics} month={report.month} year={report.year} />}
    </section>
  )
}

// ── Narrative panel ───────────────────────────────────────────────────────────

function NarrativeSection({ report }: { report: Report }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!report.narrativeSummary && !report.highlights) return null
  const preview = (report.narrativeSummary || report.highlights || '').slice(0, 140)
  return (
    <section id="section-narasi" className={`mrd-narrative ${open ? 'open' : ''}`}>
      <button className="mrd-narrative__toggle" onClick={() => setOpen(o => !o)}>
        <span className="mrd-narrative__icon">📝</span>
        <span className="mrd-narrative__title">{t('Executive Summary & Highlights')}</span>
        <span className="mrd-narrative__chevron">{open ? '▲' : '▼'}</span>
      </button>
      {!open && (
        <div className="mrd-narrative__preview">"{preview}{preview.length >= 140 ? '…' : ''}"</div>
      )}
      {open && (
        <div className="mrd-narrative__body">
          {report.narrativeSummary && (
            <div className="mrd-narrative__block">
              <span className="mrd-slabel">{t('Executive Summary')}</span>
              <p className="mrd-narrative__text">{report.narrativeSummary}</p>
            </div>
          )}
          {report.highlights && (
            <div className="mrd-narrative__block">
              <span className="mrd-slabel">{t('Highlights')}</span>
              <p className="mrd-narrative__text">{report.highlights}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Audit trail ───────────────────────────────────────────────────────────────

function AuditTrail({ report }: { report: Report }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const fileCount     = report.files?.length ?? 0
  const approvalCount = report.approvals?.length ?? 0
  if (fileCount === 0 && approvalCount === 0) return null

  return (
    <section className="mrd-audit">
      <button className="mrd-audit__toggle" onClick={() => setOpen(o => !o)}>
        <span>{t('History & Files')}</span>
        <span className="mrd-audit__meta">
          {fileCount > 0 && t('{{count}} file', { count: fileCount })}
          {fileCount > 0 && approvalCount > 0 && ' · '}
          {approvalCount > 0 && t('{{count}} approval', { count: approvalCount })}
        </span>
        <span className="mrd-audit__chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mrd-audit__body">
          {fileCount > 0 && (
            <div>
              <span className="mrd-slabel">{t('Uploaded Files')}</span>
              <div className="mrd-files">
                {report.files!.map(f => (
                  <div className="mrd-file-row" key={f.id}>
                    <span>📄</span>
                    <span className="mrd-file-row__name">{f.originalName}</span>
                    <span className="mrd-file-row__meta">
                      {f.uploadedBy.name} · {new Date(f.uploadedAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {approvalCount > 0 && (
            <div className={`mrd-audit__approval-block${fileCount > 0 ? ' mrd-audit__approval-block--offset' : ''}`}>
              <span className="mrd-slabel">{t('Approval History')}</span>
              <div className="mrd-timeline">
                {report.approvals!.map(a => {
                  const ap = APPROVAL_ACTION[a.action]
                  return (
                    <div className="mrd-tl-step" key={a.id}>
                      <div className={`mrd-tl-dot ${ap?.dot ?? ''}`} />
                      <div className="mrd-tl-body">
                        <div>
                          <span className={`mrd-tl-action ${ap?.cls ?? ''}`}>{ap?.label ?? a.action}</span>
                          <span className="mrd-tl-meta"> · {a.approver.name} ({a.approverRole})</span>
                        </div>
                        {a.note && <p className="mrd-tl-note">{a.note}</p>}
                        <div className="mrd-tl-meta">
                          {new Date(a.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Linked Programs panel ─────────────────────────────────────────────────────

function LinkedProgramsSection({
  report, programs, onSaved,
}: {
  report: Report
  programs: ProgramRef[]
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const linked = report.linkedPrograms ?? []
  const isDraft = report.status === 'DRAFT'
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number[]>(linked.map(p => p.id))
  const [busy, setBusy] = useState(false)

  const results = useMemo(() =>
    programs.filter(p =>
      `${p.code} ${p.name}`.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 8),
    [programs, search]
  )

  async function save() {
    setBusy(true)
    try {
      await api.put(`/monthly-reports/${report.id}`, { linkedProgramIds: selected })
      setEditing(false)
      onSaved()
    } catch (e) { alert(e instanceof Error ? e.message : t('Failed')) }
    finally { setBusy(false) }
  }

  const toggle = (id: number) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <section className="mrd-audit mrd-linked-programs">
      <button className="mrd-audit__toggle" onClick={() => setOpen(o => !o)}>
        <span>{t('Linked Programs')}</span>
        <span className="mrd-audit__meta">{linked.length > 0 ? t('{{count}} program', { count: linked.length }) : t('None yet')}</span>
        <span className="mrd-audit__chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mrd-audit__body">
          {!editing && (
            <>
              {linked.length === 0 ? (
                <span className="mrd-linked-programs__empty">{t('No programs are linked to this report yet.')}</span>
              ) : (
                <div className="mrd-linked-programs__chips">
                  {linked.map(p => (
                    <span key={p.id} className="mrd-linked-programs__chip">
                      {p.code} — {p.name}
                    </span>
                  ))}
                </div>
              )}
              {isDraft && (
                <button
                  className="mrd-linked-programs__edit-btn"
                  onClick={() => { setSelected(linked.map(p => p.id)); setSearch(''); setEditing(true) }}
                >
                  ✏ {t('Edit linked programs')}
                </button>
              )}
            </>
          )}
          {editing && (
            <div className="mrd-linked-programs__editor">
              <input
                className="form-input mrd-linked-programs__search"
                placeholder={t('Search programs…')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              <div className="mrd-linked-programs__results">
                {results.map(p => (
                  <label key={p.id} className="mrd-linked-programs__option">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span><strong>{p.code}</strong> — {p.name}</span>
                  </label>
                ))}
                {results.length === 0 && <span className="mrd-linked-programs__no-results">{t('No results')}</span>}
              </div>
              <div className="mrd-linked-programs__actions">
                <button className="btn mrd-linked-programs__action" onClick={() => setEditing(false)}>{t('Cancel')}</button>
                <button className="btn btn--primary mrd-linked-programs__action" disabled={busy} onClick={() => void save()}>
                  {busy ? t('Saving…') : t('Save')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children, footer, isDirty = false, busy = false }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  // Opsional: kalau form di dalam modal punya draft state, oper isDirty agar
  // Escape/backdrop/tombol X tampilkan confirm sebelum menutup. busy=true
  // (mis. sedang submit) memblok semua close path agar request in-flight
  // tidak terinterupsi.
  isDirty?: boolean
  busy?: boolean
}) {
  const { t } = useTranslation()
  const dialogRef = useDialogFocus<HTMLDivElement>(true)
  const safeClose = () => {
    if (busy) return
    if (isDirty && !window.confirm(t('Discard unsaved changes?'))) return
    onClose()
  }
  useEscKey(safeClose, true)
  const titleId = useId()
  const subtitleId = useId()

  return (
    <div className="modal-overlay" onClick={safeClose}>
      <div aria-describedby={subtitle ? subtitleId : undefined} aria-labelledby={titleId} aria-modal="true" className="modal-surface mrd-modal-surface" ref={dialogRef} role="dialog" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-headcopy">
            <span className="modal-kicker">{t('Monthly Reports')}</span>
            <span className="modal-title" id={titleId}>{title}</span>
            {subtitle ? <p className="modal-subtitle" id={subtitleId}>{subtitle}</p> : null}
          </div>
          <button aria-label={t('Close')} className="modal__close" onClick={safeClose} type="button">
            <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer mrd-modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MonthlyReportDetailView() {
  const { t } = useTranslation()
  const page = usePage<{ report?: { id: number } }>()
  const reportId = page.props.report?.id != null ? String(page.props.report.id) : undefined
  const navigate = useInertiaNavigate()
  const { currentUser, programs } = useWorkspace()
  const role = currentUser?.roleType?.toUpperCase() ?? ''

  const isKASUBDIV = role === 'KASUBDIV'
  const isKADIV    = role === 'KADIV'

  const [report, setReport]       = useState<Report | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'keuangan' | 'operasional' | 'narasi'>('keuangan')
  const [riskReport, setRiskReport] = useState<RiskReport | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)

  const [modal, setModal]             = useState<null | 'upload' | 'approve' | 'narrative' | 'auto-draft'>(null)
  const [approveForm, setApproveForm] = useState({ action: 'APPROVED', note: '' })
  const [narrativeForm, setNarrativeForm] = useState({ narrativeSummary: '', highlights: '' })
  const [busy, setBusy]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const [autoDraftData, setAutoDraftData] = useState<AutoDraftProgram[] | null>(null)
  const [autoDraftLoading, setAutoDraftLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadReport = useCallback(() => {
    if (!reportId) return
    setLoading(true); setError(null)
    api.get<{ data: Report; linkedPrograms?: Report['linkedPrograms'] }>(`/monthly-reports/${reportId}`)
      .then(r => {
        // BE mengirim linkedPrograms sebagai SIBLING dari `data` (bukan di dalam
        // report). Tanpa di-merge, panel "Linked Programs" selalu kosong, tombol
        // "Import from Atlas" tak pernah muncul, DAN menyimpan editor mengirim
        // linkedProgramIds:[] → menghapus link yang ada (data-loss).
        setReport({ ...r.data, linkedPrograms: r.linkedPrograms ?? [] })
        setNarrativeForm({ narrativeSummary: r.data.narrativeSummary ?? '', highlights: r.data.highlights ?? '' })
      })
      .catch(e => setError(e instanceof Error ? e.message : t('Failed to load report')))
      .finally(() => setLoading(false))
  }, [reportId, t])

  useEffect(() => { loadReport() }, [loadReport])

  // Sprint 5 — auto-fetch suggestion saat report DRAFT dan narrative belum ada.
  // User langsung lihat ada draft otomatis tersedia (anti-ABS forcing soft).
  useEffect(() => {
    if (!report) return
    const isDraft = report.status === 'DRAFT'
    const isEmpty = !report.narrativeSummary && !report.highlights
    if (isDraft && isEmpty && !autoDraftData && !autoDraftLoading) {
      void (async () => {
        setAutoDraftLoading(true)
        try {
          const res = await api.get<{ data: AutoDraftProgram[] }>(`/monthly-reports/${report.id}/auto-draft`)
          setAutoDraftData(res.data ?? [])
        } catch { /* silent — user bisa fetch manual */ }
        finally { setAutoDraftLoading(false) }
      })()
    }
  }, [report, autoDraftData, autoDraftLoading])

  // ── For DIMR reports: fetch the risk report counterpart ──
  useEffect(() => {
    if (!report || !report.unit.code.startsWith('DIMR')) return
    setRiskLoading(true)
    api.get<{ data: { id: number }[] }>(`/risk-reports?unitId=${report.unitId}&month=${report.month}&year=${report.year}`)
      .then(r => {
        const found = r.data[0]
        if (!found) { setRiskReport(null); return }
        return api.get<{ data: RiskReport }>(`/risk-reports/${found.id}`)
          .then(d => setRiskReport(d.data))
      })
      .catch((err) => { console.error('[Atlas] Gagal memuat risk report:', err); setRiskReport(null) })
      .finally(() => setRiskLoading(false))
  }, [report])

  // ── Scroll spy ──
  useEffect(() => {
    if (!report) return
    const sections = ['keuangan', 'operasional', 'narasi'] as const
    const observer = new IntersectionObserver(
      (entries) => {
        // find the topmost intersecting entry
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          const key = visible[0].target.id.replace('section-', '') as typeof activeSection
          setActiveSection(key)
        }
      },
      { threshold: 0.15, rootMargin: '-48px 0px -55% 0px' }
    )
    sections.forEach(s => {
      const el = document.getElementById(`section-${s}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [report])

  const canApprove = report
    ? (isKASUBDIV && report.status === 'SUBMITTED') || (isKADIV && report.status === 'REVIEWED')
    : false

  async function doUpload(file: File) {
    if (!report) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      await api.upload<{ data: Report }>(`/monthly-reports/${report.id}/upload`, fd)
      setModal(null); loadReport()
    } catch (e) { alert(e instanceof Error ? e.message : t('Upload failed')) }
    finally { setUploading(false) }
  }

  async function doSubmit() {
    if (!report || !confirm(t('Submit this report for review?'))) return
    setBusy(true)
    try { await api.post(`/monthly-reports/${report.id}/submit`, {}); loadReport() }
    catch (e) { alert(e instanceof Error ? e.message : t('Failed')) }
    finally { setBusy(false) }
  }

  async function doApprove() {
    if (!report) return
    setBusy(true)
    try {
      await api.post(`/monthly-reports/${report.id}/approve`, approveForm)
      setModal(null); setApproveForm({ action: 'APPROVED', note: '' }); loadReport()
    } catch (e) { alert(e instanceof Error ? e.message : t('Failed')) }
    finally { setBusy(false) }
  }

  async function doSaveNarrative() {
    if (!report) return
    setBusy(true)
    try { await api.put(`/monthly-reports/${report.id}`, narrativeForm); setModal(null); loadReport() }
    catch (e) { alert(e instanceof Error ? e.message : t('Failed')) }
    finally { setBusy(false) }
  }

  async function loadAutoDraft() {
    if (!report) return
    setAutoDraftLoading(true)
    try {
      const res = await api.get<{ data: AutoDraftProgram[] }>(`/monthly-reports/${report.id}/auto-draft`)
      setAutoDraftData(res.data ?? [])
      setModal('auto-draft')
    } catch (e) {
      console.error('[Atlas] Gagal memuat auto-draft:', e)
    } finally {
      setAutoDraftLoading(false)
    }
  }

  function applyAutoDraft() {
    if (!autoDraftData || autoDraftData.length === 0) return

    // Build narrative summary from program data
    const lines: string[] = []
    autoDraftData.forEach(p => {
      const taskLine = p.totalTasks > 0
        ? t('{{completed}}/{{total}} tasks completed ({{pct}}%)', { completed: p.completedTasks, total: p.totalTasks, pct: Math.round(p.completedTasks / p.totalTasks * 100) })
        : t('No tasks yet')
      const blockerLine = p.activeBlockers > 0 ? t(', {{count}} active blocker', { count: p.activeBlockers }) : ''
      lines.push(`[${p.code}] ${p.name}: ${p.progressPercent}% progress, ${p.healthLabel} — ${taskLine}${blockerLine}.`)
      if (p.latestLog?.narrative) {
        lines.push(t('  Latest update ({{period}}): {{narrative}}', { period: p.latestLog.period, narrative: p.latestLog.narrative }))
      }
    })

    // Build highlights from blockers and kendala
    const highlightLines: string[] = []
    autoDraftData.forEach(p => {
      if (p.latestLog?.kendala) {
        highlightLines.push(t('[{{code}}] Issue: {{issue}}', { code: p.code, issue: p.latestLog.kendala }))
      }
      if (p.latestLog?.dukunganDibutuhkan) {
        highlightLines.push(t('[{{code}}] Support needed: {{support}}', { code: p.code, support: p.latestLog.dukunganDibutuhkan }))
      }
    })

    setNarrativeForm({
      narrativeSummary: lines.join('\n'),
      highlights: highlightLines.join('\n'),
    })
    setModal('narrative')
  }

  function scrollTo(sectionId: string, key: typeof activeSection) {
    setActiveSection(key)
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Loading / error states ──

  if (loading) return (
    <div className="mrd-state">
      <div className="mrd-state__spinner" />
      <span className="mrd-state__copy">{t('Loading report…')}</span>
    </div>
  )

  if (error || !report) return (
    <div className="mrd-state">
      <span className="mrd-state__icon">⚠️</span>
      <span className="mrd-state__copy mrd-state__copy--error">{error ?? t('Report not found')}</span>
      <button className="mrd-back-btn" onClick={() => navigate('/laporan-bulanan')}>{t('← Back to list')}</button>
    </div>
  )

  // ── DIMR: render risk dashboard instead of regular view ──
  if (report.unit.code.startsWith('DIMR')) {
    if (riskLoading) return (
      <div className="mrd-state">
        <div className="mrd-state__spinner" />
        <span className="mrd-state__copy">{t('Loading risk report…')}</span>
      </div>
    )
    if (riskReport) return (
      <MonthlyReportDetailDIMR
        report={riskReport}
        onBack={() => navigate('/laporan-bulanan')}
        onRefresh={loadReport}
        userId={currentUser?.id ?? 0}
        userRole={role}
      />
    )
    // DIMR report exists in monthly-reports but no risk report yet
    return (
      <div className="mrd-state">
        <span className="mrd-state__icon">📋</span>
        <span className="mrd-state__copy">{t('The DIMR risk report for this period has not been created yet.')}</span>
        <button className="mrd-back-btn" onClick={() => navigate('/laporan-bulanan')}>{t('← Back')}</button>
      </div>
    )
  }

  const st         = STATUS[report.status] ?? STATUS.DRAFT
  const finMetrics = report.metrics?.filter(m => m.section === 'KEUANGAN') ?? []
  const opsMetrics = report.metrics?.filter(m => m.section === 'OPERASIONAL') ?? []
  const hasNarasi  = !!(report.narrativeSummary || report.highlights)
  const lastApproval = report.approvals?.slice(-1)[0]

  return (
    <div className="mrd-view">

      {/* ── Sticky top bar ── */}
      <div className="mrd-topbar">
        <button className="mrd-back-btn" onClick={() => navigate('/laporan-bulanan')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2 4 7l5 5" />
          </svg>
          {t('Monthly Reports')}
        </button>
        <div className="mrd-topbar__divider" />
        <div className="mrd-topbar__title">
          <span className="mrd-topbar__period">{reportTitle(report.month, report.year)}</span>
          <span className="mrd-topbar__unit">{report.unit.name}</span>
        </div>
        <span className={`mrd-topbar__badge ${st.cls}`}>{st.label}</span>
        <div className="mrd-topbar__actions">
          {report.status === 'DRAFT' && (
            <>
              <button className="mrd-btn" onClick={() => setModal('upload')}>{t('↑ Upload Excel')}</button>
              <button className="mrd-btn" onClick={() => setModal('narrative')}>{t('✏ Narrative')}</button>
              {(report.linkedPrograms ?? []).length > 0 && (
                <button className="mrd-btn" disabled={autoDraftLoading} onClick={() => void loadAutoDraft()}>
                  {autoDraftLoading ? t('⟳ Loading…') : t('⬇ Import from Atlas')}
                </button>
              )}
              {(finMetrics.length + opsMetrics.length) > 0 && (
                <button className="mrd-btn primary" disabled={busy} onClick={() => void doSubmit()}>
                  {t('Submit →')}
                </button>
              )}
            </>
          )}
          {canApprove && (
            <button className="mrd-btn green" onClick={() => setModal('approve')}>
              {t('✓ Review & Approve')}
            </button>
          )}
          <button className="mrd-btn" title={t('Print / Export PDF')} onClick={() => window.print()}>
            {t('⎙ Print')}
          </button>
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="mrd-body">

        {/* ── Report cover ── */}
        <div className={`mrd-cover ${st.row}`}>
          <div className="mrd-cover__band" />
          <div className="mrd-cover__content">
            <div className="mrd-cover__left">
              <div className="mrd-cover__eyebrow">{t('Management Report')}</div>
              <div className="mrd-cover__period">{periodLabel(report.month, report.year)}</div>
              <div className="mrd-cover__unit">{report.unit.name}</div>
              <div className="mrd-cover__meta">
                <span className={`mrd-badge ${st.cls}`}>{st.label}</span>
                {report.submittedBy && (
                  <span className="mrd-cover__submitted">
                    {t('Submitted by')} <strong>{report.submittedBy.name}</strong>
                    {report.submittedAt && (
                      <> · {new Date(report.submittedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                    )}
                  </span>
                )}
                {lastApproval && lastApproval.action === 'APPROVED' && (
                  <span className="mrd-cover__approved-on">
                    {t('✓ Approved')} {new Date(lastApproval.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
                {(report.metrics_count ?? 0) > 0 && (
                  <span className="mrd-cover__count">{t('{{count}} indicators', { count: report.metrics_count })}</span>
                )}
              </div>
            </div>

            {/* Approval stepper */}
            <div className="mrd-stepper">
              {([
                { key: 'SUBMITTED', label: t('Submitted'), done: ['SUBMITTED','REVIEWED','APPROVED'].includes(report.status) },
                { key: 'REVIEWED',  label: t('Reviewed'),  done: ['REVIEWED','APPROVED'].includes(report.status) },
                { key: 'APPROVED',  label: t('Approved'),  done: report.status === 'APPROVED' },
              ] as const).map((step, i) => (
                <div className="mrd-stepper__step" key={step.key}>
                  {i > 0 && <div className={`mrd-stepper__line ${step.done ? 'done' : ''}`} />}
                  <div className="mrd-stepper__node">
                    <div className={[
                      'mrd-stepper__dot',
                      step.done ? 'done' : '',
                      report.status === 'REJECTED' && step.key === 'REVIEWED' ? 'rejected' : '',
                    ].join(' ')}>
                      {step.done && report.status !== 'REJECTED' && <span className="mrd-stepper__check">✓</span>}
                    </div>
                    <span className={`mrd-stepper__lbl ${step.done ? 'done' : ''}`}>{step.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Jump nav ── */}
        {(finMetrics.length > 0 || opsMetrics.length > 0) && (
          <div className="mrd-jumpnav">
            {finMetrics.length > 0 && (
              <button
                className={`mrd-jumpnav__btn ${activeSection === 'keuangan' ? 'active' : ''}`}
                onClick={() => scrollTo('keuangan', 'keuangan')}>
                💰 {t('Financial')}
              </button>
            )}
            {opsMetrics.length > 0 && (
              <button
                className={`mrd-jumpnav__btn ${activeSection === 'operasional' ? 'active' : ''}`}
                onClick={() => scrollTo('operasional', 'operasional')}>
                ⚙️ {t('Operational')}
              </button>
            )}
            {hasNarasi && (
              <button
                className={`mrd-jumpnav__btn ${activeSection === 'narasi' ? 'active' : ''}`}
                onClick={() => scrollTo('narasi', 'narasi')}>
                📝 {t('Narrative')}
              </button>
            )}
          </div>
        )}

        {/* ── No data state ── */}
        {finMetrics.length === 0 && opsMetrics.length === 0 && (
          <div className="mrd-empty">
            <span className="mrd-empty__icon">📂</span>
            <span>{t('No data yet — upload an Excel file to populate this report')}</span>
            <button className="mrd-btn primary" onClick={() => setModal('upload')}>{t('↑ Upload Excel')}</button>
          </div>
        )}

        {/* ── Dashboards ── */}
        {finMetrics.length > 0 && <KeuanganDashboard metrics={finMetrics} report={report} />}
        {opsMetrics.length > 0  && <OperasionalDashboard metrics={opsMetrics} report={report} />}

        {/* ── Narrative ── */}
        <NarrativeSection report={report} />

        {/* ── Audit trail ── */}
        <AuditTrail report={report} />

        {/* ── Linked programs ── */}
        <LinkedProgramsSection
          report={report}
          programs={programs as ProgramRef[]}
          onSaved={loadReport}
        />

      </div>

      {/* ── Modal: Upload ── */}
      {modal === 'upload' && (
        <Modal
          title={t('Upload Excel Data')}
          subtitle={t("Update this report's contents by importing indicators from the matching Excel template.")}
          onClose={() => setModal(null)}
          busy={uploading}
        >
          <section className="modal-section modal-section--soft">
            <div className="modal-section__intro">
              <h4>{t('File template')}</h4>
              <p>{t('Use the same column layout so financial and operational data can be mapped correctly.')}</p>
            </div>
            <div className="mrd-upload-template">
              <div className="mrd-upload-template__title">{t('Excel Template Format — 7 Columns')}</div>
              <div className="mrd-upload-template__cols">
                {['A: Section','B: Category','C: Label','D: Unit','E: RKAP','F: Actual','G: Prior Year'].map(c => (
                  <span className="mrd-upload-template__col" key={c}>{t(c)}</span>
                ))}
              </div>
              <div className="mrd-upload-template__note">
                {t('Section: OPERASIONAL or KEUANGAN. Row 1 is the header and will be skipped.')}
              </div>
            </div>
          </section>
          <section className="modal-section">
            <button
              type="button"
              className="mrd-upload-drop"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void doUpload(f) }}>
              <span className="mrd-upload-drop__icon">{uploading ? '⏳' : '📂'}</span>
              <span className="mrd-upload-drop__text">{uploading ? t('Uploading…') : t('Click or drag an Excel file here')}</span>
              <span className="mrd-upload-drop__sub">{t('.xlsx or .xls · Max 10 MB')}</span>
            </button>
          </section>
          <input ref={fileRef} className="mrd-file-input-hidden" type="file" accept=".xlsx,.xls"
            onChange={e => { const f = e.target.files?.[0]; if (f) void doUpload(f) }} />
        </Modal>
      )}

      {/* ── Modal: Approve ── */}
      {modal === 'approve' && (
        <Modal
          title={t('Review & Approval')}
          subtitle={t('Choose a review decision and add brief context if the report needs revision or rejection.')}
          onClose={() => setModal(null)}
          busy={busy}
          isDirty={approveForm.action !== 'APPROVED' || approveForm.note !== ''}
          footer={(
            <>
              <button className="btn" onClick={() => setModal(null)} type="button">{t('Cancel')}</button>
              <button className="btn btn--primary" disabled={busy} onClick={() => void doApprove()} type="button">
                {busy ? t('Saving…') : t('Confirm')}
              </button>
            </>
          )}
        >
          <section className="modal-section">
            <div className="modal-section__intro">
              <h4>{t('Review decision')}</h4>
              <p>{t('Select the final review outcome, then add a note so the submitter understands the next steps.')}</p>
            </div>
            <div className="form-group">
              <label className="form-label">{t('Decision')}</label>
              <select className="form-select" value={approveForm.action}
                onChange={e => setApproveForm(f => ({ ...f, action: e.target.value }))}>
                <option value="APPROVED">{t('Approve')}</option>
                <option value="REVISION_REQUESTED">{t('Request Revision')}</option>
                <option value="REJECTED">{t('Reject')}</option>
              </select>
            </div>
            <div className="form-group mrd-form-group--spaced">
              <label className="form-label">{t('Note (optional)')}</label>
              <textarea className="form-textarea" rows={3} value={approveForm.note}
                onChange={e => setApproveForm(f => ({ ...f, note: e.target.value }))}
                placeholder={t('Add a note for the submitter…')} />
            </div>
          </section>
        </Modal>
      )}

      {/* ── Modal: Narrative ── */}
      {modal === 'narrative' && (
        <Modal
          title={t('Edit Executive Summary')}
          subtitle={t("Refine the report's main narrative so executive readers can quickly grasp the achievements and key issues.")}
          onClose={() => setModal(null)}
          busy={busy}
          isDirty={
            !!report && (
              narrativeForm.narrativeSummary !== (report.narrativeSummary ?? '') ||
              narrativeForm.highlights !== (report.highlights ?? '')
            )
          }
          footer={(
            <>
              <button className="btn" onClick={() => setModal(null)} type="button">{t('Cancel')}</button>
              <button className="btn btn--primary" disabled={busy} onClick={() => void doSaveNarrative()} type="button">
                {busy ? t('Saving…') : t('Save')}
              </button>
            </>
          )}
        >
          <section className="modal-section">
            <div className="modal-section__intro">
              <h4>{t('Executive narrative')}</h4>
              <p>{t('Focus on the big picture of monthly performance, then highlight the most important achievements and issues.')}</p>
            </div>
            <div className="form-group">
              <label className="form-label">{t('Executive Summary')}</label>
              <textarea className="form-textarea" rows={4} value={narrativeForm.narrativeSummary}
                onChange={e => setNarrativeForm(f => ({ ...f, narrativeSummary: e.target.value }))}
                placeholder={t("Write a summary of this month's performance…")} />
            </div>
            <div className="form-group mrd-form-group--spaced">
              <label className="form-label">{t('Highlights')}</label>
              <textarea className="form-textarea" rows={3} value={narrativeForm.highlights}
                onChange={e => setNarrativeForm(f => ({ ...f, highlights: e.target.value }))}
                placeholder={t('Key achievements and notes…')} />
            </div>
          </section>
        </Modal>
      )}

      {modal === 'auto-draft' && autoDraftData && (
        <Modal
          title={t('Preview Import from Atlas')}
          onClose={() => setModal(null)}
          busy={busy}
          footer={
            <>
              <button className="btn" onClick={() => setModal(null)} type="button">{t('Cancel')}</button>
              <button className="btn btn--primary" onClick={applyAutoDraft} type="button">
                {t('Use as Narrative Draft')}
              </button>
            </>
          }
        >
          {autoDraftData.length === 0 ? (
            <p className="mrd-auto-draft__empty">{t('No program data available to import. Make sure programs are linked to this report.')}</p>
          ) : (
            <div className="mrd-auto-draft">
              <p className="mrd-auto-draft__intro">{t("The following data will be used as the report's narrative draft. You can still edit it before saving.")}</p>
              {autoDraftData.map(p => (
                <div key={p.programId} className="mrd-auto-draft__card">
                  <div className="mrd-auto-draft__card-header">
                    <span className="code-badge">{p.code}</span>
                    <strong className="mrd-auto-draft__card-name">{p.name}</strong>
                    <span className={`badge badge--${p.healthStatus === 'GREEN' ? 'green' : p.healthStatus === 'RED' ? 'red' : 'yellow'}`}>
                      {p.healthLabel}
                    </span>
                    <span className="mrd-auto-draft__pct">{p.progressPercent}%</span>
                  </div>
                  <div className="mrd-auto-draft__stats">
                    <span>{t('Tasks: {{completed}}/{{total}} completed', { completed: p.completedTasks, total: p.totalTasks })}</span>
                    {p.activeBlockers > 0 && <span className="mrd-auto-draft__blocker">{t('{{count}} active blocker', { count: p.activeBlockers })}</span>}
                  </div>
                  {p.latestLog && (
                    <div className="mrd-auto-draft__log">
                      <span className="mrd-auto-draft__log-period">{p.latestLog.period}</span>
                      <p className="mrd-auto-draft__log-text">{p.latestLog.narrative}</p>
                      {p.latestLog.kendala && <p className="mrd-auto-draft__kendala"><strong>{t('Issue:')}</strong> {p.latestLog.kendala}</p>}
                    </div>
                  )}
                  {p.kpis.length > 0 && (
                    <div className="mrd-auto-draft__kpis">
                      {p.kpis.slice(0, 3).map((k, i) => (
                        <span key={i} className="mrd-auto-draft__kpi-chip">
                          {k.name}: {k.actual}{k.unit ? ` ${k.unit}` : ''} / {k.target}
                          {k.pct !== null && ` (${k.pct}%)`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default MonthlyReportDetailView
