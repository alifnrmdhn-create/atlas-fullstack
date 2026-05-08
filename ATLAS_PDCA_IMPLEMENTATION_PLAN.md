# ATLAS — Rencana Implementasi PDCA Platform

> **Status**: ✅ MVP COMPLETE (Sprint 0–5). Sprint 6 deferred.
> **Disusun**: 2026-05-07
> **MVP selesai**: 2026-05-08
> **Konteks**: Transformasi ATLAS jadi platform PDCA yang efektif, world-class UX, tidak overkill, menyenangkan dipakai
> **Sponsor**: Pak M. Iswahyudi (Direktur Keuangan & Manajemen Risiko)

## Execution Log (MVP)

| Sprint | Selesai | Deliverable Utama | Tests |
|---|---|---|---|
| **0** | 2026-05-07 | OrgChainService (19 tests), Component audit, Threshold workshop config, Notification types registered | 19/19 ✓ |
| **1** | 2026-05-07 | Sidebar PDCA-aligned, Reports bug fixed, /performance/divisi & /performance/me routes, dashboard dehidari nav | 52/52 ✓ |
| **2** | 2026-05-07 | DivisiView (new), Scorecard clickable cells, KPI Saya CTA, /inbox/today endpoint, CommitmentTodaySection, CollapsibleSection + DataSourceBadge primitives | 52/52 ✓ |
| **3** | 2026-05-07 | picaContext endpoint, BlockerController.updateResolution dengan optimistic locking, PicaCompositePanel + Continuity + 4-cell grid + inline countermeasure editor, realtime broadcast bridge | 52/52 ✓ |
| **4** | 2026-05-08 | EscalationRequest schema + model + controller (7 endpoints), FeatureFlagService (DKM scoping), EscalationButton/Modal/TriagePanel + side panel + keyboard shortcuts C/R/D, InboxView 2 sections, Commitment Ledger (3-source aggregate) | 52/52 ✓ |
| **5** | 2026-05-08 | Auto-health extended signals (workstream + KPI + task overdue + blockers), atlas:compute-health scheduled, Plan→Do handoff notifications, Check→Act sessionStorage bridge, MonthlyReport silent autoprefill, ForecastBadge linear | 110/111 ✓ |
|  |  | **Total** | 1 pre-existing failure (KPI decimal serialization, unrelated) |

### Final State
- **4 migrations** baru: EscalationRequest, User.toursCompleted, Program.autoHealthComputedAt, performance tables (Sprint 2)
- **1 halaman baru**: Performance/DivisiView
- **2 controller baru**: EscalationController, extensions di PerformanceController
- **2 service baru**: OrgChainService, FeatureFlagService
- **1 console command**: ComputeProgramHealth (every 30 min)
- **7 primitive komponen baru**: CollapsibleSection, DataSourceBadge, SidePanel, AgingIndicator, ForecastBadge, EscalationButton, EscalationTriagePanel
- **1 composite**: PicaCompositePanel
- **11 modul existing diextend additive**: AppShell, InboxView, ProgramDetailView, MeetingDetailPanel, MonthlyReportDetailView, IndividuView/Detail, ScorecardView, ProgramHealthService, ProgramController, BlockerController, MeetingController
- **0 rebuild**: ChannelsView, PresenceView, SettingsView, ProfileView, dst tidak disentuh

### Decisions Penting Selama Eksekusi
- **Sidebar PDCA labels** pakai bahasa Indonesia: Perencanaan / Eksekusi / Performance / Pelaporan / Tindak Lanjut / Komunikasi / Akun
- **Dashboard route tidak di-redirect** — endpoint `/dashboard` masih dipakai sebagai JSON API oleh workspace context. Hanya hilang dari sidebar nav.
- **Tidak buat field `autoHealthStatus` terpisah** — `Program.healthStatus` sudah = auto-derived oleh ProgramHealthService event-driven. Tidak ada manual override path. Hanya tambah `autoHealthComputedAt` timestamp untuk transparency.
- **Realtime collab** pakai existing SSE infrastructure (`BroadcastService::blocker` + bridge ke `atlas:blocker:changed` window event). Tidak bangun channel parallel.
- **EscalationRequest schema baru** (polymorphic source: BLOCKER/PROGRESS_LOG/ACTION_ITEM/AD_HOC) — clean separation, future-proof.
- **PICA composite view-only** — tidak duplikasi storage. Tarik dari Blocker.rootCause/resolution + ProgressLog.kendala + MeetingActionItem continuity.
- **Feature flag DKM-only default** untuk `clear-the-path` — pilot scope per direktorat, switchable via .env.
- **Hit rate ledger 3-source aggregate**: Tasks (targetCompletion) + MeetingActionItems (dueDate) + Assignments (dueDate). Visibility: self / atasan langsung / admin.
- **Linear forecast labeled honest** — disclaimer eksplisit di tooltip "Akan disempurnakan Sprint 6 dengan seasonal adjustment".

### Yang Belum Selesai (Deferred Post-MVP)
- ✅ **Onboarding tour Shepherd.js** — selesai 2026-05-08, 4 tour wired (escalation-inbox, clear-path-button, triage-panel, commitment-ledger)
- ✅ **Pilot metrics dashboard admin** — selesai 2026-05-08, `/admin/pilot-metrics` dengan auto-evaluate vs criteria
- ✅ **ForecastBadge extension ke KolegialDetail + DivisiView** — selesai 2026-05-08, pakai shared `lib/forecast.ts` helper
- **Sprint 6 (Real KPI Integration)** — sumber data belum confirmed; integrasi `KpiDefinition` aktual menggantikan dummy data
- **Forecast seasonal adjustment** — pair dengan Sprint 6 (data riil)
- **Threshold workshop dengan stakeholder** — dokumen `docs/sprint0-threshold-workshop.md` siap, pending session dengan Pak Iswahyudi

### Pilot Activation Checklist (DKM)
1. Set `.env`: `FEATURE_CLEAR_THE_PATH=DKM`
2. Verify users di direktorat DKM punya `directorateId` yang benar (Direktorat dengan kode 'DKM')
3. Run `php artisan atlas:compute-health` sekali manual untuk seed timestamp
4. Pastikan scheduler aktif: `php artisan schedule:run` di cron
5. Communicate ke pilot users: "Klik tombol 'Butuh Dukungan Atasan' di Blocker / ProgressLog kalau stuck"

