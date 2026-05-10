<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tambah field `correctiveAction` dan `nextStep` ke ProgramProgressLog.
 *
 * Selaraskan dengan struktur 3-section yang Pak Dirkeu konsisten pakai
 * di KPI Charter PPT DKMR: Problem Identification → Corrective Action →
 * Next Step. ATLAS sebelumnya cuma punya narrative + kendala (= PI) +
 * dukunganDibutuhkan, missing CA dan NS sebagai field tersendiri.
 *
 * Field nullable supaya backward-compatible — log lama tidak butuh
 * di-backfill.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ProgramProgressLog', function (Blueprint $table) {
            $table->text('correctiveAction')->nullable()->after('kendala');
            $table->text('nextStep')->nullable()->after('correctiveAction');
        });
    }

    public function down(): void
    {
        Schema::table('ProgramProgressLog', function (Blueprint $table) {
            $table->dropColumn(['correctiveAction', 'nextStep']);
        });
    }
};
