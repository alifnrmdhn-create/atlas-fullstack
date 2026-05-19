# ATLAS Responsive Audit — Mei 2026

> Audit Fase 0 untuk inisiatif responsiveness platform. Output ini base untuk
> Fase 1 (token + foundation), Fase 2 (shell), Fase 3 (halaman primer), Fase 4
> (lock-in). Disusun 2026-05-19 oleh Claude Code via code-driven audit
> (Playwright belum terpasang — observasi visual user-driven menyusul).

## 1. Device Matrix Target

Dikonfirmasi user (2026-05-19): **semua 4 tier wajib didukung rapi**.

| Tier | Resolusi | Target user | Status saat ini |
|---|---|---|---|
| T1 | 1366×768 | Laptop kantor staff / ASN | ⚠️ Banyak halaman cramping |
| T2 | 1440×900 / 1536×864 | Laptop modern (MacBook, ThinkPad) | 🟡 Mostly OK, occasional glitch |
| T3 | 1920×1080 | Monitor eksternal kantor | 🟢 Baseline yang sekarang dipoles |
| T4 | ≥1920 (2K/4K) | Direksi, monitor 27"+ | ⚠️ Whitespace liar, fixed-width terlihat sempit di tengah |

Konsekuensi: harus ada **3 strategi paralel**: hemat ruang di T1, baseline T2-T3, dan cap/scale-up di T4.

---

## 2. Foundation: Token & Breakpoint State

### Token yang sudah ada (`resources/js/styles/tokens.css`)

- `--sidebar-width: 224px` (fixed)
- `--sidebar-width-collapsed: 60px` (fixed)
- `--topbar-height: 44px` (fixed)
- `--shell-card-radius: 16px`
- Shadow tokens lengkap

### Token yang BELUM ADA — gap utama

- ❌ `--bp-*` (breakpoint tokens)
- ❌ `--space-fluid-*` (clamp-based spacing)
- ❌ `--type-fluid-*` (clamp-based font sizes)
- ❌ `--workspace-padding` (per-tier fluid value)
- ❌ `--content-max-width` (cap untuk T4)

### Inconsistency breakpoint

Total **73 media query** tersebar di 16 file. Breakpoint values:
`600, 620, 640, 720, 760, 768, 800, 860, 880, 900, 960, 980, 1000, 1024, 1100, 1180, 1240, 1280, 1320, 1600` — **20 nilai berbeda**.

Tiap developer karang-karang. Bahkan dalam 1 halaman (HomeView), dipakai 5 breakpoint berbeda (720, 880, 980, 1600).

---

## 3. Audit Per Komponen

### 3.1 Shell — Sidebar (`shell.css`)

**File**: `resources/js/styles/shell.css` (3000+ baris)

| # | Issue | File:line | Severity | Tier impact |
|---|---|---|---|---|
| S1 | Sidebar 224px fixed, **tidak auto-collapse** ke icon di viewport sempit | shell.css:6 | **P0** | T1 (proporsi 16% screen di 1366) |
| S2 | Sidebar collapse hanya via tombol manual, tidak persist preference per device | shell.css:19 | P1 | T1 |
| S3 | Nav item `min-width: 188px` + `max-width: 246px` — fixed, tidak fluid | shell.css:538-539 | P2 | T1 |
| S4 | User popover `width: 220px` di collapsed mode — bisa overflow di mobile | shell.css:734 | P2 | <T1 |
| S5 | Tidak ada hamburger / off-canvas pattern untuk <768px | n/a | P1 | <T1 |

**Kesimpulan**: Sidebar **harus auto-collapse ke icon di <1100px** (tanpa user click), dan switch ke off-canvas + hamburger di <768px.

### 3.2 Shell — Topbar (`shell.css`)

| # | Issue | File:line | Severity | Tier impact |
|---|---|---|---|---|
| T1-1 | cmdk button `width: 200px` fixed | shell.css:908 | P1 | T1 |
| T1-2 | Search `max-width: 340px` tapi `flex: 1` — bisa shrink ke 0 di sempit | shell.css:988-989 | P1 | T1 |
| T1-3 | Topbar quick-popover `min-width: 244px` — overflow di mobile | shell.css:1088 | P2 | <T1 |
| T1-4 | Quick action items pakai 32px × beberapa = bisa overflow di sempit | shell.css:1058 dst | P1 | T1 |
| T1-5 | Tidak ada strategi prioritas: di sempit, item mana yang hide/collapse dulu? | n/a | **P0** | T1 |
| T1-6 | Notif popover `width: 320px` + 340px other popovers | shell.css:1253, 989 | P2 | <T1 |

