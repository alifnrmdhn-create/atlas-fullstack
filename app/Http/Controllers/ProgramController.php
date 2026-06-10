<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\ChannelMember;
use App\Models\ChannelMessage;
use App\Models\EntityPic;
use App\Models\KpiDefinition;
use App\Models\Notification;
use App\Models\Program;
use App\Models\ProgramApprovalLog;
use App\Models\ProgramProgressLog;
use App\Models\ProgramKpiLink;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use App\Services\BroadcastService;
use App\Services\OrgChainService;
use App\Services\ProgramHealthService;
use App\Services\ProgramService;
use App\Services\WeeklyDeadlineService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ProgramController extends Controller
{
    public function __construct(
        private ProgramService $programService,
        private ProgramHealthService $healthService,
        private OrgChainService $orgChain,
        private WeeklyDeadlineService $weeklyDeadline,
    ) {}

    private function validationError(Request $request, string $message): JsonResponse|RedirectResponse
    {
        if ($request->expectsJson()) {
            return response()->json([
                'message' => $message,
                'errors' => ['general' => [$message]],
            ], 422);
        }

        return back()->withErrors([$message]);
    }

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        if ($request->expectsJson() && $request->query('page')) {
            $paginated = $this->programService->listForUserPaginated(
                $request->user(),
                (int) $request->query('perPage', 50)
            );
            return response()->json([
                'data' => $paginated->items(),
                'meta' => [
                    'total'       => $paginated->total(),
                    'perPage'     => $paginated->perPage(),
                    'currentPage' => $paginated->currentPage(),
                    'lastPage'    => $paginated->lastPage(),
                ],
            ]);
        }

        $programs = $this->programService->listForUser($request->user());
        if ($request->expectsJson()) {
            return response()->json(['data' => $programs, 'total' => $programs->count()]);
        }

        return Inertia::render('ProgramsView', ['programs' => $programs]);
    }

    public function archived(Request $request)
    {
        Gate::authorize('view-archive');
        $programs = $this->programService->listArchived($request->user());
        if ($request->expectsJson()) {
            return response()->json(['data' => $programs, 'total' => $programs->count()]);
        }

        return Inertia::render('Programs/Archived', ['programs' => $programs]);
    }

    public function show(Request $request, int $id)
    {
        $this->programService->assertAccess($request->user(), $id);
        $program = $this->programService->findOrFail($id);
        // Inject computed approval-flow fields. Dilakukan controller-level
        // (bukan model accessor) supaya tidak menambah query di endpoint list
        // yang serialize banyak program sekaligus — di sini cost-nya tertanggung.
        $payload = $program->toArray();
        $payload['pendingReviewer'] = $this->resolvePendingReviewer($program);
        $payload['pendingSinceAt'] = $this->resolvePendingSinceAt($program);
        $payload['activatedAt'] = $this->resolveActivatedAt($program);

        if ($request->expectsJson()) {
            return response()->json(['data' => $payload]);
        }

        return Inertia::render('ProgramDetailView', ['program' => $payload]);
    }

    // ── API-style JSON endpoints (Inertia router calls these via router.get()) ──

    public function timelineAll(Request $request)
    {
        return response()->json([
            'data' => $this->programService->timelineAll($request->user()),
        ]);
    }

    public function executionPulse(Request $request)
    {
        return response()->json([
            'data' => $this->programService->executionPulse($request->user()),
        ]);
    }

    /**
     * Execution Achievement — program-level rollup % achievement dari
     * planned vs realized weeks (auto-derive per task status + percentComplete,
     * sama logic dengan ExecutionGridController::buildSteps).
     *
     * % achievement = actual-so-far / planned-so-far (capped at current week).
     * Per workstream breakdown disertakan untuk drill-down.
     */
    public function executionAchievement(Request $request, int $id): JsonResponse
    {
        $this->programService->assertAccess($request->user(), $id);

        $currentWeek = now()->format('o-\WW');

        $workstreams = Workstream::query()
            ->where('programId', $id)
            ->orderBy('id')
            ->get(['id', 'code', 'name']);

        $totalPlanned = 0;
        $totalActual = 0;
        $totalPlannedSoFar = 0;
        $totalActualSoFar = 0;
        $byWorkstream = [];

        foreach ($workstreams as $ws) {
            $tasks = Task::query()
                ->where('initiativeId', $ws->id)
                ->get(['id', 'status', 'percentComplete', 'plannedWeeks', 'actualWeeks']);

            $wsPlanned = 0; $wsActual = 0;
            $wsPlannedSoFar = 0; $wsActualSoFar = 0;

            foreach ($tasks as $task) {
                $planned = collect($task->plannedWeeks ?? [])->sort()->values()->all();
                $totalPlannedTask = count($planned);

                // Mirror logic dari ExecutionGridController::buildSteps
                $storedActual = $task->actualWeeks;
                if ($storedActual === null) {
                    $pct = (int) ($task->percentComplete ?? 0);
                    if (in_array($task->status, ['COMPLETED', 'IN_REVIEW'], true)) {
                        $actual = $planned;
                    } elseif ($task->status === 'IN_PROGRESS' && $pct > 0 && $totalPlannedTask > 0) {
                        $n = (int) round(($pct / 100) * $totalPlannedTask);
                        $n = max(1, min($n, $totalPlannedTask));
                        $actual = array_slice($planned, 0, $n);
                    } else {
                        $actual = [];
                    }
                } else {
                    $actual = $storedActual ?? [];
                }

                $wsPlanned += $totalPlannedTask;
                $wsActual += count($actual);
                $wsPlannedSoFar += count(array_filter($planned, fn ($w) => $w <= $currentWeek));
                $wsActualSoFar += count(array_filter($actual, fn ($w) => $w <= $currentWeek));
            }

            $byWorkstream[] = [
                'id' => $ws->id,
                'code' => $ws->code,
                'name' => $ws->name,
                'plannedTotal' => $wsPlanned,
                'actualTotal' => $wsActual,
                'plannedSoFar' => $wsPlannedSoFar,
                'actualSoFar' => $wsActualSoFar,
                'achievement' => $wsPlannedSoFar > 0
                    ? (int) round(($wsActualSoFar / $wsPlannedSoFar) * 100)
                    : null,
            ];

            $totalPlanned += $wsPlanned;
            $totalActual += $wsActual;
            $totalPlannedSoFar += $wsPlannedSoFar;
            $totalActualSoFar += $wsActualSoFar;
        }

        return response()->json(['data' => [
            'programId' => $id,
            'currentWeek' => $currentWeek,
            'plannedTotal' => $totalPlanned,
            'actualTotal' => $totalActual,
            'plannedSoFar' => $totalPlannedSoFar,
            'actualSoFar' => $totalActualSoFar,
            'achievement' => $totalPlannedSoFar > 0
                ? (int) round(($totalActualSoFar / $totalPlannedSoFar) * 100)
                : null,
            'byWorkstream' => $byWorkstream,
        ]]);
    }

    public function health(Request $request, int $id)
    {
        $this->programService->assertAccess($request->user(), $id);
        $program = Program::query()->where('id', $id)->first(['id', 'healthStatus', 'progressPercent']);
        $kpis = $program
            ? $program->kpis()
                ->whereNotNull('actualValue')
                ->whereNotNull('targetValue')
                ->get(['actualValue', 'targetValue', 'warningThreshold', 'criticalThreshold'])
            : collect();

        $redCount = $yellowCount = 0;
        foreach ($kpis as $k) {
            $status = ProgramHealthService::kpiStatus(
                (float) $k->actualValue,
                (float) $k->targetValue,
                $k->criticalThreshold !== null ? (float) $k->criticalThreshold : null,
                $k->warningThreshold  !== null ? (float) $k->warningThreshold  : null,
            );
            if ($status === 'RED')    $redCount++;
            elseif ($status === 'YELLOW') $yellowCount++;
        }

        $kpiHealth = $kpis->isEmpty() ? null
            : ($redCount >= 2 ? 'RED'
            : ($redCount >= 1 || $yellowCount >= 1 ? 'YELLOW' : 'GREEN'));

        return response()->json(['data' => [
            'programId' => $id,
            'healthStatus' => $program?->healthStatus ?? 'YELLOW',
            'progressPercent' => $program?->progressPercent ?? 0,
            'kpiHealth' => $kpiHealth,
            'kpiTotal' => $kpis->count(),
            'kpiRedCount' => $redCount,
            'kpiYellowCount' => $yellowCount,
        ]]);
    }

    public function workstreams(Request $request, int $id)
    {
        $this->programService->assertAccess($request->user(), $id);
        return response()->json([
            'data' => $this->programService->workstreamsForGrid($id),
        ]);
    }

    public function kpiLinks(Request $request, int $id)
    {
        $this->programService->assertAccess($request->user(), $id);
        $links = ProgramKpiLink::query()->where('programId', $id)->orderBy('createdAt')->get();
        return response()->json(['data' => $links]);
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        Gate::authorize('create-program');

        $data = $request->validate([
            'code' => 'nullable|string|max:40|unique:Program,code',
            'name' => 'required|string|max:200',
            'description' => 'nullable|string|max:2000',
            'strategicObjective' => 'nullable|string|max:1000',
            'startDate' => 'required|date',
            'targetEndDate' => 'required|date|after:startDate',
            'status' => 'nullable|string|max:40',
            'priority' => 'in:LOW,MEDIUM,HIGH,CRITICAL',
            'ownerId' => 'nullable|integer|exists:User,id',
            'ownerUnitId' => 'nullable|integer|exists:OrganizationalUnit,id',
            'budgetIdr' => 'nullable|numeric',
            'picPersonIds' => 'nullable|array',
            'picPersonIds.*' => 'integer|exists:User,id',
            'hasNoApmsKpi' => 'nullable|boolean',
            'kelompok' => 'nullable|in:SCORECARD,NON_SCORECARD',
            'pilarStrategis' => 'nullable|in:' . implode(',', array_keys(config('atlas-thresholds.pillars', []))),
            'progresTerkini' => 'nullable|string|max:2000',
            'dukunganDibutuhkan' => 'nullable|string|max:2000',
        ]);

        // Cegah melempar kepemilikan ke user di luar scope (non-admin).
        $this->programService->assertCanAssignOwner($request->user(), $data['ownerId'] ?? null);

        $program = $this->programService->create($request->user(), $data);
        BroadcastService::program($program->id, 'created');

        if ($request->expectsJson()) {
            return response()->json(['data' => $program], 201);
        }

        return redirect()->route('programs.show', $program->id)
            ->with('success', 'Program created.');
    }

    /**
     * "Commitment fields" — field yang merepresentasikan janji yang KADIV
     * setujui di approval. Perubahan field ini setelah ACTIVE TIDAK di-block,
     * tapi di-log + KADIV dinotifikasi (Opsi A governance: transparency over
     * gate-keeping). Field detail (description, picPersons, progres update,
     * dll) free-edit tanpa notif.
     */
    private const COMMITMENT_FIELDS = [
        'targetEndDate', 'startDate', 'priority',
        'budgetIdr', 'kelompok', 'pilarStrategis',
    ];

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('edit-program', $program);

        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);
        if (!$isAdmin && in_array($program->approvalStatus, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            return $this->validationError($request, 'The program is currently under approval and cannot be modified.');
        }

        // Inject existing startDate so targetEndDate can be validated against it even when not in request
        $request->mergeIfMissing(['startDate' => $program->startDate?->toDateString()]);

        $data = $request->validate([
            // 'sometimes|required' = boleh tidak dikirim, tapi kalau dikirim tidak
            // boleh kosong. Sinkron dengan FE yang punya HTML `required` di input.
            'name' => 'sometimes|required|string|min:1|max:200',
            'description' => 'nullable|string|max:2000',
            'strategicObjective' => 'nullable|string|max:1000',
            'startDate' => 'sometimes|date',
            'targetEndDate' => 'sometimes|date|after_or_equal:startDate',
            'priority' => 'sometimes|in:LOW,MEDIUM,HIGH,CRITICAL',
            'budgetIdr' => 'nullable|numeric|min:0',
            'linkedChannelId' => 'nullable|integer|exists:Channel,id',
            'picPersonIds' => 'nullable|array',
            'picPersonIds.*' => 'integer|exists:User,id',
            'ownerId' => 'nullable|integer|exists:User,id',
            'kelompok' => 'nullable|in:SCORECARD,NON_SCORECARD',
            'pilarStrategis' => 'nullable|in:' . implode(',', array_keys(config('atlas-thresholds.pillars', []))),
            'progresTerkini' => 'nullable|string|max:2000',
            'dukunganDibutuhkan' => 'nullable|string|max:2000',
        ]);

        // Cegah reassignment owner ke luar scope (non-admin). Hanya cek bila
        // ownerId benar-benar berubah — jangan blok no-op edit yang mengirim
        // ulang ownerId existing (mis. co-PIC menyimpan field lain).
        if (array_key_exists('ownerId', $data)
            && (int) ($data['ownerId'] ?? 0) !== (int) $program->ownerId) {
            $this->programService->assertCanAssignOwner($request->user(), $data['ownerId'] ?? null);
        }

        // Snapshot SEBELUM update — kalau program ACTIVE, deteksi perubahan
        // commitment field untuk audit log + notif KADIV (Opsi A governance).
        $wasActive = $program->approvalStatus === 'ACTIVE';
        $commitmentChanges = $wasActive ? $this->detectCommitmentChanges($program, $data) : [];

        $program = $this->programService->update($id, $data);
        $this->healthService->recompute($id);
        BroadcastService::program($id, 'updated');

        if (!empty($commitmentChanges)) {
            $this->logCommitmentChanges($program, $commitmentChanges, $request->user());
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $program]);
        }

        return back()->with('success', 'Program updated.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('delete-program', $program);
        $this->programService->delete($id);
        BroadcastService::program($id, 'deleted');

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return redirect()->route('programs.index')->with('success', 'Program deleted.');
    }

    public function submit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        $user = $request->user();
        $role = strtoupper($user->roleType);

        if (!in_array($user->id, [$program->submittedById, $program->ownerId], true)
            && !in_array($role, ['SUPERADMIN', 'ADMIN'], true)) {
            abort(403, 'Only the program PIC or creator can submit it for approval');
        }
        if ($program->approvalStatus !== 'DRAFT') {
            return $this->validationError($request, 'Only programs with the DRAFT status can be submitted.');
        }
        if (in_array($role, ['KADIV', 'SUPERADMIN', 'ADMIN'], true)) {
            return $this->validationError($request, 'KADIV/Admin should use the "Start Execution" button to activate the program.');
        }

        $prevStatus = $program->approvalStatus;
        $nextStatus = $role === 'KASUBDIV' ? 'PENDING_KADIV' : 'PENDING_KASUB';
        $targetRole = $nextStatus === 'PENDING_KADIV' ? 'KADIV' : 'KASUBDIV';

        // Anti-deadlock: kalau rantai managerUserId submitter tidak memuat
        // reviewer ber-role target, program akan masuk PENDING tanpa SIAPA PUN
        // yang bisa approve (assertIsLegitimateReviewer menolak semua non-admin,
        // notifikasi pun kosong — nyangkut diam-diam). Tolak di muka dengan
        // pesan yang actionable; admin memperbaiki data org dulu.
        $reviewerIds = $this->resolveReviewerIds($user, $targetRole);
        if ($reviewerIds === []) {
            return $this->validationError($request, "No {$targetRole} found in your reporting line — ask an admin to fix your organization chain before submitting.");
        }

        $program->update(['approvalStatus' => $nextStatus, 'rejectionNote' => null, 'submittedById' => $user->id]);
        ProgramApprovalLog::record($id, 'SUBMITTED', $prevStatus, $nextStatus, $user->id, $user->name);
        BroadcastService::program($id, 'updated', ['approvalStatus' => $nextStatus]);

        $this->notifyApprovalEvent(
            program: $program,
            recipientIds: $reviewerIds,
            type: 'PROGRAM_NEEDS_APPROVAL',
            message: "Program \"{$program->name}\" is awaiting your approval.",
            excludeUserId: $user->id,
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', "Program submitted for approval.");
    }

    public function activate(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $role = strtoupper($request->user()->roleType);
        if (!in_array($role, ['KADIV', 'SUPERADMIN', 'ADMIN'], true)) {
            abort(403, 'Only KADIV/Admin can activate a program directly.');
        }
        $program = Program::findOrFail($id);
        // Scope guard: KADIV hanya boleh mengaktifkan program direktoratnya
        // sendiri (approve/reject sudah ber-org-chain; activate sebelumnya hanya
        // cek role → KADIV direktorat A bisa aktifkan program direktorat B).
        $this->assertCoversProgramUnit($program, $request->user());
        if ($program->approvalStatus !== 'DRAFT') {
            return $this->validationError($request, 'Only DRAFT programs can be activated.');
        }
        // Block direct activation while program is in revision (just rejected).
        // PIC harus memperbaiki & resubmit dulu — KADIV tidak boleh mem-bypass
        // koreksi yang baru saja diminta sendiri lewat tombol "Mulai Eksekusi".
        if (!empty($program->rejectionNote) && !RolePolicy::isAdminOrAbove($request->user()->roleType)) {
            return $this->validationError($request, 'The program was just rejected — the PIC must revise and resubmit it before activation.');
        }
        $prevStatus = $program->approvalStatus;
        $program->update(['approvalStatus' => 'ACTIVE', 'rejectionNote' => null]);
        ProgramApprovalLog::record($id, 'ACTIVATED', $prevStatus, 'ACTIVE', $request->user()->id, $request->user()->name);
        BroadcastService::program($id, 'approved');

        // Sprint 5 — Plan→Do handoff (+enhancement 2026-05: post ke linkedChannel)
        $this->notifyProgramActivation($program, $request->user());

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', 'Program activated — execution has started.');
    }

    /**
     * Plan→Do handoff saat program transition ke ACTIVE.
     *
     * Dua channel awareness:
     *  1. Notifikasi personal ke setiap stakeholder yang perlu tahu —
     *     gabungan dari task assignee, PIC personnel Program, Workstream
     *     owner, dan Program owner. Dedupe + skip activator. Pesan
     *     menyesuaikan: kalau user punya task ter-assign, sebut count-nya;
     *     kalau tidak, message generic "eksekusi dimulai".
     *  2. Kalau program punya linkedChannelId, post satu system message
     *     ke channel program — semua member channel langsung tahu tanpa
     *     menunggu notification panel di-buka.
     *
     * Semua dibungkus rescue() — failure di notifikasi tidak boleh
     * memblokir aksi utama (status sudah berubah ke ACTIVE).
     */
    private function notifyProgramActivation(Program $program, User $activator): void
    {
        // ── (1) Notifikasi personal ──
        rescue(function () use ($program, $activator) {
            $taskRows = Task::query()
                ->whereHas('workstream', fn ($q) => $q->where('programId', $program->id))
                ->whereNotNull('assignedTo')
                ->get(['assignedTo']);
            $taskCountByUser = $taskRows->groupBy('assignedTo')->map(fn ($g) => $g->count());

            $picUserIds = EntityPic::query()
                ->where('entityType', 'Program')
                ->where('entityId', $program->id)
                ->pluck('userId')->all();

            $workstreamOwners = Workstream::query()
                ->where('programId', $program->id)
                ->whereNotNull('ownerId')
                ->pluck('ownerId')->all();

            $ownerIds = $program->ownerId ? [$program->ownerId] : [];

            $allRecipients = collect([
                ...array_keys($taskCountByUser->toArray()),
                ...$picUserIds,
                ...$workstreamOwners,
                ...$ownerIds,
            ])
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->reject(fn ($id) => $id === $activator->id)
                ->values();

            foreach ($allRecipients as $userId) {
                $taskCount = (int) ($taskCountByUser[$userId] ?? 0);
                $message = $taskCount > 0
                    ? "Program {$program->name} is active. {$taskCount} tasks in your pipeline."
                    : "Program {$program->name} is active — execution has started.";

                $notif = Notification::create([
                    'userId' => $userId,
                    'type' => 'PROGRAM_TASKS_ASSIGNED',
                    'message' => $message,
                    'source' => "program:{$program->id}",
                    'createdAt' => now(),
                    'state' => 'UNREAD',
                ]);

                // Frontend handler reads event.notification.id — payload MUST wrap the model row.
                BroadcastService::toUsers('notification:created', [
                    'notification' => $notif,
                ], [$userId]);
            }
        });

        // ── (2) Post message ke channel program (kalau di-link) ──
        if ($program->linkedChannelId) {
            rescue(function () use ($program, $activator) {
                $taskCount = Task::query()
                    ->whereHas('workstream', fn ($q) => $q->where('programId', $program->id))
                    ->count();

                $tail = $taskCount > 0
                    ? "{$taskCount} tasks are ready for the team to execute."
                    : 'The team can start adding tasks to the workstream.';
                $content = "🚀 Program *{$program->name}* is active — execution has started. {$tail}";

                $msg = ChannelMessage::create([
                    'channelId' => $program->linkedChannelId,
                    'userId' => $activator->id,
                    'content' => $content,
                    'attachments' => null,
                    'parentMessageId' => null,
                    'replyCount' => 0,
                    'isPinned' => false,
                    'isEdited' => false,
                    'searchableText' => mb_strtolower($content),
                ]);

                $msg->load('author:id,name,avatarUrl,roleType,positionTitle');
                $memberIds = ChannelMember::query()
                    ->where('channelId', $program->linkedChannelId)
                    ->pluck('userId')->all();

                BroadcastService::toUsers('channel:message:created', [
                    'channelId' => $program->linkedChannelId,
                    'message' => $msg,
                ], $memberIds);
            });
        }
    }

    /**
     * Create + broadcast notification rows for an approval-flow event
     * (submit / approve-escalate / reject). Dedupe recipients, skip the actor.
     * Failure tidak boleh memblokir aksi utama — semua dibungkus rescue().
     *
     * @param  array<int>  $recipientIds
     */
    private function notifyApprovalEvent(
        Program $program,
        array $recipientIds,
        string $type,
        string $message,
        ?int $excludeUserId = null,
    ): void {
        rescue(function () use ($program, $recipientIds, $type, $message, $excludeUserId) {
            $targets = collect($recipientIds)
                ->map(fn ($id) => (int) $id)
                ->filter()
                ->unique()
                ->reject(fn ($id) => $excludeUserId !== null && $id === $excludeUserId)
                ->values();

            foreach ($targets as $userId) {
                $notif = Notification::create([
                    'userId' => $userId,
                    'type' => $type,
                    'message' => $message,
                    'source' => "program:{$program->id}",
                    'createdAt' => now(),
                    'state' => 'UNREAD',
                ]);

                BroadcastService::toUsers('notification:created', [
                    'notification' => $notif,
                ], [$userId]);
            }
        });
    }

    /**
     * Bandingkan nilai field commitment SEBELUM vs setelah update — return
     * array of {field, from, to} untuk field yang benar-benar berubah.
     * Skip kalau field tidak dikirim di request (pakai array_key_exists).
     *
     * @return array<int, array{field: string, from: string, to: string}>
     */
    private function detectCommitmentChanges(Program $before, array $newData): array
    {
        $changes = [];
        foreach (self::COMMITMENT_FIELDS as $field) {
            if (!array_key_exists($field, $newData)) continue;
            $oldVal = $before->{$field};
            // Normalize Carbon → date string supaya comparison fair
            if ($oldVal instanceof \Illuminate\Support\Carbon || $oldVal instanceof \Carbon\Carbon) {
                $oldVal = $oldVal->toDateString();
            }
            // Normalize BackedEnum → primitive value. Field kelompok & pilarStrategis
            // di-cast ke enum (Kelompok, PilarStrategis), tanpa unwrap ini
            // (string) $enum throw "could not be converted to string".
            if ($oldVal instanceof \BackedEnum) {
                $oldVal = $oldVal->value;
            }
            $newVal = $newData[$field];
            // Safety net: newVal dari validated request adalah string mentah,
            // tapi jaga-jaga kalau path lain inject enum object langsung.
            if ($newVal instanceof \BackedEnum) {
                $newVal = $newVal->value;
            }
            $oldStr = $oldVal === null ? '' : (string) $oldVal;
            $newStr = $newVal === null ? '' : (string) $newVal;
            if ($oldStr !== $newStr) {
                $changes[] = [
                    'field' => $field,
                    'from' => $oldStr === '' ? '—' : $oldStr,
                    'to' => $newStr === '' ? '—' : $newStr,
                ];
            }
        }
        return $changes;
    }

    /**
     * Log + notify KADIV saat commitment field berubah pada program ACTIVE.
     * Tidak block aksi — sesuai Opsi A: transparency, bukan gate-keeping.
     * Audit trail di ProgramApprovalLog supaya history lengkap (sama timeline
     * dengan SUBMITTED/APPROVED/REJECTED). KADIV bisa diskusi via channel
     * kalau tidak setuju — tapi value sudah berubah.
     *
     * @param array<int, array{field: string, from: string, to: string}> $changes
     */
    private function logCommitmentChanges(Program $program, array $changes, User $editor): void
    {
        $noteLines = array_map(
            fn ($c) => "{$c['field']}: {$c['from']} → {$c['to']}",
            $changes,
        );
        $note = implode('; ', $noteLines);

        ProgramApprovalLog::record(
            $program->id,
            'COMMITMENT_CHANGED',
            $program->approvalStatus,
            $program->approvalStatus,
            $editor->id,
            $editor->name,
            $note,
        );

        // Notif KADIV via org chain dari submitter (bukan editor — supaya tetap
        // ke KADIV yang waktu itu approve, walau yang edit beda PIC).
        $submitter = $program->submittedById ? User::find($program->submittedById) : $editor;
        $reviewerIds = $this->resolveReviewerIds($submitter ?? $editor, 'KADIV');
        $fieldList = implode(', ', array_column($changes, 'field'));
        $this->notifyApprovalEvent(
            program: $program,
            recipientIds: $reviewerIds,
            type: 'PROGRAM_COMMITMENT_CHANGED',
            message: "Program \"{$program->name}\" was modified by {$editor->name} (field: {$fieldList}).",
            excludeUserId: $editor->id,
        );
    }

    /**
     * Resolve next-stage reviewer(s) for a program submitter. Walks the org
     * supervisor chain from $submitter and returns IDs of users matching the
     * target role. Returns [] kalau tidak ada match (fail-quiet — caller
     * decides what to do).
     *
     * @return array<int>
     */
    private function resolveReviewerIds(User $submitter, string $targetRole): array
    {
        return $this->orgChain
            ->resolveSupervisorsByRole($submitter, $targetRole)
            ->pluck('id')
            ->all();
    }

    /**
     * Pastikan user yang meng-approve/reject benar-benar reviewer sah di org-chain
     * PIC program ini (bukan KADIV/KASUBDIV direktorat lain). Sebelumnya gate hanya
     * cek role+status → KADIV direktorat A bisa approve program pending direktorat B.
     * Admin/superadmin di-exempt (cross-cutting). Notifikasi sudah memakai chain
     * submitter; guard ini menyelaraskan otorisasi dengan target notifikasi.
     */
    private function assertIsLegitimateReviewer(Program $program, User $user, string $targetRole): void
    {
        if (in_array(strtoupper($user->roleType), ['ADMIN', 'SUPERADMIN'], true)) return;

        $submitterId = $program->submittedById ?? $program->ownerId;
        $submitter = $submitterId ? User::find($submitterId) : null;
        $reviewerIds = $submitter ? $this->resolveReviewerIds($submitter, $targetRole) : [];

        if (!in_array($user->id, $reviewerIds, true)) {
            abort(403, 'You are not the designated reviewer for this program in its organization chain.');
        }
    }

    /**
     * Resolve the user(s) currently expected to act on a PENDING program.
     * Returns null kalau status bukan PENDING_* atau submitter tidak diketahui.
     * Untuk multiple match, ambil yang pertama (kasus jarang — biasanya 1 KADIV
     * per chain). UI menampilkan satu nama supaya tidak overload.
     */
    private function resolvePendingReviewer(Program $program): ?array
    {
        if (!in_array($program->approvalStatus, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            return null;
        }
        $submitterId = $program->submittedById ?? $program->ownerId;
        if (!$submitterId) return null;
        $submitter = User::find($submitterId);
        if (!$submitter) return null;

        $targetRole = $program->approvalStatus === 'PENDING_KADIV' ? 'KADIV' : 'KASUBDIV';
        $reviewer = $this->orgChain
            ->resolveSupervisorsByRole($submitter, $targetRole)
            ->first();
        if (!$reviewer) return null;

        return [
            'id' => $reviewer->id,
            'name' => $reviewer->name,
            'roleType' => $reviewer->roleType,
            'positionTitle' => $reviewer->positionTitle,
        ];
    }

    /**
     * Resolve when the program entered its current PENDING state — dari log
     * SUBMITTED/APPROVED yang transition ke current status. Returns ISO string
     * atau null. Digunakan FE untuk render "Diajukan X jam lalu".
     */
    private function resolvePendingSinceAt(Program $program): ?string
    {
        if (!in_array($program->approvalStatus, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            return null;
        }
        $entry = ProgramApprovalLog::query()
            ->where('programId', $program->id)
            ->where('toStatus', $program->approvalStatus)
            ->orderByDesc('createdAt')
            ->first();
        return $entry?->createdAt?->toIso8601String();
    }

    /**
     * Resolve when the program transitioned to ACTIVE state (via KADIV approve
     * atau direct activate). Returns ISO string atau null kalau status bukan
     * ACTIVE / belum pernah diaktivasi. FE pakai ini untuk render
     * post-activation hint banner (~7 hari setelah aktif).
     */
    private function resolveActivatedAt(Program $program): ?string
    {
        if ($program->approvalStatus !== 'ACTIVE') return null;
        $entry = ProgramApprovalLog::query()
            ->where('programId', $program->id)
            ->where('toStatus', 'ACTIVE')
            ->orderByDesc('createdAt')
            ->first();
        return $entry?->createdAt?->toIso8601String();
    }

    public function approve(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        $role = strtoupper($request->user()->roleType);

        $prevStatus = $program->approvalStatus;
        $user = $request->user();

        if ($prevStatus === 'PENDING_KASUB' && $role === 'KASUBDIV') {
            $this->assertIsLegitimateReviewer($program, $user, 'KASUBDIV');
            $program->update(['approvalStatus' => 'PENDING_KADIV']);
            ProgramApprovalLog::record($id, 'APPROVED', $prevStatus, 'PENDING_KADIV', $user->id, $user->name);
            // Escalate to KADIV — notify next-stage reviewers. Use submitter's
            // org chain (bukan KASUBDIV-nya sendiri) supaya KADIV yang tepat di
            // hierarki PIC yang dapat ping, bukan KADIV-nya KASUBDIV.
            $submitter = $program->submittedById ? User::find($program->submittedById) : $user;
            $this->notifyApprovalEvent(
                program: $program,
                recipientIds: $this->resolveReviewerIds($submitter ?? $user, 'KADIV'),
                type: 'PROGRAM_NEEDS_APPROVAL',
                message: "Program \"{$program->name}\" is ready for KADIV approval.",
                excludeUserId: $user->id,
            );
        } elseif ($prevStatus === 'PENDING_KADIV' && in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true)) {
            $this->assertIsLegitimateReviewer($program, $user, 'KADIV');
            $program->update(['approvalStatus' => 'ACTIVE']);
            ProgramApprovalLog::record($id, 'APPROVED', $prevStatus, 'ACTIVE', $user->id, $user->name);
            // Sprint 5 — Plan→Do handoff (KADIV approval triggers ACTIVE)
            $this->notifyProgramActivation($program, $user);
        } else {
            abort(403, 'You do not have permission to approve this program at this stage');
        }

        BroadcastService::program($id, 'approved');

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', 'Program approved.');
    }

    public function reject(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        $role = strtoupper($request->user()->roleType);

        $data = $request->validate(['note' => 'required|string|max:400']);

        $canReject =
            ($program->approvalStatus === 'PENDING_KASUB' && $role === 'KASUBDIV') ||
            ($program->approvalStatus === 'PENDING_KADIV' && in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true));

        if (!$canReject) abort(403, 'You do not have permission to reject this program');
        $this->assertIsLegitimateReviewer(
            $program,
            $request->user(),
            $program->approvalStatus === 'PENDING_KADIV' ? 'KADIV' : 'KASUBDIV',
        );

        $prevStatus = $program->approvalStatus;
        $program->update(['approvalStatus' => 'DRAFT', 'rejectionNote' => $data['note']]);
        ProgramApprovalLog::record($id, 'REJECTED', $prevStatus, 'DRAFT', $request->user()->id, $request->user()->name, $data['note']);
        BroadcastService::program($id, 'rejected');

        // Notify PIC (owner + submitter, deduped) — tanpa ini PIC tidak tahu
        // programnya ditolak sampai mereka buka halaman program. Reviewer yang
        // menolak (rejecter) di-exclude dari recipient.
        $recipientIds = collect([$program->ownerId, $program->submittedById])
            ->filter()
            ->unique()
            ->values()
            ->all();
        $rejecter = $request->user();
        $noteSnippet = mb_strimwidth($data['note'], 0, 80, '…');
        $this->notifyApprovalEvent(
            program: $program,
            recipientIds: $recipientIds,
            type: 'PROGRAM_REJECTED',
            message: "Program \"{$program->name}\" was rejected by {$rejecter->name}: {$noteSnippet}",
            excludeUserId: $rejecter->id,
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', 'Program rejected and returned to Draft.');
    }

    /**
     * Tarik kembali pengajuan — PIC (submitter/owner) membatalkan submission
     * mereka sendiri saat reviewer belum bertindak. Status kembali ke DRAFT
     * (clear rejectionNote agar tidak terlihat seperti rejected oleh sistem),
     * reviewer yang sedang menunggu di-notifikasi.
     */
    public function withdraw(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        $user = $request->user();
        $role = strtoupper($user->roleType);

        $isOwnerOrSubmitter = in_array($user->id, [$program->submittedById, $program->ownerId], true);
        $isAdmin = in_array($role, ['SUPERADMIN', 'ADMIN'], true);
        if (!$isOwnerOrSubmitter && !$isAdmin) {
            abort(403, 'Only the program PIC/creator can withdraw the submission.');
        }
        if (!in_array($program->approvalStatus, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            return $this->validationError($request, 'Only programs awaiting approval can be withdrawn.');
        }

        // Snapshot reviewer SEBELUM status berubah supaya notifikasi-nya tepat.
        $prevStatus = $program->approvalStatus;
        $submitter = $program->submittedById ? User::find($program->submittedById) : $user;
        $reviewerRole = $prevStatus === 'PENDING_KADIV' ? 'KADIV' : 'KASUBDIV';
        $reviewerIds = $this->resolveReviewerIds($submitter ?? $user, $reviewerRole);

        $program->update(['approvalStatus' => 'DRAFT', 'rejectionNote' => null]);
        ProgramApprovalLog::record($id, 'WITHDRAWN', $prevStatus, 'DRAFT', $user->id, $user->name);
        BroadcastService::program($id, 'updated', ['approvalStatus' => 'DRAFT']);

        // Notify reviewer(s) — mereka tidak perlu lagi review program ini.
        $this->notifyApprovalEvent(
            program: $program,
            recipientIds: $reviewerIds,
            type: 'PROGRAM_WITHDRAWN',
            message: "The submission for program \"{$program->name}\" was withdrawn by {$user->name}.",
            excludeUserId: $user->id,
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }
        return back()->with('success', 'Submission withdrawn — the program returned to Draft.');
    }

    public function archive(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('archive-program', $program);
        // Gate archive-program berbasis role+ownership; tambahkan scope direktorat
        // supaya KADIV tidak bisa mengarsip program direktorat lain.
        $this->assertCoversProgramUnit($program, $request->user());
        if ($program->archivedAt) return $this->validationError($request, 'The program is already archived.');
        $this->programService->archive($id, $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['data' => Program::findOrFail($id)]);
        }

        return back()->with('success', 'Program archived.');
    }

    public function restore(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        // Sebelumnya hanya Gate view-archive (role) → KADIV/Admin mana pun bisa
        // me-restore program siapa pun. Samakan dgn archive: role+ownership +
        // scope direktorat.
        Gate::authorize('archive-program', $program);
        $this->assertCoversProgramUnit($program, $request->user());
        if (!$program->archivedAt) return $this->validationError($request, 'The program is not archived.');
        $this->programService->restore($id);

        if ($request->expectsJson()) {
            return response()->json(['data' => Program::findOrFail($id)]);
        }

        return back()->with('success', 'Program restored.');
    }

    /**
     * Scope guard direktorat untuk aksi program-level yang gate-nya berbasis
     * role (activate/archive/restore). Admin/eksekutif bebas; selain itu unit
     * pemilik program harus tercakup OrgScope user. Semua program kini punya
     * ownerUnitId (0 null), jadi coversUnit(null) yg false aman.
     */
    private function assertCoversProgramUnit(Program $program, User $user): void
    {
        if (RolePolicy::isAdminOrAbove($user->roleType)) {
            return;
        }
        if (!OrgScope::forUser($user)->coversUnit($program->ownerUnitId !== null ? (int) $program->ownerUnitId : null)) {
            abort(403, 'You can only act on a program that belongs to your directorate.');
        }
    }

    public function addKpiLink(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $this->programService->assertAccess($request->user(), $id);

        $data = $request->validate([
            'apmsKpiCode' => 'required|string|max:30',
            'note' => 'nullable|string|max:200',
            'apmsKpiName' => 'nullable|string|max:200',
            'apmsKpiBobot' => 'nullable|numeric',
        ]);

        $exists = ProgramKpiLink::query()
            ->where('programId', $id)
            ->where('apmsKpiCode', $data['apmsKpiCode'])
            ->exists();

        if ($exists) return $this->validationError($request, "KPI {$data['apmsKpiCode']} is already linked to this program.");

        $link = ProgramKpiLink::create([...$data, 'programId' => $id]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $link], 201);
        }

        return back()->with('success', 'KPI linked.');
    }

    public function removeKpiLink(Request $request, int $id, string $code): JsonResponse|RedirectResponse
    {
        $this->programService->assertAccess($request->user(), $id);

        ProgramKpiLink::query()
            ->where('programId', $id)
            ->where('apmsKpiCode', $code)
            ->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'KPI link deleted.');
    }

    public function approvalLog(Request $request, int $id): JsonResponse
    {
        $this->programService->assertAccess($request->user(), $id);
        $log = ProgramApprovalLog::query()
            ->where('programId', $id)
            ->orderBy('createdAt', 'desc')
            ->get();

        return response()->json(['data' => $log]);
    }

    public function progressLog(Request $request, int $id): JsonResponse
    {
        $this->programService->assertAccess($request->user(), $id);
        $logs = ProgramProgressLog::query()
            ->where('programId', $id)
            ->orderBy('createdAt', 'desc')
            ->get();

        return response()->json(['data' => $logs]);
    }

    public function storeProgressLog(Request $request, int $id): JsonResponse
    {
        $program = Program::findOrFail($id);
        $user = $request->user();

        // Permission: hanya owner program (PIC utama) yang boleh write refleksi.
        // assertAccess sebelumnya terlalu permisif (Officer/Kadiv juga bisa).
        // Refleksi adalah accountability statement PIC — orang lain edit
        // melanggar audit trail. SUPERADMIN/ADMIN tetap diizinkan sebagai
        // escape hatch (data correction kasus exceptional).
        $role = strtoupper($user->roleType ?? '');
        $isAdmin = in_array($role, ['SUPERADMIN', 'ADMIN'], true);
        $isOwner = $program->ownerId === $user->id;
        if (! $isAdmin && ! $isOwner) {
            return response()->json([
                'message' => 'Only the program PIC (owner) can write the weekly reflection.',
            ], 403);
        }

        $data = $request->validate([
            // Weekly-only sejak 2026-05-19. Aplikasi wajib weekly basis dengan
            // deadline Sabtu 12:00 WIB. Entry historis monthly (format YYYY-MM)
            // tetap di-display read-only, tapi insert/update baru harus weekly.
            'period'             => ['required', 'string', 'regex:/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/'],
            'healthAtTime'       => 'required|in:on_track,at_risk,terlambat,overdue',
            'narrative'          => 'required|string|max:3000',
            'kendala'            => 'nullable|string|max:2000',
            'correctiveAction'   => 'nullable|string|max:2000',
            'nextStep'           => 'nullable|string|max:2000',
            'dukunganDibutuhkan' => 'nullable|string|max:2000',
        ]);

        // Reject future period. FE lock period ke current week, tapi backend
        // harus enforce — POST manual atau attacker bisa kirim "2027-W52".
        $currentWeek = $this->weeklyDeadline->currentWeekIso();
        if (strcmp($data['period'], $currentWeek) > 0) {
            return response()->json([
                'message' => "Period {$data['period']} is in the future. Only reflections for the current week or earlier are allowed.",
                'errors'  => ['period' => ['Period cannot be in the future.']],
            ], 422);
        }

        $isLate = $this->weeklyDeadline->isLateSubmission($data['period']);

        $log = DB::transaction(function () use ($id, $data, $user, $isLate) {
            // firstOrNew (bukan firstOrCreate) supaya bisa set semua field NOT NULL
            // sebelum save pertama kali. firstOrCreate sebelumnya bug: insert hanya
            // include createdBy* di create-attributes, sementara healthAtTime &
            // narrative NOT NULL → constraint violation pada submit pertama.
            $log = ProgramProgressLog::firstOrNew([
                'programId' => $id,
                'period'    => $data['period'],
            ]);
            $isNew = ! $log->exists;

            $log->fill([
                'healthAtTime'       => $data['healthAtTime'],
                'narrative'          => $data['narrative'],
                'kendala'            => $data['kendala'] ?? null,
                'correctiveAction'   => $data['correctiveAction'] ?? null,
                'nextStep'           => $data['nextStep'] ?? null,
                'dukunganDibutuhkan' => $data['dukunganDibutuhkan'] ?? null,
            ]);

            // createdBy* dan isLate hanya di-set saat submit pertama. Edit susulan
            // tidak mengubah identitas pembuat atau flag compliance — yang dinilai
            // adalah submit-pertama, bukan revisi.
            if ($isNew) {
                $log->createdById   = $user->id;
                $log->createdByName = $user->name;
                $log->isLate        = $isLate;
            }

            $log->save();

            // Backward-compat: sync ke field Program agar tampil di legacy views
            Program::where('id', $id)->update([
                'progresTerkini'     => $data['narrative'],
                'dukunganDibutuhkan' => $data['dukunganDibutuhkan'] ?? null,
            ]);

            return $log;
        });

        BroadcastService::program($id, 'updated', ['progressUpdated' => true]);

        return response()->json(['data' => $log], 201);
    }

    /**
     * Meta untuk Refleksi Mingguan: state deadline minggu berjalan + prefill
     * suggestions (health, narrative template, kendala dari blocker open).
     * Dipakai FE saat user membuka form refleksi — supaya tidak hadap blank.
     */
    public function reflectionMeta(Request $request, int $id): JsonResponse
    {
        $this->programService->assertAccess($request->user(), $id);

        $program = Program::findOrFail($id);
        $weekIso = $this->weeklyDeadline->currentWeekIso();

        $existingLog = ProgramProgressLog::query()
            ->where('programId', $id)
            ->where('period', $weekIso)
            ->first();

        $hasSubmitted = $existingLog !== null;
        $activatedAt  = $program->activatedAt ? \Carbon\Carbon::parse($program->activatedAt) : null;

        $summary = $this->weeklyDeadline->summary($weekIso, $hasSubmitted, $activatedAt);
        $prefill = $this->buildReflectionPrefill($program);

        // Existing log content — FE pakai untuk populate form saat edit mode.
        // Sebelumnya cuma return existingLogId, FE harus blind-start dari prefill
        // → user kira start fresh padahal updateOrCreate akan replace.
        $existing = $existingLog ? [
            'id'                 => $existingLog->id,
            'period'             => $existingLog->period,
            'healthAtTime'       => $existingLog->healthAtTime,
            'narrative'          => $existingLog->narrative,
            'kendala'            => $existingLog->kendala,
            'correctiveAction'   => $existingLog->correctiveAction,
            'nextStep'           => $existingLog->nextStep,
            'dukunganDibutuhkan' => $existingLog->dukunganDibutuhkan,
            'isLate'             => (bool) $existingLog->isLate,
            'createdByName'      => $existingLog->createdByName,
            'createdAt'          => $existingLog->createdAt,
        ] : null;

        return response()->json([
            'data' => array_merge($summary, [
                'prefill'       => $prefill,
                'existing'      => $existing,
                'existingLogId' => $existingLog?->id, // backward-compat
            ]),
        ]);
    }

    /**
     * Bangun suggested pre-fill content. PIC tetap review & edit sebelum submit
     * — ini cuma "kepala isi" supaya friction turun. Sengaja konservatif:
     * health & narrative selalu ada, kendala hanya kalau memang ada blocker open.
     */
    private function buildReflectionPrefill(Program $program): array
    {
        $healthMap = [
            'GREEN'   => 'on_track',
            'YELLOW'  => 'at_risk',
            'RED'     => 'terlambat',
            'OVERDUE' => 'overdue',
        ];
        $healthLabelMap = [
            'GREEN'   => 'On Track',
            'YELLOW'  => 'At Risk',
            'RED'     => 'Delayed',
            'OVERDUE' => 'Overdue',
        ];
        $statusRaw  = strtoupper((string) ($program->healthStatus ?? 'GREEN'));
        $health     = $healthMap[$statusRaw] ?? 'on_track';
        $healthLbl  = $healthLabelMap[$statusRaw] ?? 'On Track';

        $pct = (int) round((float) ($program->progressPercent ?? 0));

        // Blocker open via Task → Workstream → programId. Severity HIGH/CRITICAL
        // saja — MEDIUM terlalu noisy untuk auto-prefill. Pakai whereHas Eloquent
        // (mengikuti pola ProgramHealthService) supaya schema search_path handled
        // benar.
        $blockerTitles = Blocker::query()
            ->whereHas('task.workstream', fn ($q) => $q->where('programId', $program->id))
            ->where('status', 'OPEN')
            ->whereIn('severity', ['HIGH', 'CRITICAL'])
            ->orderByRaw("CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END")
            ->limit(5)
            ->pluck('title')
            ->all();

        $narrative = "Posisi minggu ini: {$pct}% progress · status {$healthLbl}.";
        $kendala = empty($blockerTitles)
            ? ''
            : "Blocker aktif:\n" . implode("\n", array_map(fn ($t) => "- {$t}", $blockerTitles));

        return [
            'healthAtTime' => $health,
            'narrative'    => $narrative,
            'kendala'      => $kendala,
        ];
    }

    public function storeKpiInternal(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $this->programService->assertAccess($request->user(), $id);

        $data = $request->validate([
            'code'            => 'required|string|min:2|max:40|unique:KpiDefinition,code',
            'name'            => 'required|string|min:2|max:120',
            'targetValue'     => 'required|numeric',
            'unitOfMeasure'   => 'nullable|string|max:30',
            'reviewFrequency' => 'in:WEEKLY,MONTHLY,QUARTERLY,ANNUALLY',
        ]);

        $unit = $data['unitOfMeasure'] ?? null;
        $dataType = str_starts_with(strtolower($unit ?? ''), 'rp') ? 'CURRENCY'
            : (($unit === '%' || str_contains(strtolower($unit ?? ''), 'persen')) ? 'PERCENTAGE' : 'NUMERIC');

        $kpi = KpiDefinition::create([
            'code'             => strtoupper($data['code']),
            'name'             => $data['name'],
            'targetValue'      => $data['targetValue'],
            'unitOfMeasure'    => $unit,
            'reviewFrequency'  => $data['reviewFrequency'] ?? 'MONTHLY',
            'dataType'         => $dataType,
            'metricType'       => 'INTERNAL',
            'isLeadingIndicator' => false,
            'isActive'         => true,
            'programId'        => $id,
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $kpi], 201);
        }

        return back()->with('success', 'Internal KPI created.');
    }
}
