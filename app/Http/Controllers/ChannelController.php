<?php

namespace App\Http\Controllers;

use App\Models\Channel;
use App\Models\ChannelMember;
use App\Models\ChannelMessage;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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

        return Inertia::render('ChannelsViewWrapper', ['channels' => $channels]);
    }

    public function show(Request $request, int $id)
    {
        $channel = Channel::query()->with([
            'members.user:id,name,avatarUrl,roleType,positionTitle',
        ])->findOrFail($id);
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
            ->get()
            ->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'description' => $c->description,
                'type' => $c->type,
                'memberCount' => $c->members_count,
                'messageCount' => $c->messages_count,
                'isMember' => ChannelMember::query()
                    ->where('channelId', $c->id)
                    ->where('userId', $userId)
                    ->exists(),
            ]);

        return response()->json(['data' => $channels]);
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

        if ($request->expectsJson()) {
            return response()->json(['data' => $channel], 201);
        }

        return redirect()->route('channels.show', $channel->id)->with('success', 'Channel dibuat.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|max:80',
            'description' => 'nullable|string|max:500',
            'topicType' => 'nullable|string|max:40',
        ]);

        Channel::query()->where('id', $id)->update($data);
        if ($request->expectsJson()) {
            return response()->json(['data' => Channel::findOrFail($id)]);
        }

        return back()->with('success', 'Channel diperbarui.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        Channel::query()->where('id', $id)->update(['isArchived' => true]);
        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return redirect()->route('channels.index')->with('success', 'Channel diarsipkan.');
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
        if (!$isMember && !$isAdmin) return $this->validationError($request, 'Anda bukan anggota channel ini.');

        // DM guard
        if ($channel->type === 'PRIVATE' && preg_match('/^dm-\d+-\d+$/', $channel->name)) {
            return $this->validationError($request, 'Direct message tidak mendukung penambahan peserta baru.');
        }

        if (!$isAdmin && $channel->createdBy !== $user->id) {
            return $this->validationError($request, 'Hanya pembuat channel atau admin yang dapat menambah anggota.');
        }

        $member = ChannelMember::updateOrCreate(
            ['channelId' => $id, 'userId' => $data['userId']],
            ['isMuted' => false, 'isStarred' => false],
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => $member], 201);
        }

        return back()->with('success', 'Anggota ditambahkan.');
    }

    public function removeMember(Request $request, int $id, int $userId): JsonResponse|RedirectResponse
    {
        $channel = Channel::findOrFail($id);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);
        $isSelf = $user->id === $userId;

        if (!ChannelMember::where('channelId', $id)->where('userId', $userId)->exists()) {
            return $this->validationError($request, 'Member tidak ditemukan di channel ini.');
        }

        if (!$isSelf) {
            if ($channel->type === 'PRIVATE' && preg_match('/^dm-\d+-\d+$/', $channel->name)) {
                return $this->validationError($request, 'DM hanya bisa ditutup oleh masing-masing peserta.');
            }
            $canManage = $isAdmin || $channel->createdBy === $user->id;
            if (!$canManage) return $this->validationError($request, 'Hanya pembuat channel atau admin yang dapat menghapus anggota.');
            if ($userId === $channel->createdBy && !$isAdmin) {
                return $this->validationError($request, 'Pembuat channel hanya dapat keluar sendiri atau dikeluarkan oleh admin.');
            }
        }

        ChannelMember::where('channelId', $id)->where('userId', $userId)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Anggota dikeluarkan.');
    }

    public function join(Request $request, int $id): JsonResponse|RedirectResponse
    {
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
        if (!$msg) return $this->validationError($request, 'Pesan tidak ditemukan.');

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
        ChannelMember::where('channelId', $id)
            ->where('userId', $userId)
            ->update(['isMuted' => $data['isMuted']]);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back();
    }

    // ── Helper ───────────────────────────────────────────────────────────────

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

        return $query->get()->map(function ($ch) use ($userId) {
            $membership = $ch->members->first();
            $lastMsg = ChannelMessage::query()
                ->where('channelId', $ch->id)
                ->whereNull('deletedForEveryoneAt')
                ->whereNull('parentMessageId')
                ->orderBy('createdAt', 'desc')
                ->first(['id', 'content', 'createdAt', 'userId']);

            $unreadCount = 0;
            if ($membership?->lastViewedAt) {
                $unreadCount = ChannelMessage::query()
                    ->where('channelId', $ch->id)
                    ->where('createdAt', '>', $membership->lastViewedAt)
                    ->whereNull('deletedForEveryoneAt')
                    ->whereNull('parentMessageId')
                    ->count();
            }

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
                'lastMessage' => $lastMsg ? [
                    'id' => $lastMsg->id,
                    'content' => $lastMsg->content,
                    'createdAt' => $lastMsg->createdAt,
                    'userId' => $lastMsg->userId,
                ] : null,
            ];
        })->all();
    }
}
