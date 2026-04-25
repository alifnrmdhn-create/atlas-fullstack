<?php

namespace App\Models;

use App\Support\FiltersByUserScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Workstream extends Model
{
    use FiltersByUserScope;

    /** Physical table name di DB (Prisma @@map). */
    protected $table = 'Initiative';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];
    protected string $ownerColumn = 'ownerId';

    protected $casts = [
        'milestones' => 'array',
        'picPersonIds' => 'array',
        'startDate' => 'datetime',
        'targetCompletion' => 'datetime',
        'actualCompletion' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function program()
    {
        return $this->belongsTo(Program::class, 'programId');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'ownerId');
    }

    public function tasks()
    {
        return $this->hasMany(Task::class, 'initiativeId');
    }

    public function phases(): HasMany
    {
        return $this->hasMany(Phase::class, 'initiativeId')->orderBy('order');
    }

    public function entityPics(): HasMany
    {
        return $this->hasMany(EntityPic::class, 'entityId')
            ->where('entityType', 'Initiative');
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
