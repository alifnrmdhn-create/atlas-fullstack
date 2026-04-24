<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('AssignmentAttachment', function (Blueprint $table) {
            $table->id();
            $table->integer('assignmentId');
            $table->integer('uploadedBy');
            $table->string('type');   // FILE | LINK | NOTE
            $table->string('filename')->nullable();
            $table->string('originalName')->nullable();
            $table->string('filepath')->nullable();
            $table->integer('filesize')->nullable();
            $table->string('url')->nullable();
            $table->text('description')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('assignmentId')->references('id')->on('Assignment')->cascadeOnDelete();
            $table->foreign('uploadedBy')->references('id')->on('User');

            $table->index('assignmentId');
            $table->index('uploadedBy');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('AssignmentAttachment');
    }
};
