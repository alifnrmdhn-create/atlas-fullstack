<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// NEW TABLE — normalisasi dari MonthlyReport.linkedProgramIds (int[] JSON)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monthly_report_programs', function (Blueprint $table) {
            $table->integer('reportId');
            $table->integer('programId');

            $table->primary(['reportId', 'programId']);
            $table->foreign('reportId')->references('id')->on('MonthlyReport')->cascadeOnDelete();
            $table->foreign('programId')->references('id')->on('Program')->cascadeOnDelete();

            $table->index('reportId');
            $table->index('programId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monthly_report_programs');
    }
};
