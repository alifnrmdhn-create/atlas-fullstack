<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\Comment;
use App\Models\EntityPic;
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
            // Kolom board saja (kontrak FE `type Task` di types.ts) — tanpa
            // text/jsonb berat (description/output/plannedWeeks/actualWeeks/
            // dependsOnIds/picUnitIds); detail lengkap via GET /tasks/{id}.
            // Audit 2026-06-11 Task 2.8: payload 283 task 830KB → dipangkas.
            ->select([
                'id', 'code', 'initiativeId', 'title', 'assignedTo', 'createdBy',
                'createdByUnitId', 'status', 'priority', 'percentComplete',
                'startDate', 'targetCompletion', 'actualCompletion',
                'healthStatus', 'isBlocked', 'blockedReason', 'createdAt', 'updatedAt',
            ])
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

        // Cap pertumbuhan board (scale-readiness S2.2): COMPLETED/CANCELLED yang
        // selesai lebih lama dari window tidak dimuat default — board butuh kerja
        // aktif + capaian terkini, bukan histori bertahun. Status aktif selalu
        // dimuat. actualCompletion NULL (tak ber-tanggal) tak disembunyikan.
        // ?scope=all → histori penuh.
        if ($request->query('scope') !== 'all') {
            $windowDays = (int) config('atlas-thresholds.workboard.completed_window_days', 90);
            if ($windowDays > 0) {
                $cutoff = now()->subDays($windowDays);
                $query->where(function ($q) use ($cutoff) {
                    $q->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
                      ->orWhere('actualCompletion', '>=', $cutoff)
                      ->orWhereNull('actualCompletion');
                });
            }
        }

        $tasks = $query->get();

        // Tanpa key `data`: dulu seluruh list diserialisasikan DUA KALI (flat +
        // grouped) padahal FE hanya membaca `groups` — payload 2× gratis.
        return response()->json([
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
                // Komentar diskusi task. Dulu hardcode [] (regresi) → pesan yang
                // sudah tersimpan via POST /tasks/{id}/comments tak pernah muncul
                // setelah reload. Flat array sesuai CommentItem (CommentThreadList
                // menyaring top-level via parentCommentId & menampilkan authorName).
                'comments' => Comment::query()
                    ->where('entityType', 'TASK')
                    ->where('entityId', $id)
                    ->with('author:id,name,roleType,positionTitle,avatarUrl')
                    ->orderBy('createdAt')
                    ->get()
                    ->map(function (Comment $c) {
                        $arr = $c->toArray();
                        $arr['authorName'] = $c->author?->name;
                        $arr['authorRole'] = $c->author?->positionTitle ?? $c->author?->roleType;
                        $arr['authorAvatarUrl'] = $c->author?->avatarUrl;
                        // reactions kolom nullable → cast 'array' bisa null. FE
                        // (CommentThreadList) mengakses reactions[':thumbsup:'] →
                        // crash kalau null. Jamin selalu objek (kontrak CommentItem
                        // = Record<string, number[]>). Sama untuk replyCount.
                        $arr['reactions'] = (object) ($c->reactions ?? []);
                        $arr['replyCount'] = (int) ($c->replyCount ?? 0);
                        unset($arr['author']);
                        return $arr;
                    })
                    ->values(),
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
        // PENDING-lock (audit 2026-06-17): jangan tambah task saat program di-review.
        \App\Services\ProgramService::assertProgramNotUnderApproval(
            Workstream::query()->where('id', (int) $data['workstreamId'])->value('programId'),
            $request->user(),
        );

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
        $existing = Task::findOrFail($id);
        $this->assertCanModifyTask($existing, $request->user());

        $data = $request->validate([
            'title' => 'sometimes|string|min:2|max:200',
            'description' => 'nullable|string|max:2000',
            'priority' => 'sometimes|in:LOW,MEDIUM,HIGH,CRITICAL',
            'targetCompletion' => 'nullable|date',
            'startDate' => 'nullable|date',
            'estimatedHours' => 'nullable|numeric',
            'phaseId' => 'nullable|integer',
            'letterIndex' => 'nullable|string|max:5',
            // FIX (audit 2026-06-17): plannedWeeks dulu tak ada di validator →
            // editor "Weekly Plan" di Task Detail (kirim plannedWeeks) gagal senyap.
            'plannedWeeks' => 'nullable|array',
            'plannedWeeks.*' => 'string|max:10',
            'actualWeeks' => 'nullable|array',
            'actualWeeks.*' => 'string|max:10',
            'picPersonIds' => 'nullable|array',
            'picUnitIds' => 'nullable|array',
        ]);

        // Realisasi (actualWeeks) = pelaporan progres → tunduk pada gate ketat
        // yang sama dengan status/progress (catatan PIC 24 Jun 2026): hanya PIC,
        // owner program, atau admin. Field struktural lain (judul/plan/tenggat/
        // PIC) tetap boleh oleh manajer se-scope lewat assertCanModifyTask.
        if (array_key_exists('actualWeeks', $data)) {
            $this->assertCanUpdateProgress($existing, $request->user());
        }

        // Penunjukan PIC (picPersonIds) / unit PIC = hak plan-author, bukan
        // pelaksana — meski assignee lolos assertCanModifyTask untuk field lain.
        if (array_key_exists('picPersonIds', $data) || array_key_exists('picUnitIds', $data)) {
            $this->assertCanAssignPic($existing, $request->user());
        }

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
        $this->assertCanUpdateProgress(Task::findOrFail($id), $request->user());

        $data = $request->validate([
            // Selaras dengan store() (audit 2026-06-17): dulu 'required|string' bebas
            // — bertumpu penuh pada guard TRANSITIONS di service. Validasi enum di
            // controller = lapisan defensif eksplisit.
            'status'         => 'required|in:BACKLOG,READY,IN_PROGRESS,IN_REVIEW,BLOCKED,COMPLETED',
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
        $this->assertCanUpdateProgress(Task::findOrFail($id), $request->user());

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
        // Menunjuk executor = menunjuk PIC → hanya Kadiv/Kasubdiv (se-scope)/admin.
        $this->assertCanAssignPic(Task::findOrFail($id), $request->user());

        $data = $request->validate(['assignedTo' => 'nullable|integer|exists:User,id']);
        Task::query()->where('id', $id)->update(['assignedTo' => $data['assignedTo']]);

        // Jaga invariant assignedTo === picPersonIds[0]: picker "Executor" & "PIC"
        // di Task Detail menulis orang yang sama, tapi PIC lewat EntityPic. Tanpa
        // sync ini, set Executor tak mengisi picPersonIds → surface lain (ExecutionGrid,
        // widget PIC) tampil kosong/basi. Lihat memory dual_pic_assignedto_vs_picpersonids.
        EntityPic::syncForEntity('WorkItem', $id, $data['assignedTo'] ? [$data['assignedTo']] : []);

        if ($request->expectsJson()) {
            return response()->json(['data' => Task::findOrFail($id)]);
        }

        return back()->with('success', 'Task assigned.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $task = Task::findOrFail($id);
        // Sebelumnya allowlist tanpa OrgScope: KADIV direktorat mana pun +
        // creator/assignee lintas-direktorat lolos. Samakan dengan update/
        // status — scope per-direktorat lewat helper yang sama.
        $this->assertCanModifyTask($task, $request->user());

        $workstreamId = $task->initiativeId;
        // PENDING-lock (audit 2026-06-17): jangan hapus task saat program di-review.
        \App\Services\ProgramService::assertProgramNotUnderApproval(
            Workstream::query()->where('id', (int) $workstreamId)->value('programId'),
            $request->user(),
        );
        $this->taskService->delete($id, $request->user()->id);
        $this->taskService->recomputeWorkstreamProgress($workstreamId);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Task deleted.');
    }

    // ── SubTask ───────────────────────────────────────────────────────────────

    public function storeSubTask(Request $request, int $id): JsonResponse|RedirectResponse
    {
        // Subtask menggerakkan progres task induk (recomputeFromSubTasks) →
        // batas izinnya = izin memodifikasi task induk. Sebelumnya hanya cek
        // isReadOnly, sehingga user lintas-direktorat bisa menambah subtask.
        $this->assertCanModifyTask(Task::findOrFail($id), $request->user());

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
        // Sebelumnya 0 cek — siapa pun (termasuk BOD) bisa hapus subtask task
        // divisi lain & mendistorsi progres/health. Gate ke task induk.
        $this->assertCanModifyTask(Task::findOrFail($id), $request->user());

        SubTask::query()->where('id', $subTaskId)->where('workItemId', $id)->delete();
        $this->taskService->recomputeFromSubTasks($id, $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Sub-task deleted.');
    }

    public function toggleSubTask(Request $request, int $id, int $subTaskId): JsonResponse|RedirectResponse
    {
        // Sebelumnya 0 cek — toggle completion mengubah progres task induk.
        $this->assertCanModifyTask(Task::findOrFail($id), $request->user());

        $subTask = $this->taskService->toggleSubTask($subTaskId, $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['data' => $subTask]);
        }

        return back();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Gate mutasi STRUKTURAL task (assign/planning/destroy/subtask) per-direktorat.
     * Sebelumnya update/status/progress/assign hanya cek isReadOnly → user non-BOD
     * mana pun bisa mengubah task program/divisi LAIN (merusak integritas progres
     * yang menggerakkan health & dashboard).
     * Izinkan: admin, pembuat/PIC task, atau MANAJER PLAN (KADIV/KASUBDIV) yang
     * scope-nya mencakup unit pemilik program task. Blokir lintas-direktorat.
     *
     * Pengetatan 2026-06-26: menata STRUKTUR plan adalah hak Kadiv/Kasub — jadi
     * jalur coversUnit dibatasi ke kadiv/kasubdiv. ASISTEN/OFFICER yang sekadar
     * "cover unit" (OrgScope se-direktorat) tak lagi boleh merestrukturisasi task
     * sembarang; mereka tetap mengelola task yang di-assign ke dirinya (shortcut
     * assignee/creator di atas) & update progres lewat assertCanUpdateProgress.
     */
    private function assertCanModifyTask(Task $task, User $user): void
    {
        if (RolePolicy::isReadOnly($user->roleType)) {
            abort(403, 'Your role is not allowed to perform this action.');
        }
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;
        if ($task->createdBy === $user->id || $task->assignedTo === $user->id) return;

        if (in_array(RolePolicy::norm($user->roleType), ['kadiv', 'kasubdiv'], true)
            && OrgScope::forUser($user)->coversUnit($this->ownerUnitForTask($task))) {
            return;
        }

        abort(403, 'You do not have access to modify a work item that belongs to another unit.');
    }

    /**
     * Gate KHUSUS penunjukan PIC/executor task (assign + picPersonIds/picUnitIds).
     * Menunjuk siapa yang bertanggung jawab = keputusan plan-author → HANYA
     * Kadiv/Kasubdiv (se-scope) atau admin. BEDA dengan assertCanModifyTask:
     * TIDAK ada shortcut assignee/creator — pelaksana (ASISTEN/OFFICER) yang jadi
     * PIC tak boleh mengoper PIC ke orang lain (akuntabilitas dipegang manajer).
     */
    private function assertCanAssignPic(Task $task, User $user): void
    {
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;

        if (in_array(RolePolicy::norm($user->roleType), ['kadiv', 'kasubdiv'], true)
            && OrgScope::forUser($user)->coversUnit($this->ownerUnitForTask($task))) {
            return;
        }

        abort(403, 'Only the division head (Kadiv/Kasubdiv) can assign the PIC of this work item.');
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
     * Gate KETAT khusus update STATUS & PROGRESS (catatan PIC, 24 Jun 2026):
     * "edit status progress sebaiknya hanya bisa dilakukan oleh PIC". Progres
     * pekerjaan hanya boleh diubah oleh PIC (assignedTo), owner program, atau
     * admin — BUKAN siapa pun yang scope unit-nya mencakup program (coversUnit).
     * Edit STRUKTURAL (assign/planning/destroy/subtask) tetap pakai
     * assertCanModifyTask yang lebih longgar supaya atasan tetap bisa menata
     * pekerjaan tanpa mengklaim progres anggota.
     */
    private function assertCanUpdateProgress(Task $task, User $user): void
    {
        if (RolePolicy::isReadOnly($user->roleType)) {
            abort(403, 'Your role is not allowed to perform this action.');
        }
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;
        if ($task->assignedTo === $user->id) return;
        if ($this->programOwnerForTask($task) === $user->id) return;

        abort(403, 'Only the assigned PIC or the program owner can update this work item\'s progress.');
    }

    /**
     * Owner program (Program.ownerId) lewat query Workstream terpisah — alasan
     * sama dengan ownerUnitForWorkstream: findOrFail() tidak eager-load ownerId.
     */
    private function programOwnerForTask(Task $task): ?int
    {
        $ownerId = Workstream::query()
            ->with('program:id,ownerId')
            ->find((int) $task->initiativeId)?->program?->ownerId;
        return $ownerId !== null ? (int) $ownerId : null;
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
