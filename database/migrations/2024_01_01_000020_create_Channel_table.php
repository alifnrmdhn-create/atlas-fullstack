<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Channel', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('type');
            $table->integer('createdBy');
            $table->integer('ownerUnitId')->nullable();
            $table->string('topicType')->nullable();
            $table->integer('linkedProgramId')->nullable();
            $table->integer('linkedInitiativeId')->nullable();   // @map("linkedInitiativeId")
            $table->boolean('isArchived')->default(false);
            $table->string('allowedPostTypes')->nullable();
            $table->boolean('allowThreads')->default(true);
            $table->boolean('allowReactions')->default(true);
            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->index('topicType');
            $table->index('type');
            $table->index('isArchived');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Channel');
    }
};
