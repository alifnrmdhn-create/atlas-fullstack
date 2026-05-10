<?php

namespace App\Services;

use App\Models\Blocker;
use App\Models\EntityPic;
use App\Models\SubTask;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkItemStatusLog;
use App\Models\Workstream;
use Illuminate\Support\Facades\DB;

class TaskService
{
    /** Valid status transitions (port dari tasks.ts VALID_TRANSITIONS). */
    private const TRANSITIONS = [
        'BACKLOG'     => ['READY', 'IN_PROGRESS'],
        'READY'       => ['IN_PROGRESS', 'BACKLOG'],
        'IN_PROGRESS' => ['IN_REVIEW', 'BLOCKED', 'COMPLETED', 'READY'],
        'IN_REVIEW'   => ['COMPLETED', 'IN_PROGRESS'],
        'BLOCKED'     => ['IN_PROGRESS', 'COMPLETED'],
        'COMPLETED'   => ['IN_PROGRESS'],
    ];

    public function findOrFail(int $id): Task
    {
        return Task::query()
            ->with([
                'workstream:id,name,programId,code',
                'workstream.program:id,code,name,approvalStatus',
                'assignee:id,name,avatarUrl',
                'blockers',
                'entityPics',
            ])
            ->findOrFail($id);
    }

    public function create(int $creatorId, array $data): Task
    {
        $code = 'WI-' . strtoupper(substr(md5(uniqid()), 0, 6));
        $picPersonIds = $data['picPersonIds'] ?? [];
        unset($data['picPersonIds']);

        $task = Task::create([
            ...$data,
            'code' => $data['code'] ?? $code,
            'createdBy' => $creatorId,
            'percentComplete' => 0,
            'isBlocked' => false,
            'plannedWeeks' => $this->derivePlannedWeeks(
                isset($data['startDate']) ? new \DateTime($data['startDate']) : null,
                isset($data['targetCompletion']) ? new \DateTime($data['targetCompletion']) : null,
            ),
        ]);

        if (!empty($picPersonIds)) {
            EntityPic::syncForEntity('WorkItem', $task->id, $picPersonIds);
        }

        $task->load('entityPics');
        return $task;
    }

    public function update(int $id, array $data): Task
    {
        $picPersonIds = array_key_exists('picPersonIds', $data) ? $data['picPersonIds'] : null;
        unset($data['picPersonIds']);

        $task = Task::findOrFail($id);

        // Re-derive plannedWeeks if dates change
        if (isset($data['startDate']) || isset($data['targetCompletion'])) {
            $start = isset($data['startDate'])
                ? ($data['startDate'] ? new \DateTime($data['startDate']) : null)
                : ($task->startDate ? $task->startDate->toDateTime() : null);
            $end = isset($data['targetCompletion'])
                ? ($data['targetCompletion'] ? new \DateTime($data['targetCompletion']) : null)
                : $task->targetCompletion->toDateTime();
            $data['plannedWeeks'] = $this->derivePlannedWeeks($start, $end);
        }

        $task->update($data);

        if ($picPersonIds !== null) {
            EntityPic::syncForEntity('WorkItem', $id, $picPersonIds ?? []);
        }

        return $task->fresh(['entityPics']);
    }

    /** Validate + apply status transition. Returns updated Task. */
    public function transitionStatus(int $id, string $newStatus, int $userId): Task
    {
        $task = Task::query()
            ->with(['workstream.program:id,approvalStatus'])
            ->findOrFail($id);

        $allowed = self::TRANSITIONS[$task->status] ?? [];
        if (!in_array($newStatus, $allowed, true)) {
            abort(400, "Tidak bisa pindah dari status {$task->status} ke {$newStatus}.");
        }

        // Cek lifecycle phase
        $approvalStatus = $task->workstream?->program?->approvalStatus ?? 'DRAFT';
        if (in_array($approvalStatus, ['DRAFT', 'PENDING_KASUB', 'PENDING_KADIV'], true)) {
            $planningAllowed = ['BACKLOG', 'READY'];
            if (!in_array($newStatus, $planningAllowed, true)) {
                abort(409, 'Program masih dalam fase Perencanaan. Status task hanya bisa BACKLOG atau READY.');
            }
        }

        $fromStatus = $task->status;
        $update = ['status' => $newStatus];
        if ($newStatus === 'COMPLETED' && !$task->actualCompletion) {
            $update['actualCompletion'] = now();
        } elseif ($newStatus !== 'COMPLETED' && $task->status === 'COMPLETED') {
            $update['actualCompletion'] = null;
        }

        DB::transaction(function () use ($task, $update, $fromStatus, $newStatus, $userId) {
            $task->update($update);
            $this->writeStatusLog($task->id, $fromStatus, $newStatus, $userId, null);
        });

        return $task->fresh();
    }

