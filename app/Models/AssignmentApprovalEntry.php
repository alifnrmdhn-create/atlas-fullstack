<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssignmentApprovalEntry extends Model
{
    protected $table = 'assignment_approval_entries';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'actedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function assignment()
    {
        return $this->belongsTo(Assignment::class, 'assignmentId');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }
}
