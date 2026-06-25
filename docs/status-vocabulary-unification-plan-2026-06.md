# ATLAS — Status Vocabulary Unification Plan (2026-06-25)

> **Tujuan utama: workflow user yang lebih cepat & lebih percaya diri** — bukan kerapian kode.
> Konsistensi label hanyalah *cara*; hasil yang dikejar adalah user bisa membaca status tanpa
> berpikir, membangun satu model mental lintas modul, dan langsung tahu "apa yang butuh saya
> sekarang". Dokumen ini lahir dari keluhan konkret: di Workboard sulit memisahkan kartu
> aktivitas vs program, dan "delayed tidak punya wadah". Audit lanjutan membuktikan itu gejala
> dari fragmentasi kosakata status se-aplikasi.

Status: **PLAN — belum dieksekusi.** Audit sumber: 3 penyisir, 2026-06-25 (lihat memory
`project_status_label_fragmentation`).

---

## 0. TL;DR

1. Kosakata status ATLAS **tidak konsisten lintas aplikasi**: enum mentah bocor ke UI, satu
   konsep dipakai dengan kata berbeda (RED = "Delayed"/"Off Track"/"Critical"), dan Bahasa
   Indonesia menumpuk dua makna jadi satu kata (Delayed=Late="Terlambat").
2. Akar: **tidak ada satu sumber kebenaran** — vocab health di-fork 4 file, ~14 helper menulis
   label sendiri, banyak tempat melompati i18n.
3. Perbaikan = bangun **satu sumber kebenaran per domain** (`lib/status.ts` + primitive
   design-system), arahkan SEMUA renderer ke situ, pasang **gate CI** anti-regresi, lalu
   **redesign Workboard** (dua sumbu: Progress × Schedule; Schedule jadi "wadah") di atas
   fondasi yang sudah konsisten.
4. Dampak ke user: baca-tanpa-berpikir, satu model mental, triase "apa yang slipping" sekali
   lihat, dan hilangnya momen "kok kelihatan rusak".

---

## 1. Kenapa ini soal WORKFLOW, bukan kosmetik

Tiap perbaikan diikat ke satu hasil kerja user. Kalau sebuah perbaikan tidak menghasilkan
salah satu dari lima ini, ia tidak masuk plan.

| # | Manfaat workflow | Masalah sekarang yang menghambatnya |
|---|---|---|
| W1 | **Baca tanpa berpikir** (kecepatan scan). Eksekutif harus paham ≤3 detik (lihat `feedback_executive_dashboard_pakem`). | "IN_PROGRESS" mentah di samping "Sedang Berjalan" memaksa user berhenti & menafsir. |
| W2 | **Satu model mental lintas modul.** PIC berpindah Workboard ↔ Programs ↔ Focus ↔ Channels seharian. | RED = "Delayed" di satu layar, "Off Track" di KPI, "Critical" di Meeting → user tak bisa menyimpulkan "ini sebenarnya kondisi apa". |
| W3 | **"Apa yang slipping?" terjawab sekali lihat** (triase). | Delayed/At Risk tak punya wadah di mana pun → user harus berburu, bukan melihat. |
| W4 | **Label menggerakkan aksi yang benar.** Overdue → eskalasi; At Risk → intervensi. | "Overdue", "Delayed", "Late" semua jadi "Terlambat" → user tak bisa bedakan genting vs ringan, salah prioritas. |
| W5 | **Tanpa momen "kelihatan rusak"** yang mengikis kepercayaan. | Enum UPPERCASE mentah terbaca seperti bug → user ragu pada data lain di layar. |

**Prinsip pengikat:** status ada untuk *menggerakkan keputusan*. Label yang ambigu = keputusan
yang lambat/salah. Maka target sebenarnya bukan "label seragam", tapi "user mengambil keputusan
yang tepat lebih cepat".

---

## 2. Apa yang rusak hari ini (ringkas)

Detail file:line lengkap ada di memory `project_status_label_fragmentation`. Ringkasan per
tingkat dampak ke user:

