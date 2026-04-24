<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportKRI extends Model
{
    protected $table = 'RiskReportKRI';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'targetValue' => 'decimal:6',
        'actualValue' => 'decimal:6',
        'thresholdWarning' => 'decimal:6',
        'thresholdCritical' => 'decimal:6',
        'prevMonthValue' => 'decimal:6',
        'higherIsBetter' => 'boolean',
    ];
}
