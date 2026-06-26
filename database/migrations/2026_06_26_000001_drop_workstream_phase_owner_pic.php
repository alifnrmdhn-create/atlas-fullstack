<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Drop owner/PIC di level Workstream (Initiative) & Phase.
 *
 * Keputusan 2026-06-26: akuntabilitas program ada di PIC program (Kadiv/Kasub);
 * penunjukan orang di level eksekusi ada di Task.assignedTo (dipantau mingguan
 * di Workboard). Workstream owner dulu 96/97 cuma cermin Program.ownerId & tak
 * pernah dipakai untuk scope/notif; PIC workstream 8/97 & PIC phase 0/223 cuma
 * dekorasi grid. Semua dibuang supaya tak ada lagi field kepemilikan ganda.
 *
 * Yang DIPERTAHANKAN: Program (owner + coPics), Task (assignedTo + entity_pics
 * 'WorkItem'), Task.picUnitIds. Migration hanya menyentuh Initiative/Phase.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1) Bersihkan baris entity_pics milik Workstream (Initiative) & Phase.
        DB::table('entity_pics')->whereIn('entityType', ['Initiative', 'Phase'])->delete();

        // 2) Drop kolom owner/PIC di Initiative. Index `ownerId` ikut terbuang
        //    otomatis oleh Postgres saat kolomnya di-DROP (tak perlu dropIndex
        //    eksplisit — nama index bisa beda & statement-nya dieksekusi di luar
        //    try/catch sehingga malah menggagalkan migrasi).
        Schema::table('Initiative', function (Blueprint $table) {
            $drop = array_values(array_filter(
                ['ownerId', 'primaryPicPersonId'],
                fn ($c) => Schema::hasColumn('Initiative', $c),
            ));
            if ($drop) {
                $table->dropColumn($drop);
            }
        });

        // 3) Drop picUnitIds di Phase (PIC unit phase — tak terpakai, 0 terisi).
        Schema::table('Phase', function (Blueprint $table) {
            if (Schema::hasColumn('Phase', 'picUnitIds')) {
                $table->dropColumn('picUnitIds');
            }
        });
    }

    public function down(): void
    {
        // Best-effort reversibility: kolom dikembalikan nullable (data owner/PIC
        // lama tak bisa direstore; entity_pics yang terhapus tak dipulihkan).
        Schema::table('Initiative', function (Blueprint $table) {
            if (!Schema::hasColumn('Initiative', 'ownerId')) {
                $table->integer('ownerId')->nullable();
                $table->index('ownerId');
            }
            if (!Schema::hasColumn('Initiative', 'primaryPicPersonId')) {
                $table->integer('primaryPicPersonId')->nullable();
            }
        });

        Schema::table('Phase', function (Blueprint $table) {
            if (!Schema::hasColumn('Phase', 'picUnitIds')) {
                $table->json('picUnitIds')->nullable();
            }
        });
    }
};