**A. Enum mentah bocor ke layar** (paling merusak — W5)
- `ExecutionGrid.tsx:330` → "IN_PROGRESS"/"BLOCKED" mentah (tab Jadwal)
- `InboxView.tsx:468/525/588/603` → "IN PROGRESS"/"BACKLOG"/"PENDING KASUB" mentah (Focus)
- `WorkboardView.tsx:635/1052` → prioritas "MEDIUM" mentah; `:1077` → severity "HIGH" mentah
- `ChannelsView.tsx:2149`, `ProgramDetailView.tsx:1529/1610`, `ProgramsView.tsx:1057`

**B. Satu konsep, kata berbeda** (W2)
- Health RED: "Delayed" (kanonik) vs "Off Track" (`lib/kpi.ts:65` tanpa t(), GoalsView, ReportsView) vs "Critical" (`MeetingDetailPanel.tsx:928`). GREEN: "On Track" vs "Healthy".
- Program "running": badge "Active" (helper kanonik) vs lane board "In Progress" (`ProgramsView.tsx:70/1051`, bypass helper). *Catatan: bukan enum korup — `approvalStatus=ACTIVE` & `status=IN_PROGRESS` adalah dua field; ini murni pilihan kata label.*
- Fase approval: "Awaiting KASUBDIV" vs "Pend. Kasub" vs "PENDING KASUB".
- `IN_REVIEW`: "Dalam Peninjauan" (mayoritas) vs "Tinjau" (`TaskPlanningPanel.tsx:76`).
- Workboard: 1 task = lane "Not Started" + chip "Backlog" (grup vs status presisi — lihat §6).

**C. Tabrakan Bahasa Indonesia** (W4)
- "Delayed" & "Late" → "Terlambat"; "On Hold" & "Postponed" → "Ditunda"; "Rejected" & "Declined" → "Ditolak"; "Overdue" tak ada key id.json (tetap English).

**D. Fragilitas kode** (belum terlihat user, tapi sumber drift berikutnya)
- Vocab health di-fork 4 copy; ~14 helper deklarasi ulang label; 5 slug family utk RED; 3 skala severity tak selaras.

**Backend bersih** — hanya kirim enum mentah, tak ada label pre-format. Semua diperbaiki di FE.

---

## 3. Model: dua sumbu, satu sumber kebenaran

Akar kebingungan Workboard: **tiga sumbu status dicampur seolah satu daftar.** Kita pisahkan
jadi DUA sumbu ortogonal dan beri masing-masing peran UI yang jelas:

- **Progress (lifecycle)** — *di mana posisinya*: Not Started → In Progress → Completed. Ini
  yang jadi **pengelompokan/struktur**.
- **Schedule (urgensi/health)** — *bagaimana jalannya*: On Track / At Risk / Overdue. Ini
  **satu badge konsisten** + **pengurut**, dan — di Workboard — jadi **"wadah"** triase.

Aturan emas: **satu konsep → satu string sumber.** Variasi visual (UPPERCASE, singkatan,
ikon) adalah *presentasi* yang diturunkan dari sumber itu — **bukan** string kedua yang
ditulis tangan. Inilah yang mencegah "Medium"/"MEDIUM"/"Sedang" hidup berdampingan.

---

## 4. Kamus kanonik (sumber kebenaran)

Bahasa: app bilingual (EN natural-key → `id.json`). **Layer English = kanonik**; `id.json`
wajib memberi terjemahan **berbeda untuk konsep berbeda**. Glossary acuan: `project_terminology_glossary`.

### 4.1 Schedule / Health — task & program
| Konsep | Label EN (kanonik) | id.json | Catatan |
|---|---|---|---|
| GREEN | **On Track** | Sesuai Rencana | hapus "Healthy" |
| YELLOW | **At Risk** | Berisiko | — |
| RED | **Delayed** | Terlambat | hapus "Off Track" & "Critical" (health) |
| past target date | **Overdue** | **Telah Lewat Tempo** *(tambah key — sekarang kosong)* | beda dari Delayed (lihat bawah) |
| done | **Completed** | Selesai | — |

> **Delayed vs Overdue** (penting utk W4): *Delayed* = health RED (di belakang rencana, tapi
> belum lewat tanggal akhir). *Overdue* = sudah lewat `targetEndDate`/`targetCompletion` &
> belum selesai. Keduanya wajib bisa dibedakan user — ini yang menggerakkan "intervensi" vs
> "eskalasi sekarang".

