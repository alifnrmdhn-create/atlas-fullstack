<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Assignment', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('priority')->default('MEDIUM');
            $table->string('status')->default('DITUGASKAN');
            $table->timestamp('dueDate')->nullable();
            $table->integer('assignerId');
            $table->integer('assigneeId');
            $table->json('watcherIds')->nullable();
            $table->integer('relatedProgramId')->nullable();
            $table->json('attachments')->nullable();
            $table->json('tags')->nullable();
            $table->boolean('needsClarification')->default(false);
            $table->text('clarificationNote')->nullable();
            $table->timestamp('acknowledgedAt')->nullable();
            $table->timestamp('startedAt')->nullable();
            $table->timestamp('completedAt')->nullable();
            $table->timestamp('cancelledAt')->nullable();
            $table->text('cancelReason')->nullable();
            $table->boolean('evidenceRequired')->default(true);
            $table->boolean('isPrivate')->default(false);
            $table->json('approvalChain')->nullable();   // akan dinormalisasi ke assignment_approval_entries
            $table->integer('currentReviewerIdx')->nullable();
            $table->integer('revisionCount')->default(0);
            $table->timestamp('rejectedAt')->nullable();
            $table->text('rejectionReason')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('assignerId')->references('id')->on('User');
            $table->foreign('assigneeId')->references('id')->on('User');
            $table->foreign('relatedProgramId')->references('id')->on('Program')->nullOnDelete();

            $table->index(['assigneeId', 'status']);
            $table->index('assignerId');
            $table->index('status');
            $table->index('dueDate');
            $table->index('relatedProgramId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Assignment');
    }
};
