<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportStrategy extends Model
{
    protected $table = 'RiskReportStrategy';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'riskCapacity' => 'decimal:4',
        'riskAppetite' => 'decimal:4',
        'riskTolerance' => 'decimal:4',
        'riskLimit' => 'decimal:4',
        'totalExposure' => 'decimal:4',
        'exposureVsCapacity' => 'decimal:4',
        'exposureVsAppetite' => 'decimal:4',
        'rasCompliant' => 'boolean',
    ];
}
