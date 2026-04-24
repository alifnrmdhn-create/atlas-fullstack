<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ChannelMessageHidden', function (Blueprint $table) {
            $table->integer('messageId');
            $table->integer('userId');
            $table->timestamp('hiddenAt')->useCurrent();

            $table->primary(['messageId', 'userId']);
            $table->foreign('messageId')->references('id')->on('ChannelMessage')->cascadeOnDelete();
            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();

            $table->index(['userId', 'hiddenAt']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ChannelMessageHidden');
    }
};
