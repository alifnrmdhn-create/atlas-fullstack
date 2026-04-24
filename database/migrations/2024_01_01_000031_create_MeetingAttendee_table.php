<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MeetingAttendee', function (Blueprint $table) {
            $table->id();
            $table->integer('meetingId');
            $table->integer('userId');
            $table->string('attendeeRole')->default('REQUIRED');
            $table->string('rsvpStatus')->default('PENDING');
            $table->integer('delegateToId')->nullable();
            $table->text('delegateNote')->nullable();
            $table->timestamp('respondedAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->unique(['meetingId', 'userId']);
            $table->foreign('meetingId')->references('id')->on('Meeting')->cascadeOnDelete();

            $table->index('meetingId');
            $table->index('userId');
            $table->index('rsvpStatus');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MeetingAttendee');
    }
};
