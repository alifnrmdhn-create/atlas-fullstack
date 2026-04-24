<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// NEW TABLE — normalisasi dari Assignment.approvalChain (JSON)
// Menggantikan JSON [{userId, role, name, order, status, actedAt, note}]
// dengan proper relational rows.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assignment_approval_entries', function (Blueprint $table) {
            $table->id();
            $table->integer('assignmentId');
            $table->integer('userId');
            $table->string('role');
            $table->string('name');
            $table->string('positionTitle')->nullable();
            $table->integer('order');
            $table->string('status')->default('PENDING');   // PENDING | APPROVED | RETURNED | REJECTED
            $table->timestamp('actedAt')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('assignmentId')->references('id')->on('Assignment')->cascadeOnDelete();

            $table->index('assignmentId');
            $table->index(['assignmentId', 'order']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assignment_approval_entries');
    }
};
