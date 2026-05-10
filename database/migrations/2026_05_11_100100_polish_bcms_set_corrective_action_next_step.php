<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Isi field correctiveAction + nextStep untuk 2 ProgramProgressLog BCMS
 * existing (Jan & April 2026), supaya UI bisa menampilkan struktur PI/CA/NS
 * lengkap saat verify Gap #3.
 */
return new class extends Migration
{
    public function up(): void
    {
        $programId = DB::table('Program')->where('code', 'DIMR-HLD-BCMS-001')->value('id');
        if (!$programId) {
            return;
        }

        DB::table('ProgramProgressLog')
            ->where('programId', $programId)
            ->where('period', '2026-01')
            ->update([
                'correctiveAction' => null,
                'nextStep'         => 'Lanjut ke penyusunan kebijakan dan SOP BCMS sesuai ISO 22301. Targetkan draft framework lengkap pertengahan Q2.',
                'updatedAt'        => '2026-05-11 09:00:00',
            ]);

        DB::table('ProgramProgressLog')
            ->where('programId', $programId)
            ->where('period', '2026-04')
            ->update([
                'correctiveAction' => 'Workshop intensif 2 hari (Mei 2026) dengan tim subdiv untuk finalisasi 4 SOP. Engage konsultan eksternal untuk validasi skenario kontinjensi unit operasional perkebunan.',
                'nextStep'         => 'Target SOP & Pedoman BCMS final di akhir Q2 2026. Tabletop simulation Q3 setelah dokumen approved Kasub dan Kadiv.',
                'updatedAt'        => '2026-05-11 09:00:00',
            ]);
    }

    public function down(): void
    {
        // No-op
    }
};
