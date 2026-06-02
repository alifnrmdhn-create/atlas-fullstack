# ATLAS Mobile Phone Support — Rencana Inisiatif (Juni 2026)

> Lanjutan dari `docs/responsive-audit-2026-05.md`. Audit Mei fokus desktop tier
> T1–T4 dan menetapkan **phone <640px "tidak resmi didukung", tablet 768 = floor**.
> Keputusan 2026-06-01 (user): **naikkan target ke full phone support (≤640px)**.
> Dokumen ini = roadmap untuk mewujudkannya tanpa merusak desktop.

## 0. Temuan eksplorasi (2026-06-01)

Smoke via `scripts/mobile-shot.mjs` (phone 390×844 + tablet 768×1024, login
data-bearing user).

| Viewport | Verdict |
|---|---|
| **768px tablet** | 🟢 Lumayan. Sidebar auto-collapse ke icon-rail, topbar muat, tab Programs lengkap. Sesuai floor yang ada. |
| **390px phone** | ❌ Layout desktop dijejalkan. Masalah konkret di bawah. |

Masalah phone (390px):
1. **Sidebar icon-rail 60px tetap menempati grid** — ~16% lebar layar. Belum ada off-canvas/hamburger (audit S5).
2. **Tab header Programs overflow** — "Pulse/Risiko" kepotong, tanpa scroll-affordance.
3. **Toolbar segmented (List/Board/Table) + search melebihi tepi kanan** — ke-clip.
4. **Topbar** sumpek; search bar mendominasi.
5. Konten pakai padding desktop, tak ada reflow.

Akar masalah: **shell `.app-shell` adalah CSS grid 2-kolom** (`shell.css:5-13`),
dan ≤1024 hanya menyusutkan kolom sidebar (`shell.css:43-44`). Tak ada mode di
mana sidebar keluar dari flow. Itu fondasi yang harus ditambah.

## 1. Prinsip

- **Jangan rusak desktop.** Semua perubahan di-gate `@media (max-width: var(--bp-sm))` (640px) atau via state JS `viewportPhone`.
- **Reuse pakem.** Off-canvas = pola standar (drawer + backdrop + body-scroll-lock). Modal sudah full-screen di ≤768 (`shell.css:2124`) — perluas.
- **Token baku.** Pakai `--bp-sm` (sudah ada, 640px). Tidak karang breakpoint baru → `npm run audit:breakpoints` tetap hijau.
- **Augment, jangan rebuild.** Tambah class `app-shell--mobile` + drawer; jangan ubah grid desktop.
- **Touch-first.** Target tap ≥44px, hapus hover-only affordance di phone.
- **Safe-area.** `env(safe-area-inset-*)` untuk notch/home-indicator.

## 2. Fase

### Fase 0 — Tooling & inventory ✅ DONE (2026-06-01)
- [x] `scripts/mobile-shot.mjs` — sweep multi-route × multi-device (default login Audi 3027985, DIR-KMR).
- [x] Sweep 16/17 halaman primer @390px (ProgramDetail recovered via retry; hanya `/performance/me` gagal karena route error non-layout). Shots: `/tmp/atlas-mobile/iphone-*.png`.

> Catatan login: hanya NIK 3000906 (Jimmy) yang masih `Password123!`; user lain
> sudah diganti. Untuk sweep Audi, password di-set sementara lalu **dikembalikan
> ke hash asli** (local dev, reversible). Home tetap skeleton & Programs roster
> "Belum ada program" untuk semua user uji — itu isu scope/async-load roster
> (reproduce di desktop juga), **bukan** isu mobile; di luar lingkup inisiatif ini.

**Tabel overflow per halaman** (severity: 🔴 break / 🟡 polish / 🟢 ok):

