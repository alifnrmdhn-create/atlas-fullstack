<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BroadcastEvent extends Model
{
    protected $table = 'broadcast_events';
    const CREATED_AT = 'createdAt';
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'payload' => 'array',
        'userIds' => 'array',
        'createdAt' => 'datetime',
    ];
}
