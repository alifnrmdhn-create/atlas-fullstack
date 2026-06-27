# ATLAS — Claude Code Context

> Brief project context untuk Claude Code sessions. Untuk dokumen detail lihat `docs/`.

## Project Overview

ATLAS = Advanced Transformation & Leadership Alignment System.
Platform manajemen program kerja PTPN III dengan fokus PDCA (Plan-Do-Check-Act).

**Stack**: Laravel 13 + Inertia.js + React 19 + TypeScript (strict) + PostgreSQL.
**Schema**: PostgreSQL `ptpn_kmr_app` (search_path).
**Realtime**: polling 2 detik via `RealtimeController` + `BroadcastEvent` table (SSE di-drop 2026-05-19, jangan re-introduce — lihat memory `project_sse_dropped_polling_only`).

## Arsitektur PDCA

Sistem dirancang sebagai siklus PDCA, bukan katalog modul:

| Fase | Modul utama |
|---|---|
| **Plan** | Programs (+ApprovalLog), Workstream → Initiative → Task, KpiDefinition |
| **Do** | Workboard, Assignment |
| **Check** | Performance (Scorecard, Kolegial, Divisi, Individu), MonthlyReport, RiskReport, ProgressLog, Home |
| **Act** | Meeting (RAPAT_KOORDINASI), MeetingActionItem, Blocker, EscalationRequest (Clear the Path) |

**Sidebar** (post 2026-05-25, redesign 2026-06-26) di-organize intent-based, bukan PDCA: **pita primer** (pinned, tanpa label: Home + Focus + **Programs**) → **My Work** (Workboard, Assignment, Coordination, Channels, Presence) → **Performance** (KPI dashboards, role-gated; auto-hidden saat user tak punya akses) → Admin. Redesign 2026-06-26 membuang label lama "Portfolio & Performance" (terlalu panjang + grup campur 1-Programs+N-KPI): Programs naik ke pita primer sebagai destinasi jangkar, sisa KPI jadi grup "Performance" satu-tujuan 1-kata. Profile/Settings eksklusif via user popover di footer. PDCA tetap framework sistem (dipakai di docs/playbook untuk klasifikasi modul), tapi navigasi user-facing dioptimasi untuk fast lookup — group label = intent user, bukan abstract phase. Lihat `resources/js/layouts/AppShell.tsx` (todayItems + grpMyWork/grpPerformance) dan `resources/js/lib/nav-config.ts` untuk implementasi.

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
FEATURE_CLEAR_THE_PATH=DIR-KMR   # 'enabled' | 'disabled' | kode direktorat (DIR-KMR/DBS/DAS/...) — harus cocok Directorate.code
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

## Testing & CI

```bash
bash scripts/setup-test-db.sh                       # sekali: buat DB ptpn_kmr_test + schema
php artisan test                                    # full suite (baseline: 270 pass, 0 fail)
php artisan test --filter="OrgChainServiceTest"     # specific
npm run check                                       # typecheck + lint + audit routes/breakpoints/darkmode/status/zindex + build
node scripts/route-scope-sweep.mjs                  # smoke assertion route-scoped loader (butuh dev server :9000)
```

CI GitHub Actions (sejak 2026-06-10) menjalankan `php artisan test` + typecheck/lint/audit/build pada setiap push/PR — suite WAJIB hijau, tidak ada lagi "pre-existing fail" yang ditoleransi. Backup DB prod harian via workflow `db-backup.yml` (artifact GitHub, retensi 30 hari).

## Convention Pegangan