---

---

## 1. Latar Belakang & Lensa

### Tesis Utama
ATLAS bukan katalog modul — ini sistem yang menjalankan **siklus PDCA** organisasi. Setiap fitur eksisting dipetakan ke fase Plan / Do / Check / Act, dan UX mencerminkan ritme tersebut.

### Hierarki Konseptual
- **PDCA** = master cycle (Plan → Do → Check → Act → loop kembali ke Plan)
- **PICA** = template problem-solving di dalam fase Act (Problem → Issue → Countermeasure → Action)
- **4DX Cadence of Accountability** = ritme mingguan Check↔Act handoff; "Clear the Path" = pertanyaan ke-3 dari WIG session

### Diagnosis Brutal: Kenapa DCA Lemah di PTPN
Plan oke, tapi:

**Do failures**:
- Eksekutor tidak punya "today's commitment" eksplisit
- Rencana strategis tidak nyambung ke kerja harian
- Tidak ada paksaan harian untuk update status

**Check failures**:
- Monitoring hanya periodik (lapbul), telat 30 hari
- KPI di kertas vs realisasi di lapangan tidak rekonsiliasi
- Budaya ABS (Asal Bapak Senang) — laporan dipoles, kendala disembunyikan
- Tidak ada leading indicator

**Act failures**:
- Rapat koordinasi seremonial, tanpa keputusan
- Action item dibuat tapi tidak di-track (carryover infinite)
- **Tidak ada "Clear the Path"** — kendala dilempar atasan, atasan tidak commit balik
- Eskalasi cultural barrier
- Loop ke Plan tidak terjadi

---

## 2. Filosofi Desain "World-Class, Bukan Overkill"

Aplikasi workspace populer (Linear, Notion, Asana, Monday, Superhuman) menang karena **tidak memaksa**.

| Pendekatan compliance/BUMN | Pendekatan workspace world-class |
|---|---|
| **Block** user dari aksi salah | **Surface** konsekuensi, biarkan user putuskan |
| **Force fill** field wajib | **Auto-prefill** dengan smart defaults |
| **Public shame** untuk kelambatan | **Soft visibility** — terlihat tapi tidak menghukum |
| Bureaucratic approval | Async dengan notification + ownership |
| Forced sync meetings | Decisions tracked sync atau async |
| Rigid templates | Templates as starting point, bisa diubah |
| "Lapor masalah" formal | "Tandai kendala", "butuh bantuan" — bahasa peer |

**Aturan emas**: *Make the right thing easy, the wrong thing visible — don't block.*

### Tiga Prinsip yang Saling Memperkuat
1. **Satu Inbox** — semua hal yang menunggu user ada di Focus. Hari Ini, Clear the Path, notifikasi — satu tempat.
2. **Signal di Tempatnya, Bukan Banner** — informasi muncul di kartu/item/sidebar yang sudah ada, tidak menambah elemen UI baru kecuali wajib.
3. **Auto-Surface Relevan, Quiet Saat Tidak** — komponen pintar mendeteksi konteks user (PICA expanded saat rapat koordinasi).

### Lima Aturan Engineering Discipline
1. **Auto-derive yang bisa di-derive** — healthStatus, hit rate, carryover counter — dari signal aktual
2. **Soft visibility, not hard blocks** — discrepancy badge, aging color, stale indicator
3. **Smart-default + 1-click override** — kendala prefilled, user bisa hapus tapi harus aktif
4. **Friction yang naik bertahap** — carry 1x = info, 2x = nudge, 4x = atasan harus action
5. **Bahasa peer, bukan bureaucratic**

---

## 3. Pemetaan PDCA ke Modul ATLAS

| Fase | Definisi Operasional | Modul ATLAS |
|---|---|---|
| **Plan** | Definisi target, dekomposisi program, approval | `Programs` (+ApprovalLog), `KPI/Goals`, `Workstream → Initiative → Task` |
| **Do** | Eksekusi, eksekutor menjalankan task harian | `Execution` (Workboard), `Assignment` |
| **Check** | Monitoring capaian vs target, identifikasi deviasi | `Performance` (Scorecard, Kolegial, Individu), `Monthly Report`, `Risk Report`, `ProgramProgressLog`, `Home` |
| **Act** | Bahas deviasi, tetapkan countermeasure, eskalasi, lanjut ke siklus berikutnya | `Meeting + ActionItem`, `Blocker`, `ProgressLog.kendala/dukunganDibutuhkan` |

### Infrastruktur yang Sudah Ada Tapi Tersembunyi
- `MeetingController.suggestions()` — auto-suggest rapat untuk program RED/YELLOW
- `MeetingController.continuity()` — completion rate action items dari rapat sebelumnya
- `MonthlyReportController.autoDraft()` — tarik narasi/kendala/blocker untuk laporan
- `ProgramProgressLog.kendala` + `dukunganDibutuhkan` — semi-PICA per periode
- `MeetingActionItem.linkedWorkItemId` — koneksi Action → Task
- Meeting enum sudah punya `RAPAT_KOORDINASI`

### Gap Nyata
1. Sidebar mismatch dengan PDCA (taksonomi feature, bukan bahasa kerja)
2. Bug: `grpLaporanStrategic.items = []` — BOD/KADIV tidak melihat Reports
3. Dashboard redundan dengan Home
4. Schedule kalender ada, tapi flow rapat koordinasi PICA tidak ada
5. Performance hierarchy tidak lengkap (tidak ada KPI Divisi/KPI Saya, tidak ada drill-down koheren)
6. Patahan Check→Act — kendala tidak otomatis muncul sebagai agenda rapat
7. Patahan Act→Plan — perubahan keputusan rapat tidak tercatat balik
8. Pelaporan vs Performance disatukan padahal beda nature

---

## 4. Target State Architecture

### A. Sidebar PDCA-Aligned

