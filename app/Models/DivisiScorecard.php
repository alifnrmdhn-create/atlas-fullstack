<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DivisiScorecard extends Model
{
    protected $table = 'DivisiScorecard';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'unitId' => 'integer',
        'directorateId' => 'integer',
        'nilai' => 'float',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function unit()
    {
        return $this->belongsTo(OrganizationalUnit::class, 'unitId');
    }

    public function directorate()
    {
        return $this->belongsTo(Directorate::class, 'directorateId');
    }
}
