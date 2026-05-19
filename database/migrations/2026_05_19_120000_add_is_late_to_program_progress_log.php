<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ProgramProgressLog', function (Blueprint $table) {
            $table->boolean('isLate')->default(false)->after('dukunganDibutuhkan');
            $table->index('isLate');
        });
    }

    public function down(): void
    {
        Schema::table('ProgramProgressLog', function (Blueprint $table) {
            $table->dropIndex(['isLate']);
            $table->dropColumn('isLate');
        });
    }
};
