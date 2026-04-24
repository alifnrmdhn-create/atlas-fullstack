<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Position extends Model
{
    protected $table = 'Position';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'isActive' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function directorate()
    {
        return $this->belongsTo(Directorate::class, 'directorateId');
    }

    public function division()
    {
        return $this->belongsTo(OrganizationalUnit::class, 'divisionId');
    }

    public function users()
    {
        return $this->hasMany(User::class, 'positionId');
    }
}
