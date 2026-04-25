<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('SavedMessage', function (Blueprint $table) {
            $table->id();
            $table->integer('userId');
            $table->integer('messageId');
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();
            $table->foreign('messageId')->references('id')->on('ChannelMessage')->cascadeOnDelete();

            $table->unique(['userId', 'messageId']);
            $table->index('userId');
            $table->index('messageId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('SavedMessage');
    }
};
