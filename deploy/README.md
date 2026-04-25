# Deployment Contract

ATLAS is a Laravel, React, Inertia, and PostgreSQL application. Production deployment must use the repository as the application source and must not depend on MAMP paths, SQLite files, or artifacts from the previous stack.

## Required Runtime

- PHP 8.3 or newer with Laravel-required extensions, including `pdo_pgsql`.
- PostgreSQL as the application database.
- Node.js/npm for asset build during CI or release build.
- A DTDI-approved HTTP runtime for Laravel, such as Nginx/PHP-FPM, Apache/PHP-FPM, Laravel Octane, or an approved platform runtime.

## Release Steps

```bash
composer install --no-dev --optimize-autoloader
npm ci
npm run build
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Run queue workers and the Laravel scheduler as separate managed processes when those workloads are enabled. Do not run them inside the same long-running web process unless the target platform explicitly manages that process model.

## Environment Contract

```env
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...
APP_URL=https://...

DB_CONNECTION=pgsql
DB_HOST=...
DB_PORT=5432
DB_DATABASE=...
DB_USERNAME=...
DB_PASSWORD=...
DB_SCHEMA=public
```

The app config only defines the `pgsql` database connection. Deployment should fail fast if PostgreSQL credentials are missing instead of falling back to SQLite or another database.

## Platform Examples

`render.example.yaml` is a historical/platform-specific example. Keep it out of the repo root so Render is not treated as the default deployment target. For DTDI production, prefer the approved runtime contract above and adapt platform manifests outside the app code when required.
