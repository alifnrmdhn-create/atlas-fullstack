<?php

namespace App\Models;

use App\Support\FiltersByUserScope;
use Illuminate\Database\Eloquent\Model;

class Program extends Model
{
    use FiltersByUserScope;

    protected $table = 'Program';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];

    /** Kolom pemilik yang dipakai untuk user-scope filter. */
    protected string $ownerColumn = 'ownerId';

    protected $casts = [
        'hasNoApmsKpi' => 'boolean',
        'budgetIdr' => 'decimal:4',
        'budgetSpent' => 'decimal:4',
        'strategicAlignment' => 'float',
        'picPersonIds' => 'array',
        'startDate' => 'datetime',
        'targetEndDate' => 'datetime',
        'actualEndDate' => 'datetime',
        'archivedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function owner()
    {
        return $this->belongsTo(User::class, 'ownerId');
    }

    public function workstreams()
    {
        return $this->hasMany(Workstream::class, 'programId');
    }

    /** Co-PIC via normalized entity_pics table. */
    public function coPics()
    {
        return $this->hasMany(EntityPic::class, 'entityId')
            ->where('entityType', 'Program');
    }

    /** @return array<int, int>|null */
    public function getPicPersonIdsAttribute(): ?array
    {
        if ($this->relationLoaded('coPics')) {
            return $this->coPics->pluck('userId')->map(fn ($id) => (int) $id)->values()->all();
        }

        $raw = $this->getRawOriginal('picPersonIds');
        if ($raw === null || $raw === '') return null;
        $decoded = is_array($raw) ? $raw : json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
