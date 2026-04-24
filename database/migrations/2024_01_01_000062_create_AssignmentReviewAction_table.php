<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('AssignmentReviewAction', function (Blueprint $table) {
            $table->id();
            $table->integer('assignmentId');
            $table->integer('reviewerId');
            $table->string('action');   // APPROVED | RETURNED | REJECTED
            $table->text('note')->nullable();
            $table->integer('revisionAt')->default(0);
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('assignmentId')->references('id')->on('Assignment')->cascadeOnDelete();
            $table->foreign('reviewerId')->references('id')->on('User');

            $table->index('assignmentId');
            $table->index('reviewerId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('AssignmentReviewAction');
    }
};
