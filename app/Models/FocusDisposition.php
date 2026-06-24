<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Disposition atasan atas item "Needs Action" di Focus (per user+program+tag).
 *
 * Lihat migration create_focus_disposition_table untuk konteks. Dipakai oleh
 * OrgSummaryService untuk menyembunyikan item yang sudah ditindaklanjuti dari
 * needsAction milik user selama mute window.
 */
class FocusDisposition extends Model
{
    protected $table = 'FocusDisposition';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function program()
    {
        return $this->belongsTo(Program::class, 'programId');
    }
}
