<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Assignment;
use App\Models\Blocker;
use App\Models\Channel;
use App\Models\ChannelMessage;
use App\Models\EntityPic;
use App\Models\KpiDefinition;
use App\Models\Meeting;
use App\Models\MeetingActionItem;
use App\Models\Notification;
use App\Models\Position;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\UserSession;
use App\Models\UserStatus;
use App\Models\Workstream;
use App\Services\BroadcastService;
use App\Services\OrgChainService;
use App\Services\ProgramHealthService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class WorkspaceController extends Controller
{
    public function __construct(private ProgramHealthService $healthService) {}

    public function page(string $component): Response
    {
        return Inertia::render($component);
    }

    public function workspaceOverview(Request $request): JsonResponse
    {
        $orgScope = OrgScope::forUser($request->user());
        $scopedUnitIds = $orgScope->unitIds ?: [0];

        $programs = Program::query()
            ->whereNull('archivedAt')
            ->when(!$orgScope->isExecutive, fn ($q) => $q->whereIn('ownerUnitId', $scopedUnitIds))
            ->get();
        $activePrograms = $programs->where('approvalStatus', 'ACTIVE');

        $criticalBlockerQuery = Blocker::query()
            ->where('severity', 'CRITICAL')
            ->where('status', '!=', 'RESOLVED');
        if (!$orgScope->isExecutive) {
            $criticalBlockerQuery->whereHas('task.workstream.program',
                fn ($q) => $q->whereIn('ownerUnitId', $scopedUnitIds));
        }
        $criticalBlockers = $criticalBlockerQuery->count();

        $onlineUsers = UserStatus::query()->where('status', 'ONLINE')->count();
        $unreadNotifications = Notification::query()
            ->where('userId', $request->user()->id)
            ->where('state', 'UNREAD')
            ->count();

        $programRows = Program::query()
            ->withCount(['workstreams'])
            ->whereNull('archivedAt')
            ->when(!$orgScope->isExecutive, fn ($q) => $q->whereIn('ownerUnitId', $scopedUnitIds))
            ->orderByDesc('createdAt')
            ->limit(12)
            ->get();

        $tasksDue = Task::query()
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
            ->when(!$orgScope->isExecutive, fn ($q) => $q->whereHas('workstream.program',
                fn ($q2) => $q2->whereIn('ownerUnitId', $scopedUnitIds)))
            ->orderBy('targetCompletion')
            ->limit(10)
            ->get(['id', 'code', 'title', 'targetCompletion', 'status']);

        $controlBlockers = Blocker::query()
            ->whereIn('status', ['OPEN', 'IN_PROGRESS'])
            ->when(!$orgScope->isExecutive, fn ($q) => $q->whereHas('task.workstream.program',
                fn ($q2) => $q2->whereIn('ownerUnitId', $scopedUnitIds)))
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
                'fallbackStore' => null,
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

    public function search(Request $request): JsonResponse|Response
    {
        if (!$request->expectsJson()) {
            return Inertia::render('SearchView');
        }

        $query = trim((string) $request->query('q', ''));
        $type = strtoupper((string) $request->query('type', 'ALL'));
        $limit = min(max($request->integer('limit', 24), 1), 50);
        $offset = max($request->integer('offset', 0), 0);

        if ($query === '') {
            return response()->json(['results' => [], 'total' => 0]);
        }

        $needle = '%' . $query . '%';
        $like = $this->likeOperator();
        $results = collect();

        if ($this->searchIncludes($type, ['PROGRAM', 'PROGRAMS'])) {
            $results = $results->concat(Program::query()
                ->where(fn ($q) => $q->where('name', $like, $needle)->orWhere('code', $like, $needle))
                ->orderByDesc('createdAt')
                ->limit($limit)
                ->get()
                ->map(fn ($program) => [
                    'type' => 'PROGRAM',
                    'id' => $program->id,
                    'title' => $program->name,
                    'snippet' => $program->code . ' · ' . ($program->description ?? 'Program strategis'),
                    'author' => 'Program',
                    'createdAt' => $this->iso($program->createdAt),
                ]));
        }

        if ($this->searchIncludes($type, ['WORKSTREAM', 'WORKSTREAMS', 'INITIATIVE', 'INITIATIVES'])) {
            $results = $results->concat(Workstream::query()
                ->with('program:id,code,name')
                ->where(fn ($q) => $q->where('name', $like, $needle)->orWhere('code', $like, $needle))
                ->orderByDesc('createdAt')
                ->limit($limit)
                ->get()
                ->map(fn ($workstream) => [
                    'type' => 'WORKSTREAM',
                    'id' => $workstream->id,
                    'title' => $workstream->name,
                    'snippet' => trim(($workstream->program?->code ?? 'Workstream') . ' · ' . ($workstream->description ?? '')),
                    'author' => $workstream->program?->name,
                    'createdAt' => $this->iso($workstream->createdAt),
                ]));
        }

        if ($this->searchIncludes($type, ['TASK', 'TASKS', 'WORK_ITEM', 'WORK_ITEMS'])) {
            $results = $results->concat(Task::query()
                ->with('workstream.program:id,code,name')
                ->where(fn ($q) => $q->where('title', $like, $needle)->orWhere('code', $like, $needle))
                ->orderByDesc('createdAt')
                ->limit($limit)
                ->get()
                ->map(fn ($task) => [
                    'type' => 'TASK',
                    'id' => $task->id,
                    'title' => $task->title,
                    'snippet' => trim(($task->code ?? 'Task') . ' · ' . ($task->workstream?->program?->code ?? '') . ' · ' . ($task->description ?? '')),
                    'author' => $task->workstream?->program?->name,
                    'createdAt' => $this->iso($task->createdAt),
                ]));
        }

        if ($this->searchIncludes($type, ['BLOCKER', 'BLOCKERS'])) {
            $results = $results->concat(Blocker::query()
                ->where(fn ($q) => $q->where('title', $like, $needle)->orWhere('code', $like, $needle))
                ->orderByDesc('createdAt')
                ->limit($limit)
                ->get()
                ->map(fn ($blocker) => [
                    'type' => 'BLOCKER',
                    'id' => $blocker->id,
                    'title' => $blocker->title,
                    'snippet' => trim(($blocker->code ?? 'Blocker') . ' · ' . ($blocker->severity ?? '') . ' · ' . ($blocker->description ?? '')),
                    'author' => $blocker->severity,
                    'createdAt' => $this->iso($blocker->createdAt),
                ]));
        }

        if ($this->searchIncludes($type, ['CHANNEL_MESSAGE', 'CHANNEL_MESSAGES', 'MESSAGE', 'MESSAGES'])) {
            $results = $results->concat(ChannelMessage::query()
                ->with('author:id,name')
                ->whereNull('deletedForEveryoneAt')
                ->where(fn ($q) => $q->where('searchableText', $like, $needle)->orWhere('content', $like, $needle))
                ->orderByDesc('createdAt')
                ->limit($limit)
                ->get()
                ->map(fn ($message) => [
                    'type' => 'CHANNEL_MESSAGE',
                    'id' => $message->id,
                    'title' => 'Message #' . $message->id,
                    'snippet' => Str::limit($message->searchableText ?: $message->content, 180),
                    'author' => $message->author?->name,
                    'createdAt' => $this->iso($message->createdAt),
                ]));
        }

        if ($this->searchIncludes($type, ['MEETING', 'MEETINGS'])) {
            $results = $results->concat(Meeting::query()
                ->where(fn ($q) => $q->where('title', $like, $needle)->orWhere('description', $like, $needle)->orWhere('location', $like, $needle))
                ->orderByDesc('startAt')
                ->limit($limit)
                ->get()
                ->map(fn ($meeting) => [
                    'type' => 'MEETING',
                    'id' => $meeting->id,
                    'title' => $meeting->title,
                    'snippet' => trim(($meeting->location ?? 'Meeting') . ' · ' . ($meeting->description ?? '')),
                    'author' => $meeting->meetingType,
                    'createdAt' => $this->iso($meeting->startAt),
                ]));
        }

        $sorted = $results
            ->sortByDesc(fn ($result) => $result['createdAt'])
            ->values();

        return response()->json([
            'results' => $sorted->slice($offset, $limit)->values(),
            'total' => $sorted->count(),
        ]);
    }

    public function userActivity(Request $request): JsonResponse
    {
        [$from, $to] = $this->activityRange($request->query('range'));
        $sessions = UserSession::query()
            ->whereBetween('startedAt', [$from, $to])
            ->get()
            ->groupBy('userId');
        $statuses = UserStatus::query()->pluck('status', 'userId');

        $users = User::query()
            ->with(['unit:id,name', 'directorate:id,name'])
            ->where('isActive', true)
            ->orderBy('name')
            ->get(['id', 'name', 'positionTitle', 'avatarUrl', 'unitId', 'directorateId'])
            ->map(function ($user) use ($sessions, $statuses) {
                $userSessions = $sessions->get($user->id, collect());
                $totalMs = $userSessions->sum(fn ($session) => $this->sessionDurationMs($session));
                $lastActive = $userSessions
                    ->map(fn ($session) => $session->endedAt ?? $session->lastPingAt ?? $session->startedAt)
                    ->filter()
                    ->sortDesc()
                    ->first();

                return [
                    'rank' => 0,
                    'userId' => $user->id,
                    'name' => $user->name,
                    'positionTitle' => $user->positionTitle,
                    'avatarUrl' => $user->avatarUrl,
                    'unit' => $user->unit,
                    'directorate' => $user->directorate,
                    'totalDurationMs' => $totalMs,
                    'sessionCount' => $userSessions->count(),
                    'lastActiveAt' => $lastActive ? $this->iso($lastActive) : null,
                    'isOnline' => ($statuses[$user->id] ?? null) === 'ONLINE',
                ];
            })
            ->sortByDesc('totalDurationMs')
            ->values()
            ->map(fn ($user, $index) => [...$user, 'rank' => $index + 1]);

        return response()->json(['data' => [
            'users' => $users,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ]]);
    }

    public function userActivityDetail(Request $request, int $id): JsonResponse
    {
        [$from, $to] = $this->activityRange($request->query('range'));
        $user = User::query()
            ->with(['unit:id,name', 'directorate:id,name'])
            ->findOrFail($id);
        $sessions = UserSession::query()
            ->where('userId', $id)
            ->whereBetween('startedAt', [$from, $to])
            ->orderByDesc('startedAt')
            ->get();
        $totalMs = $sessions->sum(fn ($session) => $this->sessionDurationMs($session));
        $lastActive = $sessions
            ->map(fn ($session) => $session->endedAt ?? $session->lastPingAt ?? $session->startedAt)
            ->filter()
            ->sortDesc()
            ->first();

        return response()->json(['data' => [
            'user' => [
                'userId' => $user->id,
                'name' => $user->name,
                'positionTitle' => $user->positionTitle,
                'unit' => $user->unit,
                'directorate' => $user->directorate,
            ],
            'totalDurationMs' => $totalMs,
            'sessionCount' => $sessions->count(),
            'avgSessionDurationMs' => $sessions->count() > 0 ? (int) round($totalMs / $sessions->count()) : 0,
            'lastActiveAt' => $lastActive ? $this->iso($lastActive) : null,
            'sessions' => $sessions->map(fn ($session) => [
                'id' => $session->id,
                'startedAt' => $this->iso($session->startedAt),
                'endedAt' => $session->endedAt ? $this->iso($session->endedAt) : null,
                'durationMs' => $this->sessionDurationMs($session),
                'endReason' => $session->endReason,
            ])->values(),
            'dailyBreakdown' => $this->dailyActivity($from, $to, $sessions),
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ]]);
    }

    public function savedMessages(Request $request): JsonResponse
    {
        $messages = DB::table('SavedMessage')
            ->join('ChannelMessage', 'SavedMessage.messageId', '=', 'ChannelMessage.id')
            ->where('SavedMessage.userId', $request->user()->id)
            ->orderByDesc('SavedMessage.createdAt')
            ->get([
                'ChannelMessage.id',
                'ChannelMessage.channelId',
                'ChannelMessage.content',
                'SavedMessage.createdAt',
            ]);

        return response()->json(['data' => $messages]);
    }

    public function storeSavedMessage(Request $request, int $messageId): JsonResponse
    {
        ChannelMessage::query()->findOrFail($messageId);

        DB::table('SavedMessage')->updateOrInsert(
            ['userId' => $request->user()->id, 'messageId' => $messageId],
            ['createdAt' => now()],
        );

        return response()->json(['data' => ['id' => $messageId]]);
    }

    public function destroySavedMessage(Request $request, int $messageId): JsonResponse
    {
        DB::table('SavedMessage')
            ->where('userId', $request->user()->id)
            ->where('messageId', $messageId)
            ->delete();

        return response()->json(['ok' => true]);
    }

    public function unfurl(Request $request): JsonResponse
    {
        $data = $request->validate(['url' => 'required|url|max:2048']);
        $host = parse_url($data['url'], PHP_URL_HOST) ?: $data['url'];
        $siteName = preg_replace('/^www\./', '', (string) $host);

        return response()->json(['data' => [
            'url' => $data['url'],
            'title' => $siteName,
            'description' => $data['url'],
            'siteName' => $siteName,
            'favicon' => 'https://www.google.com/s2/favicons?domain=' . rawurlencode($siteName) . '&sz=64',
        ]]);
    }

    public function profile(Request $request, OrgChainService $orgChain): JsonResponse|Response
    {
        if (!$request->expectsJson()) {
            return Inertia::render('ProfileView');
        }

        $user = $request->user()->load([
            'unit:id,code,name',
            'directorate:id,code,name',
            'position:id,code,name,levelCode,roleType,reportsToPositionId',
        ]);

        // Resolve supervisor chain via OrgChainService (index 0 = atasan langsung).
        $supervisorChain = $orgChain->getEscalationChain($user, 6)
            ->map(fn ($supervisor) => [
                'id' => $supervisor->id,
                'name' => $supervisor->name,
                'roleType' => $supervisor->roleType,
                'positionTitle' => $supervisor->positionTitle,
                'avatarUrl' => $supervisor->avatarUrl ?? null,
            ])
            ->values();

        return response()->json([
            'user' => $user,
            'supervisorChain' => $supervisorChain,
            'subordinates' => User::query()
                ->where('managerUserId', $user->id)
                ->get(['id', 'name', 'email', 'roleType', 'positionTitle', 'avatarUrl']),
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
                'tasks' => fn ($q) => $q
                    ->select([
                        'id', 'code', 'title', 'description', 'output', 'status',
                        'percentComplete', 'priority', 'startDate', 'targetCompletion',
                        'actualCompletion', 'isBlocked', 'blockedReason', 'healthStatus',
                        'letterIndex', 'phaseId', 'assignedTo', 'initiativeId',
                    ])
                    ->orderBy('letterIndex')
                    ->orderBy('createdAt'),
                'tasks.assignee:id,name,avatarUrl',
                'entityPics',
            ])
            ->findOrFail($id);

        // Map task picPersons (alias dari assignee untuk konsistensi UI)
        $tasks = $workstream->tasks->map(function ($t) {
            $arr = $t->toArray();
            $arr['picPersons'] = $t->assignee ? [['id' => $t->assignee->id, 'name' => $t->assignee->name]] : [];
            return $arr;
        });

        return response()->json(['data' => [
            ...$workstream->toArray(),
            'tasks' => $tasks,
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
            'budgetIdr' => 'nullable|numeric',
            'budgetSpent' => 'nullable|numeric',
        ]);

        $picPersonIds = $data['picPersonIds'] ?? [];
        unset($data['picPersonIds']);

        $workstream = Workstream::create([
            ...$data,
            'code' => 'WS-' . strtoupper(substr(sha1(uniqid('', true)), 0, 8)),
            'ownerId' => $data['ownerId'] ?? $request->user()->id,
            'status' => 'BACKLOG',
            'priority' => $data['priority'] ?? 'MEDIUM',
            'progressPercent' => 0,
            'healthStatus' => 'YELLOW',
        ]);

        if (!empty($picPersonIds)) {
            EntityPic::syncForEntity('Initiative', $workstream->id, $picPersonIds);
        }

        $workstream->load('entityPics');

        // Broadcast cascade: workstream baru → parent program readiness
        // berubah (hasWorkstream berpotensi flip false→true). FE perlu
        // refetch program detail supaya checklist activation update.
        BroadcastService::workstream($workstream->id, 'created', [
            'programId' => $workstream->programId,
        ]);
        BroadcastService::program($workstream->programId, 'workstream-added', [
            'workstreamId' => $workstream->id,
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
            'budgetIdr' => 'nullable|numeric',
            'budgetSpent' => 'nullable|numeric',
        ]);

        $picPersonIds = array_key_exists('picPersonIds', $data) ? $data['picPersonIds'] : null;
        unset($data['picPersonIds']);

        $workstream = Workstream::findOrFail($id);
        $workstream->update($data);

        if ($picPersonIds !== null) {
            EntityPic::syncForEntity('Initiative', $id, $picPersonIds ?? []);
        }

        rescue(fn () => $this->healthService->recompute($workstream->programId));

        return response()->json(['data' => $workstream->fresh(['entityPics'])]);
    }

    public function destroyWorkstream(int $id): JsonResponse
    {
        $programId = Workstream::find($id)?->programId;
        Workstream::destroy($id);
        if ($programId) rescue(fn () => $this->healthService->recompute($programId));
        return response()->json(['ok' => true]);
    }

    public function usersPresence(): JsonResponse
    {
        return response()->json(['users' => $this->presenceQuery()->get()]);
    }

    /**
     * Post-MVP — Mark onboarding tour completed.
     * Body: { tourId: string }. Tour ID disimpan di User.toursCompleted JSON
     * dengan timestamp ISO. Idempotent — kalau sudah ada, update timestamp.
     */
    public function markTourCompleted(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tourId' => 'required|string|max:50',
        ]);
        $user = $request->user();
        $current = $user->toursCompleted ?? [];
        $current[$data['tourId']] = now()->toIso8601String();
        $user->update(['toursCompleted' => $current]);
        return response()->json(['data' => $current]);
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

    /**
     * Sprint 2 — Inbox "Hari Ini": agregat semua komitmen user dengan due ≤ today.
     * Sumber:
     *   - Task (assignedTo, targetCompletion ≤ end of today, status not COMPLETED/CANCELLED)
     *   - MeetingActionItem (assignedToId, dueDate ≤ end of today, status != COMPLETED)
     *   - Assignment (assignedTo, dueDate ≤ end of today, status not COMPLETED/CANCELLED)
     *
     * Cache 60 detik per user untuk mengurangi DB pressure saat reload.
     */
    public function inboxToday(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        $ttl = (int) setting('inbox_today.cache_ttl_seconds', 60);
        $cacheKey = "atlas.inbox_today.user.{$userId}";

        $payload = Cache::remember($cacheKey, $ttl, function () use ($userId) {
            $today = now()->endOfDay();

            $tasks = Task::query()
                ->where('assignedTo', $userId)
                ->whereNotNull('targetCompletion')
                ->where('targetCompletion', '<=', $today)
                ->whereNotIn('status', ['COMPLETED', 'CANCELLED', 'DONE'])
                ->orderBy('targetCompletion')
                ->limit(50)
                ->get(['id', 'title', 'status', 'targetCompletion', 'initiativeId'])
                ->map(fn ($t) => [
                    'kind'  => 'task',
                    'id'    => $t->id,
                    'title' => $t->title,
                    'status' => $t->status,
                    'due'   => $t->targetCompletion,
                ]);

            $actionItems = MeetingActionItem::query()
                ->where('assignedToId', $userId)
                ->whereNotNull('dueDate')
                ->where('dueDate', '<=', $today)
                ->where('status', '!=', 'COMPLETED')
                ->orderBy('dueDate')
                ->limit(50)
                ->get(['id', 'title', 'status', 'dueDate', 'meetingId'])
                ->map(fn ($a) => [
                    'kind'  => 'action_item',
                    'id'    => $a->id,
                    'title' => $a->title,
                    'status' => $a->status,
                    'due'   => $a->dueDate,
                    'meetingId' => $a->meetingId,
                ]);

            $assignments = Assignment::query()
                ->where('assigneeId', $userId)
                ->whereNotNull('dueDate')
                ->where('dueDate', '<=', $today)
                ->whereNotIn('status', ['SELESAI', 'DITOLAK', 'DIBATALKAN', 'COMPLETED', 'CANCELLED'])
                ->orderBy('dueDate')
                ->limit(50)
                ->get(['id', 'title', 'status', 'dueDate'])
                ->map(fn ($x) => [
                    'kind'  => 'assignment',
                    'id'    => $x->id,
                    'title' => $x->title,
                    'status' => $x->status,
                    'due'   => $x->dueDate,
                ]);

            $items = $tasks->concat($actionItems)->concat($assignments)
                ->sortBy('due')
                ->values();

            return [
                'items' => $items,
                'count' => $items->count(),
                'breakdown' => [
                    'task' => $tasks->count(),
                    'action_item' => $actionItems->count(),
                    'assignment' => $assignments->count(),
                ],
            ];
        });

        return response()->json($payload);
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
        $ids = collect([$currentUserId, $otherUserId])->sort()->values()->all();
        $name = 'dm-' . implode('-', $ids);

        $channel = Channel::firstOrCreate(
            ['name' => $name, 'type' => 'PRIVATE'],
            [
                'code' => 'dm-' . implode('-', $ids),
                'description' => 'Direct message',
                'createdBy' => $currentUserId,
            ],
        );

        $wasNew = $channel->wasRecentlyCreated;

        DB::table('ChannelMember')->updateOrInsert(
            ['channelId' => $channel->id, 'userId' => $currentUserId],
            ['joinedAt' => now()],
        );
        DB::table('ChannelMember')->updateOrInsert(
            ['channelId' => $channel->id, 'userId' => $otherUserId],
            ['joinedAt' => now()],
        );

        // Notify the DM partner so their sidebar updates in real-time
        if ($wasNew) {
            BroadcastService::toUsers('channel:channel:created', [
                'channel' => $channel->toArray(),
            ], [$otherUserId]);
        }

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
        $request->validate(['files' => 'required|array', 'files.*' => 'file|max:10240']);

        $attachments = [];
        foreach ($request->file('files') as $file) {
            $path = $file->store('uploads', 'public');
            $attachments[] = [
                'url'  => '/storage/' . $path,
                'name' => $file->getClientOriginalName(),
                'type' => $file->getMimeType(),
                'size' => $file->getSize(),
            ];
        }

        return response()->json(['data' => $attachments]);
    }

    private function presenceQuery()
    {
        return UserStatus::query()
            ->with([
                'user:id,name,email,roleType,positionTitle,avatarUrl,unitId,directorateId',
                'user.unit:id,name',
                'user.directorate:id,name',
            ])
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

    private function searchIncludes(string $type, array $aliases): bool
    {
        return $type === 'ALL' || in_array($type, $aliases, true);
    }

    private function likeOperator(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }

    private function activityRange(mixed $range): array
    {
        $days = match ($range) {
            '30d' => 30,
            '90d' => 90,
            default => 7,
        };

        return [now()->subDays($days - 1)->startOfDay(), now()->endOfDay()];
    }

    private function sessionDurationMs(UserSession $session): int
    {
        if ($session->durationMs > 0) {
            return (int) $session->durationMs;
        }

        $start = $session->startedAt ? Carbon::parse($session->startedAt) : now();
        $end = $session->endedAt
            ? Carbon::parse($session->endedAt)
            : ($session->lastPingAt ? Carbon::parse($session->lastPingAt) : now());

        return max(0, $start->diffInMilliseconds($end));
    }

    private function dailyActivity(Carbon $from, Carbon $to, $sessions)
    {
        $byDate = $sessions->groupBy(fn ($session) => Carbon::parse($session->startedAt)->toDateString());
        $days = collect();
        $cursor = $from->copy();

        while ($cursor->lte($to)) {
            $date = $cursor->toDateString();
            $days->push([
                'date' => $date,
                'durationMs' => $byDate->get($date, collect())->sum(fn ($session) => $this->sessionDurationMs($session)),
            ]);
            $cursor->addDay();
        }

        return $days;
    }

    private function iso(mixed $value): string
    {
        return Carbon::parse($value ?? now())->toISOString();
    }
}
