<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskReportRiskSnapshot extends Model
{
    protected $table = 'RiskReportRiskSnapshot';
    public $timestamps = false;
    protected $guarded = ['id'];

    public function kris() { return $this->hasMany(RiskReportKRI::class, 'riskSnapshotId')->orderBy('order'); }
    public function mitigation() { return $this->hasOne(RiskReportMitigation::class, 'riskSnapshotId'); }
}
