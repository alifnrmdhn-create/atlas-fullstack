<?php

namespace App\Services;

use App\Auth\MembershipResolver;
use App\Auth\ScopeResolver;
use App\Models\Blocker;
use App\Models\Channel;
use App\Models\EntityPic;
use App\Models\Program;
use App\Models\ProgramKpiLink;
use App\Models\Task;
use App\Models\User;
use App\Support\RolePolicy;
use App\Models\Workstream;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ProgramService
{
    public function __construct(
        private ScopeResolver $scopeResolver,
        private MembershipResolver $membershipResolver,
    ) {}

    /**
     * List program yang boleh dilihat user — scope + membership combined.
     * Mirror logika GET /api/programs di programs.ts.
     */
    public function listForUser(User $user): Collection
    {
        $scope = $this->scopeResolver->resolveUserScope($user);

        $query = Program::query()
            ->with(['owner:id,name,avatarUrl,roleType,unitId', 'linkedChannel:id,name'])
            ->withCount('workstreams')
            ->withCount(['kpis as kpiCount' => fn ($q) => $q->where('isActive', true)])
            ->whereNull('archivedAt')
            ->whereIn('approvalStatus', ['ACTIVE', 'PENDING_KASUB', 'PENDING_KADIV', 'DRAFT', 'COMPLETED']);

        if ($scope->allowsAllUsers()) {
            return $this->appendHealthTone($query->orderBy('createdAt', 'desc')->get());
        }

        $membershipIds = $this->membershipResolver->getProgramIdsViaMembership($user->id);

        return $this->appendHealthTone($query->where(function (Builder $q) use ($scope, $membershipIds) {
            $q->whereIn('id', $membershipIds)
              ->orWhereIn('ownerId', $scope->userIds);
        })->orderBy('createdAt', 'desc')->get());
    }

    /**
     * Sertakan `healthTone` (single source of truth, lihat Program::classifyHealthTone)
     * pada tiap program supaya Programs page memfilter/menghitung "Terlambat" dari
     * tone yang sama dengan Home — bukan menghitung ulang dari healthStatus mentah
     * (akar bug "Home 18, Programs 3").
     */
    private function appendHealthTone(Collection $programs): Collection
    {
        $programs->each(fn ($p) => $p->append('healthTone'));
        return $programs;
    }

    public function listForUserPaginated(User $user, int $perPage = 50): \Illuminate\Contracts\Pagination\LengthAwarePaginator
    {
        $scope = $this->scopeResolver->resolveUserScope($user);

        $query = Program::query()
            ->with(['owner:id,name,avatarUrl,roleType,unitId', 'linkedChannel:id,name'])
            ->withCount('workstreams')
            ->withCount(['kpis as kpiCount' => fn ($q) => $q->where('isActive', true)])
            ->whereNull('archivedAt')
            ->whereIn('approvalStatus', ['ACTIVE', 'PENDING_KASUB', 'PENDING_KADIV', 'DRAFT', 'COMPLETED'])
            ->orderBy('createdAt', 'desc');

        if (!$scope->allowsAllUsers()) {
            $membershipIds = $this->membershipResolver->getProgramIdsViaMembership($user->id);
            $query->where(function (Builder $q) use ($scope, $membershipIds) {
                $q->whereIn('id', $membershipIds)
                  ->orWhereIn('ownerId', $scope->userIds);
            });
        }

        $paginated = $query->paginate($perPage);
        $this->appendHealthTone($paginated->getCollection());
        return $paginated;
    }

    public function listArchived(User $user): Collection
    {
        return Program::query()
            ->with(['owner:id,name'])
            ->withCount('workstreams')
            ->whereNotNull('archivedAt')
            ->orderBy('archivedAt', 'desc')
            ->get();
    }

    /** Timeline data untuk Gantt view — includes workstreams. */
    public function timelineAll(User $user): Collection
    {
        $scope = $this->scopeResolver->resolveUserScope($user);

        $query = Program::query()
            ->with([
                'workstreams' => fn ($q) => $q
                    ->select('id','code','name','status','programId','startDate','targetCompletion','progressPercent','healthStatus')
                    ->orderBy('startDate'),
            ])
            ->select('id','code','name','status','priority','progressPercent','healthStatus','startDate','targetEndDate','actualEndDate','ownerId')
            ->orderBy('startDate');

        if (!$scope->allowsAllUsers()) {
            $membershipIds = $this->membershipResolver->getProgramIdsViaMembership($user->id);
            $query->where(function (Builder $q) use ($scope, $membershipIds) {
                $q->whereIn('ownerId', $scope->userIds)
                  ->orWhereIn('id', $membershipIds);
            });
        }

        return $query->get();
    }

    /** Execution pulse — blockers aktif, workstream at-risk, task stagnant. */
    public function executionPulse(User $user): array
    {
        $scope = $this->scopeResolver->resolveUserScope($user);
        $accessibleProgramIds = null;

        if (!$scope->allowsAllUsers()) {
            $membershipIds = $this->membershipResolver->getProgramIdsViaMembership($user->id);
            $scopePrograms = Program::query()
                ->whereIn('ownerId', $scope->userIds)
                ->pluck('id')
                ->all();
            $accessibleProgramIds = array_unique(array_merge($scopePrograms, $membershipIds));
        }

        $now = now();
        $in30Days = now()->addDays(30);
        $sevenDaysAgo = now()->subDays(7);

        // Archived program → workstream/blocker/task tetap ada di DB tapi tidak boleh
        // muncul di Pulse (konsisten dengan Portfolio yang menyembunyikannya).
        $notArchived = fn ($q) => $q->whereNull('archivedAt');

        $blockerQuery = Blocker::query()
            ->where('status', 'OPEN')
            ->with([
                'task:id,code,title,initiativeId',
                'task.workstream:id,name,programId',
                'task.workstream.program:id,code,name',
            ])
            ->whereHas('task.workstream.program', $notArchived)
            ->orderByRaw("CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END")
            ->orderBy('createdAt');

        if ($accessibleProgramIds !== null) {
            $blockerQuery->whereHas('task.workstream', fn ($q) =>
                $q->whereIn('programId', $accessibleProgramIds)
            );
        }

        $wsQuery = Workstream::query()
            ->with(['program:id,code,name'])
            ->whereHas('program', $notArchived)
            ->where('targetCompletion', '<=', $in30Days)
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
            ->where(fn ($q) => $q
                ->where('progressPercent', '<', 70)
                ->orWhereIn('healthStatus', ['RED', 'YELLOW'])
            )
            ->orderBy('targetCompletion');

        if ($accessibleProgramIds !== null) {
            $wsQuery->whereIn('programId', $accessibleProgramIds);
        }

        $taskQuery = Task::query()
            ->with([
                'workstream:id,name,programId',
                'workstream.program:id,code,name',
            ])
            ->whereHas('workstream.program', $notArchived)
            ->whereIn('status', ['IN_PROGRESS', 'IN_REVIEW'])
            ->where('updatedAt', '<', $sevenDaysAgo)
            ->orderBy('updatedAt');

        if ($accessibleProgramIds !== null) {
            $taskQuery->whereHas('workstream', fn ($q) =>
                $q->whereIn('programId', $accessibleProgramIds)
            );
        }

        [$blockers, $atRiskWs, $stagnantTasks] = [
            $blockerQuery->get(),
            $wsQuery->get(),
            $taskQuery->get(),
        ];

        // Resolve user names
        $userIds = collect()
            ->merge($stagnantTasks->pluck('assignedTo')->filter())
            ->unique()->values();

        $userMap = $userIds->isNotEmpty()
            ? User::query()->whereIn('id', $userIds)->pluck('name', 'id')
            : collect();

        return [
            'activeBlockers' => $blockers->map(fn ($b) => [
                'id' => $b->id,
                'code' => $b->code,
                'title' => $b->title,
                'severity' => $b->severity,
                'status' => $b->status,
                'createdAt' => $b->createdAt,
                'daysOpen' => $b->createdAt->diffInDays($now),
                'task' => $b->task ? [
                    'id' => $b->task->id,
                    'code' => $b->task->code,
                    'title' => $b->task->title,
                    'workstream' => $b->task->workstream ? [
                        'id' => $b->task->workstream->id,
                        'name' => $b->task->workstream->name,
                        'program' => $b->task->workstream->program,
                    ] : null,
                ] : null,
            ])->values()->all(),

            'atRiskWorkstreams' => $atRiskWs->map(fn ($ws) => [
                'id' => $ws->id,
                'code' => $ws->code,
                'name' => $ws->name,
                'status' => $ws->status,
                'progressPercent' => $ws->progressPercent,
                'healthStatus' => $ws->healthStatus ?? 'YELLOW',
                'targetCompletion' => $ws->targetCompletion,
                'daysRemaining' => (int) ceil($ws->targetCompletion->diffInDays($now, false) * -1),
                'program' => $ws->program,
            ])->values()->all(),

            'stagnantItems' => $stagnantTasks->map(fn ($t) => [
                'id' => $t->id,
                'code' => $t->code,
                'title' => $t->title,
                'status' => $t->status,
                'percentComplete' => $t->percentComplete,
                'updatedAt' => $t->updatedAt,
                'stagnantDays' => (int) floor($t->updatedAt->diffInDays($now)),
                'workstream' => $t->workstream ? [
                    'id' => $t->workstream->id,
                    'name' => $t->workstream->name,
                    'program' => $t->workstream->program,
                ] : null,
                'assignee' => $t->assignedTo ? ['id' => $t->assignedTo, 'name' => $userMap->get($t->assignedTo, '—')] : null,
            ])->values()->all(),
        ];
    }

    public function findOrFail(int $id): Program
    {
        return Program::query()
            ->with([
                'owner:id,name,avatarUrl,roleType,unitId,positionTitle',
                'owner.unit:id,name',
                'coPics',
                'linkedChannel:id,name',
                'workstreams.phases',
                'workstreams.tasks.blockers',
                'workstreams.tasks.entityPics',
                // KPI internal aktif — supaya `detail.kpis` terisi di FE tanpa N+1 lazy load.
                // Tanpa eager-load ini, KPI yang baru disimpan via /kpi-internal tidak muncul
                // sampai reload halaman penuh (Program model tidak punya $appends 'kpis').
                'kpis' => fn ($q) => $q->where('isActive', true),
                'kpiLinks',
            ])
            ->findOrFail($id);
    }

    public function assertAccess(User $user, int $programId): void
    {
        $scope = $this->scopeResolver->resolveUserScope($user);
        if ($scope->allowsAllUsers()) return;

        $membershipIds = $this->membershipResolver->getProgramIdsViaMembership($user->id);
        if (in_array($programId, $membershipIds, true)) return;

        $hit = Program::query()
            ->where('id', $programId)
            ->where(fn ($q) => $q
                ->whereIn('ownerId', $scope->userIds)
            )
            ->exists();

        if (!$hit) {
            abort(403, 'You do not have access to this program');
        }
    }

    /**
     * Guard struktur saat program menunggu approval. Audit 2026-06-17: lock
     * "PENDING terkunci" dulu hanya di field program-level (ProgramController::update);
     * CRUD Workstream/Phase/Task tetap terbuka → reviewer me-review snapshot yang
     * bisa berubah di bawahnya. Non-admin tak boleh ubah struktur saat PENDING —
     * jalur benar = withdraw → revisi → resubmit. Param untyped supaya aman menerima
     * hasil ->value('programId') (int/string/null).
     */
    public static function assertProgramNotUnderApproval($programId, User $user): void
    {
        $programId = $programId !== null ? (int) $programId : null;
        if (!$programId) return;
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;

        $status = Program::query()->where('id', $programId)->value('approvalStatus');
        if (in_array($status, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            abort(422, 'The program is under approval — its structure cannot be changed until a decision is made.');
        }
    }

    /**
     * Guard penetapan owner program. Dua lapis:
     *
     * 1. INVARIANT ROLE (2026-06-26): saat user lapangan menetapkan owner, owner
     *    WAJIB Kepala Divisi (KADIV) atau Kepala Sub Divisi (KASUBDIV) — selaras
     *    "plan di-author/di-own oleh Kadiv/Kasub". Karena hanya Kadiv/Kasub yang
     *    bisa create/edit (canCreateProgram), self-assign mereka otomatis valid;
     *    delegasi ke user lain dibatasi sesama plan-manager.
     *    ADMIN/SUPERADMIN (operator) DIKECUALIKAN dari invariant ini — dipakai
     *    untuk seeding/administrasi & boleh menetapkan owner siapa pun, sejalan
     *    dengan bypass scope di bawah. (Owner non-plan-manager yang diset operator
     *    tetap "inert": canEditProgram menolaknya, jadi tak memberi hak edit.)
     * 2. SCOPE: non-admin hanya boleh menetapkan ownerId ke dirinya sendiri atau
     *    user dalam scope-nya (unit/bawahan). Admin/eksekutif (allowsAllUsers) bebas.
     */
    public function assertCanAssignOwner(User $actor, ?int $ownerId): void
    {
        if ($ownerId === null) {
            return;
        }

        // Lapis 1 — invariant role owner (kecuali aktor admin/superadmin operator).
        if (!RolePolicy::isAdminOrAbove($actor->roleType)) {
            $ownerRole = $ownerId === $actor->id
                ? $actor->roleType
                : User::query()->whereKey($ownerId)->value('roleType');
            if (!in_array(RolePolicy::norm($ownerRole), ['kadiv', 'kasubdiv'], true)) {
                abort(422, 'Owner program harus Kepala Divisi atau Kepala Sub Divisi.');
            }
        }

        // Lapis 2 — scope.
        if ($ownerId === $actor->id) {
            return;
        }
        $scope = $this->scopeResolver->resolveUserScope($actor);
        if ($scope->allowsAllUsers()) {
            return;
        }
        if (!in_array($ownerId, $scope->userIds ?? [], true)) {
            abort(403, 'You can only assign ownership to yourself or a member of your unit.');
        }
    }

    /**
     * ID program yang boleh diakses user (membership ∪ ownerId-dalam-scope).
     * Return null = user eksekutif (lihat semua, tanpa filter). Dipakai untuk
     * scoping read-path yg bersandar pada akses program (mis. daftar KPI).
     * Predikat ini sama dengan listForUser() & assertAccess().
     *
     * @return array<int>|null
     */
    public function accessibleProgramIds(User $user): ?array
    {
        $scope = $this->scopeResolver->resolveUserScope($user);
        if ($scope->allowsAllUsers()) {
            return null;
        }
        $membershipIds = $this->membershipResolver->getProgramIdsViaMembership($user->id);
        $ownedIds = Program::query()
            ->whereIn('ownerId', $scope->userIds ?? [])
            ->pluck('id')
            ->all();

        return array_values(array_unique([...$membershipIds, ...array_map('intval', $ownedIds)]));
    }

    public function create(User $user, array $data): Program
    {
        $code = 'PRG-' . strtoupper(substr(md5(uniqid()), 0, 6));
        $ownerId = $data['ownerId'] ?? $user->id;
        $picPersonIds = $data['picPersonIds'] ?? [];
        // FIX (audit 2026-06-17): apmsKpiCodes dari wizard "Buat Program" dulu di-drop
        // (store validator tak terima + create tak proses) → KPI terpilih hilang.
        $apmsKpiCodes = $data['apmsKpiCodes'] ?? [];
        unset($data['ownerId'], $data['picPersonIds'], $data['apmsKpiCodes']);

        $program = Program::create([
            ...$data,
            'code' => $data['code'] ?? $code,
            'ownerId' => $ownerId,
            'ownerUnitId' => $data['ownerUnitId'] ?? $user->unitId,
            'approvalStatus' => 'DRAFT',
            'submittedById' => $user->id,
            'progressPercent' => 0,
        ]);

        $this->syncProgramPics($program, $picPersonIds);

        // Link KPI APMS yang dipilih di wizard (idempotent per kode).
        foreach (array_unique(array_filter($apmsKpiCodes)) as $apmsKpiCode) {
            ProgramKpiLink::firstOrCreate([
                'programId'   => $program->id,
                'apmsKpiCode' => $apmsKpiCode,
            ]);
        }

        return $program->fresh(['coPics']);
    }

    public function update(int $id, array $data): Program
    {
        $picPersonIds = array_key_exists('picPersonIds', $data) ? $data['picPersonIds'] : null;
        unset($data['picPersonIds']);

        return DB::transaction(function () use ($id, $data, $picPersonIds) {
            $program = Program::findOrFail($id);
            $oldChannelId = $program->linkedChannelId;

            $program->update($data);

            if ($picPersonIds !== null) {
                $this->syncProgramPics($program, $picPersonIds ?? []);
            }

            // Bidirectional sync Program.linkedChannelId ↔ Channel.linkedProgramId.
            // Tanpa sync ini, program yang user link dari ProgramDetailView tidak
            // muncul di ChannelsView — FE baca Channel.linkedProgramId untuk
            // context banner, dan MembershipResolver pakai field yang sama untuk
            // auto-permission. Sebelumnya cuma 1 arah (Program FK ke Channel).
            //
            // Semantik: latest link wins. Kalau Program A pernah link ke
            // Channel C lalu Program B re-link ke C, banner di C berubah jadi B
            // (overwrite). Edge case rare — biasanya 1 channel dedicated 1 program.
            if (array_key_exists('linkedChannelId', $data)) {
                $newChannelId = $data['linkedChannelId'];

                // Channel lama yang dilepas — clear linkedProgramId KALAU masih
                // pointing ke program ini. Jangan overwrite kalau channel itu
                // sudah di-reassign ke program lain (preserve niat terakhir).
                if ($oldChannelId && (int) $oldChannelId !== (int) $newChannelId) {
                    Channel::query()
                        ->where('id', $oldChannelId)
                        ->where('linkedProgramId', $program->id)
                        ->update(['linkedProgramId' => null]);
                }

                // Channel baru — set linkedProgramId ke program ini (overwrite OK).
                if ($newChannelId) {
                    Channel::query()
                        ->where('id', $newChannelId)
                        ->update(['linkedProgramId' => $program->id]);
                }
            }

            return $program->fresh(['coPics']);
        });
    }

    public function archive(int $id, int $userId): void
    {
        Program::query()->where('id', $id)->update([
            'archivedAt' => now(),
            'archivedById' => $userId,
        ]);
    }

    public function restore(int $id): void
    {
        Program::query()->where('id', $id)->update([
            'archivedAt' => null,
            'archivedById' => null,
        ]);
    }

    public function delete(int $id): void
    {
        Program::destroy($id);
    }

    /** Workstreams list untuk Execution Grid — include phases & tasks. */
    public function workstreamsForGrid(int $programId): Collection
    {
        return Workstream::query()
            ->where('programId', $programId)
            ->with([
                'phases' => fn ($q) => $q->orderBy('order'),
                'tasks' => fn ($q) => $q
                    ->orderBy('phaseId')
                    ->orderBy('letterIndex')
                    ->with('blockers:id,workItemId,status,severity'),
            ])
            ->orderBy('createdAt')
            ->get();
    }

    /** @param array<int, int|string> $userIds */
    private function syncProgramPics(Program $program, array $userIds): void
    {
        $previousUserIds = EntityPic::query()
            ->where('entityType', 'Program')
            ->where('entityId', $program->id)
            ->pluck('userId')
            ->map(fn ($id) => (int) $id)
            ->all();

        // Validate IDs exist before syncing (guards FK + membership invalidation)
        $validatedIds = empty($userIds) ? [] : User::query()
            ->whereIn('id', $userIds)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        EntityPic::syncForEntity('Program', $program->id, $validatedIds);

        $this->membershipResolver->invalidateMany(array_unique([
            ...$previousUserIds,
            ...$validatedIds,
        ]));
    }
}
