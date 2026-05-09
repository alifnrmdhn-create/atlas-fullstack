<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 2 KPI integration — direktorat & divisi level scorecard.
 *
 * Separate from KpiDefinition/KpiValue (which are program-level KPIs).
 * These tables store the corporate scorecard achievement values that feed
 * the Home dashboard (KPI Achievement column) and the Performance page.
 *
 * One row per (direktorat, periode) and (divisi, periode). Periode is
 * stored as YYYY-MM string for monthly granularity.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('DirektoratScorecard', function (Blueprint $table) {
            $table->id();
            $table->integer('directorateId');
            $table->string('periode', 7); // YYYY-MM
            $table->decimal('nilai', 6, 2); // 0.00 - 999.99 (% achievement)
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('directorateId')->references('id')->on('Directorate')->cascadeOnDelete();
            $table->unique(['directorateId', 'periode']);
            $table->index('periode');
        });

        Schema::create('DivisiScorecard', function (Blueprint $table) {
            $table->id();
            $table->integer('unitId');
            $table->integer('directorateId'); // denormalized for fast scope-by-directorate queries
            $table->string('periode', 7);
            $table->decimal('nilai', 6, 2);
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('unitId')->references('id')->on('OrganizationalUnit')->cascadeOnDelete();
            $table->foreign('directorateId')->references('id')->on('Directorate')->cascadeOnDelete();
            $table->unique(['unitId', 'periode']);
            $table->index(['directorateId', 'periode']);
            $table->index('periode');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('DivisiScorecard');
        Schema::dropIfExists('DirektoratScorecard');
    }
};
