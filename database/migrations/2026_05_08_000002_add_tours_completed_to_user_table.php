<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sprint 4 — Track which onboarding tours user sudah complete.
 * Format: { "escalation-inbox": "2026-05-10T...", "clear-path-create": "..." }
 * Frontend cek sebelum trigger Shepherd.js tour.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('User', function (Blueprint $table) {
            $table->json('toursCompleted')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('User', function (Blueprint $table) {
            $table->dropColumn('toursCompleted');
        });
    }
};
