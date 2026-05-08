<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sprint 5 — transparency timestamp untuk auto-derive health.
 *
 * Catatan arsitektur: Program.healthStatus saat ini sudah di-compute oleh
 * ProgramHealthService (dipanggil event-driven saat blocker/workstream
 * berubah). Tidak ada manual override path. Sprint 5 menambah:
 *   - autoHealthComputedAt : timestamp kapan terakhir compute (transparency)
 *   - Extend signals di ProgramHealthService → tambah task overdue + blocker count
 *   - Scheduled batch refresh tiap 30 menit via atlas:compute-health command
 *
 * Tidak menambah autoHealthStatus column terpisah — karena Program.healthStatus
 * sudah = auto-derived. Bikin column baru hanya menambah duplikasi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->timestamp('autoHealthComputedAt')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->dropColumn('autoHealthComputedAt');
        });
    }
};
