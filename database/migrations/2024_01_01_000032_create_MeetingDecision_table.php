<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MeetingDecision', function (Blueprint $table) {
            $table->id();
            $table->integer('meetingId');
            $table->text('decision');
            $table->integer('decidedBy');
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('meetingId')->references('id')->on('Meeting')->cascadeOnDelete();

            $table->index('meetingId');
            $table->index('decidedBy');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MeetingDecision');
    }
};
