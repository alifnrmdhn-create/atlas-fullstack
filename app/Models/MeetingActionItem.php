<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MeetingActionItem extends Model
{
    protected $table = 'MeetingActionItem';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'dueDate' => 'datetime',
        'completedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'assignedToId');
    }
}