    /** Update percentComplete + auto-transition to COMPLETED if 100%. */
    public function updateProgress(int $id, int $percent, int $userId): Task
    {
        $task = Task::findOrFail($id);
        $data = ['percentComplete' => $percent];
        $fromStatus = $task->status;
        $autoTransition = false;

        if ($percent === 100 && $task->status !== 'COMPLETED') {
            $allowed = self::TRANSITIONS[$task->status] ?? [];
            if (in_array('COMPLETED', $allowed, true)) {
                $data['status'] = 'COMPLETED';
                if (!$task->actualCompletion) {
                    $data['actualCompletion'] = now();
                }
                $autoTransition = true;
            }
        }

        DB::transaction(function () use ($task, $data, $autoTransition, $fromStatus, $userId) {
            $task->update($data);
            if ($autoTransition) {
                $this->writeStatusLog(
                    $task->id,
                    $fromStatus,
                    'COMPLETED',
                    $userId,
                    'Auto-complete saat progres mencapai 100%.',
                );
            }
        });

        return $task->fresh();
    }

    /** Append-only audit entry untuk transisi status. Dipanggil dalam transaksi. */
    private function writeStatusLog(
        int $workItemId,
        ?string $fromStatus,
        string $toStatus,
        int $userId,
        ?string $note,
    ): void {
        $userName = User::query()->where('id', $userId)->value('name');
        WorkItemStatusLog::create([
            'workItemId' => $workItemId,
            'fromStatus' => $fromStatus,
            'toStatus'   => $toStatus,
            'byUserId'   => $userId,
            'byUserName' => $userName,
            'note'       => $note,
        ]);
    }

    /** Recalculate workstream progress from average of task percentComplete. */
    public function recomputeWorkstreamProgress(int $workstreamId): void
    {
        $avg = Task::query()
            ->where('initiativeId', $workstreamId)
            ->avg('percentComplete');

        if ($avg !== null) {
            Workstream::query()
                ->where('id', $workstreamId)
                ->update(['progressPercent' => (int) round((float) $avg)]);
        }
    }

    /** Toggle subtask completion + recalculate task percentComplete. */
    public function toggleSubTask(int $subTaskId): SubTask
    {
        $sub = SubTask::findOrFail($subTaskId);
        $sub->update([
            'isCompleted' => !$sub->isCompleted,
            'completedAt' => !$sub->isCompleted ? now() : null,
        ]);

        $this->recomputeFromSubTasks($sub->workItemId);
        return $sub->fresh();
    }

    /** Recalculate task percentComplete from its subtasks. */
    public function recomputeFromSubTasks(int $taskId): void
    {
        $subs = SubTask::query()->where('workItemId', $taskId)->get(['isCompleted']);
        if ($subs->isEmpty()) return;

        $pct = (int) round($subs->where('isCompleted', true)->count() / $subs->count() * 100);
        $data = ['percentComplete' => $pct];

        if ($pct === 100) {
            $task = Task::find($taskId);
            $allowed = self::TRANSITIONS[$task?->status ?? ''] ?? [];
            if (in_array('COMPLETED', $allowed, true)) {
                $data['status'] = 'COMPLETED';
            }
        }

        Task::query()->where('id', $taskId)->update($data);
    }

    /** Auto-unblock task ketika semua blocker resolved. */
    public function maybeUnblockTask(int $taskId): void
    {
        $openCount = Blocker::query()
            ->where('workItemId', $taskId)
            ->whereIn('status', ['OPEN', 'IN_PROGRESS'])
            ->count();

        if ($openCount === 0) {
            Task::query()->where('id', $taskId)->update(['isBlocked' => false]);
        }
    }

    public function delete(int $id, int $userId): void
    {
        Task::destroy($id);
    }

    /**
     * Derive planned weeks dari startDate → targetCompletion.
     * Returns array of ISO week strings: ['2026-W10', '2026-W11', ...]
     * Port dari backend/src/lib/weeks.ts → derivePlannedWeeks().
     */
    public function derivePlannedWeeks(?\DateTime $start, ?\DateTime $end): ?array
    {
        if (!$start || !$end || $end < $start) return null;

        $weeks = [];
        $current = clone $start;
        $current->modify('Monday this week');

        $endMonday = clone $end;
        $endMonday->modify('Monday this week');

        while ($current <= $endMonday) {
            $weeks[] = $current->format('Y-\WW');
            $current->modify('+1 week');
        }

        return empty($weeks) ? null : $weeks;
    }
}
