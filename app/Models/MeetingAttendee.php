<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MeetingAttendee extends Model
{
    protected $table = 'MeetingAttendee';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'respondedAt' => 'datetime',
        'createdAt' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function delegateTo()
    {
        return $this->belongsTo(User::class, 'delegateToId');
    }
}
