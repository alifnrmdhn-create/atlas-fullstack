<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Broadcast queue untuk SSE — setiap event mutation di-insert di sini,
// lalu endpoint /realtime/stream poll ke tabel ini dan push ke SSE.
// Events older than ~2 minutes di-garbage-collect via scheduler.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('broadcast_events', function (Blueprint $table) {
            $table->id();
            $table->string('eventType'); // e.g. program:changed
            $table->json('payload');
            // Null = broadcast to all connected users. Array = only these userIds.
            $table->json('userIds')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->index('createdAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_events');
    }
};
