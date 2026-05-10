<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Set WorkItem.picUnitIds untuk task BCMS — kolom "PIC (DIVISI)" di tab Jadwal
 * mengambil dari sini (jsonb), bukan dari Initiative.ownerUnitId.
 *
 * Semua 7 task BCMS di-PIC-kan ke unit 16 (Sub Divisi Manajemen Risiko)
 * — unit yang sama dengan Este (186), Fadil (185), Dwi (197).
 *
 * Skip kalau program belum ada (test DB / fresh CI).
 */
return new class extends Migration
{
    public function up(): void
    {
        $programId = DB::table('Program')->where('code', 'DIMR-HLD-BCMS-001')->value('id');
        if (!$programId) {
            return;
        }

        $taskCodes = [
            'DIMR-HLD-BCMS-001-T-01',
            'DIMR-HLD-BCMS-001-T-02',
            'DIMR-HLD-BCMS-001-T-03',
            'DIMR-HLD-BCMS-001-T-04',
            'DIMR-HLD-BCMS-001-T-05',
            'DIMR-HLD-BCMS-001-T-06',
            'DIMR-HLD-BCMS-001-T-07',
        ];

        DB::table('WorkItem')
            ->whereIn('code', $taskCodes)
            ->update([
                'picUnitIds' => json_encode([16]),
                'updatedAt'  => '2026-05-10 12:00:00',
            ]);
    }

    public function down(): void
    {
        // No-op
    }
};
