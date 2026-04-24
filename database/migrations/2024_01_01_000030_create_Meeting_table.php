<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Meeting', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('meetingType')->default('RAPAT_TIM');
            $table->timestamp('startAt');
            $table->timestamp('endAt');
            $table->string('location')->nullable();
            $table->integer('organizerId');
            $table->integer('linkedProgramId')->nullable();
            $table->string('status')->default('SCHEDULED');
            $table->text('notes')->nullable();
            $table->text('postponedReason')->nullable();
            $table->timestamp('rescheduledFromAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->index('organizerId');
            $table->index('startAt');
            $table->index('status');
            $table->index('linkedProgramId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Meeting');
    }
};