| Halaman | Temuan @390px | Sev |
|---|---|---|
| Semua | Sidebar icon-rail 60px tetap makan grid (~16% layar); topbar action cluster sumpek; search bar dominan | 🔴 |
| Home | Skeleton (data), tak bisa nilai konten; shell sama spt di atas | — |
| Programs | Tab (Portofolio…Pulse/Risiko) **clip kanan**; toolbar segmented+search **clip** | 🔴 |
| Charter | Tabel "Aktivitas & Timeline" **clip** (kolom Deliverable kepotong) — audit C2/C4 P0 | 🔴 |
| Workboard `/execution` | Baris filter & stat-chip **clip** ("0 sel…"); **dua tombol "+" hijau** berdampingan di topbar (redundan) | 🔴 |
| Perf Scorecard | Bar ranking & sparkline **overflow tepi kanan**; teks "1 dari 1 direktorat" bertabrakan | 🔴 |
| Perf Divisi | Angka "103.90 %" reflow canggung (unit pindah baris); list insight single-col rapi | 🟡 |
| Perf Kolegial | Pola sama Scorecard; reflow card OK | 🟡 |
| Jadwal `/jadwal` | Tab "Mendatang…Keputusan" **clip kanan**; list meeting reflow rapi | 🟡 |
| Playbook | TOC nge-stack di atas konten (tak fatal) tapi **kehilangan sticky**; tabel Referensi Jabatan **clip** | 🟡 |
| Channels | Pane list reflow single-col OK; switching pane saat channel terbuka = concern internal (modul inti, jangan utak-atik) | 🟢* |
| Settings | Reflow single-col bersih, toggle tap-able — paling sehat | 🟢 |
| Presence/Panduan/Profile | Reflow wajar, tak ada break horizontal mencolok | 🟢 |
| ProgramDetail `/programs/214` | Tombol Board/Charter/Edit muat, meta 2-kolom + konten reflow rapi; **6-tab header clip kanan** ("Hambatan…KPI" terpotong) | 🔴 |
| `/performance/me` | **Tidak ter-capture** — route (redirect → `individu/{id}`) timeout / error bahkan utk user ber-akses. Bukan isu layout; konten individu-detail sendiri "kosong sampai sumber data KPI tersedia" (lihat `PerformanceController::individu`). **Out of scope mobile**, tapi layak diinvestigasi terpisah. | — |

**Pola masalah (akar yang berulang):**
1. **Shell** — sidebar rail + topbar cram → **Fase 1** (off-canvas + topbar mobile). Dampak: SEMUA halaman.
2. **Horizontal tab/toolbar clip** — Programs, Workboard, Jadwal, ProgramDetail → **Fase 2** scroll-tab + toolbar reflow.
3. **Tabel clip** — Charter (P0), Playbook → **Fase 2** table strategy.
4. **Bar/sparkline overflow** — Performance → **Fase 3** per-page.
5. **Number+unit reflow** — Divisi → polish.

Konten single-column (list, card, insight, settings) sudah reflow **wajar** begitu grid collapse — jadi beban berat ada di **shell + horizontal-overflow**, bukan reflow konten. Itu memvalidasi urutan Fase 1 → 2 → 3.

### Fase 1 — Shell foundation (off-canvas) — ✅ DONE (2026-06-01)
File: `AppShell.tsx`, `shell.css`, `tokens.css`.
Implementasi: state `viewportPhone` (matchMedia ≤640) + `mobileNavOpen`; `effectiveCollapsed` di-skip saat phone (drawer expanded); class `app-shell--mobile`/`app-shell--nav-open`; `.app-shell__scrim` (klik tutup); hamburger `topbar__hamburger` (first child, `margin-right:auto`); token `--z-nav-scrim`/`--z-nav-drawer` (di atas topbar 9500); tutup via nav-click (effect `[activePath]`) / Esc / scrim. Drawer transform di `.sidebar` (bukan `.app-shell`). Safe-area insets.
Verifikasi: typecheck ✓, audit:breakpoints ✓ (640=`--bp-sm`, bp-allow), smoke @390 buka/tutup ✓, regресi desktop 1440 ✓ (tak berubah).
Plan asli di bawah (sebagai catatan):
- `viewportPhone` state via `matchMedia('(max-width: 640px)')` (pola sama dgn `viewportNarrow` di `AppShell.tsx:616-627`).
- State `mobileNavOpen` + class `app-shell--mobile` & `app-shell--nav-open`.
- CSS phone: `.app-shell--mobile` → `grid-template-columns: 1fr` (sidebar keluar grid). `.sidebar` → `position: fixed; transform: translateX(-100%)`, `--nav-open` → `translateX(0)`. Backdrop `.app-shell__scrim` (fixed, fade). Sidebar di phone tampil **expanded** (label penuh), bukan icon-rail.
- **Hamburger** di kiri topbar (hanya phone). Tutup drawer saat: klik nav-item, route change (`router.on('navigate')`/`usePage` effect), Esc, klik scrim.
- Body scroll-lock saat drawer open.
- Safe-area insets di topbar + drawer.

