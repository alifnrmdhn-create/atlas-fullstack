<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskReportKRI', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->integer('riskSnapshotId');
            $table->string('kriCode');
            $table->string('kriName');
            $table->string('unit');
            $table->decimal('targetValue', 20, 6);
            $table->decimal('actualValue', 20, 6);
            $table->decimal('thresholdWarning', 20, 6);
            $table->decimal('thresholdCritical', 20, 6);
            $table->string('status');
            $table->string('trend');
            $table->decimal('prevMonthValue', 20, 6)->nullable();
            $table->boolean('higherIsBetter')->default(true);
            $table->text('notes')->nullable();
            $table->integer('order')->default(0);

            $table->foreign('reportId')->references('id')->on('RiskMonthlyReport')->cascadeOnDelete();
            $table->foreign('riskSnapshotId')->references('id')->on('RiskReportRiskSnapshot')->cascadeOnDelete();

            $table->index('reportId');
            $table->index('riskSnapshotId');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskReportKRI');
    }
};
