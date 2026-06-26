<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * position_history.positionId dulu FK tanpa onDelete (NO ACTION / RESTRICT),
 * satu-satunya FK ke Position yang merestrict (sisanya nullOnDelete). Position
 * tak punya SoftDeletes, jadi setiap posisi yang PERNAH dipegang (punya baris
 * history) TAK BISA dihapus → destroyPosition melempar 23503 → HTTP 500, dan
 * (tanpa transaksi) side-effect unassign/reparent sudah ter-commit lebih dulu.
 *
 * Ubah ke cascadeOnDelete: history adalah jejak penugasan posisi tsb — saat
 * posisi di-hard-delete, jejaknya ikut terhapus secara atomik di level DB
 * (tak ada denormalisasi nama posisi di history, jadi nullOnDelete hanya
 * menyisakan baris tak bermakna). Transaksi di controller menamb atomisitas
 * untuk side-effect aplikasi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('position_history', function (Blueprint $table) {
            $table->dropForeign(['positionId']);
            $table->foreign('positionId')->references('id')->on('Position')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('position_history', function (Blueprint $table) {
            $table->dropForeign(['positionId']);
            $table->foreign('positionId')->references('id')->on('Position');
        });
    }
};
