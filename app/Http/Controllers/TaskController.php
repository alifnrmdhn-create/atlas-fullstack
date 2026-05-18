<?php

namespace App\Http\Controllers;

use App\Models\Blocker;
use App\Models\SubTask;
use App\Models\Task;
use App\Models\WorkItemStatusLog;
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

    public function index()
    {
        $tasks = Task::query()
            ->with([
                'workstream:id,code,name,programId',
                'workstream.program:id,code,name,healthStatus,approvalStatus,ownerUnitId,startDate,targetEndDate,actualEndDate',
                'assignee:id,name,roleType,avatarUrl',
            ])
            ->orderBy('targetCompletion')
            ->get();

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
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'Tidak memiliki izin membuat work item.');
        }

        $data = $request->validate([
            'title' => 'required|string|min:2|max:200',
            'description' => 'nullable|string|max:2000',
            'workstreamId' => 'required|integer', // maps to initiativeId
            'status' => 'nullable|in:BACKLOG,READY,IN_PROGRESS,IN_REVIEW,BLOCKED,COMPLETED',
            'priority' => 'in:LOW,MEDIUM,HIGH,CRITICAL',
            'targetCompletion' => 'required|date',
            'startDate' => 'nullable|date',
            'assignedTo' => 'nullable|integer',
            'phaseId' => 'nullable|integer',
            'estimatedHours' => 'nullable|numeric',
            'picPersonIds' => 'nullable|array',
        ]);

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

        return back()->with('success', 'Task berhasil dibuat.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

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

        return back()->with('success', 'Task diperbarui.');
    }

    public function updateStatus(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate([
            'status'         => 'required|string',
            'note'           => 'nullable|string|max:2000',
            'blockedReason'  => 'nullable|string|max:2000',
            'percentComplete' => 'nullable|integer|min:0|max:100',
        ]);

        $this->taskService->transitionStatus(
            $id,
            $data['status'],
            $request->user()->id,
            $data['note'] ?? null,
            $data['blockedReason'] ?? null,
            $data['percentComplete'] ?? null,
        );
        $this->triggerHealth($id);
        BroadcastService::task($id, 'status-changed', ['status' => $data['status']]);

        if ($request->expectsJson()) {
            return response()->json(['data' => Task::findOrFail($id)]);
        }

        return back()->with('success', 'Status task diperbarui.');
    }

    public function statusLog(Request $request, int $id): JsonResponse
    {
        Task::findOrFail($id);

        $logs = WorkItemStatusLog::query()
            ->where('workItemId', $id)
            ->orderByDesc('createdAt')
            ->get(['id', 'fromStatus', 'toStatus', 'byUserId', 'byUserName', 'note', 'createdAt']);

        return response()->json(['data' => $logs]);
    }

    /**
     * Daily PIC Workspace: tasks yang saat ini menunggu aksi dari user yang
     * sedang login. Saat ini hanya satu kategori — task IN_REVIEW di
     * workstream dimana user adalah owner (= reviewer default).
     */
    public function waitingForMe(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $reviewQueue = Task::query()
            ->where('status', 'IN_REVIEW')
            ->whereHas('workstream', fn ($q) => $q->where('ownerId', $userId))
            ->with([
                'workstream:id,name,programId,ownerId',
                'workstream.program:id,code,name',
                'assignee:id,name,avatarUrl',
            ])
            ->orderBy('targetCompletion')
            ->get([
                'id', 'code', 'title', 'status', 'priority',
                'percentComplete', 'targetCompletion', 'assignedTo',
                'initiativeId', 'isBlocked',
            ]);

        return response()->json([
            'data' => $reviewQueue->map(fn ($t) => [
                'kind'   => 'review',
                'reason' => 'Task IN_REVIEW di workstream yang Anda pimpin — menunggu approve untuk mark COMPLETED.',
                'task'   => $t,
            ])->values(),
        ]);
    }

    public function updateProgress(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate([
            'percentComplete' => 'required|integer|min:0|max:100',
        ]);

        $this->taskService->updateProgress($id, $data['percentComplete'], $request->user()->id);
        $this->triggerHealth($id);
        BroadcastService::task($id, 'progress-changed', ['percent' => $data['percentComplete']]);

        if ($request->expectsJson()) {
            return response()->json(['data' => Task::findOrFail($id)]);
        }

        return back()->with('success', 'Progress task diperbarui.');
    }

    public function assign(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate(['assignedTo' => 'nullable|integer']);
        Task::query()->where('id', $id)->update(['assignedTo' => $data['assignedTo']]);

        if ($request->expectsJson()) {
            return response()->json(['data' => Task::findOrFail($id)]);
        }

        return back()->with('success', 'Task di-assign.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $task = Task::findOrFail($id);
        $user = $request->user();
        $canDelete = RolePolicy::isAdminOrAbove($user->roleType)
            || RolePolicy::norm($user->roleType) === 'kadiv'
            || $task->createdBy === $user->id
            || $task->assignedTo === $user->id;

        if (!$canDelete) abort(403, 'Tidak memiliki akses untuk menghapus work item ini.');

        $workstreamId = $task->initiativeId;
        $this->taskService->delete($id, $user->id);
        $this->taskService->recomputeWorkstreamProgress($workstreamId);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Task dihapus.');
    }

    // ── SubTask ───────────────────────────────────────────────────────────────

    public function storeSubTask(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate([
            'title' => 'required|string|max:200',
            'description' => 'nullable|string',
            'dueDate' => 'nullable|date',
        ]);

        $subTask = SubTask::create([...$data, 'workItemId' => $id, 'assignedTo' => $request->user()->id]);
        $this->taskService->recomputeFromSubTasks($id);

        if ($request->expectsJson()) {
            return response()->json(['data' => $subTask], 201);
        }

        return back()->with('success', 'Sub-task ditambahkan.');
    }

    public function destroySubTask(Request $request, int $id, int $subTaskId): JsonResponse|RedirectResponse
    {
        SubTask::query()->where('id', $subTaskId)->where('workItemId', $id)->delete();
        $this->taskService->recomputeFromSubTasks($id);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Sub-task dihapus.');
    }

    public function toggleSubTask(Request $request, int $id, int $subTaskId): JsonResponse|RedirectResponse
    {
        $subTask = $this->taskService->toggleSubTask($subTaskId);

        if ($request->expectsJson()) {
            return response()->json(['data' => $subTask]);
        }

        return back();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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
