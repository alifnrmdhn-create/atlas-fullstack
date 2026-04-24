<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PositionHistory extends Model
{
    protected $table = 'position_history';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'startDate' => 'datetime',
        'endDate' => 'datetime',
        'createdAt' => 'datetime',
    ];
}
