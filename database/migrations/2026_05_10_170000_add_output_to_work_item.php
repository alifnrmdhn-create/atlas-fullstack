<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tambah field `output` ke WorkItem — selaras dengan kolom "Output / Laporan"
 * di KPI Charter PPT DKMR. Sebelumnya output tertanam di description; sekarang
 * eksplisit supaya Tab Struktur & Tab Jadwal bisa render kolom Output yang
 * gampang di-skim untuk audit "apa yang di-deliver per task".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('WorkItem', function (Blueprint $table) {
            $table->text('output')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('WorkItem', function (Blueprint $table) {
            $table->dropColumn('output');
        });
    }
};
