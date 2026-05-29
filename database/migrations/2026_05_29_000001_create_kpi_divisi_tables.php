<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 4th tier of the KPI hierarchy: Kolegial → Direktorat → Divisi → Individu.
 *
 * The line-item detail for the Divisi level was the only missing layer —
 * kpi_kolegial_*, kpi_direktur_*, kpi_karyawan_* already exist (2026-05-07),
 * and the rollup table DivisiScorecard already exists (2026-05-10). This adds
 * the per-KPI detail rows for divisions (e.g. DKSA 16 / DAPN 18 / DIMR 14),
 * mirroring kpi_direktur_* but scoped to an OrganizationalUnit.
 *
 * unit_id / directorate_id are `integer` (not foreignId/bigint) to match the
 * Prisma-legacy OrganizationalUnit.id / Directorate.id column type — same
 * pattern DivisiScorecard uses. period_id references the new performance_periods
 * (bigint), so foreignId is correct there.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('kpi_divisi_items', function (Blueprint $table) {
            $table->id();
            $table->integer('unit_id');                 // OrganizationalUnit (DKSA-HLD=14, DAPN-HLD=15, DIMR-HLD=16)
            $table->integer('directorate_id');          // denormalized for fast scope-by-directorate (DIR-KMR=5)
            $table->string('kode', 30);                 // stable key, e.g. "DKSA-01"
            $table->string('nama');                     // Indicator (Scorecard)
            $table->string('strategic_objective')->nullable();
            $table->string('perspektif', 40);           // Financial | Customer | Internal Business Process | L&G
            $table->string('satuan', 30);
            $table->string('polaritas', 10)->default('maximize'); // maximize | minimize
            $table->decimal('bobot', 5, 2)->default(0);
            $table->text('formula')->nullable();
            $table->string('sumber_data')->nullable();
            $table->smallInteger('tahun');
            $table->smallInteger('urutan')->default(0); // display order within the scorecard
            $table->timestamps();

            $table->foreign('unit_id')->references('id')->on('OrganizationalUnit')->cascadeOnDelete();
            $table->foreign('directorate_id')->references('id')->on('Directorate')->cascadeOnDelete();
            $table->unique(['unit_id', 'tahun', 'kode']);
            $table->index(['directorate_id', 'tahun']);
        });

        Schema::create('kpi_divisi_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kpi_divisi_item_id')->constrained('kpi_divisi_items')->cascadeOnDelete();
            $table->foreignId('period_id')->constrained('performance_periods')->cascadeOnDelete();
            $table->decimal('target', 18, 4)->nullable();
            $table->decimal('realisasi', 18, 4)->nullable();    // raw, polarity-naive (as entered)
            $table->decimal('skor', 8, 4)->nullable();          // cached "Nilai" from source (polarity + 110 cap applied); null = not measured
            $table->timestamps();

            $table->unique(['kpi_divisi_item_id', 'period_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpi_divisi_values');
        Schema::dropIfExists('kpi_divisi_items');
    }
};
