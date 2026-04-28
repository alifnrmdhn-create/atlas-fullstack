<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->string('kelompok')->nullable()->after('healthStatus');
            $table->string('pilarStrategis')->nullable()->after('kelompok');
            $table->text('progresTerkini')->nullable()->after('pilarStrategis');
            $table->text('dukunganDibutuhkan')->nullable()->after('progresTerkini');

            $table->index('kelompok');
            $table->index('pilarStrategis');
        });
    }

    public function down(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $table->dropIndex(['kelompok']);
            $table->dropIndex(['pilarStrategis']);
            $table->dropColumn(['kelompok', 'pilarStrategis', 'progresTerkini', 'dukunganDibutuhkan']);
        });
    }
};
