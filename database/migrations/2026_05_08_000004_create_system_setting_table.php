<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Post-MVP — Dynamic settings table (replace static config/atlas-thresholds.php).
 *
 * Key format: dot-separated, mirror config path.
 *   contoh: 'escalation_aging.yellow_after_days', 'pilot_dkm_success_criteria.min_hit_rate_aggregate_pct'
 *
 * Value disimpan sebagai JSON supaya bisa store int/float/string/object/array.
 *
 * Category dipakai UI untuk grouping (sectioned form).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('SystemSetting', function (Blueprint $table) {
            $table->id();
            $table->string('key', 150)->unique();
            $table->json('value');
            $table->string('category', 60);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('updatedById')->nullable();
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('updatedById')->references('id')->on('User')->nullOnDelete();
            $table->index('category');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('SystemSetting');
    }
};
