<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskReportNarrative', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->string('section');
            $table->text('content');
            $table->integer('order')->default(0);
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('reportId')->references('id')->on('RiskMonthlyReport')->cascadeOnDelete();

            $table->index('reportId');
            $table->index('section');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskReportNarrative');
    }
};
