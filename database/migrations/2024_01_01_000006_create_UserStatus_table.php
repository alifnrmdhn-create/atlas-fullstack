<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('UserStatus', function (Blueprint $table) {
            $table->id();
            $table->integer('userId')->unique();
            $table->string('status');
            $table->string('statusEmoji')->nullable();
            $table->string('statusMessage')->nullable();
            $table->timestamp('lastActivityAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('UserStatus');
    }
};
