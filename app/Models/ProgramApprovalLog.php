<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgramApprovalLog extends Model
{
    protected $table = 'ProgramApprovalLog';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
    ];

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class, 'programId');
    }

    public function byUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'byUserId');
    }

    /** Helper untuk mencatat log dari controller. */
    public static function record(
        int $programId,
        string $action,
        ?string $fromStatus,
        string $toStatus,
        int $byUserId,
        string $byUserName,
        ?string $note = null,
    ): self {
        return self::create([
            'programId'  => $programId,
            'action'     => $action,
            'fromStatus' => $fromStatus,
            'toStatus'   => $toStatus,
            'byUserId'   => $byUserId,
            'byUserName' => $byUserName,
            'note'       => $note,
        ]);
    }
}
