<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskReportGovernance', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId')->unique();
            $table->decimal('riskRegisterCoverage', 8, 4);
            $table->integer('risksWithoutOwner');
            $table->decimal('reportSubmissionRate', 8, 4);
            $table->decimal('organCompletenessRate', 8, 4);
            $table->decimal('workProgramRealization', 8, 4);
            $table->decimal('auditFollowUpRate', 8, 4);
            $table->decimal('erinUpdateRate', 8, 4);
            $table->integer('internalControlFindings');
            $table->integer('criticalFindingsOpen');
            $table->text('notes')->nullable();

            $table->foreign('reportId')->references('id')->on('RiskMonthlyReport')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskReportGovernance');
    }
};
