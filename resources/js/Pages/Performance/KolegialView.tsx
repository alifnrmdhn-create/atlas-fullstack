import { Head, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Card, Pill, Stat } from '../../design-system'
import { scoreTone, fillRatio } from './_shared'
import './Performance.css'

type Direktur = {
  kode: string
  nama: string
  jabatan: string
  slug: string
  nilai: number
  total_kpi: number
  perspektif?: string[]
}

type StatItem = {
  label: string
  value: string
  sub?: string
  color: 'muted' | 'green' | 'yellow' | 'red'
}

type PageProps = {
  stats: StatItem[]
  dirut: Direktur | null
  direktur: Direktur[]
  periode: string
}

const PERSPEKTIF_COLORS: Record<string, string> = {
  'Ekonomi & Sosial':     'var(--ds-green-500)',
  'IMB':                   '#6366F1',
  'Inovasi Model Bisnis':  '#6366F1',
  'Teknologi':             '#06B6D4',
  'Investasi':             'var(--ds-amber-500)',
  'Talenta':               '#A855F7',
}

function statTone(c: StatItem['color']): 'green' | 'amber' | 'red' | 'neutral' {
  if (c === 'green') return 'green'
  if (c === 'yellow') return 'amber'
  if (c === 'red') return 'red'
  return 'neutral'
}

export default function KolegialView() {
  const { stats, dirut, direktur, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()

  const dirutTone = dirut ? scoreTone(dirut.nilai) : 'neutral'
  const dirutBar = dirut ? fillRatio(dirut.nilai) * 100 : 0
  const isEmpty = !dirut && direktur.length === 0

  return (
    <>
      <Head title="KPI Collegial" />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <h1 className="perf__title">KPI Collegial</h1>
              <span className="perf__subtitle">Shared achievement of the board of directors</span>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periode}
              </span>
            </div>
          </header>

          {isEmpty && (
            <Card padding="lg" className="perf__section perf-empty">
              <div className="perf-empty__title">No KPI Collegial data yet</div>
              <div>Directorate scores are not available for the {periode} period. Data will appear once the directors' KPI module is populated.</div>
            </Card>
          )}

          {!isEmpty && (
          <>
          {/* ─── Stat row ─────────────────────────── */}
          <Card padding="lg" className="perf__section">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
              {stats.map(s => (
                <Stat
                  key={s.label}
                  size="lg"
                  value={s.value}
                  label={s.label}
                  caption={s.sub}
                  tone={statTone(s.color)}
                />
              ))}
            </div>
          </Card>

          {/* ─── Direktur Utama hero ─────────────── */}
          {dirut && (
          <Card
            padding="lg"
            className="perf__section perf-subject"
            onClick={() => navigate(`/performance/kolegial/${dirut.slug}`)}
            style={{ cursor: 'pointer' }}
          >
            <div className="perf-subject__row">
              <div className="perf-subject__meta">
                <span className="perf-subject__eyebrow">{dirut.jabatan}</span>
                <div className="perf-subject__name">{dirut.nama}</div>
                <div className="perf-subject__chips">
                  <Pill tone="neutral" variant="soft">{dirut.total_kpi} KPI</Pill>
                  <Pill tone="neutral" variant="soft">{periode}</Pill>
                  {dirut.perspektif?.map(p => (
                    <span
                      key={p}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        height: 20,
                        padding: '0 8px',
                        borderRadius: 'var(--ds-radius-pill)',
                        background: 'var(--ds-neutral-100)',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--ds-text-secondary)',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: PERSPEKTIF_COLORS[p] ?? 'var(--ds-text-tertiary)',
                        }}
                      />
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="perf-subject__score">
                <span className="perf-subject__score-value" data-tone={dirutTone}>
                  {dirut.nilai.toFixed(2)}<span style={{ fontSize: 14, color: 'var(--ds-text-tertiary)', marginLeft: 3, fontWeight: 500 }}>%</span>
                </span>
                <span className="perf-subject__score-label">View details →</span>
              </div>
            </div>
            <div className="perf-subject__bar">
              <div className="perf-subject__bar-fill" data-tone={dirutTone} style={{ width: `${dirutBar}%` }} />
            </div>
          </Card>
          )}

          {/* ─── 5 Direktur grid ──────────────────── */}
          <section className="perf__section">
            <span className="perf__section-label">Directors' Individual KPI</span>
            <div className="perf-direktur-grid">
              {direktur.map(d => {
                const tone = scoreTone(d.nilai)
                const bar = fillRatio(d.nilai) * 100
                return (
                  <Card
                    key={d.kode}
                    padding="md"
                    className="perf-direktorat"
                    onClick={() => navigate(`/performance/kolegial/${d.slug}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="perf-direktorat__head">
                      <div>
                        <div className="perf-direktorat__name">{d.nama}</div>
                        <div className="perf-rank__sub" style={{ marginTop: 2 }}>{d.jabatan}</div>
                      </div>
                      <span className="perf-direktorat__total" data-tone={tone}>
                        {d.nilai.toFixed(2)}
                      </span>
                    </div>
                    <div className="perf-subject__bar" style={{ marginTop: 0 }}>
                      <div className="perf-subject__bar-fill" data-tone={tone} style={{ width: `${bar}%` }} />
                    </div>
                    <div className="perf-rank__sub">{d.total_kpi} KPI</div>
                  </Card>
                )
              })}
            </div>
          </section>
          </>
          )}
        </div>
      </div>
    </>
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
