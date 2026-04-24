<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('SubTask', function (Blueprint $table) {
            $table->id();
            $table->integer('workItemId');   // @map("workItemId")
            $table->string('title');
            $table->text('description')->nullable();
            $table->integer('assignedTo')->nullable();
            $table->string('status')->default('PENDING');
            $table->boolean('isCompleted')->default(false);
            $table->timestamp('completedAt')->nullable();
            $table->timestamp('dueDate')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('workItemId')->references('id')->on('WorkItem')->cascadeOnDelete();

            $table->index('workItemId');
            $table->index('assignedTo');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('SubTask');
    }
};
