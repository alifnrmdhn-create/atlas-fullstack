<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportNarrative extends Model
{
    protected $table = 'RiskReportNarrative';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
