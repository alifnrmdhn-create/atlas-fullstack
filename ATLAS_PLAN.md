# ATLAS Fullstack — Implementation Plan (Target: 10/10)

> Dibuat: 28 Apr 2026  
> Status: In Progress  
> Tujuan: Menyelesaikan semua plothole frontend ↔ backend, fix broken features, dan sempurnakan UX/flow hingga skor 10/10.

---

## Cara Baca Dokumen Ini

Setiap item punya:
- **File yang diubah** (path spesifik)
- **Apa yang rusak** (fakta dari kode)
- **Apa yang harus dilakukan** (instruksi konkret)
- **Status** (`[ ]` belum / `[x]` selesai)

---

## PHASE 1 — Critical Bugs (App-Breaking)

> Fix dulu sebelum apapun. Ini menyebabkan fitur mati total atau security gap.

---

### 1.1 — Execution Grid: Endpoint Tidak Ada (Core Feature Mati)

**Status:** `[ ]`

**Bukti dari kode:**
- `ExecutionTab.tsx:15` memanggil `GET /programs/{id}/execution-grid?workstreamId={id}`
- `ExecutionTab.tsx:14` memanggil `GET /programs/{id}/execution-grid.xlsx`
- `ExecutionGrid.tsx` memanggil `PUT` untuk toggle `actualWeeks`
- `routes/web.php`: tidak ada satupun route `execution-grid`
- `ProgramController.php`: tidak ada method `executionGrid`, `executionGridExport`, atau `updateActualWeeks`

**Dampak:** Tab "Jadwal Mingguan" di `ProgramDetailView` dan tab "Execution" di `ProgramsView` langsung error saat dibuka. Fitur inti perencanaan mingguan tidak bisa digunakan sama sekali.

**Yang harus dibuat:**

**A. Backend — Controller baru**

File baru: `app/Http/Controllers/ExecutionGridController.php`

```
Method: executionGrid(Request $request, int $programId)
  - Ambil program + validasi akses
  - Ambil workstreamId dari query string (?workstreamId=X)
  - Load workstream dengan phases + steps (tasks) + picUnits + picPersons
  - Hitung weekRange: dari startDate program sampai targetEndDate (atau +4 minggu jika sudah lewat)
  - Build monthHeaders: group weeks by month
  - Return ExecutionGridData shape persis seperti di types.ts

Method: updateActualWeeks(Request $request, int $programId, int $stepId)
  - Terima payload: { weekIso: string, action: 'add' | 'remove' }
  - Validasi week format (YYYY-Www)
  - Update Task.actualWeeks JSONB array
  - Trigger health recompute via ProgramHealthService
  - Broadcast perubahan via BroadcastService
  - Return updated step data

Method: exportXlsx(Request $request, int $programId)
  - Ambil grid data sama seperti executionGrid()
  - Gunakan PhpSpreadsheet untuk generate .xlsx
  - Format: header baris Plan + Real per step, kolom per minggu
  - Return response()->download()
```

**B. Backend — Routes**

File: `routes/web.php` di dalam group `programs`

```php
Route::get('/{id}/execution-grid',         [ExecutionGridController::class, 'executionGrid'])->name('execution-grid');
Route::put('/{id}/steps/{stepId}/actual',  [ExecutionGridController::class, 'updateActualWeeks'])->name('steps.actual');
Route::get('/{id}/execution-grid.xlsx',    [ExecutionGridController::class, 'exportXlsx'])->name('execution-grid.xlsx');
```

**C. Frontend — ExecutionGrid.tsx**

Cek apakah PUT endpoint path sudah cocok dengan route baru. Sesuaikan jika berbeda.

---

### 1.2 — OrganizationController: Security Gap (Syntax Error)

**Status:** `[ ]`

**Bukti dari kode:**
- `app/Http/Controllers/OrganizationController.php` line ~923:
  ```php
  Gate: RolePolicy::canManageUsers(...) || abort(403);
  ```
  `Gate:` adalah PHP label syntax, bukan statement. Authorization tidak dieksekusi — siapapun bisa memanggil endpoint ini tanpa izin.

**Yang harus dilakukan:**

File: `app/Http/Controllers/OrganizationController.php`

Cari dan ganti:
```php
Gate: RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
```
Dengan:
```php
RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
```

