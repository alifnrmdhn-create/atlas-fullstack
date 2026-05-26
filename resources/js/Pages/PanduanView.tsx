import { useMemo, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Link } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import PanduanKonsepHierarki from './PanduanKonsepHierarki'
import './PanduanView.css'

// ── Quick card icons — match destination semantics ──────────────────────────
function QuickCardIcon({ href }: { href: string }): ReactElement {
  const s = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const }
  if (href === '/executive')              return <svg {...s}><path d="M3 14V8M7 14V5M11 14v-7M15 14V3"/></svg>
  if (href === '/performance/scorecard')  return <svg {...s}><path d="M9 2 10.6 5.5l3.8.4-2.8 2.5L12.5 12 9 9.9 5.5 12l.9-3.6L3.6 5.9l3.8-.4z"/></svg>
  if (href === '/performance/kolegial')   return <svg {...s}><circle cx="9" cy="9" r="6"/><path d="M9 9V5M9 9l3 2"/></svg>
  if (href === '/performance/divisi')     return <svg {...s}><rect x="2" y="11" width="3" height="5"/><rect x="7.5" y="7" width="3" height="9"/><rect x="13" y="3" width="3" height="13"/></svg>
  if (href === '/performance/me')         return <svg {...s}><circle cx="9" cy="6.5" r="2.8"/><path d="M3.5 15.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/></svg>
  if (href === '/programs')               return <svg {...s}><rect x="3.5" y="3" width="11" height="12" rx="1.5"/><path d="M7 3h4v2H7z"/><path d="M6 8h6M6 11h4"/></svg>
  if (href === '/roadmap')                return <svg {...s}><path d="M2 5h14M2 9h10M2 13h7"/></svg>
  if (href === '/execution')              return <svg {...s}><rect x="2.5" y="3" width="3.5" height="12" rx="1"/><rect x="7.5" y="3" width="3.5" height="9" rx="1"/><rect x="12.5" y="3" width="3.5" height="6" rx="1"/></svg>
  if (href === '/penugasan')              return <svg {...s}><rect x="3" y="2.5" width="11" height="12" rx="1.5"/><path d="M6 2.5h5v2H6z"/><path d="M6 9h5M6 12h3"/></svg>
  return <svg {...s}><circle cx="9" cy="9" r="6"/></svg>
}

// Category color accent per topic — gives quick visual grouping in card grid.
// plan/setup → blue, structure → green, exec → amber, blocker → red,
// penugasan → indigo. Matches semantic palette dari Status Program.
function topikCategory(slug: string): string {
  if (slug === 'buat-program' || slug === 'setujui-program')          return 'plan'
  if (slug === 'tambah-workstream-task')                              return 'structure'
  if (slug === 'update-progress')                                     return 'exec'
  if (slug === 'lapor-blocker-eskalasi')                              return 'block'
  if (slug === 'buat-penugasan' || slug === 'kerjakan-review-penugasan') return 'assign'
  return 'plan'
}

// ── Content data ──────────────────────────────────────────────────────────────
//
// Tujuh topik task-oriented prioritas (per kesepakatan 25 Mei 2026):
//   1. Buat program kerja
//   2. Setujui program
//   3. Tambah workstream & task
//   4. Update progress task
//   5. Lapor blocker & eskalasi
//   6. Buat & berikan penugasan
//   7. Kerjakan & review penugasan
//
// Setiap topik punya struktur sama: judul, apa-itu 1-line, langkah 3-5,
// tips opsional, link ke playbook section untuk detail teknis.

type RoleScope = 'BOD' | 'KADIV' | 'KASUBDIV' | 'ASISTEN' | 'OFFICER' | 'ADMIN' | 'ALL'

type Langkah = {
  judul:     string
  deskripsi: string
  tip?:      string
}

type Topik = {
  slug:      string
  icon:      string
  judul:     string
  ringkas:   string
  audience:  RoleScope[]
  bacaMenit: number
  apa:       string
  langkah:   Langkah[]
  tips:      string[]
  playbook?: { anchor: string; label: string }
}

