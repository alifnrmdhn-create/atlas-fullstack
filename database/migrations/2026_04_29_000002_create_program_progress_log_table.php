<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ProgramProgressLog', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('programId');
            $table->string('period', 20);             // format YYYY-WXX (e.g. 2026-W17) atau YYYY-MM
            $table->string('healthAtTime', 20);        // on_track | at_risk | terlambat | overdue
            $table->text('narrative');
            $table->text('kendala')->nullable();
            $table->text('dukunganDibutuhkan')->nullable();
            $table->unsignedBigInteger('createdById');
            $table->string('createdByName', 100)->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrentOnUpdate()->nullable();

            $table->foreign('programId')->references('id')->on('Program')->cascadeOnDelete();
            $table->foreign('createdById')->references('id')->on('User')->restrictOnDelete();
            $table->unique(['programId', 'period']); // satu entry per program per period
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ProgramProgressLog');
    }
};
