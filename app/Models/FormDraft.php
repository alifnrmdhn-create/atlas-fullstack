<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Sprint 6 — Form autosave / draft persistence.
 *
 * Satu baris = satu draft aktif per (user, formKey). Diupsert tiap kali user
 * mengetik (debounced 1.5s di FE). Dihapus saat submit success atau saat
 * scheduler cleanup setelah TTL lewat (default 7 hari).
 */
class FormDraft extends Model
{
    protected $table = 'FormDraft';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];

    protected $casts = [
        'payload'      => 'array',
        'version'      => 'integer',
        'lastEditedAt' => 'datetime',
        'expiresAt'    => 'datetime',
        'createdAt'    => 'datetime',
        'updatedAt'    => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function scopeForUser(Builder $q, int $userId): Builder
    {
        return $q->where('userId', $userId);
    }

    public function scopeForKey(Builder $q, string $formKey): Builder
    {
        return $q->where('formKey', $formKey);
    }

    public function scopeNotExpired(Builder $q): Builder
    {
        return $q->where('expiresAt', '>', now());
    }

    public static function ttlDays(): int
    {
        return (int) config('atlas-thresholds.autosave.ttl_days', 7);
    }

    public static function expirationFromNow(): Carbon
    {
        return now()->addDays(static::ttlDays());
    }

    public static function maxPayloadBytes(): int
    {
        return (int) config('atlas-thresholds.autosave.max_payload_kb', 256) * 1024;
    }
}