---

### 1.3 — ProgramService: Program COMPLETED Tidak Muncul di List

**Status:** `[ ]`

**Bukti dari kode:**
- `app/Services/ProgramService.php` method `listForUser()`:
  ```php
  ->whereIn('approvalStatus', ['ACTIVE', 'PENDING_KASUB', 'PENDING_KADIV', 'DRAFT']);
  ```
  `COMPLETED` tidak ada. Program yang sudah selesai tidak muncul di ProgramsView manapun (kecuali mungkin Archive tab, tapi Archive pakai `archivedAt`).

**Yang harus dilakukan:**

File: `app/Services/ProgramService.php`

Ubah filter approvalStatus menjadi:
```php
->whereIn('approvalStatus', ['ACTIVE', 'PENDING_KASUB', 'PENDING_KADIV', 'DRAFT', 'COMPLETED']);
```

Tambahkan di frontend `ProgramsView` — filter/tab untuk memisahkan program aktif vs. selesai jika belum ada.

---

### 1.4 — POST /programs/{id}/kpi-internal: Endpoint Tidak Ada

**Status:** `[ ]`

**Bukti dari kode:**
- `ProgramDetailView.tsx` line ~233: `api.post('/programs/{id}/kpi-internal', payload)`
- `routes/web.php`: tidak ada route ini
- `ProgramController.php`: tidak ada method ini

**Dampak:** Form tambah KPI Internal bisa diisi tapi submit-nya 404. User mengira data tersimpan padahal tidak.

**Yang harus dilakukan:**

**A. Backend**

File: `app/Http/Controllers/ProgramController.php`

Tambah method:
```
Method: storeKpiInternal(Request $request, int $id)
  - Validasi: name, targetValue, unitOfMeasure, reviewFrequency
  - Buat KpiDefinition dengan programId = $id
  - Return KPI baru sebagai JSON
```

File: `routes/web.php`

```php
Route::post('/{id}/kpi-internal', [ProgramController::class, 'storeKpiInternal'])->name('kpi-internal.store');
```

**B. Frontend**

File: `ProgramDetailView.tsx`

Verifikasi bahwa setelah POST berhasil, list KPI di-refresh dan form di-reset.

---

### 1.5 — RealtimeController: NULL JSONB Silent Failure

**Status:** `[ ]`

**Bukti dari kode:**
- `app/Http/Controllers/RealtimeController.php` line ~76:
  ```php
  $q->whereRaw('"userIds"::jsonb @> ?::jsonb', [json_encode($user->id)]);
  ```
  Jika `userIds` kolom bernilai NULL (broadcast untuk semua user), PostgreSQL mengevaluasi `NULL::jsonb @> '5'::jsonb` = NULL (bukan true/false). Query tidak matching siapapun → notifikasi global tidak terkirim.

**Yang harus dilakukan:**

File: `app/Http/Controllers/RealtimeController.php`

Ubah query menjadi:
```php
$q->where(function ($inner) use ($userId) {
    $inner->whereNull('userIds')
          ->orWhereRaw('"userIds"::jsonb @> ?::jsonb', [json_encode($userId)]);
});
```

---

### 1.6 — KPI NULL targetValue → Otomatis GREEN/RED

**Status:** `[ ]`

**Bukti dari kode:**
- `app/Http/Controllers/ProgramController.php` method `health()`:
  ```php
  (float) $k->targetValue  // NULL → 0.0
  ```
  KPI dengan target NULL dicompute dengan target 0. Jika actualValue > 0 → GREEN (melampaui target 0). Ini misleading.

**Yang harus dilakukan:**

File: `app/Http/Controllers/ProgramController.php` method `health()`

Tambah guard sebelum memanggil `kpiStatus()`:
```php
if ($k->targetValue === null) continue; // skip KPI tanpa target
```

---

## PHASE 2 — Data Model Fixes

> Fix relasi model yang hilang, naming yang ambigu, dan data integrity.

---

### 2.1 — Program Model: Relasi ke KPI, Task, dan Blocker Hilang

**Status:** `[ ]`

