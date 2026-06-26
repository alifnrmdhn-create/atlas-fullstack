<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drop budget di level Workstream (Initiative).
 *
 * Keputusan 2026-06-26: kolom budgetIdr/budgetSpent di workstream 0/97 terisi,
 * tak pernah diagregasi/dilaporkan — cuma input modal + chip yang tak pernah
 * tampil. Tak relevan untuk perencanaan program kerja. Dibuang.
 *
 * Yang DIPERTAHANKAN: Program.budgetIdr/budgetSpent (kolom terpisah, di luar
 * scope perubahan ini).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Initiative', function (Blueprint $table) {
            $drop = array_values(array_filter(
                ['budgetIdr', 'budgetSpent'],
                fn ($c) => Schema::hasColumn('Initiative', $c),
            ));
            if ($drop) {
                $table->dropColumn($drop);
            }
        });
    }

    public function down(): void
    {
        Schema::table('Initiative', function (Blueprint $table) {
            if (!Schema::hasColumn('Initiative', 'budgetIdr')) {
                $table->decimal('budgetIdr', 20, 4)->nullable()->after('description');
            }
            if (!Schema::hasColumn('Initiative', 'budgetSpent')) {
                $table->decimal('budgetSpent', 20, 4)->nullable()->default(0)->after('budgetIdr');
            }
        });
    }
};
