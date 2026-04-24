<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MeetingActionItem', function (Blueprint $table) {
            $table->id();
            $table->integer('meetingId');
            $table->string('title');
            $table->text('description')->nullable();
            $table->integer('assignedToId')->nullable();
            $table->timestamp('dueDate')->nullable();
            $table->string('status')->default('OPEN');
            $table->integer('linkedWorkItemId')->nullable();   // @map("linkedWorkItemId")
            $table->timestamp('completedAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('meetingId')->references('id')->on('Meeting')->cascadeOnDelete();

            $table->index('meetingId');
            $table->index('assignedToId');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MeetingActionItem');
    }
};
