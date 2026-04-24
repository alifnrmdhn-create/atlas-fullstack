<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ActivityLog', function (Blueprint $table) {
            $table->id();
            $table->string('entityType');
            $table->integer('entityId');
            $table->string('action');
            $table->integer('changedBy');
            $table->integer('changedByUnitId')->nullable();
            $table->timestamp('changeTimestamp')->useCurrent();
            $table->string('fieldChanged')->nullable();
            $table->json('oldValues')->nullable();
            $table->json('newValues')->nullable();
            $table->text('description')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->index(['entityType', 'entityId']);
            $table->index('changedBy');
            $table->index('changeTimestamp');
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ActivityLog');
    }
};
