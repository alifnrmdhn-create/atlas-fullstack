<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ChannelMember', function (Blueprint $table) {
            $table->integer('channelId');
            $table->integer('userId');
            $table->timestamp('joinedAt')->useCurrent();
            $table->timestamp('lastViewedAt')->nullable();
            $table->boolean('isMuted')->default(false);
            $table->boolean('isStarred')->default(false);

            $table->primary(['channelId', 'userId']);
            $table->foreign('channelId')->references('id')->on('Channel')->cascadeOnDelete();
            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();

            $table->index('lastViewedAt');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ChannelMember');
    }
};