```
TODAY
  - Home                              Ringkasan eksekutif & pribadi
  - Focus                             Inbox notifikasi & aksi (incl. "Hari Ini")

PERENCANAAN (Plan)
  - Programs                          Portfolio + approval workflow

EKSEKUSI (Do)
  - Execution                         Workboard delivery
  - Assignment                        Tugas harian

PERFORMANCE (Check)
  - Scorecard                         Cross-direktorat ranking
  - KPI Direktorat                    (rename dari Kolegial)
  - KPI Divisi                        NEW — drill default ke divisi user
  - KPI Saya                          NEW — shortcut ke /performance/me

PELAPORAN (Check)
  - Monthly Reports
  - Risk Reports

TINDAK LANJUT (Act)
  - Rapat Koordinasi                  (= Meeting/Schedule promoted)

KOMUNIKASI
  - Channels
  - Search

AKUN
  - Presence
  - Profile
  - Settings

ADMIN (admin/superadmin)
  - Companies / Positions / Users / Roles
```

### B. Per-Role Visibility Matrix

| Item | BOD | KADIV | KASUBDIV | OFFICER/ASISTEN | ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|
| Home | ✓ | ✓ | ✓ | — | ✓ |
| Programs | ✓ | ✓ | ✓ (own dir) | ✓ (own) | ✓ |
| Execution | ✓ | ✓ | ✓ | ✓ | ✓ |
| Assignment | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scorecard | ✓ | ✓ | — | — | ✓ |
| KPI Direktorat | ✓ | ✓ | — | — | ✓ |
| KPI Divisi | ✓ | ✓ | ✓ | read-only | ✓ |
| KPI Saya | ✓ | ✓ | ✓ | ✓ | ✓ |
| Monthly Reports | ✓ | ✓ | ✓ (own divisi) | read | ✓ |
| Risk Reports | ✓ | ✓ | ✓ | read | ✓ |
| Rapat Koordinasi | ✓ | ✓ | ✓ | ✓ (peserta) | ✓ |

### C. Performance Module Hierarchy (3-tier)

```
Scorecard                                  → entry strategic ranking
   └── click cell direktorat → KPI Direktorat (Kolegial)
         └── click cell divisi → KPI Divisi (NEW)
               └── click cell sub-divisi/individu → IndividuDetail / KPI Saya
```

### D. Tiga Pilar Act yang Saling Kunci

1. **PICA Composite View** — strukturkan diskusi rapat (Sprint 3)
2. **Clear the Path** — atasan commit untuk membersihkan hambatan, bukan bawahan begging (Sprint 4)
3. **Commitment Ledger** — akuntabilitas publik per individu, hit rate visible (Sprint 4)

---

## 5. Modul: Augment, Don't Replace

### Tidak Disentuh (Zero Risk)
- `ChannelsView` (182 KB), `PresenceView` (41 KB), `SettingsView` (30 KB), `ProfileView` (24 KB)
- `ProgramsView` (98 KB), `TaskDetailView` (115 KB) (kecuali integration point Blocker), `AssignmentsView` (72 KB), `WorkboardView` (34 KB), `ScheduleView` (107 KB)
- `RoadmapView`, `ActivityView`, `GoalsView`, `ReportsView`, `RiskReportsView`, `MonthlyReportsView`, `PlaybookView`, `SearchView`, semua `AdminViews`, `AuthEntryView`

### Diextend Ringan (Additive Only)
| Halaman | Apa yang ditambah |
|---|---|
| `AppShell.tsx` | Sidebar group restructure |
| `InboxView.tsx` | Section "Hari Ini" + "Clear the Path Saya" + "Eskalasi yang Saya Ajukan" |
| `IndividuView.tsx` | Tombol "KPI Saya" di header |
| `IndividuDetailView.tsx` | Section "Komitmen Saya" |
| `ScorecardView.tsx` | Cell direktorat & divisi clickable |
| `MeetingDetailPanel.tsx` | Section PICA Composite (collapsible, conditional) |
| `MonthlyReportDetailView.tsx` | Auto-prefill kendala saat draft baru |
| `HomeView.tsx` | Maksimal: badge counter di kartu existing — **tidak ada section baru** |
| `ProgramDetailView.tsx` | Mount `<EscalationButton>` di ProgressLog section + dual health indicator |
| `TaskDetailView.tsx` | Mount `<EscalationButton>` di Blocker section |

### Halaman Benar-benar Baru (≤2)
- `Performance/DivisiView.tsx`
- (Optional) `EscalationTriageView.tsx` — kemungkinan di-embed di `InboxView` saja

### Schema Baru
- `EscalationRequest` (Sprint 4)
- `User.toursCompleted` JSON (Sprint 4)
- `Program.autoHealthStatus` & `autoHealthComputedAt` columns (Sprint 5)

---

## 6. Sprint Roadmap

| Sprint | Fokus | Hari | Schema | Pilot |
|---|---|---|---|---|
| 0 | Foundation: Org Chain + Component Audit + Threshold | 1–2 | — | Global |
| 1 | Sidebar PDCA + Bug Fix | 1–2 | — | Global |
| 2 | Performance Hierarchy + Today + Andon Badge | 5–7 | — | Global |
| 3 | PICA + Continuity + Realtime Collab | 6–8 | — | Global |
| 4 | Clear the Path + Commitment Ledger + Onboarding | 8–11 | EscalationRequest, User.toursCompleted | DKM dulu |
| 5 | Loop Close + Plan→Do + Forecast Linear | 6–8 | Program.autoHealthStatus | Global |
| **Total MVP (0–5)** | | **27–38 hari** | 3 migrations | |
| 6 | Real KPI Integration *(deferred, sumber data TBD)* | 5–15+ | TBD | TBD |

**Realistis kalender**: 8–12 minggu (akomodasi review, feedback, holiday, sick days).

---

## 7. SPRINT 0 — Foundation Prep

**Durasi**: 1–2 hari
**Risiko**: 🟢 Sangat rendah
**Deliverable**: Foundation supaya Sprint 1–5 tidak tersandung asumsi

### Track A — Org Chain Service (~4–6 jam)

**File baru**: `app/Services/OrgChainService.php`

