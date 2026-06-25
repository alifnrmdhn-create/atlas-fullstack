# syntax=docker/dockerfile:1.7
#
# =========================================================
# ATLAS — image produksi single-role (pola mirror PTI / erin-v2).
#
# SATU image (atlas-app:prod) dipakai beberapa container yang dibedakan oleh
# env CONTAINER_ROLE (lihat docker-compose.yml + docker/start.sh):
#   web    → nginx + php-fpm  (SATU-SATUNYA penerima trafik publik/Traefik)
#   worker → queue:work x2 + schedule:work  (SCHEDULER ESENSIAL: realtime polling
#            ATLAS bergantung pada atlas:cleanup-broadcast-events tiap menit)
#   reverb → WebSocket (DORMANT — ATLAS realtime = polling, bukan WS; disiapkan
#            untuk konsistensi, butuh `composer require laravel/reverb` dulu)
#
# Memisahkan worker dari web = fix permanen 504 (job/scheduler tak mencekik web).
# Code + vendor + public/build DI-BAKE ke image (bukan shared volume), redeploy =
# image baru. DB = PostgreSQL EKSTERNAL (DB_HOST dari .env), schema non-`public`
# `ptpn_kmr_app` dipastikan ada di start.sh sebelum migrate.
# =========================================================

# ----- Stage 1: Build frontend assets (Vite) -----
FROM node:22-bookworm-slim AS frontend
WORKDIR /build

COPY package*.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# ATLAS pakai vite.config.ts (TypeScript), bukan .js. Tailwind v4 config-less.
COPY resources/ resources/
COPY public/ public/
COPY vite.config.ts tsconfig.json ./

# `npm run build` = `vite build` (config-less, tanpa tsc → aman dari OOM).
RUN npm run build

# ----- Stage 2: PHP dependencies (Composer) -----
FROM composer:2 AS vendor
WORKDIR /app

COPY composer.json composer.lock ./
RUN --mount=type=cache,id=atlas-composer,target=/tmp/composer-cache,sharing=locked \
    COMPOSER_CACHE_DIR=/tmp/composer-cache composer install \
        --no-dev \
        --no-interaction \
        --no-progress \
        --no-scripts \
        --prefer-dist \
        --optimize-autoloader \
        --ignore-platform-reqs

# ----- Stage 3: Runtime (nginx + php-fpm + supervisor) -----
FROM php:8.3-fpm-bookworm AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    PORT=8080 \
    APP_ENV=production \
    APP_DEBUG=false

RUN rm -f /etc/apt/apt.conf.d/docker-clean \
    && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

# OS packages — postgresql-client WAJIB (start.sh pakai psql untuk ensure schema).
RUN --mount=type=cache,id=atlas-apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=atlas-apt-lib,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        curl \
        ca-certificates \
        git \
        unzip \
        postgresql-client \
        rsync

COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/

#   pdo_pgsql,pgsql — driver DB Postgres (schema ptpn_kmr_app)
#   bcmath          — aritmetika angka resmi
#   intl            — locale
#   gd,zip          — PhpSpreadsheet (render gambar/font)
#   pcntl           — graceful shutdown queue worker
#   exif            — metadata gambar upload
#   redis           — backend session/cache/queue (phpredis) — DORMANT, future
#   mbstring,xml    — Laravel core + PhpSpreadsheet
RUN --mount=type=cache,id=atlas-apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=atlas-apt-lib,target=/var/lib/apt,sharing=locked \
    install-php-extensions \
        pdo_pgsql \
        pgsql \
        bcmath \
        intl \
        gd \
        zip \
        pcntl \
        exif \
        redis \
        mbstring \
        xml \
        opcache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Application source (di-bake; .dockerignore membuang vendor/node_modules/.env).
COPY . /var/www/html

# Overlay vendor + built assets dari stage paralel.
COPY --from=vendor   /app/vendor        /var/www/html/vendor
COPY --from=frontend /build/public/build /var/www/html/public/build

# ── Stamp build-id ke service worker (PWA cache-busting) ─────────────────────
# Di model single-image, public/ DI-BAKE (tak ada rsync boot), jadi stamp di
# BUILD-time: sw.js statik → kalau bytes-nya tak berubah, browser tak update SW →
# cache shell basi menyajikan HTML lama yg menunjuk hash aset yg sudah tiada →
# 404. Stamp hash manifest ke __BUILD_ID__ supaya sw.js berubah HANYA saat aset
# berubah (tiap deploy = manifest baru = id baru). Lihat public/sw.js.
RUN if [ -f public/sw.js ] && [ -f public/build/manifest.json ]; then \
        BUILD_ID="$(md5sum public/build/manifest.json | cut -c1-12)"; \
        sed -i "s/__BUILD_ID__/${BUILD_ID}/g" public/sw.js; \
        echo "[build] Service worker stamped build-id ${BUILD_ID}."; \
    fi

# Config nginx / php / supervisor (per-peran web/worker/reverb).
COPY docker/nginx.conf              /etc/nginx/nginx.conf
COPY docker/php-fpm.conf            /usr/local/etc/php-fpm.d/zz-www.conf
COPY docker/php/php.ini             /usr/local/etc/php/conf.d/zzz-atlas.ini
COPY docker/supervisord.web.conf    /etc/supervisor/supervisord.web.conf
COPY docker/supervisord.worker.conf /etc/supervisor/supervisord.worker.conf
COPY docker/supervisord.reverb.conf /etc/supervisor/supervisord.reverb.conf

COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

RUN rm -f /var/www/html/bootstrap/cache/*.php \
    && composer dump-autoload --optimize --no-interaction \
    && mkdir -p storage/logs storage/framework/sessions storage/framework/views storage/framework/cache/data storage/app/public bootstrap/cache \
    && chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R ug+rwX /var/www/html/storage /var/www/html/bootstrap/cache \
    && php artisan package:discover --ansi

EXPOSE 8080

CMD ["/usr/local/bin/start.sh"]
