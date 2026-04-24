<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskReportLossEvent', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->timestamp('eventDate');
            $table->string('category');
            $table->text('description');
            $table->decimal('impactAmount', 20, 4)->nullable();
            $table->boolean('isRecurring')->default(false);
            $table->string('recoveryStatus')->default('UNRECOVERED');
            $table->decimal('recoveredAmount', 20, 4)->nullable();
            $table->string('pic');
            $table->text('notes')->nullable();

            $table->foreign('reportId')->references('id')->on('RiskMonthlyReport')->cascadeOnDelete();

            $table->index('reportId');
            $table->index('category');
            $table->index('recoveryStatus');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskReportLossEvent');
    }
};
