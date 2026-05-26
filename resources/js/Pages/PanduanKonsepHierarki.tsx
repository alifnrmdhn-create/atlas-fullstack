/* PanduanKonsepHierarki — materi onboarding khusus untuk memahami 4 level
 * hierarki kerja ATLAS (Program → Workstream → Phase → Task → Subtask).
 *
 * Diakses dari PanduanView dengan klik banner "Pertama kali pakai ATLAS?".
 * Tidak punya route sendiri — dirender via state internal PanduanView.
 *
 * Struktur konten (per kesepakatan 25 Mei 2026):
 *   1. Hero + 1-liner "kenapa hierarki"
 *   2. Visual tree (nested boxes — Pattern A flat dengan indent + border-left)
 *   3. Tabel perbandingan 4 level
 *   4. Penjelasan per-level dengan contoh berkelanjutan
 *   5. Contoh lengkap end-to-end (Audit Internal 2026)
 *   6. FAQ kebingungan tersering
 *   7. Link ke Playbook §5 untuk detail teknis
 */

import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import './PanduanKonsepHierarki.css'

type Props = { onBack: () => void }

export default function PanduanKonsepHierarki({ onBack }: Props) {
  const navigate = useInertiaNavigate()

  return (
    <div className="panduan">
      <div className="panduan__inner phx-page ds-stagger" key="panduan-konsep">
        <button type="button" className="panduan__back" onClick={onBack}>
          ← Kembali ke Pusat Bantuan
        </button>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <header className="phx-hero">
          <span className="phx-hero-icon" aria-hidden="true">📚</span>
          <div>
            <h1 className="phx-hero-title">Memahami Hierarki Kerja ATLAS</h1>
            <p className="phx-hero-trail">
              <span className="phx-trail-item">Program</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">Workstream</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">Phase</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">Task</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item phx-trail-item--muted">Subtask</span>
            </p>
            <p className="phx-hero-sub">
              ATLAS pakai 4 level untuk struktur kerja. Kalau pertama kali pakai mungkin
              terdengar ribet — tapi sekali Anda paham bedanya, semua jadi masuk akal.
              Mari kita bedah satu per satu, dengan contoh nyata.
            </p>
          </div>
        </header>

        {/* ── Visual tree ───────────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">📊 Visual Hierarki</h2>
          <p className="phx-sec-sub">
            Bayangkan kotak yang berisi kotak. Yang terbesar adalah Program; di dalamnya
            ada Workstream (jalur kerja paralel); di dalam workstream ada Phase
            (tahapan urutan); dan di dalam phase ada Task (pekerjaan konkret yang
            ditugaskan ke orang). Subtask adalah checklist langkah dalam Task.
          </p>

          <div className="phx-tree">
            <div className="phx-node phx-node--program">
              <div className="phx-node-head">
                <span className="phx-node-icon" aria-hidden="true">🏛</span>
                <div>
                  <span className="phx-node-tag">PROGRAM</span>
                  <h3 className="phx-node-title">Audit Internal Tahun 2026</h3>
                  <p className="phx-node-meta">PIC: KADIV Audit · Periode: Jan–Des 2026</p>
                </div>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">WORKSTREAM A</span>
                    <h4 className="phx-node-title">Audit Divisi Keuangan</h4>
                    <p className="phx-node-meta">PIC: KASUBDIV Audit Keuangan · Mar–Apr</p>
                  </div>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">PHASE 1</span>
                      <h5 className="phx-node-title">Pengumpulan Dokumen</h5>
                      <p className="phx-node-meta">1–15 Maret</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Kumpulkan laporan arus kas Q1 <em>· Pak Andi · 1–7 Mar</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Kumpulkan neraca per divisi Q1 <em>· Bu Rina · 1–10 Mar</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Email treasury minta data Januari <em>· Pak Andi · 1–3 Mar</em></li>
                  </ul>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">PHASE 2</span>
                      <h5 className="phx-node-title">Analisis Temuan</h5>
                      <p className="phx-node-meta">16–31 Maret</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Review variance arus kas vs anggaran <em>· Pak Andi</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Compile temuan signifikan <em>· Bu Rina</em></li>
                  </ul>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">PHASE 3</span>
                      <h5 className="phx-node-title">Penyusunan Laporan</h5>
                      <p className="phx-node-meta">1–15 April</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Draft laporan audit divisi keuangan</li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Review draft oleh KASUBDIV</li>
                  </ul>
                </div>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">WORKSTREAM B</span>
                    <h4 className="phx-node-title">Audit Divisi Produksi</h4>
                    <p className="phx-node-meta">PIC: KASUBDIV Audit Produksi · Apr–Mei (paralel dengan A)</p>
                  </div>
                </div>
                <p className="phx-node-collapsed">+ 3 Phase, 8 Task <span>(struktur mirip Workstream A)</span></p>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">WORKSTREAM C</span>
                    <h4 className="phx-node-title">Konsolidasi & Pelaporan Final</h4>
                    <p className="phx-node-meta">PIC: KADIV Audit · Mei–Jun (sesudah A & B)</p>
                  </div>
                </div>
                <p className="phx-node-collapsed">+ 2 Phase, 5 Task</p>
              </div>
            </div>
          </div>

          <div className="phx-callout">
            <strong>Bacaan dari diagram di atas:</strong> Satu Program ("Audit Internal 2026")
            punya 3 Workstream paralel. Workstream A punya 3 Phase berurutan (Pengumpulan →
            Analisis → Penyusunan). Phase 1 dari Workstream A punya 3 Task konkret yang
            di-assign ke orang tertentu dengan tanggal.
          </div>
        </section>

        {/* ── Comparison table ──────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">🆚 Tabel Perbandingan Cepat</h2>
          <div className="phx-table-wrap">
            <table className="phx-table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Skala</th>
                  <th>Durasi tipikal</th>
                  <th>PIC tipikal</th>
                  <th>Terlihat di</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Program</strong></td>
                  <td>Strategi</td>
                  <td>6–12 bulan</td>
                  <td>KADIV / KASUBDIV / ASISTEN</td>
                  <td>Menu Programs</td>
                </tr>
                <tr>
                  <td><strong>Workstream</strong></td>
                  <td>Bidang / Tim</td>
                  <td>2–4 bulan</td>
                  <td>KASUBDIV</td>
                  <td>Tab Struktur (di detail Program)</td>
                </tr>
                <tr>
                  <td><strong>Phase</strong></td>
                  <td>Tahapan</td>
                  <td>2–4 minggu</td>
                  <td>Sama dengan owner Workstream</td>
                  <td>Tab Struktur (nested)</td>
                </tr>
                <tr>
                  <td><strong>Task</strong></td>
                  <td>Eksekusi</td>
                  <td>Hari – minggu</td>
                  <td>OFFICER / ASISTEN</td>
                  <td>Papan Kerja (Execution)</td>
                </tr>
                <tr>
                  <td><strong>Subtask</strong></td>
                  <td>Langkah kecil</td>
                  <td>Jam</td>
                  <td>(sama dengan task assignee)</td>
                  <td>Hanya di detail Task</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Per-level deep dive ──────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">🔍 Penjelasan Per Level</h2>

          {/* Program */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">1</span>
              <div>
                <h3 className="phx-level-title">Program — Wadah Strategis</h3>
                <p className="phx-level-tagline">Tujuan besar yang akan dikejar 6–12 bulan</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>Program adalah unit perencanaan terbesar di ATLAS.</strong> Satu Program
              merepresentasikan satu inisiatif strategis dengan tujuan jelas, deadline besar
              (biasanya akhir tahun fiskal), dan PIC tingkat manajerial. Program butuh
              approval atasan sebelum aktif (kecuali yang dibuat KADIV).
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Contoh:</span>
              <span className="phx-example-body">
                <strong>Program: "Audit Internal Tahun 2026"</strong> — sasaran strategis:
                memastikan kepatuhan SOP & temuan-temuan tahun lalu sudah di-closing,
                deadline 31 Des 2026, PIC KADIV Audit.
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Aturan praktis:</strong> kalau pekerjaan Anda butuh lebih dari 1 orang,
              lebih dari 1 bulan, dan punya deliverable besar — itu Program.
            </p>
          </article>

          {/* Workstream */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">2</span>
              <div>
                <h3 className="phx-level-title">Workstream — Jalur Kerja Paralel</h3>
                <p className="phx-level-tagline">Membagi Program ke bidang / tim yang bisa jalan bersamaan</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>Workstream membagi Program menjadi jalur paralel.</strong> Setiap
              Workstream biasanya pegang satu bidang (mis. Audit Keuangan vs Audit Produksi)
              dan punya PIC sendiri (umumnya KASUBDIV). Workstream <em>tidak menunggu</em>
              workstream lain selesai — keduanya jalan bersamaan, kecuali ada dependency
              eksplisit.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Contoh:</span>
              <span className="phx-example-body">
                Program "Audit Internal 2026" punya 3 Workstream:
                <ol className="phx-inline-list">
                  <li><strong>Workstream A:</strong> Audit Divisi Keuangan (Mar–Apr)</li>
                  <li><strong>Workstream B:</strong> Audit Divisi Produksi (Apr–Mei, paralel)</li>
                  <li><strong>Workstream C:</strong> Konsolidasi & Pelaporan Final (Mei–Jun, sesudah A & B)</li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Aturan praktis:</strong> kalau dua bagian Program bisa dikerjakan
              dua tim berbeda, secara paralel — pisah jadi 2 Workstream. Jumlah ideal:
              2–5 Workstream per Program. Lebih dari itu, mungkin saatnya pertimbangkan
              dipecah jadi Program terpisah.
            </p>
          </article>

          {/* Phase */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">3</span>
              <div>
                <h3 className="phx-level-title">Phase — Tahapan Berurutan</h3>
                <p className="phx-level-tagline">Apa duluan, apa kemudian dalam satu Workstream</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>Phase mengelompokkan Task berdasarkan urutan logis.</strong> Beda
              dengan Workstream (yang paralel), Phase biasanya <em>berurutan</em> —
              Phase 1 selesai dulu, baru Phase 2 mulai. Phase tidak punya assignee terpisah;
              dia hanya wadah pengelompokan.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Contoh:</span>
              <span className="phx-example-body">
                Workstream A ("Audit Divisi Keuangan") punya 3 Phase berurutan:
                <ol className="phx-inline-list">
                  <li><strong>Phase 1:</strong> Pengumpulan Dokumen (1–15 Mar)</li>
                  <li><strong>Phase 2:</strong> Analisis Temuan (16–31 Mar, butuh hasil Phase 1)</li>
                  <li><strong>Phase 3:</strong> Penyusunan Laporan (1–15 Apr, butuh hasil Phase 2)</li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Aturan praktis:</strong> kalau Anda akan bilang "abis ini, baru itu" —
              itu sinyal pakai Phase. Phase juga berguna untuk milestone bulanan
              (mis. tutup buku akhir Maret = akhir Phase 1).
            </p>
          </article>

          {/* Task */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">4</span>
              <div>
                <h3 className="phx-level-title">Task — Pekerjaan Konkret</h3>
                <p className="phx-level-tagline">Yang sebenarnya dikerjakan orang per orang</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>Task adalah unit pekerjaan terkecil yang bisa di-track.</strong>
              Setiap Task harus punya: judul jelas, assignee (1 orang), tanggal mulai &
              target selesai, prioritas. Task muncul di Papan Kerja (Execution) dan
              statusnya bisa diubah dari Belum Direncanakan → Siap → Sedang Berjalan →
              Menunggu Review → Selesai.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Contoh:</span>
              <span className="phx-example-body">
                Phase 1 ("Pengumpulan Dokumen") punya 3 Task:
                <ol className="phx-inline-list">
                  <li><strong>Task:</strong> Kumpulkan laporan arus kas Q1 <em>(Pak Andi · 1–7 Mar · HIGH)</em></li>
                  <li><strong>Task:</strong> Kumpulkan neraca per divisi Q1 <em>(Bu Rina · 1–10 Mar · MEDIUM)</em></li>
                  <li><strong>Task:</strong> Email treasury minta data Januari <em>(Pak Andi · 1–3 Mar · LOW)</em></li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Aturan praktis:</strong> kalau Anda bisa bilang "saya akan kerjakan
              ini dalam X hari, dan saat selesai outputnya jelas" — itu Task. Kalau lebih
              kompleks, mungkin sebenarnya Phase (yang berisi beberapa Task).
            </p>
          </article>

          {/* Subtask */}
          <article className="phx-level phx-level--mini">
            <header className="phx-level-head">
              <span className="phx-level-num phx-level-num--mini">5</span>
              <div>
                <h3 className="phx-level-title">Subtask — Checklist dalam Task</h3>
                <p className="phx-level-tagline">Langkah-langkah kecil yang tidak perlu di-track terpisah</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>Subtask adalah checklist langkah dalam satu Task.</strong> Tidak punya
              status, tidak punya assignee terpisah, tidak muncul di Papan Kerja. Hanya
              kelihatan saat Anda buka detail Task. Gunakan saat Task punya beberapa
              langkah kecil yang ingin di-tick satu per satu.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Contoh:</span>
              <span className="phx-example-body">
                Task "Email treasury minta data Januari" bisa punya Subtask:
                <ol className="phx-inline-list phx-inline-list--simple">
                  <li>☐ Draft email</li>
                  <li>☐ Kirim ke Pak Hendro</li>
                  <li>☐ Konfirmasi diterima</li>
                  <li>☐ Tindak lanjut kalau belum direspons dalam 2 hari</li>
                </ol>
              </span>
            </div>
          </article>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">❓ Yang Sering Bikin Bingung</h2>

          <details className="phx-faq">
            <summary>Kapan saya pakai Workstream vs Phase?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>Workstream = paralel</strong>, <strong>Phase = sekuensial</strong>.
                Kalau dua bagian Program bisa dikerjakan dua tim berbeda secara bersamaan
                (mis. Audit Divisi Keuangan + Audit Divisi Produksi), pisah jadi 2 Workstream.
                Kalau dua bagian harus dikerjakan berurutan oleh tim yang sama (mis.
                Kumpulkan dokumen → baru bisa Analisis), pakai 2 Phase di satu Workstream.
              </p>
              <p className="phx-faq-tip">
                💡 Tes cepat: bisakah saya kerjakan dua bagian ini di hari yang sama dengan
                tim berbeda? Kalau ya → Workstream. Kalau yang satu blok yang lain → Phase.
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Bisakah Task tanpa Phase?</summary>
            <div className="phx-faq-body">
              <p>
                Secara teknis bisa — ATLAS membolehkan task langsung di bawah Workstream
                tanpa Phase. Berguna untuk task ad-hoc cepat yang tidak butuh konteks
                tahapan. Tapi untuk struktur kerja yang rapi (audit, riset, proyek
                terjadwal), <strong>sebaiknya selalu pakai Phase</strong> — biar saat
                bulan depan ada yang nanya "kemajuan kita di mana?", Anda bisa jawab
                pakai Phase ("kita di Phase 2 dari 4").
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Berapa banyak Workstream yang ideal per Program?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>2–5 Workstream</strong> adalah rentang sehat. 1 Workstream =
                Program tidak perlu dipecah, jadi langsung Phase-Task saja. Lebih dari
                5 = Program kemungkinan terlalu besar; pertimbangkan dipecah jadi 2 Program
                terpisah dengan ikatan via KPI bersama atau referensi cross-program.
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Apa beda Phase dengan Milestone?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>ATLAS tidak punya entitas terpisah bernama "Milestone".</strong>
                Milestone (momen pencapaian / deliverable besar) tercermin di
                completion Phase atau penyelesaian Task tertentu. Mis. "tutup buku akhir
                Q1" = milestone yang sekaligus jadi akhir Phase "Penutupan Q1".
              </p>
              <p>
                Kalau Anda perlu menandai milestone secara eksplisit, Anda bisa:
              </p>
              <ul className="phx-faq-list">
                <li>Buat Task khusus berjudul "Milestone: …" yang menandai pencapaian</li>
                <li>Atau atur deadline akhir Phase = tanggal milestone</li>
              </ul>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Workstream itu paralel atau sekuensial?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>Paralel by default.</strong> ATLAS tidak punya konsep "Workstream
                B menunggu A". Kalau Anda butuh dependency antar Workstream, atur lewat
                Task khusus di Workstream B yang menunggu output Workstream A
                (mis. blocker dengan referensi ke Task Workstream A, atau cukup atur
                tanggal mulai Workstream B setelah tanggal selesai Workstream A).
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Apakah Assignment termasuk dalam hierarki ini?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>Tidak.</strong> Assignment adalah <em>track terpisah</em> di luar
                Program. Assignment = tugas ad-hoc dari atasan ke bawahan yang tidak
                terkait struktur Program. Assignment punya lifecycle status sendiri
                (Siap Dikerjakan → Sedang Berjalan → Menunggu Review → Selesai), board
                sendiri di menu Assignment, dan tidak mempengaruhi Health Program.
                Assignment masuk ke <strong>Commitment Ledger</strong> personal (hit-rate
                komitmen) tapi tidak ke metrik Program.
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Apa hubungan KPI dengan hierarki ini?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>KPI dilink ke Program</strong> (bukan ke Workstream/Phase/Task).
                Saat Anda hubungkan KPI ke Program, ATLAS hitung kontribusi capaian Program
                tersebut ke KPI itu. Task tidak punya KPI sendiri — kontribusinya
                tercermin di progress Program-nya.
              </p>
              <p>
                Untuk lihat KPI per program: detail Program → tab <strong>KPI APMS</strong>.
              </p>
            </div>
          </details>
        </section>

        {/* ── Mini-recap ────────────────────────────────────────── */}
        <section className="phx-section phx-recap">
          <h2 className="phx-sec-title">📝 Ringkasan 30 Detik</h2>
          <ul className="phx-recap-list">
            <li><strong>Program</strong> — inisiatif strategis 6–12 bulan dengan deliverable besar</li>
            <li><strong>Workstream</strong> — jalur kerja paralel di dalam Program (per bidang/tim)</li>
            <li><strong>Phase</strong> — tahapan berurutan di dalam Workstream (apa duluan, apa kemudian)</li>
            <li><strong>Task</strong> — pekerjaan konkret yang di-assign ke 1 orang dengan deadline</li>
            <li><strong>Subtask</strong> — checklist langkah kecil dalam Task (tidak standalone)</li>
          </ul>
          <p className="phx-recap-note">
            <strong>Saat ragu:</strong> tanya "berapa lama ini akan dikerjakan?" Kalau bulanan
            = Program. Mingguan = Phase. Harian = Task. Per jam = Subtask.
          </p>
        </section>

        {/* ── Link to Playbook ──────────────────────────────────── */}
        <section className="phx-playbook-link">
          <span className="panduan__playbook-link-icon" aria-hidden="true">📖</span>
          <div>
            <strong>Butuh detail teknis?</strong>{' '}
            <a
              href="/playbook#5-perencanaan--program--workstream"
              onClick={e => { e.preventDefault(); navigate('/playbook#5-perencanaan--program--workstream') }}
              className="panduan__playbook-link-anchor"
            >
              Buka Playbook §5 — Perencanaan: Program & Workstream
            </a>
            {' '}untuk aturan approval, edit, dan health score.
          </div>
        </section>
      </div>
    </div>
  )
}