```php
class OrgChainService {
    public function getDirectSupervisor(User $user): ?User;
    public function getEscalationChain(User $user, int $maxLevels = 3): array;
    public function canEscalateAcrossDirectorate(User $user, User $target): bool;
}
```

**Tasks**:
1. Audit struktur `Position` & `OrganizationalUnit` — petakan resolve atasan langsung
2. Test dengan user BOD, KADIV, KASUBDIV, OFFICER, ASISTEN
3. Edge cases: vacant position (climb up), multi-position user (primary), BOD (no supervisor)
4. Unit test sederhana

### Track B — Component Library Audit (~2–4 jam)

Audit `resources/js/components/` dan `components/ui/`. Output dokumen mapping:

| Komponen Dibutuhkan | Sudah Ada? | Lokasi | Action |
|---|---|---|---|
| CollapsibleSection | ? | ? | Existing / Buat baru |
| HealthBadge | ? | ? | |
| EmptyState | ? | ? | |
| SidePanel pattern | ? | ? | |
| AgingIndicator | ? | ? | |

### Track C — Threshold Workshop (~2–3 jam)

Session dengan stakeholder untuk konfirmasi angka. Output disimpan ke **`config/atlas-thresholds.php`**:

| Threshold | Default | Konfirmasi |
|---|---|---|
| Aging escalation: kuning | 3 hari | ? |
| Aging escalation: oranye | 7 hari | ? |
| Aging escalation: merah | 14 hari | ? |
| Carryover: nudge | 2x | ? |
| Carryover: auto Clear-Path | 3x | ? |
| Carryover: lock force disposition | 4x | ? |
| ProgressLog stale | >7 hari | ? |
| Auto-health discrepancy | beda 1 level | ? |
| MonthlyReport "suspiciously clean" | <2 kendala vs avg | ? |
| Pilot DKM avg disposition target | <5 hari | ? |
| Pilot DKM hit rate target | >60% | ? |

### Track D — Notification Type Registry (~1–2 jam)

Tambah types baru ke `ACTION_NOTIF_TYPES`:
- `CLEAR_PATH_REQUESTED`
- `CLEAR_PATH_COMMITTED`
- `CLEAR_PATH_CLEARED`
- `PROGRAM_TASKS_ASSIGNED` (Plan→Do handoff)
- `CARRYOVER_THRESHOLD`

### Definition of Done
- [ ] OrgChainService + 5 unit test passing
- [ ] Component audit document committed
- [ ] Threshold workshop selesai, values di `config/atlas-thresholds.php`
- [ ] Notification types registered

---

## 8. SPRINT 1 — Sidebar PDCA + Bug Fix

**Durasi**: 1–2 hari
**Risiko**: 🟢 Sangat rendah

### Files Modified
- `resources/js/layouts/AppShell.tsx` (~80 baris) — restructure navGroups, NI items baru, normalizeShellPath, PAGE_NAMES, prefetchRoute
- `routes/web.php` (~5 baris) — `/dashboard` redirect, `/performance/divisi/{kode?}`, `/performance/me`
- `app/Http/Controllers/PerformanceController.php` (~30 baris) — stub `divisi()` & `me()`

### Tasks
1. Tambah `NI.kpiDivisi`, `NI.kpiSaya` ke palette
2. Rename `NI.perfKolegial.label` → "KPI Direktorat"
3. Rename `NI.schedule.label` → "Rapat Koordinasi"
4. Restructure grup: Plan/Do/Performance/Pelaporan/Act/Komunikasi/Akun
5. Set per-role visibility sesuai matriks
6. Update normalizeShellPath, PAGE_NAMES, prefetchRoute
7. Tambah route `/performance/divisi/{kode?}` & `/performance/me`
8. Implement stub controller methods
9. Add `Route::redirect('/dashboard', '/')`
10. Smoke test: login per role, verifikasi sidebar

### Definition of Done
- Sidebar mencerminkan PDCA untuk semua role
- Reports muncul di sidebar BOD/KADIV (bug fixed)
- Klik "KPI Saya" → halaman detail individu user sendiri
- Klik "KPI Divisi" → halaman placeholder (akan diganti Sprint 2)
- Klik "Rapat Koordinasi" → ScheduleView existing
- No regression sidebar items lainnya

---

## 9. SPRINT 2 — Performance Hierarchy + Today + Andon

**Durasi**: 5–7 hari
**Risiko**: 🟢 Rendah

### Files

**Modified**:
- `app/Http/Controllers/PerformanceController.php` (+~80 baris) — implementasi penuh `divisi()`
- `resources/js/Pages/Performance/ScorecardView.tsx` (~30 baris) — wrap cells sebagai Link
- `resources/js/Pages/Performance/IndividuView.tsx` (~10 baris) — CTA "KPI Saya"
- `resources/js/Pages/InboxView.tsx` (~150 baris) — section "Hari Ini" collapsible
- `app/Http/Controllers/WorkspaceController.php` (+~30 baris) — endpoint `/inbox/today`
- `routes/web.php` (+1 baris)
- `resources/js/layouts/AppShell.tsx` (~5 baris) — fokusItem badge tambah today count

**New**:
- `resources/js/Pages/Performance/DivisiView.tsx` (~250 baris)
- `resources/js/styles/performance.css` (~100 baris CSS)

### `/inbox/today` Endpoint
Aggregate dari:
- `Task.assignedTo = me` & `plannedEndDate <= today` & status not COMPLETED/CANCELLED
- `MeetingActionItem.assignedTo = me` & `dueDate <= today` & status not COMPLETED
- `Assignment.assignedTo = me` & `dueDate <= today` & status not COMPLETED/CANCELLED

Cache 60 detik per user.

### DivisiView Structure
- Header: kode divisi, nama, direktorat induk, ranking, periode, nilai capaian
- KPI strip (re-use `KpiCard` dari KolegialDetail)
- Section "Sub-Divisi" ranking
- Section "Top Performer"
- Periode selector
- **`<DataSourceBadge type="dummy">`** — visible labeled, hilang di Sprint 6

### Cross-Cutting Refinements
- **4-state DoD**: setiap komponen baru definisikan loading, empty, error, populated
- **Mobile DoD**: minimal stack vertikal di <768px
- **Empty states ramah** ala Linear: "Tidak ada komitmen mendesak hari ini. Nice!"

