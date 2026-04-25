<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Phase extends Model
{
    protected $table = 'Phase';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'picUnitIds' => 'array',
        'picPersonIds' => 'array',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function workstream()
    {
        return $this->belongsTo(Workstream::class, 'initiativeId');
    }

    public function tasks()
    {
        return $this->hasMany(Task::class, 'phaseId');
    }

    public function entityPics(): HasMany
    {
        return $this->hasMany(EntityPic::class, 'entityId')
            ->where('entityType', 'Phase');
    }

    /** @return array<int, int>|null */
    public function getPicPersonIdsAttribute(): ?array
    {
        if ($this->relationLoaded('entityPics')) {
            return $this->entityPics->pluck('userId')->map(fn ($id) => (int) $id)->values()->all();
        }

        $raw = $this->getRawOriginal('picPersonIds');
        if ($raw === null || $raw === '') return null;
        $decoded = is_array($raw) ? $raw : json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