**Bukti dari kode:**
- `app/Models/Program.php`: tidak ada `kpis()`, `tasks()`, `blockers()`
- `ProgramController::health()` query KPI manual: `KpiDefinition::where('programId', $id)`
- Tidak ada `hasManyThrough` untuk Tasks (Program → Workstream → Task)
- Tidak ada path ke Blockers (Program → Workstream → Task → Blocker)

**Yang harus dilakukan:**

File: `app/Models/Program.php`

Tambah relasi:
```php
public function kpis(): HasMany
{
    return $this->hasMany(KpiDefinition::class, 'programId');
}

public function tasks(): HasManyThrough
{
    return $this->hasManyThrough(
        Task::class, Workstream::class,
        'programId',   // FK on Initiative (Workstream table)
        'initiativeId', // FK on WorkItem (Task table)
        'id', 'id'
    );
}
```

Untuk `blockers()`, karena perlu 3 level, gunakan query scope:
```php
public function blockerCount(): int
{
    return Blocker::whereIn('workItemId', $this->tasks()->pluck('id'))->count();
}
```

Refactor `ProgramController::health()` untuk menggunakan `$program->kpis()` instead of manual query.

---

### 2.2 — Task Status Transition: Tidak Divalidasi

**Status:** `[ ]`

**Bukti dari kode:**
- `routes/web.php`: `PUT /tasks/{id}/status` → `TaskController::updateStatus()`
- `TaskController` hanya pass status langsung ke service tanpa validasi transisi
- Bisa ubah dari `COMPLETED` → `BACKLOG` tanpa konfirmasi

**Transisi valid yang harus dienforce:**
```
BACKLOG → IN_PROGRESS
IN_PROGRESS → COMPLETED
IN_PROGRESS → ON_HOLD
ON_HOLD → IN_PROGRESS
ON_HOLD → CANCELLED
IN_PROGRESS → CANCELLED
COMPLETED → IN_PROGRESS  (reopen — allowed tapi require reason)
```

**Yang harus dilakukan:**

File: `app/Services/TaskService.php` method `transitionStatus()`

Tambah validasi:
```php
$allowed = [
    'BACKLOG'     => ['IN_PROGRESS'],
    'IN_PROGRESS' => ['COMPLETED', 'ON_HOLD', 'CANCELLED'],
    'ON_HOLD'     => ['IN_PROGRESS', 'CANCELLED'],
    'COMPLETED'   => ['IN_PROGRESS'], // reopen
];

if (!in_array($newStatus, $allowed[$current] ?? [], true)) {
    throw new InvalidTransitionException("Cannot transition from $current to $newStatus");
}
```

---

### 2.3 — Approval History: Tidak Ada Log

**Status:** `[ ]`

**Bukti dari kode:**
- `ProgramController::approve()`, `reject()`, `submit()` hanya update `approvalStatus` field
- Tidak ada tabel log approval
- Jika program di-reject lalu di-submit ulang, rejection note pertama tertimpa

**Yang harus dilakukan:**

**A. Migration baru**

File baru: `database/migrations/XXXX_create_program_approval_log_table.php`

```
Tabel: ProgramApprovalLog
Kolom: id, programId, action (SUBMITTED|APPROVED|REJECTED|ACTIVATED),
       fromStatus, toStatus, byUserId, note, createdAt
```

**B. Model baru**

File baru: `app/Models/ProgramApprovalLog.php`

**C. Update ProgramController**

Di setiap method (submit, approve, reject, activate): tambah `ProgramApprovalLog::create([...])` setelah update status.

**D. Route baru**

```php
Route::get('/{id}/approval-log', [ProgramController::class, 'approvalLog'])->name('approval-log');
```

**E. Frontend**

File: `ProgramDetailView.tsx` tab "Ringkasan"

Tampilkan timeline approval history di bagian bawah panel metadata.

---

### 2.4 — classifyProgramHealth: null approvalStatus Diklasifikasikan Salah

**Status:** `[ ]`

**Bukti dari kode:**
- `app/Http/Controllers/OrganizationController.php` method `classifyProgramHealth()`:
  ```php
  if (!in_array($p->approvalStatus, ['ACTIVE', 'COMPLETED'])) return 'draft';
  ```
  Jika `approvalStatus` adalah NULL (seharusnya tidak terjadi tapi bisa pada data lama), program apapun diklasifikasikan sebagai `'draft'` meskipun `status === 'COMPLETED'`.

