import { Head, usePage } from '@inertiajs/react'
import type { CharterPayload } from '../../types/charter'
import { ActivityTimelineTable } from './Charter/ActivityTimelineTable'
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

  return (
    <>
      <Head title={`Charter — ${program.code}`} />
      <div className="page-shell">
        <div className="page-shell__inner">
          <div className="charter-page" data-charter-root>
            <HeaderStrip program={program} status={status} kpi={kpi} />

            <div className="charter-grid">
              <section className="charter-grid__main">
                <h2 className="charter-section-title">Aktivitas &amp; Timeline</h2>
                <ActivityTimelineTable activities={activities} />
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