const TOPIK: Topik[] = [
  {
    slug:      'buat-program',
    icon:      '📋',
    judul:     'Buat program kerja',
    ringkas:   'Daftarkan program/inisiatif strategis baru ke ATLAS',
    audience:  ['KADIV', 'KASUBDIV', 'ASISTEN', 'ADMIN'],
    bacaMenit: 2,
    apa:       'Program kerja adalah unit perencanaan terbesar — wadah untuk inisiatif strategis yang akan dipecah menjadi Workstream, Task, dan KPI. KADIV bisa langsung aktif; KASUBDIV/ASISTEN perlu approval atasan.',
    langkah: [
      { judul: 'Buka menu Programs',          deskripsi: 'Sidebar → grup Perencanaan → Programs.' },
      { judul: 'Klik "+ Buat Program"',       deskripsi: 'Tombol di pojok kanan atas halaman.' },
      { judul: 'Isi field minimum',           deskripsi: 'Kode, Nama, Deskripsi singkat, Tahun program. Owner default = Anda.' },
      { judul: 'Klik Simpan',                 deskripsi: 'Program tercipta. KADIV: langsung ACTIVE. KASUBDIV: status PENDING_KADIV. ASISTEN: status DRAFT (perlu klik "Ajukan Persetujuan").', tip: 'Untuk ASISTEN, draft bisa diedit dulu sebelum diajukan.' },
    ],
    tips: [
      'Setelah ACTIVE, perubahan ke field commitment (target/deadline/KPI link) tercatat di audit log + notify pihak terkait — jaga akuntabilitas.',
      'Banner "post-activation hint" akan muncul untuk membantu menambah Workstream pertama (Plan → Do bridge).',
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: '§5 Program & Workstream' },
  },
  {
    slug:      'setujui-program',
    icon:      '✅',
    judul:     'Setujui atau tolak program',
    ringkas:   'Review program yang diajukan bawahan',
    audience:  ['KASUBDIV', 'KADIV', 'ADMIN'],
    bacaMenit: 2,
    apa:       'Program yang dibuat KASUBDIV/ASISTEN perlu Anda review. Sebagai KASUBDIV, Anda jadi reviewer pertama untuk ASISTEN; sebagai KADIV, Anda reviewer final.',
    langkah: [
      { judul: 'Buka notifikasi atau Fokus',  deskripsi: 'Item "Program menunggu approval Anda" muncul di Fokus + notif bell. Klik → detail program.' },
      { judul: 'Review konten program',       deskripsi: 'Cek tab Ringkasan: deskripsi, target, owner, KPI link. Tab Struktur kalau sudah ada Workstream.' },
      { judul: 'Setujui atau Kembalikan',     deskripsi: 'Tombol "Setujui" / "Kembalikan" di banner atas. Kembalikan = isi alasan, program kembali ke DRAFT untuk direvisi PIC.' },
    ],
    tips: [
      'Setelah disetujui, muncul toast konfirmasi + badge "Berjalan" di program. Pembuat juga dapat notifikasi.',
      'Kalau tolak: tambahkan catatan supaya PIC tahu apa yang perlu diperbaiki — tertaut ke status REJECTED.',
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: '§5 Alur Approval Program' },
  },
  {
    slug:      'tambah-workstream-task',
    icon:      '🌳',
    judul:     'Tambah Workstream & Task',
    ringkas:   'Susun hierarki kerja: Workstream → Phase → Task',
    audience:  ['KADIV', 'KASUBDIV', 'ASISTEN', 'OFFICER'],
    bacaMenit: 3,
    apa:       'Setelah program ACTIVE, Anda pecah jadi jalur kerja (Workstream), tahapan (Phase), dan unit eksekusi (Task). Task adalah yang muncul di Papan Kerja dan bisa di-assign ke anggota tim.',
    langkah: [
      { judul: 'Buka detail Program',          deskripsi: 'Klik program dari list → tab Struktur.' },
      { judul: 'Tambah Workstream',            deskripsi: 'Klik "+ Workstream Baru". Isi nama, kode, tanggal, PIC.' },
      { judul: 'Tambah Phase di Workstream',   deskripsi: 'Klik Workstream → "+ Tambah Phase". Beri nama (mis. "Pengumpulan Dokumen", "Analisis", "Penyusunan Laporan").' },
      { judul: 'Tambah Task di Phase',         deskripsi: 'Klik "+ Tambah Task" di bawah Phase. Isi judul, prioritas, assignee, target selesai.', tip: 'Task baru muncul di Workboard assignee.' },
    ],
    tips: [
      'Hierarki: Program → Workstream → Phase → Task → Subtask. Subtask adalah checklist langkah kecil di dalam Task, tidak muncul di Papan Kerja.',
      'Kalau cuma butuh task cepat tanpa Phase, buat dari Papan Kerja langsung dengan "+ Tugas Baru".',
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: '§5 Cara Menambah Task' },
  },
  {
    slug:      'update-progress',
    icon:      '⏱️',
    judul:     'Update progress task harian',
    ringkas:   'Geser task antar kolom, isi progres %, lapor selesai',
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       'Papan Kerja punya 5 kolom: Belum Direncanakan → Siap Dikerjakan → Sedang Berjalan → Menunggu Review → Selesai. Geser kartu task antar kolom saat status berubah.',
    langkah: [
      { judul: 'Buka Workboard',               deskripsi: 'Sidebar → grup Eksekusi → Workboard. Atau shortcut G E.' },
      { judul: 'Filter task Anda',             deskripsi: 'Klik tab "My Tasks" untuk lihat task milik Anda saja.' },
      { judul: 'Klik kartu task',              deskripsi: 'Modal detail terbuka. Ubah status (dropdown) atau drag kartu antar kolom.' },
      { judul: 'Submit review saat selesai',   deskripsi: 'Geser ke "Menunggu Review", upload bukti / link / catatan. Reviewer dapat notifikasi.', tip: 'Backward transition (mis. Sedang Berjalan → Siap Dikerjakan) wajib disertai alasan.' },
    ],
    tips: [
      'Badge ⚠ Terhambat: kalau ada blocker, tetap di kolom statusnya tapi flagged. Progress historis tidak hilang.',
      'Saat task Selesai, badge "✓ Tepat waktu" / "⚠ Terlambat" otomatis muncul berdasarkan deadline.',
      'WIP limit: kalau Sedang Berjalan terlalu banyak, sistem akan mengingatkan agar tim tidak overload.',
    ],
    playbook: { anchor: '8-eksekusi--papan-kerja-workboard', label: '§8 Papan Kerja' },
  },
  {
    slug:      'lapor-blocker-eskalasi',
    icon:      '🚧',
    judul:     'Lapor hambatan & eskalasi',
    ringkas:   'Catat blocker + minta dukungan atasan (Clear the Path)',
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       'Blocker = hambatan yang menghalangi penyelesaian task. Eskalasi (Clear the Path) = jalur cepat minta dukungan atasan saat pekerjaan tersumbat — bisa dari blocker, progress log, atau ad-hoc.',
    langkah: [
      { judul: 'Buka detail task yang terhambat', deskripsi: 'Dari Papan Kerja, klik kartu task.' },
      { judul: 'Klik "+ Tambah Blocker"',         deskripsi: 'Di panel detail. Isi judul + deskripsi + tingkat keparahan (LOW/MEDIUM/HIGH).' },
      { judul: 'Simpan',                          deskripsi: 'PIC dan KADIV otomatis dapat notifikasi. Blocker masuk ke Health Score program.' },
      { judul: 'Eskalasi bila perlu',             deskripsi: 'Klik "Butuh Dukungan Atasan" di kartu blocker atau di Home / detail program. Isi konteks → kirim. Atasan akan triase (Commit / Reroute / Decline).', tip: 'Status eskalasi muncul di Fokus Anda; atasan yang commit akan set due date.' },
    ],
    tips: [
      'Setiap blocker punya channel diskusi otomatis — diskusi tersimpan dalam konteks hambatan.',
      'Fitur eskalasi aktif untuk Pilot DKM (feature flag). Kalau tombol tidak muncul, mungkin belum diaktifkan untuk unit Anda.',
    ],
    playbook: { anchor: '11-eksekusi--blocker-hambatan-kerja', label: '§11 Blocker · §18 Eskalasi' },
  },
  {
    slug:      'buat-penugasan',
    icon:      '📨',
    judul:     'Buat & berikan penugasan',
    ringkas:   'Beri tugas ad-hoc ke bawahan, di luar struktur Program',
    audience:  ['BOD', 'KADIV', 'KASUBDIV', 'ADMIN'],
    bacaMenit: 2,
    apa:       'Assignment adalah tugas ad-hoc dari atasan ke bawahan, di luar struktur Program. Biasanya disertai bukti penyelesaian (file/link/catatan).',
    langkah: [
      { judul: 'Buka halaman Assignment',      deskripsi: 'Sidebar → grup Eksekusi → Assignment. Atau shortcut G A.' },
      { judul: 'Klik "+ Assignment Baru"',     deskripsi: 'Tombol di pojok kanan atas.' },
      { judul: 'Pilih penerima dari direktori', deskripsi: 'Sistem menampilkan preview rantai approval kalau penerima perlu disetujui dulu.' },
      { judul: 'Isi detail + kirim',           deskripsi: 'Judul, deskripsi, prioritas, target selesai, jenis bukti yang diharapkan. Klik Kirim — penerima langsung dapat notifikasi.', tip: 'Kalau penerima beda direktorat, ATLAS akan minta justifikasi (cross-direktorat policy).' },
    ],
    tips: [
      'Assignment tidak terhitung dalam KPI program, tapi masuk ke Commitment Ledger penerima (hit-rate komitmen).',
      'Status: Siap Dikerjakan → Sedang Berjalan → Menunggu Review → Selesai. Sama dengan Task workboard.',
    ],
    playbook: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: '§9 Assignment' },
  },
  {
    slug:      'kerjakan-review-penugasan',
    icon:      '🔄',
    judul:     'Kerjakan & review penugasan',
    ringkas:   'Sebagai assignee: kerjakan + upload bukti. Sebagai reviewer: approve/return.',
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       'Setelah dapat penugasan, Anda mulai kerjakan dan upload bukti penyelesaian. Pemberi tugas akan menyetujui (approve) atau mengembalikan (return) untuk revisi.',
    langkah: [
      { judul: 'Buka kartu penugasan Anda',    deskripsi: 'Assignment → filter "Diberikan ke saya". Kartu di kolom Siap Dikerjakan.' },
      { judul: 'Geser ke Sedang Berjalan',     deskripsi: 'Drag kartu ke kolom kedua saat mulai mengerjakan.' },
      { judul: 'Upload bukti penyelesaian',    deskripsi: 'Klik kartu → upload file / paste link / tulis catatan, sesuai yang diminta atasan.' },
      { judul: 'Geser ke Menunggu Review',     deskripsi: 'Pemberi tugas dapat notifikasi.', tip: 'Sebagai reviewer: klik kartu Menunggu Review → Setujui (pindah ke Selesai) atau Kembalikan (kembali ke Sedang Berjalan dengan alasan).' },
    ],
    tips: [
      'Filter berguna: Mine / Given to me / Team / Awaiting review — pakai sesuai role Anda saat itu.',
      'Bukti yang diminta tertulis di field "Jenis bukti" — wajib disertakan supaya bisa submit ke review.',
    ],
    playbook: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: '§9 Assignment' },
  },
]

