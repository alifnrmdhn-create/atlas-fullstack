<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Meeting extends Model
{
    protected $table = 'Meeting';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'startAt' => 'datetime',
        'endAt' => 'datetime',
        'rescheduledFromAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function attendees()
    {
        return $this->hasMany(MeetingAttendee::class, 'meetingId')->orderBy('attendeeRole');
    }

    public function decisions()
    {
        return $this->hasMany(MeetingDecision::class, 'meetingId')->orderBy('createdAt');
    }

    public function actionItems()
    {
        return $this->hasMany(MeetingActionItem::class, 'meetingId')->orderBy('createdAt');
    }

    public function organizer()
    {
        return $this->belongsTo(User::class, 'organizerId');
    }

    public function linkedProgram()
    {
        return $this->belongsTo(Program::class, 'linkedProgramId');
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, ['CANCELLED', 'COMPLETED'], true);
    }
}
