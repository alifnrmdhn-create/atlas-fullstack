<?php

namespace App\Services;

use App\Auth\MembershipResolver;
use App\Auth\ScopeResolver;
use App\Models\Blocker;
use App\Models\EntityPic;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

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
            return $query->orderBy('createdAt', 'desc')->get();
        }

        $membershipIds = $this->membershipResolver->getProgramIdsViaMembership($user->id);

        return $query->where(function (Builder $q) use ($scope, $membershipIds) {
            $q->whereIn('id', $membershipIds)
              ->orWhereIn('ownerId', $scope->userIds);
        })->orderBy('createdAt', 'desc')->get();
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

        return $query->paginate($perPage);
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

        $blockerQuery = Blocker::query()
            ->where('status', 'OPEN')
            ->with([
                'task:id,code,title,initiativeId',
                'task.workstream:id,name,programId',
                'task.workstream.program:id,code,name',
            ])
            ->orderByRaw("CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END")
            ->orderBy('createdAt');

        if ($accessibleProgramIds !== null) {
            $blockerQuery->whereHas('task.workstream', fn ($q) =>
                $q->whereIn('programId', $accessibleProgramIds)
            );
        }

        $wsQuery = Workstream::query()
            ->with(['program:id,code,name'])
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
            ->merge($atRiskWs->pluck('ownerId'))
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
                'owner' => $ws->ownerId ? ['id' => $ws->ownerId, 'name' => $userMap->get($ws->ownerId, '—')] : null,
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
                'coPics',
                'linkedChannel:id,name',
                'workstreams.entityPics',
                'workstreams.phases',
                'workstreams.phases.entityPics',
                'workstreams.tasks.blockers',
                'workstreams.tasks.entityPics',
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
            abort(403, 'Tidak memiliki akses ke program ini');
        }
    }

    public function create(User $user, array $data): Program
    {
        $code = 'PRG-' . strtoupper(substr(md5(uniqid()), 0, 6));
        $ownerId = $data['ownerId'] ?? $user->id;
        $picPersonIds = $data['picPersonIds'] ?? [];
        unset($data['ownerId'], $data['picPersonIds']);

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

        return $program->fresh(['coPics']);
    }

    public function update(int $id, array $data): Program
    {
        $picPersonIds = array_key_exists('picPersonIds', $data) ? $data['picPersonIds'] : null;
        unset($data['picPersonIds']);

        $program = Program::findOrFail($id);
        $program->update($data);

        if ($picPersonIds !== null) {
            $this->syncProgramPics($program, $picPersonIds ?? []);
        }

        return $program->fresh(['coPics']);
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
                'owner:id,name',
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
