<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Directorate extends Model
{
    protected $table = 'Directorate';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];

    protected $casts = [
        'isActive' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function users()
    {
        return $this->hasMany(User::class, 'directorateId');
    }

    public function units()
    {
        return $this->hasMany(OrganizationalUnit::class, 'directorateId');
    }
}
