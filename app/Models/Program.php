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
    protected $appends = ['picPersonIds', 'workstreamCount', 'readiness'];
    protected $hidden  = ['coPics'];

    /** Kolom pemilik yang dipakai untuk user-scope filter. */
    protected string $ownerColumn = 'ownerId';

    protected $casts = [
        'hasNoApmsKpi' => 'boolean',
        'budgetIdr' => 'decimal:4',
        'budgetSpent' => 'decimal:4',
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

    public function workstreams(): HasMany
    {
        return $this->hasMany(Workstream::class, 'programId');
    }

    /** KPI definitions yang dimiliki program ini. */
    public function kpis(): HasMany
    {
        return $this->hasMany(KpiDefinition::class, 'programId');
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

        $hasKpi = $this->relationLoaded('kpis')
            ? $this->kpis->isNotEmpty()
            : $this->kpis()->where('isActive', true)->exists();

        return [
            'hasWorkstream' => $hasWorkstream,
            'hasTask'       => $hasTask,
            'hasKpi'        => $hasKpi,
            'isReady'       => $hasWorkstream && $hasTask && $hasKpi,
        ];
    }
}
