<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_configs', function (Blueprint $table) {
            $table->string('role')->primary();
            $table->string('label');
            $table->string('description')->default('');
            $table->string('line')->nullable();
            $table->string('bodLevel')->nullable();
            $table->string('badgeColor')->default('bg-gray-100 text-gray-600');
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_configs');
    }
};
