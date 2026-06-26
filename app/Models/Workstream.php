<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Maps to database table `Initiative` (Prisma @@map).
 * Frontend and API use the term "workstream".
 * FK in Task table: WorkItem.initiativeId → Initiative.id
 * See NAMING_CONVENTION.md for full mapping.
 *
 * Catatan (2026-06-26): workstream TIDAK lagi punya owner/PIC sendiri.
 * Akuntabilitas program ada di Program (PIC utama = Kadiv/Kasub); penunjukan
 * orang di level eksekusi ada di Task.assignedTo. Kolom `ownerId` dulu 96/97
 * cuma cermin Program.ownerId & tak pernah dipakai untuk scope/notif — di-drop.
 */
class Workstream extends Model
{
    protected $table = 'Initiative';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];
    protected $appends = ['taskCount', 'phaseCount'];

    protected $casts = [
        'milestones' => 'array',
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

    public function tasks()
    {
        return $this->hasMany(Task::class, 'initiativeId');
    }

    public function phases(): HasMany
    {
        return $this->hasMany(Phase::class, 'initiativeId')->orderBy('order');
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
