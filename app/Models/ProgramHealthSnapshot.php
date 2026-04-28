<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProgramHealthSnapshot extends Model
{
    protected $table = 'program_health_snapshots';
    public $timestamps = false;
    const CREATED_AT = 'createdAt';

    protected $guarded = ['id'];

    protected $casts = [
        'snapshotDate' => 'date',
        'byDivisi'     => 'array',
        'createdAt'    => 'datetime',
    ];
}