### 4.2 Work / Lifecycle status — task / workstream / phase / blocker
| Enum | Label EN | id.json | 
|---|---|---|
| BACKLOG | Backlog | Backlog |
| READY | Ready | Siap |
| IN_PROGRESS | In Progress | Sedang Berjalan |
| IN_REVIEW | In Review | Dalam Peninjauan *(perbaiki "Tinjau")* |
| BLOCKED | Blocked | Terhambat |
| COMPLETED | Completed | Selesai |

**Lane board (grup)** = Not Started (BACKLOG,READY) / In Progress (IN_PROGRESS,IN_REVIEW,BLOCKED) / Completed. Lane = *grup status*; chip kartu = *status presisi*. Legit beda granularitas (lihat §6) — tapi keduanya wajib dari sumber yang sama.

### 4.3 Priority — task & (sebagai skala) blocker severity
Low / Medium / High / Critical (sentence-case). **UPPERCASE = `text-transform` CSS**, bukan string kedua. Blocker *severity* memakai skala kata yang sama tetapi via helper severity terpisah (konsep ≠ priority) — lihat §6.

### 4.4 Program lifecycle / approval — sumber: `getProgramDisplayStatus`
Planning / Awaiting KASUBDIV / Awaiting KADIV / Needs revision / **Active** / On Hold / Completed / Cancelled.
- Kata "running" kanonik = **Active** → lane board berhenti memakai `formatStatusLabel('IN_PROGRESS')`, ikut helper.
- Singkatan "Pend. Kasub" hanya boleh sebagai varian `short` dari sumber yang sama (badge sempit), bukan fork.
- Raw "PENDING KASUB" (InboxView/ApprovalLog) → lewat helper.

### 4.5 Modul lain (sumber masing-masing, didokumentasikan)
- **Escalation**: Awaiting / Committed / In Progress / Resolved / Declined / Rerouted (`Escalation.tsx` jadi sumber; `InboxView:140-143` berhenti hardcode English).
- **Meeting / ActionItem**: Scheduled/Ongoing/Completed/Cancelled/Postponed; Open/In Progress/Completed. (Sudah konsisten — pertahankan.)
- **Report (Monthly+Risk)**: Draft/Submitted/Reviewed/Approved/Rejected. (Sudah berbagi `types/monthlyReports.ts STATUS` — pertahankan.)
- **Severity skala**: priority L/M/H/C, KRI Normal/Warning/Critical, composite risk 5-step — **tiga skala yang memang beda domain**; tetap terpisah, beri komentar sumber.

### 4.6 i18n — pisahkan tabrakan
- `Late` → "Telat" (≠ Delayed "Terlambat") *atau* gabungkan ke "Overdue" bila memang sama maksud (putuskan saat eksekusi; default: bedakan).
- `Postponed` → "Diundur" (≠ On Hold "Ditunda").
- `Declined` → "Ditolak Eskalasi" / konteks (≠ Rejected "Ditolak") — atau biarkan "Ditolak" bila tone identik; default: bedakan via konteks kalimat.
- Tambah key `Overdue`.

---

## 5. Arsitektur — di mana sumber kebenaran tinggal

**Front door tunggal: `resources/js/lib/status.ts`** (baru) — agregasi + re-export helper yang
sudah baik, hapus yang fork:
- `health(programOrTask)` → `{ key, label, short?, tone, slug }` (gabung `programStatus.getProgramHealthDisplay` + `ui.healthLabels`; hapus copy di Charter ×2, kpi.ts, GoalsView, ReportsView, MeetingDetailPanel).
- `workStatus(enum)` → pindahkan/standarkan `formatStatusLabel` (kini di `contexts/workspace.tsx`).
- `priority(enum)` / `severity(enum)` → satu map masing-masing.
- `programStatus(program)` → re-export `getProgramDisplayStatus` (hapus fork `approvalBadge`).
- Semua **wajib lewat `i18n.t`**. Slug **satu family per konsep** (selesaikan 5-slug RED).

**Primitive render: design-system** (`@/design-system`) — sejalan arah konvergen (`project_dual_design_system`):
- `<HealthPill>` (migrasi dari `components/ui.tsx`), `<StatusTag>`, `<PriorityTag>` — semua makan `lib/status.ts`. CSS slug terpadu di token `--ds-*`.
- Komponen/halaman baru WAJIB pakai primitive ini; legacy dimigrasi oportunistik saat di-touch.

