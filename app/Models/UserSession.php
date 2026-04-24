<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserSession extends Model
{
    protected $table = 'UserSession';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'startedAt' => 'datetime',
        'endedAt' => 'datetime',
        'lastPingAt' => 'datetime',
        'durationMs' => 'integer',
    ];

    public function user() { return $this->belongsTo(User::class, 'userId'); }
}
