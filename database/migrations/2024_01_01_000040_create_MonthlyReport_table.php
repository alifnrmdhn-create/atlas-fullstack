<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MonthlyReport', function (Blueprint $table) {
            $table->id();
            $table->integer('unitId');
            $table->integer('month');
            $table->integer('year');
            $table->string('status')->default('DRAFT');
            $table->text('narrativeSummary')->nullable();
            $table->text('highlights')->nullable();
            $table->integer('submittedById')->nullable();
            $table->timestamp('submittedAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();
            // linkedProgramIds stored as int[] in Prisma → kept as JSON; normalized separately
            $table->json('linkedProgramIds')->default('[]');

            $table->unique(['unitId', 'month', 'year']);
            $table->foreign('unitId')->references('id')->on('OrganizationalUnit')->cascadeOnDelete();
            $table->foreign('submittedById')->references('id')->on('User')->nullOnDelete();

            $table->index('unitId');
            $table->index('status');
            $table->index(['year', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MonthlyReport');
    }
};