### Definition of Done
- User klik divisi cell di Scorecard → masuk DivisiView
- User klik direktorat cell → KolegialDetail
- DivisiView render dengan KPI, sub-divisi, top performer
- User klik "KPI Saya" → IndividuDetail dirinya
- InboxView punya section "Hari Ini" collapsible
- Badge sidebar Focus reflect today items
- DataSourceBadge tampil dengan tooltip honest
- Mobile responsive
- 4-state lengkap

---

## 10. SPRINT 3 — PICA Composite + Continuity + Realtime Collab

**Durasi**: 6–8 hari
**Risiko**: 🟠 Medium-high (realtime menambah complexity)

### Files

**Modified**:
- `app/Http/Controllers/MeetingController.php` (+~80 baris) — `picaContext()`
- `app/Http/Controllers/BlockerController.php` (+~20 baris) — `updateResolution`
- `app/Http/Controllers/RealtimeController.php` (~30 baris) — channel `pica:meeting:{id}`
- `resources/js/Pages/MeetingDetailPanel.tsx` (~30 baris) — mount `<PicaCompositePanel>`
- `routes/web.php` (+2 baris)

**New**:
- `resources/js/components/PicaCompositePanel.tsx` (~350 baris)
- `resources/js/components/ContinuitySection.tsx`
- `resources/js/components/PicaGrid.tsx` + `PicaRow.tsx`
- `resources/js/components/CountermeasureEditor.tsx`
- `resources/js/components/CreateActionItemFromPicaModal.tsx`
- `resources/js/hooks/usePicaRealtime.ts`
- `resources/js/styles/pica.css` (~150 baris)

### `picaContext()` Returns
```json
{
  "openBlockers": [...],            // via program → workstream → task → blocker
  "latestProgressLog": {...},        // kendala, dukunganDibutuhkan
  "continuity": {                    // re-use logic existing continuity()
    "previousMeeting": {...},
    "unresolvedItems": [...],
    "completionRate": 75
  }
}
```

### Conditional Rendering Logic
```ts
const isRelevant = meetingType === 'RAPAT_KOORDINASI' && linkedProgramId
const collapsed = useLocalStoragePreference(`pica-collapsed-${meetingType}`, !isRelevant)
```

Saat collapsed: header tetap visible dengan summary count ("3 problem · 2 carryover").

### Realtime Collab Strategy

**Manfaatkan `RealtimeController` SSE existing** — jangan bangun parallel.

1. **Optimistic locking** sebagai foundation: `Blocker.updatedAt` di-check saat save countermeasure. Konflik → toast "Perubahan rekan kerja masuk lebih dulu, refresh untuk versi terbaru."
2. **Broadcast update** via SSE: user A save countermeasure → broadcast `pica:countermeasure-updated` → user B dengan panel sama melihat highlight + tombol "Lihat update."
3. **Tidak operational transform** — full collab edit terlalu kompleks untuk MVP.

**Fallback**: kalau realtime infrastructure ternyata tidak siap, fallback ke optimistic locking saja (1 hari saved).

### Empty States
- Tidak ada Blocker open: "Tidak ada problem terbuka — agenda bisa fokus ke continuity / strategic discussion."
- Tidak ada previous meeting: "Ini rapat koordinasi pertama untuk program ini."

### Mobile Strategy
- PICA grid 4-kolom desktop → stack 1-kolom mobile
- Inline countermeasure edit → modal-based di mobile

### Definition of Done
- Buka RAPAT_KOORDINASI dengan linkedProgramId → panel auto-expanded prefilled
- Edit countermeasure inline → tersimpan ke Blocker.resolution dengan optimistic UI
- "Buat Action Item" dari row PICA → modal dengan prefilled fields
- Continuity section tampil dengan completion rate
- Tipe rapat lain: panel collapsed dengan summary header
- Preferensi user (collapsed) tersimpan di localStorage
- Realtime: user lain lihat update saat countermeasure di-save
- Optimistic locking: konflik di-handle dengan toast informatif
- 4-state lengkap, mobile responsive

---

## 11. SPRINT 4 — Clear the Path + Commitment Ledger + Onboarding

**Durasi**: 8–11 hari
**Risiko**: 🟡 Medium
**Pilot**: DKM dulu, expand setelah evaluasi

### Files

**New**:
- `database/migrations/{date}_create_escalation_request_table.php`
- `database/migrations/{date}_add_tours_completed_to_user.php`
- `app/Models/EscalationRequest.php`
- `app/Http/Controllers/EscalationController.php` (~250 baris)
- `resources/js/components/EscalationButton.tsx` (~100 baris)
- `resources/js/components/EscalationCreateModal.tsx`
- `resources/js/components/EscalationTriagePanel.tsx` (~250 baris)
- `resources/js/components/EscalationRow.tsx`
- `resources/js/components/EscalationStatusRow.tsx`
- `resources/js/components/CommitmentMetrics.tsx`
- `resources/js/components/WeeklyCommitmentList.tsx`
- `resources/js/lib/onboardingTours.ts`
- `resources/js/hooks/useOnboardingTour.ts`
- `resources/js/styles/escalation.css` (~120 baris)

**Modified**:
- `routes/web.php` (+10 baris) — escalation routes
- `resources/js/Pages/InboxView.tsx` (+200 baris) — 2 section escalation + side panel triage
- `resources/js/Pages/Performance/IndividuDetailView.tsx` (+200 baris) — Commitment Ledger section
- `app/Http/Controllers/PerformanceController.php` (+50 baris) — `commitmentLedger`
- `resources/js/Pages/TaskDetailView.tsx` (~5 baris) — mount `<EscalationButton>` di Blocker section
- `resources/js/Pages/ProgramDetailView.tsx` (~5 baris) — mount `<EscalationButton>` di ProgressLog section

### EscalationRequest Schema

