<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonthlyReport extends Model
{
    protected $table = 'MonthlyReport';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'linkedProgramIds' => 'array',
        'submittedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function unit() { return $this->belongsTo(OrganizationalUnit::class, 'unitId'); }
    public function submittedBy() { return $this->belongsTo(User::class, 'submittedById'); }
    public function metrics() { return $this->hasMany(MonthlyReportMetric::class, 'reportId')->orderBy('kategori')->orderBy('order'); }
    public function files() { return $this->hasMany(MonthlyReportFile::class, 'reportId')->orderBy('uploadedAt', 'desc'); }
    public function approvals() { return $this->hasMany(MonthlyReportApproval::class, 'reportId')->orderBy('createdAt'); }
}
