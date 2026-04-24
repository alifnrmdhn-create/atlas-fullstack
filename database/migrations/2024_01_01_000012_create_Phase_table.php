<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Phase', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->integer('initiativeId');   // @map("initiativeId") → workstreamId in model
            $table->integer('order')->default(0);
            $table->string('name');
            $table->text('description')->nullable();
            $table->json('picUnitIds')->nullable();
            $table->json('picPersonIds')->nullable();
            $table->string('status')->default('PLANNING');
            $table->string('color')->nullable();
            $table->string('startWeek')->nullable();
            $table->string('endWeek')->nullable();
            $table->string('healthStatus')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('initiativeId')->references('id')->on('Initiative')->cascadeOnDelete();

            $table->index('initiativeId');
            $table->index('order');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Phase');
    }
};
