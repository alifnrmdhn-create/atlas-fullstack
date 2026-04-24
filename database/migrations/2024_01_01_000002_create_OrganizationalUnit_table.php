<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('OrganizationalUnit', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('unitType');
            $table->integer('parentId')->nullable();
            $table->integer('headId')->nullable();
            $table->decimal('budget', 20, 4)->nullable();
            $table->boolean('isActive')->default(true);
            $table->timestamp('createdAt')->useCurrent();
            $table->integer('directorateId')->nullable();

            $table->foreign('directorateId')->references('id')->on('Directorate')->nullOnDelete();
            $table->foreign('parentId')->references('id')->on('OrganizationalUnit')->nullOnDelete();

            $table->index('directorateId');
            $table->index('parentId');
            $table->index('unitType');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('OrganizationalUnit');
    }
};
