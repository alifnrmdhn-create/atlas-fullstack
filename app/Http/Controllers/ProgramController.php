<?php

namespace App\Http\Controllers;

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

        $program = $this->programService->create($request->user(), $data);
        BroadcastService::program($program->id, 'created');

        if ($request->expectsJson()) {
            return response()->json(['data' => $program], 201);
        }

        return redirect()->route('programs.show', $program->id)
            ->with('success', 'Program berhasil dibuat.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('edit-program', $program);

        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);
        if (!$isAdmin && in_array($program->approvalStatus, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            return $this->validationError($request, 'Program sedang dalam proses persetujuan dan tidak dapat diubah.');
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
            'kelompok' => 'nullable|in:SCORECARD,NON_SCORECARD',
            'pilarStrategis' => 'nullable|in:' . implode(',', array_keys(config('atlas-thresholds.pillars', []))),
            'progresTerkini' => 'nullable|string|max:2000',
            'dukunganDibutuhkan' => 'nullable|string|max:2000',
        ]);

        $program = $this->programService->update($id, $data);
        $this->healthService->recompute($id);
        BroadcastService::program($id, 'updated');

        if ($request->expectsJson()) {
            return response()->json(['data' => $program]);
        }

        return back()->with('success', 'Program diperbarui.');
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

        return redirect()->route('programs.index')->with('success', 'Program dihapus.');
    }

    public function submit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        $user = $request->user();
        $role = strtoupper($user->roleType);

        if (!in_array($user->id, [$program->submittedById, $program->ownerId], true)
            && !in_array($role, ['SUPERADMIN', 'ADMIN'], true)) {
            abort(403, 'Hanya PIC atau pembuat program yang dapat mengajukan persetujuan');
        }
        if ($program->approvalStatus !== 'DRAFT') {
            return $this->validationError($request, 'Hanya program berstatus DRAFT yang dapat disubmit.');
        }
        if (in_array($role, ['KADIV', 'SUPERADMIN', 'ADMIN'], true)) {
            return $this->validationError($request, 'KADIV/Admin gunakan tombol "Mulai Eksekusi" untuk mengaktifkan program.');
        }

        $prevStatus = $program->approvalStatus;
        $nextStatus = $role === 'KASUBDIV' ? 'PENDING_KADIV' : 'PENDING_KASUB';
        $program->update(['approvalStatus' => $nextStatus, 'rejectionNote' => null, 'submittedById' => $user->id]);
        ProgramApprovalLog::record($id, 'SUBMITTED', $prevStatus, $nextStatus, $user->id, $user->name);
        BroadcastService::program($id, 'updated', ['approvalStatus' => $nextStatus]);

        $targetRole = $nextStatus === 'PENDING_KADIV' ? 'KADIV' : 'KASUBDIV';
        $this->notifyApprovalEvent(
            program: $program,
            recipientIds: $this->resolveReviewerIds($user, $targetRole),
            type: 'PROGRAM_NEEDS_APPROVAL',
            message: "Program \"{$program->name}\" menunggu persetujuan Anda.",
            excludeUserId: $user->id,
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', "Program diajukan untuk persetujuan.");
    }

    public function activate(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $role = strtoupper($request->user()->roleType);
        if (!in_array($role, ['KADIV', 'SUPERADMIN', 'ADMIN'], true)) {
            abort(403, 'Hanya KADIV/Admin yang dapat mengaktifkan program langsung.');
        }
        $program = Program::findOrFail($id);
        if ($program->approvalStatus !== 'DRAFT') {
            return $this->validationError($request, 'Hanya program DRAFT yang dapat diaktifkan.');
        }
        // Block direct activation while program is in revision (just rejected).
        // PIC harus memperbaiki & resubmit dulu — KADIV tidak boleh mem-bypass
        // koreksi yang baru saja diminta sendiri lewat tombol "Mulai Eksekusi".
        if (!empty($program->rejectionNote) && !RolePolicy::isAdminOrAbove($request->user()->roleType)) {
            return $this->validationError($request, 'Program baru ditolak — PIC perlu memperbaiki dan mengajukan ulang sebelum diaktifkan.');
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

        return back()->with('success', 'Program diaktifkan — eksekusi dimulai.');
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
                    ? "Program {$program->name} aktif. {$taskCount} tugas di pipeline Anda."
                    : "Program {$program->name} aktif — eksekusi dimulai.";

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
                    ? "{$taskCount} task siap di-eksekusi tim."
                    : 'Tim bisa mulai menambah task ke workstream.';
                $content = "🚀 Program *{$program->name}* aktif — eksekusi dimulai. {$tail}";

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
                message: "Program \"{$program->name}\" siap untuk persetujuan KADIV.",
                excludeUserId: $user->id,
            );
        } elseif ($prevStatus === 'PENDING_KADIV' && in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true)) {
            $program->update(['approvalStatus' => 'ACTIVE']);
            ProgramApprovalLog::record($id, 'APPROVED', $prevStatus, 'ACTIVE', $user->id, $user->name);
            // Sprint 5 — Plan→Do handoff (KADIV approval triggers ACTIVE)
            $this->notifyProgramActivation($program, $user);
        } else {
            abort(403, 'Anda tidak memiliki izin untuk menyetujui program ini pada tahap ini');
        }

        BroadcastService::program($id, 'approved');

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', 'Program disetujui.');
    }

    public function reject(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        $role = strtoupper($request->user()->roleType);

        $data = $request->validate(['note' => 'required|string|max:400']);

        $canReject =
            ($program->approvalStatus === 'PENDING_KASUB' && $role === 'KASUBDIV') ||
            ($program->approvalStatus === 'PENDING_KADIV' && in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true));

        if (!$canReject) abort(403, 'Anda tidak memiliki izin untuk menolak program ini');

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
            message: "Program \"{$program->name}\" ditolak {$rejecter->name}: {$noteSnippet}",
            excludeUserId: $rejecter->id,
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', 'Program ditolak dan dikembalikan ke Draft.');
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
            abort(403, 'Hanya PIC/pembuat program yang dapat menarik kembali pengajuan.');
        }
        if (!in_array($program->approvalStatus, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            return $this->validationError($request, 'Hanya program yang sedang menunggu persetujuan yang dapat ditarik kembali.');
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
            message: "Pengajuan program \"{$program->name}\" ditarik kembali oleh {$user->name}.",
            excludeUserId: $user->id,
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }
        return back()->with('success', 'Pengajuan ditarik kembali — program kembali ke Draft.');
    }

    public function archive(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('archive-program', $program);
        if ($program->archivedAt) return $this->validationError($request, 'Program sudah diarsipkan.');
        $this->programService->archive($id, $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['data' => Program::findOrFail($id)]);
        }

        return back()->with('success', 'Program diarsipkan.');
    }

    public function restore(Request $request, int $id): JsonResponse|RedirectResponse
    {
        Gate::authorize('view-archive');
        $program = Program::findOrFail($id);
        if (!$program->archivedAt) return $this->validationError($request, 'Program tidak dalam status arsip.');
        $this->programService->restore($id);

        if ($request->expectsJson()) {
            return response()->json(['data' => Program::findOrFail($id)]);
        }

        return back()->with('success', 'Program dipulihkan.');
    }

    public function addKpiLink(Request $request, int $id): JsonResponse|RedirectResponse
    {
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

        if ($exists) return $this->validationError($request, "KPI {$data['apmsKpiCode']} sudah terhubung ke program ini.");

        $link = ProgramKpiLink::create([...$data, 'programId' => $id]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $link], 201);
        }

        return back()->with('success', 'KPI dihubungkan.');
    }

    public function removeKpiLink(Request $request, int $id, string $code): JsonResponse|RedirectResponse
    {
        ProgramKpiLink::query()
            ->where('programId', $id)
            ->where('apmsKpiCode', $code)
            ->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Link KPI dihapus.');
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
        $this->programService->assertAccess($request->user(), $id);

        $data = $request->validate([
            // YYYY-W01..W53 atau YYYY-01..12 (bulan valid saja)
            'period'             => ['required', 'string', 'regex:/^\d{4}-(W(?:0[1-9]|[1-4]\d|5[0-3])|0[1-9]|1[0-2])$/'],
            'healthAtTime'       => 'required|in:on_track,at_risk,terlambat,overdue',
            'narrative'          => 'required|string|max:3000',
            'kendala'            => 'nullable|string|max:2000',
            'correctiveAction'   => 'nullable|string|max:2000',
            'nextStep'           => 'nullable|string|max:2000',
            'dukunganDibutuhkan' => 'nullable|string|max:2000',
        ]);

        $user = $request->user();

        $log = DB::transaction(function () use ($id, $data, $user) {
            // firstOrCreate mempertahankan createdById asli saat entry diupdate
            $log = ProgramProgressLog::firstOrCreate(
                ['programId' => $id, 'period' => $data['period']],
                ['createdById' => $user->id, 'createdByName' => $user->name]
            );
            $log->fill([
                'healthAtTime'       => $data['healthAtTime'],
                'narrative'          => $data['narrative'],
                'kendala'            => $data['kendala'] ?? null,
                'correctiveAction'   => $data['correctiveAction'] ?? null,
                'nextStep'           => $data['nextStep'] ?? null,
                'dukunganDibutuhkan' => $data['dukunganDibutuhkan'] ?? null,
            ])->save();

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

        return back()->with('success', 'KPI internal dibuat.');
    }
}
