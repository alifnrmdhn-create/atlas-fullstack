<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drop budget di level Program.
 *
 * Keputusan 2026-06-26: Program.budgetIdr/budgetSpent 0/97 terisi, tak pernah
 * tampil/diedit di UI (cuma validasi BE + 1 entri COMMITMENT_FIELDS). Tak
 * relevan untuk perencanaan program kerja PDCA. Dibuang — sejalan dengan drop
 * budget workstream (2026_06_26_000002).
 *
 * Catatan: budget realisasi mitigasi di MonthlyReport (budgetAllocated/Realized
 * /Absorption) BERBEDA & TAK disentuh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            $drop = array_values(array_filter(
                ['budgetIdr', 'budgetSpent'],
                fn ($c) => Schema::hasColumn('Program', $c),
            ));
            if ($drop) {
                $table->dropColumn($drop);
            }
        });
    }

    public function down(): void
    {
        Schema::table('Program', function (Blueprint $table) {
            if (!Schema::hasColumn('Program', 'budgetIdr')) {
                $table->decimal('budgetIdr', 20, 4)->nullable();
            }
            if (!Schema::hasColumn('Program', 'budgetSpent')) {
                $table->decimal('budgetSpent', 20, 4)->default(0)->nullable();
            }
        });
    }
};
