<?php

namespace App\Models;

use App\Support\FiltersByUserScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Maps to database table `WorkItem` (Prisma @@map).
 * Frontend and API use the terms "task" or "step".
 * FK: WorkItem.initiativeId → Initiative.id (workstream)
 * See NAMING_CONVENTION.md for full mapping.
 */
class Task extends Model
{
    use FiltersByUserScope;

    protected $table = 'WorkItem';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];
    protected $appends = ['picPersonIds'];
    protected $hidden  = ['entityPics'];

    /** Untuk Task, ownerColumn = assignedTo (bukan ownerId). */
    protected string $ownerColumn = 'assignedTo';

    protected $casts = [
        'isBlocked' => 'boolean',
        'dependsOnIds' => 'array',
        'actualWeeks' => 'array',
        'plannedWeeks' => 'array',
        'picUnitIds' => 'array',
        'startDate' => 'datetime',
        'targetCompletion' => 'datetime',
        'actualCompletion' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function workstream()
    {
        return $this->belongsTo(Workstream::class, 'initiativeId');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assignedTo');
    }

    public function blockers()
    {
        return $this->hasMany(Blocker::class, 'workItemId');
    }

    public function entityPics(): HasMany
    {
        return $this->hasMany(EntityPic::class, 'entityId')
            ->where('entityType', 'WorkItem');
    }

    /** @return array<int, int> */
    public function getPicPersonIdsAttribute(): array
    {
        if ($this->relationLoaded('entityPics')) {
            return $this->entityPics->pluck('userId')->map(fn ($id) => (int) $id)->values()->all();
        }
        return [];
    }
}
