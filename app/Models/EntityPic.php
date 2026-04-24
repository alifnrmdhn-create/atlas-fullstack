<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EntityPic extends Model
{
    protected $table = 'entity_pics';
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'isPrimary' => 'boolean',
        'createdAt' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function scopeForEntity($query, string $entityType, int $entityId)
    {
        return $query->where('entityType', $entityType)->where('entityId', $entityId);
    }
}
