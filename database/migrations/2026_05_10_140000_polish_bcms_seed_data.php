<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Polish data BCMS golden program — fix issue UI yang muncul setelah seed awal:
 *
 *   1. Tanggal off-by-1 (23:59:59 → tampil hari berikutnya karena TZ shift)
 *      Solusi: set jam 12:00:00 (siang, aman dari TZ shift)
 *   2. Program.strategicAlignment NULL → UI tampil "null%"
 *      Solusi: set 75 (program selaras dengan strategi MR korporat)
 *   3. Initiative.ownerUnitId NULL → kolom "PIC (DIVISI)" kosong di Jadwal
 *      Solusi: set ke unitId Este/Fadil (= 16, sub-divisi Manajemen Risiko)
 *   4. WorkItem.plannedWeeks/actualWeeks NULL → grid Plan/Real Gantt kosong
 *      Solusi: derive dari startDate/targetCompletion via Carbon, set actualWeeks
 *      untuk task yang COMPLETED
 *
 * Skip migration kalau program belum ada (test DB / fresh CI).
 */
return new class extends Migration
{
    public function up(): void
    {
        $programId = DB::table('Program')->where('code', 'DIMR-HLD-BCMS-001')->value('id');
        if (!$programId) {
            return;
        }

        $ws1Id = DB::table('Initiative')->where('code', 'DIMR-HLD-BCMS-001-WS-01')->value('id');
        $ws2Id = DB::table('Initiative')->where('code', 'DIMR-HLD-BCMS-001-WS-02')->value('id');
        if (!$ws1Id || !$ws2Id) {
            return;
        }

        $unitId = 16;

        DB::table('Program')->where('id', $programId)->update([
            'startDate'          => '2026-01-01 12:00:00',
            'targetEndDate'      => '2026-12-31 12:00:00',
            'strategicAlignment' => 75,
            'updatedAt'          => '2026-05-10 12:00:00',
        ]);

        DB::table('Initiative')->where('id', $ws1Id)->update([
            'startDate'        => '2026-01-01 12:00:00',
            'targetCompletion' => '2026-06-30 12:00:00',
            'ownerUnitId'      => $unitId,
            'updatedAt'        => '2026-05-10 12:00:00',
        ]);

        DB::table('Initiative')->where('id', $ws2Id)->update([
            'startDate'        => '2026-07-01 12:00:00',
            'targetCompletion' => '2026-12-31 12:00:00',
            'ownerUnitId'      => $unitId,
            'updatedAt'        => '2026-05-10 12:00:00',
        ]);

        $tasks = [
            ['T-01', '2026-01-01 12:00:00', '2026-01-15 12:00:00', '2026-01-08 12:00:00', 'COMPLETED'],
            ['T-02', '2026-02-01 12:00:00', '2026-02-28 12:00:00', '2026-02-25 12:00:00', 'COMPLETED'],
            ['T-03', '2026-03-01 12:00:00', '2026-06-30 12:00:00', null,                  'IN_REVIEW'],
            ['T-04', '2026-07-01 12:00:00', '2026-08-31 12:00:00', null,                  'BACKLOG'],
            ['T-05', '2026-08-01 12:00:00', '2026-09-30 12:00:00', null,                  'BACKLOG'],
            ['T-06', '2026-09-15 12:00:00', '2026-10-31 12:00:00', null,                  'BACKLOG'],
            ['T-07', '2026-11-01 12:00:00', '2026-12-15 12:00:00', null,                  'BACKLOG'],
        ];

        foreach ($tasks as [$codeSuffix, $startStr, $endStr, $actualStr, $status]) {
            $start = Carbon::parse($startStr);
            $end   = Carbon::parse($endStr);

            $plannedWeeks = [];
            $cursor = $start->copy()->startOfWeek(Carbon::MONDAY);
            while ($cursor <= $end) {
                $plannedWeeks[] = $cursor->format('o-\WW');
                $cursor->addWeek();
            }

            $actualWeeks = $status === 'COMPLETED' ? $plannedWeeks : null;

            $update = [
                'startDate'        => $startStr,
                'targetCompletion' => $endStr,
                'plannedWeeks'     => json_encode($plannedWeeks),
                'actualWeeks'      => $actualWeeks !== null ? json_encode($actualWeeks) : null,
                'updatedAt'        => '2026-05-10 12:00:00',
            ];
            if ($actualStr !== null) {
                $update['actualCompletion'] = $actualStr;
            }

            DB::table('WorkItem')
                ->where('code', "DIMR-HLD-BCMS-001-{$codeSuffix}")
                ->update($update);
        }
    }

    public function down(): void
    {
        // No-op: data polish; rollback tidak meaningful.
    }
};
