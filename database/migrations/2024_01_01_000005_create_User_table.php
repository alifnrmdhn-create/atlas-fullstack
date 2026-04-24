<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('User', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('roleType');
            $table->integer('unitId')->nullable();
            $table->string('avatarUrl')->nullable();
            $table->boolean('isActive')->default(true);
            $table->json('preferences')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();
            $table->string('userId')->nullable()->unique();
            $table->string('nik')->nullable()->unique();
            $table->integer('directorateId')->nullable();
            $table->integer('positionId')->nullable();
            $table->integer('managerUserId')->nullable();
            $table->string('positionTitle')->nullable();
            $table->string('availableRoles')->nullable();
            $table->string('passwordHash')->nullable();

            $table->foreign('unitId')->references('id')->on('OrganizationalUnit')->nullOnDelete();
            $table->foreign('directorateId')->references('id')->on('Directorate')->nullOnDelete();
            $table->foreign('positionId')->references('id')->on('Position')->nullOnDelete();
            $table->foreign('managerUserId')->references('id')->on('User')->nullOnDelete();

            $table->index('directorateId');
            $table->index('unitId');
            $table->index('positionId');
            $table->index('managerUserId');
            $table->index('userId');
            $table->index('nik');
            $table->index('roleType');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('User');
    }
};
