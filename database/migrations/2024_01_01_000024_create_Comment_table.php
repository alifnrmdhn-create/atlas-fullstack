<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Comment', function (Blueprint $table) {
            $table->id();
            $table->string('entityType');
            $table->integer('entityId');
            $table->text('commentText');
            $table->integer('createdBy');
            $table->integer('parentCommentId')->nullable();
            $table->integer('replyCount')->default(0);
            $table->json('richContent')->nullable();
            $table->json('attachments')->nullable();
            $table->json('reactions')->nullable();
            $table->json('mentionedUserIds')->nullable();
            $table->json('mentionChannels')->nullable();
            $table->boolean('isPinned')->default(false);
            $table->boolean('isEdited')->default(false);
            $table->timestamp('editedAt')->nullable();
            $table->text('searchableText')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('createdBy')->references('id')->on('User')->cascadeOnDelete();
            $table->foreign('parentCommentId')->references('id')->on('Comment')->cascadeOnDelete();

            $table->index(['entityType', 'entityId']);
            $table->index('createdBy');
            $table->index('isPinned');
            $table->index('parentCommentId');
            $table->index('createdAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Comment');
    }
};
