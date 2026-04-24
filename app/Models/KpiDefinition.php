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
        'targetValue' => 'decimal:6',
        'actualValue' => 'decimal:6',
        'warningThreshold' => 'decimal:6',
        'criticalThreshold' => 'decimal:6',
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
