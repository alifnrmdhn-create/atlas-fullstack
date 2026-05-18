import { Head } from '@inertiajs/react'
import './GlossaryView.css'

type Term = {
  term: string
  definition: string
  example?: string
}

type Section = {
  title: string
  subtitle?: string
  terms: Term[]
}

const STATUS_TERMS: Term[] = [
  {
    term: 'On Track',
    definition: 'Progress sesuai timeline dan tidak ada kendala signifikan.',
    example: 'Mayoritas aktivitas berjalan; deliverable bulanan terkirim tepat waktu.',
  },
  {
    term: 'At Risk',
    definition: 'Terdapat kendala yang berpotensi menghambat timeline. Belum melewati deadline, tapi butuh perhatian.',
    example: 'Persetujuan stakeholder belum keluar; mitigasi dijalankan sebelum target tergeser.',
  },
  {
    term: 'Terlambat (Delayed)',
    definition: 'Sudah melewati timeline atau target tidak tercapai pada periode pelaporan.',
    example: 'Deliverable utama belum keluar setelah deadline; perlu eskalasi & rencana pemulihan.',
  },
  {
    term: 'Completed',
    definition: 'Program telah selesai dan seluruh output telah deliver. Tidak ada aktivitas yang masih open.',
  },
]

const PROGRAM_TERMS: Term[] = [
  {
    term: 'Program Kerja',
    definition: 'Kegiatan atau inisiatif yang direncanakan untuk mencapai target direktorat. Unit perencanaan terbesar di ATLAS.',
  },
  {
    term: 'Kelompok (Scorecard / Non-Scorecard)',
    definition: 'Scorecard = program yang kontribusinya diukur lewat KPI direktorat/divisi. Non-Scorecard = program enabler yang mendukung Scorecard.',
  },
  {
    term: 'Pilar Strategis Keuangan',
    definition: 'Area strategis utama dalam pengelolaan keuangan. ATLAS menggunakan 5 pilar: Collecting More, Spending Better, Innovative Financing, Enabler, Non-Scorecard.',
  },
  {
    term: 'Output / Laporan',
    definition: 'Hasil konkret dari program kerja. Contoh: dokumen, surat, laporan, sistem, kebijakan.',
  },
  {
    term: 'Deadline',
    definition: 'Batas waktu penyelesaian output program kerja, dipilih dari tanggal yang disediakan saat planning.',
  },
  {
    term: 'PIC (Person in Charge)',
    definition: 'Individu yang bertanggung jawab utama atas pelaksanaan program. Umumnya Kepala Sub Divisi.',
  },
  {
    term: 'Progress Terkini',
    definition: 'Status realisasi program pada periode pelaporan. Format yang disarankan: "Status + % capaian + keterangan singkat".',
    example: 'On Track 75% — penyusunan draft selesai, menunggu reviu DHKM.',
  },
  {
    term: 'Dukungan yang Dibutuhkan',
    definition: 'Permintaan bantuan spesifik agar program tetap on track, mengatasi kendala, atau dipercepat penyelesaiannya. Di ATLAS dapat diangkat lewat tombol "Butuh Dukungan Atasan".',
  },
]

const ATLAS_TERMS: Term[] = [
  {
    term: 'PDCA',
    definition: 'Plan – Do – Check – Act. Siklus manajemen yang menjadi tulang punggung navigasi ATLAS (Perencanaan, Eksekusi, Performance, Tindak Lanjut).',
  },
  {
    term: 'Workstream',
    definition: 'Pengelompokan task di dalam satu program. Workstream punya owner sendiri dan deadline parsial.',
  },
  {
    term: 'Task',
    definition: 'Unit eksekusi terkecil. Task hidup di Workboard, punya assignee dan target completion.',
  },
  {
    term: 'KPI Charter',
    definition: 'Format single-page read-only yang merangkum profil KPI: progress bulanan, aktivitas pendukung, update terbaru, problem identification & corrective action, next step.',
  },
  {
    term: 'Clear the Path',
    definition: 'Mekanisme eskalasi kendala ke atasan langsung. Otomatis routing ke supervisor, dengan opsi Commit / Reroute / Decline.',
  },
  {
    term: 'PICA',
    definition: 'Problem Identification & Corrective Action. Pasangan field di Progress Log: apa masalahnya, dan tindakan korektif apa yang sudah/akan dilakukan.',
  },
]

const SECTIONS: Section[] = [
  { title: 'Status Program', subtitle: 'Klasifikasi kondisi pelaksanaan program pada periode pelaporan', terms: STATUS_TERMS },
  { title: 'Istilah Program & Atribut', terms: PROGRAM_TERMS },
  { title: 'Konsep ATLAS', subtitle: 'Istilah platform yang dipakai lintas modul', terms: ATLAS_TERMS },
]

function statusTone(term: string): 'green' | 'amber' | 'red' | 'blue' | null {
  if (term.startsWith('On Track')) return 'green'
  if (term.startsWith('At Risk')) return 'amber'
  if (term.startsWith('Terlambat')) return 'red'
  if (term.startsWith('Completed')) return 'blue'
  return null
}

export default function GlossaryView() {
  return (
    <>
      <Head title="Glossary" />
      <div className="page-shell">
        <div className="page-shell__inner">
          <div className="glossary-page">
            <header className="glossary-page__head">
              <h1 className="glossary-page__title">Glossary</h1>
              <p className="glossary-page__lede">
                Vokabulari yang dipakai di seluruh ATLAS. Status program, atribut perencanaan,
                dan konsep platform — disusun supaya semua tim pakai istilah yang sama.
              </p>
            </header>

            {SECTIONS.map((section) => (
              <section key={section.title} className="glossary-section">
                <div className="glossary-section__head">
                  <h2 className="glossary-section__title">{section.title}</h2>
                  {section.subtitle && (
                    <p className="glossary-section__subtitle">{section.subtitle}</p>
                  )}
                </div>
                <dl className="glossary-list">
                  {section.terms.map((t) => {
                    const tone = statusTone(t.term)
                    return (
                      <div key={t.term} className="glossary-item" data-tone={tone ?? undefined}>
                        <dt className="glossary-item__term">
                          {tone && <span className="glossary-item__dot" data-tone={tone} aria-hidden />}
                          {t.term}
                        </dt>
                        <dd className="glossary-item__def">
                          <p>{t.definition}</p>
                          {t.example && (
                            <p className="glossary-item__example">
                              <span className="glossary-item__example-label">Contoh:</span> {t.example}
                            </p>
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
