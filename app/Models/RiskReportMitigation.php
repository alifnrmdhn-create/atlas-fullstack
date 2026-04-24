<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportMitigation extends Model
{
    protected $table = 'RiskReportMitigation';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'completionRate' => 'decimal:4',
        'budgetAllocated' => 'decimal:4',
        'budgetRealized' => 'decimal:4',
        'budgetAbsorption' => 'decimal:4',
        'isOverdue' => 'boolean',
    ];
}
