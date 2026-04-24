<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MonthlyReportMetric', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->string('section')->default('KEUANGAN');
            $table->string('kategori');
            $table->string('label');
            $table->string('satuan')->nullable()->default('Rp Juta');
            $table->decimal('rkap', 20, 4)->nullable();
            $table->decimal('realisasi', 20, 4)->nullable();
            $table->decimal('tahunLalu', 20, 4)->nullable();
            $table->integer('order')->default(0);
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('reportId')->references('id')->on('MonthlyReport')->cascadeOnDelete();

            $table->index('reportId');
            $table->index('section');
            $table->index('kategori');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MonthlyReportMetric');
    }
};
