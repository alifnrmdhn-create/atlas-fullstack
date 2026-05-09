import { Link } from '@inertiajs/react'
import { AlertCircle, Calendar, Pin, ArrowRight } from 'lucide-react'
import { useWorkspace } from '../../hooks/useWorkspace'

/**
 * Home context panel — "Fokus hari ini".
 *
 * Reads the same programSummary that HomeView uses, so counts here
 * stay in sync with the alert strip on the main page. When Home is
 * still loading, the panel shows a low-noise empty state instead of
 * placeholder zeros.
 */
export function HomeFocusPanel() {
  const { programSummary } = useWorkspace()

  if (!programSummary) {
    return (
      <Section icon={<AlertCircle size={13} />} title="Butuh perhatian">
        <p className="context-panel__empty">Memuat ringkasan…</p>
      </Section>
    )
  }

  const { summary, controls, needsAction } = programSummary
  const terlambatCount = summary.terlambat + summary.overdue
  const criticalControls = (controls ?? []).filter(
    (c) => c.severity === 'CRITICAL' || c.severity === 'HIGH',
  ).length
  const decisionCount = needsAction.length

  const hasAttention = terlambatCount > 0 || criticalControls > 0 || decisionCount > 0

  return (
    <>
      <Section icon={<AlertCircle size={13} />} title="Butuh perhatian" tone={hasAttention ? 'danger' : undefined}>
        {hasAttention ? (
          <>
            {terlambatCount > 0 ? (
              <FocusItem
                label={`${terlambatCount} program terlambat`}
                meta="butuh intervensi"
                href="/programs?status=terlambat"
              />
            ) : null}
            {criticalControls > 0 ? (
              <FocusItem
                label={`${criticalControls} kontrol kritis terbuka`}
                meta="risk"
                href="/laporan-risiko"
              />
            ) : null}
            {decisionCount > 0 ? (
              <FocusItem
                label={`${decisionCount} hal butuh keputusan`}
                meta="approval"
                href="/fokus"
              />
            ) : null}
          </>
        ) : (
          <p className="context-panel__empty">Tidak ada item mendesak hari ini.</p>
        )}
      </Section>

      <Section icon={<Calendar size={13} />} title="Jadwal hari ini">
        <p className="context-panel__empty">
          Belum ada rapat terjadwal.
          <br />
          <Link href="/jadwal" className="context-panel__inline-link">
            Lihat kalender →
          </Link>
        </p>
      </Section>

      <Section icon={<Pin size={13} />} title="Pinned">
        <p className="context-panel__empty">
          Pin program atau laporan dari halaman detail untuk akses cepat.
        </p>
      </Section>
    </>
  )
}

function Section({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <section className={`context-panel__section${tone ? ` context-panel__section--${tone}` : ''}`}>
      <header className="context-panel__section-header">
        <span className="context-panel__section-icon" aria-hidden="true">
          {icon}
        </span>
        <h3 className="context-panel__section-title">{title}</h3>
      </header>
      <div className="context-panel__section-body">{children}</div>
    </section>
  )
}

function FocusItem({
  label,
  meta,
  href,
}: {
  label: string
  meta: string
  href: string
}) {
  return (
    <Link href={href} className="context-panel__focus-item">
      <span className="context-panel__focus-label">{label}</span>
      <span className="context-panel__focus-meta">
        {meta}
        <ArrowRight size={11} aria-hidden="true" />
      </span>
    </Link>
  )
}
