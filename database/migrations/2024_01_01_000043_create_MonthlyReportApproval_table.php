<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MonthlyReportApproval', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->integer('approverId');
            $table->string('approverRole');
            $table->string('action');
            $table->text('note')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('reportId')->references('id')->on('MonthlyReport')->cascadeOnDelete();
            $table->foreign('approverId')->references('id')->on('User')->cascadeOnDelete();

            $table->index('reportId');
            $table->index('approverId');
            $table->index('approverRole');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MonthlyReportApproval');
    }
};