```php
Schema::create('EscalationRequest', function (Blueprint $table) {
    $table->id();
    $table->string('code')->unique();              // E-2026-0001
    $table->string('sourceType');                  // BLOCKER|PROGRESS_LOG|ACTION_ITEM|AD_HOC
    $table->unsignedBigInteger('sourceId')->nullable();
    $table->unsignedBigInteger('requestedById');
    $table->timestamp('requestedAt')->useCurrent();
    $table->string('title');
    $table->text('description')->nullable();
    $table->unsignedBigInteger('escalatedToId');
    $table->unsignedBigInteger('linkedProgramId')->nullable();
    $table->string('status')->default('REQUESTED');
    $table->timestamp('commitmentDueDate')->nullable();
    $table->text('commitmentNote')->nullable();
    $table->timestamp('committedAt')->nullable();
    $table->timestamp('resolvedAt')->nullable();
    $table->text('resolutionNote')->nullable();
    $table->unsignedBigInteger('reroutedToId')->nullable();
    $table->timestamps();

    $table->index(['escalatedToId', 'status']);
    $table->index(['requestedById', 'status']);
    $table->index(['sourceType', 'sourceId']);
});
```

### Status Flow
`REQUESTED → COMMITTED → IN_PROGRESS → CLEARED`
Branches: `DECLINED` (with reason), `REROUTED` (to another user)

### EscalationController Methods
- `index` — list (filter by escalatedToId / requestedById)
- `store` — create (auto-resolve `escalatedToId` via OrgChainService)
- `show` — detail
- `commit` — disposition Commit + commitmentDueDate
- `reroute` — Reroute ke user lain
- `decline` — Decline + alasan
- `resolve` — mark CLEARED + resolutionNote

### Notification Integration (Eksplisit)

Saat `EscalationRequest::store`:
```php
$this->notificationService->create([
    'userId' => $request->escalatedToId,
    'type' => 'CLEAR_PATH_REQUESTED',
    'message' => "{$requester->name} meminta dukungan: {$request->title}",
    'source' => "escalation:{$request->id}",
    'requiresAction' => true,
    'priority' => $this->mapAgingToPriority($request),
    'roleImpact' => 'Anda perlu disposition (Commit / Reroute / Decline)',
]);
```

Inbox section "Permintaan Clear the Path Saya" derived dari notif type ini, **bukan parallel system**.

### Commitment Ledger Sources (3 sumber, bukan 1)

```php
public function commitmentLedger(int $userId): array {
    // Source 1: MeetingActionItem
    // Source 2: Task (assignedTo, plannedEndDate)
    // Source 3: Assignment (assignedTo, dueDate)
    // Aggregate per week: hit/miss, hitung overall hit rate + streak
}
```

### Onboarding Tour (Shepherd.js)

4 distinct tours:
1. **Pertama buka Inbox dengan section escalation** — 3-step explainer
2. **Pertama receive Clear Path request** — highlight sidebar badge → triage panel
3. **Pertama klik "Butuh Dukungan Atasan"** — flow create + apa yang akan terjadi
4. **Pertama akses Commitment Ledger** — explain hit rate + streak

Tracking via `User.toursCompleted` JSON column.

### Pilot DKM Success Metrics

`config/atlas-thresholds.php`:
```php
'pilot_dkm_success_criteria' => [
    'avg_time_to_disposition_days' => 5,
    'min_hit_rate_aggregate' => 60,
    'min_user_satisfaction_score' => 7,    // 1-10 dari survey
    'min_active_users_pct' => 70,           // % DKM users yang pakai
    'evaluation_period_weeks' => 6,
],
```

Endpoint analytics `/admin/pilot-metrics` (admin-only) untuk monitor harian.

### Pre-Sprint Audit (0.5 hari)

Sebelum coding:
- Audit `TaskDetailView.tsx` (115 KB) — petakan Blocker section, integration point
- Audit `ProgramDetailView.tsx` (171 KB) — petakan ProgressLog section
- Output: dokumen mapping integration points

### Visibility (Anti-Shame Design)

| Audience | Yang dilihat |
|---|---|
| User sendiri | Detail penuh: commitment, miss + alasan, hit rate, streak |
| Atasan langsung | Detail penuh bawahan langsung |
| Tim/sub-divisi | Hit rate aggregate + commitment minggu ini saja |
| Cross-divisi | Tidak ada (kecuali admin/BOD lihat aggregat divisi level) |

Framing UI:
- "Consistency: 78%" dengan trend arrow, **bukan** "0% completion miss"
- Streak counter: "12 minggu berturut hit ≥80%"
- Miss + alasan = framed sebagai "learning notes"
- Empty state ramah: "Belum ada komitmen minggu ini. Tambahkan satu — bisa kecil."

### Carryover Soft Escalation

| Carryover | Behavior |
|---|---|
| 0 (baru) | Normal task |
| 1x | Badge subtle "rolling" — info |
| 2x | Badge kuning "repeated" + inline prompt: "Apa yang stuck? Tulis satu kalimat." Boleh skip |
| 3x | Auto-muncul di Clear the Path queue atasan **sebagai saran** |
| 4x | Action item locked — atasan **harus** disposition |

### Definition of Done
- Pilot DKM: user bisa create, atasan bisa disposition
- Aging indicator visual (warna bertingkat)
- Keyboard shortcut C/R/D works
- Inbox memiliki 3 section: Hari Ini, Clear the Path Saya, Eskalasi Saya
- Commitment Ledger dengan hit rate + streak + weekly breakdown (3 sumber)
- Feature flag `clear-the-path` enable per unit
- Onboarding tour trigger pertama kali pakai feature
- Pilot metrics dashboard tersedia
- No regression Inbox notifications existing
- Mobile: triage panel = full-screen modal di mobile
- 4-state lengkap

---

## 12. SPRINT 5 — Loop Close: Auto-derive + Bridge + Plan→Do + Forecast

**Durasi**: 6–8 hari
**Risiko**: 🟢 Rendah-medium

### Files

