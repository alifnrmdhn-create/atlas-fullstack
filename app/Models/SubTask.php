<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubTask extends Model
{
    protected $table = 'SubTask';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'isCompleted' => 'boolean',
        'completedAt' => 'datetime',
        'dueDate' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class, 'workItemId');
    }
}
