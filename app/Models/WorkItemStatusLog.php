<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only audit log untuk transisi status WorkItem (Task).
 *
 * Diisi otomatis oleh TaskService::transitionStatus dan updateProgress.
 * Tidak ada updatedAt — entry tidak boleh dimutasi setelah dibuat.
 */
class WorkItemStatusLog extends Model
{
    protected $table = 'WorkItemStatusLog';
    public const CREATED_AT = 'createdAt';
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
    ];

    public function workItem(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'workItemId');
    }

    public function byUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'byUserId');
    }
}