**Modified**:
- `app/Services/ProgramService.php` (+~80 baris) — `computeAutoHealthStatus()`
- `app/Models/Program.php` (~10 baris)
- `resources/js/Pages/ProgramDetailView.tsx` (+30 baris) — dual health display
- `app/Http/Controllers/MeetingController.php` (+30 baris) — store enrich response
- `app/Http/Controllers/ProgramController.php` (~30 baris) — storeProgressLog accept fromMeetingId
- `resources/js/Pages/MeetingDetailPanel.tsx` (+30 baris) — tombol "Lanjutkan ke ProgressLog"
- `resources/js/Pages/MonthlyReportDetailView.tsx` (+50 baris) — auto-prefill kendala
- `app/Http/Controllers/PerformanceController.php` (+50 baris) — forecast calculation

**New**:
- `app/Console/Commands/ComputeProgramHealth.php` — scheduled job
- `database/migrations/{date}_add_auto_health_to_program.php`
- `resources/js/components/ForecastBadge.tsx`

### Scheduled Auto-Health (Fix N+1)

```php
// app/Console/Commands/ComputeProgramHealth.php
class ComputeProgramHealth extends Command {
    protected $signature = 'atlas:compute-health';
    public function handle() {
        Program::active()->chunk(50, function ($programs) {
            foreach ($programs as $p) {
                $auto = app(ProgramService::class)->computeAutoHealthStatus($p);
                $p->update([
                    'autoHealthStatus' => $auto,
                    'autoHealthComputedAt' => now()
                ]);
            }
        });
    }
}
```

Schedule di `app/Console/Kernel.php`: setiap **30 menit**.

Migration:
```php
Schema::table('Program', function ($table) {
    $table->string('autoHealthStatus')->nullable();
    $table->timestamp('autoHealthComputedAt')->nullable();
});
```

UI tampilkan timestamp terakhir compute supaya transparent.

### Plan→Do Handoff

Saat `ProgramController::activate` / `approve` (status berubah ke ACTIVE):

```php
$tasks = Task::whereHas('initiative.workstream',
    fn($q) => $q->where('programId', $program->id)
)->whereNotNull('assignedToId')->get();

foreach ($tasks->groupBy('assignedToId') as $userId => $userTasks) {
    $this->notificationService->create([
        'userId' => $userId,
        'type' => 'PROGRAM_TASKS_ASSIGNED',
        'message' => "Program {$program->name} aktif. {$userTasks->count()} tugas baru di pipeline Anda.",
        'source' => "program:{$program->id}",
        'requiresAction' => false,
        'priority' => 'LOW',
    ]);
}
```

User klik notif → masuk Focus, section "Hari Ini" sudah tampilkan tasks baru. Tidak perlu komponen baru.

### Linear Forecast (Honest Labeled)

```php
private function computeForecast(array $kpiItem, string $periode): array {
    $monthsElapsed = ...;
    $forecastEndYear = $kpiItem['realisasi'] * (12 / $monthsElapsed);
    $forecastStatus = $forecastEndYear < $kpiItem['target'] * 0.9 ? 'RED' : ...;
    return [
        'forecastValue' => $forecastEndYear,
        'forecastStatus' => $forecastStatus,
        'method' => 'linear-ytd',  // honest
    ];
}
```

UI:
```tsx
<ForecastBadge value={forecast.value} status={forecast.status}>
  <Tooltip>
    Estimasi linear berdasarkan capaian YTD. Tidak memperhitungkan musim/seasonality.
    Akan disempurnakan di Sprint 6.
  </Tooltip>
</ForecastBadge>
```

### Definition of Done
- Scheduled command jalan, autoHealthStatus terisi untuk semua active programs
- Program detail tampilkan dual health (self vs auto) + discrepancy badge
- Plan→Do notification firing saat program activate
- Monthly report draft auto-prefill kendala dari ProgressLog + Blockers + missed action
- Post-meeting tombol → ProgressLog dengan kendala prefilled
- KPI views forecast badge (linear, labeled honest)
- No regression flow existing

---

## 13. SPRINT 6 — Real KPI Integration *(DEFERRED)*

**Status**: Tidak dimulai sebelum sumber data confirmed

### Pre-requisite Decision Tree

| Skenario sumber data | Estimasi |
|---|---|
| Manual entry per periode (form admin) | ~5 hari |
| Import Excel template (mirip MonthlyReport) | ~7 hari |
| Sync dari APMS / sistem KPI BUMN | ~10–15+ hari |
| Hybrid (auto + manual override) | ~10 hari |

### Yang Akan Dibuat
- Integrasi `KpiDefinition` ke `PerformanceController` views
- Replace `getDummyKolegialKpi`, `getDummyDivisiKpi`, `getDummyIndividuKpi` dengan real query
- Hapus `<DataSourceBadge type="dummy">` di semua KPI views
- Migration data periode (kalau historical)

**Tidak masuk MVP**, dijadwal ulang berdasarkan kepastian sumber data.

---

## 14. Cross-Cutting Concerns

### Feature Flags

`config/features.php`:
```php
return [
    'clear-the-path' => env('FEATURE_CLEAR_THE_PATH', 'disabled'), // 'disabled' | 'DKM' | 'enabled'
    'commitment-ledger' => env('FEATURE_COMMITMENT_LEDGER', 'disabled'),
    'auto-health' => env('FEATURE_AUTO_HEALTH', 'enabled'),
    'kpi-forecast' => env('FEATURE_KPI_FORECAST', 'enabled'),
    'pica-realtime' => env('FEATURE_PICA_REALTIME', 'enabled'),
];
```

Frontend hook:
```ts
export function useFeatureFlag(flag: string): boolean {
  const { features } = usePage().props
  // 'enabled' = true, 'disabled' = false, 'DKM' = check user.unitDirektorat
}
```

### Per-Component DoD (Mandatory)

Setiap komponen baru wajib definisikan **4 state**:
- **Loading**: skeleton/spinner pattern
- **Empty**: copy ramah (Linear-style)
- **Error**: retry button + fallback message
- **Populated**: actual content

### Mobile DoD per Sprint

Manual test di Chrome devtools mobile preview sebelum mark sprint done.
- Sprint 2: DivisiView stack vertikal, InboxView Today usable
- Sprint 3: PICA grid → 1-kolom, inline edit → modal
- Sprint 4: Triage side-panel → full-screen modal di mobile

### Optimistic Update Pattern

Buat helper `useOptimisticMutation()` di Sprint 2 → re-use di Sprint 3 & 4.
Pola: temporary update local state → call API → rollback + toast on error.

