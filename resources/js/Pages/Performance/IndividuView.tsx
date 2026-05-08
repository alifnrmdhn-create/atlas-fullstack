import { useState } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'

type Performer = {
  rank: number
  nama: string
  jabatan: string
  unit: string
  nilai: number
}

type Divisi = { kode: string; nama: string }
type OrgGroup = { kode: string; nama: string; divisi: Divisi[] }

type PageProps = {
  topPerformers: Record<string, Performer[]>
  orgNav: OrgGroup[]
  periode: string
}

function scoreColor(val: number): 'green' | 'yellow' | 'red' {
  if (val >= 100) return 'green'
  if (val >= 80) return 'yellow'
  return 'red'
}

export default function IndividuView() {
  const { topPerformers, orgNav, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()
  const [openOrg, setOpenOrg] = useState<string | null>(null)

  const bodGroups = Object.entries(topPerformers)

  return (
    <div className="view-performance">
      {/* Toolbar */}
      <div className="perf-toolbar">
        <span className="perf-toolbar__title">KPI Individu</span>
        <div className="perf-toolbar__sep" />
        <span className="perf-source-note">Sumber data dari APMS per {periode}</span>
        <div className="perf-toolbar__right">
          <Link
            href="/performance/me"
            className="perf-toolbar__back"
            style={{ background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }}
            title="Lihat KPI saya sendiri"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="7" cy="5" r="2.5" />
              <path d="M2 12c0-2.5 2-4 5-4s5 1.5 5 4" />
            </svg>
            KPI Saya
          </Link>
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
        {/* Top performers */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Top Performers
          </div>
          <div className="perf-top-grid">
            {bodGroups.map(([bodLabel, performers]) => (
              <div key={bodLabel} className="perf-podium-section">
                <div className="perf-podium-section__header">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 1l1.5 3.5L12 5 9.5 7.5 10 11 7 9.5 4 11l.5-3.5L2 5l3.5-.5L7 1z" />
                  </svg>
                  <span className="perf-podium-section__title">{bodLabel}</span>
                  <span className="perf-org-section__count">Nilai Bulan Ini</span>
                </div>
                {performers.map((p) => {
                  const color = scoreColor(p.nilai)
                  return (
                    <div
                      key={p.nama}
                      className="perf-rank-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/performance/individu/${encodeURIComponent(p.nama)}`)}
                    >
                      <span className={`perf-rank-badge perf-rank-badge--${p.rank}`}>{p.rank}</span>
                      <div className="perf-rank-item__info">
                        <div className="perf-rank-item__name">{p.nama}</div>
                        <div className="perf-rank-item__sub">{p.jabatan} · {p.unit}</div>
                      </div>
                      <span className={`perf-rank-item__score perf-rank-item__score--${color}`}>
                        {p.nilai.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Org navigation */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Navigasi per Divisi
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orgNav.map((org) => {
              const isOpen = openOrg === org.kode || openOrg === null
              return (
                <div key={org.kode} className="perf-org-section">
                  <div
                    className="perf-org-section__header"
                    onClick={() => setOpenOrg(openOrg === org.kode ? null : org.kode)}
                  >
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: 'transform 200ms', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      aria-hidden="true"
                    >
                      <path d="m4 2 4 4-4 4" />
                    </svg>
                    <span className="perf-org-section__title">{org.nama}</span>
                    <span className="perf-org-section__count">{org.divisi.length} divisi</span>
                  </div>
                  {isOpen && (
                    <div className="perf-org-divisi-grid">
                      {org.divisi.map((div) => (
                        <a
                          key={div.kode}
                          className="perf-org-divisi-tile"
                          href={`/performance/individu?unit=${div.kode}`}
                          onClick={(e) => {
                            e.preventDefault()
                            navigate(`/performance/individu?unit=${div.kode}`)
                          }}
                        >
                          <span className="perf-org-divisi-tile__code">{div.kode}</span>
                          <span className="perf-org-divisi-tile__name">{div.nama}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
