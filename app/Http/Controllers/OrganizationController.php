<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\Directorate;
use App\Models\KpiDefinition;
use App\Models\KpiValue;
use App\Services\ProgramSnapshotService;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\PositionHistory;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

class OrganizationController extends Controller
{
    // ── Pages ─────────────────────────────────────────────────────────────────

    public function hierarchy(): Response
    {
        $directorates = Directorate::where('isActive', true)->orderBy('code')->get();
        $units = OrganizationalUnit::with('directorate:id,code,name')
            ->orderBy('code')->get();
        $positions = Position::with(['directorate:id,code', 'division:id,code'])
            ->orderBy('seatOrder')->get();
        $users = User::where('isActive', true)
            ->select('id','name','roleType','unitId','directorateId','positionId','positionTitle','managerUserId')
            ->get();

        $usersByUnit = $users->groupBy('unitId');
        $positionsByUnit = $positions->groupBy('divisionId');

        $tree = $directorates->map(fn ($dir) => [
            ...$dir->toArray(),
            'divisionCount' => $units->where('directorateId', $dir->id)->count(),
            'userCount' => $users->where('directorateId', $dir->id)->count(),
            'divisions' => $units->where('directorateId', $dir->id)->map(fn ($unit) => [
                ...$unit->toArray(),
                'positionCount' => $positionsByUnit->get($unit->id, collect())->count(),
                'occupiedPositionCount' => $positionsByUnit->get($unit->id, collect())->filter(fn ($p) => $users->contains('positionId', $p->id))->count(),
                'positions' => $positionsByUnit->get($unit->id, collect())->sortBy('seatOrder')->map(fn ($p) => [
                    ...$p->toArray(),
                    'occupant' => $users->firstWhere('positionId', $p->id),
                ])->values()->all(),
            ])->values()->all(),
        ])->values()->all();

        return Inertia::render('OrganizationView', [
            'summary' => [
                'directorateCount' => $directorates->count(),
                'divisionCount' => $units->count(),
                'positionCount' => $positions->count(),
                'userCount' => $users->count(),
            ],
            'directorates' => $tree,
        ]);
    }

    // ── Program Summary (Executive Dashboard) ─────────────────────────────────

    public function programSummary(Request $request): JsonResponse
    {
        $user = $request->user();

        // Endpoint terberat di workspace bootstrap (agregasi 97 program + ratusan
        // task/blocker/KPI, dihitung fresh tiap request). Cache per-user TTL 3 menit
        // memangkas waktu absolut tanpa bikin angka basi terlalu lama. Key per-user
        // karena scope/visibility diturunkan dari user. `bust=1` untuk skip cache.
        $cacheKey = "program_summary:user:{$user->id}";
        if ($request->boolean('bust')) {
            Cache::forget($cacheKey);
        }

        $payload = Cache::remember($cacheKey, now()->addMinutes(3), function () use ($user) {
            // Normalisasi ke array murni sebelum di-cache. buildProgramSummary()
            // mengembalikan objek Collection (byDivisi/programsForChart/controls/…);
            // kalau itu yang disimpan, cache `file` men-`serialize()`-nya lalu
            // membaca balik sebagai __PHP_Incomplete_Class → command center KOSONG
            // pada tiap cache-hit (load pertama miss masih benar). json round-trip
            // bikin struktur serialize-safe. (fix Jun 2026)
            return json_decode(json_encode($this->buildProgramSummary($user)), true);
        });

        return response()->json($payload);
    }

