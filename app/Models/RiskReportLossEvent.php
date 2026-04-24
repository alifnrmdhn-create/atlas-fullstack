<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportLossEvent extends Model
{
    protected $table = 'RiskReportLossEvent';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'eventDate' => 'datetime',
        'isRecurring' => 'boolean',
        'impactAmount' => 'decimal:4',
        'recoveredAmount' => 'decimal:4',
    ];
}
