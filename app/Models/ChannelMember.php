<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelMember extends Model
{
    protected $table = 'ChannelMember';
    public $timestamps = false;
    public $incrementing = false;

    /** Composite primary key (channelId, userId). */
    protected $primaryKey = null;

    protected $guarded = [];

    protected $casts = [
        'isMuted' => 'boolean',
        'isStarred' => 'boolean',
        'joinedAt' => 'datetime',
        'lastViewedAt' => 'datetime',
    ];

    public function channel()
    {
        return $this->belongsTo(Channel::class, 'channelId');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }
}
