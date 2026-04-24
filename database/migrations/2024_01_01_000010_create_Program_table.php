<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Program', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->text('strategicObjective')->nullable();
            $table->integer('ownerId');
            $table->integer('ownerUnitId')->nullable();
            $table->string('status')->default('PLANNING');
            $table->string('priority')->default('MEDIUM');
            $table->decimal('budgetIdr', 20, 4)->nullable();
            $table->decimal('budgetSpent', 20, 4)->default(0)->nullable();
            $table->timestamp('startDate');
            $table->timestamp('targetEndDate');
            $table->timestamp('actualEndDate')->nullable();
            $table->integer('progressPercent')->default(0);
            $table->float('strategicAlignment')->nullable();
            $table->string('healthStatus')->nullable();
            $table->integer('linkedChannelId')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();
            $table->boolean('hasNoApmsKpi')->default(false);
            $table->string('approvalStatus')->default('ACTIVE');
            $table->text('rejectionNote')->nullable();
            $table->integer('submittedById')->nullable();
            $table->json('picPersonIds')->nullable();
            $table->timestamp('archivedAt')->nullable();
            $table->integer('archivedById')->nullable();

            $table->index('ownerId');
            $table->index('status');
            $table->index('startDate');
            $table->index('healthStatus');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Program');
    }
};
