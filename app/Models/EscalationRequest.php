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
}
