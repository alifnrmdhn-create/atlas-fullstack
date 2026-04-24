<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// NEW TABLE — normalisasi dari picPersonIds (JSON) pada Program, Initiative, Phase, WorkItem
// Polymorphic: entity_type = 'Program' | 'Initiative' | 'Phase' | 'WorkItem'
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entity_pics', function (Blueprint $table) {
            $table->id();
            $table->string('entityType');   // Program | Initiative | Phase | WorkItem
            $table->integer('entityId');
            $table->integer('userId');
            $table->boolean('isPrimary')->default(false);
            $table->timestamp('createdAt')->useCurrent();

            $table->unique(['entityType', 'entityId', 'userId']);
            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();

            $table->index(['entityType', 'entityId']);
            $table->index('userId');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entity_pics');
    }
};
