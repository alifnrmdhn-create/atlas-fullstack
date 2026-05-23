<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Migrate existing task status=BLOCKED → status=IN_PROGRESS + isBlocked=true.
 *
 * Workboard column "Blocked" dihilangkan (2026-05-21) karena overlap dengan
 * status lain — task realistis bisa "In Progress + ada hambatan" sekaligus,
 * tapi BLOCKED column memaksa user pindah → lose context "sedang dikerjakan".
 *
 * Solusi: BLOCKED jadi badge orthogonal (`isBlocked` flag), task tetap di
 * kolom status proper (umumnya IN_PROGRESS karena blocked-at-work scenario).
 *
 * Migration ini one-shot — kalau ada task status=BLOCKED lagi, FE bucket
 * ke IN_PROGRESS column dengan badge, dan akan trigger fix manual via
 * "Tandai Terhambat" button (yang set status=IN_PROGRESS + isBlocked=true).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Set isBlocked=true + preserve blockedReason kalau ada, sebelum ganti status
        DB::table('WorkItem')
            ->where('status', 'BLOCKED')
            ->update([
                'status'    => 'IN_PROGRESS',
                'isBlocked' => true,
                // blockedReason TIDAK diubah — kalau sebelumnya ada reason, tetap.
                // Kalau null, isBlocked=true tanpa reason masih valid (legacy).
            ]);
    }

    public function down(): void
    {
        // Down migration: revert ke status=BLOCKED untuk task yang punya isBlocked=true.
        // Tidak perfect (kita tidak tahu mana yang asli BLOCKED vs yang baru di-set blocked),
        // tapi reasonable approximation.
        DB::table('WorkItem')
            ->where('status', 'IN_PROGRESS')
            ->where('isBlocked', true)
            ->update(['status' => 'BLOCKED']);
    }
};