**Yang harus dilakukan:**

File: `app/Http/Controllers/OrganizationController.php`

Pastikan pengecekan `status === 'COMPLETED'` ada **sebelum** pengecekan approvalStatus:
```php
if ($p->status === 'COMPLETED' || $p->approvalStatus === 'COMPLETED') return 'selesai';
if (empty($p->approvalStatus) || !in_array($p->approvalStatus, ['ACTIVE', 'COMPLETED'])) return 'draft';
```

---

## PHASE 3 — Missing Feature: Progress Log

> Mengganti `progresTerkini` (single string) dengan entitas log yang proper. Ini adalah fondasi untuk auto-reporting.

---

### 3.1 — Buat Tabel & Model ProgressLog

**Status:** `[ ]`

**Konteks:**  
Saat ini `Program.progresTerkini` dan `Program.dukunganDibutuhkan` adalah string tunggal yang tertimpa setiap update. Tidak ada history, timestamp, atau audit trail. Ini menyebabkan:
- Laporan bulanan harus diketik manual karena data progress tidak tersimpan per periode
- Tidak bisa melihat riwayat perkembangan program
- HomeView `recentActivity` tidak bisa menampilkan progress updates

**Yang harus dibuat:**

**A. Migration baru**

File baru: `database/migrations/XXXX_create_program_progress_log_table.php`

```
Tabel: ProgramProgressLog
Kolom:
  - id
  - programId (FK → Program.id)
  - period (string, format YYYY-WXX atau YYYY-MM) — minggu/bulan laporan
  - healthAtTime (enum: on_track|at_risk|terlambat|overdue)
  - narrative (text) — progres terkini
  - kendala (text nullable) — hambatan yang dihadapi
  - dukunganDibutuhkan (text nullable) — support yang diminta
  - createdById (FK → User.id)
  - createdAt, updatedAt
```

**B. Model baru**

File baru: `app/Models/ProgramProgressLog.php`

**C. Update Program Model**

File: `app/Models/Program.php`

Tambah relasi:
```php
public function progressLogs(): HasMany
{
    return $this->hasMany(ProgramProgressLog::class, 'programId')->orderBy('createdAt', 'desc');
}

public function latestProgressLog(): HasOne
{
    return $this->hasOne(ProgramProgressLog::class, 'programId')->latestOfMany();
}
```

**D. Routes baru**

File: `routes/web.php`

```php
Route::get('/{id}/progress-log',  [ProgramController::class, 'progressLog'])->name('progress-log.index');
Route::post('/{id}/progress-log', [ProgramController::class, 'storeProgressLog'])->name('progress-log.store');
```

**E. Controller methods**

File: `app/Http/Controllers/ProgramController.php`

```
Method: progressLog($id)
  - Return semua log entries untuk program, descending
  
Method: storeProgressLog($request, $id)
  - Validasi: narrative (required), period (required), healthAtTime, kendala, dukunganDibutuhkan
  - Cek duplikasi: jika ada log untuk period yang sama, update saja (jangan buat baru)
  - Simpan ProgramProgressLog
  - Update Program.progresTerkini dan Program.dukunganDibutuhkan dari log terbaru (backward compat)
  - Broadcast activity event
  - Return log entry baru
```

**F. Update ProgramSummaryPayload (WorkspaceController)**

Saat build `recentActivity`, include progress log entries sebagai activity item dengan `action: 'PROGRESS_UPDATED'`.

**G. Frontend — ProgramDetailView**

File: `ProgramDetailView.tsx` tab "Ringkasan"

Ganti field "Progres Terkini" (text area single) dengan:
- Timeline progress log (list of entries: period, health badge, narrative, kendala)
- Form "Update Progres Minggu Ini" di atas timeline:
  - Periode: auto-fill current week (YYYY-WXX), bisa diubah
  - Health: dropdown (On Track / At Risk / Terlambat)
  - Progres terkini: textarea
  - Kendala: textarea (optional)
  - Dukungan dibutuhkan: textarea (optional)
  - Tombol "Simpan Update"

**H. Update types.ts**

Tambah type:
```typescript
export type ProgressLogEntry = {
  id: number
  programId: number
  period: string
  healthAtTime: ProgramHealthToneKey
  narrative: string
  kendala: string | null
  dukunganDibutuhkan: string | null
  createdById: number
  createdByName?: string
  createdAt: string
}
```

