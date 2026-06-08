# STATUS PENGEMBANGAN ATLAS

> **Snapshot**: 2026-05-14
> **Repository**: `atlas-fullstack` (Laravel 11 + Inertia + React 19)
> **Branch**: `main`
> **Live**: https://atlas-ptpn.up.railway.app (Railway, since 2026-05-09)
> **Sponsor**: M. Iswahyudi (Direktur Keuangan & Manajemen Risiko PTPN III)
> **Tujuan dokumen**: handover/diskusi lanjutan di Claude Chat — ringkas namun lengkap untuk pengambilan keputusan teknis & produk.

---

## 1. Executive Summary

**ATLAS** = *Advanced Transformation & Leadership Alignment System* — platform manajemen program kerja PTPN III yang dirancang sebagai **siklus PDCA** (Plan-Do-Check-Act), bukan katalog modul.

### Status tinggi-level
| Area | Status |
|---|---|
| **MVP Sprint 0–5** | ✅ Selesai 2026-05-08 (sesuai `ATLAS_PDCA_IMPLEMENTATION_PLAN.md`) |
| **Sprint 6 — Real KPI Integration** | ⏸️ Deferred (sumber data belum confirmed) |
| **Production deploy** | ✅ Live di Railway dengan FrankenPHP + PostgreSQL |
| **Pilot DKM Clear the Path** | ✅ Active (`FEATURE_CLEAR_THE_PATH=DKM`) |
| **Pengguna terdaftar** | 41 user (migrasi dari local) |
| **Test suite** | 110/111 passing (1 pre-existing KPI decimal serialization) |
| **Database migrations** | 79 file |
| **Tabel PostgreSQL** | 53+ tabel di schema `ptpn_kmr_app` |

### Konteks historis
- **30 Mar – 20 Apr 2026**: Blueprint arsitektur (stack lama: Express + React SPA + Prisma)
- **21 Apr 2026**: Initial commit baseline (194 file, ~100k LoC)
- **22 Apr 2026**: Keputusan migrasi ke Laravel + Inertia (sesuai standar DTDI PTPN, satu pola dengan ERIN)
- **23 Apr 2026**: Migrasi penuh — schema PostgreSQL dipertahankan (camelCase Prisma), 53 tabel, controller Laravel + Inertia
- **24 Apr 2026**: Feedback Pak Dirkeu → 5 phase implementasi (homepage eksekutif, field strategis, vocabulary On Track/At Risk/Terlambat)
- **7–8 Mei 2026**: Sprint 0–5 PDCA MVP eksekusi (~10 hari kalender)
- **9 Mei 2026**: Go-live Railway production
- **10–14 Mei 2026**: Polish UX, Pattern A workspace design, Daily PIC Workspace, notification audit, SSE real-time tuning

---

## 2. Arsitektur Teknis

### Stack
| Layer | Teknologi |
|---|---|
| **Backend** | Laravel 11 + PHP 8.3 |
| **Frontend** | React 19 + TypeScript via Inertia.js (SSR-style monolith, no REST API layer) |
| **ORM** | Eloquent (mapped ke schema Prisma legacy — camelCase tabel) |
| **DB** | PostgreSQL 14+ (schema `ptpn_kmr_app`) |
| **Realtime** | SSE via `RealtimeController` + `BroadcastEvent` table + polling fallback (400ms) |
| **Auth** | Laravel session + CSRF (bukan Bearer token) |
| **Routing** | Laravel routes + Inertia `<Link>` |
| **Background jobs** | Laravel Scheduler (`php artisan schedule:work`) |
| **Build** | Vite 8 + npm 22.x |
| **Web server (prod)** | **FrankenPHP** (single binary, native SSE, no per-request worker exhaustion) |
| **Deployment** | Railway via Nixpacks |
| **Sessions** | Database driver (file sessions hilang di container ephemeral) |
| **UI utility** | Radix UI, dnd-kit, Recharts, Shepherd.js (onboarding tour), Mermaid, Lucide |

### Service Layer
`app/Services/`:
- `OrgChainService` — resolve atasan langsung, escalation chain, cross-direktorat policy (Sprint 0; 19 unit test)
- `FeatureFlagService` — DKM-scoped feature gating (share via Inertia `features` prop)
- `ProgramHealthService` — auto-derive health (workstream + KPI + task overdue + blockers)
- `ProgramSnapshotService` — snapshot histori health untuk timeline
- `ProgramService` — business logic Plan→Do handoff
- `TaskService`, `AssignmentService`, `AssignmentAuthService`, `ApprovalChainService`
- `BroadcastService` — realtime fan-out (`toUsers`, `toChannel`, `blocker`)
- `ScorecardSummaryService` — homepage exec KPI rollup
- `SettingService` — dynamic threshold UI (Sprint 4 post-MVP)

