# ATLAS — Charter View & Export PPTX

**Implementation Plan untuk eksekusi via Claude Code**

> Repo: `atlas-fullstack` · Branch target: `feat/charter-view`
> Eksekutor: Alif N. Ramadhan · Sponsor: M. Iswahyudi
> Estimasi: 2.5–3 minggu kalender (4 fase + buffer)
> Tanggal: 2026-05-14

---

## 0. Prinsip

1. **Augment, don't replace.** Tidak ada satu baris kode existing yang dihapus atau di-refactor. Semua tambahan additive: route baru, file baru, kolom baru, komponen baru.
2. **Data layer dulu, view layer kemudian.** Phase 1 (field strategis) selesai sebelum Phase 2 (Charter View) dimulai.
3. **Client-side PPTX.** Export pakai `pptxgenjs` di browser — tidak ada dependency baru di sisi server, konsisten dengan workflow Alif yang sudah familiar dengan pptxgenjs.
4. **Pattern A tetap dipatuhi.** Outer container = `.page-shell` workspace card. Inner panel pakai hairline divider, bukan card-in-card.
5. **RBAC ikut existing.** Charter View pakai authorization yang sama dengan ProgramDetailView.

## Yang TIDAK disentuh (firm)

- `ProgramsView.tsx` (103 KB) — list view tetap apa adanya.
- 5 tab existing di ProgramDetailView (Ringkasan / Struktur / Jadwal Mingguan / Eksekusi / Health). Charter adalah route paralel, bukan pengganti tab.
- Sidebar PDCA — tidak ada item baru. Akses Charter via tombol di header ProgramDetailView (`Lihat sebagai Charter →`).
- `ChannelsView`, `ScheduleView`, `WorkboardView` (Daily PIC), `HomeView V2`, `InboxView` — modul mature, jangan disentuh sama sekali.
- Schema legacy camelCase Prisma — tambah kolom baru, jangan rename existing.
- Scorecard / KPI Direktorat / KPI Divisi / KPI Saya — 4 halaman tetap, jangan konsolidasi.

---

## 1. Outcome

Setelah Phase 4 selesai, pengguna BOD / Kadiv / Pak Dirkeu dapat:

1. Membuka program apapun → klik `Lihat sebagai Charter →` → halaman single-page format KPI Charter PPT DKMR.
2. Klik tombol `Export Charter PPTX` → download file `.pptx` siap pakai untuk rapat MRC/Direksi, layout mirror slide 20-an PPT.
3. Melihat `Strategic Objective` dan `Pilar Strategis` (Collecting More / Spending Better / Innovative Financing / Enabler) di setiap program — anchor utama PPT.
4. Vocabulary di seluruh ATLAS konsisten dengan PPT: **On Track / At Risk / Terlambat / Completed**.

## Acceptance criteria global

- 110/111 tests existing tetap passing (atau 111/111 jika decimal serialization sekalian ditutup).
- Tidak ada regresi visual di ProgramsView, HomeView, ChannelsView (smoke test manual).
- Charter View muat A4 landscape saat di-print (CSS `@media print`).
- PPTX export bisa dibuka tanpa warning di PowerPoint 2019+ dan Keynote.

---

## 2. Sequencing dan kick-off prompts

| Fase | Estimasi | Output |
|---|---|---|
| **Phase 1**: Field strategis & pilar | 1 hari | Migration + model + form field + seeder backfill |
| **Phase 2**: Charter View (read-only) | 3–5 hari | Route + controller + Inertia page + 4–5 sub-komponen |
| **Phase 3**: Export PPTX | 3–5 hari | pptxgenjs utility + tombol di Charter |
| **Phase 4**: Vocabulary lock | 0.5 hari | Audit + replace + verify |
| Buffer | 2 hari | QA, bug fix, smoke test |

### 2.1 Orchestrator prompt — paste ini ke Claude Code untuk mulai

Buka Claude Code di root repo `atlas-fullstack`, lalu paste prompt berikut. Claude Code akan kerjakan setup (branch + CLAUDE.md addendum), lalu mulai Phase 1, dan berhenti di checkpoint untuk Alif review sebelum lanjut ke fase berikutnya.