---

## PHASE 4 — UX Restructure: Programs Module

> Restrukturisasi navigasi dan tab agar mencerminkan lifecycle workflow yang natural.

---

### 4.1 — ProgramsView: Ganti Tab "Execution" dengan "Monitoring"

**Status:** `[ ]`

**Konteks:**  
Tab "Execution" di `ProgramsView` saat ini menampilkan `ExecutionTab` (single-program grid) di level portfolio — ini salah tempat. User yang ingin lihat execution grid harus masuk ke program detail. Di portfolio level, yang berguna adalah cross-program monitoring matrix.

**Yang harus dilakukan:**

File: `ProgramsView.tsx`

Ubah tab `'execution'` → `'monitoring'`.

Buat komponen `MonitoringMatrix` baru yang menampilkan:
- Tabel: baris = program, kolom = 4 minggu terakhir + minggu ini + 2 minggu ke depan
- Setiap cell: warna berdasarkan apakah ada actual activity di minggu tersebut
  - Hijau = ada actualWeeks entry
  - Kuning = ada plannedWeeks tapi belum ada actual
  - Merah = seharusnya ada (sudah lewat) tapi kosong
  - Abu = tidak ada plan
- Filter: by divisi, by health status
- Data source: endpoint baru `GET /programs/execution-matrix?weeks=7`

**Backend endpoint baru:**

```
GET /programs/execution-matrix?weeks=7
- Ambil semua active programs
- Untuk setiap program, ambil semua tasks dengan plannedWeeks/actualWeeks
- Aggregate per program per minggu: ada plan? ada actual? gap?
- Return matrix data
```

---

### 4.2 — ProgramDetailView: Rename Tab + UX Polish

**Status:** `[ ]`

**Yang harus dilakukan:**

File: `ProgramDetailView.tsx`

Perubahan tab labels:
- `'execution'` label tetap, tapi pastikan setelah Phase 1.1 selesai (API ada) tab ini berfungsi
- Tambah indikator loading yang proper di ExecutionTab jika grid belum load

Perubahan structural:
- Di tab "Ringkasan": tambah section "Riwayat Progress" setelah Phase 3 selesai
- Di tab "Ringkasan": tampilkan approval history timeline setelah Phase 2.3 selesai
- Tab "KPI": gabungkan KPI Internal + APMS dalam satu view yang konsisten (saat ini mungkin split)

---

### 4.3 — ProgramDetailView Tab "Jadwal": Rename + Fix Label

**Status:** `[ ]`

**Yang harus dilakukan:**

File: `ProgramDetailView.tsx`

Rename tab label dari "Execution" / "Jadwal Mingguan" menjadi "Jadwal" secara konsisten (cek di semua tempat label ini muncul).

Pastikan tab menampilkan loading state yang informatif ketika:
- Workstream belum dipilih (belum ada workstreamId)
- Grid sedang loading
- Grid gagal load (tampilkan pesan error yang jelas, bukan blank)

---

## PHASE 5 — Monthly Report: Auto-population dari Execution Data

> Menghubungkan data eksekusi ke laporan bulanan sehingga tidak perlu diketik ulang.

---

### 5.1 — Report Auto-Draft dari Execution State

**Status:** `[ ]`

**Konteks:**  
`MonthlyReport` saat ini berdiri sendiri. Link ke programs hanya via `linkedProgramIds` JSONB array — bukan data pipe. Data yang sudah ada di sistem (progress%, task completion, active blockers, KPI values) tidak masuk otomatis ke laporan.

**Yang harus dilakukan:**

**A. Backend — Endpoint auto-draft**

File: `app/Http/Controllers/MonthlyReportController.php`

Tambah method `autoDraft(Request $request, int $id)`:
```
- Ambil report + linkedProgramIds
- Untuk setiap linked program:
  - Ambil latestProgressLog (dari Phase 3)
  - Hitung task completion rate (bulan ini)
  - Hitung active blocker count
  - Ambil KPI actualValue terbaru
- Return structured draft: array of program summaries siap masuk ke report
```

Route baru:
```php
Route::get('/{id}/auto-draft', [MonthlyReportController::class, 'autoDraft'])->name('auto-draft');
```

