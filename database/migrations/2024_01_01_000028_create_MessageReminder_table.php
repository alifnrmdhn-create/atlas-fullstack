<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('MessageReminder', function (Blueprint $table) {
            $table->id();
            $table->integer('userId');
            $table->integer('channelId');
            $table->integer('messageId');
            $table->timestamp('remindAt');
            $table->text('note')->nullable();
            $table->boolean('notified')->default(false);
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();

            $table->index('userId');
            $table->index(['remindAt', 'notified']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('MessageReminder');
    }
};
