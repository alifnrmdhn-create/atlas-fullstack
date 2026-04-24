<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskReportRiskSnapshot', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->string('riskCode');
            $table->string('riskName');
            $table->string('category');
            $table->integer('probabilitas');
            $table->integer('dampak');
            $table->integer('riskScore');
            $table->string('riskLevel');
            $table->string('status')->default('OPEN');
            $table->integer('prevMonthScore')->nullable();
            $table->string('scoreChange')->nullable();
            $table->string('ownerName');
            $table->text('notes')->nullable();
            $table->integer('order')->default(0);

            $table->foreign('reportId')->references('id')->on('RiskMonthlyReport')->cascadeOnDelete();

            $table->index('reportId');
            $table->index('riskLevel');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskReportRiskSnapshot');
    }
};