**Kesimpulan**: Topbar perlu **strategi visibility priority** (search → cmdk → quick btn → theme → notif → avatar) dengan progressive collapse ke icon-only di <1280, dan modal di <768.

### 3.3 Shell — Workspace (`shell.css`)

| # | Issue | File:line | Severity | Tier impact |
|---|---|---|---|---|
| W1 | Workspace `min-width: 0` ✅ — flex shrink properly | shell.css:756 | OK | - |
| W2 | Workspace card padding 12px gutter — fixed, tidak fluid | shell.css:8 | P2 | T4 (terlalu kecil di 4K) |
| W3 | Workspace card **tidak punya max-width cap** — full bleed | n/a | **P0 T4** | T4 (konten meregang lebar di 4K) |

**Catatan**: Per pakem `CLAUDE.md` "Page layout = full-bleed", workspace WAJIB stretch. Tapi konten DI DALAM workspace boleh punya inner max-width — ini yang harus difollow.

### 3.4 HomeView (`Pages/HomeView.css`)

| # | Issue | File:line | Severity |
|---|---|---|---|
| H1 | Stats 3-col grid → 1-col di <720 (skip 2-col intermediate) | HomeView.css:265-271 | P1 |
| H2 | Priority grid `1.65fr 1fr` → 1fr di <980 (acceptable) | HomeView.css:562-568 | OK |
| H3 | List row 6-col grid (`100px 1fr 130px 90px 44px 100px`) — di <980 collapse ke 3-col stack | HomeView.css:1435, 1583 | OK |
| H4 | `hv__inner padding: 28px 32px 48px` — fixed, ada handling 1600+ dan <980 | HomeView.css:26-35 | P2 |
| H5 | Breakpoint set: 720/880/980/1600 — **berbeda** dari ProgramsView | n/a | P1 |

**Verdict**: Home **paling responsive** di codebase, tapi pakai breakpoint sendiri. Migrasi ke token baku.

### 3.5 ProgramsView (`Pages/ProgramsView.css`)

| # | Issue | File:line | Severity |
|---|---|---|---|
| P1 | Header grid `minmax(280px, 1fr) 120px 200px 160px` — fluid + step down di 1280/1024 | programs.css:291, 584 | OK |
| P2 | Roster header actions spacer fixed `width: 128px` | ProgramsView.css:1058 | P2 |
| P3 | Tidak ada handling <720 di table — overflow potensial | n/a | P1 |
| P4 | Breakpoint 720/1024/1280 — **inconsistent** dengan HomeView (720/880/980/1600) | n/a | P1 |

**Verdict**: Decent responsive, tapi inconsistent breakpoint values.

### 3.6 ProgramDetailView (`Pages/ProgramDetailView.tsx` + inline CSS)

Detailed audit pending — file inline + extension via styles/programs.css. Key concern: **tab bar** dengan 6 tab di header bisa overflow di <1200.

### 3.7 Charter View (`Pages/Programs/Charter/charter.css`)

| # | Issue | File:line | Severity |
|---|---|---|---|
| C1 | KPI bar 5-col grid `1.6fr 1fr 1fr 1fr auto` → 2-col di <900 | charter.css:80, 111 | OK |
| C2 | Aktivitas table: 12 monthly cols × 38px + 3 cols × min-width = **~924px min** | charter.css:751-760 | **P0 T1** |
| C3 | Hanya 2 media query (900, 1100) di 841 baris CSS | n/a | P1 |
| C4 | Tidak ada horizontal scroll wrapper untuk activity table di <1100 | n/a | **P0 T1** |

**Verdict**: Activity table = **paling problematic di T1** (1366×768). Sidebar 224 + workspace padding 80 = workspace ~1062px, padding inner ~60px, **konten ~1000px** — table 924px tight tapi muat. Tapi di tier sublaptop (<1280) workspace cuma ~720px → table overflow tanpa scroll wrapper.

### 3.8 PlaybookView (`Pages/PlaybookView.css`)

