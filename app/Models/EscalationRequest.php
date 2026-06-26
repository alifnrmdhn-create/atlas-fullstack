<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Sprint 4 — Clear the Path entity.
 *
 * Polymorphic source via (sourceType, sourceId). Tidak pakai Eloquent
 * morphTo karena sourceType jadi enum literal (BLOCKER|PROGRESS_LOG|...)
 * bukan class name — lebih simple, lebih portable, dan source data optional
 * (AD_HOC tidak punya source).
 */
class EscalationRequest extends Model
{
    protected $table = 'EscalationRequest';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];

    protected $casts = [
        'requestedAt'        => 'datetime',
        'committedAt'        => 'datetime',
        'commitmentDueDate'  => 'datetime',
        'resolvedAt'         => 'datetime',
        'createdAt'          => 'datetime',
        'updatedAt'          => 'datetime',
    ];

    protected $appends = ['agingDays'];

    public function requester()
    {
        return $this->belongsTo(User::class, 'requestedById');
    }

    public function escalatedTo()
    {
        return $this->belongsTo(User::class, 'escalatedToId');
    }

    public function reroutedTo()
    {
        return $this->belongsTo(User::class, 'reroutedToId');
    }

    public function linkedProgram()
    {
        return $this->belongsTo(Program::class, 'linkedProgramId');
    }

    /**
     * Hari sejak request — drives aging color indicator.
     * Stop counting once resolved/declined/rerouted (terminal states).
     */
    public function getAgingDaysAttribute(): int
    {
        $end = $this->resolvedAt ?? now();
        return (int) floor($this->requestedAt->diffInDays($end));
    }

    /** Generate code unik. Format: E-YYYY-NNNN. */
    public static function generateCode(): string
    {
        $year = now()->year;
        $count = static::query()->where('createdAt', '>=', now()->startOfYear())->count() + 1;
        return sprintf('E-%d-%04d', $year, $count);
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, ['CLEARED', 'DECLINED', 'REROUTED'], true);
    }

    /**
     * Blocker-id & program-id yang sedang DALAM pipeline Clear the Path — punya
     * escalation aktif (status belum CLEARED/DECLINED). Dipakai Focus untuk
     * MENEKAN nag "critical blockers need escalation" (di needsAction maupun feed
     * NOW): begitu seseorang sudah angkat eskalasi, sinyalnya pindah ke tracker
     * "Escalations I Raised" — bukan di-nag terus untuk meng-eskalasi yang sudah
     * dieskalasi (loop melingkar). DECLINED tidak menekan: eskalasi yang ditolak
     * berarti masalahnya kembali butuh jalur lain → nag boleh muncul lagi.
     *
     * Match: source BLOCKER presisi (sourceId = blocker) ATAU linkedProgram untuk
     * eskalasi BLOCKER/AD_HOC (kompat jalur AD_HOC lama yang tak menyimpan sourceId
     * blocker). PROGRESS_LOG/ACTION_ITEM TIDAK menekan blocker — beda concern.
     *
     * @param  array<int>  $blockerIds
     * @param  array<int>  $programIds
     * @return array{blockerIds: \Illuminate\Support\Collection, programIds: \Illuminate\Support\Collection}
     */
    public static function activeCoverage(array $blockerIds, array $programIds): array
    {
        if (empty($blockerIds) && empty($programIds)) {
            return ['blockerIds' => collect(), 'programIds' => collect()];
        }

        $rows = static::query()
            ->whereNotIn('status', ['CLEARED', 'DECLINED'])
            ->where(function ($q) use ($blockerIds, $programIds) {
                $q->where(fn ($qq) => $qq->where('sourceType', 'BLOCKER')->whereIn('sourceId', $blockerIds ?: [0]))
                  ->orWhere(fn ($qq) => $qq->whereIn('sourceType', ['BLOCKER', 'AD_HOC'])->whereIn('linkedProgramId', $programIds ?: [0]));
            })
            ->get(['sourceType', 'sourceId', 'linkedProgramId']);

        return [
            // `flip()` → value jadi key supaya `->has($id)` = test keanggotaan O(1).
            'blockerIds' => $rows->where('sourceType', 'BLOCKER')->pluck('sourceId')->filter()->unique()->flip(),
            'programIds' => $rows->pluck('linkedProgramId')->filter()->unique()->flip(),
        ];
    }
}
