#!/usr/bin/env bash
# Setup database untuk test suite (PostgreSQL).
# Jalankan sekali sebelum pertama kali menjalankan `php artisan test`.

set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USERNAME:-ptpn_dev}"
DB_PASS="${DB_PASSWORD:-dev_password_123}"
DB_TEST="ptpn_kmr_test"
DB_SCHEMA="${DB_SCHEMA:-ptpn_kmr_app}"

export PGPASSWORD="$DB_PASS"

echo "→ Membuat test database: $DB_TEST"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE $DB_TEST;" 2>/dev/null || echo "  (database sudah ada, skip)"

echo "→ Membuat schema: $DB_SCHEMA"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_TEST" \
    -c "CREATE SCHEMA IF NOT EXISTS \"$DB_SCHEMA\";"

echo "→ Menjalankan migrasi di test database"
DB_DATABASE="$DB_TEST" DB_SCHEMA="$DB_SCHEMA" php artisan migrate --database=pgsql --path=database/migrations --force

echo "✓ Test database siap: $DB_TEST.$DB_SCHEMA"
