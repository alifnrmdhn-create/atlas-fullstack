import { useState } from 'react'
import { usePage, Link } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'

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
  periode: string
}

function scoreColor(val: number): 'green' | 'yellow' | 'red' {
  if (val >= 100) return 'green'
  if (val >= 80) return 'yellow'
  return 'red'
}

function fillPct(target: number, realisasi: number, polaritas: 'maximize' | 'minimize'): number {
  if (!target) return realisasi === 0 ? 100 : 0
  const ratio = polaritas === 'maximize'
    ? realisasi / target
    : target / Math.max(realisasi, 0.0001)
  return Math.min(ratio * 100, 110)
}

function formatVal(val: number, satuan: string): string {
  if (satuan === 'Rp M') return `Rp ${val.toLocaleString('id-ID')} M`
  if (satuan === 'Ha') return `${val.toLocaleString('id-ID')} Ha`
  if (satuan === 'Ton') return `${val.toLocaleString('id-ID')} Ton`
  if (satuan === '%') return `${val}%`
  return `${val.toLocaleString('id-ID')} ${satuan}`
}

const PERSPEKTIF_COLORS: Record<string, string> = {
  ekonomi_sosial: 'var(--green)',
  imb:            'var(--indigo)',
  teknologi:      'var(--cyan)',
  investasi:      'var(--yellow)',
  talenta:        'var(--purple)',
}

export default function KolegialDetailView() {
  const { direktur, kpiGroups, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const totalSkor = kpiGroups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.skor, 0), 0)
  const totalColor = scoreColor(totalSkor)
  const barWidth = Math.min((totalSkor / 110) * 100, 100)

  const visibleGroups = activeFilter === 'all'
    ? kpiGroups
    : kpiGroups.filter((g) => g.perspektif_key === activeFilter)

  return (
    <div className="view-performance">
      {/* Toolbar */}
      <div className="perf-toolbar">
        <button
          className="perf-toolbar__back"
          onClick={() => navigate('/performance/kolegial')}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m8 2-4 4 4 4" />
          </svg>
          Kembali
        </button>
        <div className="perf-toolbar__sep" />
        <span className="perf-toolbar__title">KPI Kolegial — {direktur.jabatan}</span>
        <div className="perf-toolbar__right">
          <div className="perf-period-select">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <rect x="1" y="2" width="12" height="11" rx="1.5" />
              <path d="M1 6h12M5 2v2M9 2v2" />
            </svg>
            {periode}
          </div>
        </div>
      </div>

      <div className="perf-content">
        {/* Header panel */}
        <div className="perf-detail-header">
          <div className="perf-detail-header__top">
            <div className="perf-detail-header__meta">
              <div className="perf-detail-header__name">{direktur.nama}</div>
              <div className="perf-detail-header__jabatan">{direktur.jabatan}</div>
              <span className="perf-detail-header__unit">{direktur.kode}</span>
            </div>
            <div className="perf-detail-header__score-badge">
              <div className={`perf-detail-header__score-value perf-detail-header__score-value--${totalColor}`}>
                {totalSkor.toFixed(2)}%
              </div>
              <div className="perf-detail-header__score-label">Total Nilai</div>
            </div>
          </div>
          <div className="perf-detail-header__progress">
            <div className="perf-detail-header__progress-bar">
              <div
                className={`perf-detail-header__progress-fill perf-detail-header__progress-fill--${totalColor}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: `var(--${totalColor})`, whiteSpace: 'nowrap' }}>
              {totalSkor.toFixed(2)} / 100
            </span>
          </div>
          <div className="perf-detail-header__meta-row">
            <span className="perf-detail-header__chip">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <rect x="1" y="2" width="10" height="9" rx="1.2" />
                <path d="M1 5h10M4 2v2M8 2v2" />
              </svg>
              {periode}
            </span>
            <span className="perf-detail-header__chip">
              {kpiGroups.reduce((n, g) => n + g.items.length, 0)} KPI items
            </span>
          </div>
        </div>

        {/* Perspektif filter */}
        <div className="perf-perspektif-filters">
          <button
            className={`perf-perspektif-pill${activeFilter === 'all' ? ' perf-perspektif-pill--active' : ''}`}
            onClick={() => setActiveFilter('all')}
            type="button"
          >
            Semua perspektif
          </button>
          {kpiGroups.map((g) => (
            <button
              key={g.perspektif_key}
              className={`perf-perspektif-pill${activeFilter === g.perspektif_key ? ' perf-perspektif-pill--active' : ''}`}
              onClick={() => setActiveFilter(g.perspektif_key)}
              type="button"
            >
              <span
                className="perf-perspektif-pill__dot"
                style={{ background: PERSPEKTIF_COLORS[g.perspektif_key] ?? 'var(--text-muted)' }}
              />
              {g.perspektif}
            </button>
          ))}
        </div>

        {/* KPI groups */}
        {visibleGroups.map((group) => (
          <div key={group.perspektif_key} className="perf-kpi-group">
            <div className="perf-kpi-group__header">
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: PERSPEKTIF_COLORS[group.perspektif_key] ?? 'var(--text-muted)',
                }}
              />
              <span className="perf-kpi-group__perspektif">{group.perspektif}</span>
              <span className={`perf-kpi-group__pct perf-kpi-group__pct--${group.color}`}>
                {group.pct.toFixed(1)}%
              </span>
            </div>

            {group.items.map((item) => {
              const pct = fillPct(item.target, item.realisasi, item.polaritas)
              const itemColor = scoreColor(pct)
              const barFillWidth = Math.min(pct, 100)

              return (
                <div key={item.kode} className="perf-kpi-row">
                  <div className="perf-kpi-row__left">
                    <div className="perf-kpi-row__name">{item.nama}</div>
                    <div className="perf-kpi-row__meta">
                      <span className="perf-kpi-row__satuan">{item.satuan}</span>
                      <span className={`perf-kpi-row__polarity perf-kpi-row__polarity--${item.polaritas === 'maximize' ? 'max' : 'min'}`}>
                        {item.polaritas === 'maximize' ? '↑ Maximize' : '↓ Minimize'}
                      </span>
                    </div>
                  </div>
                  <div className="perf-kpi-row__progress">
                    <div className="perf-kpi-row__bar">
                      <div
                        className={`perf-kpi-row__bar-fill perf-kpi-row__bar-fill--${itemColor}`}
                        style={{ width: `${barFillWidth}%` }}
                      />
                    </div>
                    <div className="perf-kpi-row__values">
                      <span>T: {formatVal(item.target, item.satuan)}</span>
                      <span>R: {formatVal(item.realisasi, item.satuan)}</span>
                    </div>
                  </div>
                  <div className="perf-kpi-row__right">
                    <span className="perf-kpi-row__skor">{item.skor.toFixed(1)}</span>
                    <span className="perf-kpi-row__bobot">bobot {item.bobot}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
