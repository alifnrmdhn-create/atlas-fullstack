<?php

namespace App\Http\Controllers;

use App\Models\Channel;
use App\Models\ChannelMember;
use App\Models\ChannelMessage;
use App\Models\Program;
use App\Services\BroadcastService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ChannelController extends Controller
{
    private function validationError(Request $request, string $message): JsonResponse|RedirectResponse
    {
        if ($request->expectsJson()) {
            return response()->json([
                'message' => $message,
                'errors' => ['general' => [$message]],
            ], 422);
        }

        return back()->withErrors([$message]);
    }

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $userId = $request->user()->id;
        $channels = $this->listForUser($userId, $request->user()->roleType);
        if ($request->expectsJson()) {
            return response()->json(['data' => $channels, 'total' => count($channels)]);
        }

        return Inertia::render('ChannelsViewWrapper', [
            'channels' => $channels,
            // Lean program list for the channel context banner — only programs
            // actually linked to one of the user's channels (find-by-id on FE).
            'programs' => $this->linkedProgramsFor($channels),
        ]);
    }

    public function show(Request $request, int $id)
    {
        $channel = Channel::query()->with([
            'members.user:id,name,avatarUrl,roleType,positionTitle',
        ])->findOrFail($id);
        $this->requireChannelReadAccess($request, $channel);
        if ($request->expectsJson()) {
            return response()->json([
                'channel' => $channel,
                'members' => $channel->members->map(fn ($member) => [
                    'channelId' => $member->channelId,
                    'userId' => $member->userId,
                    'name' => $member->user?->name,
                    'roleType' => $member->user?->roleType,
                    'status' => null,
                    'lastViewedAt' => $member->lastViewedAt,
                    'isMuted' => $member->isMuted,
                ])->values(),
            ]);
        }

        return Inertia::render('ChannelDetailView', ['channel' => $channel]);
    }

    // ── JSON endpoints ───────────────────────────────────────────────────────

    public function browse(Request $request)
    {
        $userId = $request->user()->id;
        $channels = Channel::query()
            ->where('isArchived', false)
            ->where('type', 'PUBLIC')
            ->withCount(['members', 'messages'])
            ->orderBy('name')
            ->get();

        $memberOfIds = ChannelMember::query()
            ->where('userId', $userId)
            ->whereIn('channelId', $channels->pluck('id'))
            ->pluck('channelId')
            ->all();
        $memberSet = array_flip($memberOfIds);

        return response()->json([
            'data' => $channels->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'description' => $c->description,
                'type' => $c->type,
                'memberCount' => $c->members_count,
                'messageCount' => $c->messages_count,
                'isMember' => isset($memberSet[$c->id]),
            ]),
        ]);
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:80',
            'description' => 'nullable|string|max:500',
            'type' => 'in:PUBLIC,PRIVATE',
            'topicType' => 'nullable|string|max:40',
            'linkedProgramId' => 'nullable|integer',
            'linkedWorkstreamId' => 'nullable|integer',
        ]);

        $userId = $request->user()->id;
        $code = preg_replace('/[^a-z0-9]+/', '-', strtolower($data['name']));
        $code = trim($code, '-');

        $channel = Channel::create([
            ...$data,
            'code' => $code,
            'createdBy' => $userId,
            'ownerUnitId' => $request->user()->unitId,
            'isArchived' => false,
            'allowThreads' => true,
            'allowReactions' => true,
            'linkedInitiativeId' => $data['linkedWorkstreamId'] ?? null,
        ]);

        // Auto-add creator as starred member
        ChannelMember::create([
            'channelId' => $channel->id,
            'userId' => $userId,
            'isMuted' => false,
            'isStarred' => true,
        ]);

        BroadcastService::all('channel:channel:created', ['channel' => $channel]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $channel], 201);
        }

        return redirect()->route('channels.show', $channel->id)->with('success', 'Channel created.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|max:80',
            'description' => 'nullable|string|max:500',
            'topicType' => 'nullable|string|max:40',
        ]);

        $channel = Channel::findOrFail($id);
        $this->requireChannelOwner($request, $channel);

        Channel::query()->where('id', $id)->update($data);
        $updated = Channel::findOrFail($id);

        BroadcastService::toUsers('channel:channel:updated', ['channel' => $updated],
            ChannelMember::where('channelId', $id)->pluck('userId')->all()
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $updated]);
        }

        return back()->with('success', 'Channel updated.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $channel = Channel::findOrFail($id);
        $this->requireChannelOwner($request, $channel);

        $memberIds = ChannelMember::where('channelId', $id)->pluck('userId')->all();
        Channel::query()->where('id', $id)->update(['isArchived' => true]);

        BroadcastService::toUsers('channel:channel:archived', ['channelId' => $id], $memberIds);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return redirect()->route('channels.index')->with('success', 'Channel archived.');
    }

    // ── Member management ─────────────────────────────────────────────────────

    public function addMember(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate(['userId' => 'required|integer']);
        $channel = Channel::findOrFail($id);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        // Check: actor must be member or admin
        $isMember = ChannelMember::where('channelId', $id)->where('userId', $user->id)->exists();
        if (!$isMember && !$isAdmin) return $this->validationError($request, 'You are not a member of this channel.');

        // DM guard
        if ($channel->type === 'PRIVATE' && preg_match('/^dm-\d+-\d+$/', $channel->name)) {
            return $this->validationError($request, 'Direct messages do not support adding new participants.');
        }

        if (!$isAdmin && $channel->createdBy !== $user->id) {
            return $this->validationError($request, 'Only the channel creator or an admin can add members.');
        }

        $member = ChannelMember::updateOrCreate(
            ['channelId' => $id, 'userId' => $data['userId']],
            ['isMuted' => false, 'isStarred' => false],
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $member], 201);
        }

        return back()->with('success', 'Member added.');
    }

    public function removeMember(Request $request, int $id, int $userId): JsonResponse|RedirectResponse
    {
        $channel = Channel::findOrFail($id);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);
        $isSelf = $user->id === $userId;

        if (!ChannelMember::where('channelId', $id)->where('userId', $userId)->exists()) {
            return $this->validationError($request, 'Member not found in this channel.');
        }

        if (!$isSelf) {
            if ($channel->type === 'PRIVATE' && preg_match('/^dm-\d+-\d+$/', $channel->name)) {
                return $this->validationError($request, 'A DM can only be closed by each participant individually.');
            }
            $canManage = $isAdmin || $channel->createdBy === $user->id;
            if (!$canManage) return $this->validationError($request, 'Only the channel creator or an admin can remove members.');
            if ($userId === $channel->createdBy && !$isAdmin) {
                return $this->validationError($request, 'The channel creator can only leave on their own or be removed by an admin.');
            }
        }

        ChannelMember::where('channelId', $id)->where('userId', $userId)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Member removed.');
    }

    public function join(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $channel = Channel::findOrFail($id);
        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);

        if ($channel->isArchived) {
            return $this->validationError($request, 'This channel is already archived.');
        }
        if (!$isAdmin) {
            if ($channel->type !== 'PUBLIC') {
                abort(403, 'Private channels can only be accessed by invitation.');
            }
            if (preg_match('/^dm-\d+-\d+$/', (string) $channel->name)) {
                abort(403, 'Direct messages do not support open join.');
            }
        }

        $userId = $request->user()->id;
        $member = ChannelMember::updateOrCreate(
            ['channelId' => $id, 'userId' => $userId],
            ['isMuted' => false, 'isStarred' => false],
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $member]);
        }

        return back()->with('success', 'Berhasil bergabung ke channel.');
    }

    public function toggleStar(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate(['isStarred' => 'required|boolean']);
        ChannelMember::where('channelId', $id)
            ->where('userId', $request->user()->id)
            ->update(['isStarred' => $data['isStarred']]);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back();
    }

    public function markRead(Request $request, int $id): JsonResponse|RedirectResponse
    {
        ChannelMember::where('channelId', $id)
            ->where('userId', $request->user()->id)
            ->update(['lastViewedAt' => now()]);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back();
    }

    public function markAllRead(Request $request): JsonResponse|RedirectResponse
    {
        ChannelMember::where('userId', $request->user()->id)->update(['lastViewedAt' => now()]);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back();
    }

    public function markUnread(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate(['messageId' => 'required|integer']);
        $msg = ChannelMessage::find($data['messageId']);
        if (!$msg) return $this->validationError($request, 'Message not found.');

        $markAt = $msg->createdAt->subSecond();
        ChannelMember::where('channelId', $id)
            ->where('userId', $request->user()->id)
            ->update(['lastViewedAt' => $markAt]);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back();
    }

    public function toggleMute(Request $request, int $id, int $userId): JsonResponse|RedirectResponse
    {
        $data = $request->validate(['isMuted' => 'required|boolean']);
        $actor = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($actor->roleType);
        if (!$isAdmin && $actor->id !== $userId) {
            abort(403, 'You can only change notification settings for your own channels.');
        }

        ChannelMember::where('channelId', $id)
            ->where('userId', $userId)
            ->update(['isMuted' => $data['isMuted']]);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back();
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private function requireChannelOwner(Request $request, Channel $channel): void
    {
        $user = $request->user();
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;
        if ($channel->createdBy === $user->id) return;
        abort(403, 'Only the channel creator or an admin can perform this action.');
    }

    private function requireChannelReadAccess(Request $request, Channel $channel): void
    {
        $user = $request->user();
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;
        if ($channel->type === 'PUBLIC' && !$channel->isArchived) return;
        $isMember = ChannelMember::where('channelId', $channel->id)
            ->where('userId', $user->id)
            ->exists();
        if (!$isMember) {
            abort(403, 'You do not have access to this channel.');
        }
    }

    private function listForUser(int $userId, string $roleType): array
    {
        $isAdmin = RolePolicy::isAdminOrAbove($roleType);

        $memberChannelIds = ChannelMember::where('userId', $userId)->pluck('channelId');

        $query = Channel::query()
            ->where('isArchived', false)
            ->withCount('members')
            ->with(['members' => fn ($q) => $q->where('userId', $userId)])
            ->orderBy('name');

        if (!$isAdmin) {
            $query->where(fn ($q) => $q
                ->where('type', 'PUBLIC')
                ->orWhereIn('id', $memberChannelIds)
            );
        }

        $channels = $query->get();
        $channelIds = $channels->pluck('id')->all();

        // Batch anti-N+1 (audit 2026-06-10): sebelumnya lastMessage + unreadCount
        // di-query PER CHANNEL di dalam map (2N query per loadOverview; semua user
        // login pagi = beban DB terbesar). Kini 2 query agregat utk seluruh daftar.

        // 1 query: pesan terakhir per channel via DISTINCT ON (PostgreSQL).
        // Tetap lewat Eloquent supaya cast createdAt (Carbon) identik dgn sebelumnya.
        $lastMsgs = $channelIds === [] ? collect() : ChannelMessage::query()
            ->selectRaw('DISTINCT ON ("channelId") "id", "channelId", "content", "createdAt", "userId"')
            ->whereIn('channelId', $channelIds)
            ->whereNull('deletedForEveryoneAt')
            ->whereNull('parentMessageId')
            ->orderBy('channelId')
            ->orderByDesc('createdAt')
            ->get()
            ->keyBy('channelId');

        // 1 query: unread per channel. Cutoff per-membership (lastViewedAt ??
        // joinedAt) ikut di JOIN — coalesce NULL > NULL = false, jadi membership
        // tanpa cutoff otomatis 0 (sama dgn perilaku lama).
        $unreadCounts = $channelIds === [] ? collect() : DB::table('ChannelMessage as m')
            ->join('ChannelMember as cm', fn ($j) => $j
                ->on('cm.channelId', '=', 'm.channelId')
                ->where('cm.userId', '=', $userId))
            ->whereIn('m.channelId', $channelIds)
            ->where('m.userId', '!=', $userId)
            ->whereNull('m.deletedForEveryoneAt')
            ->whereNull('m.parentMessageId')
            ->whereRaw('m."createdAt" > coalesce(cm."lastViewedAt", cm."joinedAt")')
            ->groupBy('m.channelId')
            ->selectRaw('m."channelId", count(*) as cnt')
            ->pluck('cnt', 'channelId');

        return $channels->map(function ($ch) use ($userId, $isAdmin, $lastMsgs, $unreadCounts) {
            $membership = $ch->members->first();
            $lastMsg = $lastMsgs->get($ch->id);
            $unreadCount = $membership ? (int) ($unreadCounts->get($ch->id) ?? 0) : 0;

            return [
                'id' => $ch->id,
                'code' => $ch->code,
                'name' => $ch->name,
                'type' => $ch->type,
                'description' => $ch->description,
                'topicType' => $ch->topicType,
                'linkedProgramId' => $ch->linkedProgramId,
                'linkedWorkstreamId' => $ch->linkedInitiativeId,
                'memberCount' => $ch->members_count,
                'isStarred' => (bool) ($membership?->isStarred ?? false),
                'isMuted' => (bool) ($membership?->isMuted ?? false),
                'unreadCount' => $unreadCount,
                'isMember' => $membership !== null,
                'isDirectMessage' => $ch->type === 'PRIVATE' && preg_match('/^dm-\d+-\d+$/', $ch->name),
                'canManageMembers' => $isAdmin || $ch->createdBy === $userId,
                'lastMessage' => $lastMsg ? [
                    'id' => $lastMsg->id,
                    'content' => $lastMsg->content,
                    'createdAt' => $lastMsg->createdAt,
                    'userId' => $lastMsg->userId,
                ] : null,
            ];
        })->all();
    }

    /**
     * Build the lean Program payload for the channel context banner.
     * Only programs linked (via Channel.linkedProgramId) to one of the
     * passed channels are returned, with just the fields the banner needs.
     */
    private function linkedProgramsFor(array $channels): array
    {
        $ids = collect($channels)->pluck('linkedProgramId')->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }

        return Program::query()
            ->whereIn('id', $ids)
            ->get(['id', 'code', 'name', 'status', 'priority', 'progressPercent', 'healthStatus', 'approvalStatus', 'rejectionNote', 'targetEndDate'])
            ->map(fn ($p) => [
                'id' => $p->id,
                'code' => $p->code,
                'name' => $p->name,
                'status' => $p->status,
                'priority' => $p->priority,
                'progressPercent' => $p->progressPercent ?? 0,
                'healthStatus' => $p->healthStatus ?? 'YELLOW',
                'approvalStatus' => $p->approvalStatus,
                'rejectionNote' => $p->rejectionNote,
                'targetEndDate' => $p->targetEndDate,
            ])
            ->all();
    }
}
