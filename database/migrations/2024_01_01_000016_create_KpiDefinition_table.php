<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('KpiDefinition', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->integer('programId')->nullable();
            $table->integer('initiativeId')->nullable();   // @map("initiativeId") → workstreamId
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('metricType');
            $table->string('dataType');
            $table->decimal('targetValue', 20, 6);
            $table->decimal('actualValue', 20, 6)->nullable();
            $table->decimal('warningThreshold', 20, 6)->nullable();
            $table->decimal('criticalThreshold', 20, 6)->nullable();
            $table->string('unitOfMeasure')->nullable();
            $table->string('reviewFrequency')->default('MONTHLY');
            $table->timestamp('lastMeasuredDate')->nullable();
            $table->integer('ownerId')->nullable();
            $table->integer('ownerUnitId')->nullable();
            $table->boolean('isLeadingIndicator')->default(false);
            $table->string('leadingIndicatorFor')->nullable();
            $table->boolean('isActive')->default(true);
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('programId')->references('id')->on('Program')->cascadeOnDelete();

            $table->index('programId');
            $table->index('metricType');
            $table->index('isLeadingIndicator');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('KpiDefinition');
    }
};
