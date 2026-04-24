<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $table = 'Notification';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
        'readAt' => 'datetime',
        'dismissedAt' => 'datetime',
        'resolvedAt' => 'datetime',
        'expiresAt' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }
}