### Notification System Single Source of Truth

Semua "pending action" mengalir ke `WorkspaceController::notifications`. Tidak ada parallel system. Inbox sections derive dari notif filter.

### Threshold Values Configurable

Semua angka dari `config/atlas-thresholds.php`. Tidak hardcoded.

### Rollback Strategy

| Sprint | Rollback |
|---|---|
| 0 | Revert OrgChainService, threshold config |
| 1 | Revert AppShell.tsx + routes/web.php |
| 2 | Hide DivisiView route, hapus section "Hari Ini" |
| 3 | Conditional `<PicaCompositePanel>` return null |
| 4 | Set `FEATURE_CLEAR_THE_PATH=disabled` |
| 5 | Hapus accessor autoHealthStatus, disable scheduled command |

Setiap PR mandatory dokumentasikan rollback step di description.

---

## 15. Pilot Strategy untuk Sprint 4

| Phase | Durasi | Action |
|---|---|---|
| Week -2 | Sebelum rilis | User guide + Loom walkthrough + onboarding tour tested |
| Week 0 | Rilis ke DKM | Feature flag enable, in-app announcement |
| Week 1–2 | Active monitoring | Daily check pilot metrics dashboard, office hours support |
| Week 3–4 | Mid-pilot review | Survey user satisfaction, fix friction points |
| Week 5–6 | Decision gate | Eval against success criteria → expand atau iterate |
| Week 7+ | Expand | Roll out ke direktorat lain dengan sponsor masing-masing |

### Success Criteria
- avg_time_to_disposition_days < 5
- min_hit_rate_aggregate > 60%
- min_user_satisfaction_score > 7
- min_active_users_pct > 70% DKM users

---

## 16. Outcome Final yang Diharapkan

### Untuk OFFICER
- Login → langsung lihat **Today view**: 3 task untuk hari ini, 1 commitment yang due
- Klik task → status update 2 detik
- Stuck di sesuatu → klik "Butuh Bantuan" → atasan dapat notif, disposition dalam 2–5 hari (visible aging)
- Akhir minggu → halaman "KPI Saya" tampilkan consistency 80%, streak 6 minggu
- Lapbul tinggal review yang sudah auto-prefill, edit, kirim

### Untuk KADIV
- Login → **badge counter di sidebar**: 2 program RED, 4 escalation menunggu komitmen Anda
- Klik → triage inbox seperti Linear: keyboard shortcut untuk disposition
- KPI Divisi → drill ke sub-divisi → drill ke individu — semua dalam satu flow
- Rapat koordinasi → buka MeetingDetail → agenda PICA sudah prefilled, continuity dari rapat lalu visible

### Untuk BOD
- Home → executive scoreboard auto-derived
- Drill apapun dengan satu klik
- Lihat aging escalation cross-direktorat
- Tidak perlu menunggu lapbul untuk tahu mana yang merah

**Tidak ada modal block, tidak ada form panjang, tidak ada compliance shaming.** Semuanya: lihat → klik → selesai, dengan visual decay subtle untuk yang stuck.

---

## 17. Yang Sengaja TIDAK Dimasukkan

- Tidak menambah model `MeetingAgendaItem` baru — tertangani via Blocker composite
- Tidak membuat halaman `/cadence` terpisah — cadence = ritme yang dibantu Phase 4 bridge
- Tidak refactor hierarchy Programs/Workstreams/Initiatives
- Tidak mengganti Blocker — sudah punya rootCause/resolution
- Tidak menyentuh approval workflow — sudah jalan
- Tidak merombak Goals/KPI module
- Tidak ada hard block / forcing function — pakai smart defaults + visibility
- Tidak ada leaderboard publik berbasis miss — anti-shame design

---

## 18. Open Items / TBD

- Sprint 6 sumber data KPI (pending decision Pak Iswahyudi)
- Realtime collab fallback strategy kalau RealtimeController tidak fit (Sprint 3)
- Cross-direktorat escalation policy (default closed, perlu eksplisit decide kapan dibuka)
- Decline appeal flow (tunda, evaluasi pasca-pilot)
- Forecast seasonal adjustment (tunda sampai data riil tersedia di Sprint 6)

---

## 19. Skor Self-Assessment

**9/10 realistis.** Tidak 10/10 karena:
- Sumber data KPI (Sprint 6) masih unknown — risiko strategis tidak bisa di-engineer hilang
- Cultural adoption (apakah atasan benar-benar disposition cepat) tidak bisa dijamin oleh kode
- Realtime collab "kalau memungkinkan" — chance jadi optimistic-only kalau infra tidak fit

Semua **gap struktural yang bisa di-engineer sudah ditangani**:
- ✅ Org chain prerequisite (Sprint 0)
- ✅ N+1 risk (scheduled job di Sprint 5)
- ✅ Notification collision (integrasi eksplisit Sprint 4)
- ✅ Plan→Do handoff (eksplisit Sprint 5)
- ✅ Hit rate 3 sources (Sprint 4)
- ✅ Forecast labeled honest (Sprint 5)
- ✅ Threshold workshop (Sprint 0)
- ✅ Component library audit (Sprint 0)
- ✅ Mobile + 4-state DoD per komponen
- ✅ Pilot success metrics + change management (Sprint 4)
- ✅ Existing module integration audit (Sprint 4 prefix)
- ✅ Realtime via existing infra (Sprint 3, dengan fallback)
- ✅ Augment-don't-replace untuk modul existing (Channels/Schedule/Settings/Presence/Profile dst tidak disentuh)

---

## 20. Next Steps

1. Konfirmasi dokumen ini sebagai single source of truth
2. Mulai **Sprint 0** — alokasikan 1–2 hari kerja untuk Org Chain Service + Component Audit + Threshold workshop
3. Setelah Sprint 0, lanjut Sprint 1 (sidebar PDCA) — quick visible win
4. Review per sprint sebelum mulai sprint berikutnya
5. Pilot DKM dimulai setelah Sprint 4 selesai

---

*Dokumen ini akan di-update saat ada keputusan baru atau pivot. Versi history dipertahankan via git.*
