<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ProgramKpiLink', function (Blueprint $table) {
            $table->id();
            $table->integer('programId');
            $table->string('apmsKpiCode');
            $table->text('note')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->float('apmsKpiBobot')->nullable();
            $table->string('apmsKpiName')->nullable();

            $table->unique(['programId', 'apmsKpiCode']);
            $table->foreign('programId')->references('id')->on('Program')->cascadeOnDelete();

            $table->index('programId');
            $table->index('apmsKpiCode');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ProgramKpiLink');
    }
};
