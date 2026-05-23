<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill Channel.linkedProgramId dari Program.linkedChannelId untuk
 * existing data. Sync diaktifkan di ProgramService::update going forward
 * (2026-05-23) tapi data lama yang sudah ter-link tidak muncul di Channel
 * sampai user re-edit + save program. Migration ini one-shot fix.
 *
 * Strategy:
 *   - Untuk setiap Program (non-archived) dengan linkedChannelId set,
 *     isi Channel.linkedProgramId KALAU masih null.
 *   - Kalau >1 program link ke channel sama, oldest program wins (createdAt).
 *     Preserve niat "channel originally created untuk program X".
 *   - Skip channel yang sudah punya linkedProgramId — preserve niat existing.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Ambil pasangan channelId → programId (oldest program per channel).
        // Join Program ↔ Channel, filter program non-archived dengan link valid,
        // urutkan oldest first.
        $pairs = DB::table('Program as p')
            ->join('Channel as c', 'p.linkedChannelId', '=', 'c.id')
            ->whereNotNull('p.linkedChannelId')
            ->whereNull('p.archivedAt')
            ->whereNull('c.linkedProgramId')
            ->orderBy('p.createdAt')
            ->select('c.id as channelId', 'p.id as programId')
            ->get();

        $assigned = [];
        foreach ($pairs as $row) {
            // Skip kalau channel sudah di-assign di iterasi sebelumnya
            // (channel ditarget >1 program, oldest sudah menang).
            if (isset($assigned[$row->channelId])) continue;

            // Defensive re-check di whereNull — race condition kalau ada
            // concurrent update saat migration jalan. Cheap & safe.
            DB::table('Channel')
                ->where('id', $row->channelId)
                ->whereNull('linkedProgramId')
                ->update(['linkedProgramId' => $row->programId]);

            $assigned[$row->channelId] = true;
        }
    }

    public function down(): void
    {
        // Down migration: tidak ada cara aman untuk distinguish backfilled
        // entries dari yang memang di-set manual. Skip — backfill bersifat
        // catch-up, bukan struktural. Rollback = leave as-is.
    }
};
