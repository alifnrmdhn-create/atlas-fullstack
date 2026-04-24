<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrganizationalUnit extends Model
{
    protected $table = 'OrganizationalUnit';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = null;

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'isActive' => 'boolean',
        'budget' => 'decimal:4',
        'createdAt' => 'datetime',
    ];

    public function parent()
    {
        return $this->belongsTo(self::class, 'parentId');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parentId');
    }

    public function directorate()
    {
        return $this->belongsTo(Directorate::class, 'directorateId');
    }

    public function users()
    {
        return $this->hasMany(User::class, 'unitId');
    }
}
