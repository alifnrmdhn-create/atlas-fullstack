<?php

namespace App\Models;

use App\Support\FiltersByUserScope;
use Illuminate\Database\Eloquent\Model;

class Workstream extends Model
{
    use FiltersByUserScope;

    /** Physical table name di DB (Prisma @@map). */
    protected $table = 'Initiative';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];
    protected string $ownerColumn = 'ownerId';

    protected $casts = [
        'milestones' => 'array',
        'picPersonIds' => 'array',
        'startDate' => 'datetime',
        'targetCompletion' => 'datetime',
        'actualCompletion' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function program()
    {
        return $this->belongsTo(Program::class, 'programId');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'ownerId');
    }

    public function tasks()
    {
        return $this->hasMany(Task::class, 'initiativeId');
    }
}
