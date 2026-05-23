<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Audit history KpiValue — setiap update di KpiValue (via updateOrCreate)
 * trigger snapshot nilai lama ke table ini. Current value tetap di KpiValue,
 * history terbaca dari KpiValueRevision (orderBy revisedAt desc).
 *
 * Lihat KpiController::storeValue untuk insert logic.
 */
class KpiValueRevision extends Model
{
    protected $table = 'KpiValueRevision';
    const CREATED_AT = null;
    const UPDATED_AT = null;
    protected $guarded = ['id'];

    protected $casts = [
        'measurementDate' => 'datetime',
        'revisedAt' => 'datetime',
        'previousActualValue' => 'decimal:6',
        'previousTargetValue' => 'decimal:6',
    ];

    public function kpiValue(): BelongsTo
    {
        return $this->belongsTo(KpiValue::class, 'kpiValueId');
    }

    public function kpiDefinition(): BelongsTo
    {
        return $this->belongsTo(KpiDefinition::class, 'kpiDefinitionId');
    }

    public function revisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revisedBy');
    }
}
