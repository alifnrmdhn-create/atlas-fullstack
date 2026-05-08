<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Periods ──────────────────────────────────────────────────────────
        Schema::create('performance_periods', function (Blueprint $table) {
            $table->id();
            $table->smallInteger('tahun');
            $table->tinyInteger('bulan'); // 1–12
            $table->string('label', 20);  // "Jan 2026"
            $table->boolean('is_active')->default(false);
            $table->timestamps();
            $table->unique(['tahun', 'bulan']);
        });

        // ── KPI Kolegial (shared across all directorates) ─────────────────
        Schema::create('kpi_kolegial_items', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 30)->unique();
            $table->string('nama');
            $table->string('perspektif', 40); // ekonomi_sosial|imb|teknologi|investasi|talenta
            $table->string('satuan', 30);     // %, Rp, Ton, Ha, dll
            $table->string('polaritas', 10)->default('maximize');
            $table->decimal('bobot_default', 5, 2)->default(0);
            $table->text('definisi')->nullable();
            $table->string('formula')->nullable();
            $table->string('sumber_data')->nullable();
            $table->timestamps();
        });

        Schema::create('kpi_kolegial_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kpi_kolegial_item_id')->constrained('kpi_kolegial_items')->cascadeOnDelete();
            $table->foreignId('period_id')->constrained('performance_periods')->cascadeOnDelete();
            $table->string('directorate_code', 10); // DIRUT|DBS|DAS|DPP|DSU|DKM
            $table->decimal('bobot', 5, 2)->default(0);
            $table->decimal('target', 18, 4)->nullable();
            $table->decimal('realisasi', 18, 4)->nullable();
            $table->decimal('skor', 8, 4)->nullable();
            $table->timestamps();
            $table->unique(['kpi_kolegial_item_id', 'period_id', 'directorate_code']);
        });

        // ── KPI Individu Direktur (specific per directorate) ──────────────
        Schema::create('kpi_direktur_items', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 30)->unique();
            $table->string('nama');
            $table->string('directorate_code', 10);
            $table->string('perspektif', 40);
            $table->string('satuan', 30);
            $table->string('polaritas', 10)->default('maximize');
            $table->decimal('bobot', 5, 2)->default(0);
            $table->text('definisi')->nullable();
            $table->timestamps();
        });

        Schema::create('kpi_direktur_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kpi_direktur_item_id')->constrained('kpi_direktur_items')->cascadeOnDelete();
            $table->foreignId('period_id')->constrained('performance_periods')->cascadeOnDelete();
            $table->decimal('target', 18, 4)->nullable();
            $table->decimal('realisasi', 18, 4)->nullable();
            $table->decimal('skor', 8, 4)->nullable();
            $table->timestamps();
            $table->unique(['kpi_direktur_item_id', 'period_id']);
        });

        // ── KPI Karyawan Individual (from APMS) ───────────────────────────
        Schema::create('kpi_karyawan_items', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 30);
            $table->string('nama');
            $table->foreignId('user_id')->constrained('User')->cascadeOnDelete();
            $table->string('unit_code', 20)->nullable(); // DKSA, DAPN, DIMR, etc.
            $table->string('satuan', 30);
            $table->string('polaritas', 10)->default('maximize');
            $table->decimal('bobot', 5, 2)->default(0);
            $table->text('definisi')->nullable();
            $table->smallInteger('tahun');
            $table->timestamps();
        });

        Schema::create('kpi_karyawan_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kpi_karyawan_item_id')->constrained('kpi_karyawan_items')->cascadeOnDelete();
            $table->foreignId('period_id')->constrained('performance_periods')->cascadeOnDelete();
            $table->decimal('target', 18, 4)->nullable();
            $table->decimal('realisasi', 18, 4)->nullable();
            $table->decimal('skor', 8, 4)->nullable();
            $table->timestamps();
            $table->unique(['kpi_karyawan_item_id', 'period_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpi_karyawan_values');
        Schema::dropIfExists('kpi_karyawan_items');
        Schema::dropIfExists('kpi_direktur_values');
        Schema::dropIfExists('kpi_direktur_items');
        Schema::dropIfExists('kpi_kolegial_values');
        Schema::dropIfExists('kpi_kolegial_items');
        Schema::dropIfExists('performance_periods');
    }
};
