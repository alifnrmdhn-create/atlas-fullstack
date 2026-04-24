<?php

namespace App\Http\Controllers;

use App\Models\Blocker;
use App\Models\SubTask;
use App\Models\Task;
use App\Services\BroadcastService;
use App\Services\ProgramHealthService;
use App\Services\TaskService;
use App\Support\RolePolicy;
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

    public function show(int $id): Response
    {
        $task = $this->taskService->findOrFail($id);
        return Inertia::render('TaskDetailView', ['task' => $task]);
    }

    public function store(Request $request): RedirectResponse
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
            'priority' => 'in:LOW,MEDIUM,HIGH,CRITICAL',
            'targetCompletion' => 'required|date',
            'startDate' => 'nullable|date',
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

        return back()->with('success', 'Task berhasil dibuat.');
    }

    public function update(Request $request, int $id): RedirectResponse
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

        $this->taskService->update($id, $data);
        $this->triggerHealth($id);
        BroadcastService::task($id, 'updated');

        return back()->with('success', 'Task diperbarui.');
    }

    public function updateStatus(Request $request, int $id): RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate(['status' => 'required|string']);
        $this->taskService->transitionStatus($id, $data['status'], $request->user()->id);
        $this->triggerHealth($id);
        BroadcastService::task($id, 'status-changed', ['status' => $data['status']]);

        return back()->with('success', 'Status task diperbarui.');
    }

    public function updateProgress(Request $request, int $id): RedirectResponse
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

        return back()->with('success', 'Progress task diperbarui.');
    }

    public function assign(Request $request, int $id): RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate(['assignedTo' => 'nullable|integer']);
        Task::query()->where('id', $id)->update(['assignedTo' => $data['assignedTo']]);

        return back()->with('success', 'Task di-assign.');
    }

    public function destroy(Request $request, int $id): RedirectResponse
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

        return back()->with('success', 'Task dihapus.');
    }

    // ── SubTask ───────────────────────────────────────────────────────────────

    public function storeSubTask(Request $request, int $id): RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate([
            'title' => 'required|string|max:200',
            'description' => 'nullable|string',
            'dueDate' => 'nullable|date',
        ]);

        SubTask::create([...$data, 'workItemId' => $id, 'assignedTo' => $request->user()->id]);
        $this->taskService->recomputeFromSubTasks($id);

        return back()->with('success', 'Sub-task ditambahkan.');
    }

    public function destroySubTask(Request $request, int $id, int $subTaskId): RedirectResponse
    {
        SubTask::query()->where('id', $subTaskId)->where('workItemId', $id)->delete();
        $this->taskService->recomputeFromSubTasks($id);
        return back()->with('success', 'Sub-task dihapus.');
    }

    public function toggleSubTask(Request $request, int $id, int $subTaskId): RedirectResponse
    {
        $this->taskService->toggleSubTask($subTaskId);
        return back();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function triggerHealth(int $taskId): void
    {
        $task = Task::query()->with('workstream:id,programId')->find($taskId);
        if ($task?->workstream) {
            $this->taskService->recomputeWorkstreamProgress($task->workstream->id);
        }
        if ($task?->workstream?->programId) {
            rescue(fn () => $this->healthService->recompute($task->workstream->programId));
        }
    }
}
