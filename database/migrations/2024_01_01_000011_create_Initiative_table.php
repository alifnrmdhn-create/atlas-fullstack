<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Prisma model: Workstream  @@map("Initiative")
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Initiative', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->integer('programId');
            $table->string('name');
            $table->text('description')->nullable();
            $table->integer('ownerId');
            $table->integer('ownerUnitId')->nullable();
            $table->string('status')->default('BACKLOG');
            $table->string('priority')->default('MEDIUM');
            $table->timestamp('startDate')->nullable();
            $table->timestamp('targetCompletion');
            $table->timestamp('actualCompletion')->nullable();
            $table->integer('progressPercent')->default(0);
            $table->json('milestones')->nullable();
            $table->string('healthStatus')->nullable();
            $table->string('riskLevel')->nullable();
            $table->integer('linkedChannelId')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();
            $table->json('picPersonIds')->nullable();
            $table->integer('primaryPicPersonId')->nullable();

            $table->foreign('programId')->references('id')->on('Program')->cascadeOnDelete();

            $table->index('programId');
            $table->index('ownerId');
            $table->index('status');
            $table->index('targetCompletion');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Initiative');
    }
};
