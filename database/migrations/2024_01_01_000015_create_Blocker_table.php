<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Blocker', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->integer('workItemId');   // @map("workItemId")
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('severity');
            $table->integer('createdBy');
            $table->integer('createdByUnitId')->nullable();
            $table->integer('assignedTo')->nullable();
            $table->string('status')->default('OPEN');
            $table->string('priority')->default('HIGH');
            $table->text('rootCause')->nullable();
            $table->text('resolution')->nullable();
            $table->timestamp('resolvedAt')->nullable();
            $table->integer('resolutionTime')->nullable();
            $table->json('relatedBlockerIds')->nullable();
            $table->json('linkedWorkItemIds')->nullable();   // @map("linkedWorkItemIds")
            $table->integer('linkedChannelId')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('workItemId')->references('id')->on('WorkItem')->cascadeOnDelete();

            $table->index('workItemId');
            $table->index('assignedTo');
            $table->index('status');
            $table->index('severity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Blocker');
    }
};
