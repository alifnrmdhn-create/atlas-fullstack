<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('FocusBlock', function (Blueprint $table) {
            $table->id();
            $table->integer('userId');
            $table->string('title')->default('Focus Time');
            $table->timestamp('startAt');
            $table->timestamp('endAt');
            $table->text('note')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->index('userId');
            $table->index('startAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('FocusBlock');
    }
};
