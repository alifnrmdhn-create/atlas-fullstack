<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('UserSession', function (Blueprint $table) {
            $table->id();
            $table->integer('userId');
            $table->timestamp('startedAt')->useCurrent();
            $table->timestamp('endedAt')->nullable();
            $table->bigInteger('durationMs')->default(0);
            $table->timestamp('lastPingAt')->useCurrent();
            $table->string('endReason')->nullable();

            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();

            $table->index('userId');
            $table->index('startedAt');
            $table->index('endedAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('UserSession');
    }
};
