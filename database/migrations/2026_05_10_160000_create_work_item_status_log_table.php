<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit log untuk transisi status WorkItem (Task) — mirror ProgramApprovalLog.
 *
 * Tujuan: setiap drag-drop card di Execution Board (atau status update via
 * API langsung) tercatat — siapa, kapan, dari status apa, ke status apa.
 * Ini menutup plothole "tidak ada jejak" yang sebelumnya membuat sistem
 * trust-only & tidak defensible untuk audit.
 *
 * Append-only: tidak ada updatedAt. Cascade saat WorkItem / User dihapus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('WorkItemStatusLog', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('workItemId');
            $table->string('fromStatus', 40)->nullable();
            $table->string('toStatus', 40);
            $table->unsignedBigInteger('byUserId');
            $table->string('byUserName', 120)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('workItemId')->references('id')->on('WorkItem')->onDelete('cascade');
            $table->foreign('byUserId')->references('id')->on('User')->onDelete('cascade');
            $table->index('workItemId');
            $table->index('createdAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('WorkItemStatusLog');
    }
};