**B. Frontend — MonthlyReportDetailView**

Tambah tombol "Import dari Atlas" di header laporan yang:
1. Memanggil `GET /monthly-reports/{id}/auto-draft`
2. Menampilkan preview data yang akan diimport
3. Jika dikonfirmasi, mengisi field laporan dengan data tersebut
4. User masih bisa edit sebelum submit

---

## PHASE 6 — Performance & Consistency

> Pagination, consistent JSON format, dan cleanup teknis.

---

### 6.1 — Pagination untuk Program & Task Index

**Status:** `[ ]`

**Bukti dari kode:**
- `ProgramController::index()` dan `TaskController::index()` return `.get()` — semua record sekaligus
- Tidak ada `paginate()` di service layer

**Yang harus dilakukan:**

File: `app/Services/ProgramService.php` method `listForUser()`

Ubah `.get()` menjadi `.paginate(50)` (atau 30 untuk lebih responsif).

Sesuaikan response format:
```json
{
  "data": [...],
  "meta": {
    "total": 100,
    "perPage": 50,
    "currentPage": 1,
    "lastPage": 2
  }
}
```

File: `ProgramsView.tsx`

Tambah infinite scroll atau "Load more" jika total > perPage.

---

### 6.2 — Consistent JSON Response Format

**Status:** `[ ]`

**Konteks:**  
Beberapa endpoint return `{ "data": [...], "total": N }`, beberapa return `{ "data": [...] }` tanpa total, beberapa return array langsung. Frontend harus handle setiap variasi secara berbeda.

**Yang harus dilakukan:**

Buat helper di `app/Http/Controllers/Controller.php`:
```php
protected function jsonList($data, array $meta = []): JsonResponse
{
    return response()->json([
        'data' => $data,
        'meta' => array_merge(['total' => is_countable($data) ? count($data) : null], $meta),
    ]);
}
```

Gunakan helper ini secara konsisten di semua list endpoints.

---

### 6.3 — EntityPic Cascade Delete

**Status:** `[ ]`

**Konteks:**  
Jika User dihapus, row di tabel `EntityPic` (pivot PIC) tidak ikut terhapus. Orphaned records bisa menyebabkan query error atau data palsu.

**Yang harus dilakukan:**

File migration baru: `database/migrations/XXXX_add_cascade_to_entity_pic.php`

```sql
ALTER TABLE EntityPic 
DROP CONSTRAINT entity_pic_user_id_foreign,
ADD CONSTRAINT entity_pic_user_id_foreign 
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE;
```

---

### 6.4 — Budget Cascade ke Workstream Level

**Status:** `[ ]`

**Konteks:**  
`ProgramDetail.budgetIdr` dan `budgetSpent` hanya ada di level program. Tidak bisa tracking anggaran per workstream atau per fase.

**Yang harus dilakukan:**

**A. Migration**

Tambah kolom `budgetIdr` dan `budgetSpent` ke tabel `Initiative` (Workstream).

**B. Update WorkspaceController**

Saat return workstream data, include budget fields.

**C. Frontend — ProgramDetailView**

Di tab "Ringkasan" atau "Struktur", tampilkan budget per workstream jika ada.

---

## PHASE 7 — Naming & Documentation Cleanup

> Menyelesaikan konfusi naming antara frontend (workstream/task) dan backend (Initiative/WorkItem).

---

### 7.1 — Document Table Name Mapping

**Status:** `[ ]`

**Konteks:**  
Naming mismatch yang tidak terdokumentasi:

| Frontend/API | PHP Model | Database Table | FK Column |
|---|---|---|---|
| workstream | Workstream | Initiative | programId |
| task / step | Task | WorkItem | initiativeId |
| task.workstreamId | - | WorkItem.initiativeId | - |
| blocker.taskId | - | Blocker.workItemId | - |

Ini menyebabkan kebingungan saat debugging dan menambah feature.

**Yang harus dilakukan:**

Buat file `NAMING_CONVENTION.md` di root project yang menjelaskan mapping ini.

Tambahkan docblock di model-model terkait:
```php
/**
 * Maps to database table `Initiative`.
 * Frontend/API uses the term "workstream".
 * Foreign key in Task table: initiativeId
 */
class Workstream extends Model { ... }
```

