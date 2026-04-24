<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserStatus extends Model
{
    protected $table = 'UserStatus';
    const CREATED_AT = null;
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'lastActivityAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class, 'userId'); }
}
