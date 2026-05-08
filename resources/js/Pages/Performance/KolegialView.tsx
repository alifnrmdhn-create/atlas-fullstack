import { useState } from 'react'
import { usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'

type Direktur = {
  kode: string
  nama: string
  jabatan: string
  slug: string
  nilai: number
  total_kpi: number
  perspektif?: string[]
}

type Stat = {
  label: string
  value: string
  sub?: string
  color: 'muted' | 'green' | 'yellow' | 'red'
}

type PageProps = {
  stats: Stat[]
  dirut: Direktur
  direktur: Direktur[]
  periode: string
}

function scoreColor(val: number): 'green' | 'yellow' | 'red' {
  if (val >= 100) return 'green'
  if (val >= 80) return 'yellow'
  return 'red'
}

function ScoreRing({ value, size = 52 }: { value: number; size?: number }) {
  const r = (size - 7) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r
  const capped = Math.min(value / 110, 1)
  const strokeDashoffset = circumference * (1 - capped)
  const color = scoreColor(value)
  const colorMap = { green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)' }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-overlay-strong)" strokeWidth={6} />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke={colorMap[color]} strokeWidth={6}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        style={{ transform: `rotate(-90deg)`, transformOrigin: `${cx}px ${cx}px`, transition: 'stroke-dashoffset 600ms cubic-bezier(0.4,0,0.2,1)' }}
      />
    </svg>
  )
}

const PERSPEKTIF_COLORS: Record<string, string> = {
  'Ekonomi & Sosial':      'var(--green)',
  'IMB':                   'var(--indigo)',
  'Inovasi Model Bisnis':  'var(--indigo)',
  'Teknologi':             'var(--cyan)',
  'Investasi':             'var(--yellow)',
  'Talenta':               'var(--purple)',
}

export default function KolegialView() {
  const { stats, dirut, direktur, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()

  const dirutColor = scoreColor(dirut.nilai)
  const barWidth = Math.min((dirut.nilai / 110) * 100, 100)

  return (
    <div className="view-performance">
      {/* Toolbar */}
      <div className="perf-toolbar">
        <span className="perf-toolbar__title">KPI Kolegial</span>
        <div className="perf-toolbar__sep" />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          Capaian bersama jajaran direksi
        </span>
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
        {/* Stat cards */}
        <div className="perf-stat-grid">
          {stats.map((s) => (
            <div key={s.label} className={`perf-stat${s.color !== 'muted' ? ` perf-stat--${s.color}` : ''}`}>
              <span className="perf-stat__label">{s.label}</span>
              <span className="perf-stat__value">{s.value}</span>
              {s.sub && <span className="perf-stat__sub">{s.sub}</span>}
            </div>
          ))}
        </div>

        {/* Direktur Utama hero */}
        <div
          className="perf-hero"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/performance/kolegial/${dirut.slug}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(`/performance/kolegial/${dirut.slug}`)}
        >
          <div className="perf-hero__ring">
            <div className="perf-score-ring">
              <ScoreRing value={dirut.nilai} size={64} />
            </div>
          </div>
          <div className="perf-hero__info">
            <div className="perf-hero__label">Direktur Utama</div>
            <div className="perf-hero__name">{dirut.nama}</div>
            <div className="perf-hero__jabatan">{dirut.jabatan}</div>
            <div className="perf-hero__bar-wrap">
              <div className="perf-hero__bar">
                <div
                  className={`perf-hero__bar-fill perf-hero__bar-fill--${dirutColor}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className={`perf-hero__score-text perf-hero__score-text--${dirutColor}`}>
                {dirut.nilai.toFixed(2)}%
              </span>
            </div>
            {dirut.perspektif && (
              <div className="perf-hero__perspektif">
                {dirut.perspektif.map((p) => (
                  <span
                    key={p}
                    className="perf-perspektif-pill"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <span
                      className="perf-perspektif-pill__dot"
                      style={{ background: PERSPEKTIF_COLORS[p] ?? 'var(--text-muted)' }}
                    />
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="perf-hero__right">
            <span className={`badge badge--${dirutColor}`} style={{ fontSize: 13, fontWeight: 800 }}>
              {dirut.nilai.toFixed(2)}%
            </span>
            <span className="perf-hero__kpi-count">{dirut.total_kpi} KPI</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lihat detail →</span>
          </div>
        </div>

        {/* 5 Direktur grid */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
            KPI Individu Direktur
          </div>
          <div className="perf-director-grid">
            {direktur.map((d) => {
              const color = scoreColor(d.nilai)
              const width = Math.min((d.nilai / 110) * 100, 100)
              return (
                <a
                  key={d.kode}
                  className="perf-director-card"
                  href={`/performance/kolegial/${d.slug}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/performance/kolegial/${d.slug}`) }}
                >
                  <div className="perf-director-card__header">
                    <div>
                      <div className="perf-director-card__name">{d.nama}</div>
                      <div className="perf-director-card__jabatan">{d.jabatan}</div>
                    </div>
                  </div>
                  <div className={`perf-director-card__score perf-director-card__score--${color}`}>
                    {d.nilai.toFixed(2)}%
                  </div>
                  <div className="perf-director-card__bar-row">
                    <div className="perf-director-card__bar">
                      <div
                        className={`perf-director-card__bar-fill perf-director-card__bar-fill--${color}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="perf-director-card__kpi-count">{d.total_kpi} KPI</span>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
