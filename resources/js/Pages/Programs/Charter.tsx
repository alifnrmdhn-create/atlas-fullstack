import { Head, usePage } from '@inertiajs/react'
import type { CharterPayload } from '../../types/charter'
import './Charter/charter.css'

/**
 * Charter View — read-only single-page program brief.
 *
 * Mirrors the KPI Charter PPT format used by DKMR (slide 20–24).
 * Parallel route to /programs/{id} (edit mode, 5 tabs).
 *
 * Scaffold commit: skeleton with placeholder content. Activity table,
 * status/update/PICA/KPI panels, and print CSS land in subsequent
 * commits per docs/CHARTER_VIEW_PLAN.md section 5.11.
 */
export default function Charter() {
  const { props } = usePage<CharterPayload>()
  const { program, status } = props

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
            <div className="charter-page__placeholder-body">
              Charter View scaffold. Activity table, status panel, update panel, PICA, and KPI
              progress table land in subsequent commits.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
