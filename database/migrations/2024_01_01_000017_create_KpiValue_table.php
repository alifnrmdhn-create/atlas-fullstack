<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('KpiValue', function (Blueprint $table) {
            $table->id();
            $table->integer('kpiDefinitionId');
            $table->timestamp('measurementDate');
            $table->decimal('targetValue', 20, 6)->nullable();
            $table->decimal('actualValue', 20, 6);
            $table->string('status')->nullable();
            $table->decimal('variance', 20, 6)->nullable();
            $table->float('variancePercent')->nullable();
            $table->text('statusNotes')->nullable();
            $table->integer('measuredBy')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['kpiDefinitionId', 'measurementDate']);
            $table->foreign('kpiDefinitionId')->references('id')->on('KpiDefinition')->cascadeOnDelete();

            $table->index('kpiDefinitionId');
            $table->index('measurementDate');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('KpiValue');
    }
};
