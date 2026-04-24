<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Position', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('levelCode');
            $table->string('roleType');
            $table->integer('directorateId')->nullable();
            $table->integer('divisionId')->nullable();
            $table->integer('reportsToPositionId')->nullable();
            $table->integer('sourceUnitId')->nullable()->unique();
            $table->integer('seatOrder')->nullable();
            $table->boolean('isActive')->default(true);
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('directorateId')->references('id')->on('Directorate')->nullOnDelete();
            $table->foreign('divisionId')->references('id')->on('OrganizationalUnit')->nullOnDelete();
            $table->foreign('reportsToPositionId')->references('id')->on('Position')->nullOnDelete();

            $table->index('directorateId');
            $table->index('divisionId');
            $table->index('reportsToPositionId');
            $table->index('levelCode');
            $table->index('roleType');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Position');
    }
};
