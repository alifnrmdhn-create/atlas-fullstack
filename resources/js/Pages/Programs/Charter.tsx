import { Head, usePage } from '@inertiajs/react'
import type { CharterPayload } from '../../types/charter'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { ActivityTimelineTable } from './Charter/ActivityTimelineTable'
import { ExportButton } from './Charter/ExportButton'
import { HeaderStrip } from './Charter/HeaderStrip'
import { KpiProgressTable } from './Charter/KpiProgressTable'
import { PicaNextStepRow } from './Charter/PicaNextStepRow'
import { StatusPanel } from './Charter/StatusPanel'
import { UpdatePanel } from './Charter/UpdatePanel'
import './Charter/charter.css'

/**
 * Charter View — read-only single-page program brief.
 *
 * Mirrors the KPI Charter PPT format used by DKMR (slide 20–24).
 * Parallel route to /programs/{id} (edit mode, 5 tabs).
 *
 * Layout (per CHARTER_VIEW_PLAN.md section 5.7):
 *   HeaderStrip
 *   ├─ Grid 2-col (1.55fr / 1fr)
 *   │  ├─ ActivityTimelineTable
 *   │  └─ Side rail: StatusPanel + UpdatePanel
 *   ├─ PicaNextStepRow
 *   └─ KpiProgressTable
 */
export default function Charter() {
  const { props } = usePage<CharterPayload>()
  const { program, status, kpi, activities, latestProgressLog, kpiHistory } = props
  const navigate = useInertiaNavigate()

  return (
    <>
      <Head title={`Charter — ${program.code}`} />
      <div className="page-shell">
        <div className="page-shell__inner">
          <div className="charter-page" data-charter-root>
            <nav className="charter-back" aria-label="Navigasi kembali">
              <button
                type="button"
                className="charter-back__link"
                onClick={() => navigate(`/programs/${program.id}`)}
                title="Kembali ke detail program"
              >
                <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
                  <path d="M9 6H3M6 3 3 6l3 3" />
                </svg>
                <span>Kembali ke {program.code}</span>
              </button>
            </nav>

            <HeaderStrip
              program={program}
              status={status}
              kpi={kpi}
              actionSlot={<ExportButton data={props} />}
            />

            <div className="charter-grid">
              <section className="charter-grid__main">
                <h2 className="charter-section-title">Aktivitas &amp; Timeline</h2>
                <ActivityTimelineTable activities={activities} period={program.period} />
              </section>
              <aside className="charter-grid__side">
                <StatusPanel status={status} />
                <UpdatePanel log={latestProgressLog} />
              </aside>
            </div>

            <section className="charter-section">
              <h2 className="charter-section-title">PICA &amp; Langkah Selanjutnya</h2>
              <PicaNextStepRow log={latestProgressLog} />
            </section>

            {kpi && (
              <section className="charter-section">
                <h2 className="charter-section-title">Progress KPI Bulanan</h2>
                <KpiProgressTable history={kpiHistory} />
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
