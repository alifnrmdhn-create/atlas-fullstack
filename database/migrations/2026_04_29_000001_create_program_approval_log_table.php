<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ProgramApprovalLog', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('programId');
            $table->string('action', 30); // SUBMITTED | APPROVED | REJECTED | ACTIVATED | COMPLETED
            $table->string('fromStatus', 40)->nullable();
            $table->string('toStatus', 40);
            $table->unsignedBigInteger('byUserId');
            $table->string('byUserName', 120)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('programId')->references('id')->on('Program')->onDelete('cascade');
            $table->foreign('byUserId')->references('id')->on('User')->onDelete('cascade');
            $table->index('programId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ProgramApprovalLog');
    }
};