### Background Jobs (`routes/console.php`)
| Command | Schedule | Tujuan |
|---|---|---|
| `atlas:check-reminders` | Setiap menit | Reminder dispatcher |
| `atlas:ghost-cleanup` | Tiap 5 menit | Cleanup zombie SSE connections |
| `atlas:cleanup-broadcast-events` | Setiap menit | Trim BroadcastEvent table |
| `atlas:compute-health` | Setiap 30 menit | Auto-derive `Program.autoHealthStatus` (Sprint 5) |

### Konfigurasi penting
- `config/atlas-thresholds.php` — semua threshold (aging, carryover, stale, pilot DKM criteria) configurable via `.env`
- `config/features.php` — feature flags
- `nixpacks.toml` — build/deploy contract Railway
- Schedule deploy: `php artisan migrate --force && config:cache && route:cache && view:cache && (schedule:work &) && exec frankenphp php-server -r public/`

---

## 3. Sidebar PDCA & Per-Role Visibility

Sidebar **mengikuti siklus PDCA**, bukan taksonomi fitur. Single source of truth: `resources/js/layouts/AppShell.tsx` (palette `NI`).

```
TODAY
├─ Home              Ringkasan eksekutif organisasi
└─ Focus             Inbox notifikasi + "Hari Ini" + Clear the Path saya

PERENCANAAN (Plan)
└─ Programs          Portfolio + approval workflow

EKSEKUSI (Do)
├─ Execution         Workboard delivery (Daily PIC Workspace)
└─ Penugasan         Tugas harian di luar Program

PERFORMANCE (Check)
├─ Scorecard         Ranking strategic cross-direktorat
├─ KPI Direktorat    (= Kolegial)
├─ KPI Divisi        (NEW Sprint 2)
└─ KPI Saya          (NEW Sprint 2 — shortcut /performance/me)

TINDAK LANJUT (Act)
└─ Rapat Koordinasi  (Schedule/Meeting promoted)

KOMUNIKASI
└─ Channels          Slack-style messaging

AKUN
├─ Presence
├─ Profile
└─ Settings

ADMIN (admin/superadmin)
├─ Companies / Positions / Users / Roles
├─ Pilot Metrics     (DKM dashboard)
└─ Thresholds        (SUPERADMIN only — live tuning)
```

**Catatan**:
- Grup **Pelaporan** (Laporan Bulanan, Laporan Risiko, Analytics) **disembunyikan dari sidebar** sejak 2026-05-10 atas permintaan user. Route tetap accessible via deep link; jangan munculkan kembali tanpa permintaan eksplisit.
- `/dashboard` masih dipakai sebagai JSON API oleh workspace context — hanya hilang dari sidebar nav, tidak di-redirect.

### Per-Role Visibility Matrix
| Item | BOD | KADIV | KASUBDIV | OFFICER/ASISTEN | ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|
| Home | ✓ | ✓ | ✓ | — | ✓ |
| Programs | ✓ | ✓ | ✓ (own dir) | ✓ (own) | ✓ |
| Execution + Penugasan | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scorecard + KPI Direktorat | ✓ | ✓ | — | — | ✓ |
| KPI Divisi | ✓ | ✓ | ✓ | read-only | ✓ |
| KPI Saya | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rapat Koordinasi | ✓ | ✓ | ✓ | ✓ (peserta) | ✓ |
| Admin section | — | — | — | — | ✓ |

---

## 4. Status Modul (per Fase PDCA)

### 4.1 PLAN — Perencanaan