    /**
     * Build the executive dashboard payload for a user. Pure computation (no request
     * state beyond the user) so the result is safely cacheable — see programSummary().
     *
     * @return array<string, mixed>
     */
    private function buildProgramSummary(User $user): array
    {
        $orgScope = OrgScope::forUser($user);
        $role = $orgScope->role;
        $isExecutive = $orgScope->isExecutive;

        $unitQuery = OrganizationalUnit::query()->orderBy('code');
        if (!$isExecutive) {
            $unitQuery->whereIn('id', $orgScope->unitIds ?: [0]);
        }
        $units = $unitQuery->get(['id', 'name', 'code', 'directorateId']);
        $unitIds = $units->pluck('id')->all();
        $scopeName = $orgScope->name;

        // ── Programs scoped by ownerUnitId ───────────────────────────────
        // Without this scope, KADIV/KASUBDIV would incorrectly see all programs.
        $programQuery = Program::query()
            ->whereNull('archivedAt')
            ->where('status', '!=', 'CANCELLED')
            ->whereIn('approvalStatus', ['ACTIVE', 'COMPLETED', 'DRAFT', 'PENDING_KASUB', 'PENDING_KADIV']);

        if (!$isExecutive) {
            $programQuery->whereIn('ownerUnitId', $unitIds);
        }

        $programs = $programQuery
            ->select([
                'id', 'code', 'name', 'ownerId', 'ownerUnitId', 'submittedById',
                'healthStatus', 'status', 'priority',
                'startDate', 'targetEndDate', 'progressPercent', 'approvalStatus', 'updatedAt',
                'kelompok', 'pilarStrategis', 'progresTerkini', 'dukunganDibutuhkan',
            ])
            ->with('owner:id,name')
            ->get();

        $now = Carbon::now();

        // Classify each program into a health tone.
        // setAppends([]) sebelum toArray() WAJIB: appends `readiness` menjalankan 4
        // exists() query per program saat relasi belum eager-loaded (di sini memang
        // tidak) → 4×N N+1 (≈388 query untuk 97 program, dominan di cold-load Home).
        // Dashboard payload tak memakai picPersonIds/workstreamCount/readiness.
        $classified = $programs->map(function ($p) use ($now) {
            $tone = $this->classifyProgramHealth($p, $now);
            return [...$p->setAppends([])->toArray(), 'healthTone' => $tone, 'healthLabel' => $this->toneLabel($tone)];
        });

        // Per-division breakdown
        $byDivisi = $units->map(function ($unit) use ($classified) {
            $divPrograms = $classified->where('ownerUnitId', $unit->id);
            return [...$this->buildCounts($divPrograms), 'unit' => $unit->only(['id', 'name', 'code'])];
        })->values();

        // Programs not assigned to any known unit — grouped under "Unassigned"
        $unassigned = $classified->whereNotIn('ownerUnitId', $unitIds);
        if ($unassigned->isNotEmpty()) {
            $byDivisi->push([...$this->buildCounts($unassigned), 'unit' => ['id' => null, 'name' => 'Belum Ditetapkan', 'code' => '-']]);
        }

        // Overall summary
        $overallCounts = $this->buildCounts($classified);

        // earlyWarning dihapus — digantikan oleh programsForChart yang sorted by urgency

        // ── Task load — scoped by viewer role's span of control ────────────
        // KADIV     → sub-units (children) of viewer's unit + roll-up of own division
        // KASUBDIV  → individuals (ASISTEN/OFFICER) in viewer's unit
        // ASISTEN/OFFICER → hidden (no subordinates to manage)
        // BOD/ADMIN/SUPERADMIN → flat per-division (current behavior)
        $taskLoad = $this->buildTaskLoad($user, $role, $units, $unitIds);

        // ── 1. Scorecard vs Non-Scorecard health ───────────────────────────
        $scorecardGroups = $classified->whereIn('approvalStatus', ['ACTIVE', 'COMPLETED'])
            ->groupBy(fn ($p) => $p['kelompok'] ?? 'NON_SCORECARD');

        $scorecardHealth = collect(['SCORECARD', 'NON_SCORECARD'])->map(function ($key) use ($scorecardGroups) {
            $group = $scorecardGroups->get($key, collect());
            $counts = $this->buildCounts($group);
            return ['kelompok' => $key, ...$counts];
        })->values();

        // ── 2. Deadline Clusters (future workload horizon) ─────────────────
        $activeProg = $classified->whereNotIn('status', ['COMPLETED', 'CANCELLED']);
        // "Lewat tenggat" (overdue, days < 0) = bucket sendiri. Sebelumnya overdue
        // ikut jatuh ke "≤ 30 hari" (kondisi `<= 30` mencakup angka negatif) → bar itu
        // menggabung program telat + akan-datang dan menyembunyikan bahwa mayoritasnya
        // sudah lewat tenggat. Horizon = beban tenggat KE DEPAN; overdue beda cerita.
        // ('max' lama dibuang — metadata tak pernah dibaca downstream.) (fix Jun 2026)
        $deadlineClusters = [
            ['label' => 'Overdue',     'programs' => []],
            ['label' => '≤ 30 days',   'programs' => []],
            ['label' => '31–60 days',  'programs' => []],
            ['label' => '61–90 days',  'programs' => []],
            ['label' => '90+ days',    'programs' => []],
            ['label' => 'No deadline', 'programs' => []],
        ];
        foreach ($activeProg as $p) {
            $days = $p['targetEndDate'] ? (int) $now->diffInDays(Carbon::parse($p['targetEndDate']), false) : null;
            if ($days === null) {
                $deadlineClusters[5]['programs'][] = ['tone' => $p['healthTone'], 'days' => null];
            } elseif ($days < 0) {
                $deadlineClusters[0]['programs'][] = ['tone' => $p['healthTone'], 'days' => $days];
            } elseif ($days <= 30) {
                $deadlineClusters[1]['programs'][] = ['tone' => $p['healthTone'], 'days' => $days];
            } elseif ($days <= 60) {
                $deadlineClusters[2]['programs'][] = ['tone' => $p['healthTone'], 'days' => $days];
            } elseif ($days <= 90) {
                $deadlineClusters[3]['programs'][] = ['tone' => $p['healthTone'], 'days' => $days];
            } else {
                $deadlineClusters[4]['programs'][] = ['tone' => $p['healthTone'], 'days' => $days];
            }
        }
        $deadlineClusters = collect($deadlineClusters)->map(function ($cluster) {
            $progs = collect($cluster['programs']);
            return [
                'label'     => $cluster['label'],
                'total'     => $progs->count(),
                'atRisk'    => $progs->whereIn('tone', ['at_risk', 'terlambat', 'overdue'])->count(),
                'onTrack'   => $progs->where('tone', 'on_track')->count(),
            ];
        })->filter(fn ($c) => $c['total'] > 0)->values();

        // ── 3. Perlu Tindakan (needs executive action) ─────────────────────
        // Only programs the current user CAN act on right now:
        //   - PENDING_KASUB → visible to KASUBDIV/ADMIN/SUPERADMIN
        //   - PENDING_KADIV → visible to KADIV/ADMIN/SUPERADMIN
        // PLUS: filter out user's own submissions — submitter melihat sendiri
        // submission-nya sebagai "perlu tindakan" = ghost work, bola sudah di
        // tangan reviewer. ASISTEN/BOD/OFFICER tidak approve apa-apa → kosong.
        $canApproveStatuses = [];
        if (in_array($role, ['KASUBDIV', 'ADMIN', 'SUPERADMIN'], true)) {
            $canApproveStatuses[] = 'PENDING_KASUB';
        }
        if (in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true)) {
            $canApproveStatuses[] = 'PENDING_KADIV';
        }
        $pendingApproval = $programs
            ->whereIn('approvalStatus', $canApproveStatuses)
            ->filter(fn ($p) => $p->submittedById !== $user->id && $p->ownerId !== $user->id)
            ->map(fn ($p) => [
                'id'     => $p->id,
                'code'   => $p->code,
                'name'   => $p->name,
                // Note: "Direktur" sengaja dihindari — di hierarki PTPN III
                // Direktur = level Direksi (board), bukan KADIV. Pakai "Kepala
                // Divisi" / "Kepala Sub Divisi" yang sesuai struktur jabatan.
                'reason' => $p->approvalStatus === 'PENDING_KADIV' ? 'Menunggu persetujuan Kepala Divisi' : 'Menunggu persetujuan Kepala Sub Divisi',
                'tag'    => 'approval',
                'divisi' => $units->firstWhere('id', $p->ownerUnitId)?->code ?? '-',
            ]);

        // Programs with critical blockers (via createdByUnitId path)
        $criticalBlockers = Blocker::query()
            ->whereNull('resolvedAt')
            ->whereIn('severity', ['CRITICAL', 'HIGH'])
            ->when(!$isExecutive, fn ($q) => $q->whereIn('createdByUnitId', $unitIds))
            ->limit(20)
            ->with('task.workstream.program:id,code,name,ownerUnitId')
            ->get()
            ->map(fn ($b) => $b->task?->workstream?->program)
            ->filter()
            ->unique('id')
            ->map(fn ($p) => [
                'id'     => $p->id,
                'code'   => $p->code,
                'name'   => $p->name,
                'reason' => 'Ada blocker kritis yang perlu eskalasi',
                'tag'    => 'blocker',
                'divisi' => $units->firstWhere('id', $p->ownerUnitId)?->code ?? '-',
            ]);

