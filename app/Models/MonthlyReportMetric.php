<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonthlyReportMetric extends Model
{
    protected $table = 'MonthlyReportMetric';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'rkap' => 'decimal:4',
        'realisasi' => 'decimal:4',
        'tahunLalu' => 'decimal:4',
        'createdAt' => 'datetime',
    ];
}
