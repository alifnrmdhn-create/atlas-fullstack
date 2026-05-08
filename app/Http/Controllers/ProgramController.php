<?php

namespace App\Http\Controllers;

use App\Models\Blocker;
use App\Models\KpiDefinition;
use App\Models\Program;
use App\Models\ProgramApprovalLog;
use App\Models\ProgramProgressLog;
use App\Models\ProgramKpiLink;
use App\Services\BroadcastService;
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
        if ($request->expectsJson()) {
            return response()->json(['data' => $program]);
        }

        return Inertia::render('ProgramDetailView', ['program' => $program]);
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
            'pilarStrategis' => 'nullable|in:ENABLER,SPENDING_BETTER,INNOVATIVE_FINANCING',
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
            'name' => 'sometimes|string|max:200',
            'description' => 'nullable|string|max:2000',
            'strategicObjective' => 'nullable|string|max:1000',
            'startDate' => 'sometimes|date',
            'targetEndDate' => 'sometimes|date|after_or_equal:startDate',
            'priority' => 'sometimes|in:LOW,MEDIUM,HIGH,CRITICAL',
            'budgetIdr' => 'nullable|numeric',
            'picPersonIds' => 'nullable|array',
            'picPersonIds.*' => 'integer|exists:User,id',
            'kelompok' => 'nullable|in:SCORECARD,NON_SCORECARD',
            'pilarStrategis' => 'nullable|in:ENABLER,SPENDING_BETTER,INNOVATIVE_FINANCING',
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
        $prevStatus = $program->approvalStatus;
        $program->update(['approvalStatus' => 'ACTIVE', 'rejectionNote' => null]);
        ProgramApprovalLog::record($id, 'ACTIVATED', $prevStatus, 'ACTIVE', $request->user()->id, $request->user()->name);
        BroadcastService::program($id, 'approved');

        // Sprint 5 — Plan→Do handoff
        $this->notifyTaskAssignees($program);

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', 'Program diaktifkan — eksekusi dimulai.');
    }

    /**
     * Sprint 5 — Plan→Do handoff. Saat program jadi ACTIVE, kirim notifikasi
     * ke setiap user yang punya task di-assign di program tsb. Group per user
     * (1 notif per user yang berisi count tasks), bukan 1 notif per task.
     */
    private function notifyTaskAssignees(Program $program): void
    {
        rescue(function () use ($program) {
            $taskRows = \App\Models\Task::query()
                ->whereHas('workstream', fn ($q) => $q->where('programId', $program->id))
                ->whereNotNull('assignedTo')
                ->get(['assignedTo']);

            $byUser = $taskRows->groupBy('assignedTo');
            foreach ($byUser as $userId => $tasks) {
                $count = $tasks->count();
                \App\Models\Notification::create([
                    'userId' => $userId,
                    'type' => 'PROGRAM_TASKS_ASSIGNED',
                    'message' => "Program {$program->name} aktif. {$count} tugas di pipeline Anda.",
                    'source' => "program:{$program->id}",
                    'createdAt' => now(),
                    'state' => 'UNREAD',
                ]);
            }
        });
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
        } elseif ($prevStatus === 'PENDING_KADIV' && in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true)) {
            $program->update(['approvalStatus' => 'ACTIVE']);
            ProgramApprovalLog::record($id, 'APPROVED', $prevStatus, 'ACTIVE', $user->id, $user->name);
            // Sprint 5 — Plan→Do handoff (KADIV approval triggers ACTIVE)
            $this->notifyTaskAssignees($program);
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

        if ($request->expectsJson()) {
            return response()->json(['data' => $program->fresh()]);
        }

        return back()->with('success', 'Program ditolak dan dikembalikan ke Draft.');
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
