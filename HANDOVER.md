# ATLAS — Handover ke Tim IT DTDI

> Dokumen serah-terima. Dibuat 2026-06-16. Baca ini DULU sebelum apa pun.
>
> Pendamping: `README.md` (setup), `docs/ops-runbook.md` (operasional),
> `docs/scale-readiness-plan-2026-06.md` (kesiapan skala), `docs/ATLAS_ARCHITECTURE.md`.

## ⚠️ Hal terpenting: KODE dan DATA terpisah

Repo GitHub ini berisi **kode lengkap**, TAPI **TIDAK berisi data database**.
Ini bukan bug — memang begitu cara kerja git. Jangan asumsikan "clone GitHub =
dapat sistem lengkap".

| | Di GitHub? | Sumber kebenaran |
|---|---|---|
| Kode (app, migrasi, config) | ✅ Ya, 100% sinkron (commit `1733caa`) | GitHub |
| Struktur org + 42 user (seed) | ✅ Ya (via `db:seed`) | Seeder |
| 97 program (baseline) | ⚠️ Sebagian (JSON ada, tapi seeder TIDAK auto-jalan) | `ProgramSeeder` manual |
| Progres/KPI/objektif/blocker riil | ❌ **TIDAK** | **DB prod Railway** |
| File KPI Excel (sumber import) | ❌ TIDAK (gitignored, binary) | Out-of-band |
| `.env` produksi (secret) | ❌ TIDAK (gitignored, benar) | Transfer aman |
| File upload (lampiran/avatar) | ❌ TIDAK | Volume Railway / S3 |

### Bukti (diverifikasi 2026-06-16)

`git clone` bersih dari GitHub → `migrate` → `db:seed` menghasilkan:
**0 program, 0 task, 0 KPI** (hanya 42 user + struktur org). Bandingkan prod:
97 program / 190 task selesai / 85 KpiValue / 194 progress-log / 5 blocker.

**Kesimpulan: data "bagus" HANYA ada di DB prod Railway.** Tidak bisa
direkonstruksi dari GitHub — `DatabaseSeeder` tak memanggil `ProgramSeeder`,
dan `kpi:import-progress` butuh file Excel yang gitignored.

## Cara mewariskan DATA (WAJIB — pilih satu)

### Opsi A (paling bersih): wariskan proyek Railway sekaligus
DTDI mewarisi deployment Railway → DB prod + data + env + scheduler ikut utuh.
GitHub cukup jadi source code. Tak perlu migrasi data.

### Opsi B (kalau DTDI pakai infra sendiri): dump DB prod → restore
1. Generate dump: `bash scripts/handover-db-dump.sh` (butuh akses Railway, hasil
   `atlas-prod-YYYYMMDD.dump`). Atau ambil artifact terbaru workflow `db-backup.yml`.
2. **Transfer dump SECARA AMAN, BUKAN via git** — berisi PII (nama/email/NIK 41
   user). Enkripsi + kanal privat.
3. Restore ke DB DTDI:
   `pg_restore -d "$TARGET_URL" --clean --if-exists --no-owner atlas-prod-*.dump`

### Opsi C: fresh start (hanya jika data pilot memang dibuang)
`migrate` + `db:seed` + `db:seed --class=ProgramSeeder` +
`db:seed --class=ProgramExecutionSeeder` → baseline 97 program (tanpa
progres/KPI). Bukan kelanjutan sistem live.

## Setup dari nol (fresh clone)

```bash
git clone <repo> && cd atlas-fullstack
cp .env.example .env            # lalu ISI nilai (DB, APP_KEY, dst)
composer install
npm ci
php artisan key:generate
php artisan migrate --force
# DATA: lakukan Opsi A/B/C di atas
npm run build
```
Verifikasi: `php artisan test` (butuh DB test — `bash scripts/setup-test-db.sh`)
+ `npm run check`. Keduanya juga jalan otomatis di CI (GitHub Actions).

## Secret/env yang HARUS diisi (tidak ada di git)

Lihat `.env.example` untuk daftar lengkap. Kritis: `APP_KEY` (generate),
koneksi DB, `SESSION_SECURE_COOKIE=true` (prod), `CACHE_STORE=database`
(multi-replica), `LOG_CHANNEL=stderr` + `LOG_STDERR_FORMATTER` (prod).
GitHub Actions secret: `DATABASE_PUBLIC_URL` (untuk backup) — set ulang di repo DTDI.

## Deployment

- Saat ini: Railway via `nixpacks.toml` (FrankenPHP). **Spesifik Railway.**
- Di infra DTDI sendiri: `nixpacks.toml` jadi referensi urutan boot (migrate →
  storage:link → cache config/route/view → scheduler loop → serve). Sesuaikan
  ke runtime DTDI. Detail di `docs/ops-runbook.md`.
- Kesiapan multi-replica & langkah scale-out: `docs/scale-readiness-plan-2026-06.md`.

## Checklist pra-handover (status)

- ✅ Kode sinkron penuh ke GitHub (`1733caa`), nol commit/stash terlantar.
- ✅ Nol secret ter-track di git; `.env` gitignored.
- ✅ CI (test + typecheck + lint + build) hijau; 286 test.
- ✅ Runbook + arsitektur + scale-plan terdokumentasi.
- ⚠️ **Password default `Password123!`** (`WorkspaceController` saat buat user) —
  WAJIB dirotasi tim DTDI; pertimbangkan forced-reset login pertama.
- ⚠️ `npm audit fix` 1 moderate (DOMPurify) — opsional, hygiene.
- ⚠️ Dump DB prod (Opsi B) + transfer file Excel KPI (`docs/Real KPI Apr`) jika
  perlu re-import — keduanya out-of-band.
- ☐ Transfer akses: Railway, GitHub repo ownership, nilai `.env` prod.