**Gate anti-regresi: `scripts/audit-status-labels.mjs`** (pola sama `audit:breakpoints` / `audit-darkmode`):
- Gagal CI bila ada render enum status mentah (regex: `\.status\b(?!\s*===)` di JSX text, `{item.priority}`, `.replace(/_/g,' ')` pada field status) atau label literal status di luar `lib/status.ts`/`id.json`.
- Baseline grandfather temuan lama, turunkan bertahap. Masuk `npm run check`.
- **Ini investasi workflow jangka panjang**: mencegah fragmentasi kambuh — sekali rapi, tetap rapi.

---

## 6. Yang SENGAJA dibiarkan berbeda (anti over-normalisasi)

Konsistensi ≠ menyeragamkan paksa. Memaksa hal-hal ini sama justru **merusak** workflow:

1. **Assignment board 4-lane vs Task board 3-lane.** Assignment punya langkah review/approval
   nyata → IN_REVIEW jadi lane sendiri. Kata sama, *struktur* beda — biarkan.
2. **Lane (grup) vs chip (status presisi).** "Not Started" lane memuat "Backlog"+"Ready"
   chip. Beda granularitas itu informatif — syaratnya keduanya dari satu sumber & lane jelas
   terbaca sebagai *grup* (header) bukan status item.
3. **Singkatan utk ruang sempit** ("Pend. Kasub") — boleh, tapi sebagai varian `short` dari
   sumber yang sama.
4. **Tiga skala severity** (priority, KRI, composite risk) — domain berbeda, jangan dipaksa
   satu. Cukup masing-masing punya satu sumber.

---

## 7. Redesign Workboard (payoff workflow, di atas fondasi konsisten)

Setelah §4–§6 beres, baru ubah bentuk Workboard — kini aman karena vocab tunggal:

- **By Program**: program jadi **section header (hairline, Pattern A)**, bukan kartu; task jadi
  **baris ber-indentasi** (bukan kanban-mini di dalam kartu). Hilangkan card-in-card →
  keanggotaan program otomatis jelas (jawab keluhan awal).
- **Schedule jadi "wadah"**: urutkan baris per Schedule (Overdue → At Risk → On Track → Not
  Started → Completed-collapsed). "Delayed/Overdue" akhirnya punya rumah (W3).
- **Header program sticky** saat lanes panjang → jangkar program tak hilang saat scroll.
- **Attention Queue** jadi strip ringkas terlipat (hapus duplikasi task yang sama 2×).
- **Board tab** tetap kanban (rumah metafora kolom); **By Program** jadi browse-per-program —
  dua tab kini beda peran, bukan dua kanban kembar.
- Stat chip & time-filter yang mencampur sumbu → diungkap ulang dalam kosakata tunggal.

Detail desain & alternatif (lifecycle-as-wadah) ada di riwayat diskusi; keputusan: **Schedule
sebagai wadah** karena Workboard = *Daily PIC Workspace* ("apa yang butuh saya sekarang").

---

## 8. Rencana eksekusi — bertahap

Tiap fase berdiri sendiri, bisa di-commit & di-verifikasi terpisah. Urutan = dampak-per-risiko.

### Fase 0 — Fondasi (tanpa perubahan visual)
- Buat `lib/status.ts` (agregasi/re-export). Migrasi `HealthPill` ke design-system + tambah `StatusTag`/`PriorityTag`. Satukan slug CSS RED.
- Buat `scripts/audit-status-labels.mjs` + baseline; sambungkan ke `npm run check`.
- **Verifikasi:** typecheck+build hijau; belum ada perubahan tampilan.

### Fase 1 — Tutup kebocoran enum mentah (W5, risiko rendah, kemenangan instan)
- File: `ExecutionGrid.tsx:330`, `InboxView.tsx:468/525/588/603/140-143`, `WorkboardView.tsx:635/1052/1077`, `ChannelsView.tsx:2149`, `ProgramDetailView.tsx:1529/1610`, `ProgramsView.tsx:1057`.
- Semua → lewat `lib/status.ts`. Turunkan baseline gate ke 0 untuk file ini.
- **Verifikasi:** smoke EN+ID, dark+light; tak ada lagi teks UPPERCASE_ENUM.

