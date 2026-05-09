<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DirektoratScorecard extends Model
{
    protected $table = 'DirektoratScorecard';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'directorateId' => 'integer',
        'nilai' => 'float',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function directorate()
    {
        return $this->belongsTo(Directorate::class, 'directorateId');
    }
}