```
Saya mau eksekusi plan di docs/CHARTER_VIEW_PLAN.md untuk menambahkan
Charter View + Export PPTX ke ATLAS. Plan ini sudah final.

Aturan eksekusi yang harus kamu patuhi:

1. SETUP DULU sebelum coding apapun:
   a. Pastikan working tree clean (git status). Kalau dirty, stop dan tanya saya.
   b. Pastikan branch sekarang main, pull latest (git checkout main && git pull).
   c. Buat branch baru: git checkout -b feat/charter-view
   d. Baca section 3 di plan (CLAUDE.md addendum). Tambahkan blok addendum
      tersebut ke CLAUDE.md di root repo. Commit dengan pesan:
      "docs(claude): add Charter View context for upcoming feature"

2. KERJAKAN FASE BERURUTAN, satu fase per session checkpoint:
   - Setelah setup, mulai Phase 1 (section 4 di plan).
   - Setelah Phase 1 selesai dan acceptance criteria-nya (section 4.6)
     tercentang, STOP dan tunggu konfirmasi saya sebelum Phase 2.
   - Sama untuk Phase 2 → 3 → 4. Stop di setiap akhir fase.
   - Di setiap STOP, laporkan: file yang berubah, hasil test, screenshot
     kalau ada UI, dan acceptance criteria mana yang sudah/belum tercentang.

3. PER FASE: gunakan section yang relevan di plan sebagai SPEC, bukan saran.
   File paths, schema, contract — semua sudah ditetapkan di plan.
   Kalau ada ambiguity atau impossibility, STOP dan tanya saya, jangan tebak.

4. COMMIT GRANULAR per logical chunk dengan format yang dicontohkan di
   section 4.7, 5.11, 6.9, 7.6. Jangan commit raksasa di akhir fase.

5. JANGAN SENTUH yang ada di section 0 "Yang TIDAK disentuh":
   - ProgramsView.tsx, 5 tab existing, sidebar PDCA, ChannelsView,
     ScheduleView, WorkboardView, HomeView V2, InboxView,
     schema legacy camelCase (tambah kolom OK, rename TIDAK).

6. JANGAN LOMPAT KE FASE BERIKUTNYA tanpa konfirmasi saya, sekalipun
   kamu yakin fase sebelumnya sudah perfect.

Mulai dari step 1 (setup). Kalau setup beres, lapor "Setup done, ready
to start Phase 1" dan tunggu saya bilang lanjut.
```

### 2.2 Per-checkpoint prompts

Setelah orchestrator menyelesaikan setup dan lapor `"Setup done"`, balas dengan:

```
Lanjut Phase 1.
```

Setelah Phase 1 selesai dan dia lapor acceptance criteria + hasil test, **Alif review dulu** (cek branch di IDE, run `php artisan test` sendiri kalau perlu). Kalau OK, balas:

```
Phase 1 approved. Lanjut Phase 2.
```

