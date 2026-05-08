<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sprint 4 — Clear the Path mechanism.
 *
 * EscalationRequest = polymorphic entity untuk tracking permintaan dukungan
 * atasan. Sourcable dari Blocker, ProgramProgressLog, MeetingActionItem,
 * atau ad-hoc (sourceType=AD_HOC, sourceId=null).
 *
 * Status flow:
 *   REQUESTED → COMMITTED → IN_PROGRESS → CLEARED
 *   ↳ DECLINED (terminal, dengan alasan)
 *   ↳ REROUTED (terminal, escalation re-created ke user lain)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('EscalationRequest', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();                     // E-2026-0001
            $table->string('sourceType');                          // BLOCKER|PROGRESS_LOG|ACTION_ITEM|AD_HOC
            $table->unsignedBigInteger('sourceId')->nullable();    // null untuk AD_HOC

            // Requester
            $table->unsignedBigInteger('requestedById');
            $table->timestamp('requestedAt')->useCurrent();

            // Content
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('linkedProgramId')->nullable();

            // Routing
            $table->unsignedBigInteger('escalatedToId');           // atasan target
            $table->string('status')->default('REQUESTED');        // REQUESTED|COMMITTED|IN_PROGRESS|CLEARED|DECLINED|REROUTED

            // Disposition fields
            $table->timestamp('committedAt')->nullable();
            $table->timestamp('commitmentDueDate')->nullable();
            $table->text('commitmentNote')->nullable();
            $table->timestamp('resolvedAt')->nullable();
            $table->text('resolutionNote')->nullable();
            $table->unsignedBigInteger('reroutedToId')->nullable();
            $table->text('declinedReason')->nullable();

            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            // FK constraints
            $table->foreign('requestedById')->references('id')->on('User')->cascadeOnDelete();
            $table->foreign('escalatedToId')->references('id')->on('User')->cascadeOnDelete();
            $table->foreign('reroutedToId')->references('id')->on('User')->nullOnDelete();
            $table->foreign('linkedProgramId')->references('id')->on('Program')->nullOnDelete();

            // Indexes for common queries
            $table->index(['escalatedToId', 'status']);
            $table->index(['requestedById', 'status']);
            $table->index(['sourceType', 'sourceId']);
            $table->index('linkedProgramId');
            $table->index('createdAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('EscalationRequest');
    }
};