        // Programs with dukunganDibutuhkan filled + bad health = director support needed
        $needsSupport = $classified
            ->filter(fn ($p) => !empty($p['dukunganDibutuhkan']) && in_array($p['healthTone'], ['terlambat', 'overdue', 'at_risk']))
            ->filter(fn ($p) => $p['status'] !== 'COMPLETED')
            ->map(fn ($p) => [
                'id'     => $p['id'],
                'code'   => $p['code'],
                'name'   => $p['name'],
                'reason' => $p['dukunganDibutuhkan'],
                'tag'    => 'support',
                'divisi' => $units->firstWhere('id', $p['ownerUnitId'])?->code ?? '-',
            ]);

        // Cap dinaikkan 10 → 50: badge "Butuh Keputusan Anda" memakai count(needsAction),
        // dan list ini dirender penuh di Inbox. Cap 10 lama bikin badge understate (mentok
        // 10 walau antrian lebih banyak) + Inbox memotong item. Sumbernya sudah ber-bound
        // natural (criticalBlockers limit 20, sisanya scoped), 50 = pagar realistis. (Jun 2026)
        $needsAction = $pendingApproval
            ->concat($criticalBlockers)
            ->concat($needsSupport)
            ->unique('id')
            ->take(50)
            ->values();

        // ── 4. Stagnation Signal ────────────────────────────────────────────
        $stagnantPrograms = $programs
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
            ->whereIn('approvalStatus', ['ACTIVE'])
            ->filter(fn ($p) => $p->updatedAt && $p->updatedAt->lt($now->copy()->subDays(7)))
            ->map(fn ($p) => [
                'id'       => $p->id,
                'code'     => $p->code,
                'name'     => $p->name,
                'daysIdle' => (int) $p->updatedAt->diffInDays($now),
                'tone'     => $this->classifyProgramHealth($p, $now),
                'divisi'   => $units->firstWhere('id', $p->ownerUnitId)?->code ?? '-',
            ])
            ->sortByDesc('daysIdle')
            ->values();

        // ── 5. Blocker Signal per Division (scoped to visible units) ─────
        $allBlockers = Blocker::query()
            ->whereNull('resolvedAt')
            ->whereNotNull('createdByUnitId')
            ->whereIn('createdByUnitId', $unitIds)
            ->select(['severity', 'createdByUnitId'])
            ->get();

        $blockerSignal = $units->map(function ($unit) use ($allBlockers) {
            $divBlockers = $allBlockers->where('createdByUnitId', $unit->id);
            return [
                'unitId'   => $unit->id,
                'code'     => $unit->code,
                'critical' => $divBlockers->where('severity', 'CRITICAL')->count(),
                'high'     => $divBlockers->where('severity', 'HIGH')->count(),
                'medium'   => $divBlockers->where('severity', 'MEDIUM')->count(),
                'total'    => $divBlockers->count(),
            ];
        })->values();

        // ── 6. KPI Health Snapshot (scoped to programs in visible units) ──
        $programIds = $programs->pluck('id')->all();
        $kpis = KpiDefinition::query()
            ->whereNotNull('actualValue')
            ->whereIn('programId', $programIds)
            ->with('program:id,pilarStrategis,kelompok')
            ->get(['id', 'programId', 'actualValue', 'targetValue', 'warningThreshold', 'criticalThreshold']);

        [$kpiRed, $kpiYellow, $kpiGreen] = [0, 0, 0];
        $kpiByPilar = [];

        foreach ($kpis as $kpi) {
            $actual   = (float) $kpi->actualValue;
            $target   = (float) $kpi->targetValue;
            $critical = $kpi->criticalThreshold !== null ? (float) $kpi->criticalThreshold : $target * 0.8;
            $warning  = $kpi->warningThreshold  !== null ? (float) $kpi->warningThreshold  : $target * 0.95;

            if ($actual <= $critical)     { $status = 'RED';    $kpiRed++; }
            elseif ($actual <= $warning)  { $status = 'YELLOW'; $kpiYellow++; }
            else                          { $status = 'GREEN';  $kpiGreen++; }

            // pilarStrategis di-cast ke PilarStrategis enum di Program model.
            // Unwrap ke ->value sebelum dipakai sebagai array key — PHP throw
            // "Cannot access offset of type X in isset or empty" kalau enum
            // dipakai langsung sebagai key.
            $pilar = $kpi->program?->pilarStrategis?->value ?? 'LAINNYA';
            if (!isset($kpiByPilar[$pilar])) {
                $kpiByPilar[$pilar] = ['pilar' => $pilar, 'red' => 0, 'yellow' => 0, 'green' => 0, 'total' => 0];
            }
            $kpiByPilar[$pilar][strtolower($status)]++;
            $kpiByPilar[$pilar]['total']++;
        }

        $kpiHealth = [
            'total'   => $kpis->count(),
            'red'     => $kpiRed,
            'yellow'  => $kpiYellow,
            'green'   => $kpiGreen,
            'byPilar' => array_values($kpiByPilar),
        ];

        // ── 7. Momentum Signal ────────────────────────────────────────────
        $recentCompletedPrograms = $programs
            ->where('status', 'COMPLETED')
            ->filter(fn ($p) => $p->updatedAt && $p->updatedAt->gte($now->copy()->subDays(30)))
            ->count();

        $newProgramsThisMonth = $programs
            ->filter(fn ($p) => $p->createdAt && $p->createdAt->gte($now->copy()->subDays(30)))
            ->count();

        $tasksCompletedThisWeek = Task::query()
            ->where('status', 'COMPLETED')
            ->where('actualCompletion', '>=', $now->copy()->subDays(7))
            ->when(!$isExecutive, fn ($q) => $q->whereHas('workstream.program',
                fn ($q2) => $q2->whereIn('ownerUnitId', $unitIds)))
            ->count();

