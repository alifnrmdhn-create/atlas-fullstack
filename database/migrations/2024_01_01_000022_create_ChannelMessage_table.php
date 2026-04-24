<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ChannelMessage', function (Blueprint $table) {
            $table->id();
            $table->integer('channelId');
            $table->integer('userId');
            $table->text('content');
            $table->json('richContent')->nullable();
            $table->json('attachments')->nullable();
            $table->integer('parentMessageId')->nullable();
            $table->integer('replyCount')->default(0);
            $table->json('reactions')->nullable();
            $table->boolean('isPinned')->default(false);
            $table->boolean('isEdited')->default(false);
            $table->timestamp('editedAt')->nullable();
            $table->integer('editedBy')->nullable();
            $table->text('searchableText')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();
            $table->json('mentionedUserIds')->nullable();
            $table->timestamp('deletedForEveryoneAt')->nullable();
            $table->integer('deletedForEveryoneBy')->nullable();

            $table->foreign('channelId')->references('id')->on('Channel')->cascadeOnDelete();
            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();
            $table->foreign('parentMessageId')->references('id')->on('ChannelMessage')->cascadeOnDelete();

            $table->index('channelId');
            $table->index('userId');
            $table->index('parentMessageId');
            $table->index('isPinned');
            $table->index('createdAt');
            $table->index(['channelId', 'createdAt']);
            $table->index('deletedForEveryoneAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ChannelMessage');
    }
};
