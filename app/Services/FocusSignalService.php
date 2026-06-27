<?php

namespace App\Services;

use App\Models\Blocker;
use App\Models\EscalationRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * SATU pemilik aturan lintas-feed "sinyal Focus dari blocker".
 *
 * Latar: blocker yang sama di-derive di banyak feed Focus secara independen —
 * needsAction (OrgSummaryService) dan feed NOW (WorkspaceController::myWork) —
 * masing-masing query Blocker sendiri lalu memutuskan tampil/tidak. Aturan yang
 * SEHARUSNYA seragam (jangan tampilkan blocker resolved / program ter-arsip /
 * yang sudah masuk pipeline escalation) dulu tersebar → drift. Contoh nyata:
 * needsAction lupa filter program ter-arsip sementara NOW menerapkannya, jadi
 * satu masalah bisa muncul di satu feed tapi tidak di feed lain.
 *
 * Konsolidasi ini sengaja TIPIS (bukan rewrite feed Focus yang rapuh): hanya
 * meng-hoist dua aturan lintas-potong ke satu tempat supaya feed baru tinggal
 * memanggilnya dan tak bisa lupa. Scope spesifik (unit / assignee / severity)
 * tetap milik tiap caller.
 */
class FocusSignalService
{
    /**
     * Base query blocker yang layak jadi sinyal Focus "live":
     *   - belum resolved (`resolvedAt` null), DAN
     *   - program-nya ada & TIDAK diarsipkan.
     *
     * Caller menambah scope sendiri (severity, unit, assignee/creator) lalu
     * meng-eager-load `task.workstream.program` sesuai kebutuhannya.
     */
    public static function liveBlockerQuery(): Builder
    {
        return Blocker::query()
            ->whereNull('resolvedAt')
            ->whereHas('task.workstream.program', fn ($q) => $q->whereNull('archivedAt'));
    }

    /**
     * Buang blocker yang sudah DALAM pipeline Clear the Path (punya escalation
     * aktif). Dipakai SEMUA feed Focus supaya satu masalah tak berteriak ganda
     * (di needsAction + NOW sekaligus) setelah dieskalasi. Begitu escalation
     * resolved/declined, blocker kembali muncul (lihat EscalationRequest::activeCoverage).
     *
     * Butuh relasi `task.workstream.program` sudah ter-load (untuk resolve
     * program-id). Mengembalikan koleksi ter-reindex.
     *
     * @param  Collection<int,Blocker>  $blockers
     * @return Collection<int,Blocker>
     */
    public static function rejectEscalated(Collection $blockers): Collection
    {
        if ($blockers->isEmpty()) {
            return $blockers->values();
        }

        $coverage = EscalationRequest::activeCoverage(
            $blockers->pluck('id')->all(),
            $blockers->map(fn ($b) => $b->task?->workstream?->program?->id)->filter()->unique()->values()->all(),
        );

        return $blockers
            ->reject(fn ($b) => $coverage['blockerIds']->has($b->id)
                || ($b->task?->workstream?->program && $coverage['programIds']->has($b->task->workstream->program->id)))
            ->values();
    }
}
