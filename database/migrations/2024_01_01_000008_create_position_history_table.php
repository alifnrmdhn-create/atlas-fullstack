<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('position_history', function (Blueprint $table) {
            $table->id();
            $table->integer('userId');
            $table->integer('positionId');
            $table->timestamp('startDate');
            $table->timestamp('endDate')->nullable();
            $table->string('mutationType')->default('initial_assignment');
            $table->string('mutationReason')->nullable();
            $table->string('skNumber')->nullable();
            $table->integer('createdBy')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('userId')->references('id')->on('User');
            $table->foreign('positionId')->references('id')->on('Position');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('position_history');
    }
};
