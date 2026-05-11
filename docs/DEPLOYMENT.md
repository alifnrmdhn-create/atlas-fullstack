# ATLAS Deployment Guide

Panduan deploy ATLAS ke environment production. Untuk handover ke divisi TI PTPN atau migrasi dari Railway.

## Stack Requirements

| Komponen | Versi minimum | Catatan |
|---|---|---|
| PHP | 8.3+ | Dengan ekstensi: `pdo_pgsql`, `mbstring`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `fileinfo` |
| PostgreSQL | 14+ | Schema kustom didukung via `DB_SCHEMA` |
| Node.js | 20+ | Untuk build asset (`npm run build`) — tidak diperlukan saat runtime |
| Composer | 2.x | Untuk install dependency PHP |
| Web server | nginx + php-fpm / FrankenPHP / Apache | **JANGAN** pakai `php artisan serve` di prod (single-process kecuali di-tweak khusus) |

## Environment Variables (Wajib)

Copy `.env.example` → `.env`, lalu set:

```env
APP_KEY=                # generate via: php artisan key:generate
APP_URL=https://your-domain
APP_ENV=production
APP_DEBUG=false

DB_CONNECTION=pgsql
DB_HOST=...
DB_PORT=5432
DB_DATABASE=...
DB_USERNAME=...
DB_PASSWORD=...
DB_SCHEMA=ptpn_kmr_app  # atau 'public' kalau tidak pakai schema kustom

SESSION_DRIVER=database # WAJIB di container/ephemeral. File sessions hilang per redeploy.

VITE_REALTIME_SSE=true  # set 'false' kalau web server tidak support long-lived connection
```

## Deploy Sequence

```bash
# 1. Install dependencies
composer install --no-dev --optimize-autoloader --no-interaction
npm ci
npm run build

# 2. Setup
php artisan key:generate         # hanya pertama kali
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 3. Run server (pilih sesuai infra)
# Opsi A — production proper: nginx + php-fpm
#   php-fpm listening di socket, nginx forward ke /public/index.php
#   File konfigurasi nginx standar Laravel, tidak ada hal khusus.
#
# Opsi B — single-binary, modern, support SSE native: FrankenPHP
#   frankenphp run --config Caddyfile
#
# Opsi C — Docker/Railway/k8s: artisan serve (HANYA dengan multi-worker)
#   PHP_CLI_SERVER_WORKERS=20 php artisan serve --host=0.0.0.0 --port=8080 --no-reload
#   Tanpa --no-reload Laravel fallback ke 1 worker — SSE akan block semua request lain.
```

## Cron Scheduler (Wajib)

Realtime depends on `php artisan schedule:run` running every minute. Tanpa ini:
- `broadcast_events` table tumbuh tanpa GC (akan jadi puluhan ribu rows)
- Reminder notifications (`atlas:check-reminders`) tidak fire
- Ghost session cleanup tidak jalan

Setup options:
- **Linux cron**: `* * * * * cd /path/to/app && php artisan schedule:run >> /dev/null 2>&1`
- **Docker**: dedicated container or supervisord
- **Railway/Heroku**: worker process atau scheduler add-on
- **k8s**: CronJob resource

## Realtime Architecture (Penting Dipahami)

ATLAS pakai 2 jalur delivery untuk event real-time:

1. **SSE (Server-Sent Events)** via `/realtime/stream` — long-lived HTTP, low latency (<1s).
2. **Polling fallback** via `/realtime/poll?since=N` — short HTTP, latency 0-2 detik.

Keduanya jalan paralel. Dedup berbasis event id. Kalau SSE buffered/blocked di reverse proxy, polling tetap deliver event-nya.

**Konsekuensi untuk web server**:
- nginx + php-fpm: SSE jalan, asalkan worker count cukup (`pm.max_children` ≥ jumlah user aktif). Disable buffering: `fastcgi_buffering off;` di location SSE.
- FrankenPHP: SSE jalan native, tidak butuh per-connection worker (goroutine model).
- Apache + mod_php: SSE bisa buffered. Polling tetap jalan.

Kalau dalam infra tertentu SSE bermasalah, **set `VITE_REALTIME_SSE=false`** sebelum `npm run build`. Polling akan ambil seluruh delivery (2s latency).

## Apa yang Berubah dari `php artisan serve` (Railway)

File `nixpacks.toml` di repo hanya untuk Railway. Kalau deploy ke infra lain:
- Abaikan `nixpacks.toml` (atau hapus kalau tidak digunakan)
- Gunakan nginx + php-fpm atau FrankenPHP (rekomendasi)
- `PHP_CLI_SERVER_WORKERS=20 --no-reload` adalah workaround Railway — tidak perlu di setup nginx/php-fpm

## Database Migration Catatan

Tabel pakai naming PascalCase (legacy dari Prisma): `Channel`, `ChannelMessage`, `Notification`, dll.
Lihat `NAMING_CONVENTION.md` untuk detail mapping.

Schema `DB_SCHEMA` (default `ptpn_kmr_app` di Railway) di-handle via `search_path` di `config/database.php`. PostgreSQL only.

## Healthcheck

`GET /` redirect ke `/login` (302) kalau tidak login, ke `/` (200) kalau login. Untuk healthcheck simple, hit `GET /login` — harus 200.

## Common Issues

**"Forced logout setiap deploy"**
→ `SESSION_DRIVER` masih `file`. Pindah ke `database` (default sekarang).

**"Realtime tidak jalan, harus refresh"**
→ Web server tidak support long-lived connection / worker count terlalu sedikit. Cek log SSE endpoint timeout. Polling fallback harusnya tetap deliver dalam 2 detik.

**"Notification:created tidak muncul"**
→ Cek `broadcast_events` table ada baris-nya saat event terjadi. Cek scheduler `php artisan schedule:run` jalan. Cek frontend Network tab `/realtime/poll` return 200 dengan `events` non-empty.

**"Avatar 404 spam di console"**
→ Beberapa user di DB punya `avatarUrl` berisi initials ("DZ", "AF") bukan URL valid. Fix di code sudah filter shape, tapi bisa juga clean data: `UPDATE "User" SET "avatarUrl" = NULL WHERE "avatarUrl" !~ '^(https?://|/|data:)';`

## Handover Checklist (untuk Divisi TI PTPN)

- [ ] `.env` di-create dari `.env.example` dengan nilai prod
- [ ] `APP_KEY` di-generate (jangan reuse dari env lain)
- [ ] `DB_*` mengarah ke instance PostgreSQL prod
- [ ] `SESSION_DRIVER=database` (atau pakai default config)
- [ ] Migration di-run: `php artisan migrate --force`
- [ ] Asset di-build: `npm run build`
- [ ] Web server di-config (nginx+php-fpm rekomendasi)
- [ ] Cron `php artisan schedule:run` di-setup
- [ ] Backup PostgreSQL di-jadwalkan
- [ ] Storage path (`storage/app/public`) di-symlink ke public via `php artisan storage:link`
- [ ] SSL cert di-pasang (Laravel session secure cookie wajib HTTPS di prod)