// ── Role-aware quick cards ───────────────────────────────────────────────────

type QuickCard = { label: string; sub: string; href: string }

function quickCardsForRole(role: string): QuickCard[] {
  if (role === 'BOD') return [
    { label: 'Executive Summary', sub: 'Snapshot 1-halaman + export PPTX', href: '/executive' },
    { label: 'Scorecard',         sub: 'Ranking capaian direktorat',       href: '/performance/scorecard' },
    { label: 'Roadmap',           sub: 'Visual timeline portfolio',        href: '/roadmap' },
  ]
  if (role === 'KADIV') return [
    { label: 'Executive Summary', sub: 'Snapshot direktorat Anda',         href: '/executive' },
    { label: 'Programs',          sub: 'Kelola program & approval',        href: '/programs' },
    { label: 'KPI Direktorat',    sub: 'Capaian kolegial jajaran',         href: '/performance/kolegial' },
  ]
  if (role === 'KASUBDIV') return [
    { label: 'Programs',          sub: 'Kelola program divisi Anda',       href: '/programs' },
    { label: 'Workboard',         sub: 'Track task tim',                   href: '/execution' },
    { label: 'KPI Divisi',        sub: 'Capaian divisi Anda',              href: '/performance/divisi' },
  ]
  // OFFICER, ASISTEN, default
  return [
    { label: 'Workboard',         sub: 'Tugas harian Anda',                href: '/execution' },
    { label: 'Assignment',        sub: 'Tugas ad-hoc dari atasan',         href: '/penugasan' },
    { label: 'KPI Saya',          sub: 'Capaian KPI personal',             href: '/performance/me' },
  ]
}

// ── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ: Array<{ q: string; a: string; link?: { anchor: string; label: string } }> = [
  {
    q: 'Kenapa program saya tidak bisa di-edit?',
    a: 'Program yang sedang dalam proses persetujuan (status PENDING_KASUB atau PENDING_KADIV) terkunci dari editing. Tombol Edit otomatis disembunyikan. Bisa diedit lagi setelah disetujui (ACTIVE) atau ditolak (REJECTED/DRAFT). ADMIN dan SUPERADMIN bisa edit kapan saja.',
    link: { anchor: '5-perencanaan--program--workstream', label: '§5 Aturan Edit Program' },
  },
  {
    q: 'Apa beda Status Program dengan Status Pekerjaan?',
    a: 'Status Program (On Track / At Risk / Terlambat / Completed) = level strategis, menjawab "program sehat?". Status Pekerjaan (Belum Direncanakan / Siap Dikerjakan / Sedang Berjalan / Menunggu Review / Selesai) = level operator, menjawab "tahap mana di pipeline?". Orthogonal — program bisa On Track sementara beberapa task masih Belum Direncanakan.',
    link: { anchor: 'glosarium-istilah', label: 'Glosarium' },
  },
  {
    q: 'Bagaimana cara meminta dukungan atasan?',
    a: 'Klik tombol "Butuh Dukungan Atasan" yang muncul di Home, detail Program, panel Task, panel Blocker, atau detail Action Item rapat. Isi konteks → kirim. Atasan akan triase: Commit (terima dengan due date), Reroute (oper ke peer), atau Decline (dengan alasan).',
    link: { anchor: '18-tindak-lanjut--eskalasi-clear-the-path', label: '§18 Eskalasi' },
  },
  {
    q: 'Mengapa task saya muncul "⚠ Terhambat"?',
    a: 'Task Anda di-flag `isBlocked` — entah Anda atau atasan sudah lapor hambatan. Bukan status terpisah, jadi task tetap di kolom statusnya (mis. "Sedang Berjalan"). Hover badge untuk lihat alasannya. Setelah hambatan selesai, toggle off flag-nya dari panel detail.',
    link: { anchor: '11-eksekusi--blocker-hambatan-kerja', label: '§11 Blocker' },
  },
  {
    q: 'Kapan saya harus pakai Task vs Assignment?',
    a: 'Task = pekerjaan yang sudah tercantum di Program/Workstream/Phase — direncanakan. Assignment = tugas ad-hoc dari atasan, di luar Program — biasanya situasional. Kalau pekerjaan punya output deliverable jelas dan terjadwal, Task. Kalau permintaan cepat tanpa struktur, Assignment.',
    link: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: '§9 Assignment' },
  },
  {
    q: 'Bagaimana cara export Charter program ke PPTX?',
    a: 'Buka detail Program → klik tombol "Charter" di header → tombol "Export PPTX". File deck siap presentasi terdownload. Untuk batch (multi program → 1 deck), pakai tombol Export Batch di list Programs.',
    link: { anchor: '6-perencanaan--charter-program-read-only', label: '§6 Charter' },
  },
  {
    q: 'Kenapa beberapa menu sidebar tidak muncul untuk saya?',
    a: 'Sidebar role-aware — item disembunyikan otomatis sesuai jabatan. Mis. KPI Direktorat tidak tampak untuk KASUBDIV ke bawah; Executive Summary tampak untuk BOD/KADIV. Halaman tetap diakses via direct URL kalau Anda tahu link-nya, tapi konten bisa kosong/terbatas sesuai policy.',
  },
]