### Fase 2 — Pola overflow reusable — ✅ sebagian besar DONE (2026-06-01)
- [x] **Scroll-tab pattern** — utility `.scroll-tabs` di `responsive.css` (≤640: `overflow-x:auto` + `scroll-snap` + nowrap + item no-shrink + scrollbar hidden). Diterapkan ke `programs-v2__tabs`, `prog-detail-tabs`, `view-toggle.schedule-toolbar__filters`. **Verified**: ketiga strip `scrollable:true`, tab terakhir (Risiko/Keputusan/KPI) terjangkau via scroll. Halaman baru tinggal tambah class `scroll-tabs`.
- [x] **Toolbar reflow (Programs)** — `@media ≤640` di `ProgramsView.css`: `.programs-controls__view` full-width + wrap, `.programs-search` `flex:1 1 100%`. **Verified**: segmented di baris sendiri, search full-width di bawahnya (tak overflow).
- [x] **Table strategy** — TERNYATA SUDAH ADA: `.atl-wrap` (Charter activity) punya `overflow-x:auto` + scroll-hint gradient + sticky kolom pertama; tabel Playbook punya `overflow-x:auto` ("jaring pengaman"). Yang terlihat "clip" @scroll=0 itu perilaku scroll wajar. Audit C2/C4 P0 sudah ter-resolve sejak audit Mei.
- [ ] **Page-header reflow** (judul + CTA) — Programs OK (CTA muat); cek halaman lain saat di-touch.
- [ ] **Toolbar reflow lain** — Workboard punya beberapa baris filter + stat-chip yang masih clip → Fase 3 per-page.

### Fase 3 — Reflow per halaman — 🔄 IN PROGRESS (2026-06-01)
Sudah dikerjakan:
- [x] **Workboard** — stat-chip row (`.wb-stats`) tadinya `inline-flex` no-wrap → "0 selesai" clip. Fix `≤640` wrap + buang border-left (`WorkboardView.css`). Verified.
- [x] **Performance (SEMUA view)** — 🐛 **root-cause besar**: di phone shell tidak pakai `.app-shell--collapsed` (drawer expanded), jadi rule `@media(max-width:900px) .app-shell--with-panel` di `context-panel.css` memberi `--sidebar-width 1fr` → **kolom sidebar 224px KOSONG** (sidebar kan sudah off-canvas) + workspace menyusut ke 166px. Semua halaman Performance (pakai ContextPanel) ke-squeeze + konten overflow keluar container. Fix: `≤640` paksa `grid-template-columns: 1fr` utk `.app-shell--mobile.app-shell--with-panel` (`context-panel.css`). Setelah fix `.view-performance` = full 390px.
- [x] **Performance leaderboard** — `.perf-rank-bar` grid min ~372px > layar → bar viz overflow. Fix `≤640` perkecil grid mins (`Performance.css`). Verified bar muat.
- [x] **Performance header** — `.perf__header` flex no-wrap → title/summary/pill tabrakan + pill clip. Fix `≤640` wrap (`Performance.css`). Angka "103.90 %" yang tadinya reflow canggung ikut beres (gejala dari width sempit, bukan bug terpisah).
- [x] **ProgramDetail** — tabs scroll (Fase 2 `scroll-tabs`); header + meta 2-kolom + konten tab reflow single-column rapi @390. Verified.
- [x] **Topbar "+" redundan** — page-action ber-ikon Plus ("Task Baru"/"Assignment Baru") collapse jadi "+" telanjang kembar quick-create di phone. Fix: `data-icon` di `TopbarAction.tsx` + `≤640 .topbar__action-btn[data-icon="Plus"]{display:none}` (`topbar-extras.css`). Creation tetap via quick-create. Verified Workboard tinggal 1 "+".
- [x] **Perf Kolegial** — verified full-width (ikut beres via fix with-panel + rank-bar + header).
- [x] **Home** — ✅ ternyata **tidak rusak**: "skeleton" di smoke awal cuma artefak timing (fetch `/workspace/overview` belum resolve di settle 1100ms pasca-login; settle 6s → Home populate penuh). Home cockpit reflow rapi single-column @390 (verdict + KPI + execution gauge + tertinggal + keputusan). Satu fix nyata: `.hv--cockpit .hvc__grid--cmd` — rule ITERASI 14 (`≤1280→1fr 1fr`, source-order menang) bikin command strip 2-kolom di phone; tambah `≤640→1fr` (`HomeView.css`). Timeline `.hvc__tl` sudah `overflow-x:auto` (scrollable, OK); `.hvc__act-text` ellipsis by-design (bukan overflow). docSW=390 (no page-scroll). **NB**: skeleton untuk admin unitId-NULL itu kasus terpisah yang real (lihat [[project_local_dev_smoke]]).
- [ ] **`/performance/individu` detail** — route error (redirect timeout, konten "kosong sampai sumber data KPI"), non-layout → investigasi terpisah.

