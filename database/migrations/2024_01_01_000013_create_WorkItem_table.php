<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Prisma model: Task  @@map("WorkItem")
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('WorkItem', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->integer('initiativeId');   // @map("initiativeId")
            $table->string('title');
            $table->text('description')->nullable();
            $table->integer('assignedTo')->nullable();
            $table->integer('createdBy');
            $table->integer('createdByUnitId')->nullable();
            $table->string('status')->default('BACKLOG');
            $table->string('priority')->default('MEDIUM');
            $table->integer('percentComplete')->default(0);
            $table->timestamp('startDate')->nullable();
            $table->timestamp('targetCompletion');
            $table->timestamp('actualCompletion')->nullable();
            $table->json('dependsOnIds')->nullable();
            $table->float('estimatedHours')->nullable();
            $table->float('actualHours')->default(0)->nullable();
            $table->string('healthStatus')->nullable();
            $table->boolean('isBlocked')->default(false);
            $table->text('blockedReason')->nullable();
            $table->integer('linkedThreadId')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();
            $table->json('actualWeeks')->nullable();
            $table->string('letterIndex')->nullable();
            $table->integer('phaseId')->nullable();
            $table->json('picPersonIds')->nullable();
            $table->json('picUnitIds')->nullable();
            $table->json('plannedWeeks')->nullable();

            $table->foreign('initiativeId')->references('id')->on('Initiative')->cascadeOnDelete();
            $table->foreign('phaseId')->references('id')->on('Phase')->nullOnDelete();

            $table->index('initiativeId');
            $table->index('phaseId');
            $table->index('assignedTo');
            $table->index('status');
            $table->index('targetCompletion');
            $table->index('healthStatus');
            $table->index('isBlocked');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('WorkItem');
    }
};