// ── Component ────────────────────────────────────────────────────────────────

type View = 'index' | 'topik' | 'konsep'

export default function PanduanView() {
  const { currentUser } = useWorkspace()
  const navigate = useInertiaNavigate()
  const [view,  setView]  = useState<View>('index')
  const [active, setActive] = useState<string | null>(null)
  const [query,  setQuery]  = useState('')

  const role = currentUser?.roleType ?? 'OFFICER'
  const greetName = currentUser?.name?.split(' ')[0] ?? 'rekan'
  const quickCards = useMemo(() => quickCardsForRole(role), [role])

  const filteredTopik = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOPIK
    return TOPIK.filter(t =>
      t.judul.toLowerCase().includes(q) ||
      t.ringkas.toLowerCase().includes(q) ||
      t.apa.toLowerCase().includes(q),
    )
  }, [query])

  const filteredFaq = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FAQ
    return FAQ.filter(f =>
      f.q.toLowerCase().includes(q) ||
      f.a.toLowerCase().includes(q),
    )
  }, [query])

  const openTopik = (slug: string) => {
    setActive(slug)
    setView('topik')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const backToIndex = () => {
    setView('index')
    setActive(null)
  }

  const activeTopik = active ? TOPIK.find(t => t.slug === active) : null

  const openKonsep = () => {
    setView('konsep')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // ── Konsep Hierarki detail view ────────────────────────────────────────────
  if (view === 'konsep') {
    return <PanduanKonsepHierarki onBack={backToIndex} />
  }

  // ── Topik detail view ──────────────────────────────────────────────────────
  if (view === 'topik' && activeTopik) {
    return (
      <div className="panduan">
        <div className="panduan__inner ds-stagger" key={`topik-${activeTopik.slug}`}>
          <button type="button" className="panduan__back" onClick={backToIndex}>
            ← Kembali ke Pusat Bantuan
          </button>

          <header className="panduan__topik-head">
            <span className="panduan__topik-icon" aria-hidden="true">{activeTopik.icon}</span>
            <div className="panduan__topik-head-text">
              <h1 className="panduan__topik-title">{activeTopik.judul}</h1>
              <p className="panduan__topik-meta">
                Untuk: {activeTopik.audience.includes('ALL') ? 'Semua peran' : activeTopik.audience.join(' · ')}
                <span className="panduan__topik-meta-sep" aria-hidden="true">•</span>
                Baca: {activeTopik.bacaMenit} menit
              </p>
            </div>
          </header>

          <section className="panduan__apa">
            <span className="panduan__apa-label">💡 Apa ini?</span>
            <p className="panduan__apa-text">{activeTopik.apa}</p>
          </section>

          <section className="panduan__langkah-section">
            <h2 className="panduan__sec-title">Aksi cepat</h2>
            <ol className="panduan__langkah">
              {activeTopik.langkah.map((l, i) => (
                <li className="panduan__langkah-item" key={i}>
                  <span className="panduan__langkah-num">{i + 1}</span>
                  <div className="panduan__langkah-body">
                    <h3 className="panduan__langkah-judul">{l.judul}</h3>
                    <p className="panduan__langkah-desc">{l.deskripsi}</p>
                    {l.tip && <p className="panduan__langkah-tip">💡 {l.tip}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {activeTopik.tips.length > 0 && (
            <section className="panduan__tips-section">
              <h2 className="panduan__sec-title">Tips</h2>
              <ul className="panduan__tips">
                {activeTopik.tips.map((t, i) => (
                  <li className="panduan__tips-item" key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          {activeTopik.playbook && (
            <section className="panduan__playbook-link">
              <span className="panduan__playbook-link-icon" aria-hidden="true">📖</span>
              <span>Pelajari lebih lengkap di Playbook:{' '}
                <a
                  href={`/playbook#${activeTopik.playbook.anchor}`}
                  onClick={e => { e.preventDefault(); navigate(`/playbook#${activeTopik.playbook!.anchor}`) }}
                  className="panduan__playbook-link-anchor"
                >
                  {activeTopik.playbook.label}
                </a>
              </span>
            </section>
          )}
        </div>
      </div>
    )
  }

  // ── Index view ────────────────────────────────────────────────────────────
  return (
    <div className="panduan">
      <div className="panduan__inner ds-stagger" key="panduan-index">
        {/* Hero */}
        <header className="panduan__hero">
          <span className="panduan__hero-eyebrow">Pusat Bantuan</span>
          <div className="panduan__hero-greet">
            <span className="panduan__hero-wave" aria-hidden="true">👋</span>
            <h1 className="panduan__hero-title">Halo, {greetName}</h1>
          </div>
          <p className="panduan__hero-sub">
            Sebagai <strong>{role}</strong>, yang paling sering Anda akses:
          </p>
          <div className="panduan__hero-cards">
            {quickCards.map((c, idx) => (
              <Link key={c.href} href={c.href} className="panduan__hero-card" style={{ '--hero-card-idx': idx } as CSSProperties}>
                <span className="panduan__hero-card-icon" aria-hidden="true">
                  <QuickCardIcon href={c.href} />
                </span>
                <span className="panduan__hero-card-body">
                  <span className="panduan__hero-card-label">{c.label}</span>
                  <span className="panduan__hero-card-sub">{c.sub}</span>
                </span>
                <span className="panduan__hero-card-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </header>

        {/* Search */}
        <div className="panduan__search-wrap">
          <svg className="panduan__search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" />
            <path d="m9.5 9.5 3 3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cari topik bantuan, mis. 'eskalasi' atau 'kpi'…"
            className="panduan__search"
            aria-label="Cari topik bantuan"
          />
          {query
            ? <button type="button" onClick={() => setQuery('')} className="panduan__search-clear" aria-label="Bersihkan pencarian">×</button>
            : <kbd className="panduan__search-kbd" aria-hidden="true">{filteredTopik.length + filteredFaq.length} item</kbd>
          }
        </div>

        {/* Foundational concept banner — Program/Workstream/Phase/Task explainer */}
        <button type="button" className="panduan__concept-banner" onClick={openKonsep}>
          <span className="panduan__concept-banner-icon" aria-hidden="true">📚</span>
          <span className="panduan__concept-banner-body">
            <span className="panduan__concept-banner-title">Pertama kali pakai ATLAS?</span>
            <span className="panduan__concept-banner-sub">
              Pelajari bedanya <strong>Program</strong>, <strong>Workstream</strong>,
              <strong> Phase</strong>, dan <strong>Task</strong> — dengan contoh lengkap.
            </span>
          </span>
          <span className="panduan__concept-banner-arrow" aria-hidden="true">→</span>
        </button>

        {/* Topik task-oriented */}
        <section className="panduan__topiks">
          <h2 className="panduan__sec-title">
            Apa yang ingin Anda lakukan?
            <span className="panduan__sec-count">{filteredTopik.length}</span>
          </h2>
          {filteredTopik.length === 0 ? (
            <p className="panduan__empty">Tidak ada topik yang cocok untuk "{query}".</p>
          ) : (
            <div className="panduan__topik-grid">
              {filteredTopik.map(t => (
                <button
                  key={t.slug}
                  type="button"
                  className={`panduan__topik-card panduan__topik-card--${topikCategory(t.slug)}`}
                  onClick={() => openTopik(t.slug)}
                >
                  <span className="panduan__topik-card-icon" aria-hidden="true">{t.icon}</span>
                  <div className="panduan__topik-card-body">
                    <h3 className="panduan__topik-card-judul">{t.judul}</h3>
                    <p className="panduan__topik-card-ringkas">{t.ringkas}</p>
                    <span className="panduan__topik-card-meta">⏱ {t.bacaMenit} menit baca</span>
                  </div>
                  <span className="panduan__topik-card-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* FAQ */}
        <section className="panduan__faq">
          <h2 className="panduan__sec-title">
            Pertanyaan tersering
            <span className="panduan__sec-count">{filteredFaq.length}</span>
          </h2>
          {filteredFaq.length === 0 ? (
            <p className="panduan__empty">Tidak ada pertanyaan yang cocok untuk "{query}".</p>
          ) : (
            <ul className="panduan__faq-list">
              {filteredFaq.map((f, i) => (
                <li key={i}>
                  <details className="panduan__faq-item">
                    <summary className="panduan__faq-q">{f.q}</summary>
                    <div className="panduan__faq-a">
                      <p>{f.a}</p>
                      {f.link && (
                        <a
                          href={`/playbook#${f.link.anchor}`}
                          onClick={e => { e.preventDefault(); navigate(`/playbook#${f.link!.anchor}`) }}
                          className="panduan__faq-link"
                        >
                          📖 {f.link.label} →
                        </a>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Footer link ke Playbook lengkap */}
        <footer className="panduan__footer">
          <div className="panduan__footer-card">
            <span className="panduan__footer-icon" aria-hidden="true">📚</span>
            <div>
              <h3 className="panduan__footer-title">Butuh detail teknis lengkap?</h3>
              <p className="panduan__footer-sub">
                Playbook lengkap berisi 23 workflow, glosarium teknis, alur proses sistem, dan tabel implementasi.
              </p>
            </div>
            <Link href="/playbook" className="panduan__footer-link">
              Buka Playbook →
            </Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
