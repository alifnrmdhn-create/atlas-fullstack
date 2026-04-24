<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Comment extends Model
{
    protected $table = 'Comment';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'reactions' => 'array',
        'attachments' => 'array',
        'mentionedUserIds' => 'array',
        'mentionChannels' => 'array',
        'richContent' => 'array',
        'isPinned' => 'boolean',
        'isEdited' => 'boolean',
        'editedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function author()
    {
        return $this->belongsTo(User::class, 'createdBy');
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parentCommentId');
    }

    public function replies()
    {
        return $this->hasMany(self::class, 'parentCommentId');
    }
}
