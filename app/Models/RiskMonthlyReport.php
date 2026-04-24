<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiskMonthlyReport extends Model
{
    protected $table = 'RiskMonthlyReport';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'rmiScore' => 'decimal:4',
        'submittedAt' => 'datetime',
        'approvedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function unit() { return $this->belongsTo(OrganizationalUnit::class, 'unitId'); }
    public function createdBy() { return $this->belongsTo(User::class, 'createdById'); }
    public function submittedBy() { return $this->belongsTo(User::class, 'submittedById'); }
    public function strategy() { return $this->hasOne(RiskReportStrategy::class, 'reportId'); }
    public function governance() { return $this->hasOne(RiskReportGovernance::class, 'reportId'); }
    public function narratives() { return $this->hasMany(RiskReportNarrative::class, 'reportId')->orderBy('order'); }
    public function lossEvents() { return $this->hasMany(RiskReportLossEvent::class, 'reportId')->orderBy('eventDate', 'desc'); }
    public function approvals() { return $this->hasMany(RiskReportApproval::class, 'reportId')->orderBy('createdAt'); }
    public function riskSnapshots() {
        return $this->hasMany(RiskReportRiskSnapshot::class, 'reportId')->orderBy('order')
            ->with(['kris', 'mitigation']);
    }
}