### Fase 2 — Collapse fork & kata divergen (W2)
- Hapus "Off Track"/"Critical"(health)/"Healthy" → semua RED="Delayed", GREEN="On Track" (`kpi.ts`, `GoalsView`, `ReportsView`, `MeetingDetailPanel`).
- Lane board program ikut `getProgramDisplayStatus` → "Active" (bukan "In Progress"); hapus fork `approvalBadge`; satukan "Awaiting KASUBDIV".
- `TaskPlanningPanel.tsx:76` IN_REVIEW → "In Review".
- Satukan 4 copy vocab health ke `lib/status.ts`.
- **Verifikasi:** grep tak menemukan label health di luar `lib/status.ts`.

### Fase 3 — Disambiguasi i18n (W4)
- `id.json`: Late≠Delayed, Postponed≠On Hold, Declined≠Rejected; tambah "Overdue".
- **Verifikasi:** mode ID — Delayed & Late tampil beda; Overdue ter-translate.

### Fase 4 — Redesign Workboard (payoff, §7)
- Ratakan By Program → section+baris; Schedule-as-wadah; sticky header; demote Attention Queue; bongkar stat/time-filter campur-sumbu.
- **Verifikasi:** smoke Workboard EN+ID, dark+light, @1366/1440/1920/390; reflow phone bersih.

### Fase 5 — Kunci & verifikasi penuh
- Gate `audit:status-labels` baseline 0 di `npm run check`; `php artisan test`; smoke set lengkap.

---

## 9. Verifikasi / cara membuktikan

- `npm run check` (typecheck + lint + audit breakpoints + **audit:status-labels** + build) hijau.
- `php artisan test` hijau (Fase 2 menyentuh label program; pastikan tak ada test snapshot label yang pecah).
- Visual smoke **2 tema × 2 bahasa**: `scripts/workboard-shot.mjs` (baru/extend), `home-shot`, `perf-shot`, `mobile-shot` (MEASURE @390).
- Cek manual lintas-modul: satu program "running" → badge & lane sama-sama "Active"; satu task RED → "Delayed" di Workboard, Home, Programs, Channels (W2).

---

## 10. Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Test snapshot label pecah (Fase 2) | Update test ke label kanonik; ini benar, bukan regresi. |
| `id.json` disambiguasi mengubah kata yang user sudah terbiasa | Pilih kata yang lebih jelas, bukan sekadar beda; review §4.6 dgn user sebelum apply. |
| Gate audit terlalu agresif (false positive) | Baseline grandfather + komentar opt-out `status-allow` (pola `bp-allow`/`dark-allow`). |
| Field `status` vs `approvalStatus` program membingungkan di kode | **Bukan** bagian fix label (data sehat); catat sebagai utang modeling terpisah, jangan migrasi sekarang. |
| Redesign Workboard menyentuh modul inti | "Augment, jangan rebuild": data/filter/modal/report flow tetap; hanya lapisan presentasi By Program berubah. |

Tiap fase aditif & revertable per-commit.

---

## 11. Di luar lingkup (catat utk nanti)

- Refactor field `Program.status` vs `approvalStatus` (utang modeling, bukan label).
- Menyatukan 3 skala severity jadi satu (tidak diinginkan — domain beda).
- Backend mengirim label pre-format (tidak perlu — FE i18n sudah jadi sumber).

---

## 12. Keputusan (2026-06-25 — disetujui user)

1. **i18n** — bedakan HANYA status jadwal yang menggerakkan aksi; jangan over-normalisasi:
   - Delayed → **Terlambat** (tetap), Overdue → **Lewat Tempo**, Late (task selesai lewat
     tenggat) → **Lewat Tenggat** (pasangan "Tepat Waktu").
   - Declined & Rejected → **tetap "Ditolak" keduanya** (modul beda, tak pernah bersebelahan,
     konteks cukup). Sengaja TIDAK dibedakan.
2. **Cakupan** — **pecah 3 PR**: PR-1 = Fase 0–1 (fondasi + tutup kebocoran, nol debat
   wording), PR-2 = Fase 2–3 (collapse fork + i18n), PR-3 = Fase 4 (redesign Workboard).
3. **Kata "running" program** = **"Active"** (program "Active" vs task "In Progress" — beda
   altitude, membantu W2).

