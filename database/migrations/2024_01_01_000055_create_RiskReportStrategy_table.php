<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskReportStrategy', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId')->unique();
            $table->decimal('riskCapacity', 20, 4);
            $table->decimal('riskAppetite', 20, 4);
            $table->decimal('riskTolerance', 20, 4);
            $table->decimal('riskLimit', 20, 4);
            $table->decimal('totalExposure', 20, 4);
            $table->decimal('exposureVsCapacity', 8, 4);
            $table->decimal('exposureVsAppetite', 8, 4);
            $table->boolean('rasCompliant');
            $table->string('riskStance');
            $table->text('notes')->nullable();

            $table->foreign('reportId')->references('id')->on('RiskMonthlyReport')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskReportStrategy');
    }
};