#### Programs (`/programs` → `ProgramsView.tsx` 103 KB)
- ✅ **Lifecycle**: Perencanaan → Eksekusi → Selesai (guard backend di semua mutation)
- ✅ **Approval workflow** dengan `ProgramApprovalLog` (submit/activate/approve/reject/archive/restore)
- ✅ **5 tab Pattern A** (2026-05-11 polish): Ringkasan, Struktur, Jadwal Mingguan, Eksekusi, Health
- ✅ **Tab Jadwal Mingguan**: Execution Grid dengan toggle `actualWeeks` per task (auto-sync dengan struktur)
- ✅ **Tab Struktur**: Workstream → Phase → Task hierarchy, Output/Deliverable eksplisit per task (Gap #1 PPT)
- ✅ **Tab Eksekusi**: Inline status update, drag-and-drop
- ✅ **Field strategis** (post Pak Dirkeu feedback): tema, sumber dana, dampak, indikator keberhasilan
- ✅ **ProgressLog**: kendala, dukungan dibutuhkan, **Corrective Action + Next Step** (Gap #3 PPT, 2026-05-11)
- ✅ **KPI links** + KPI internal per program
- ✅ **Health score** dual (self-reported + auto-derived) dengan discrepancy badge
- ✅ **Archive/restore** untuk program completed
- ✅ **Vocabulary**: "On Track / At Risk / Terlambat" (per Pak Dirkeu)
- ✅ **EscalationButton** di-mount di ProgressLog section
- ✅ **ExecutionGridController** dengan export XLSX (ExcelJS)
- ⚠️ **CSS specificity issue**: ada hipotesis pertama saat data benar tapi UI kosong (lihat `feedback_visual_smoke_test.md`)

#### Workstream / Phase / Task / SubTask
- ✅ Naming: `Task` model → tabel `WorkItem` (FK `initiativeId` → `Initiative.id` legacy Prisma). Lihat `NAMING_CONVENTION.md`.
- ✅ `TaskDetailView` (115 KB) — full panel detail + Blocker section + SubTask list + status log
- ✅ `Blocker` dengan `rootCause` + `resolution` (= countermeasure) + status (`OPEN`, `RESOLVED`)
- ✅ `WorkItemStatusLog` audit trail untuk semua transition

#### Goals & KPI (`/goals` → `GoalsView.tsx`)
- ✅ CRUD KPI Definition + KPI Value periodik
- ✅ KPI internal per program (link/inline)
- ⏸️ Real KPI integration (Sprint 6) **deferred** — masih dummy/seed data

#### Roadmap (`/roadmap`)
- ✅ Visual program timeline (Gantt-style)

---

### 4.2 DO — Eksekusi

#### Execution / Workboard (`/execution` → `WorkboardView.tsx` 47 KB)
- ✅ **Refactored 2026-05-10** menjadi "Daily PIC Workspace":
  1. Smart filter + daily summary + empty state
  2. WIP limit per user (configurable)
  3. "Menunggu Aksi Anda" panel
  4. Drag prompt modals untuk konteks transisi (Plan→Do, Do→Done)
- ✅ Audit log (`WorkItemStatusLog`) untuk semua perubahan status

#### Penugasan / Assignment (`/penugasan` → `AssignmentsView.tsx` 72 KB)
- ✅ Tugas ad-hoc di luar Program (1-1 user-to-user)
- ✅ Preview chain approval
- ✅ Transition workflow (status flow)
- ✅ Evidence: upload file + link/note attachment, download
- ✅ Approval & review actions (`AssignmentApprovalEntry`, `AssignmentReviewAction`)

---

### 4.3 CHECK — Performance & Pelaporan

#### Performance (3-tier hierarchy)
Drill-down: **Scorecard → KPI Direktorat → KPI Divisi → KPI Individu/Saya**

| Halaman | File | Status |
|---|---|---|
| **Scorecard** | `Performance/ScorecardView.tsx` | ✅ Cell direktorat & divisi clickable, drill-down koheren |
| **KPI Direktorat (Kolegial)** | `Performance/KolegialView.tsx` + `KolegialDetailView.tsx` | ✅ Detail per direktorat + ForecastBadge linear |
| **KPI Divisi** | `Performance/DivisiView.tsx` | ✅ NEW Sprint 2 — drill default ke divisi user |
| **KPI Individu** | `Performance/IndividuView.tsx` + `IndividuDetailView.tsx` | ✅ Browse + detail + Commitment Ledger section |
| **KPI Saya** | `/performance/me` → `IndividuDetailView` self | ✅ Shortcut Sprint 2 |

- ✅ **ForecastBadge** linear (honest labeled — disclaimer "akan disempurnakan Sprint 6 dengan seasonal adjustment")
- ✅ **Commitment Ledger** 3-source aggregate (Task + MeetingActionItem + Assignment) dengan hit rate + streak
- ✅ **Data sumber dummy** dengan `<DataSourceBadge type="dummy">` visible — hilang di Sprint 6
- ✅ Phase 2 (pre-Sprint): KPI scorecard DB integration + Home polish milestone
- ✅ Phase 3: role-aware scope (DIRUT vs Direktur fungsional)

#### Home (`/` → `HomeView.tsx` 52 KB)
- ✅ Two-column dashboard: KPI Achievement (kiri) + Leading Program (kanan)
- ✅ Hero priority + narrative summary (Home V2)
- ✅ ScorecardSummary dynamic periode (dari current month)
- ✅ "Program Ketat Deadline" dashboard (Gap #4 PPT, 2026-05-11)
- ✅ Rollup status program per Divisi (Gap #5 PPT, 2026-05-11)
- ✅ Pattern A workspace design (2026-05-11 polish)
- ✅ Realtime polish (SSE updates)

#### Pelaporan (route accessible, hidden from sidebar)
- **Laporan Bulanan** (`/laporan-bulanan` → `MonthlyReportsView.tsx` + `MonthlyReportDetailView.tsx` 57 KB)
  - ✅ Auto-prefill kendala saat draft baru (dari ProgressLog + Blockers + missed action)
  - ✅ Upload, submit, approve workflow
  - ✅ Variant DIMR (`MonthlyReportDetailDIMR.tsx` 54 KB)
- **Laporan Risiko** (`/laporan-risiko` → `RiskReportsView.tsx`)
  - ✅ KRI, Risk Snapshot, Strategy, Mitigation, Loss Event, Governance, Narrative
  - ✅ YTD aggregation + submit/approve
- **Analytics** (`/reports` → `ReportsView.tsx`) — chart/leaderboard rollup

#### Focus / Inbox (`/fokus` → `InboxView.tsx` 56 KB)
- ✅ Section "**Hari Ini**" collapsible (3 source aggregate: Task + ActionItem + Assignment due today)
- ✅ Section "**Permintaan Clear the Path Saya**" (atasan view)
- ✅ Section "**Eskalasi yang Saya Ajukan**" (requester view)
- ✅ Triage panel side-panel + keyboard shortcut C/R/D
- ✅ Onboarding tour Shepherd.js (4 tours wired)

---

### 4.4 ACT — Tindak Lanjut

#### Rapat Koordinasi (`/jadwal` → `ScheduleView.tsx` 108 KB)
- ✅ Kalender + meeting list (jangan disentuh — modul mature)
- ✅ Meeting types: `RAPAT_KOORDINASI`, dst
- ✅ RSVP + attendees + Decisions + Action Items
- ✅ Continuity tracking: completion rate dari rapat sebelumnya
- ✅ `MeetingActionItem.linkedWorkItemId` — koneksi Action → Task

#### PICA Composite (Sprint 3)
- ✅ `PicaCompositePanel.tsx` di-mount di `MeetingDetailPanel` (collapsible, conditional)
- ✅ 4-cell grid: Problem (Blocker) → Issue → Countermeasure (resolution) → Action (linkedWorkItem)
- ✅ Inline countermeasure editor dengan **optimistic locking** (`Blocker.updatedAt`)
- ✅ Realtime broadcast via SSE: `pica:countermeasure-updated`
- ✅ Endpoint `/meetings/{id}/pica-context`

#### Clear the Path (Sprint 4 — Pilot DKM)
- ✅ **EscalationRequest** schema (polymorphic source: `BLOCKER|PROGRESS_LOG|ACTION_ITEM|AD_HOC`)
- ✅ **7 endpoint** `EscalationController`: index, store, show, commit, reroute, decline, resolve
- ✅ **Status flow**: `REQUESTED → COMMITTED → IN_PROGRESS → CLEARED` (branches: `DECLINED`, `REROUTED`)
- ✅ **Auto-resolve `escalatedToId`** via `OrgChainService`
- ✅ **EscalationButton** di TaskDetail Blocker section + ProgramDetail ProgressLog section
- ✅ **EscalationTriagePanel** di Focus dengan keyboard shortcuts C/R/D
- ✅ **Notification integration**: `CLEAR_PATH_REQUESTED|COMMITTED|CLEARED`
- ✅ **Aging indicator**: hijau/kuning (3d)/oranye (7d)/merah (14d) — configurable via `config/atlas-thresholds.php`
- ✅ **Feature flag** `clear-the-path=DKM` (pilot scope per direktorat)

---

### 4.5 KOMUNIKASI

#### Channels (`/channels` → `ChannelsView.tsx` 184 KB)
- ✅ Slack-style messaging (jangan disentuh — module terbesar, mature)
- ✅ Channel + DM (lowercase-hyphen naming since 2026-04-27)
- ✅ Member management + mute + star + read state
- ✅ Threading + reactions + pin
- ✅ Saved messages
- ✅ Unfurl link preview
- ✅ Typing indicator (real-time, clear saat sender's message arrives)
- ✅ Pattern A workspace design (2026-05-11 redesign)
- ✅ Onboarding: panduan-channels auto-enroll + reading-order scroll
- ✅ Realtime: SSE 400ms poll cycle for sub-second typing delivery

#### Comments (polymorphic, `entityType/entityId/comments`)
- ✅ Thread, reactions, pin — di-attach ke semua entity (Program, Task, Meeting, dst)

---

### 4.6 AKUN

| Halaman | File | Status |
|---|---|---|
| **Presence** | `PresenceView.tsx` 42 KB | ✅ Live team availability |
| **Profile** | `ProfileView.tsx` 24 KB | ✅ Account + position hierarchy |
| **Settings** | `SettingsView.tsx` 30 KB | ✅ Workspace preferences |
| **Playbook** | `PlaybookView.tsx` | ✅ Internal SOP reference |

Pattern A roll-out 2026-05-10 untuk Akun pages (Profile, Presence, Settings) + Home polish.

---

### 4.7 ADMIN

| Halaman | File | Status |
|---|---|---|
| **Companies (Org)** | `AdminOrgsView.tsx` 28 KB | ✅ Entitas + hierarki org |
| **Positions** | `AdminPositionsView.tsx` 30 KB | ✅ Manajemen jabatan |
| **Users** | `AdminUsersView.tsx` 28 KB | ✅ Manajemen pengguna |
| **Roles** | `AdminRolesView.tsx` 10 KB | ✅ Peran + permission matrix |
| **Pilot Metrics** | `AdminPilotMetricsView.tsx` 7 KB | ✅ DKM dashboard dengan auto-evaluate vs criteria |
| **Thresholds** | `AdminThresholdsView.tsx` 7 KB | ✅ Live tuning (SUPERADMIN only, tanpa restart) |

---

## 5. Database Schema Highlight

53+ tabel di schema `ptpn_kmr_app` (camelCase Prisma legacy preserved). Highlight:

### Org & Akses
`User` (+ `toursCompleted` JSON Sprint 4), `Position`, `PositionHistory`, `OrganizationalUnit`, `Directorate`, `UserStatus`, `UserSession`

### Plan
`Program` (+ `autoHealthStatus`, `autoHealthComputedAt` Sprint 5, + field strategis Apr 2026), `ProgramApprovalLog`, `ProgramProgressLog` (+ `correctiveAction`, `nextStep` 2026-05-11), `ProgramHealthSnapshot`, `ProgramKpiLink`, `Workstream`, `Phase`, `Task` (= `WorkItem`), `SubTask`, `EntityPic`

### Do
`Assignment`, `AssignmentApprovalEntry`, `AssignmentAttachment`, `AssignmentReviewAction`, `WorkItemStatusLog` (Sprint pre-MVP audit), `Blocker`

### Check
`KpiDefinition`, `KpiValue`, `DirektoratScorecard`, `DivisiScorecard` (Sprint 5), `MonthlyReport`, `MonthlyReportApproval`, `MonthlyReportFile`, `MonthlyReportMetric`, `RiskMonthlyReport` (+ 6 child tables: Strategy, Mitigation, KRI, Snapshot, Loss Event, Governance, Narrative), `RiskReportApproval`

### Act
`Meeting`, `MeetingAttendee`, `MeetingDecision`, `MeetingActionItem`, **`EscalationRequest`** (Sprint 4, polymorphic)

### Komunikasi
`Channel`, `ChannelMember`, `ChannelMessage`, `ChannelMessageHidden`, `Comment`, `Notification`, `MessageReminder`, `BroadcastEvent`, `SavedMessage`

### System
`SystemSetting` (dynamic threshold UI Sprint 4)

---

## 6. Deliverable Sprint 0–5 (MVP)

| Sprint | Selesai | Deliverable Utama | Tests |
|---|---|---|---|
| **0** | 2026-05-07 | OrgChainService (19 tests), Component audit, Threshold workshop config, Notification types registered | 19/19 ✓ |
| **1** | 2026-05-07 | Sidebar PDCA-aligned, Reports bug fixed, `/performance/divisi` & `/performance/me` routes, dashboard di-hide dari nav | 52/52 ✓ |
| **2** | 2026-05-07 | DivisiView (new), Scorecard clickable cells, KPI Saya CTA, `/inbox/today` endpoint, CommitmentTodaySection, CollapsibleSection + DataSourceBadge primitives | 52/52 ✓ |
| **3** | 2026-05-07 | picaContext endpoint, BlockerController.updateResolution dengan optimistic locking, PicaCompositePanel + Continuity + 4-cell grid + inline countermeasure editor, realtime broadcast bridge | 52/52 ✓ |
| **4** | 2026-05-08 | EscalationRequest schema + model + controller (7 endpoints), FeatureFlagService (DKM scoping), EscalationButton/Modal/TriagePanel + side panel + keyboard shortcuts C/R/D, InboxView 2 sections, Commitment Ledger (3-source aggregate) | 52/52 ✓ |
| **5** | 2026-05-08 | Auto-health extended signals (workstream + KPI + task overdue + blockers), `atlas:compute-health` scheduled, Plan→Do handoff notifications, Check→Act sessionStorage bridge, MonthlyReport silent autoprefill, ForecastBadge linear | 110/111 ✓ |

### Komponen primitive baru
`CollapsibleSection`, `DataSourceBadge`, `SidePanel`, `AgingIndicator`, `ForecastBadge`, `EscalationButton`, `EscalationTriagePanel`, `PicaCompositePanel`

### Modul existing yang diextend (additive, zero rebuild)
AppShell, InboxView, ProgramDetailView, MeetingDetailPanel, MonthlyReportDetailView, IndividuView/Detail, ScorecardView, ProgramHealthService, ProgramController, BlockerController, MeetingController

---

## 7. Post-MVP Activities (8–14 Mei 2026)

| Tanggal | Deliverable | Komit |
|---|---|---|
| **2026-05-08** | Onboarding tour 4 wired, Pilot Metrics dashboard, Threshold dynamic UI, ForecastBadge extension | — |
| **2026-05-09** | **Railway production go-live** (Nixpacks build) | `dbdf859`, `1d73122`, `53dd285` |
| **2026-05-09** | HomeView V2: hero priority + narrative summary | `7c53b87`, `3abb25e` |
| **2026-05-10** | Phase 3: role-aware scope (DIRUT vs Direktur fungsional) | `6099dd3` |
| **2026-05-10** | BCMS golden program seed + org SoT seeders | `a25e572` |
| **2026-05-10** | Audit log untuk WorkItem status transitions | `745d7f7` |
| **2026-05-10** | **Daily PIC Workspace** (4 parts): smart filter, WIP limit, "Menunggu Aksi Anda" panel, drag prompt modals | `a7091a7` → `6857750` |
| **2026-05-10** | **Pattern A workspace design** (Channels redesign + global shell polish) | `6be65cc` |
| **2026-05-11** | **Gap #1 PPT**: Output/Deliverable eksplisit per task | `0a8d528` |
| **2026-05-11** | **Gap #3 PPT**: Corrective Action + Next Step di ProgramProgressLog | `76fa2c2` |
| **2026-05-11** | **Gap #4 PPT**: Dashboard "Program Ketat Deadline" di Home | `5f61a1a` |
| **2026-05-11** | **Gap #5 PPT**: Rollup status program per Divisi di Home | `7427d3e` |
| **2026-05-11** | Audit tuntas (MEDIUM/LOW issues #4, #6, #7, #8, #9, #11) | `a812f90` |
| **2026-05-11** | Pattern A roll-out: Akun pages + Home polish | `e2d75fa` |
| **2026-05-11** | Onboarding: panduan-channels auto-enroll | `2535b03` |
| **2026-05-11** | Sessions: default driver `database` (untuk container ephemeral) | `9b994c0` |
| **2026-05-11** | Programs polish: Pattern A consistency across all 5 tabs | `baa150a` |
| **2026-05-12** | DM fix | `cb10105` |
| **2026-05-12** | Fix ProgramsView crash (orphan task) | `2034b70` |
| **2026-05-12** | **Realtime overhaul**: polling fallback + faster polling + SSE fixes | `73c9412` → `afa1540` → `e3792b6` → `f52aa4c` |
| **2026-05-12** | **Switch server to FrankenPHP** (native SSE) | `9137182` |
| **2026-05-13** | Deployment doc untuk handover | `972bc5d` |
| **2026-05-13** | Notification bell: full audit pass | `83d3374` |
| **2026-05-13** | SSE: 400ms poll cycle for sub-second typing delivery | `27796ad` |
| **2026-05-13** | Run Laravel scheduler in production | `222c344` |

---

## 8. Deferred / Belum Selesai

### Sprint 6 — Real KPI Integration (DEFERRED)
- **Blocker**: sumber data KPI riil belum confirmed dari stakeholder
- **Scope ketika resumed**:
  - Replace `DataSourceBadge type="dummy"` dengan data live
  - Integrasi `KpiDefinition` aktual menggantikan seed data
  - Forecast seasonal adjustment (pair dengan data riil)
- **Estimasi**: 5–15+ hari

### Yang belum di-touch (intentional)
- ❌ Bot/AI integration
- ❌ Mobile native app (web responsive ada, native belum)
- ❌ External SSO (Laravel session-based saja)
- ❌ Queue worker (`QUEUE_CONNECTION=sync` di prod)
- ❌ Redis cache (`CACHE_STORE=file`)
- ❌ Email notification (`MAIL_MAILER=log`)

### Halaman accessible tapi hidden dari sidebar
- `/laporan-bulanan`, `/laporan-risiko`, `/reports` — disembunyikan 2026-05-10, **jangan munculkan lagi** tanpa permintaan eksplisit
- `/dashboard` — masih dipakai sebagai JSON API
- `/design-system` — internal preview foundation primitives

---

## 9. Konvensi & Pakem Penting

### Engineering discipline (dari `CLAUDE.md`)
1. **Augment, don't replace** — modul existing yang sudah mature (ChannelsView, ScheduleView, dst) tidak boleh disentuh; tambahkan komponen embeddable atau halaman baru lengkap
2. **Threshold values dari config**, jangan hardcode
3. **Notification = Notification table + BroadcastService::toUsers** (selalu pasangan)
4. **Feature flag setiap fitur eksperimental** — `useFeatureFlag` di FE, `FeatureFlagService::isEnabled` di BE
5. **Smart defaults > hard blocks** — auto-prefill, soft visibility, anti-bureaucracy
6. **Page layout = full-bleed** — halaman primer WAJIB stretch lebar workspace (no `max-width` fixed + `margin: 0 auto`). Pakai canonical `.page-shell` + `.page-shell__inner`.

### Filosofi UX (dari `ATLAS_PDCA_IMPLEMENTATION_PLAN.md`)
- *Make the right thing easy, the wrong thing visible — don't block.*
- 5 aturan: auto-derive, soft visibility, smart-default + 1-click override, friction bertahap, bahasa peer (bukan bureaucratic)
- 3 prinsip: Satu Inbox, Signal di tempatnya (bukan banner), Auto-surface relevan
- Vocabulary: "On Track / At Risk / Terlambat" (Pak Dirkeu standard)

### Naming (dari `NAMING_CONVENTION.md`)
- Model `Task` map ke tabel `WorkItem`, FK `initiativeId` → `Initiative.id` (= Workstream legacy)
- `Task` uses `assignedTo` (NOT `assignedToId`)
- `MeetingActionItem` uses `assignedToId`
- `Assignment` uses `assigneeId`

### Pattern A workspace design (since 2026-05-10)
- Bahasa visual final: workspace **1 card** + inner content **flat** dengan hairlines (Linear/Notion style)
- Awal roll-out: Channels → expand ke semua halaman primer (Programs, Home, Akun pages)

---

## 10. Pilot DKM Activation Checklist

```bash
# .env
FEATURE_CLEAR_THE_PATH=DKM
```

1. Verify users di direktorat DKM punya `directorateId='DKM'`
2. Run `php artisan atlas:compute-health` sekali manual untuk seed timestamp
3. Pastikan scheduler aktif: `php artisan schedule:run` di cron (atau `schedule:work` di FrankenPHP)
4. Communicate ke pilot users: "Klik tombol 'Butuh Dukungan Atasan' di Blocker / ProgressLog kalau stuck"

### Pilot Success Criteria (configurable di `config/atlas-thresholds.php`)
| Metrik | Target |
|---|---|
| Avg time to disposition | < 5 hari |
| Min hit rate aggregate | > 60% |
| Min user satisfaction (NPS) | ≥ 7 (1–10) |
| Min active users | > 70% dari DKM users |
| Evaluation period | 6 minggu |

Dashboard: `/admin/pilot-metrics` (admin-only, auto-evaluate vs criteria)

---

## 11. Production Operations

### Stack production
- **Host**: Railway (atlas-ptpn.up.railway.app)
- **Build**: Nixpacks (`nixpacks.toml`)
- **Web server**: **FrankenPHP** (binary di `/app/bin/frankenphp`)
- **PHP**: 8.3 (no ext-gd → bypass via composer flag)
- **Node**: 22.x (build only, not runtime)
- **DB**: PostgreSQL (Railway-managed)
- **Sessions**: `SESSION_DRIVER=database`
- **Realtime**: SSE via FrankenPHP (native goroutine, no per-request worker exhaustion) + polling fallback
- **Scheduler**: `schedule:work` di background process

### Health endpoints (manual check)
- `GET /` — Home (login required)
- `GET /realtime/stream` — SSE long-lived
- `GET /realtime/poll` — Polling fallback
- `GET /admin/pilot-metrics/api` — Pilot dashboard JSON

### Known operational concerns
- **Container ephemeral**: scheduler restart bareng container saat Railway redeploy → file sessions tidak boleh
- **`ext-gd` not available** di Nixpacks build → image upload pakai Imagick atau native PHP
- **Asset URLs**: harus mengikuti `APP_URL` (HTTPS di prod) — sudah fixed di `82ab06d`
- **CSS specificity**: hipotesis pertama saat UI kosong padahal data benar (lihat memory `feedback_visual_smoke_test`)

---

## 12. Dokumen Reference

| Dokumen | Isi |
|---|---|
| `CLAUDE.md` | Project context untuk Claude Code |
| `ATLAS_PDCA_IMPLEMENTATION_PLAN.md` (41 KB) | Sprint 0–6 plan + execution log + filosofi PDCA |
| `ATLAS_PLAN.md` (24 KB) | Phase 1 critical bugs (sebagian besar selesai) |
| `MIGRATION_RECAP.md` (24 KB) | Recap migrasi Express → Laravel |
| `NAMING_CONVENTION.md` | Mapping Prisma legacy → Laravel naming |
| `docs/ATLAS_ARCHITECTURE.md` | Arsitektur sistem (pre-existing) |
| `docs/ATLAS_PLAYBOOK.md` | Playbook operasional |
| `docs/DEPLOYMENT.md` | Deploy guide untuk handover TI PTPN |
| `docs/sprint0-component-audit.md` | UI primitive inventory |
| `docs/sprint0-threshold-workshop.md` | Workshop threshold dengan stakeholder |
| `docs/user-guide-pilot-dkm.md` | User guide DKM pilot Clear the Path |
| `docs/Laporan_Progres_Pengembangan_ATLAS_30Mar-23Apr2026.md` | Formal progress report periode early-stage |
| `docs/architecture-org-users-roles.md` | Org/users/roles detail |
| `docs/regulations/` | Folder regulasi PTPN reference |
| `docs/KPI/`, `docs/Struktur Organisasi/`, `docs/Dokumen LM/` | Source documents stakeholder |

---

## 13. Topik Diskusi Lanjutan (Suggested)

Untuk diskusi di Claude Chat, beberapa topik yang masih terbuka:

1. **Sprint 6 — Real KPI Integration**: Apa sumber data KPI riil? APMS? Excel feed? Manual upload? Strategi migrasi dari dummy ke live tanpa breaking views.
2. **Mobile strategy**: Web responsive existing (768px breakpoint) cukup, atau perlu native (Capacitor/React Native)?
3. **Email/WhatsApp notification**: Saat ini `MAIL_MAILER=log`, semua notif in-app saja. Apa kebutuhan eksternal?
4. **Scale beyond DKM**: Strategy ekspansi pilot Clear the Path → direktorat lain. Criteria kapan flag dari `DKM` → `enabled`.
5. **Performance optimization**: ChannelsView 184 KB, ProgramDetailView 175 KB, TaskDetailView 115 KB — code-splitting strategy?
6. **Queue worker production**: Saat ini `QUEUE_CONNECTION=sync` — kapan butuh async queue (notification fan-out, report generation)?
7. **Backup & DR**: Strategy untuk Railway PostgreSQL + asset storage (file upload sekarang lokal).
8. **Multi-tenancy/multi-PTPN**: Apakah perlu support PTPN lain selain PTPN III? Schema design implication.
9. **Reporting**: Sidebar Pelaporan disembunyikan — apa kebutuhan reporting executive? Cetak/export? Embed di Home?
10. **Audit & compliance**: SOX/GCG compliance needs? Audit trail granularity (saat ini: WorkItemStatusLog + ProgramApprovalLog).

---

*Snapshot dibuat 2026-05-14 untuk kebutuhan handover/diskusi lanjutan. State akurat per `git log` dan filesystem pada tanggal tersebut. Untuk update terkini, jalankan `git log --since='2026-05-14'` dan cek `MEMORY.md` di Claude Code.*