Pola yang sama untuk Phase 3 dan Phase 4. **Khusus setelah Phase 2 selesai**, sebelum approve ke Phase 3, sebaiknya Alif demo Charter View ke Pak Dirkeu dulu (lihat Risk #4 di register 9.3). Pesan ke Claude Code:

```
Phase 2 selesai. Saya mau demo dulu ke sponsor sebelum approve Phase 3.
Tunggu di sini, jangan lakukan apapun. Saya akan balik dalam 1-3 hari
dengan feedback layout — kemungkinan ada adjustment kecil sebelum
exporter PPTX dibangun.
```

Setelah feedback masuk dan adjustment Charter View beres, baru:

```
Sponsor approved layout (dengan adjustment: [list]). Lanjut Phase 3.
```

### 2.3 Kalau Claude Code stuck atau salah arah

Kalau di tengah fase Claude Code mulai melebar (mis. mau refactor file yang ada di "jangan disentuh", atau mau bikin file di luar yang ada di file path map section 9.1), interrupt dengan:

```
Stop. Kamu keluar dari spec di plan. Re-baca section [X] dan kerjakan
hanya yang ada di spec. Kalau spec tidak cukup, tanya saya, jangan
improvise.
```

---

## 3. Setup CLAUDE.md addendum (referensi untuk orchestrator)

Blok ini akan ditambahkan ke `CLAUDE.md` oleh Claude Code di step 1.d orchestrator. Tidak perlu di-paste manual:

```markdown
## Charter View context (Mei 2026)

ATLAS punya dua mode untuk Program:
- **Edit mode** (`/programs/{program}`): 5 tab existing (Ringkasan/Struktur/Jadwal/Eksekusi/Health) untuk PIC saat input data.
- **Charter mode** (`/programs/{program}/charter`): single-page read-only, mirror format KPI Charter PPT DKMR (lihat `docs/reference/2026_MEI_Monitoring_Program_Kerja_DKMR.pptx`), dengan tombol Export PPTX.

Aturan eksekusi:
1. Charter View HANYA menampilkan, tidak mengedit. Semua editing tetap di tab existing.
2. Data source: Program + Workstream + Phase + Task + ProgressLog + KpiValue + ProgramKpiLink — semua existing, no new aggregations except month-from-week derivation.
3. Layout: Pattern A workspace (`.page-shell` outer card), inner grid pakai hairline `border: 0.5px solid var(--color-border-tertiary)`, BUKAN card-in-card.
4. Vocabulary firm: On Track / At Risk / Terlambat / Completed.
5. RBAC: pakai `ProgramPolicy` yang sudah ada (sama dengan ProgramDetailView).
6. Aktivitas table: monthly columns Jan–Des, baris Target/Real per Task, derive dari `plannedWeeks`/`actualWeeks` (bulan ter-target jika minimal 1 minggu di bulan itu ada di `plannedWeeks`).
7. % Achievement = realized weeks / planned weeks up to current month, per program (atau per KPI utama jika di-link).
```

Letakkan PPT referensi di repo: `docs/reference/2026_MEI_Monitoring_Program_Kerja_DKMR.pptx`.

---

## 4. PHASE 1 — Field Strategis & Pilar

### 4.1 Tujuan

Tambahkan dua kolom ke tabel `Program`:

- `strategicObjective` (string, nullable) — text bebas, contoh: "Efektivitas Pengawasan Pendanaan Pemerintah"
- `pillar` (string, nullable, validated) — enum: `COLLECTING_MORE` | `SPENDING_BETTER` | `INNOVATIVE_FINANCING` | `ENABLER` | `NON_SCORECARD`

### 4.2 Files yang dibuat/diubah

| File | Action |
|---|---|
| `database/migrations/2026_05_15_000000_add_strategic_fields_to_program.php` | NEW |
| `app/Models/Program.php` | EDIT (fillable + casts) |
| `config/atlas-thresholds.php` | EDIT (tambah `pillars` enum list) |
| `app/Http/Requests/Program/UpdateProgramRequest.php` | EDIT (validation rules) |
| `resources/js/Pages/Programs/Detail/Ringkasan/StrategicFieldsCard.tsx` | NEW (atau tambah ke card existing) |
| `database/seeders/ProgramStrategicBackfillSeeder.php` | NEW (opsional) |
| `tests/Feature/Program/StrategicFieldsTest.php` | NEW |

### 4.3 Migration template

```php
<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->string('strategicObjective')->nullable()->after('thema');
            $table->string('pillar', 32)->nullable()->after('strategicObjective');
            $table->index('pillar');
        });
    }

    public function down(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->dropIndex(['pillar']);
            $table->dropColumn(['strategicObjective', 'pillar']);
        });
    }
};
```

**Catatan**: nama tabel `Program` (PascalCase) sesuai Prisma legacy. Lokasi kolom (`after`) sesuaikan dengan field strategis existing — cek schema dulu via `php artisan db:show --table=Program`.

### 4.4 Config enum

```php
// config/atlas-thresholds.php
return [
    // ... existing config ...
    'pillars' => [
        'COLLECTING_MORE' => 'Collecting More',
        'SPENDING_BETTER' => 'Spending Better',
        'INNOVATIVE_FINANCING' => 'Innovative Financing',
        'ENABLER' => 'Program Enabler',
        'NON_SCORECARD' => 'Non-Scorecard',
    ],
];
```

### 4.5 Form field — di tab Ringkasan ProgramDetailView

Tambahkan dua input ke form Ringkasan (jangan bikin tab baru):

- Select dropdown untuk `pillar` (5 opsi dari config)
- Textarea/input untuk `strategicObjective`

Letakkan di section "Field strategis" yang sudah ada — bagian post Pak Dirkeu feedback (sumber dana, dampak, indikator keberhasilan).

### 4.6 Acceptance criteria Phase 1

- [ ] Migration run sukses di local + Railway preview
- [ ] Field tampil di form Ringkasan, bisa edit, persist, reload
- [ ] Validation: `pillar` harus dari enum, atau null
- [ ] Test `tests/Feature/Program/StrategicFieldsTest.php` passing
- [ ] Tidak ada test existing yang regres (`php artisan test`)

### 4.7 Commit message

```
feat(program): add strategicObjective and pillar fields

- Migration adds strategicObjective (string nullable) and pillar (string, enum-validated)
- Pillars: COLLECTING_MORE | SPENDING_BETTER | INNOVATIVE_FINANCING | ENABLER | NON_SCORECARD
- Form fields added to Ringkasan tab (no new tab)
- Indexed pillar for future filtering
```

### 4.8 Kick-off prompt untuk Claude Code

Kalau Alif menjalankan fase ini standalone (di luar orchestrator section 2.1), pakai prompt ini:

> Baca `docs/CHARTER_VIEW_PLAN.md` section 4 (PHASE 1). Implementasikan migration, model update, config, dan form field sesuai spec. Setelah selesai, run `php artisan migrate` lalu `php artisan test --filter=StrategicFields`. Laporkan hasilnya — file yang berubah, hasil test, acceptance criteria mana yang centang — dan STOP. Jangan lanjut ke Phase 2 tanpa konfirmasi saya.

---

## 5. PHASE 2 — Charter View (read-only)

### 5.1 Tujuan

Route baru `/programs/{program}/charter` yang menampilkan satu halaman comprehensive, format mirror slide 20–24 PPT DKMR. Read-only. Tombol "Export Charter PPTX" sebagai placeholder dulu (implementasi di Phase 3).

### 5.2 Files yang dibuat/diubah

| File | Action |
|---|---|
| `routes/web.php` | EDIT (tambah satu route) |
| `app/Http/Controllers/Program/CharterController.php` | NEW |
| `app/Services/ProgramCharterService.php` | NEW (data assembly logic) |
| `resources/js/Pages/Programs/Charter.tsx` | NEW |
| `resources/js/Pages/Programs/Charter/HeaderStrip.tsx` | NEW |
| `resources/js/Pages/Programs/Charter/ActivityTimelineTable.tsx` | NEW |
| `resources/js/Pages/Programs/Charter/StatusPanel.tsx` | NEW |
| `resources/js/Pages/Programs/Charter/UpdatePanel.tsx` | NEW |
| `resources/js/Pages/Programs/Charter/PicaNextStepRow.tsx` | NEW |
| `resources/js/Pages/Programs/Charter/KpiProgressTable.tsx` | NEW |
| `resources/js/Pages/Programs/Charter/charter.css` | NEW (atau pakai Tailwind utility — pilih konsisten dengan pola existing) |
| `resources/js/Pages/Programs/Detail/HeaderActions.tsx` | EDIT (tambah link `Lihat sebagai Charter →`) |
| `resources/js/types/charter.ts` | NEW (TypeScript types) |
| `tests/Feature/Program/CharterViewTest.php` | NEW |

### 5.3 Route

```php
// routes/web.php — di group authenticated
Route::get('/programs/{program}/charter', [CharterController::class, 'show'])
    ->name('programs.charter')
    ->middleware('can:view,program');
```

### 5.4 Controller skeleton

```php
<?php
namespace App\Http\Controllers\Program;

use App\Http\Controllers\Controller;
use App\Models\Program;
use App\Services\ProgramCharterService;
use Inertia\Inertia;

class CharterController extends Controller
{
    public function __construct(
        private readonly ProgramCharterService $charterService
    ) {}

    public function show(Program $program)
    {
        $this->authorize('view', $program);

        $charter = $this->charterService->assemble($program);

        return Inertia::render('Programs/Charter', [
            'program' => $charter['program'],
            'activities' => $charter['activities'],
            'status' => $charter['status'],
            'kpi' => $charter['kpi'],
            'latestProgressLog' => $charter['latestProgressLog'],
            'kpiHistory' => $charter['kpiHistory'],
        ]);
    }
}
```

### 5.5 Service contract

`ProgramCharterService::assemble(Program $program): array` mengembalikan struktur:

```php
[
    'program' => [
        'id' => int,
        'name' => string,
        'strategicObjective' => string|null,
        'pillar' => string|null,
        'pillarLabel' => string|null,
        'divisionName' => string,
        'directorateName' => string,
        'pic' => ['name' => string, 'position' => string],
        'period' => ['from' => string, 'to' => string], // YYYY-MM
        'currentMonth' => string, // YYYY-MM
    ],
    'activities' => [
        [
            'id' => int,
            'name' => string, // = Task.name
            'workstream' => string, // parent workstream name
            'deliverable' => string|null, // = Task.output
            'periodicity' => string|null, // "Bulanan" | "TW" | "Semester" | "Tahunan"
            'months' => [
                'Jan' => ['target' => bool, 'realized' => bool, 'below' => bool],
                'Feb' => [...],
                // ...
                'Des' => [...],
            ],
        ],
        // ... per Task
    ],
    'status' => [
        'health' => 'ON_TRACK'|'AT_RISK'|'TERLAMBAT'|'COMPLETED',
        'achievementPct' => float|null, // null if non-scorecard
        'badgeColor' => string, // for FE styling
        'completedCount' => int,
        'totalCount' => int,
    ],
    'kpi' => [
        // null jika program non-scorecard
        'name' => string,
        'target' => float,
        'unit' => string,
        'glossary' => string|null, // KpiDefinition.formula or description
    ],
    'latestProgressLog' => [
        'asOfMonth' => string, // "Minggu ke X bulan Y"
        'updateNote' => string|null, // ProgressLog.progressNote (Update Saat Ini)
        'problemIdentification' => string|null, // ProgressLog.kendala
        'correctiveAction' => string|null,
        'nextStep' => string|null,
        'supportNeeded' => string|null, // dukungan dibutuhkan
    ],
    'kpiHistory' => [
        // dari KpiValue, target vs real per bulan
        'rows' => [
            [
                'label' => string, // "EBITDA (Rp Triliun)"
                'months' => [
                    'Jan' => ['target' => float|null, 'real' => float|null, 'aboveTarget' => bool],
                    // ...
                ],
            ],
        ],
    ],
];
```

### 5.6 Logic month-from-week derivation

Untuk setiap `Task`:

- `plannedWeeks` adalah array nomor minggu ISO (1–53) yang di-target.
- Untuk bulan tertentu (mis. Juni 2026), ambil semua nomor minggu ISO yang jatuh di bulan itu. Bulan ter-target jika ada minimal 1 minggu overlap dengan `plannedWeeks`.
- Same logic untuk `actualWeeks` → `realized`.
- `below` = bulan ter-target tapi tidak ter-realisasi sampai akhir bulan (untuk styling oranye seperti PPT slide 21 cell PTPN I).

Helper:

```php
// app/Services/Helpers/WeekToMonthMapper.php
class WeekToMonthMapper {
    public static function isMonthTargeted(array $plannedWeeks, int $year, int $month): bool;
    public static function isMonthRealized(array $actualWeeks, int $year, int $month): bool;
    public static function getWeeksInMonth(int $year, int $month): array; // returns [22, 23, 24, 25, 26] for June 2026
}
```

### 5.7 Component breakdown (React)

```
Charter.tsx (page root, AppShell wrapped)
├─ HeaderStrip                  → metadata atas: SO + KPI + PIC + Period + Health badge + Export button
├─ Grid 2-col (1.55fr 1fr)
│  ├─ ActivityTimelineTable     → tabel aktivitas dengan 12 kolom bulan, Target/Real rows, cell colored
│  └─ Side rail
│     ├─ StatusPanel            → % achievement besar, label health, breakdown PTPN if applicable
│     └─ UpdatePanel            → "Update Saat Ini" dari latestProgressLog.updateNote
├─ PicaNextStepRow              → 2-col: Problem→CA card + Next Step card
└─ KpiProgressTable             → tabel Target vs Real per bulan dari kpiHistory
```

### 5.8 Print CSS

```css
/* charter.css */
@media print {
  @page { size: A4 landscape; margin: 0.6cm; }
  .charter-export-button,
  .page-shell__sidebar,
  .page-shell__topbar { display: none !important; }
  .charter-page { font-size: 9pt; }
  .charter-page .activity-timeline-table { page-break-inside: avoid; }
}
```

### 5.9 Header link di ProgramDetailView

Cari `Detail/HeaderActions.tsx` (atau equivalent — sesuaikan dengan pola Pattern A). Tambahkan link:

```tsx
<Link
  href={route('programs.charter', { program: program.id })}
  className="charter-link"
>
  Lihat sebagai Charter <ArrowRight size={14} />
</Link>
```

### 5.10 Acceptance criteria Phase 2

- [ ] Route `/programs/{id}/charter` accessible, RBAC enforced
- [ ] Halaman render dengan data lengkap untuk program scorecard (mis. salah satu program DKSA)
- [ ] Halaman render dengan graceful fallback untuk program non-scorecard (panel KPI hidden, status panel pakai "Non-Scorecard")
- [ ] Cell timeline berwarna: hijau target, hijau gelap realized, oranye below-target
- [ ] Print preview (`Cmd+P`) tampil rapi di A4 landscape
- [ ] Link "Lihat sebagai Charter →" muncul di ProgramDetailView
- [ ] Test `tests/Feature/Program/CharterViewTest.php` minimal cover: render OK, RBAC denied untuk non-authorized user, non-scorecard program render OK
- [ ] Tidak ada test existing yang regres

### 5.11 Commit messages

```
feat(charter): scaffold read-only Charter View route and page
feat(charter): implement ActivityTimelineTable with month-from-week derivation
feat(charter): wire StatusPanel + UpdatePanel + PicaNextStepRow + KpiProgressTable
feat(charter): add print CSS for A4 landscape
feat(charter): link from ProgramDetailView header
```

### 5.12 Kick-off prompt untuk Claude Code

Kalau Alif menjalankan fase ini standalone (di luar orchestrator section 2.1), pakai prompt ini:

> Baca `docs/CHARTER_VIEW_PLAN.md` section 5 (PHASE 2). Implementasi bertahap sesuai sub-section 5.4 → 5.5 → 5.7. Mulai dari controller skeleton + service contract, lalu komponen FE satu per satu. Setiap komponen selesai, jalankan `npm run build` dan `php artisan test --filter=CharterView`. Untuk format visual cell timeline, referensi PPT slide 21 di `docs/reference/2026_MEI_Monitoring_Program_Kerja_DKMR.pptx`. Laporkan progress per komponen. Di akhir fase, laporkan acceptance criteria mana yang centang dan STOP. Jangan lanjut ke Phase 3 — saya mau demo dulu ke sponsor.

---

## 6. PHASE 3 — Export PPTX

### 6.1 Decision: client-side via pptxgenjs

Alasan:
- Alif sudah familiar dengan pptxgenjs (dipakai untuk SOP quality checker dan stress test PPT sebelumnya).
- Tidak menambah dependency PHP/Composer.
- Data sudah ada di props Inertia, tidak perlu round-trip ke server.
- Generation < 2 detik untuk single program.
- Tradeoff: bundle size +~250KB. Dipisah ke chunk lazy-loaded saat tombol diklik.

Multi-program export (deck per direktorat) → defer ke Phase 3.5 atau later, evaluasi server-side path nanti.

### 6.2 Files yang dibuat/diubah

| File | Action |
|---|---|
| `package.json` | EDIT (`pptxgenjs` dependency) |
| `resources/js/lib/exporters/programCharterPptx.ts` | NEW |
| `resources/js/lib/exporters/charterTemplate.ts` | NEW (layout constants) |
| `resources/js/Pages/Programs/Charter.tsx` | EDIT (wire export button) |
| `resources/js/Pages/Programs/Charter/ExportButton.tsx` | NEW |
| `tests/Frontend/exporters/programCharterPptx.test.ts` | NEW (Vitest, kalau setup ada) |

### 6.3 Install

```bash
npm install pptxgenjs
```

### 6.4 Lazy load pattern

```tsx
// ExportButton.tsx
const handleExport = async () => {
  setLoading(true);
  const { exportProgramCharter } = await import('@/lib/exporters/programCharterPptx');
  await exportProgramCharter(charterData);
  setLoading(false);
};
```

Ini memastikan pptxgenjs hanya di-bundle saat user benar-benar klik export, bukan di initial page load.

### 6.5 Exporter contract

```ts
// resources/js/lib/exporters/programCharterPptx.ts
import pptxgen from 'pptxgenjs';
import { CharterData } from '@/types/charter';
import { LAYOUT, COLORS } from './charterTemplate';

export async function exportProgramCharter(data: CharterData): Promise<void> {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inches

  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  buildHeaderStrip(slide, data);
  buildActivityTable(slide, data);
  buildStatusPanel(slide, data);
  buildUpdatePanel(slide, data);
  buildPicaRow(slide, data);
  buildKpiProgressTable(slide, data);
  buildFooter(slide, data);

  const filename = `Charter_${slugify(data.program.name)}_${data.program.currentMonth}.pptx`;
  await pres.writeFile({ fileName: filename });
}

// Per-section builders adalah functions terpisah, masing-masing terima slide + data
```

### 6.6 Template constants

```ts
// charterTemplate.ts
export const LAYOUT = {
  HEADER: { x: 0.3, y: 0.3, w: 12.7, h: 0.8 },
  ACTIVITY_TABLE: { x: 0.3, y: 1.2, w: 7.5, h: 4.0 },
  STATUS_PANEL: { x: 8.0, y: 1.2, w: 2.4, h: 1.8 },
  UPDATE_PANEL: { x: 8.0, y: 3.1, w: 4.9, h: 2.1 },
  PICA_PROBLEM: { x: 0.3, y: 5.4, w: 4.5, h: 1.3 },
  PICA_NEXT_STEP: { x: 5.0, y: 5.4, w: 3.8, h: 1.3 },
  KPI_PROGRESS: { x: 9.0, y: 5.4, w: 4.0, h: 1.3 },
  FOOTER: { x: 0.3, y: 7.0, w: 12.7, h: 0.3 },
};

export const COLORS = {
  // ikut palette PPT DKMR
  PRIMARY: '00875A',      // hijau Danantara
  PRIMARY_DARK: '004D33',
  TARGET: '97C459',       // hijau muda untuk target
  REALIZED: '3B6D11',     // hijau tua untuk realisasi
  BELOW: 'F0997B',        // oranye untuk below target
  AT_RISK: 'BA7517',      // amber
  DELAYED: 'A32D2D',      // merah
  COMPLETED: '3B6D11',    // hijau tua
  TEXT_PRIMARY: '212121',
  TEXT_SECONDARY: '6B7280',
  BORDER: 'E5E7EB',
};
```

### 6.7 Activity table builder — paling tricky

Pptxgenjs `addTable` syntax dengan cell shading per status. Pseudo:

```ts
function buildActivityTable(slide, data) {
  const headerRow = [
    { text: 'Aktivitas', options: { bold: true, fill: COLORS.PRIMARY, color: 'FFFFFF' } },
    { text: 'Output', options: { bold: true, fill: COLORS.PRIMARY, color: 'FFFFFF' } },
    { text: '', options: { bold: true, fill: COLORS.PRIMARY } }, // T/R column
    ...['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'].map(m => ({
      text: m, options: { bold: true, fill: COLORS.PRIMARY, color: 'FFFFFF', align: 'center' }
    })),
  ];

  const bodyRows = data.activities.flatMap(activity => [
    // Target row
    [
      { text: activity.name, options: { rowspan: 2, valign: 'middle' } },
      { text: activity.deliverable || '-', options: { rowspan: 2, valign: 'middle' } },
      { text: 'T', options: { fontSize: 8, color: COLORS.TEXT_SECONDARY } },
      ...MONTHS.map(m => ({
        text: '',
        options: {
          fill: activity.months[m].target ? COLORS.TARGET : 'FFFFFF',
        }
      })),
    ],
    // Real row
    [
      { text: 'R', options: { fontSize: 8, color: COLORS.TEXT_SECONDARY } },
      ...MONTHS.map(m => ({
        text: '',
        options: {
          fill: activity.months[m].realized
            ? COLORS.REALIZED
            : activity.months[m].below ? COLORS.BELOW : 'FFFFFF',
        }
      })),
    ],
  ]);

  slide.addTable([headerRow, ...bodyRows], {
    ...LAYOUT.ACTIVITY_TABLE,
    fontSize: 9,
    border: { type: 'solid', color: COLORS.BORDER, pt: 0.5 },
  });
}
```

**Catatan**: pptxgenjs `rowspan` di body rows kadang quirky. Kalau bermasalah, alternatifnya pakai 1 row per activity tanpa rowspan dengan content "Target: ... / Real: ..." gabung — verbose tapi reliable. Decide saat implementasi.

### 6.8 Acceptance criteria Phase 3

- [ ] `npm install pptxgenjs` masuk ke `package.json`, lock file ter-commit
- [ ] Tombol Export di Charter View berfungsi, file `.pptx` ter-download
- [ ] File bisa dibuka tanpa warning di PowerPoint 2019+, Keynote, dan LibreOffice Impress
- [ ] Layout slide visual close enough dengan slide 20–24 PPT referensi (acceptable kalau tidak 100% pixel-perfect — yang penting struktur identik)
- [ ] Bundle Charter View di-load lazy, initial bundle tidak naik > 30 KB karena ini
- [ ] Filename format: `Charter_<slug-program-name>_<YYYY-MM>.pptx`
- [ ] Test render PPT untuk 3 program berbeda (scorecard normal, non-scorecard, program dengan banyak workstream) — visual inspect

### 6.9 Commit messages

```
chore: add pptxgenjs dependency
feat(charter): add programCharterPptx exporter with section builders
feat(charter): wire Export button with lazy-loaded exporter
feat(charter): tune layout constants to match PPT DKMR brand
```

### 6.10 Kick-off prompt untuk Claude Code

Kalau Alif menjalankan fase ini standalone (di luar orchestrator section 2.1), pakai prompt ini:

> Baca `docs/CHARTER_VIEW_PLAN.md` section 6 (PHASE 3). Install pptxgenjs, scaffold exporter dengan structure di sub-section 6.5, lalu implementasikan section builders satu per satu mulai dari Header → Activity Table → Status → Update → PICA → KPI Progress. Setelah setiap builder selesai, run quick manual test (klik export, buka file, screenshot). Untuk Activity Table cell shading, referensi PPT slide 21 di `docs/reference/2026_MEI_Monitoring_Program_Kerja_DKMR.pptx`. Laporkan dengan screenshot tiap section yang selesai. Di akhir fase, laporkan acceptance criteria mana yang centang dan STOP. Jangan lanjut ke Phase 4 tanpa konfirmasi saya.

---

## 7. PHASE 4 — Vocabulary lock

### 7.1 Tujuan

Standardize istilah status di seluruh ATLAS supaya identik dengan PPT DKMR:

| Standar | Catatan |
|---|---|
| **On Track** | Untuk program dengan progress sesuai timeline |
| **At Risk** | Untuk program dengan kendala berpotensi menghambat |
| **Terlambat** | Untuk program yang sudah melewati timeline. *Catatan*: PPT pakai "Delayed", ATLAS pakai "Terlambat" — keduanya dipakai oleh Pak Dirkeu di forum yang berbeda. **Tetap pakai "Terlambat"** karena itu yang dipilih untuk UI ATLAS, tapi di PPTX export pakai "Delayed" agar match PPT manual. |
| **Completed** | Untuk program selesai. *Catatan*: bukan "Selesai" — PPT pakai "Completed". |

### 7.2 Audit step

```bash
# Cari penggunaan inkonsisten
grep -rn "Selesai" resources/js/ app/ --include="*.tsx" --include="*.ts" --include="*.php" \
  | grep -v "node_modules" | grep -vi "test"

grep -rn "delayed\|terlambat" resources/js/ app/ --include="*.tsx" --include="*.ts" --include="*.php" \
  | grep -v "node_modules" | grep -vi "test"
```

### 7.3 Replace map (sample, review dulu sebelum apply)

| Find | Replace | Where |
|---|---|---|
| `"Selesai"` (sebagai status label, BUKAN di kalimat narrative) | `"Completed"` | UI labels, badge text |
| `"selesai"` di enum/constant | `"completed"` | code level |
| Di PPTX exporter saja: `"Terlambat"` | `"Delayed"` | exporter only |

**Jangan replace** "selesai" di kalimat seperti "tugas telah selesai dikerjakan" — itu bahasa narrative, bukan status label.

### 7.4 Files yang kemungkinan kena

- Enum di `app/Models/Program.php` (kalau ada const status)
- `config/atlas-thresholds.php` (label mapping)
- `resources/js/types/program.ts` (TypeScript enum)
- Komponen badge: `resources/js/components/StatusBadge.tsx` atau equivalent

### 7.5 Acceptance criteria Phase 4

- [ ] Grep `"Selesai"` di UI labels = 0 hits (atau hanya yang narrative, dengan note)
- [ ] Status badge di Home, Programs list, ProgramDetail, Charter View — semua tampilkan label konsisten
- [ ] PPTX export pakai "Delayed" (match PPT), UI pakai "Terlambat"
- [ ] Tidak ada test regression

### 7.6 Commit message

```
refactor(vocab): align status labels with PPT DKMR standard

- "Selesai" → "Completed" in UI status labels
- PPTX exporter uses "Delayed" to match manual PPT format
- UI keeps "Terlambat" per Pak Dirkeu directive for in-app vocabulary
```

### 7.7 Kick-off prompt untuk Claude Code

Kalau Alif menjalankan fase ini standalone (di luar orchestrator section 2.1), pakai prompt ini:

> Baca `docs/CHARTER_VIEW_PLAN.md` section 7 (PHASE 4). Jalankan audit grep di 7.2, tampilkan hasilnya. STOP setelah audit — jangan replace apapun. Tunggu saya review hasil grep dan kasih instruksi replace mana yang aman. Setelah saya approve daftar replace, baru eksekusi sesuai 7.3. Di akhir, run test suite full dan laporkan.

---

## 8. Verifikasi end-to-end

Setelah Phase 1–4 selesai dan sebelum merge ke main:

### 8.1 Smoke test manual

1. **Login sebagai BOD** → buka program scorecard apapun → klik Charter → verify layout match PPT slide 20 secara struktural.
2. **Login sebagai Kadiv DKSA** → buka program non-scorecard → verify panel KPI hidden, sisanya tetap render.
3. **Login sebagai Asisten** → akses Charter program direktorat lain → harus 403.
4. **Klik Export di 3 program berbeda** → buka file `.pptx` di Keynote dan PowerPoint Online → verify rapi.
5. **Print preview Charter** (`Cmd+P`) → verify A4 landscape muat 1 halaman.
6. **Buka Programs list → Home → Channels** → verify tidak ada regresi visual.

### 8.2 Automated test

```bash
php artisan test
npm run test  # kalau Vitest setup ada
```

Target: 111/111 (atau 112/113 dengan tambahan Charter tests). Decimal serialization yang flaky bisa di-fix bareng atau dibiarkan.

### 8.3 Performance check

```bash
npm run build
# Inspect dist size — Charter chunk should be separate, < 350KB gzipped (pptxgenjs included)
```

### 8.4 Production deploy

Setelah merge ke main, deploy ke Railway. Verify:
- Migration jalan otomatis
- Charter route accessible di production
- Export PPTX berfungsi (tidak ada CSP issue)

### 8.5 Stakeholder demo

Demo ke Pak Dirkeu via Channel `panduan-channels` atau pertemuan langsung:
1. Tampilkan Charter View untuk salah satu program DKMR aktif.
2. Klik Export → buka file.
3. Tanya feedback: apakah layout siap dipakai untuk MRC?

---

## 9. Appendix

### 9.1 File path map (quick reference)

```
atlas-fullstack/
├── app/
│   ├── Http/Controllers/Program/
│   │   └── CharterController.php          [NEW Phase 2]
│   ├── Services/
│   │   ├── ProgramCharterService.php      [NEW Phase 2]
│   │   └── Helpers/WeekToMonthMapper.php  [NEW Phase 2]
│   └── Models/Program.php                  [EDIT Phase 1]
├── config/atlas-thresholds.php             [EDIT Phase 1]
├── database/migrations/
│   └── 2026_05_15_000000_add_strategic_fields_to_program.php  [NEW Phase 1]
├── resources/js/
│   ├── Pages/Programs/
│   │   ├── Charter.tsx                    [NEW Phase 2]
│   │   └── Charter/
│   │       ├── HeaderStrip.tsx            [NEW Phase 2]
│   │       ├── ActivityTimelineTable.tsx  [NEW Phase 2]
│   │       ├── StatusPanel.tsx            [NEW Phase 2]
│   │       ├── UpdatePanel.tsx            [NEW Phase 2]
│   │       ├── PicaNextStepRow.tsx        [NEW Phase 2]
│   │       ├── KpiProgressTable.tsx       [NEW Phase 2]
│   │       ├── ExportButton.tsx           [NEW Phase 3]
│   │       └── charter.css                [NEW Phase 2]
│   ├── lib/exporters/
│   │   ├── programCharterPptx.ts          [NEW Phase 3]
│   │   └── charterTemplate.ts             [NEW Phase 3]
│   └── types/charter.ts                   [NEW Phase 2]
├── routes/web.php                          [EDIT Phase 2]
├── tests/Feature/Program/
│   ├── StrategicFieldsTest.php            [NEW Phase 1]
│   └── CharterViewTest.php                [NEW Phase 2]
├── docs/
│   ├── CHARTER_VIEW_PLAN.md               [THIS FILE]
│   └── reference/
│       └── 2026_MEI_Monitoring_Program_Kerja_DKMR.pptx  [REFERENCE]
└── CLAUDE.md                               [EDIT - addendum section 3]
```

### 9.2 Commands cheatsheet

```bash
# Phase 1
php artisan make:migration add_strategic_fields_to_program --table=Program
php artisan migrate
php artisan test --filter=StrategicFields

# Phase 2
php artisan make:controller Program/CharterController
# manual create service + page components
php artisan test --filter=CharterView
npm run build

# Phase 3
npm install pptxgenjs
# manual create exporter
npm run build && ls -lh public/build/assets/ | grep charter

# Phase 4
grep -rn '"Selesai"' resources/js/ app/ --include="*.tsx" --include="*.ts" --include="*.php"
php artisan test
npm run test
```

### 9.3 Risk register

| Risiko | Probability | Mitigation |
|---|---|---|
| Pptxgenjs rowspan quirk di Activity Table | Medium | Fallback ke flat row tanpa rowspan, content "T: ... / R: ..." |
| Week-to-month mapping edge case (minggu yang lintasi bulan) | High | Helper unit test untuk W23 yang berada di Mei akhir + Juni awal — define: bulan ter-target jika lebih banyak hari di bulan itu |
| Bundle size meningkat signifikan | Medium | Lazy load exporter, verify dengan `npm run build` |
| Pak Dirkeu minta layout berbeda dari yang dirancang | High | Demo early di Phase 2 sebelum bangun PPTX export — hemat rework |
| Migration race dengan deploy production | Low | Test di Railway preview environment dulu |

### 9.4 Out of scope (untuk fase ini)

- Multi-program PPTX export (deck per direktorat) — defer Phase 3.5+
- Charter View untuk Direktorat-level rollup (analogous slide 17 dashboard) — defer
- Email Charter sebagai attachment terjadwal — defer
- Charter mode untuk Workstream atau Task individual — out of scope (Charter adalah Program-level concept)
- WhatsApp / Slack share Charter link — defer
- Edit-from-Charter (inline edit) — out of scope (Charter is read-only)

### 9.5 Definition of Done

Plan ini dianggap selesai eksekusi ketika:

1. Branch `feat/charter-view` ter-merge ke `main` via PR
2. Deploy ke production sukses
3. Pak Dirkeu sudah lihat demo dan approve (minimal verbally)
4. 1 program nyata sudah di-Charter-kan + export PPTX-nya digunakan untuk rapat MRC W3 atau W4 Mei 2026
5. `STATUS_ATLAS.md` di-update menambah Charter View ke modul aktif

---

*Plan ini ditulis untuk eksekusi semi-otonom oleh Claude Code di IDE. Setiap section punya kick-off prompt yang bisa di-paste langsung. Phase berurutan — jangan lompat. Saat ragu, default ke "augment, don't replace".*
