import { Link } from '@inertiajs/react'
import { AlertCircle, Calendar, Pin, ArrowRight } from 'lucide-react'

/**
 * Home context panel — "Fokus hari ini".
 *
 * M6 first cut renders a static structure that mirrors the alert strip
 * already on HomeViewV2. Wiring real Inertia shared props lands in M6.1
 * once HomeViewV2 exposes the data centrally (currently it computes
 * counts inline). The visual + interaction patterns stabilise here first.
 */
export function HomeFocusPanel() {
  return (
    <>
      <Section icon={<AlertCircle size={13} />} title="Butuh perhatian" tone="danger">
        <FocusItem
          label="3 program terlambat"
          meta="butuh intervensi"
          href="/programs?status=terlambat"
        />
        <FocusItem
          label="2 kontrol kritis terbuka"
          meta="risk"
          href="/laporan-risiko"
        />
        <FocusItem
          label="2 hal butuh keputusan"
          meta="approval"
          href="/fokus"
        />
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
