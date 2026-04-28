<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportKRI extends Model
{
    protected $table = 'RiskReportKRI';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'targetValue' => 'float',
        'actualValue' => 'float',
        'thresholdWarning' => 'float',
        'thresholdCritical' => 'float',
        'prevMonthValue' => 'float',
        'higherIsBetter' => 'boolean',
    ];
}
