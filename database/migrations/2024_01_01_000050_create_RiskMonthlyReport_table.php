<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('RiskMonthlyReport', function (Blueprint $table) {
            $table->id();
            $table->integer('month');
            $table->integer('year');
            $table->integer('unitId');
            $table->string('status')->default('DRAFT');
            $table->string('compositeRating')->nullable();
            $table->decimal('rmiScore', 10, 4)->nullable();
            $table->integer('createdById');
            $table->integer('submittedById')->nullable();
            $table->timestamp('submittedAt')->nullable();
            $table->timestamp('approvedAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['unitId', 'month', 'year']);
            $table->foreign('createdById')->references('id')->on('User');
            $table->foreign('submittedById')->references('id')->on('User')->nullOnDelete();
            $table->foreign('unitId')->references('id')->on('OrganizationalUnit')->cascadeOnDelete();

            $table->index('unitId');
            $table->index('status');
            $table->index(['year', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('RiskMonthlyReport');
    }
};
