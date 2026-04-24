<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskReportMitigation', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->integer('riskSnapshotId')->unique();
            $table->integer('plannedActions');
            $table->integer('completedActions');
            $table->decimal('completionRate', 8, 4);
            $table->decimal('budgetAllocated', 20, 4)->nullable();
            $table->decimal('budgetRealized', 20, 4)->nullable();
            $table->decimal('budgetAbsorption', 8, 4)->nullable();
            $table->boolean('isOverdue')->default(false);
            $table->integer('overdueDays')->nullable();
            $table->text('notes')->nullable();

            $table->foreign('reportId')->references('id')->on('RiskMonthlyReport')->cascadeOnDelete();
            $table->foreign('riskSnapshotId')->references('id')->on('RiskReportRiskSnapshot')->cascadeOnDelete();

            $table->index('reportId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskReportMitigation');
    }
};
