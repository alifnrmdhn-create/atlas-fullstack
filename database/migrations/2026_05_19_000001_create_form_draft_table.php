<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sprint 6 (Mei 2026) — Form Autosave / Draft Persistence.
 *
 * FormDraft = polymorphic snapshot form yang sedang diedit user. Mencegah
 * kehilangan data ketika halaman ke-refresh (mis. SSE realtime event memicu
 * reload detail) atau koneksi drop di tengah pengisian.
 *
 * Lookup pattern: (userId, formKey) — satu draft aktif per (user, form).
 * formKey format konvensi: "{entityType}:{entityId}:{formName}",
 *   contoh "program:123:progressLog", "task:456:detail".
 *
 * TTL: 7 hari sejak last edit (configurable lewat atlas-thresholds.autosave.ttl_days).
 * Cleanup harian via `atlas:cleanup-form-drafts`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('FormDraft', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('userId');
            $table->string('formKey', 160);

            // Optional polymorphic reference — untuk cleanup ketika entity parent dihapus.
            // Nullable karena draft bisa dibuat sebelum entity ada (mis. form "Create Program").
            $table->string('entityType', 40)->nullable();
            $table->unsignedBigInteger('entityId')->nullable();

            // Form state snapshot. jsonb supaya bisa di-query kalau perlu di masa depan
            // (mis. analytics: berapa draft narrative > 1000 karakter).
            $table->jsonb('payload')->default('{}');

            // Optimistic concurrency. Bump tiap PUT — kalau ada client kirim version
            // lebih rendah dengan clientId berbeda, BE respon 409 (conflict).
            $table->unsignedInteger('version')->default(0);

            // Tab/session GUID dari FE. Disambiguate multi-tab race tanpa harus
            // bedakan user (user A bisa buka 2 tab → clientId beda, userId sama).
            $table->string('clientId', 40)->nullable();

            $table->timestamp('lastEditedAt')->useCurrent();
            $table->timestamp('expiresAt');

            $table->timestamp('createdAt')->useCurrent();
            $table->timestamp('updatedAt')->useCurrent()->useCurrentOnUpdate();

            // FK — kalau user dihapus, draft mereka ikut hilang (no orphans).
            $table->foreign('userId')->references('id')->on('User')->cascadeOnDelete();

            // Primary lookup path: WHERE userId=? AND formKey=?
            $table->unique(['userId', 'formKey']);

            // Cleanup scheduler: WHERE expiresAt < now()
            $table->index('expiresAt');

            // Cascade cleanup per-entity (mis. saat Program di-soft-delete, hapus drafts terkait).
            $table->index(['entityType', 'entityId']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('FormDraft');
    }
};
