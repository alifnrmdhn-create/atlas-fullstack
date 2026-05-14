import { Head, usePage } from '@inertiajs/react'
import type { CharterPayload } from '../../types/charter'
import { ActivityTimelineTable } from './Charter/ActivityTimelineTable'
import './Charter/charter.css'

/**
 * Charter View — read-only single-page program brief.
 *
 * Mirrors the KPI Charter PPT format used by DKMR (slide 20–24).
 * Parallel route to /programs/{id} (edit mode, 5 tabs).
 */
export default function Charter() {
  const { props } = usePage<CharterPayload>()
  const { program, status, activities } = props

  return (
    <>
      <Head title={`Charter — ${program.code}`} />
      <div className="page-shell">
        <div className="page-shell__inner">
          <div className="charter-page" data-charter-root>
            <header className="charter-page__placeholder-header">
              <div className="charter-page__placeholder-code">{program.code}</div>
              <h1 className="charter-page__placeholder-title">{program.name}</h1>
              <p className="charter-page__placeholder-meta">
                {program.directorateName} · {program.divisionName} · PIC {program.pic.name}
              </p>
              <p className="charter-page__placeholder-meta">
                Periode {program.period.from} → {program.period.to} · Health: {status.health}
              </p>
            </header>

            <section className="charter-page__section">
              <h2 className="charter-page__section-title">Aktivitas &amp; Timeline</h2>
              <ActivityTimelineTable activities={activities} />
            </section>

            <div className="charter-page__placeholder-body">
              Status panel, update panel, PICA next-step, and KPI progress table land in the next
              commit.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
