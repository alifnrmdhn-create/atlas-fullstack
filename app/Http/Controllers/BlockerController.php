<?php

namespace App\Http\Controllers;

use App\Models\Blocker;
use App\Models\Task;
use App\Services\BroadcastService;
use App\Services\ProgramHealthService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class BlockerController extends Controller
{
    public function __construct(private ProgramHealthService $healthService) {}

    public function index(Request $request)
    {
        $status = $request->query('status');
        $query = Blocker::query()
            ->with([
                'task:id,code,title,initiativeId',
                'task.workstream:id,name,programId',
                'task.workstream.program:id,code,name',
                'creator:id,name',
                'assignee:id,name',
            ])
            ->orderByRaw("CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END")
            ->orderBy('createdAt');

        if ($status) $query->where('status', $status);

        return response()->json(['data' => $query->get(), 'total' => $query->count()]);
    }

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate([
            'taskId' => 'required|integer',
            'title' => 'required|string|min:3|max:120',
            'description' => 'nullable|string|max:400',
            'severity' => 'required|in:CRITICAL,HIGH,MEDIUM,LOW',
        ]);

        $code = 'BLK-' . strtoupper(substr(md5(uniqid()), 0, 6));
        $blocker = Blocker::create([
            ...$data,
            'code' => $code,
            'workItemId' => $data['taskId'],
            'createdBy' => $request->user()->id,
            'status' => 'OPEN',
            'priority' => 'HIGH',
        ]);

        // Mark task as blocked
        Task::query()->where('id', $data['taskId'])->update(['isBlocked' => true]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $blocker], 201);
        }

        return back()->with('success', 'Blocker ditambahkan.');
    }

    public function updateStatus(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $data = $request->validate([
            'status' => 'required|in:OPEN,IN_PROGRESS,RESOLVED',
            'resolution' => 'nullable|string|max:500',
        ]);

        $blocker = Blocker::findOrFail($id);
        $updateData = ['status' => $data['status']];
        if ($data['status'] === 'RESOLVED') {
            $updateData['resolvedAt'] = now();
            $updateData['resolution'] = $data['resolution'] ?? null;
        }

        $blocker->update($updateData);

        // Auto-unblock task when all blockers resolved
        if ($data['status'] === 'RESOLVED') {
            $openCount = Blocker::query()
                ->where('workItemId', $blocker->workItemId)
                ->whereIn('status', ['OPEN', 'IN_PROGRESS'])
                ->count();

            if ($openCount === 0) {
                Task::query()->where('id', $blocker->workItemId)->update(['isBlocked' => false]);
            }

            // Trigger health recompute
            $task = Task::query()->with('workstream:id,programId')->find($blocker->workItemId);
            if ($task?->workstream?->programId) {
                rescue(fn () => $this->healthService->recompute($task->workstream->programId));
            }
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $blocker->fresh()]);
        }

        return back()->with('success', 'Status blocker diperbarui.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $blocker = Blocker::findOrFail($id);
        $user = $request->user();
        $canEdit = RolePolicy::isAdminOrAbove($user->roleType)
            || RolePolicy::norm($user->roleType) === 'kadiv'
            || $blocker->createdBy === $user->id
            || $blocker->assignedTo === $user->id;

        if (!$canEdit) abort(403, 'Hanya pembuat atau assignee blocker yang dapat mengubah ini.');

        $data = $request->validate([
            'title' => 'sometimes|string|min:3|max:120',
            'description' => 'nullable|string|max:400',
            'severity' => 'sometimes|in:CRITICAL,HIGH,MEDIUM,LOW',
            'assignedTo' => 'nullable|integer',
        ]);

        $blocker->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $blocker->fresh()]);
        }

        return back()->with('success', 'Blocker diperbarui.');
    }

    /**
     * Sprint 3 — Inline edit countermeasure dari panel PICA.
     *
     * Mengubah Blocker.resolution tanpa mengubah status (beda dengan
     * updateStatus yang trigger RESOLVED). Permission: organizer meeting,
     * blocker assignee, blocker creator, atau KADIV+.
     *
     * Optimistic locking: client kirim `expectedUpdatedAt` (ISO). Kalau
     * tidak match, return 409 — frontend wajib refresh + merge.
     */
    public function updateResolution(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (RolePolicy::isReadOnly($user->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $blocker = Blocker::findOrFail($id);

        $canEdit = RolePolicy::isAdminOrAbove($user->roleType)
            || RolePolicy::norm($user->roleType) === 'kadiv'
            || $blocker->createdBy === $user->id
            || $blocker->assignedTo === $user->id;

        if (!$canEdit) {
            abort(403, 'Hanya pembuat, assignee, atau KADIV+ yang dapat mengubah countermeasure.');
        }

        $data = $request->validate([
            'resolution'        => 'required|string|max:2000',
            'expectedUpdatedAt' => 'nullable|date',
        ]);

        // Optimistic locking — protect against concurrent edit
        if (!empty($data['expectedUpdatedAt'])) {
            $serverIso = $blocker->updatedAt?->toIso8601String();
            $clientIso = (new \DateTimeImmutable($data['expectedUpdatedAt']))->format(\DateTimeInterface::ATOM);
            if ($serverIso && $serverIso !== $clientIso) {
                return response()->json([
                    'message' => 'Perubahan rekan kerja masuk lebih dulu. Refresh untuk lihat versi terbaru.',
                    'currentResolution' => $blocker->resolution,
                    'currentUpdatedAt'  => $serverIso,
                ], 409);
            }
        }

        $blocker->update(['resolution' => $data['resolution']]);

        // Broadcast ke semua user — frontend filter berdasarkan blocker.id
        BroadcastService::blocker($blocker->id, 'resolution-updated', [
            'resolution' => $blocker->resolution,
            'updatedBy'  => ['id' => $user->id, 'name' => $user->name],
            'updatedAt'  => $blocker->updatedAt?->toIso8601String(),
        ]);

        return response()->json(['data' => $blocker->fresh()]);
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (RolePolicy::isReadOnly($request->user()->roleType)) {
            abort(403, 'Role Anda tidak diizinkan melakukan aksi ini.');
        }

        $blocker = Blocker::findOrFail($id);
        $taskId = $blocker->workItemId;
        $blocker->delete();

        $openCount = Blocker::query()
            ->where('workItemId', $taskId)
            ->whereIn('status', ['OPEN', 'IN_PROGRESS'])
            ->count();

        if ($openCount === 0) {
            Task::query()->where('id', $taskId)->update(['isBlocked' => false]);
        }

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Blocker dihapus.');
    }
}
