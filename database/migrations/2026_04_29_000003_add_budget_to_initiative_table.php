<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Initiative', function (Blueprint $table) {
            $table->decimal('budgetIdr', 20, 4)->nullable()->after('description');
            $table->decimal('budgetSpent', 20, 4)->nullable()->default(0)->after('budgetIdr');
        });
    }

    public function down(): void
    {
        Schema::table('Initiative', function (Blueprint $table) {
            $table->dropColumn(['budgetIdr', 'budgetSpent']);
        });
    }
};