> **PR-1 scoping (refinement saat eksekusi):** fondasi minimum utk menutup kebocoran =
> `lib/status.ts` (helper label workStatus/priority/severity + re-export health/program) +
> gate `audit-status-labels.mjs`. Migrasi penuh `HealthPill`→design-system + `<StatusTag>`/
> `<PriorityTag>` digeser ke PR-2 (barengan collapse fork) agar PR-1 tetap kecil & bebas-risiko.

---

## 13. Addendum eksekusi — PR-2 (Fase 2–3) SELESAI (2026-06-25)

`npm run check` HIJAU. Refinement penting saat eksekusi:

**KPI = domain berbeda → "Off Track" DIPERTAHANKAN (mengoreksi §8 "semua RED=Delayed").**
Alasan (§6 anti over-normalisasi): health task/program berbasis **JADWAL** (On Track/At Risk/
Delayed/Overdue); status KPI berbasis **TARGET** (capaian vs target). KPI RED bukan "terlambat" —
ia "menyimpang dari target". Memaksa "Delayed" justru meng-konflasi dua konsep beda → lebih
membingungkan. Ternyata GoalsView/ReportsView SUDAH konsisten pakai "Off Track" (+`t()`);
`getKpiStatusLabel` di kpi.ts = dead-code (cuma ditambah `t()` utk higiene). Jadi tak ada yang
user-lihat berubah ke "Delayed" — sengaja.

**Fase 2 (collapse fork & kata divergen):**
- MeetingDetailPanel: RED "Critical"/GREEN "Healthy" → On Track/At Risk/Delayed (via `healthLabel`).
- ProgramsView: lane program "In Progress" → **"Active"** (`programStatusLabel`) di 2 view (grouped + kanban).
- TaskPlanningPanel: history IN_REVIEW "Tinjau" → "In Review".
- Charter HeaderStrip + StatusPanel: hapus 2 map kembar → delegasi `charterHealthLabel`.
- ui.tsx `HealthPill`: hapus `healthLabels()` → delegasi `healthLabel`.
- workspace `formatStatusLabel`: delegasi `workStatusLabel` (title-case dipusatkan).
- lib/status.ts: + `programStatusLabel`, `charterHealthLabel`.

**Fase 3 (i18n) — mapping final trio (semua distinct):**
- Delayed → "Terlambat" · Overdue → "Lewat Tempo" · Late → "Lewat Tenggat"
- On Hold → "Ditunda" · Postponed → "Diundur"
- Declined & Rejected → "Ditolak" (sengaja TIDAK dibedakan — §12).

**DEFER:** InboxView raw-enum (WIP user) → 6 di gate baseline. `approvalBadge` fork (short-form,
tak salah, §6 abbreviation) → dibiarkan.

---

## 14. Addendum eksekusi — PR-3 (Fase 4 redesign Workboard) SELESAI (2026-06-25)

`npm run check` HIJAU + smoke visual `workboard-byprogram-shot.mjs` PASS (95 section render,
`Mini-lanes: 0`, modal vocab `[On Track, At Risk, Delayed, Overdue]`). **By Program ditulis ulang:**
- **Program = SECTION** (hairline, header sticky) — bukan kartu. `.wb-prog` border/radius/bg dilepas.
- **Task = baris** (`ProgramTaskRow`, `.wb-row`) ber-indentasi — ganti 3-lane kanban-dalam-kartu.
  Diurut per **urgensi JADWAL** via `scheduleOf()` (Overdue/Blocked/Delayed → At Risk → On Track →
  Not Started; Completed dipisah, dilipat default). Rail kiri + pill = sinyal jadwal = **"wadah"
  delayed** yang dulu hilang.
- **Attention Queue → strip terlipat** (`.wb-attention-strip`, default tutup) — anti task-dobel.
- i18n baru: "No tasks in this program yet.", "{{count}} need attention", "across all programs".
- CSS lama `.wb-prog__lane*`/`lane-fold` dibuang; Board tab (kanban lifecycle) TAK disentuh.

**TODO opsional (PR-3b):** ubah **Board tab** dari lane lifecycle → kolom urgensi (Overdue/At Risk/
On Track/Not Started/Completed) supaya delayed punya wadah-kolom global juga. Verifikasi dark-mode
Workboard (gate token lolos, tapi belum di-screenshot). GOTCHA smoke: DB dev DTDI — password
`atlas.admin` di-reset ke `Password123!` utk smoke (login = userId, kolom passwordHash; superadmin@atlas
= "Super Admin ATLAS").
