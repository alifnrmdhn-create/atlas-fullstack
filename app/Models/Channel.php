<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Channel extends Model
{
    protected $table = 'Channel';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];

    protected $casts = [
        'isArchived' => 'boolean',
        'allowThreads' => 'boolean',
        'allowReactions' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function members()
    {
        return $this->hasMany(ChannelMember::class, 'channelId');
    }
}
