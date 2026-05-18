# ATLAS — Claude Code Context

> Brief project context untuk Claude Code sessions. Untuk dokumen detail lihat `docs/`.

## Project Overview

ATLAS = Advanced Transformation & Leadership Alignment System.
Platform manajemen program kerja PTPN III dengan fokus PDCA (Plan-Do-Check-Act).

**Stack**: Laravel 11 + Inertia.js + React 18 + TypeScript + PostgreSQL.
**Schema**: PostgreSQL `ptpn_kmr_app` (search_path).
**Realtime**: Custom SSE via `RealtimeController` + `BroadcastEvent` table.

## Arsitektur PDCA

Sistem dirancang sebagai siklus PDCA, bukan katalog modul:

| Fase | Modul utama |
|---|---|
| **Plan** | Programs (+ApprovalLog), Workstream → Initiative → Task, KpiDefinition |
| **Do** | Execution (Workboard), Assignment |
| **Check** | Performance (Scorecard, Kolegial, Divisi, Individu), MonthlyReport, RiskReport, ProgressLog, Home |
| **Act** | Meeting (RAPAT_KOORDINASI), MeetingActionItem, Blocker, EscalationRequest (Clear the Path) |

**Sidebar** mengikuti urutan PDCA: Today → Perencanaan → Eksekusi → Performance → Pelaporan → Tindak Lanjut → Komunikasi → Akun.

## Modul Inti yang Tidak Boleh Disentuh

Modul existing yang sudah established — augment, jangan rebuild:
- `ChannelsView` (182 KB) — Slack-style messaging
- `ScheduleView` (107 KB) — kalender + meeting list
- `PresenceView` (41 KB), `SettingsView` (30 KB), `ProfileView` (24 KB)
- `ProgramsView`, `TaskDetailView`, `AssignmentsView`, `WorkboardView`
- `AdminUsers/Positions/Orgs/Roles` views

Untuk fitur baru: tambah komponen embeddable di halaman existing, atau buat halaman baru yang lengkap (jangan replace).

## Sprint 0–5 MVP (Selesai 2026-05-08)

Lihat **`ATLAS_PDCA_IMPLEMENTATION_PLAN.md`** untuk detail lengkap. Highlight:

### Service Layer Baru
- `OrgChainService` — resolve atasan langsung, escalation chain, cross-direktorat policy
- `FeatureFlagService` — DKM-scoped feature gating; share via Inertia `features` prop
- `ProgramHealthService` — auto-derive health (workstream + KPI + task overdue + blockers)

### Controller Baru
- `EscalationController` — Clear the Path API (7 endpoints)
- `PerformanceController` — divisi/me/individu/kolegial/scorecard + commitmentLedger
- `PilotMetricsController` — admin pilot DKM dashboard

### Schema Baru
- `EscalationRequest` (polymorphic source: BLOCKER/PROGRESS_LOG/ACTION_ITEM/AD_HOC)
- `Program.autoHealthComputedAt` — transparency timestamp
- `User.toursCompleted` — onboarding tour tracking

### Komponen UI Baru
- `CollapsibleSection`, `DataSourceBadge`, `SidePanel`, `AgingIndicator`, `ForecastBadge` (di `components/ui.tsx`)
- `PicaCompositePanel` (Sprint 3) — 4-cell PICA grid di MeetingDetail
- `Escalation.tsx` (Sprint 4) — EscalationButton, CreateModal, TriagePanel

### Konfigurasi
- `config/atlas-thresholds.php` — semua angka aging/carryover/threshold (configurable via .env)
- `config/features.php` — feature flags

## Pilot DKM Activation

```bash
# .env
FEATURE_CLEAR_THE_PATH=DKM   # 'enabled' | 'disabled' | 'DKM' | 'DBS'...
```

Jalankan scheduler untuk auto-health update:
```bash
php artisan schedule:run   # tiap menit di cron
```

User guide pilot: `docs/user-guide-pilot-dkm.md`.

## Charter View context (Mei 2026)

