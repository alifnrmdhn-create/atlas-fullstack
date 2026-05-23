<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * KpiValueRevision — audit history untuk KpiValue.
 *
 * Sebelumnya KpiValue::updateOrCreate (kpiDefinitionId, measurementDate)
 * replace existing value tanpa simpan nilai lama → audit trail hilang.
 * Kasus: user submit refleksi week N dengan KPI=20, lalu edit jadi KPI=25 →
 * row di-update, value 20 hilang permanently. Kadiv yang review tidak bisa
 * trace kapan/kenapa berubah.
 *
 * Solusi: setiap update di KpiValue triggers insert ke KpiValueRevision
 * dengan nilai LAMA + metadata revision. Current value tetap di KpiValue
 * (single source of truth untuk display), history terbaca dari sini.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('KpiValueRevision', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('kpiValueId');
            $table->integer('kpiDefinitionId');
            $table->timestamp('measurementDate');
            // Snapshot nilai LAMA sebelum diganti
            $table->decimal('previousActualValue', 20, 6);
            $table->decimal('previousTargetValue', 20, 6)->nullable();
            $table->text('previousStatusNotes')->nullable();
            $table->integer('previousMeasuredBy')->nullable();
            // Metadata revision: siapa yang trigger update, kapan
            $table->integer('revisedBy');
            $table->timestamp('revisedAt')->useCurrent();
            $table->text('revisionNote')->nullable(); // opsional: alasan edit

            $table->foreign('kpiValueId')->references('id')->on('KpiValue')->cascadeOnDelete();
            $table->foreign('kpiDefinitionId')->references('id')->on('KpiDefinition')->cascadeOnDelete();
            $table->foreign('revisedBy')->references('id')->on('User')->restrictOnDelete();

            $table->index('kpiValueId');
            $table->index('kpiDefinitionId');
            $table->index('revisedAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('KpiValueRevision');
    }
};
