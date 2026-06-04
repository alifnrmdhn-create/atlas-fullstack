<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * broadcast_events.userIds di-query tiap 2 detik per user lewat
 * `"userIds"::jsonb @> ?::jsonb` (RealtimeController::poll). Kolom bertipe `json`
 * memaksa cast ke jsonb saat runtime untuk SETIAP baris yang lolos predikat id,
 * dan tidak bisa di-index. Ubah ke `jsonb` + tambah GIN index supaya containment
 * `@>` cepat saat tabel membesar (retensi event dinaikkan agar tab yang sempat
 * offline tidak kehilangan event — lihat CleanupBroadcastEvents).
 *
 * Postgres-only (target stack). Di driver lain: no-op (kolom tetap json yang
 * sudah portable).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement('ALTER TABLE broadcast_events ALTER COLUMN "userIds" TYPE jsonb USING "userIds"::jsonb');
        DB::statement('CREATE INDEX IF NOT EXISTS broadcast_events_userids_gin ON broadcast_events USING gin ("userIds")');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement('DROP INDEX IF EXISTS broadcast_events_userids_gin');
        DB::statement('ALTER TABLE broadcast_events ALTER COLUMN "userIds" TYPE json USING "userIds"::json');
    }
};
