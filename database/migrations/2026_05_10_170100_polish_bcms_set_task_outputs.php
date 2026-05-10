<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Set field `output` untuk 7 task BCMS sesuai PPT slide 42 (kolom Output).
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

        $outputs = [
            'DIMR-HLD-BCMS-001-T-01' => 'Notula tabletop exercise (DIMR/MoM/01/2026)',
            'DIMR-HLD-BCMS-001-T-02' => 'Notula review kecukupan dokumen BCMS',
            'DIMR-HLD-BCMS-001-T-03' => 'Kebijakan, Pedoman, dan 4 SOP BCMS final',
            'DIMR-HLD-BCMS-001-T-04' => 'SK Tim BCMS PTPN III (Persero)',
            'DIMR-HLD-BCMS-001-T-05' => 'Laporan pelaksanaan pelatihan tim BCMS',
            'DIMR-HLD-BCMS-001-T-06' => 'Notula sosialisasi tanggap darurat',
            'DIMR-HLD-BCMS-001-T-07' => 'Laporan hasil simulasi keadaan bencana',
        ];

        foreach ($outputs as $code => $output) {
            DB::table('WorkItem')->where('code', $code)->update([
                'output'    => $output,
                'updatedAt' => '2026-05-10 12:00:00',
            ]);
        }
    }

    public function down(): void
    {
        // No-op
    }
};
