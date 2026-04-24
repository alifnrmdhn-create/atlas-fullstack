<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelMessage extends Model
{
    protected $table = 'ChannelMessage';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'reactions' => 'array',
        'attachments' => 'array',
        'mentionedUserIds' => 'array',
        'richContent' => 'array',
        'isPinned' => 'boolean',
        'isEdited' => 'boolean',
        'editedAt' => 'datetime',
        'deletedForEveryoneAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function channel()
    {
        return $this->belongsTo(Channel::class, 'channelId');
    }

    public function author()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parentMessageId');
    }

    public function replies()
    {
        return $this->hasMany(self::class, 'parentMessageId');
    }

    public function hiddenFor()
    {
        return $this->hasMany(ChannelMessageHidden::class, 'messageId');
    }
}
