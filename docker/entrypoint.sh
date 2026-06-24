#!/bin/sh
# ATLAS container entrypoint — pola shared-volume (mirror erin-v2 / Aplikasi Hukum).
#
# /var/www/html adalah named volume `app_code` yang DI-SHARE dengan container
# nginx (nginx membacanya read-only). Volume itu PERSISTEN: saat redeploy ia
# masih berisi code LAMA. Karena itu langkah pertama selalu: rsync code bersih
# dari /app-tmp (di-bake saat build) → /var/www/html, supaya app + nginx
# melihat code terbaru. storage/ = named volume DURABLE (upload user persist
# lintas redeploy); bootstrap/cache ikut volume app_code (di-rebuild di bawah).
#
# Idempoten: aman dijalankan tiap container start.

set -e

# ── 1. Sinkronkan code dari image ke shared volume ───────────────────────────
# storage/ = bind mount persisten (jangan ditimpa); .env dikelola terpisah;
# .git tak perlu di runtime. public/ disinkron tersendiri agar symlink
# public/storage (dibuat runtime oleh storage:link) tidak terhapus --delete.
if [ -d /app-tmp ]; then
    echo "[entrypoint] Sync code /app-tmp -> /var/www/html ..."
    rsync -a --delete \
        --exclude 'storage' \
        --exclude 'public' \
        --exclude '.env' \
        --exclude '.git' \
        /app-tmp/ /var/www/html/
    mkdir -p /var/www/html/public
    # public non-build → bersih dgn --delete, tapi JANGAN sentuh symlink storage
    # (dibuat runtime oleh storage:link) maupun dir build (ditangani terpisah).
    rsync -a --delete --exclude 'storage' --exclude 'build' \
        /app-tmp/public/ /var/www/html/public/
    # public/build → OVERLAY tanpa --delete. Aset Vite content-hashed, jadi build
    # LAMA sengaja DIPERTAHANKAN: HTML lama yg masih nyangkut (browser cache /
    # service worker) tetap me-resolve aset-nya → tak ada 404 "/build/assets/
    # app-<hash>.css" saat/seusai deploy (akar masalah refresh intermiten).
    # manifest.json ketimpa (path sama) → HTML baru tetap menunjuk hash baru.
    # Catatan: aset numpuk lintas deploy (kecil); prune berkala bila perlu.
    mkdir -p /var/www/html/public/build
    rsync -a /app-tmp/public/build/ /var/www/html/public/build/

    # ── Stamp build-id ke service worker ─────────────────────────────────────
    # public/sw.js statik → bytes-nya tak pernah berubah antar-deploy → browser
    # tak pernah update SW → cache shell basi tak pernah di-purge & kadang
    # menyajikan HTML lama yg menunjuk hash aset yg sudah tiada → 404. Stamp hash
    # manifest ke placeholder __BUILD_ID__ supaya sw.js berubah HANYA saat aset
    # berubah (bukan tiap restart container, krn manifest sama → hash sama) →
    # browser update SW → `activate` purge cache lama. Lihat public/sw.js.
    if [ -f /var/www/html/public/sw.js ] && [ -f /var/www/html/public/build/manifest.json ]; then
        BUILD_ID="$(md5sum /var/www/html/public/build/manifest.json | cut -c1-12)"
        sed -i "s/__BUILD_ID__/${BUILD_ID}/g" /var/www/html/public/sw.js
        echo "[entrypoint] Service worker stamped build-id ${BUILD_ID}."
    fi
fi

cd /var/www/html

# ── 2. Struktur & izin storage / bootstrap-cache ─────────────────────────────
# storage = named volume (kosong saat deploy pertama); bootstrap/cache ikut
# app_code. Buat subdir wajib, buang cache terkompilasi basi (cegah error
# "No such file or directory" path lama), lalu samakan owner ke www-data.
mkdir -p storage/logs \
         storage/framework/sessions \
         storage/framework/views \
         storage/framework/cache/data \
         storage/app/public \
         bootstrap/cache
rm -rf bootstrap/cache/*.php
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# ── 3. Tunggu database ────────────────────────────────────────────────────────
echo "[entrypoint] Waiting for database connection..."
# Tiny retry loop — DB host eksternal mungkin lambat merespons saat boot pertama.
for i in 1 2 3 4 5 6 7 8 9 10; do
    if php artisan db:show --database=pgsql > /dev/null 2>&1; then
        echo "[entrypoint] Database reachable."
        break
    fi
    if [ "$i" = "10" ]; then
        echo "[entrypoint] Database not reachable after 10 attempts — aborting." >&2
        exit 1
    fi
    echo "[entrypoint]   attempt ${i}/10 — sleeping 2s..."
    sleep 2
done

# ── 3b. Pastikan schema PostgreSQL ada ───────────────────────────────────────
# ATLAS menulis ke schema non-`public` (search_path = DB_SCHEMA, default
# ptpn_kmr_app — lihat config/database.php). Pada DB eksternal yang sudah
# di-restore dari dump prod, schema ini sudah ada → CREATE ... IF NOT EXISTS
# no-op. Pada DB BUNDEL yang fresh (docker-compose.prod.yml), schema belum ada
# dan `migrate` akan gagal ("schema ptpn_kmr_app does not exist"). Buat di sini.
DB_SCHEMA_NAME="${DB_SCHEMA:-ptpn_kmr_app}"
echo "[entrypoint] Ensuring schema \"${DB_SCHEMA_NAME}\" exists..."
php artisan tinker --execute="DB::connection('pgsql')->getPdo()->exec('CREATE SCHEMA IF NOT EXISTS \"${DB_SCHEMA_NAME}\"');" >/dev/null 2>&1 || true

# ── 4. Migrasi + storage link ────────────────────────────────────────────────
echo "[entrypoint] Running migrations..."
php artisan migrate --force --no-interaction

echo "[entrypoint] Linking storage..."
# `storage:link` errors if link exists; catch to keep entrypoint idempotent.
php artisan storage:link 2>/dev/null || true

# ── 5. Rebuild cache (snapshot env runtime: DB_HOST, APP_KEY, dst.) ───────────
# Sengaja TIDAK di build-time (Dockerfile) — cache menyimpan env yang baru
# diketahui saat container start. Urutan penting: clear dulu (idempoten saat
# boot pertama), lalu config sebelum route/view yang mereferensikannya.
echo "[entrypoint] Refreshing caches..."
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

echo "[entrypoint] Handing off to supervisord..."
exec "$@"