1. **Augment, don't replace** untuk modul existing
2. **Threshold values dari config**, jangan hardcode
3. **Notification = Notification table + BroadcastService::toUsers** (selalu pasangan)
4. **Feature flag setiap fitur eksperimental** — gate dengan `useFeatureFlag` di FE, `FeatureFlagService::isEnabled` di BE
5. **Smart defaults > hard blocks** — auto-prefill, soft visibility, anti-bureaucracy
6. **Page layout = full-bleed** — halaman primer WAJIB stretch lebar workspace. Dilarang `max-width` fixed + `margin: 0 auto` pada wrapper page-level (whitespace dari padding, bukan cap). Detail aturan + pengecualian (modal, prose, ellipsis) ada di komentar guardrail di `resources/js/styles/components.css`.
6a. **Layering overlay = token `--z-*`** — overlay/modal/drawer/topbar/sidepanel WAJIB pakai token `--z-*` di `tokens.css` (`--z-sidebar` 100, `--z-tabbar` 150, `--z-modal-backdrop` 9000, `--z-modal` 9001, `--z-topbar` 9500), JANGAN karang angka mentah. `z-index` literal ≥20 = ikut tier overlay → **di-enforce via `npm run audit:zindex`** (bagian `npm run check`): literal tinggi baru → build gagal. Stacking lokal kecil (0–19, mis. pseudo-element di atas sibling) dibebaskan. 34 violation lama di-grandfather di `scripts/zindex-baseline.json` — turunkan bertahap (`--update-baseline`). Disengaja (mis. portal pihak-ketiga): tandai komentar `z-allow`. Latar: SidePanel `z-index: 61` pernah meluncur di belakang topbar (9500) → header ke-clip.
6b. **Design system = `resources/js/design-system/` (arah konvergen, keputusan 2026-05-26 jalur A).** ATLAS sedang migrasi dari sistem legacy (`styles/*.css`, token `--green`/`--space-*`, scaffold `.ds {name}-v2`+`.view-toolbar`+`.{name}-v2__inner` atau `.page-shell`, tombol `.btn--*`) ke **design-system/ primitives** (`<PageShell>`, `<PageHeader>`, `<Button>`, `<Card>`, `<Pill>`, `<Stat>`, `<ListRow>` + token `--ds-*`). Aturan: **komponen/halaman BARU WAJIB pakai design-system primitives + token `--ds-*`** (import dari `'@/design-system'`). Halaman legacy **dimigrasi oportunistik saat di-touch** — bukan kampanye big-bang. Jangan tambah pola legacy baru (`.btn--*` baru, `.{name}-v2` baru). Sudah konvergen: modul Performance/. Lihat memory `project_dual_design_system`.
7. **Responsive baku (Mei 2026)** — wajib didukung 4 device tier: T1 laptop kantor 1366×768, T2 modern 1440-1536, T3 FHD 1920, T4 2K/4K. Aturan:
   - Breakpoint values **ambil dari `--bp-*` tokens** di `tokens.css` (sm=640, md=1024, lg=1280, xl=1536, 2xl=1920; plus 768 floor tablet). Jangan karang sendiri — sebelumnya tersebar 20 nilai berbeda di 16 file. **Di-enforce via `npm run audit:breakpoints`** (bagian dari `npm run check`): nilai liar baru → build gagal. 54 violation lama di-grandfather di `scripts/breakpoint-baseline.json` — turunkan bertahap saat migrasi (`--update-baseline`). Breakpoint disengaja: tandai komentar `bp-allow` di baris @media.
   - Sidebar **auto-collapse di ≤1024** (handled di `AppShell.tsx` + `shell.css`). Toggle button hidden di narrow viewport.
   - **Phone ≤640px KINI DIDUKUNG penuh** (keputusan user 2026-06-01, mengganti "floor 768"). Shell jadi off-canvas: hamburger/bottom-tab-bar (`MobileTabBar`) buka drawer, sidebar keluar grid (`app-shell--mobile`), safe-area insets. Pakem mobile-UX: tap target ≥44px, modal→bottom-sheet ≤640, tabel→kartu (`.reports-table` data-label) atau scroll-x utk matriks, tab horizontal pakai `.scroll-tabs`, density override `--space-page-x` 16px. **PWA installable** (`public/manifest.webmanifest` + `public/sw.js` + ikon). Halaman baru WAJIB reflow bersih @390px; pola di `docs/mobile-phone-support-plan-2026-06.md`. Tablet 768px tetap tier resmi.
   - T4 cap: konten DI DALAM workspace boleh capped 1680px via `.page-shell__cap` utility (opt-in). Workspace itself stays full-bleed.
   - Audit + roadmap: `docs/responsive-audit-2026-05.md` (desktop tier) + `docs/mobile-phone-support-plan-2026-06.md` (phone/tablet).

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
