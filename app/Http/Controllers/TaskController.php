<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\SubTask;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkItemStatusLog;
use App\Models\Workstream;
use App\Services\BroadcastService;
use App\Services\ProgramHealthService;
use App\Services\TaskService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TaskController extends Controller
{
    public function __construct(
        private TaskService $taskService,
        private ProgramHealthService $healthService,
    ) {}

    public function index(Request $request)
    {
        $user = $request->user();
        $scope = OrgScope::forUser($user);

        $query = Task::query()
            ->with([
                'workstream:id,code,name,programId',
                'workstream.program:id,code,name,healthStatus,approvalStatus,ownerUnitId,startDate,targetEndDate,actualEndDate',
                'assignee:id,name,roleType,avatarUrl',
            ])
            ->orderBy('targetCompletion');

        // Scope guard (C1): non-eksekutif hanya melihat task miliknya / yang ia
        // buat, atau task pada program yang unit pemiliknya ada di scope-nya.
        // Mirror assertCanModifyTask → read == himpunan yang bisa dimodifikasi,
        // tidak ada kebocoran lintas-direktorat lewat board.
        if (!$scope->isExecutive) {
            $unitIds = $scope->unitIds;
            $query->where(function ($q) use ($unitIds, $user) {
                $q->where('assignedTo', $user->id)
                  ->orWhere('createdBy', $user->id);
                if (!empty($unitIds)) {
                    $q->orWhereHas('workstream.program', fn ($p) => $p->whereIn('ownerUnitId', $unitIds));
                }
            });
        }

        $tasks = $query->get();

        return response()->json([
            'data' => $tasks,
            'groups' => $tasks
                ->groupBy('status')
                ->map(fn ($items, $status) => [
                    'status' => $status,
                    'count' => $items->count(),
                    'items' => $items->values(),
                ])
                ->values(),
            'total' => $tasks->count(),
        ]);
    }

    public function show(Request $request, int $id)
    {
        $task = $this->taskService->findOrFail($id);
        $this->assertCanSeeTask($task, $request->user());
        if ($request->expectsJson()) {
            return response()->json(['data' => [
                ...$task->toArray(),
                'comments' => [],
                'subTasks' => SubTask::query()->where('workItemId', $id)->get(),
            ]]);
        }

        return Inertia::render('TaskDetailView', ['task' => $task]);
    }

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Your role is not allowed to perform this action.');
        }
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'You do not have permission to create a work item.');
        }

        $data = $request->validate([
            'title' => 'required|string|min:2|max:200',
            'description' => 'nullable|string|max:2000',
            'workstreamId' => 'required|integer', // maps to initiativeId
            'status' => 'nullable|in:BACKLOG,READY,IN_PROGRESS,IN_REVIEW,BLOCKED,COMPLETED',
            'priority' => 'in:LOW,MEDIUM,HIGH,CRITICAL',
            'targetCompletion' => 'required|date',
            'startDate' => 'nullable|date',
            'assignedTo' => 'nullable|integer|exists:User,id',
            'phaseId' => 'nullable|integer',
            'estimatedHours' => 'nullable|numeric',
            'picPersonIds' => 'nullable|array',
        ]);

        // Scope guard (H2): hanya boleh membuat task di program yang unit
        // pemiliknya ada dalam scope user. Tanpa ini, user direktorat lain bisa
        // menyuntik task ke workstream direktorat mana pun (merusak progres yang
        // menggerakkan health & dashboard).
        $ownerUnitId = $this->ownerUnitForWorkstream((int) $data['workstreamId']);
        if (!OrgScope::forUser($request->user())->coversUnit($ownerUnitId)) {
            abort(403, 'You do not have access to create a work item in another unit\'s program.');
        }

        // Rename for table column
        if (isset($data['workstreamId'])) {
            $data['initiativeId'] = $data['workstreamId'];
            unset($data['workstreamId']);
        }

        $task = $this->taskService->create($request->user()->id, $data);
        $this->triggerHealth($task->id);
        BroadcastService::task($task->id, 'created');

        if ($request->expectsJson()) {
            return response()->json(['data' => $task], 201);
        }

        return back()->with('success', 'Task created.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $this->assertCanModifyTask(Task::findOrFail($id), $request->user());

        $data = $request->validate([
            'title' => 'sometimes|string|min:2|max:200',
            'description' => 'nullable|string|max:2000',
            'priority' => 'sometimes|in:LOW,MEDIUM,HIGH,CRITICAL',
            'targetCompletion' => 'nullable|date',
            'startDate' => 'nullable|date',
            'estimatedHours' => 'nullable|numeric',
            'phaseId' => 'nullable|integer',
            'letterIndex' => 'nullable|string|max:5',
            'actualWeeks' => 'nullable|array',
            'picPersonIds' => 'nullable|array',
            'picUnitIds' => 'nullable|array',
        ]);

        $task = $this->taskService->update($id, $data);
        $this->triggerHealth($id);
        BroadcastService::task($id, 'updated');

        if ($request->expectsJson()) {
            return response()->json(['data' => $task]);
        }

        return back()->with('success', 'Task updated.');
    }

    public function updateStatus(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $this->assertCanModifyTask(Task::findOrFail($id), $request->user());

        $data = $request->validate([
            'status'         => 'required|string',
            'note'           => 'nullable|string|max:2000',
            'blockedReason'  => 'nullable|string|max:2000',
            'percentComplete' => 'nullable|integer|min:0|max:100',
        ]);

        $task = $this->taskService->transitionStatus(
            $id,
            $data['status'],
            $request->user()->id,
            $data['note'] ?? null,
            $data['blockedReason'] ?? null,
            $data['percentComplete'] ?? null,
        );
        $this->triggerHealth($id);
        // Broadcast status AKTUAL hasil transisi (bukan string mentah request) —
        // benar secara konstruksi bila logika transisi berubah di masa depan.
        BroadcastService::task($id, 'status-changed', ['status' => $task->status]);

        if ($request->expectsJson()) {
            return response()->json(['data' => Task::findOrFail($id)]);
        }

        return back()->with('success', 'Task status updated.');
    }

    public function statusLog(Request $request, int $id): JsonResponse
    {
        $this->assertCanSeeTask(Task::findOrFail($id), $request->user());

        $logs = WorkItemStatusLog::query()
            ->where('workItemId', $id)
            ->orderByDesc('createdAt')
            ->get(['id', 'fromStatus', 'toStatus', 'byUserId', 'byUserName', 'note', 'createdAt']);

        return response()->json(['data' => $logs]);
    }

    public function updateProgress(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $this->assertCanModifyTask(Task::findOrFail($id), $request->user());

        $data = $request->validate([
            'percentComplete' => 'required|integer|min:0|max:100',
            'note'            => 'nullable|string|max:2000',
        ]);

        $this->taskService->updateProgress(
            $id,
            $data['percentComplete'],
            $request->user()->id,
            $data['note'] ?? null,
        );
        $this->triggerHealth($id);
        BroadcastService::task($id, 'progress-changed', ['percent' => $data['percentComplete']]);

        if ($request->expectsJson()) {
            return response()->json(['data' => Task::findOrFail($id)]);
        }

        return back()->with('success', 'Task progress updated.');
    }

    public function assign(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $this->assertCanModifyTask(Task::findOrFail($id), $request->user());

        $data = $request->validate(['assignedTo' => 'nullable|integer|exists:User,id']);
        Task::query()->where('id', $id)->update(['assignedTo' => $data['assignedTo']]);

        if ($request->expectsJson()) {
            return response()->json(['data' => Task::findOrFail($id)]);
        }

        return back()->with('success', 'Task assigned.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $task = Task::findOrFail($id);
        $user = $request->user();
        $canDelete = RolePolicy::isAdminOrAbove($user->roleType)
            || RolePolicy::norm($user->roleType) === 'kadiv'
            || $task->createdBy === $user->id
            || $task->assignedTo === $user->id;

        if (!$canDelete) abort(403, 'You do not have access to delete this work item.');

        $workstreamId = $task->initiativeId;
        $this->taskService->delete($id, $user->id);
        $this->taskService->recomputeWorkstreamProgress($workstreamId);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Task deleted.');
    }

    // ── SubTask ───────────────────────────────────────────────────────────────

    public function storeSubTask(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Your role is not allowed to perform this action.');
        }

        $data = $request->validate([
            'title' => 'required|string|max:200',
            'description' => 'nullable|string',
            'dueDate' => 'nullable|date',
        ]);

        $subTask = SubTask::create([...$data, 'workItemId' => $id, 'assignedTo' => $request->user()->id]);
        $this->taskService->recomputeFromSubTasks($id, $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['data' => $subTask], 201);
        }

        return back()->with('success', 'Sub-task added.');
    }

    public function destroySubTask(Request $request, int $id, int $subTaskId): JsonResponse|RedirectResponse
    {
        SubTask::query()->where('id', $subTaskId)->where('workItemId', $id)->delete();
        $this->taskService->recomputeFromSubTasks($id, $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Sub-task deleted.');
    }

    public function toggleSubTask(Request $request, int $id, int $subTaskId): JsonResponse|RedirectResponse
    {
        $subTask = $this->taskService->toggleSubTask($subTaskId, $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['data' => $subTask]);
        }

        return back();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Gate mutasi task per-direktorat. Sebelumnya update/status/progress/assign
     * hanya cek isReadOnly → user non-BOD mana pun bisa mengubah task program/
     * divisi LAIN (merusak integritas progres yang menggerakkan health & dashboard).
     * Izinkan: admin, pembuat/PIC task, atau user yang scope-nya mencakup unit
     * pemilik program task. Blokir lintas-direktorat.
     */
    private function assertCanModifyTask(Task $task, User $user): void
    {
        if (RolePolicy::isReadOnly($user->roleType)) {
            abort(403, 'Your role is not allowed to perform this action.');
        }
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;
        if ($task->createdBy === $user->id || $task->assignedTo === $user->id) return;

        if (OrgScope::forUser($user)->coversUnit($this->ownerUnitForTask($task))) {
            return;
        }

        abort(403, 'You do not have access to modify a work item that belongs to another unit.');
    }

    /**
     * Versi read-only dari assertCanModifyTask (H4): boleh MEMBACA task bila
     * admin/eksekutif, pembuat/PIC, atau scope unit-nya mencakup unit pemilik
     * program. Tidak mengecek isReadOnly — BOD/role read-only tetap boleh baca.
     */
    private function assertCanSeeTask(Task $task, User $user): void
    {
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;
        if ($task->createdBy === $user->id || $task->assignedTo === $user->id) return;

        if (OrgScope::forUser($user)->coversUnit($this->ownerUnitForTask($task))) {
            return;
        }

        abort(403, 'You do not have access to this work item.');
    }

    /**
     * Resolve unit pemilik program lewat query Workstream terpisah — JANGAN
     * andalkan relasi yang sudah ter-load di $task: findOrFail() mem-eager-load
     * workstream.program TANPA kolom ownerUnitId, sehingga loadMissing() jadi
     * no-op dan ownerUnitId selalu null (false-403). Query terpisah juga tidak
     * menimpa bentuk relasi yang dipakai response show().
     */
    private function ownerUnitForTask(Task $task): ?int
    {
        return $this->ownerUnitForWorkstream((int) $task->initiativeId);
    }

    private function ownerUnitForWorkstream(int $workstreamId): ?int
    {
        $ownerUnitId = Workstream::query()
            ->with('program:id,ownerUnitId')
            ->find($workstreamId)?->program?->ownerUnitId;
        return $ownerUnitId !== null ? (int) $ownerUnitId : null;
    }

    private function triggerHealth(int $taskId): void
    {
        $task = Task::query()->with('workstream:id,programId')->find($taskId);
        if ($task?->workstream) {
            $this->taskService->recomputeWorkstreamProgress($task->workstream->id);
            // Broadcast cascade: task progress berubah → workstream progress
            // berubah → FE workstream view & program detail perlu refresh.
            BroadcastService::workstream($task->workstream->id, 'progress-recomputed', [
                'programId' => $task->workstream->programId,
            ]);
        }
        if ($task?->workstream?->programId) {
            rescue(fn () => $this->healthService->recompute($task->workstream->programId));
            // Broadcast program:changed supaya ProgramsView list + ProgramDetail
            // Ringkasan tab refresh progress + healthStatus.
            BroadcastService::program($task->workstream->programId, 'progress-recomputed', [
                'taskId' => $taskId,
            ]);
        }
    }
}
