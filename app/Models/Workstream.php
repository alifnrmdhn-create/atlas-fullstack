<?php

namespace App\Models;

use App\Support\FiltersByUserScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Maps to database table `Initiative` (Prisma @@map).
 * Frontend and API use the term "workstream".
 * FK in Task table: WorkItem.initiativeId → Initiative.id
 * See NAMING_CONVENTION.md for full mapping.
 */
class Workstream extends Model
{
    use FiltersByUserScope;

    protected $table = 'Initiative';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];
    protected $appends = ['picPersonIds', 'taskCount', 'phaseCount'];
    protected $hidden  = ['entityPics'];
    protected string $ownerColumn = 'ownerId';

    protected $casts = [
        'milestones' => 'array',
        'startDate' => 'datetime',
        'targetCompletion' => 'datetime',
        'actualCompletion' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
        'budgetIdr'   => 'decimal:4',
        'budgetSpent' => 'decimal:4',
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

    /** @return array<int, int> */
    public function getPicPersonIdsAttribute(): array
    {
        if ($this->relationLoaded('entityPics')) {
            return $this->entityPics->pluck('userId')->map(fn ($id) => (int) $id)->values()->all();
        }
        return [];
    }

    public function getTaskCountAttribute(): int
    {
        return $this->relationLoaded('tasks') ? $this->tasks->count() : 0;
    }

    public function getPhaseCountAttribute(): int
    {
        return $this->relationLoaded('phases') ? $this->phases->count() : 0;
    }
}
