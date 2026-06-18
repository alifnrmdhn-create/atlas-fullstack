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
    /** Valid status transitions — hybrid permissive (2026-05-21 refactor).
     *  Forward flow normal, skip allowed (dengan prereq), backward allowed
     *  (dengan reason). Compliance + audit log handled by controller, bukan
     *  hard-block di transition map. */
    private const TRANSITIONS = [
        // BACKLOG: skip semua allowed (urgent task, pre-existing data, dll)
        'BACKLOG'     => ['READY', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'],
        // READY: forward atau revert ke BACKLOG, skip ke COMPLETED juga allowed
        'READY'       => ['IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BACKLOG', 'BLOCKED'],
        // IN_PROGRESS: forward / skip / revert
        'IN_PROGRESS' => ['IN_REVIEW', 'COMPLETED', 'READY', 'BACKLOG', 'BLOCKED'],
        // IN_REVIEW: forward atau revert (reject review)
        'IN_REVIEW'   => ['COMPLETED', 'IN_PROGRESS', 'READY', 'BACKLOG'],
        // BLOCKED legacy: tetap allowed transition (BLOCKED column hilang dari
        // FE, tapi data lama bisa tetap di-update). Per refactor, isBlocked
        // jadi flag orthogonal — transition BLOCKED→X umumnya clear blocker.
        'BLOCKED'     => ['IN_PROGRESS', 'READY', 'COMPLETED', 'BACKLOG'],
        // COMPLETED: reopen allowed ke status manapun (per user spec)
        'COMPLETED'   => ['IN_PROGRESS', 'READY', 'BACKLOG', 'IN_REVIEW'],
    ];

    /** Canonical forward order untuk detect backward transition. BLOCKED
     *  dikecualikan (orthogonal). Backward = target_order < current_order. */
    private const STATUS_ORDER = [
        'BACKLOG'     => 0,
        'READY'       => 1,
        'IN_PROGRESS' => 2,
        'IN_REVIEW'   => 3,
        'COMPLETED'   => 4,
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

        // Sync Task.assignedTo dengan primary PIC (mirror logic di update()).
        // Defensive: kalau caller send picPersonIds tanpa explicit assignedTo,
        // assignedTo otherwise akan null walaupun EntityPic terisi — bug yang
        // sama persis dengan yang sebelumnya di update path. Single source of
        // truth: primary PIC selalu masuk ke Task.assignedTo.
        if (!empty($picPersonIds) && !isset($data['assignedTo'])) {
            $data['assignedTo'] = $picPersonIds[0];
        }

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

        // Re-derive plannedWeeks if dates change — KECUALI plannedWeeks dikirim
        // eksplisit (editor "Weekly Plan" di Task Detail). FIX (audit 2026-06-17):
        // plan manual menang & tidak ditimpa auto-derive; TaskPlanningPanel yang
        // tak mengirim plannedWeeks tetap auto-derive saat tanggal berubah.
        if (!array_key_exists('plannedWeeks', $data)
            && (isset($data['startDate']) || isset($data['targetCompletion']))) {
            $start = isset($data['startDate'])
                ? ($data['startDate'] ? new \DateTime($data['startDate']) : null)
                : ($task->startDate ? $task->startDate->toDateTime() : null);
            $end = isset($data['targetCompletion'])
                ? ($data['targetCompletion'] ? new \DateTime($data['targetCompletion']) : null)
                : $task->targetCompletion->toDateTime();
            $data['plannedWeeks'] = $this->derivePlannedWeeks($start, $end);
        }

        // Sync Task.assignedTo dengan primary PIC (first picPersonId). Banyak
        // query baca Task.assignedTo langsung (workstream detail, MyWork, dll),
        // sehingga primary PIC harus tersimpan di kolom assignedTo selain di
        // EntityPic polymorphic table. Tanpa sync ini, planning panel save
        // hanya update EntityPic — UI lain (task row) tampil "Belum ditugaskan"
        // meski user sudah pilih.
        if ($picPersonIds !== null) {
            $data['assignedTo'] = !empty($picPersonIds) ? $picPersonIds[0] : null;
        }

        $task->update($data);

        if ($picPersonIds !== null) {
            EntityPic::syncForEntity('WorkItem', $id, $picPersonIds ?? []);
        }

        return $task->fresh(['entityPics']);
    }

    /**
     * Validate + apply status transition. Returns updated Task.
     *
     * @param ?string $note Optional context dari drag prompt — disimpan ke status log
     * @param ?string $blockedReason Mandatory kalau status=BLOCKED — save ke Task.blockedReason
     * @param ?int $percentComplete Optional: auto-set 100 saat ke COMPLETED dari workspace drag
     */
    public function transitionStatus(
        int $id,
        string $newStatus,
        int $userId,
        ?string $note = null,
        ?string $blockedReason = null,
        ?int $percentComplete = null,
    ): Task {
        $task = Task::query()
            ->with(['workstream.program:id,approvalStatus'])
            ->findOrFail($id);

        $allowed = self::TRANSITIONS[$task->status] ?? [];
        if (!in_array($newStatus, $allowed, true)) {
            abort(400, "Cannot move from status {$task->status} to {$newStatus}.");
        }

        // Prereq check: non-Backlog status butuh PIC + targetCompletion minimum.
        // READY butuh juga startDate. Audit-grade enforcement — FE check bisa
        // di-bypass, jadi server jadi source of truth.
        $missing = [];
        if (in_array($newStatus, ['READY', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'], true)) {
            if (! $task->assignedTo) $missing[] = 'PIC not assigned';
            if (! $task->targetCompletion) $missing[] = 'Target completion date not set';
            if ($newStatus === 'READY' && ! $task->startDate) {
                $missing[] = 'Start date not set';
            }
        }
        if (! empty($missing)) {
            abort(422, 'Cannot change status yet — complete the prerequisites: ' . implode(', ', $missing));
        }

        // Backward transition: target_order < current_order → wajib alasan
        // (note) untuk audit trail. Tanpa ini, user bisa silent-revert tanpa
        // jejak kenapa.
        $fromOrder = self::STATUS_ORDER[$task->status] ?? null;
        $toOrder = self::STATUS_ORDER[$newStatus] ?? null;
        $isBackward = $fromOrder !== null && $toOrder !== null && $toOrder < $fromOrder;
        if ($isBackward && (! $note || trim($note) === '')) {
            abort(422, "Reverting the status from {$task->status} to {$newStatus} requires a reason for the audit log.");
        }

        // Cek lifecycle phase
        $approvalStatus = $task->workstream?->program?->approvalStatus ?? 'DRAFT';
        if (in_array($approvalStatus, ['DRAFT', 'PENDING_KASUB', 'PENDING_KADIV'], true)) {
            $planningAllowed = ['BACKLOG', 'READY'];
            if (!in_array($newStatus, $planningAllowed, true)) {
                abort(409, 'The program is still in the Planning phase. Task status can only be BACKLOG or READY.');
            }
        }

        // WIP limit (Daily PIC Workspace): block kalau user assignee sudah penuh
        if ($newStatus === 'IN_PROGRESS' && $task->status !== 'IN_PROGRESS' && $task->assignedTo) {
            $limit = (int) config('atlas-thresholds.wip.in_progress_per_user', 5);
            $current = Task::query()
                ->where('assignedTo', $task->assignedTo)
                ->where('status', 'IN_PROGRESS')
                ->where('id', '!=', $task->id)
                ->count();
            if ($current >= $limit) {
                abort(409, "WIP limit reached: the assignee already has {$current} IN_PROGRESS tasks (limit {$limit}). Complete other tasks before starting a new one.");
            }
        }

        $fromStatus = $task->status;
        $update = ['status' => $newStatus];
        if ($newStatus === 'COMPLETED' && !$task->actualCompletion) {
            $update['actualCompletion'] = now();
        } elseif ($newStatus !== 'COMPLETED' && $task->status === 'COMPLETED') {
            $update['actualCompletion'] = null;
        }
        if ($percentComplete !== null) {
            $update['percentComplete'] = $percentComplete;
        }
        if ($newStatus === 'BLOCKED') {
            $update['isBlocked'] = true;
            if ($blockedReason !== null && $blockedReason !== '') {
                $update['blockedReason'] = $blockedReason;
            }
        } elseif ($task->status === 'BLOCKED' && $newStatus !== 'BLOCKED') {
            $update['isBlocked'] = false;
        }

        DB::transaction(function () use ($task, $update, $fromStatus, $newStatus, $userId, $note) {
            $task->update($update);
            $this->writeStatusLog($task->id, $fromStatus, $newStatus, $userId, $note);
        });

        return $task->fresh();
    }

    /**
     * Update percentComplete + auto-derive status berbasis progress.
     *
     * Refactor 2026-05-25 (hapus drag): progress jadi penggerak utama posisi
     * kartu. Slider menggerakkan BACKLOG/READY ↔ IN_PROGRESS ↔ COMPLETED.
     * Execution TIDAK punya jalur review/approval (beda dgn Assignments), jadi
     * tidak ada serah-terima IN_REVIEW. BLOCKED sticky (di-clear via Blockers).
     *
     * @param ?string $note Wajib saat regresi (progress turun → status mundur),
     *                      untuk audit log. Untuk maju otomatis, note di-generate.
     */
    public function updateProgress(int $id, int $percent, int $userId, ?string $note = null): Task
    {
        $task = Task::query()
            ->with(['workstream.program:id,approvalStatus'])
            ->findOrFail($id);

        $fromStatus = $task->status;

        // Prasyarat mulai kerja: progres > 0 (memulai task) butuh PIC + target —
        // konsisten dgn rule transitionStatus ("non-Backlog wajib PIC + target").
        // Tanpa ini, slider bisa mendorong task tanpa PIC ke IN_PROGRESS/COMPLETED.
        if ($percent > 0) {
            $missing = [];
            if (! $task->assignedTo) $missing[] = 'a PIC';
            if (! $task->targetCompletion) $missing[] = 'a target completion date';
            if (! empty($missing)) {
                abort(422, 'Set ' . implode(' & ', $missing) . ' before starting the task (progress > 0%).');
            }
        }

        $data = ['percentComplete' => $percent];

        $newStatus = $this->deriveStatusFromProgress($task, $percent);

        if ($newStatus !== null && $newStatus !== $fromStatus) {
            // Backward (mundur di STATUS_ORDER) wajib alasan — sinkron dengan
            // logic di transitionStatus. Tanpa ini user bisa silent-revert.
            $fromOrder = self::STATUS_ORDER[$fromStatus] ?? null;
            $toOrder = self::STATUS_ORDER[$newStatus] ?? null;
            $isBackward = $fromOrder !== null && $toOrder !== null && $toOrder < $fromOrder;
            if ($isBackward && ($note === null || trim($note) === '')) {
                abort(422, "Lowering progress that reverts the status from {$fromStatus} to {$newStatus} requires a reason for the audit log.");
            }

            // WIP limit saat masuk IN_PROGRESS (mirror transitionStatus).
            if ($newStatus === 'IN_PROGRESS' && $task->assignedTo) {
                $limit = (int) config('atlas-thresholds.wip.in_progress_per_user', 5);
                $current = Task::query()
                    ->where('assignedTo', $task->assignedTo)
                    ->where('status', 'IN_PROGRESS')
                    ->where('id', '!=', $task->id)
                    ->count();
                if ($current >= $limit) {
                    abort(409, "WIP limit reached: the assignee already has {$current} IN_PROGRESS tasks (limit {$limit}). Complete other tasks before logging new progress.");
                }
            }

            $data['status'] = $newStatus;
            if ($newStatus === 'COMPLETED' && !$task->actualCompletion) {
                $data['actualCompletion'] = now();
            } elseif ($newStatus !== 'COMPLETED' && $fromStatus === 'COMPLETED') {
                $data['actualCompletion'] = null;
            }
        }

        $statusChanged = isset($data['status']);
        DB::transaction(function () use ($task, $data, $statusChanged, $fromStatus, $userId, $note) {
            $task->update($data);
            if ($statusChanged) {
                $this->writeStatusLog(
                    $task->id,
                    $fromStatus,
                    $data['status'],
                    $userId,
                    ($note !== null && trim($note) !== '')
                        ? $note
                        : $this->autoProgressNote($fromStatus, $data['status']),
                );
            }
        });

        return $task->fresh();
    }

    /**
     * Selaraskan status task dengan percentComplete-nya (progress-driven).
     * Dipakai untuk rekonsiliasi data lama (era drag, saat status & progress
     * masih independen) via command tasks:reconcile-status. Sticky IN_REVIEW &
     * BLOCKED dilewati. Return status baru jika berubah, null jika tidak.
     */
    public function reconcileStatusFromProgress(Task $task, int $actorId): ?string
    {
        $task->loadMissing('workstream.program:id,approvalStatus');
        $target = $this->deriveStatusFromProgress($task, (int) $task->percentComplete);
        if ($target === null || $target === $task->status) {
            return null;
        }

        $from = $task->status;
        $update = ['status' => $target];
        if ($target === 'COMPLETED' && ! $task->actualCompletion) {
            $update['actualCompletion'] = now();
        } elseif ($target !== 'COMPLETED' && $from === 'COMPLETED') {
            $update['actualCompletion'] = null;
        }

        DB::transaction(function () use ($task, $update, $from, $target, $actorId) {
            $task->update($update);
            $this->writeStatusLog($task->id, $from, $target, $actorId, 'Selaraskan status dengan progres (refactor 2026-05-25).');
        });

        return $target;
    }

    /**
     * Derive status target dari nilai progress. Return null = jangan ubah status.
     * Hanya status "progress-driven" (BACKLOG/READY/IN_PROGRESS/COMPLETED) yang
     * di-derive; IN_REVIEW & BLOCKED dibiarkan (sticky).
     */
    private function deriveStatusFromProgress(Task $task, int $percent): ?string
    {
        $status = $task->status;

        // BLOCKED sticky — di-clear lewat section Blockers (isBlocked flag),
        // bukan slider. IN_REVIEW TIDAK sticky: Execution tak punya jalur review
        // (beda dgn Assignments), jadi status legacy IN_REVIEW ikut dinormalisasi
        // oleh progres (mis. 100→COMPLETED, 1-99→IN_PROGRESS).
        if ($status === 'BLOCKED') {
            return null;
        }

        // Prasyarat READY: PIC + target selesai + tanggal mulai.
        $hasPrereq = $task->assignedTo && $task->targetCompletion && $task->startDate;

        if ($percent >= 100) {
            $target = 'COMPLETED';
        } elseif ($percent <= 0) {
            $target = $hasPrereq ? 'READY' : 'BACKLOG';
        } else {
            $target = 'IN_PROGRESS';
        }

        // Clamp fase perencanaan: hanya BACKLOG/READY yang boleh.
        $approvalStatus = $task->workstream?->program?->approvalStatus ?? 'DRAFT';
        if (in_array($approvalStatus, ['DRAFT', 'PENDING_KASUB', 'PENDING_KADIV'], true)
            && !in_array($target, ['BACKLOG', 'READY'], true)) {
            $target = $hasPrereq ? 'READY' : 'BACKLOG';
        }

        // Defensive: hormati whitelist transition (mis. dari COMPLETED reopen).
        $allowed = self::TRANSITIONS[$status] ?? [];
        if ($target !== $status && !in_array($target, $allowed, true)) {
            return null;
        }

        return $target;
    }

    /** Catatan default untuk status log saat status berubah otomatis dari progres. */
    private function autoProgressNote(string $from, string $to): string
    {
        if ($to === 'COMPLETED') return 'Auto-complete saat progres mencapai 100%.';
        if ($to === 'IN_PROGRESS') return 'Auto-mulai saat progres mulai diisi.';
        return "Status disesuaikan otomatis dari progres ({$from} → {$to}).";
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

    /** Recalculate workstream progress from average of task percentComplete.
     *  Cascade: setelah workstream update, juga recompute parent program supaya
     *  Program.progressPercent (column) tetap fresh — single source of truth
     *  lintas Charter & Program Detail. */
    public function recomputeWorkstreamProgress(int $workstreamId): void
    {
        // Skip CANCELLED — selaras dengan recomputeProgramProgress (audit 2026-06-17).
        // Tanpa ini, task batal ikut menyeret rata-rata progress workstream turun.
        $avg = Task::query()
            ->where('initiativeId', $workstreamId)
            ->whereNotIn('status', ['CANCELLED'])
            ->avg('percentComplete');

        if ($avg !== null) {
            Workstream::query()
                ->where('id', $workstreamId)
                ->update(['progressPercent' => (int) round((float) $avg)]);

            // Cascade ke parent program
            $programId = Workstream::query()->where('id', $workstreamId)->value('programId');
            if ($programId) {
                $this->recomputeProgramProgress($programId);
            }
        }
    }

    /** Recalculate program progress from average of active workstreams.
     *  Dipanggil saat task/workstream berubah supaya Program.progressPercent
     *  column tetap fresh untuk queries (where progressPercent < 70, dst).
     *  CANCELLED workstreams di-skip — tidak count untuk progress. */
    public function recomputeProgramProgress(int $programId): void
    {
        $avg = Workstream::query()
            ->where('programId', $programId)
            ->whereNotIn('status', ['CANCELLED'])
            ->avg('progressPercent');

        \App\Models\Program::query()
            ->where('id', $programId)
            ->update(['progressPercent' => $avg !== null ? (int) round((float) $avg) : 0]);
    }

    /** Toggle subtask completion + recalculate task percentComplete. */
    public function toggleSubTask(int $subTaskId, ?int $userId = null): SubTask
    {
        $sub = SubTask::findOrFail($subTaskId);
        $sub->update([
            'isCompleted' => !$sub->isCompleted,
            'completedAt' => !$sub->isCompleted ? now() : null,
        ]);

        $this->recomputeFromSubTasks($sub->workItemId, $userId);
        return $sub->fresh();
    }

    /** Recalculate task percentComplete from its subtasks. */
    public function recomputeFromSubTasks(int $taskId, ?int $userId = null): void
    {
        $subs = SubTask::query()->where('workItemId', $taskId)->get(['isCompleted']);
        if ($subs->isEmpty()) return;

        $pct = (int) round($subs->where('isCompleted', true)->count() / $subs->count() * 100);
        $data = ['percentComplete' => $pct];
        $autoCompletedFrom = null;

        if ($pct === 100) {
            $task = Task::find($taskId);
            $allowed = self::TRANSITIONS[$task?->status ?? ''] ?? [];
            if ($task && in_array('COMPLETED', $allowed, true)) {
                $data['status'] = 'COMPLETED';
                // Stempel actualCompletion (mirror transitionStatus). Tanpa ini,
                // task auto-complete punya actualCompletion NULL → hilang dari
                // metrik "Tasks done this week" (bug lama yang sudah ada command
                // backfill-nya). Set hanya bila belum ter-set.
                if (!$task->actualCompletion) {
                    $data['actualCompletion'] = now();
                }
                $autoCompletedFrom = $task->status;
            }
        }

        DB::transaction(function () use ($taskId, $data, $autoCompletedFrom, $userId) {
            Task::query()->where('id', $taskId)->update($data);
            // Audit trail: auto-complete dari subtask harus tercatat seperti
            // transisi status manual (dulu update langsung tanpa WorkItemStatusLog
            // → jejak bolong). Lewati hanya bila aktor tak diketahui.
            if ($autoCompletedFrom !== null && $userId !== null) {
                $this->writeStatusLog($taskId, $autoCompletedFrom, 'COMPLETED', $userId, 'Auto-completed: all sub-tasks done');
            }
        });
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
            // Pakai 'o' (ISO-8601 week-numbering year), BUKAN 'Y' (tahun kalender):
            // di batas tahun keduanya berbeda (mis. 2025-12-29 = ISO 2026-W01), dan
            // 'Y-\WW' menghasilkan "2025-W01" yang salah-attribute. Konsisten dengan
            // ExecutionGrid/PerformanceController/ProgramController yang pakai 'o-\WW'.
            $weeks[] = $current->format('o-\WW');
            $current->modify('+1 week');
        }

        return empty($weeks) ? null : $weeks;
    }
}
