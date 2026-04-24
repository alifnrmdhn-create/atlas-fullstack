<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssignmentReviewAction extends Model
{
    protected $table = 'AssignmentReviewAction';
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

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewerId');
    }
}
