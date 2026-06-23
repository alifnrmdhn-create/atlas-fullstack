# ─── Stage 1: Node build ─────────────────────────────────────────────────────
FROM node:22-alpine AS node-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY resources/ resources/
COPY public/ public/
# Tailwind v4 is config-less — there is no postcss.config.js / tailwind.config.js
# in the repo; COPYing nonexistent sources aborts the build. Only copy what exists.
# ATLAS uses a TypeScript vite config (vite.config.ts), not .js.
COPY vite.config.ts tsconfig.json ./

# `npm run build` = `vite build` (config-less, no tsc). Type-check lives in CI
# (`npm run typecheck`), not the deploy image.
RUN npm run build

# ─── Stage 2: PHP production ─────────────────────────────────────────────────
FROM php:8.3-fpm-alpine AS php-base

# Install system deps + PHP extensions. Note: nginx package is intentionally
# NOT installed here — production nginx runs in its own container (see
# `nginx-prod` stage below). Keeping the app image PHP-FPM only.
RUN apk add --no-cache \
    postgresql-dev \
    libpng-dev \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    libxml2-dev \
    freetype-dev \
    libjpeg-turbo-dev \
    zip unzip git curl rsync \
    supervisor

# gd dgn freetype+jpeg (PhpSpreadsheet render gambar/font). Ekstensi:
#   pgsql        — driver DB PostgreSQL (schema ptpn_kmr_app)
#   bcmath       — aritmetika angka resmi
#   mbstring,xml — Laravel core + PhpSpreadsheet
#   intl         — locale
#   pcntl,posix  — graceful shutdown queue worker (supervisord queue:work)
#   opcache      — perf produksi
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
       pdo pdo_pgsql gd zip bcmath mbstring xml intl pcntl posix opcache \
    && php -m | grep -E "pdo_pgsql|bcmath|mbstring|xml|intl|pcntl|posix|gd|zip"

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy application source
COPY . .

# Copy pre-built frontend assets
COPY --from=node-builder /app/public/build public/build

# Install PHP dependencies (production only)
RUN composer install --no-dev --optimize-autoloader --no-interaction

# NOTE: artisan config:cache / route:cache / view:cache are intentionally NOT
# run at build time. They depend on the final runtime environment (DB_HOST,
# APP_KEY, etc.) which is only known when the container starts. The entrypoint
# script handles cache regeneration after env is loaded — see docker/entrypoint.sh.

# Permissions
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

# Clean copy of the fully-assembled app (code + vendor + public/build) for the
# entrypoint to rsync into the shared `app_code` volume on boot. The volume
# overlays /var/www/html and PERSISTS across deploys, so on redeploy it still
# holds STALE code until the entrypoint refreshes it from here. storage/ & .env
# are excluded at rsync time — see docker/entrypoint.sh.
RUN mkdir -p /app-tmp && cp -rp /var/www/html/. /app-tmp/

# Copy config files
COPY docker/php/php.ini /usr/local/etc/php/conf.d/atlas.ini
COPY docker/php/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy entrypoint
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 9000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

# ─── Stage 3: nginx production ───────────────────────────────────────────────
# Dedicated nginx image. public/ is NOT baked here — nginx serves it from the
# shared `app_code` volume (mounted read-only in docker-compose). The `app`
# container's entrypoint rsyncs the built public/ (incl. Vite assets) into that
# volume on boot, so both containers resolve the same /var/www/html/public path
# (required for FastCGI SCRIPT_FILENAME to be valid in both). nginx forwards PHP
# requests to the `app` service (php-fpm:9000) and serves static assets directly.
FROM nginx:alpine AS nginx-prod

# Site config. The official nginx:alpine image includes /etc/nginx/conf.d/*.conf.
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
