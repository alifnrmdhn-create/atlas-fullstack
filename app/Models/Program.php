<?php

namespace App\Models;

use App\Enums\Kelompok;
use App\Enums\PilarStrategis;
use App\Support\FiltersByUserScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Program extends Model
{
    use FiltersByUserScope;

    protected $table = 'Program';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];
    // `readiness` SENGAJA tidak di $appends (audit 2026-06-10): accessor-nya
    // fallback ke 4 query exists() per program saat relasi belum loaded →
    // serialisasi list 97 program = 388 query (terukur). Satu-satunya konsumen
    // FE adalah detail (ProgramDetailView), jadi di-append eksplisit di
    // ProgramController::show — di sana findOrFail sudah eager-load semuanya.
    protected $appends = ['picPersonIds', 'workstreamCount'];
    protected $hidden  = ['coPics'];

    /** Kolom pemilik yang dipakai untuk user-scope filter. */
    protected string $ownerColumn = 'ownerId';

    protected $casts = [
        'hasNoApmsKpi' => 'boolean',
        'strategicAlignment' => 'float',
        'startDate' => 'datetime',
        'targetEndDate' => 'datetime',
        'actualEndDate' => 'datetime',
        'archivedAt' => 'datetime',
        'autoHealthComputedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
        'kelompok' => Kelompok::class,
        'pilarStrategis' => PilarStrategis::class,
    ];

    public function owner()
    {
        return $this->belongsTo(User::class, 'ownerId');
    }

    /** Channel komunikasi yang ter-tautkan ke program (untuk checklist Plan-phase). */
    public function linkedChannel()
    {
        return $this->belongsTo(Channel::class, 'linkedChannelId');
    }

    public function workstreams(): HasMany
    {
        return $this->hasMany(Workstream::class, 'programId');
    }

    /**
     * Program progress accessor — single source of truth (2026-05-21 fix).
     *
     * Sebelumnya `Program.progressPercent` adalah column statis yang TIDAK
     * PERNAH auto-recompute saat task/workstream berubah → angka stale
     * (default 0), inconsistent dengan Charter % Achievement & workstream
     * progressPercent yang real-time.
     *
     * Sekarang: accessor compute average dari workstreams.progressPercent
     * (yang sudah auto-update by TaskService::recomputeWorkstreamProgress).
     * Kalau relation belum loaded, fallback ke column value (yang juga
     * di-keep updated by recomputeProgramProgress).
     *
     * Hasil: same source of truth lintas view (Charter, Program Detail,
     * Workstream list).
     */
    public function getProgressPercentAttribute($value): int
    {
        if ($this->relationLoaded('workstreams') && $this->workstreams->isNotEmpty()) {
            $active = $this->workstreams->whereNotIn('status', ['CANCELLED']);
            if ($active->isNotEmpty()) {
                return (int) round($active->avg('progressPercent') ?? 0);
            }
        }
        return (int) ($value ?? 0);
    }

    /** KPI definitions yang dimiliki program ini. */
    public function kpis(): HasMany
    {
        return $this->hasMany(KpiDefinition::class, 'programId');
    }

    /** Link ke KPI APMS (catalog enterprise) — tidak punya nilai sendiri, hanya reference. */
    public function kpiLinks(): HasMany
    {
        return $this->hasMany(ProgramKpiLink::class, 'programId');
    }

    public function progressLogs(): HasMany
    {
        return $this->hasMany(ProgramProgressLog::class, 'programId')->orderBy('createdAt', 'desc');
    }

    public function latestProgressLog(): HasOne
    {
        return $this->hasOne(ProgramProgressLog::class, 'programId')->latestOfMany('createdAt');
    }

    /**
     * Semua tasks program via workstreams.
     * Initiative (workstream) → WorkItem (task): foreign keys programId → initiativeId.
     */
    public function tasks(): HasManyThrough
    {
        return $this->hasManyThrough(
            Task::class,
            Workstream::class,
            'programId',     // FK di tabel Initiative
            'initiativeId',  // FK di tabel WorkItem
            'id',
            'id',
        );
    }

    /** Co-PIC via normalized entity_pics table. */
    public function coPics()
    {
        return $this->hasMany(EntityPic::class, 'entityId')
            ->where('entityType', 'Program');
    }

    /** @return array<int, int> */
    public function getPicPersonIdsAttribute(): array
    {
        if ($this->relationLoaded('coPics')) {
            return $this->coPics->pluck('userId')->map(fn ($id) => (int) $id)->values()->all();
        }
        return [];
    }

    public function getWorkstreamCountAttribute(): int
    {
        if (array_key_exists('workstreams_count', $this->attributes)) {
            return (int) $this->attributes['workstreams_count'];
        }
        if ($this->relationLoaded('workstreams')) {
            return $this->workstreams->count();
        }
        return 0;
    }

    /**
     * Readiness checklist computed dari relasi program. Dipakai FE untuk
     * menentukan apakah program siap di-aktifkan (DRAFT → ACTIVE).
     *
     * Memanfaatkan relation yang sudah eager-loaded di ProgramService::findOrFail
     * (workstreams.tasks) supaya tidak menambah N+1 query. Fall back ke
     * exists() query saat relasi belum loaded (mis. dipanggil dari list view).
     *
     * Catatan: `hasChannel` dan `description`/`budget` checks tidak di sini —
     * itu derivasi FE dari field detail atau dari workspace/summary endpoint.
     * Server hanya tahu yang berkaitan dengan relasi sub-entity.
     *
     * @return array{hasWorkstream: bool, hasTask: bool, hasKpi: bool, isReady: bool}
     */
    public function getReadinessAttribute(): array
    {
        $hasWorkstream = false;
        $hasTask = false;

        if ($this->relationLoaded('workstreams')) {
            $hasWorkstream = $this->workstreams->isNotEmpty();
            foreach ($this->workstreams as $ws) {
                if ($ws->relationLoaded('tasks')) {
                    if ($ws->tasks->isNotEmpty()) {
                        $hasTask = true;
                        break;
                    }
                } else {
                    if ($ws->tasks()->exists()) {
                        $hasTask = true;
                        break;
                    }
                }
            }
        } else {
            $hasWorkstream = $this->workstreams()->exists();
            if ($hasWorkstream) {
                $hasTask = $this->tasks()->exists();
            }
        }

        // hasKpi satisfied baik via KpiDefinition internal maupun ProgramKpiLink (APMS).
        // Tab "KPI APMS" punya dua jalur input — checklist harus konsisten.
        $hasInternalKpi = $this->relationLoaded('kpis')
            ? $this->kpis->isNotEmpty()
            : $this->kpis()->where('isActive', true)->exists();
        $hasKpiLink = $this->relationLoaded('kpiLinks')
            ? $this->kpiLinks->isNotEmpty()
            : $this->kpiLinks()->exists();
        $hasKpi = $hasInternalKpi || $hasKpiLink;

        return [
            'hasWorkstream' => $hasWorkstream,
            'hasTask'       => $hasTask,
            'hasKpi'        => $hasKpi,
            'isReady'       => $hasWorkstream && $hasTask && $hasKpi,
        ];
    }
}
