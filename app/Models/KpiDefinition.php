<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KpiDefinition extends Model
{
    protected $table = 'KpiDefinition';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'isLeadingIndicator' => 'boolean',
        'isActive' => 'boolean',
        'targetValue' => 'float',
        'actualValue' => 'float',
        'warningThreshold' => 'float',
        'criticalThreshold' => 'float',
        'lastMeasuredDate' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function program()
    {
        return $this->belongsTo(Program::class, 'programId');
    }

    public function values()
    {
        return $this->hasMany(KpiValue::class, 'kpiDefinitionId');
    }
}