| # | Issue | File:line | Severity |
|---|---|---|---|
| PB1 | TOC `256px` fixed — di 1366 jadi 25% workspace | PlaybookView.css:53 | **P0 T1** |
| PB2 | **ZERO media query** di 876 baris CSS | n/a | **P0** |
| PB3 | Mermaid `useMaxWidth: true` → scale infinit di T4 | PlaybookView.tsx:256 | P1 T4 |
| PB4 | Tidak ada mobile/tablet pattern (TOC drawer/sticky) | n/a | P1 |
| PB5 | Content padding `20px 40px 56px 40px` — fixed | PlaybookView.css:248 | P2 |

**Verdict**: Playbook **paling parah** dari sisi responsiveness. Ini halaman yang Pak Fadil komplain di WhatsApp.

### 3.9 Performance pages (`styles/performance.css`)

| # | Issue | File:line | Severity |
|---|---|---|---|
| PF1 | perf-stat-grid 4-col → 2-col di <900 (P1: skip intermediate 3-col) | performance.css:84-88 | P1 |
| PF2 | perf-director-grid 5-col → 3-col → 2-col (good progression) | performance.css:214-221 | OK |
| PF3 | perf-podium intermediate behavior: `min-width: 900` 3-col, default 2-col | performance.css:558-562 | OK |
| PF4 | perf-scorecard-grid 3→2→1 dengan BP 1000/640 | performance.css:641-648 | OK |
| PF5 | Breakpoint values 640/700/800/900/1000/1100 — **6 nilai berbeda dalam 1 file** | n/a | P1 |

**Verdict**: Performance paling rajin pakai grid responsive, tapi inconsistent BP values.

### 3.10 ChannelsView

Minimalist outer chrome only — Slack-clone internal layout di TSX file (182KB) sudah punya logic responsiveness sendiri. **Tidak diutak-atik** sesuai memory `project_pattern_a_workspace` dan CLAUDE.md "Modul Inti yang Tidak Boleh Disentuh".

---

## 4. Prioritized Issue Matrix

### P0 (must fix — breaks UX di tier target)

1. **PB1+PB2** — Playbook TOC fixed + zero media query → langsung impact di laptop 1366
2. **S1** — Sidebar tidak auto-collapse → 16% screen di T1
3. **C2+C4** — Charter activity table tanpa horizontal scroll wrapper → overflow di <1280
4. **T1-5** — Topbar tanpa visibility priority → element overflow di T1
5. **W3** — Workspace tidak ada max-width inner → konten meregang di T4

### P1 (significantly degrades quality)

- Topbar elements fixed width (cmdk 200, search 340, popover 320)
- HomeView intermediate breakpoint absent (3→1 langsung)
- Charter limited media queries
- Mermaid infinite scale di T4
- Sidebar tidak punya off-canvas mobile mode

### P2 (polish, can defer)

- Padding fixed values di banyak halaman
- User popover di sidebar collapsed mode
- Programs roster spacer fixed 128px

---

## 5. Recommended Breakpoint Baku

Berdasar audit, propose **5-tier system** yang nyatu ke device matrix user:

| Token | Value | Trigger | Layout shift |
|---|---|---|---|
| `--bp-sm` | 640px | Mobile phone | Off-canvas sidebar + topbar modal search |
| `--bp-md` | 1024px | Tablet portrait / laptop kecil | Sidebar collapsed (icon-only) default |
| `--bp-lg` | 1280px | T1 (1366) baseline | Workspace padding shrink, topbar items collapse |
| `--bp-xl` | 1536px | T2-T3 baseline | Default desktop layout |
| `--bp-2xl` | 1920px | T4 (≥FHD) | Optional inner max-width cap untuk reading content |

Konsolidasi: **20 breakpoint values → 5 baku**. Migration akan pakai sed/awk + manual review.

---

## 6. Recommended Foundation Patches (Fase 1 preview)

### `tokens.css` tambahan:
```css
:root {
  /* Breakpoints — single source of truth */
  --bp-sm: 640px;
  --bp-md: 1024px;
  --bp-lg: 1280px;
  --bp-xl: 1536px;
  --bp-2xl: 1920px;

  /* Fluid spacing — workspace & section padding */
  --space-fluid-sm: clamp(12px, 2vw, 20px);
  --space-fluid-md: clamp(20px, 3vw, 32px);
  --space-fluid-lg: clamp(28px, 4vw, 56px);

  /* Sidebar — tetap fixed tapi token-driven */
  --sidebar-width-fluid: clamp(60px, 16vw, 224px);

  /* Inner content max-width (untuk halaman dengan prose panjang) */
  --content-max-width-prose: 78ch;
  --content-max-width-default: 1440px;
  --content-max-width-wide: 1680px;
}
```