#### Rencana awal Fase 3 (catatan):
Urutan prioritas (paling sering dibuka di HP dulu):
1. **Home** — hero/HUD + KPI⟷Program grid → 1-col; command strip → wrap. (`HomeView.css`)
2. **Programs** — tab + toolbar (pakai Fase 2). (`ProgramsView.css`)
3. **Workboard / Assignment** — lane 3-kolom → stack/swipe.
4. **Performance** ×4 — grid sudah responsif, turunkan breakpoint ke phone.
5. **ProgramDetail** 6 tab + **Charter** table + **Playbook** TOC→drawer (audit PB1/PB2 P0).
6. Modal: perluas full-screen pattern.
- Sisanya (Schedule, Channels, Presence, Profile, Settings, Admin) dimigrasi oportunistik saat di-touch — pola sama dgn migrasi design-system.

### Fase 4 — Lock-in
- Touch target audit (≥44px), tap/active states.
- `scripts/mobile-shot.mjs` jadi bagian smoke rutin.
- Update `CLAUDE.md` §7 (phone kini didukung, bukan "floor 768") + `docs/responsive-audit-2026-05.md`.
- Update memory responsive.

## 3. Risiko / hati-hati
- **`transform` di `.app-shell`** membuat containing block untuk `position:fixed` (catatan keras `shell.css:16-27`). Drawer transform harus di `.sidebar`, **bukan** `.app-shell`. Scrim & drawer fixed → pastikan tidak ter-scope ke transformed ancestor.
- **Scroll container & `contain`** — memory `feedback_backdrop_filter_perf` + `feedback_no_transform_in_scroll`: jangan `contain` di scroll container, hindari `backdrop-filter` berulang, transform persist di `.workspace__content` bikin ghosting. Drawer transform aman (di luar scroll container).
- **Channels (182KB)** punya layout internal sendiri — modul inti, jangan utak-atik; cukup pastikan shell-nya tidak overflow.
- Realtime polling tiap 2s tetap jalan; drawer tidak boleh nahan thread.

## 4. Deliverable Fase 1 (definition of done)
Di 390px: hamburger buka drawer full-label dengan backdrop; klik nav menutup & navigasi; konten pakai full width (sidebar tak makan ruang); Esc & klik-luar menutup; desktop ≥641px **tidak berubah sama sekali**. Smoke `mobile-shot.mjs` bersih.

---

## TRACK BARU — Mobile UX (mobile-first, bukan sekadar responsive) — 2026-06-02

Keputusan user 2026-06-02: app harus **benar-benar nyaman & fungsional di HP untuk SEMUA peran** (Direktur pantau/approve, PIC update kerja, komunikasi/jadwal, fungsionalitas penuh), **satu codebase** (mobile UX pass, bukan dedicated views), **+ PWA installable**.

Konteks: Fase 1–3 = "tidak rusak / muat" (responsive bug-fixing). Track ini = "enak dipakai pakai jempol" (touch ergonomics, thumb-reach, density, app-like). Gap konkret: tap target 20–32px (perlu ≥44px), nav hamburger pojok (perlu bottom-nav), kepadatan tinggi, tabel scroll-horizontal canggung (perlu →kartu), modal multi-kolom (perlu sheet), belum installable.

### M1 — Bottom tab bar ✅ DONE (2026-06-02)
- `MobileTabBar` inline di `AppShell.tsx` (gate `viewportPhone`): 4 destinasi inti (Home/Workboard/Programs/Channels, reuse ikon+badge NI) + tab "Menu" buka drawer. `shell.css` `.mobile-tabbar` (fixed bottom, z `--z-tabbar`, ≥54px touch, safe-area, badge). Hamburger topbar dihapus di phone (digantikan tab Menu). `workspace__content` padding-bottom clear bar. Verified: tab bar tampil, active state hijau, drawer buka via Menu, badge (Workboard 6 / Programs 22).

### M2 — PWA installable ✅ DONE (2026-06-02)
- Ikon generate dari brand mark via `scripts/gen-icons.mjs` → `public/icons/` (192/512/maskable-512/apple-touch-180/favicon-32).
- `public/manifest.webmanifest` (standalone, theme #2D8C3E, portrait). `public/sw.js` (network-first nav + SWR aset + API passthrough; offline shell). Meta manifest/theme-color/apple-touch di `app.blade.php` + `viewport-fit=cover`. Registrasi SW di `app.tsx` guard `import.meta.env.PROD` (tak ganggu HMR dev).
- Installable di deploy HTTPS (Railway) setelah `npm run build`. Validated: manifest JSON ok, sw.js syntax ok, ikon render ok.
- NB build penuh tertahan sementara karena HomeView.tsx WIP user (bukan dari mobile work).

### M3 — Touch targets ≥44px (global pass)
### M4 — Tabel → kartu reflow (pola reusable)
### M5 — Modal → full-screen sheet (phone)
### M6 — Density tuning per-flow