---

### 7.2 — Blocker.linkedWorkItemIds Array vs. Single Relation

**Status:** `[ ]`

**Bukti dari kode:**
- `app/Models/Blocker.php`: `'linkedWorkItemIds' => 'array'` (JSONB cast)
- Tapi relasi: `public function task()` → `belongsTo` single task
- `types.ts`: `Blocker.taskId?: number` (single)

Array JSONB tidak pernah dipakai. Frontend dan relasi hanya handle single task.

**Yang harus dilakukan:**

Pilihan 1 (simple): Hapus `linkedWorkItemIds` dari model cast dan dari logic, karena tidak pernah dipakai.

Pilihan 2 (proper): Implement relasi many-to-many antara Blocker dan Task:
- Buat pivot table `BlockerTask` (blockerId, taskId)
- Update `Blocker` model dengan `public function tasks(): BelongsToMany`
- Update frontend type: `Blocker.taskIds: number[]`
- Update BlockerController untuk handle multiple task links

**Rekomendasi:** Pilihan 2 jika memang ada use case blocker yang mengblok multiple tasks. Pilihan 1 jika tidak.

---

## Ringkasan & Skor Progres

| Phase | Item | Status |
|---|---|---|
| **P1** | 1.1 Execution Grid endpoint | `[x]` |
| **P1** | 1.2 OrganizationController syntax fix | `[x]` |
| **P1** | 1.3 COMPLETED programs di list | `[x]` |
| **P1** | 1.4 POST kpi-internal endpoint | `[x]` |
| **P1** | 1.5 RealtimeController JSONB NULL fix | `[x]` N/A — sudah correct |
| **P1** | 1.6 KPI NULL targetValue fix | `[x]` |
| **P2** | 2.1 Program model relasi (kpis, tasks, blockers) | `[x]` |
| **P2** | 2.2 Task status transition validation | `[x]` N/A — sudah ada di TaskService |
| **P2** | 2.3 Approval history log | `[x]` |
| **P2** | 2.4 classifyProgramHealth null fix | `[x]` selesai di P1 |
| **P3** | 3.1 ProgressLog entity + API + UI | `[x]` |
| **P4** | 4.1 ProgramsView Monitoring tab | `[x]` |
| **P4** | 4.2 ProgramDetailView UX polish | `[x]` |
| **P4** | 4.3 Tab rename & loading states | `[x]` |
| **P5** | 5.1 Monthly report auto-draft | `[x]` |
| **P6** | 6.1 Pagination program & task | `[x]` optional via ?page= |
| **P6** | 6.2 Consistent JSON response format | `[x]` |
| **P6** | 6.3 EntityPic cascade delete | `[x]` N/A — sudah ada sejak awal |
| **P6** | 6.4 Budget cascade ke workstream | `[x]` |
| **P7** | 7.1 Naming convention documentation | `[x]` |
| **P7** | 7.2 Blocker linkedWorkItemIds fix | `[x]` |

**Progress:** 21 / 21 items selesai ✓ COMPLETED

---

## Urutan Eksekusi yang Direkomendasikan

```
P1.2 (syntax fix, 5 menit) 
  → P1.5 (JSONB fix, 10 menit) 
  → P1.6 (KPI null fix, 5 menit)
  → P2.4 (classify fix, 5 menit)
  → P1.3 (COMPLETED in list, 10 menit)
  → P1.4 (kpi-internal endpoint, 30 menit)
  → P1.1 (execution-grid — BESAR, ~3-4 jam backend + frontend wiring)
  → P2.1 (model relations, 30 menit)
  → P2.2 (task transition validation, 30 menit)
  → P2.3 (approval history, 1 jam)
  → P3.1 (progress log — BESAR, ~2-3 jam)
  → P4.1 (monitoring tab, ~2 jam)
  → P4.2 / P4.3 (UX polish, ~1 jam)
  → P5.1 (report auto-draft, ~2 jam)
  → P6.1 / P6.2 / P6.3 / P6.4 (performance, ~2 jam)
  → P7.1 / P7.2 (cleanup, ~1 jam)
```

**Estimasi total: ~20-22 jam kerja efektif.**

---

*Update status item di atas saat eksekusi berlangsung. Target: semua `[ ]` → `[x]`.*
