<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportGovernance extends Model
{
    protected $table = 'RiskReportGovernance';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'riskRegisterCoverage' => 'decimal:4',
        'reportSubmissionRate' => 'decimal:4',
        'organCompletenessRate' => 'decimal:4',
        'workProgramRealization' => 'decimal:4',
        'auditFollowUpRate' => 'decimal:4',
        'erinUpdateRate' => 'decimal:4',
    ];
}
