# ATLAS Fullstack

ATLAS is a Laravel, React, Inertia, and PostgreSQL application. The project is intended to run from the repository itself and must not depend on MAMP-specific paths or files from the previous migration source.

## Runtime Requirements

- PHP 8.3 or newer supported by the project dependencies
- Composer
- Node.js and npm
- PostgreSQL 14 or newer
- PHP extensions required by Laravel and this app, including `pdo_pgsql`, `mbstring`, `openssl`, `fileinfo`, `tokenizer`, `xml`, `ctype`, `json`, and `zip`

Use a normal system PHP, Laravel Herd, Valet, Docker, or any DTDI-approved runtime. MAMP is not required. If a machine has multiple PHP binaries, set `PHP_BIN` explicitly when starting the dev server.

## Local Setup

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
```

Create a PostgreSQL database and adjust `.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=atlas
DB_USERNAME=postgres
DB_PASSWORD=
DB_SCHEMA=public
```

Then migrate and seed as needed:

```bash
php artisan migrate
php artisan db:seed
```

## Development

```bash
npm run dev
```

The dev command starts Vite and Laravel. By default it uses `php` from `PATH`. To pin a specific PHP binary without changing repo files:

```bash
PHP_BIN=/opt/homebrew/bin/php npm run dev
```

## Verification

```bash
php artisan test
npm run check
```

`npm run check` runs TypeScript, frontend route audit, and a production Vite build.

## Architecture Notes

- Backend: Laravel with session authentication and PostgreSQL persistence.
- Frontend: React pages resolved through Inertia.
- Frontend API calls use same-origin Laravel routes, not a separate Express API.
- Local sessions default to file storage to avoid requiring a separate `sessions` table.
- PostgreSQL is the only configured application database connection.
