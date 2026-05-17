<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MeetingDecision extends Model
{
    protected $table = 'MeetingDecision';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = ['createdAt' => 'datetime'];

    public function meeting(): BelongsTo
    {
        return $this->belongsTo(Meeting::class, 'meetingId');
    }
}
