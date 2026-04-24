<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MonthlyReportFile', function (Blueprint $table) {
            $table->id();
            $table->integer('reportId');
            $table->string('filename');
            $table->string('originalName');
            $table->string('filepath');
            $table->integer('filesize')->nullable();
            $table->integer('uploadedById');
            $table->timestamp('uploadedAt')->useCurrent();

            $table->foreign('reportId')->references('id')->on('MonthlyReport')->cascadeOnDelete();
            $table->foreign('uploadedById')->references('id')->on('User')->cascadeOnDelete();

            $table->index('reportId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MonthlyReportFile');
    }
};
