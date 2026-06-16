# ATLAS — Operations Runbook

> Panduan operasional produksi. Dibuat 2026-06-16 sebagai bagian scale-readiness
> S4.3. Pasangan: `docs/scale-readiness-plan-2026-06.md` (roadmap skala).

## Arsitektur runtime

- **Host**: Railway, build via `nixpacks.toml`, runtime FrankenPHP `php-server`
  (1 request = 1 thread, `num_cpu×2` thread).
- **DB**: PostgreSQL (Railway), schema `ptpn_kmr_app` (search_path).
- **Realtime**: polling `/realtime/poll` tiap 2 detik (BUKAN SSE — jangan
  re-introduce). Broadcast = insert ke `broadcast_events` (di-prune 15 menit).
- **Cache/Session/Lock**: `CACHE_STORE=database`, `SESSION_DRIVER=database`
  (shared antar-replica via Postgres). Upgrade Redis = config-flip.
- **Scheduler**: loop `schedule:work` di tiap container, `onOneServer()` →
  hanya 1 replica eksekusi tiap tick (lock di database cache).
- **Health check**: `GET /up`.

## Status kesiapan multi-replica (per 2026-06-16)

**Aplikasi sudah multi-replica-CORRECT** (S1 selesai): scheduler tak duplikat,
cache/session/lock shared, migrate race-safe (`--isolated`). Sebelum menaikkan
replica >1, WAJIB selesaikan **satu** hal yang tak punya padanan lokal:

- **Upload file → object storage (S3/R2)**. Kini `FILESYSTEM_DISK=local` (volume
  Railway, tak share-able antar-replica). Kode sudah S3-ready (config/uploads.php).
  Aktivasi: `composer require league/flysystem-aws-s3-v3`; isi `AWS_*` + bucket;
  set `UPLOAD_PRIVATE_DISK=s3` & `UPLOAD_PUBLIC_DISK=s3`.

Opsional (upgrade, bukan blocker): **Redis** untuk cache/session lebih cepat
(set `CACHE_STORE=redis`, `SESSION_DRIVER=redis` + provision Redis); **Sentry**
error tracking (`composer require sentry/sentry-laravel` + `SENTRY_LARAVEL_DSN`).

## Deploy

- Push ke `main` → CI (GitHub Actions: `php artisan test` + typecheck/lint/build)
  WAJIB hijau → Railway auto-build & deploy.
- Boot: `migrate --force --isolated` → storage:link → config/route/view cache →
  pre-boot cleanup → scheduler loop → FrankenPHP.
- **Catatan**: env var berubah → set lalu redeploy (boot `config:cache` membakukan).
  Migrasi yang bikin tabel cache/lock: deploy DULU (boot migrate bikin tabel),
  BARU flip `CACHE_STORE=database` (chicken-egg).

## Scaling up/down

1. Pastikan **S3 storage aktif** (lihat di atas) — kalau belum, upload pecah di
   >1 replica.
2. Railway → service `atlas-fullstack` → Settings → Replicas → naikkan.
3. Verifikasi pasca-scale: scheduled job tak dobel (cek log: tiap command 1×
   per tick lintas replica), sesi konsisten, upload terbaca dari semua replica.
4. Turunkan: aman kapan saja (stateless).

**Fresh environment (staging baru)**: `migrate --isolated` butuh `cache_locks`
yang dibuat oleh migrasi → jalankan `php artisan migrate` sekali manual (atau
first deploy single-replica) sebelum multi-replica.

## Rollback

- Railway → Deployments → pilih deploy sehat sebelumnya → Redeploy/Rollback.
- Migrasi: semua aditif (tabel/kolom/index baru) — rollback kode aman tanpa
  rollback DB. JANGAN `migrate:rollback` di prod kecuali yakin (bisa data-loss).

## Observability & incident response

- **Log**: stderr JSON terstruktur (Railway log). Tiap baris membawa
  `request_id`, `user_id`, `method`, `path`, `ip` (dari `LogRequestContext`).
  Korelasi 1 request: grep `request_id`. Response juga membawa header
  `X-Request-Id` (minta user kirim ini saat lapor bug).
- **Error 500**: cari di Railway log level `error`/`warning`. Belum ada alerting
  (Sentry di-defer) → cek log proaktif, atau aktifkan Sentry.
- **Scheduled command gagal**: output scheduler mengalir ke stdout (Railway log).
- **Health**: `GET /up`. 502 sesaat saat cutover deploy = normal (retry).

## Backup & restore

- **Backup**: harian via GitHub Actions `db-backup.yml` (pg_dump -Fc → artifact,
  retensi 30 hari). Butuh repo secret `DATABASE_PUBLIC_URL`.
- **Restore**: download artifact, lalu
  `pg_restore -d "$TARGET_URL" --clean --if-exists --no-owner atlas-prod-*.dump`.
- **Drill**: uji restore ke DB throwaway minimal 1× sebelum mengandalkannya.

## Rate limiting

- `throttle:web` per-user 600/mnt (guest 120/mnt by-IP), env `ATLAS_WEB_RATE_LIMIT`.
- User kena 429 padahal sah (power-user multi-tab) → naikkan env, redeploy.
- Dugaan abuse → turunkan.

## Scheduled jobs (semua `onOneServer`)

| Command | Jadwal | Fungsi |
|---|---|---|
| `atlas:check-reminders` | tiap menit | Reminder pesan/deadline |
| `atlas:cleanup-broadcast-events` | tiap menit | Prune broadcast_events >15mnt |
| `atlas:ghost-cleanup` | tiap 5 menit | Tutup sesi presence mati |
| `atlas:compute-health` | tiap 30 menit | Re-derive health program |
| `atlas:cleanup-form-drafts` | harian 03:00 | Prune draft lewat TTL |
| `atlas:prune-old-records` | harian 03:15 | Prune notif/sesi/status-log lewat retensi |

## Catatan keputusan (jangan ulang tanpa alasan baru)

- **Queue worker (S2.1) SENGAJA tidak dipakai**: kerja inline ATLAS semua
  DB-insert murah (notif/broadcast). Meng-queue-kannya menambah latency realtime
  (broadcast async → poll telat) tanpa benefit nyata. Tabel queue + driver
  `database` SUDAH siap bila nanti ada kerja berat (PDF/export/email massal).
- **Poll session-write (S2.3)**: optimasi terbaik = Redis session (di-defer).
  Di skala besar, flip `SESSION_DRIVER=redis` menghapus beban tulis sesi per-poll.
- **Pagination /tasks (S2.2)**: dipakai window completed (default 90h, config
  `workboard.completed_window_days`) + `?scope=all` untuk histori penuh.
