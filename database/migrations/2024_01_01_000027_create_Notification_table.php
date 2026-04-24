<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Notification', function (Blueprint $table) {
            $table->id();
            $table->integer('userId');
            $table->string('type');
            $table->text('message');
            $table->string('source');
            $table->timestamp('createdAt');
            $table->timestamp('readAt')->nullable();
            $table->timestamp('dismissedAt')->nullable();
            $table->timestamp('resolvedAt')->nullable();
            $table->timestamp('expiresAt')->nullable();
            $table->string('state')->default('UNREAD');

            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();

            $table->index(['userId', 'state']);
            $table->index(['userId', 'dismissedAt']);
            $table->index(['userId', 'resolvedAt']);
            $table->index('expiresAt');
            $table->index('createdAt');
            $table->index(['userId', 'createdAt']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Notification');
    }
};
