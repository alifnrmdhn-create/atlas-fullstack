<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Index kolom filter terpanas (scale-readiness S3.2).
 *
 * Verifikasi 2026-06-16: Program ter-index code/kelompok/pilarStrategis/
 * healthStatus/ownerId/startDate/status — TAPI tidak ownerUnitId/approvalStatus,
 * padahal itu filter terpanas:
 *   - WorkspaceController::workspaceOverview & OrgSummaryService:
 *     whereIn('ownerUnitId', scope) + whereNull('archivedAt')
 *   - ProgramService list: whereIn('approvalStatus', [...]) + whereNull('archivedAt')
 * ChannelMember PK (channelId,userId) tak melayani `where userId` (lookup
 * channel-per-user di ChannelController) — leading column salah.
 *
 * Index ditulis CONCURRENTLY-friendly via plain create (tabel kecil sekarang;
 * saat besar, jalankan manual CREATE INDEX CONCURRENTLY untuk nol-lock).
 * Partial `WHERE archivedAt IS NULL` = paling efisien untuk filter "aktif".
 */
return new class extends Migration
{
    public function up(): void
    {
        // Composite untuk jalur scoped (non-eksekutif): ownerUnitId IN (...) +
        // approvalStatus. Leading ownerUnitId juga melayani filter ownerUnitId saja.
        if (! $this->hasIndex('Program', 'Program_ownerUnitId_approvalStatus_idx')) {
            Schema::table('Program', function ($table) {
                $table->index(['ownerUnitId', 'approvalStatus'], 'Program_ownerUnitId_approvalStatus_idx');
            });
        }
        // Standalone approvalStatus untuk jalur eksekutif (tanpa filter unit).
        if (! $this->hasIndex('Program', 'Program_approvalStatus_idx')) {
            Schema::table('Program', function ($table) {
                $table->index('approvalStatus', 'Program_approvalStatus_idx');
            });
        }
        // Partial index "aktif" — filter whereNull('archivedAt') ada di hampir
        // semua query list/overview. Partial = kecil & sangat selektif.
        DB::statement('CREATE INDEX IF NOT EXISTS "Program_active_partial_idx" ON "Program" ("ownerUnitId") WHERE "archivedAt" IS NULL');

        // ChannelMember: reverse lookup channel-per-user.
        if (! $this->hasIndex('ChannelMember', 'ChannelMember_userId_idx')) {
            Schema::table('ChannelMember', function ($table) {
                $table->index('userId', 'ChannelMember_userId_idx');
            });
        }
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS "Program_ownerUnitId_approvalStatus_idx"');
        DB::statement('DROP INDEX IF EXISTS "Program_approvalStatus_idx"');
        DB::statement('DROP INDEX IF EXISTS "Program_active_partial_idx"');
        DB::statement('DROP INDEX IF EXISTS "ChannelMember_userId_idx"');
    }

    private function hasIndex(string $table, string $index): bool
    {
        return collect(DB::select(
            "SELECT indexname FROM pg_indexes WHERE tablename = ? AND indexname = ?",
            [$table, $index],
        ))->isNotEmpty();
    }
};
