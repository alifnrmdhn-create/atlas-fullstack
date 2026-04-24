<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportApproval extends Model
{
    protected $table = 'RiskReportApproval';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = ['createdAt' => 'datetime'];

    public function approver() { return $this->belongsTo(User::class, 'approverId'); }
}
