#!/bin/bash
# ATLAS entrypoint — role dispatcher (pola mirror PTI / erin-v2).
#
#   web    → nginx + php-fpm. SATU-SATUNYA penerima trafik. Jalankan tugas
#            "release" one-time (ensure schema → migrate → optimize). Worker/reverb
#            TIDAK, supaya tak ada race.
#   worker → queue:work x2 + schedule:work. SCHEDULER ESENSIAL untuk ATLAS:
#            atlas:cleanup-broadcast-events tiap menit (realtime polling),
#            check-reminders, ghost-cleanup, dst. (lihat supervisord.worker.conf).
#   reverb → WebSocket. DORMANT (ATLAS pakai polling; service di-comment di compose).
set -e

cd /var/www/html

ROLE="${CONTAINER_ROLE:-web}"
echo "[start] ATLAS booting [role=$ROLE]..."

wait_for_db() {
    echo "[start] Waiting for database..."
    for i in $(seq 1 30); do
        if php artisan db:show --database=pgsql >/dev/null 2>&1; then
            echo "[start] Database reachable."
            return 0
        fi
        echo "[start]   attempt $i/30 — DB not ready..."
        sleep 2
    done
    return 1
}

# ATLAS menulis ke schema non-`public` (search_path = DB_SCHEMA, default
# ptpn_kmr_app — lihat config/database.php). Pada DB restore-dari-dump schema
# sudah ada → no-op. Pada DB fresh, `migrate` gagal tanpa ini. Pakai psql
# (terpasang di image) — BUKAN `artisan tinker` yang absen di build --no-dev.
ensure_schema() {
    local schema="${DB_SCHEMA:-ptpn_kmr_app}"
    echo "[start] Ensuring schema \"${schema}\" exists..."
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" -p "${DB_PORT:-5432}" \
        -U "${DB_USERNAME}" -d "${DB_DATABASE}" \
        -c "CREATE SCHEMA IF NOT EXISTS \"${schema}\";" >/dev/null 2>&1 \
        && echo "[start]   schema OK." \
        || echo "[start]   ⚠ ensure schema dilewati (psql gagal) — lanjut, migrate akan menunjukkan bila schema benar2 hilang."
}

fix_perms() {
    chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache || true
}

case "$ROLE" in
    web)
        if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "base64:" ]; then
            echo "[start] Generating application key..."
            php artisan key:generate --force || true
        fi

        if ! wait_for_db; then
            echo "[start] Database not reachable after retries — aborting web boot." >&2
            exit 1
        fi

        ensure_schema

        echo "[start] Linking storage..."
        php artisan storage:link 2>/dev/null || true

        # Migrasi OTOMATIS (apply pending) — kontrak deploy ATLAS. TIDAK seed.
        echo "[start] Running migrations..."
        php artisan migrate --force --no-interaction

        # Refresh cache (snapshot env runtime). Di-guard agar boot SELALU sampai
        # supervisord (cache:clear bisa menyentuh store eksternal saat aktif).
        echo "[start] Refreshing caches..."
        php artisan optimize:clear || echo "[start]   ⚠ optimize:clear dilewati."
        php artisan config:cache   || true
        php artisan route:cache    || true
        php artisan view:cache     || true
        php artisan event:cache    || true

        fix_perms
        echo "[start] Web setup complete! Starting nginx + php-fpm..."
        exec supervisord -c /etc/supervisor/supervisord.web.conf
        ;;

    worker)
        wait_for_db || echo "[start]   ⚠ DB belum siap — worker lanjut, scheduler/queue akan retry."
        fix_perms
        echo "[start] Worker setup complete! Starting queue + schedule..."
        exec supervisord -c /etc/supervisor/supervisord.worker.conf
        ;;

    reverb)
        # DORMANT: ATLAS belum `composer require laravel/reverb`. Guard supaya tidak
        # crash-loop bila role ini ter-aktifkan tanpa paketnya terpasang.
        if ! php artisan list 2>/dev/null | grep -q "reverb:start"; then
            echo "[start] ⚠ 'reverb:start' tidak tersedia — laravel/reverb belum terpasang." >&2
            echo "[start]   ATLAS realtime = polling; reverb sengaja DORMANT. Container idle." >&2
            exec sleep infinity
        fi
        fix_perms
        echo "[start] Reverb setup complete! Starting reverb:start..."
        exec supervisord -c /etc/supervisor/supervisord.reverb.conf
        ;;

    *)
        echo "[start] ERROR: CONTAINER_ROLE tidak dikenal: '$ROLE' (pakai web|worker|reverb)" >&2
        exit 1
        ;;
esac
