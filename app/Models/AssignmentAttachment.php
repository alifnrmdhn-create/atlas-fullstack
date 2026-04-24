<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssignmentAttachment extends Model
{
    protected $table = 'AssignmentAttachment';
    const CREATED_AT = 'createdAt';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
    ];

    public function assignment()
    {
        return $this->belongsTo(Assignment::class, 'assignmentId');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploadedBy');
    }
}