ATLAS punya dua mode untuk Program:
- **Edit mode** (`/programs/{program}`): 6 tab existing (Ringkasan/Struktur/Jadwal/Eksekusi/Hambatan/KPI) untuk PIC saat input data.
- **Charter mode** (`/programs/{program}/charter`): single-page read-only, mirror format KPI Charter PPT DKMR (lihat `docs/reference/15052026_Monitoring Program Kerja DKMR.pdf` — file binary di-gitignore, ada di disk dev), dengan tombol Export PPTX.

Aturan eksekusi:
1. Charter View HANYA menampilkan, tidak mengedit. Semua editing tetap di tab existing.
2. Data source: Program + Workstream + Phase + Task + ProgressLog + KpiValue + ProgramKpiLink — semua existing, no new aggregations except month-from-week derivation.
3. Layout: Pattern A workspace (`.page-shell` outer card), inner grid pakai hairline `border: 0.5px solid var(--color-border-tertiary)`, BUKAN card-in-card.
4. Vocabulary firm: On Track / At Risk / Terlambat / Completed.
5. RBAC: pakai `ProgramPolicy` yang sudah ada (sama dengan ProgramDetailView).
6. Aktivitas table: monthly columns Jan–Des, baris Target/Real per Task, derive dari `plannedWeeks`/`actualWeeks` (bulan ter-target jika minimal 1 minggu di bulan itu ada di `plannedWeeks`).
7. % Achievement = realized weeks / planned weeks up to current month, per program (atau per KPI utama jika di-link).

## Naming Conventions

**Penting**: model `Task` map ke tabel `WorkItem`, FK `initiativeId` → `Initiative.id` (workstream).
- Task uses `assignedTo` (NOT `assignedToId`)
- MeetingActionItem uses `assignedToId`
- Assignment uses `assigneeId`

Lihat `NAMING_CONVENTION.md` untuk detail lengkap.

## Testing

```bash
php artisan test                                    # full suite
php artisan test --filter="OrgChainServiceTest"     # specific
php artisan test --filter="EscalationFlowTest"      # E2E pilot flow
```

Tests baseline: 147/148 passing (1 pre-existing KPI decimal serialization di WorkflowMutationSmokeTest — assertJsonPath strict-equal `'95.000000'` vs serialized `95`, tidak terkait fitur).

## Convention Pegangan

1. **Augment, don't replace** untuk modul existing
2. **Threshold values dari config**, jangan hardcode
3. **Notification = Notification table + BroadcastService::toUsers** (selalu pasangan)
4. **Feature flag setiap fitur eksperimental** — gate dengan `useFeatureFlag` di FE, `FeatureFlagService::isEnabled` di BE
5. **Smart defaults > hard blocks** — auto-prefill, soft visibility, anti-bureaucracy
6. **Page layout = full-bleed** — halaman primer WAJIB stretch lebar workspace. Dilarang `max-width` fixed + `margin: 0 auto` pada wrapper page-level (whitespace dari padding, bukan cap). Pakai canonical `.page-shell` + `.page-shell__inner` di `resources/js/styles/components.css` untuk halaman baru. Detail aturan + pengecualian (modal, prose, ellipsis) ada di komentar guardrail di file tersebut.

## Dokumen Reference

| Dokumen | Isi |
|---|---|
| `ATLAS_PDCA_IMPLEMENTATION_PLAN.md` | Plan Sprint 0–6 + execution log |
| `docs/sprint0-component-audit.md` | UI primitive inventory |
| `docs/sprint0-threshold-workshop.md` | Workshop threshold dengan stakeholder |
| `docs/user-guide-pilot-dkm.md` | User guide DKM pilot |
| `docs/ATLAS_ARCHITECTURE.md` | Arsitektur sistem (pre-existing) |
| `docs/ATLAS_PLAYBOOK.md` | Playbook operasional (pre-existing) |
| `NAMING_CONVENTION.md` | Mapping Prisma legacy → Laravel naming |
