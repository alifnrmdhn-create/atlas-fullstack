<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MessageReminder extends Model
{
    protected $table = 'MessageReminder';
    const CREATED_AT = 'createdAt';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'remindAt' => 'datetime',
        'notified' => 'boolean',
        'createdAt' => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class, 'userId'); }
}
