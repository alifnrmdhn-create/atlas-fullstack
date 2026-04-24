<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonthlyReportFile extends Model
{
    protected $table = 'MonthlyReportFile';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = ['uploadedAt' => 'datetime'];

    public function uploadedBy() { return $this->belongsTo(User::class, 'uploadedById'); }
}
