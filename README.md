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
DB_SCHEMA=ptpn_kmr_app
```

The application schema is `ptpn_kmr_app` (set as PostgreSQL `search_path`).

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
bash scripts/setup-test-db.sh   # once: creates the ptpn_kmr_test database + schema
php artisan test
npm run check
```

`npm run check` runs the TypeScript typecheck (strict), ESLint, the frontend
route and breakpoint audits, and a production Vite build. The same gates run
in CI (GitHub Actions) on every push and pull request.

## Deployment

Production runs on Railway (`atlas-ptpn.up.railway.app`) built via Nixpacks —
see `nixpacks.toml` for the build and boot contract (migrate, storage:link,
config/route/view cache, scheduler loop, FrankenPHP). Uploads persist on a
Railway volume mounted at `/app/storage/app`; daily database backups run via
the `db-backup.yml` GitHub Actions workflow. `deploy/README.md` documents the
generic runtime/deployment contract (portable to other hosts); `HANDOVER.md`
covers handover specifics including the code-vs-data distinction.

## Architecture Notes

- Backend: Laravel with session authentication and PostgreSQL persistence.
- Frontend: React pages resolved through Inertia.
- Frontend API calls use same-origin Laravel routes, not a separate Express API.
- Sessions are stored in the database (`SESSION_DRIVER=database`, `sessions` table migration included).
- PostgreSQL is the only configured application database connection.
- Realtime is polling-based (`/realtime/poll` every 2s); SSE was deliberately removed.
