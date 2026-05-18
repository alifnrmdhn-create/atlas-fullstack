import { useState } from 'react'
import { Head, Link, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Button, Card } from '../../design-system'
import { LeaderboardSection, type Performer } from './LeaderboardSection'
import './Performance.css'

type Divisi = { kode: string; nama: string }
type OrgGroup = { kode: string; nama: string; divisi: Divisi[] }

type PageProps = {
  topPerformers: Record<string, Performer[]>
  orgNav: OrgGroup[]
  periode: string
}

export default function IndividuView() {
  const { topPerformers, orgNav, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()
  const [openOrg, setOpenOrg] = useState<string | null>(null)

  return (
    <>
      <Head title="KPI Individu" />
      <div className="ds perf">
        <div className="perf__inner">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <h1 className="perf__title">KPI Individu</h1>
              <span className="perf__subtitle">Sumber data dari APMS per {periode}</span>
            </div>
            <div className="perf__header-actions">
              <Link href="/performance/me">
                <Button variant="primary" size="sm" iconLeft={<IconUser />}>
                  KPI Saya
                </Button>
              </Link>
              <span className="perf__period-pill">
                <IconCalendar />
                {periode}
              </span>
            </div>
          </header>

          {/* ─── Leaderboard BOD-1/-2/-3 ─────────── */}
          <section className="perf__section">
            <div className="perf-section-head">
              <span className="perf__section-label">Leaderboard KPI</span>
              <span className="perf-section-meta">Top 3 per level · medal styling untuk #1–#3</span>
            </div>
            <LeaderboardSection
              topPerformers={topPerformers}
              onSelect={(nama) => navigate(`/performance/individu/${encodeURIComponent(nama)}`)}
              periode={periode}
            />
          </section>

          {/* ─── Org navigation ──────────────────── */}
          <section className="perf__section">
            <span className="perf__section-label">Navigasi per Divisi</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orgNav.map(org => {
                const isOpen = openOrg === org.kode || openOrg === null
                return (
                  <Card key={org.kode} padding="none">
                    <button
                      type="button"
                      onClick={() => setOpenOrg(openOrg === org.kode ? null : org.kode)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 16px',
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'left',
                        borderRadius: 'var(--ds-radius-lg)',
                        fontFamily: 'inherit',
                      }}
                    >
                      <svg
                        width="11" height="11" viewBox="0 0 12 12" fill="none"
                        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          transition: 'transform 200ms',
                          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                          color: 'var(--ds-text-tertiary)',
                        }}
                        aria-hidden="true"
                      >
                        <path d="m4 2 4 4-4 4" />
                      </svg>
                      <span style={{
                        fontSize: 'var(--ds-text-14)',
                        fontWeight: 'var(--ds-weight-semibold)',
                        color: 'var(--ds-text-primary)',
                      }}>
                        {org.nama}
                      </span>
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        color: 'var(--ds-text-tertiary)',
                      }}>
                        {org.divisi.length} divisi
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 8,
                        padding: '0 16px 16px',
                      }}>
                        {org.divisi.map(div => (
                          <a
                            key={div.kode}
                            href={`/performance/individu?unit=${div.kode}`}
                            onClick={e => {
                              e.preventDefault()
                              navigate(`/performance/individu?unit=${div.kode}`)
                            }}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                              padding: '8px 12px',
                              borderRadius: 'var(--ds-radius-md)',
                              border: '1px solid var(--ds-border-subtle)',
                              textDecoration: 'none',
                              color: 'inherit',
                              fontFamily: 'inherit',
                              transition: 'background-color 120ms',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-surface-hover)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <span style={{
                              fontFamily: 'var(--ds-font-mono)',
                              fontSize: 10,
                              color: 'var(--ds-text-tertiary)',
                            }}>
                              {div.kode}
                            </span>
                            <span style={{
                              fontSize: 'var(--ds-text-13)',
                              color: 'var(--ds-text-primary)',
                            }}>
                              {div.nama}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

function IconUser() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="5" r="2.5" />
      <path d="M2 12c0-2.5 2-4 5-4s5 1.5 5 4" />
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
