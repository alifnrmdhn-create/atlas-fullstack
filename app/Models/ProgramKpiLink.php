<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProgramKpiLink extends Model
{
    protected $table = 'ProgramKpiLink';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'apmsKpiBobot' => 'float',
        'createdAt' => 'datetime',
    ];

    public function program()
    {
        return $this->belongsTo(Program::class, 'programId');
    }
}
