<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MeetingDecision extends Model
{
    protected $table = 'MeetingDecision';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = ['createdAt' => 'datetime'];
}
