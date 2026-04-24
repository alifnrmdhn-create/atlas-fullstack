<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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
}
