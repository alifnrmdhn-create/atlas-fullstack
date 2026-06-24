<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Focus disposition — menutup loop tindak lanjut item "Needs Action" di Focus.
 *
 * Item Needs Action (approval/blocker/support) di Focus adalah SINYAL turunan
 * (di-derive tiap load dari Program/Blocker), bukan record. Sebelumnya klik item
 * cuma melempar user ke workspace program tanpa cara menutup item — sehingga
 * atasan bingung "follow-up-nya masuk kemana" dan item tak pernah hilang.
 *
 * Tabel ini merekam keputusan atasan atas sebuah item (per user+program+tag):
 *   - SUPPORTED : memberi dukungan/arahan ke PIC (mengirim notifikasi ke owner)
 *   - REROUTED  : meneruskan ke atas via Clear the Path (escalation dibuat terpisah)
 *   - HANDLED   : ditandai sudah ditangani / di-dismiss
 *
 * Efeknya: OrgSummaryService menyembunyikan item ini dari needsAction milik user
 * selama mute window (config focus.disposition_mute_days). Lewat window, item
 * muncul lagi bila sinyal masih ada — re-nudge yang disengaja.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('FocusDisposition', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('userId');       // atasan yang men-disposition
            $table->unsignedBigInteger('programId');
            $table->string('tag');                       // approval|blocker|support
            $table->string('action');                    // SUPPORTED|REROUTED|HANDLED
            $table->text('note')->nullable();
            $table->unsignedBigInteger('escalationId')->nullable(); // jika REROUTED

            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();
            $table->foreign('programId')->references('id')->on('Program')->cascadeOnDelete();
            $table->foreign('escalationId')->references('id')->on('EscalationRequest')->nullOnDelete();

            // Satu disposition aktif per (user, program, tag) — upsert.
            $table->unique(['userId', 'programId', 'tag']);
            $table->index(['userId', 'createdAt']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('FocusDisposition');
    }
};