### `shell.css` shell-level media:
```css
/* Auto-collapse sidebar di laptop kecil */
@media (max-width: 1024px) {
  .app-shell { grid-template-columns: var(--sidebar-width-collapsed) 1fr; }
}

/* Off-canvas di mobile */
@media (max-width: 640px) {
  .sidebar { position: fixed; transform: translateX(-100%); /* + open state */ }
  .app-shell { grid-template-columns: 0 1fr; }
}
```

---

## 7. Fase 2-4 Roadmap

| Fase | Lingkup | Effort | Output |
|---|---|---|---|
| Fase 1 | Token + foundation patch | ½ hari | tokens.css + components.css update + pakem docs |
| Fase 2 | Shell auto-collapse + topbar priority | 1 hari | shell.css overhaul + 1 utility component (hamburger) |
| Fase 3a | Playbook responsive | ½ hari | TOC fluid, mermaid cap, mobile drawer |
| Fase 3b | Charter activity table scroll wrapper + KPI bar tier-aware | ½ hari | charter.css patch |
| Fase 3c | Breakpoint migration ke baku | **SKIP** | Token didefine, halaman lama keep existing values (low-risk hygiene) |
| Fase 3d | Performance/programs/Home migration | **SKIP** | Halaman lama sudah punya breakpoint custom yang tuned manual; tidak migrasi |
| Fase 4 | Manual visual QA di 4 tier + CLAUDE.md update | ½ hari | screenshot kompar + doc |

**Total**: ~4½ hari kerja sesuai estimasi awal.

---

## 8. What's NOT in Scope

- Test otomatis (Playwright/Percy) — manual DevTools QA dulu, automation Sprint berikutnya
- ChannelsView internal — protected per CLAUDE.md
- Admin views (AdminUsers/Positions dst) — low traffic, defer
- Form input layouts (DraftRestoreBanner dst) — already use modal/inline patterns yang OK
- Email templates / print stylesheet — out of scope

---

## 9. Keputusan Strategis (Locked 2026-05-19)

1. **Sidebar default**: Auto-collapse icon-only di ≤1024px. Pakem Linear/Stripe. User bisa expand manual via toggle existing. Tooltip wajib untuk label accessibility.
2. **Charter activity table**: Horizontal scroll dengan **sticky kolom name** di kiri. Visual PPT charter (12 kolom) dipertahankan. Tambah `overflow-x: auto` wrapper + `position: sticky` di kolom 1.
3. **T4 cap policy**: Workspace tetap full-bleed sesuai pakem `CLAUDE.md`. Tambah **inner content max-width 1680px** dengan `margin: 0 auto`. Halaman prose (Playbook body) ikut existing 78ch.
4. **Mobile scope**: ATLAS officially **desktop + tablet portrait (≥768px)**. <640px tidak didukung (tools desk-bound, tablet portrait sudah cukup untuk field review).

---

## 10. Apendix — File Manifest

CSS yang diaudit:
- `resources/js/styles/shell.css` (3001 baris, 2 media queries)
- `resources/js/styles/tokens.css` (no breakpoint tokens)
- `resources/js/styles/components.css` (2 media queries)
- `resources/js/styles/performance.css` (7 media queries)
- `resources/js/styles/programs.css` (5 media queries)
- `resources/js/Pages/HomeView.css` (19 media queries)
- `resources/js/Pages/ProgramsView.css` (5 media queries)
- `resources/js/Pages/PlaybookView.css` (876 baris, **0 media queries**)
- `resources/js/Pages/Programs/Charter/charter.css` (841 baris, 2 media queries)
- `resources/js/Pages/ChannelsView.css` (minimal, skip)

Halaman view yang relevan untuk Fase 3:
- HomeView, ProgramsView, ProgramDetailView, Charter, PlaybookView
- ExecutiveSummaryView, MonthlyReportDetail (kalau aktif)
- Performance views (KPI Saya, Scorecard, Divisi, Individu, Kolegial)

---

**Status**: Audit selesai 2026-05-19. Menunggu user decision untuk Open Questions §9 sebelum mulai Fase 1.
