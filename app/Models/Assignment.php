<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Assignment extends Model
{
    protected $table = 'Assignment';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'watcherIds' => 'array',
        'attachments' => 'array',
        'tags' => 'array',
        'approvalChain' => 'array',
        'needsClarification' => 'boolean',
        'evidenceRequired' => 'boolean',
        'isPrivate' => 'boolean',
        'dueDate' => 'datetime',
        'acknowledgedAt' => 'datetime',
        'startedAt' => 'datetime',
        'completedAt' => 'datetime',
        'cancelledAt' => 'datetime',
        'rejectedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function assigner()
    {
        return $this->belongsTo(User::class, 'assignerId');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigneeId');
    }

    public function relatedProgram()
    {
        return $this->belongsTo(Program::class, 'relatedProgramId');
    }

    /** Normalized chain (dari Fase 2). Source of truth untuk approval flow. */
    public function approvalEntries()
    {
        return $this->hasMany(AssignmentApprovalEntry::class, 'assignmentId')
            ->orderBy('order');
    }

    public function evidenceItems()
    {
        return $this->hasMany(AssignmentAttachment::class, 'assignmentId');
    }

    public function reviewActions()
    {
        return $this->hasMany(AssignmentReviewAction::class, 'assignmentId');
    }

    /** Shorthand: terminal = SELESAI | REJECTED | DIBATALKAN. */
    public function isTerminal(): bool
    {
        return in_array($this->status, ['SELESAI', 'REJECTED', 'DIBATALKAN'], true);
    }

    public function isSelfAssign(): bool
    {
        return $this->assignerId === $this->assigneeId;
    }
}
