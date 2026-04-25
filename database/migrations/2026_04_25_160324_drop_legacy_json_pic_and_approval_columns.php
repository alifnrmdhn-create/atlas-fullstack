<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hapus kolom JSON legacy yang sudah digantikan tabel normalisasi:
 *
 *   picPersonIds  → entity_pics   (Program, Initiative, Phase, WorkItem)
 *   approvalChain → assignment_approval_entries  (Assignment)
 *
 * Semua data sudah ada di tabel normalisasi sejak migrasi backfill
 * (2026_04_25_000004_backfill_normalized_legacy_json). Read/write path
 * sudah sepenuhnya beralih ke tabel normalisasi sebelum migration ini.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->dropColumn('picPersonIds');
        });

        Schema::table('Initiative', function (Blueprint $table) {
            $table->dropColumn('picPersonIds');
        });

        Schema::table('Phase', function (Blueprint $table) {
            $table->dropColumn('picPersonIds');
        });

        Schema::table('WorkItem', function (Blueprint $table) {
            $table->dropColumn('picPersonIds');
        });

        Schema::table('Assignment', function (Blueprint $table) {
            $table->dropColumn('approvalChain');
        });
    }

    public function down(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->json('picPersonIds')->nullable();
        });

        Schema::table('Initiative', function (Blueprint $table) {
            $table->json('picPersonIds')->nullable();
        });

        Schema::table('Phase', function (Blueprint $table) {
            $table->json('picPersonIds')->nullable();
        });

        Schema::table('WorkItem', function (Blueprint $table) {
            $table->json('picPersonIds')->nullable();
        });

        Schema::table('Assignment', function (Blueprint $table) {
            $table->json('approvalChain')->nullable();
        });
    }
};
