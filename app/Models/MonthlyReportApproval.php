<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonthlyReportApproval extends Model
{
    protected $table = 'MonthlyReportApproval';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = ['createdAt' => 'datetime'];

    public function approver() { return $this->belongsTo(User::class, 'approverId'); }
}
