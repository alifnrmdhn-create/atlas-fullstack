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
        'targetValue' => 'float',
        'actualValue' => 'float',
        'variance' => 'float',
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