        $stagnantCount = $stagnantPrograms->count();
        $totalActive   = $programs->where('approvalStatus', 'ACTIVE')
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])->count();
        $activeRate    = $totalActive > 0 ? round((($totalActive - $stagnantCount) / $totalActive) * 100) : 100;

        $momentum = [
            'programsCompletedLast30d' => $recentCompletedPrograms,
            'newProgramsLast30d'       => $newProgramsThisMonth,
            'tasksCompletedThisWeek'   => $tasksCompletedThisWeek,
            'stagnantCount'            => $stagnantCount,
            'activeRate'               => $activeRate,
            'stagnantPrograms'         => $stagnantPrograms->values(),
        ];

        // ── 8. Velocity / Trend ────────────────────────────────────────────
        $snapshotService = app(ProgramSnapshotService::class);
        $snapshotService->saveToday($overallCounts, $byDivisi->toArray());
        $velocity = $snapshotService->velocity($overallCounts, $byDivisi->toArray());
        $trendSeries = $snapshotService->trendSeries(14);

        // ── Task counts per program — single aggregation query, no N+1 ────────
        $chartProgramIds = $classified
            ->filter(fn ($p) => $p['status'] !== 'COMPLETED' && $p['status'] !== 'CANCELLED')
            ->pluck('id')->all();

        $taskCountsByProgram = \DB::table('WorkItem')
            ->join('Initiative', 'WorkItem.initiativeId', '=', 'Initiative.id')
            ->whereIn('Initiative.programId', $chartProgramIds)
            ->whereNotIn('WorkItem.status', ['CANCELLED'])
            ->selectRaw('"Initiative"."programId", COUNT(*) as total, SUM(CASE WHEN "WorkItem".status IN (\'COMPLETED\', \'IN_REVIEW\') THEN 1 ELSE 0 END) as done')
            ->groupBy('Initiative.programId')
            ->get()
            ->keyBy('programId');

        // ── Programs for list panel — all non-completed, regardless of approval status ────
        $programsForChart = $classified
            ->filter(fn ($p) => $p['status'] !== 'COMPLETED' && $p['status'] !== 'CANCELLED')
            ->map(function ($p) use ($now, $units, $taskCountsByProgram) {
                $startDate = $p['startDate'] ? Carbon::parse($p['startDate']) : null;
                $endDate   = $p['targetEndDate'] ? Carbon::parse($p['targetEndDate']) : null;
                $unit      = $units->firstWhere('id', $p['ownerUnitId']);

                // Time elapsed %: how much of the planned timeline has been consumed
                $timeElapsedPct = null;
                if ($startDate && $endDate && $endDate->gt($startDate)) {
                    $totalDays   = $startDate->diffInDays($endDate);
                    $elapsedDays = $now->gt($startDate)
                        ? min($startDate->diffInDays($now), $totalDays)
                        : 0; // program belum dimulai
                    $timeElapsedPct = $totalDays > 0
                        ? min(100, max(0, (int) round($elapsedDays / $totalDays * 100)))
                        : null;
                }

                $updatedAt = isset($p['updated_at']) ? Carbon::parse($p['updated_at'])
                           : (isset($p['updatedAt']) ? Carbon::parse($p['updatedAt']) : null);

                return [
                    'id'              => $p['id'],
                    'code'            => $p['code'],
                    'name'            => $p['name'],
                    'progressPercent'    => $p['progressPercent'],
                    'daysRemaining'      => $endDate ? (int) $now->diffInDays($endDate, false) : null,
                    'targetEndDate'      => $endDate ? $endDate->format('d M Y') : null,
                    'healthTone'         => $p['healthTone'],
                    'divisi'             => $unit?->code ?? '-',
                    'timeElapsedPct'     => $timeElapsedPct,
                    'daysIdle'           => $updatedAt ? (int) $updatedAt->diffInDays($now) : null,
                    'ownerName'          => $p['owner']['name'] ?? null,
                    'priority'           => $p['priority'] ?? null,
                    'taskTotal'          => (int) ($taskCountsByProgram[$p['id']]->total ?? 0),
                    'taskDone'           => (int) ($taskCountsByProgram[$p['id']]->done ?? 0),
                    'progresTerkini'     => $p['progresTerkini'] ?? null,
                    'dukunganDibutuhkan' => $p['dukunganDibutuhkan'] ?? null,
                    'approvalStatus'     => $p['approvalStatus'] ?? null,
                ];
            })
            ->values();

        // ── 9. Control Alerts (open blockers sorted by severity) ─────────────
        $controls = Blocker::query()
            ->whereIn('status', ['OPEN', 'IN_PROGRESS'])
            ->when(!$isExecutive, fn ($q) => $q->whereIn('createdByUnitId', $unitIds))
            ->orderByRaw("CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END")
            ->limit(10)
            ->with('task.workstream.program:id,code,name')
            ->get(['id', 'code', 'title', 'status', 'severity'])
            ->map(fn ($b) => [
                'id'          => $b->id,
                'code'        => $b->code,
                'title'       => $b->title,
                'status'      => $b->status,
                'severity'    => $b->severity,
                'programId'   => $b->task?->workstream?->program?->id,
                'programCode' => $b->task?->workstream?->program?->code,
                'programName' => $b->task?->workstream?->program?->name,
            ])
            ->values();

        // ── 10. Top Blocker Programs (top 4 by open blocker count) ────────────
        $blockersByProgram = Blocker::query()
            ->whereIn('status', ['OPEN', 'IN_PROGRESS'])
            ->whereHas('task.workstream.program', fn ($q) =>
                $q->whereNull('archivedAt')
                  ->when(!$isExecutive, fn ($q2) => $q2->whereIn('ownerUnitId', $unitIds))
            )
            ->with('task.workstream.program:id,name,progressPercent,healthStatus,ownerUnitId')
            ->get()
            ->filter(fn ($b) => $b->task?->workstream?->program !== null)
            ->groupBy(fn ($b) => $b->task->workstream->program->id);

        $topBlockerPrograms = $blockersByProgram
            ->map(function ($blockers) {
                $program = $blockers->first()->task->workstream->program;
                return [
                    'id'              => $program->id,
                    'name'            => $program->name,
                    'progressPercent' => $program->progressPercent ?? 0,
                    'blockerCount'    => $blockers->count(),
                    'healthStatus'    => $program->healthStatus ?? 'YELLOW',
                ];
            })
            ->sortByDesc('blockerCount')
            ->take(4)
            ->values();

        // ── 11. Checkpoints (upcoming & overdue tasks, max 5 critical) ────────
        $checkpoints = Task::query()
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
            ->whereNotNull('targetCompletion')
            ->when(!$isExecutive, fn ($q) => $q->whereHas('workstream.program',
                fn ($q2) => $q2->whereIn('ownerUnitId', $unitIds)))
            ->where('targetCompletion', '<=', $now->copy()->addDays(30)->toDateString())
            ->orderByRaw('CASE WHEN "targetCompletion" < CURRENT_DATE THEN 0 ELSE 1 END, "targetCompletion" ASC')
            ->limit(5)
            ->get(['id', 'code', 'title', 'targetCompletion', 'status'])
            ->values();

        // ── 12. KPI Portfolio Trend (pctGreen per measurement date, last 14 periods) ─
        $kpiIds = $kpis->pluck('id')->all();
        $kpiTrend = [];
        if (!empty($kpiIds)) {
            $kpiDefsById = $kpis->keyBy('id');
            $kpiValues = KpiValue::query()
                ->whereIn('kpiDefinitionId', $kpiIds)
                ->where('measurementDate', '>=', $now->copy()->subDays(60))
                ->orderBy('measurementDate')
                ->get(['kpiDefinitionId', 'measurementDate', 'actualValue']);

            $byDate = $kpiValues->groupBy(fn ($v) => $v->measurementDate->toDateString());
            $kpiTrend = $byDate->map(function ($vals, $date) use ($kpiDefsById) {
                $green = 0; $total = 0;
                foreach ($vals as $v) {
                    $def = $kpiDefsById->get($v->kpiDefinitionId);
                    if (!$def) continue;
                    $actual  = (float) $v->actualValue;
                    $warning = $def->warningThreshold !== null ? (float) $def->warningThreshold : (float) $def->targetValue * 0.95;
                    if ($actual > $warning) $green++;
                    $total++;
                }
                return ['date' => $date, 'pctGreen' => $total > 0 ? (int) round($green / $total * 100) : 0];
            })->values()->sortBy('date')->take(14)->values()->all();
        }

        // ── 13. Recent Activity (synthetic feed: programs + kpi measurements + blockers) ─
        $recentProgramActivity = $programs
            ->filter(fn ($p) => $p->updatedAt && $p->updatedAt->gte($now->copy()->subDays(7)))
            ->sortByDesc('updatedAt')
            ->take(5)
            ->map(fn ($p) => [
                'id'              => $p->id,
                'entityType'      => 'PROGRAM',
                'entityId'        => $p->id,
                'action'          => match($p->approvalStatus) {
                    'ACTIVE'       => 'STATUS_CHANGED',
                    'COMPLETED'    => 'STATUS_CHANGED',
                    'PENDING_KASUB', 'PENDING_KADIV' => 'CREATED',
                    default        => 'STATUS_CHANGED',
                },
                'description'     => $p->name . ' updated',
                'changeTimestamp' => $p->updatedAt->toISOString(),
            ]);

        $recentKpiActivity = collect([]);
        if (!empty($kpiIds)) {
            $recentKpiActivity = KpiValue::query()
                ->whereIn('kpiDefinitionId', $kpiIds)
                ->where('createdAt', '>=', $now->copy()->subDays(7))
                ->with('kpiDefinition:id,name,programId')
                ->orderByDesc('createdAt')
                ->take(5)
                ->get()
                ->map(fn ($v) => [
                    'id'              => $v->id,
                    'entityType'      => 'PROGRAM',
                    'entityId'        => $v->kpiDefinition?->programId ?? 0,
                    'action'          => 'MEASURED',
                    'description'     => ($v->kpiDefinition?->name ?? 'KPI') . ' measured',
                    'changeTimestamp' => $v->createdAt->toISOString(),
                ]);
        }

        $recentBlockerActivity = Blocker::query()
            ->when(!$isExecutive, fn ($q) => $q->whereIn('createdByUnitId', $unitIds))
            ->where('createdAt', '>=', $now->copy()->subDays(7))
            ->orderByDesc('createdAt')
            ->take(5)
            ->get(['id', 'title', 'code', 'createdAt'])
            ->map(fn ($b) => [
                'id'              => $b->id,
                'entityType'      => 'TASK',
                'entityId'        => $b->id,
                'action'          => 'BLOCKER_ADDED',
                'description'     => $b->title ?? ($b->code ? "Blocker {$b->code}" : 'New blocker added'),
                'changeTimestamp' => $b->createdAt->toISOString(),
            ]);

        $recentActivity = $recentProgramActivity
            ->concat($recentKpiActivity)
            ->concat($recentBlockerActivity)
            ->sortByDesc('changeTimestamp')
            ->take(5)
            ->values();

        return [
            'scope'           => [
                'role'      => $role,
                'level'     => $orgScope->level,
                'name'      => $scopeName,
                'unitCount' => count($unitIds),
            ],
            'summary'           => $overallCounts,
            'byDivisi'          => $byDivisi,
            'taskLoad'          => $taskLoad,
            'scorecardHealth'   => $scorecardHealth,
            'deadlineClusters'  => $deadlineClusters,
            'needsAction'       => $needsAction,
            'stagnation'        => $stagnantPrograms,
            'blockerSignal'     => $blockerSignal,
            'kpiHealth'         => array_merge($kpiHealth, ['kpiTrend' => $kpiTrend]),
            'momentum'          => $momentum,
            'velocity'          => $velocity,
            'trendSeries'       => $trendSeries,
            'programsForChart'  => $programsForChart,
            'controls'          => $controls,
            'topBlockerPrograms'=> $topBlockerPrograms,
            'checkpoints'       => $checkpoints,
            'recentActivity'    => $recentActivity,
        ];
    }

    /**
     * Build "Kapasitas Tim" rows according to viewer's span of control.
     *
     * Returns Collection<int, array> matching DivisiTaskLoad shape:
     *   - kind: 'unit' | 'person'
     *   - unit | person: identity payload (one of the two)
     *   - head: KSUB person heading the unit (only when kind=unit)
     *   - isRollup: roll-up "Total Divisi" row (KADIV view only)
     *   - criticalThreshold: on-time % below which row is marked critical
     *     (50 for unit, 40 for person — individual variance is higher)
     *   - minSampleForCritical: floor of `done` count required to flag critical
     *     (0 for unit, 5 for person — small samples aren't reliable)
     */
    private function buildTaskLoad(User $viewer, string $scopeRole, $units, array $unitIds)
    {
        $role = strtoupper($viewer->roleType ?? '');
        $viewerUnitId = $viewer->unitId ? (int) $viewer->unitId : null;

        // Hide for leaf roles — no subordinates to manage
        if (in_array($role, ['ASISTEN', 'OFFICER'], true)) {
            return collect();
        }

        // KADIV / KASUBDIV → direct reports via managerUserId (org chart truth).
        // Sub-division identity isn't modeled as a separate OrganizationalUnit row;
        // the only durable scope marker is User.managerUserId. So we use that for
        // both levels — KADIV sees their KSUB reports, KSUB sees ASISTEN/OFFICER
        // reports. Each row aggregates the entire subtree below the direct report
        // (so a KSUB row in KADIV view reflects that sub-division's whole load).
        if (in_array($role, ['KADIV', 'KASUBDIV'], true)) {
            $directReports = User::query()
                ->where('managerUserId', $viewer->id)
                ->where('isActive', true)
                ->orderBy('name')
                ->get(['id', 'name', 'positionTitle', 'avatarUrl', 'roleType']);

            if ($directReports->isEmpty()) {
                // KADIV without direct reports → fall back to flat per-divisi
                // (better than empty panel — still useful for monitoring).
                // KSUB without reports → hide (no team to manage).
                return $role === 'KADIV' ? $this->buildFlatUnitLoad($units, $unitIds) : collect();
            }

            $subtreeMap = $this->buildSubordinateSubtreeMap($directReports->pluck('id')->all());
            $allUserIds = collect($subtreeMap)->flatten()->unique()->values()->all();

            // Pull `createdBy` too — needed for pool-officer assigner breakdown
            $tasks = Task::query()
                ->whereIn('assignedTo', $allUserIds)
                ->select(['status', 'assignedTo', 'createdBy', 'targetCompletion', 'actualCompletion'])
                ->get();

            $isKadiv = $role === 'KADIV';

            // Partition direct reports into "leaders" (KASUBDIV/ASISTEN — they
            // own a chain of work) vs "pool" (OFFICER — shared support resource).
            // Pool members are scoped organizationally to viewer but receive
            // tasks from multiple assigners (KSUB or any asisten).
            [$leaders, $pool] = $directReports->partition(
                fn ($u) => strtoupper($u->roleType ?? '') !== 'OFFICER'
            );

            $assignerMap = $this->resolveAssignerMap($tasks);

            $leaderRows = $leaders->map(function ($u) use ($tasks, $subtreeMap, $isKadiv) {
                $userIds = $subtreeMap[$u->id] ?? [$u->id];
                $userTasks = $tasks->whereIn('assignedTo', $userIds);
                return $this->buildLoadRow($userTasks, [
                    'kind'   => 'person',
                    'subjectRole' => 'leader',
                    'person' => [
                        'id'            => $u->id,
                        'name'          => $u->name,
                        'positionTitle' => $u->positionTitle,
                        'avatarUrl'     => $u->avatarUrl,
                        'roleType'      => $u->roleType,
                    ],
                    // KSUB rows aggregate a team — same threshold as a unit (50%).
                    // Individual ASISTEN rows use the stricter 40% / 5-sample floor.
                    'criticalThreshold'    => $isKadiv ? 50 : 40,
                    'minSampleForCritical' => $isKadiv ? 0 : 5,
                ]);
            });

            // Pool rows: officers receive task delegation from multiple sources.
            // Render with breakdown so KSUB sees demand distribution and can
            // intervene if one asisten over-pulls a single officer.
            $poolRows = $pool->map(function ($u) use ($tasks, $assignerMap) {
                $userTasks = $tasks->where('assignedTo', $u->id);
                $row = $this->buildLoadRow($userTasks, [
                    'kind'   => 'person',
                    'subjectRole' => 'pool',
                    'person' => [
                        'id'            => $u->id,
                        'name'          => $u->name,
                        'positionTitle' => $u->positionTitle,
                        'avatarUrl'     => $u->avatarUrl,
                        'roleType'      => $u->roleType,
                    ],
                    'criticalThreshold'    => 40,
                    'minSampleForCritical' => 5,
                ]);
                $row['assignerBreakdown'] = $this->buildAssignerBreakdown($userTasks, $assignerMap);
                return $row;
            });

            $rows = $leaderRows->merge($poolRows);

            // KADIV roll-up = sum of own division (all subordinates' tasks)
            if ($isKadiv) {
                $myUnit = $viewerUnitId ? OrganizationalUnit::find($viewerUnitId) : null;
                $rollupRow = $this->buildLoadRow($tasks, [
                    'kind'                 => 'unit',
                    'unit'                 => $myUnit ? $myUnit->only(['id', 'name', 'code']) : ['id' => $viewerUnitId, 'name' => 'Total Divisi', 'code' => '-'],
                    'head'                 => null,
                    'isRollup'             => true,
                    'criticalThreshold'    => 50,
                    'minSampleForCritical' => 0,
                ]);
                return collect([$rollupRow])->merge($rows)->values();
            }

            return $rows->values();
        }

        // BOD / ADMIN / SUPERADMIN (and any other) → flat per-division
        return $this->buildFlatUnitLoad($units, $unitIds);
    }

    /**
     * BFS the manager → subordinate tree. Returns map of rootId → flat list of
     * descendant user IDs (including the root itself). Used to aggregate task
     * load for a whole sub-team behind a single direct-report row.
     *
     * @param  array<int> $rootIds
     * @return array<int, array<int>>
     */
    private function buildSubordinateSubtreeMap(array $rootIds): array
    {
        if (empty($rootIds)) return [];

        $childrenByParent = [];
        $frontier = $rootIds;
        // Cap depth to prevent runaway loops on bad data (cycles or extreme depth).
        $maxDepth = 8;
        while (!empty($frontier) && $maxDepth-- > 0) {
            $children = User::query()
                ->whereIn('managerUserId', $frontier)
                ->where('isActive', true)
                ->select(['id', 'managerUserId'])
                ->get();
            if ($children->isEmpty()) break;
            foreach ($children as $c) {
                $childrenByParent[(int) $c->managerUserId][] = (int) $c->id;
            }
            $frontier = $children->pluck('id')->map(fn ($i) => (int) $i)->all();
        }

        $result = [];
        foreach ($rootIds as $rootId) {
            $rootId = (int) $rootId;
            $subtree = [$rootId];
            $stack = [$rootId];
            while (!empty($stack)) {
                $cur = array_pop($stack);
                foreach (($childrenByParent[$cur] ?? []) as $k) {
                    $subtree[] = $k;
                    $stack[] = $k;
                }
            }
            $result[$rootId] = array_values(array_unique($subtree));
        }
        return $result;
    }

    /** Flat per-division task load — original behavior for executive roles. */
    private function buildFlatUnitLoad($units, array $unitIds)
    {
        $tasks = Task::query()
            ->whereNotNull('createdByUnitId')
            ->whereIn('createdByUnitId', $unitIds)
            ->select(['status', 'createdByUnitId', 'targetCompletion', 'actualCompletion'])
            ->get();

        $unitHeads = User::query()
            ->where('roleType', 'KADIV')
            ->whereIn('unitId', $unitIds)
            ->select(['id', 'name', 'positionTitle', 'avatarUrl', 'unitId'])
            ->orderByDesc('id')
            ->get()
            ->keyBy('unitId');

        return $units->map(function ($unit) use ($tasks, $unitHeads) {
            $divTasks = $tasks->where('createdByUnitId', $unit->id);
            $head = $unitHeads->get($unit->id);
            return $this->buildLoadRow($divTasks, [
                'kind' => 'unit',
                'unit' => $unit->only(['id', 'name', 'code']),
                'head' => $head ? [
                    'id'            => $head->id,
                    'name'          => $head->name,
                    'positionTitle' => $head->positionTitle,
                    'avatarUrl'     => $head->avatarUrl,
                ] : null,
                'criticalThreshold'    => 50,
                'minSampleForCritical' => 0,
            ]);
        })->values();
    }

    /** Build a single DivisiTaskLoad-shaped row from a task collection + identity meta. */
    private function buildLoadRow($rowTasks, array $meta): array
    {
        $completed = $rowTasks->whereIn('status', ['COMPLETED', 'IN_REVIEW']);
        $onTime = $completed->filter(
            fn ($t) => $t->actualCompletion && $t->targetCompletion && $t->actualCompletion <= $t->targetCompletion
        )->count();
        $doneCount = $completed->count();

        return [
            'kind'                 => $meta['kind'],
            'subjectRole'          => $meta['subjectRole'] ?? null,
            'unit'                 => $meta['unit'] ?? null,
            'person'               => $meta['person'] ?? null,
            'head'                 => $meta['head'] ?? null,
            'isRollup'             => $meta['isRollup'] ?? false,
            'criticalThreshold'    => $meta['criticalThreshold'],
            'minSampleForCritical' => $meta['minSampleForCritical'],
            'total'                => $rowTasks->count(),
            'active'               => $rowTasks->whereIn('status', ['IN_PROGRESS', 'READY'])->count(),
            'done'                 => $doneCount,
            'blocked'              => $rowTasks->where('status', 'BLOCKED')->count(),
            'backlog'              => $rowTasks->where('status', 'BACKLOG')->count(),
            'overdue'              => $rowTasks->whereNotIn('status', ['COMPLETED', 'IN_REVIEW'])
                ->filter(fn ($t) => $t->targetCompletion && $t->targetCompletion < now())->count(),
            'onTimeCount'          => $onTime,
            'lateCount'            => $doneCount - $onTime,
            'onTimeRate'           => $doneCount > 0 ? round($onTime / $doneCount * 100) : null,
            'assignerBreakdown'    => $meta['assignerBreakdown'] ?? null,
        ];
    }

    /**
     * Resolve assigner names for a task collection in one query (avoid N+1).
     * Returns map of userId → user mini-object.
     *
     * @return array<int, array{id:int,name:string,roleType:string}>
     */
    private function resolveAssignerMap($tasks): array
    {
        $assignerIds = $tasks->pluck('createdBy')->filter()->unique()->values()->all();
        if (empty($assignerIds)) return [];
        return User::query()
            ->whereIn('id', $assignerIds)
            ->select(['id', 'name', 'roleType'])
            ->get()
            ->mapWithKeys(fn ($u) => [(int) $u->id => [
                'id'       => (int) $u->id,
                'name'     => $u->name,
                'roleType' => $u->roleType,
            ]])
            ->all();
    }

    /**
     * Group a pool member's tasks by who assigned them.
     * Returns top-3 assigners by task count, descending — keeps card compact.
     *
     * @return array<int, array{id:int,name:string,count:int}>
     */
    private function buildAssignerBreakdown($userTasks, array $assignerMap): array
    {
        return $userTasks
            ->groupBy('createdBy')
            ->map(fn ($group, $assignerId) => [
                'id'    => (int) $assignerId,
                'name'  => $assignerMap[(int) $assignerId]['name'] ?? 'Tidak diketahui',
                'count' => $group->count(),
            ])
            ->sortByDesc('count')
            ->take(3)
            ->values()
            ->all();
    }

    private function classifyProgramHealth(Program $p, Carbon $now): string
    {
        if ($p->status === 'COMPLETED' || $p->approvalStatus === 'COMPLETED') return 'selesai';
        // DRAFT/PENDING programs not yet in execution — don't mix with operational health
        if (empty($p->approvalStatus) || !in_array($p->approvalStatus, ['ACTIVE', 'COMPLETED'])) return 'draft';
        if ($p->targetEndDate && $now->gt($p->targetEndDate)) return 'overdue';
        if ($p->healthStatus === 'RED') return 'terlambat';
        if ($p->healthStatus === 'GREEN') return 'on_track';
        return 'at_risk'; // YELLOW or NULL defaults to at_risk
    }

    private function toneLabel(string $tone): string
    {
        return match ($tone) {
            'selesai'   => 'Selesai',
            'overdue'   => 'Lewat Tenggat',
            'terlambat' => 'Terlambat',
            'on_track'  => 'On Track',
            default     => 'At Risk',
        };
    }

    /** @param \Illuminate\Support\Collection $programs */
    private function buildCounts($programs): array
    {
        $total     = $programs->count();
        $onTrack   = $programs->where('healthTone', 'on_track')->count();
        $atRisk    = $programs->where('healthTone', 'at_risk')->count();
        $terlambat = $programs->where('healthTone', 'terlambat')->count();
        $overdue   = $programs->where('healthTone', 'overdue')->count();
        $selesai   = $programs->where('healthTone', 'selesai')->count();
        $draft     = $programs->where('healthTone', 'draft')->count();

        // Operational total: excludes draft (not yet in execution)
        $operational = $total - $draft;
        $pct = fn (int $n) => $operational > 0 ? round($n / $operational * 100) : 0;

        return [
            'total'        => $total,
            'onTrack'      => $onTrack,
            'atRisk'       => $atRisk,
            'terlambat'    => $terlambat,
            'overdue'      => $overdue,
            'selesai'      => $selesai,
            'draft'        => $draft,        // pipeline — belum aktif
            'pctOnTrack'   => $pct($onTrack),
            'pctAtRisk'    => $pct($atRisk),
            'pctTerlambat' => $pct($terlambat + $overdue),
            'pctSelesai'   => $pct($selesai),
        ];
    }

    // ── Directorates ──────────────────────────────────────────────────────────

    public function directorates()
    {
        $dirs = Directorate::orderBy('code')->get()
            ->map(fn ($d) => [
                ...$d->toArray(),
                'unitCount' => OrganizationalUnit::where('directorateId', $d->id)->count(),
            ])->values();

        return response()->json(['data' => $dirs]);
    }

    public function storeDirectorate(Request $request): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => 'required|string|min:2|max:40|unique:Directorate,code',
            'name' => 'required|string|min:2|max:120',
            'shortName' => 'nullable|string|max:40',
            'domain' => 'nullable|string|max:120',
            'isActive' => 'boolean',
        ]);
        $dir = Directorate::create($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $dir], 201);
        }

        return back()->with('success', 'Direktorat dibuat.');
    }

    public function updateDirectorate(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => "sometimes|string|min:2|max:40|unique:Directorate,code,{$id}",
            'name' => 'sometimes|string|min:2|max:120',
            'shortName' => 'nullable|string|max:40',
            'domain' => 'nullable|string|max:120',
            'isActive' => 'sometimes|boolean',
        ]);
        $dir = Directorate::findOrFail($id);
        $dir->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $dir->fresh()]);
        }

        return back()->with('success', 'Direktorat diperbarui.');
    }

    public function destroyDirectorate(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        Directorate::findOrFail($id)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Direktorat dihapus.');
    }

    // ── Units ─────────────────────────────────────────────────────────────────

    public function units()
    {
        $units = OrganizationalUnit::with('directorate:id,code,name')->orderBy('code')->get();
        return response()->json(['data' => $units, 'total' => $units->count()]);
    }

    public function storeUnit(Request $request): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => 'required|string|min:2|max:40|unique:OrganizationalUnit,code',
            'name' => 'required|string|min:2|max:120',
            'description' => 'nullable|string|max:400',
            'unitType' => 'required|string|max:40',
            'directorateId' => 'nullable|integer',
            'parentId' => 'nullable|integer',
            'isActive' => 'boolean',
        ]);
        $unit = OrganizationalUnit::create($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $unit], 201);
        }

        return back()->with('success', 'Unit dibuat.');
    }

    public function updateUnit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => "sometimes|string|min:2|max:40|unique:OrganizationalUnit,code,{$id}",
            'name' => 'sometimes|string|min:2|max:120',
            'description' => 'nullable|string|max:400',
            'unitType' => 'sometimes|string|max:40',
            'directorateId' => 'nullable|integer',
            'parentId' => 'nullable|integer',
            'isActive' => 'sometimes|boolean',
        ]);
        $unit = OrganizationalUnit::findOrFail($id);
        $unit->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $unit->fresh()]);
        }

        return back()->with('success', 'Unit diperbarui.');
    }

    public function destroyUnit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        OrganizationalUnit::findOrFail($id)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Unit dihapus.');
    }

    // ── Positions ─────────────────────────────────────────────────────────────

    public function positions()
    {
        $positions = Position::with([
            'directorate:id,code,name',
            'division:id,code,name',
            'users' => fn ($q) => $q->whereRaw('"isActive" IS TRUE')->select('id','name','roleType','positionId'),
        ])->orderBy('seatOrder')->get()
            ->map(fn ($p) => [
                ...$p->toArray(),
                'title'         => $p->name,
                'unit'          => $p->division,
                'level'         => $p->levelCode ? (int) filter_var($p->levelCode, FILTER_SANITIZE_NUMBER_INT) : null,
                'currentHolder' => $p->users->first(),
            ])->values();

        return response()->json(['data' => $positions, 'total' => $positions->count()]);
    }

    public function storePosition(Request $request): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => 'required|string|min:2|max:40|unique:Position,code',
            'name' => 'required|string|min:2|max:120',
            'levelCode' => 'required|string|max:20',
            'roleType' => 'required|string',
            'directorateId' => 'nullable|integer',
            'divisionId' => 'nullable|integer',
            'reportsToPositionId' => 'nullable|integer',
            'seatOrder' => 'nullable|integer',
            'isActive' => 'boolean',
        ]);
        $position = Position::create($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $position], 201);
        }

        return back()->with('success', 'Jabatan dibuat.');
    }

    public function updatePosition(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'name' => 'sometimes|string|min:2|max:120',
            'levelCode' => 'sometimes|string|max:20',
            'roleType' => 'sometimes|string',
            'directorateId' => 'nullable|integer',
            'divisionId' => 'nullable|integer',
            'reportsToPositionId' => 'nullable|integer',
            'seatOrder' => 'nullable|integer',
            'isActive' => 'sometimes|boolean',
        ]);
        $position = Position::findOrFail($id);
        $position->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $position->fresh()]);
        }

        return back()->with('success', 'Jabatan diperbarui.');
    }

    public function destroyPosition(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        // Unassign users from this position first
        User::where('positionId', $id)->update(['positionId' => null]);
        Position::findOrFail($id)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Jabatan dihapus.');
    }

    public function assignPosition(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'userId' => 'nullable|integer',
            'mutationType' => 'nullable|string',
            'mutationReason' => 'nullable|string',
            'skNumber' => 'nullable|string',
        ]);

        $position = Position::findOrFail($id);

        // Unassign previous holder
        User::where('positionId', $id)->update(['positionId' => null]);

        if ($data['userId']) {
            $user = User::findOrFail($data['userId']);
            $user->update(['positionId' => $id]);

            // Record history
            PositionHistory::create([
                'userId' => $user->id,
                'positionId' => $id,
                'startDate' => now(),
                'mutationType' => $data['mutationType'] ?? 'reassignment',
                'mutationReason' => $data['mutationReason'] ?? null,
                'skNumber' => $data['skNumber'] ?? null,
                'createdBy' => $request->user()->id,
            ]);
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $position->fresh(['users' => fn ($q) => $q->whereRaw('"isActive" IS TRUE')])]);
        }

        return back()->with('success', 'Penugasan jabatan disimpan.');
    }
}
