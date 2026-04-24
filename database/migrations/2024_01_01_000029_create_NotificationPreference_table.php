<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('NotificationPreference', function (Blueprint $table) {
            $table->id();
            $table->integer('userId');
            $table->string('notificationType');
            $table->string('channel');
            $table->boolean('enabled')->default(true);
            $table->string('frequency');
            $table->timestamp('createdAt')->useCurrent();

            $table->unique(['userId', 'notificationType', 'channel']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('NotificationPreference');
    }
};
