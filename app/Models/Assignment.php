<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Assignment extends Model
{
    protected $table = 'Assignment';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];
    protected $appends = ['approvalChain'];

    protected $casts = [
        'watcherIds' => 'array',
        'attachments' => 'array',
        'tags' => 'array',
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

    /**
     * Selalu kembalikan approvalChain dari tabel normalisasi jika relasi sudah
     * di-load; fallback ke JSON column untuk data lama yang belum di-eager-load.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function getApprovalChainAttribute(): ?array
    {
        if ($this->relationLoaded('approvalEntries')) {
            return $this->approvalEntries->map(fn ($e) => [
                'userId'        => $e->userId,
                'role'          => $e->role,
                'name'          => $e->name,
                'positionTitle' => $e->positionTitle,
                'order'         => $e->order,
                'status'        => $e->status,
                'actedAt'       => $e->actedAt?->toIso8601String(),
                'note'          => $e->note,
            ])->values()->all();
        }

        // Legacy fallback: baca JSON column (data lama sebelum normalisasi)
        $raw = $this->getRawOriginal('approvalChain');
        if ($raw === null || $raw === '') return null;
        $decoded = is_array($raw) ? $raw : json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
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
