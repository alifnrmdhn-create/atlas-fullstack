<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Blocker extends Model
{
    protected $table = 'Blocker';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'relatedBlockerIds' => 'array',
        'linkedWorkItemIds' => 'array',
        'resolvedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class, 'workItemId');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'createdBy');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assignedTo');
    }
}
