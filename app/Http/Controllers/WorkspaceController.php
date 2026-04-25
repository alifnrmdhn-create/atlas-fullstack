<?php

namespace App\Http\Controllers;

use App\Models\Blocker;
use App\Models\Channel;
use App\Models\ChannelMessage;
use App\Models\KpiDefinition;
use App\Models\Meeting;
use App\Models\Notification;
use App\Models\Position;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\UserSession;
use App\Models\UserStatus;
use App\Models\Workstream;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class WorkspaceController extends Controller
{
    public function page(string $component): Response
    {
        return Inertia::render($component);
    }

    public function dashboard(Request $request): JsonResponse|Response
    {
        if (!$request->expectsJson()) {
            return Inertia::render('DashboardView');
        }

        $programs = Program::query()->whereNull('archivedAt')->get();
        $activePrograms = $programs->where('approvalStatus', 'ACTIVE');
        $criticalBlockers = Blocker::query()->where('severity', 'CRITICAL')->where('status', '!=', 'RESOLVED')->count();
        $onlineUsers = UserStatus::query()->where('status', 'ONLINE')->count();
        $unreadNotifications = Notification::query()
            ->where('userId', $request->user()->id)
            ->where('state', 'UNREAD')
            ->count();

        $programRows = Program::query()
            ->withCount(['workstreams'])
            ->whereNull('archivedAt')
            ->orderByDesc('createdAt')
            ->limit(12)
            ->get();

        $tasksDue = Task::query()
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
            ->orderBy('targetCompletion')
            ->limit(10)
            ->get(['id', 'code', 'title', 'targetCompletion', 'status']);

        $controlBlockers = Blocker::query()
            ->whereIn('status', ['OPEN', 'IN_PROGRESS'])
            ->orderByRaw("CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END")
            ->limit(10)
            ->get(['id', 'code', 'title', 'status', 'severity']);

        $recentMessages = ChannelMessage::query()
            ->orderByDesc('createdAt')
            ->limit(8)
            ->get();

        return response()->json([
            'generatedAt' => now()->toISOString(),
            'summary' => [
                'totalPrograms' => $programs->count(),
                'activePrograms' => $activePrograms->count(),
                'redPrograms' => $programs->where('healthStatus', 'RED')->count(),
                'criticalBlockers' => $criticalBlockers,
                'onlineUsers' => $onlineUsers,
                'unreadNotifications' => $unreadNotifications,
            ],
            'dimensions' => [
                'strategic' => $programRows->map(fn ($p) => [
                    'programId' => $p->id,
                    'program' => $p->name,
                    'strategicAlignment' => $p->strategicAlignment ?? 0,
                    'healthStatus' => $p->healthStatus ?? 'YELLOW',
                ])->values(),
                'programs' => $programRows->map(fn ($p) => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'progressPercent' => $p->progressPercent ?? 0,
                    'blockerCount' => 0,
                    'healthStatus' => $p->healthStatus ?? 'YELLOW',
                ])->values(),
                'leadingIndicators' => KpiDefinition::query()
                    ->where('isLeadingIndicator', true)
                    ->limit(10)
                    ->get(['id', 'name', 'actualValue', 'targetValue', 'warningThreshold', 'criticalThreshold'])
                    ->map(fn ($k) => [
                        'id' => $k->id,
                        'name' => $k->name,
                        'actualValue' => $k->actualValue,
                        'targetValue' => $k->targetValue,
                        'status' => $this->kpiStatus($k),
                    ])->values(),
                'timeIntelligence' => $tasksDue,
                'accountability' => [],
                'governance' => $controlBlockers,
                'performance' => User::query()
                    ->where('isActive', true)
                    ->limit(10)
                    ->get(['id', 'name'])
                    ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'score' => null, 'status' => 'GREEN'])
                    ->values(),
                'collaboration' => $recentMessages,
            ],
            'recentActivity' => [],
            'mentions' => [],
            'onlineUsers' => $this->presenceQuery()->where('UserStatus.status', 'ONLINE')->limit(20)->get(),
        ]);
    }

    public function myWork(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => [
            'role' => $user->roleType,
            'tasks' => Task::query()
                ->with(['workstream.program:id,code,name,healthStatus,approvalStatus', 'assignee:id,name,roleType,avatarUrl'])
                ->where('assignedTo', $user->id)
                ->orderBy('targetCompletion')
                ->limit(30)
                ->get(),
            'blockers' => Blocker::query()
                ->with(['task.workstream.program:id,code,name,healthStatus,approvalStatus'])
                ->where('assignedTo', $user->id)
                ->orWhere('createdBy', $user->id)
                ->orderByDesc('createdAt')
                ->limit(30)
                ->get(),
            'programs' => Program::query()
                ->where('ownerId', $user->id)
                ->whereNull('archivedAt')
                ->orderByDesc('createdAt')
                ->limit(30)
                ->get(),
        ]]);
    }

    public function apmsKpi(): JsonResponse
    {
        return response()->json([
            'data' => [],
            'meta' => [
                'tahun' => (int) now()->format('Y'),
                'bulan' => (int) now()->format('n'),
                'source' => 'apms',
                'connected' => false,
            ],
            'linkedPrograms' => [],
        ]);
    }

    public function systemStatus(): JsonResponse
    {
        return response()->json([
            'service' => 'atlas-laravel',
            'timestamp' => now()->toISOString(),
            'persistence' => [
                'provider' => 'postgresql',
                'mode' => 'database',
                'databaseUrlConfigured' => config('database.default') !== null,
                'availability' => 'ready',
                'fallbackStore' => 'seeded-memory',
                'lastError' => null,
            ],
        ]);
    }

    public function savedSearches(Request $request): JsonResponse
    {
        $rows = DB::table('SavedSearch')
            ->where('userId', $request->user()->id)
            ->orWhere('isShared', true)
            ->orderBy('createdAt', 'desc')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function profile(Request $request): JsonResponse|Response
    {
        if (!$request->expectsJson()) {
            return Inertia::render('ProfileView');
        }

        $user = $request->user()->load(['unit:id,code,name', 'directorate:id,code,name']);

        return response()->json([
            'user' => $user,
            'supervisorChain' => [],
            'subordinates' => User::query()
                ->where('managerUserId', $user->id)
                ->get(['id', 'name', 'email', 'roleType', 'positionTitle']),
            'positionHistory' => DB::table('position_history')
                ->where('userId', $user->id)
                ->orderByDesc('startDate')
                ->get(),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:160|unique:User,email,' . $request->user()->id,
        ]);

        $request->user()->update($data);

        return response()->json(['user' => $request->user()->fresh()]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'currentPassword' => 'required|string',
            'newPassword' => 'required|string|min:8',
        ]);

        if (!Hash::check($data['currentPassword'], $request->user()->passwordHash)) {
            return response()->json(['message' => 'Password saat ini tidak sesuai.'], 422);
        }

        $request->user()->update(['passwordHash' => Hash::make($data['newPassword'])]);

        return response()->json(['message' => 'Password berhasil diperbarui.']);
    }

    public function usersDirectory(): JsonResponse
    {
        return response()->json(['data' => User::query()
            ->with(['unit:id,code,name', 'directorate:id,code,name'])
            ->where('isActive', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'roleType', 'positionTitle', 'avatarUrl', 'unitId', 'directorateId'])
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        $query = User::query()
            ->with([
                'unit:id,code,name',
                'directorate:id,code,name',
                'position:id,code,name,levelCode,roleType',
            ])
            ->orderBy('name');

        if ($request->query('search')) {
            $search = '%' . $request->query('search') . '%';
            $query->where(fn ($q) => $q
                ->where('name', 'ilike', $search)
                ->orWhere('email', 'ilike', $search)
                ->orWhere('userId', 'ilike', $search)
                ->orWhere('nik', 'ilike', $search));
        }
        if ($request->query('role')) $query->where('roleType', $request->query('role'));
        if ($request->query('active') !== null) $query->where('isActive', $request->boolean('active'));

        $users = $query->get();

        return response()->json(['data' => $users, 'total' => $users->count()]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:160|unique:User,email',
            'userId' => 'nullable|string|max:80|unique:User,userId',
            'nik' => 'nullable|string|max:80|unique:User,nik',
            'phone' => 'nullable|string|max:40',
            'roleType' => 'required|string|max:40',
            'positionId' => 'nullable|integer|exists:Position,id',
        ]);

        $position = isset($data['positionId'])
            ? Position::query()->find($data['positionId'])
            : null;

        $user = User::create([
            ...$data,
            'unitId' => $position?->divisionId,
            'directorateId' => $position?->directorateId,
            'positionTitle' => $position?->name,
            'isActive' => true,
            'passwordHash' => Hash::make('Password123!'),
        ]);

        return response()->json(['data' => $user->load(['unit', 'directorate', 'position'])], 201);
    }

    public function updateUser(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'isActive' => 'sometimes|boolean',
            'positionId' => 'sometimes|nullable|integer|exists:Position,id',
            'mutationType' => 'nullable|string|max:80',
            'mutationReason' => 'nullable|string|max:500',
            'skNumber' => 'nullable|string|max:120',
        ]);

        $user = User::findOrFail($id);
        $update = collect($data)->only(['isActive', 'positionId'])->all();
        if (array_key_exists('positionId', $data) && $data['positionId']) {
            $position = Position::query()->find($data['positionId']);
            $update['unitId'] = $position?->divisionId;
            $update['directorateId'] = $position?->directorateId;
            $update['positionTitle'] = $position?->name;
        }
        $user->update($update);

        return response()->json(['data' => $user->fresh()->load(['unit', 'directorate', 'position'])]);
    }

    public function workstreams(): JsonResponse
    {
        return response()->json(['data' => Workstream::query()
            ->with('program:id,code,name,healthStatus,approvalStatus')
            ->orderByDesc('createdAt')
            ->get()
        ]);
    }

    public function showWorkstream(int $id): JsonResponse
    {
        $workstream = Workstream::query()
            ->with([
                'program:id,code,name,healthStatus,approvalStatus',
                'tasks:id,code,title,status,percentComplete,initiativeId',
            ])
            ->findOrFail($id);

        return response()->json(['data' => [
            ...$workstream->toArray(),
            'tasks' => $workstream->tasks,
            'comments' => [],
        ]]);
    }

    public function storeWorkstream(Request $request): JsonResponse
    {
        $data = $request->validate([
            'programId' => 'required|integer|exists:Program,id',
            'name' => 'required|string|max:160',
            'description' => 'nullable|string|max:2000',
            'priority' => 'nullable|in:LOW,MEDIUM,HIGH,CRITICAL',
            'startDate' => 'nullable|date',
            'targetCompletion' => 'required|date',
            'ownerId' => 'nullable|integer|exists:User,id',
            'picPersonIds' => 'nullable|array',
            'primaryPicPersonId' => 'nullable|integer',
        ]);

        $workstream = Workstream::create([
            ...$data,
            'code' => 'WS-' . strtoupper(substr(sha1(uniqid('', true)), 0, 8)),
            'ownerId' => $data['ownerId'] ?? $request->user()->id,
            'status' => 'BACKLOG',
            'priority' => $data['priority'] ?? 'MEDIUM',
            'progressPercent' => 0,
            'healthStatus' => 'YELLOW',
        ]);

        return response()->json(['data' => $workstream], 201);
    }

    public function updateWorkstream(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|max:160',
            'description' => 'nullable|string|max:2000',
            'status' => 'sometimes|string|max:40',
            'priority' => 'sometimes|in:LOW,MEDIUM,HIGH,CRITICAL',
            'startDate' => 'nullable|date',
            'targetCompletion' => 'nullable|date',
            'ownerId' => 'nullable|integer|exists:User,id',
            'picPersonIds' => 'nullable|array',
            'primaryPicPersonId' => 'nullable|integer',
        ]);

        $workstream = Workstream::findOrFail($id);
        $workstream->update($data);

        return response()->json(['data' => $workstream->fresh()]);
    }

    public function destroyWorkstream(int $id): JsonResponse
    {
        Workstream::destroy($id);
        return response()->json(['ok' => true]);
    }

    public function usersPresence(): JsonResponse
    {
        return response()->json(['users' => $this->presenceQuery()->get()]);
    }

    public function updateMyStatus(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => 'required|in:ONLINE,AWAY,DO_NOT_DISTURB,OFFLINE',
            'statusEmoji' => 'nullable|string|max:32',
            'statusMessage' => 'nullable|string|max:160',
        ]);

        $status = UserStatus::updateOrCreate(
            ['userId' => $request->user()->id],
            [...$data, 'lastActivityAt' => now()],
        );

        return response()->json(['data' => $status]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $query = Notification::query()
            ->where('userId', $request->user()->id)
            ->orderByDesc('createdAt');

        if ($request->query('read') !== 'all') {
            $query->whereNull('dismissedAt');
        }

        $notifications = $query->limit(80)->get();

        return response()->json([
            'notifications' => $notifications,
            'unreadCount' => $notifications->where('state', 'UNREAD')->count(),
        ]);
    }

    public function readNotification(Request $request, int $id): JsonResponse
    {
        Notification::query()
            ->where('userId', $request->user()->id)
            ->where('id', $id)
            ->update(['state' => 'READ', 'readAt' => now()]);

        return response()->json(['ok' => true]);
    }

    public function dismissNotification(Request $request, int $id): JsonResponse
    {
        Notification::query()
            ->where('userId', $request->user()->id)
            ->where('id', $id)
            ->update(['state' => 'DISMISSED', 'dismissedAt' => now()]);

        return response()->json(['ok' => true]);
    }

    public function readAllNotifications(Request $request): JsonResponse
    {
        Notification::query()
            ->where('userId', $request->user()->id)
            ->where('state', 'UNREAD')
            ->update(['state' => 'READ', 'readAt' => now()]);

        return response()->json(['ok' => true]);
    }

    public function roleConfigs(): JsonResponse
    {
        return response()->json(['data' => DB::table('role_configs')->orderBy('role')->get()]);
    }

    public function updateRoleConfig(Request $request, string $role): JsonResponse
    {
        $data = $request->validate(['description' => 'nullable|string|max:500']);
        DB::table('role_configs')->where('role', $role)->update([
            'description' => $data['description'] ?? '',
            'updatedAt' => now(),
        ]);

        return response()->json(['ok' => true]);
    }

    public function focusBlocks(Request $request): JsonResponse
    {
        $userId = $request->integer('forUserId') ?: $request->user()->id;
        $query = DB::table('FocusBlock')->where('userId', $userId)->orderBy('startAt');

        if ($request->query('from')) $query->where('startAt', '>=', $request->query('from'));
        if ($request->query('to')) $query->where('startAt', '<=', $request->query('to') . ' 23:59:59');

        return response()->json(['data' => $query->get()]);
    }

    public function storeFocusBlock(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => 'nullable|string|max:120',
            'startAt' => 'required|date',
            'endAt' => 'required|date|after:startAt',
            'note' => 'nullable|string|max:500',
        ]);

        $id = DB::table('FocusBlock')->insertGetId([
            'userId' => $request->user()->id,
            'title' => $data['title'] ?? 'Focus Time',
            'startAt' => $data['startAt'],
            'endAt' => $data['endAt'],
            'note' => $data['note'] ?? null,
            'createdAt' => now(),
        ]);

        return response()->json(['data' => DB::table('FocusBlock')->where('id', $id)->first()]);
    }

    public function destroyFocusBlock(Request $request, int $id): JsonResponse
    {
        DB::table('FocusBlock')->where('id', $id)->where('userId', $request->user()->id)->delete();
        return response()->json(['ok' => true]);
    }

    public function openDirectMessage(Request $request): JsonResponse
    {
        $data = $request->validate(['userId' => 'required|integer|exists:User,id']);
        $currentUserId = $request->user()->id;
        $otherUserId = (int) $data['userId'];
        $name = 'DM:' . implode(':', collect([$currentUserId, $otherUserId])->sort()->values()->all());

        $channel = Channel::firstOrCreate(
            ['name' => $name, 'type' => 'PRIVATE'],
            [
                'code' => 'DM-' . strtoupper(substr(sha1($name), 0, 12)),
                'description' => 'Direct message',
                'createdBy' => $currentUserId,
            ],
        );

        DB::table('ChannelMember')->updateOrInsert(
            ['channelId' => $channel->id, 'userId' => $currentUserId],
            ['joinedAt' => now()],
        );
        DB::table('ChannelMember')->updateOrInsert(
            ['channelId' => $channel->id, 'userId' => $otherUserId],
            ['joinedAt' => now()],
        );

        return response()->json(['data' => ['id' => $channel->id]]);
    }

    public function storeReminder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'channelId' => 'required|integer',
            'messageId' => 'required|integer',
            'remindAt' => 'required|date',
            'note' => 'nullable|string|max:500',
        ]);

        $id = DB::table('MessageReminder')->insertGetId([
            ...$data,
            'userId' => $request->user()->id,
            'notified' => false,
            'createdAt' => now(),
        ]);

        return response()->json(['data' => ['id' => $id]]);
    }

    public function recordFocusInteraction(): JsonResponse
    {
        return response()->json(['ok' => true]);
    }

    public function upload(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|max:10240']);
        $path = $request->file('file')->store('uploads', 'public');

        return response()->json(['url' => '/storage/' . $path, 'path' => $path]);
    }

    private function presenceQuery()
    {
        return UserStatus::query()
            ->with('user:id,name,email,roleType,positionTitle,avatarUrl,unitId,directorateId')
            ->join('User', 'UserStatus.userId', '=', 'User.id')
            ->orderBy('User.name')
            ->select('UserStatus.*');
    }

    private function kpiStatus(KpiDefinition $kpi): string
    {
        if ($kpi->actualValue === null) return 'YELLOW';

        $actual = (float) $kpi->actualValue;
        $target = (float) $kpi->targetValue;
        $critical = $kpi->criticalThreshold !== null ? (float) $kpi->criticalThreshold : $target * 0.8;
        $warning = $kpi->warningThreshold !== null ? (float) $kpi->warningThreshold : $target * 0.95;

        if ($actual <= $critical) return 'RED';
        if ($actual <= $warning) return 'YELLOW';
        return 'GREEN';
    }
}
