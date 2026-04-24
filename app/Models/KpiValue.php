<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KpiValue extends Model
{
    protected $table = 'KpiValue';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'targetValue' => 'decimal:6',
        'actualValue' => 'decimal:6',
        'variance' => 'decimal:6',
        'variancePercent' => 'float',
        'measurementDate' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function kpiDefinition()
    {
        return $this->belongsTo(KpiDefinition::class, 'kpiDefinitionId');
    }
}
