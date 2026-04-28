<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('program_health_snapshots', function (Blueprint $table) {
            $table->id();
            $table->date('snapshotDate')->unique();
            $table->integer('total')->default(0);
            $table->integer('onTrack')->default(0);
            $table->integer('atRisk')->default(0);
            $table->integer('terlambat')->default(0);
            $table->integer('overdue')->default(0);
            $table->integer('selesai')->default(0);
            $table->json('byDivisi')->nullable();
            $table->timestamp('createdAt')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('program_health_snapshots');
    }
};
