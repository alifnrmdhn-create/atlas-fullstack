<?php

namespace App\Http\Controllers;

use App\Models\Channel;
use App\Models\ChannelMember;
use App\Models\ChannelMessage;
use App\Models\ChannelMessageHidden;
use App\Models\Notification;
use App\Models\User;
use App\Support\RolePolicy;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChannelMessageController extends Controller
{
    // GET /channels/:channelId/messages
    public function index(Request $request, int $channelId)
    {
        $userId = $request->user()->id;
        $limit = min((int) ($request->query('limit', 50)), 200);
        $offset = max((int) ($request->query('offset', 0)), 0);

        $hiddenIds = ChannelMessageHidden::where('userId', $userId)->pluck('messageId');

        $messages = ChannelMessage::query()
            ->where('channelId', $channelId)
            ->whereNull('parentMessageId')
            ->whereNull('deletedForEveryoneAt')
            ->whereNotIn('id', $hiddenIds)
            ->with('author:id,name,avatarUrl,roleType,positionTitle')
            ->withCount('replies')
            ->orderBy('createdAt', 'desc')
            ->limit($limit)->offset($offset)
            ->get();

        $total = ChannelMessage::query()
            ->where('channelId', $channelId)
            ->whereNull('parentMessageId')
            ->whereNull('deletedForEveryoneAt')
            ->whereNotIn('id', $hiddenIds)
            ->count();

        return response()->json(['data' => $messages->reverse()->values(), 'total' => $total]);
    }

    // POST /channels/:channelId/messages
    public function store(Request $request, int $channelId): RedirectResponse
    {
        $data = $request->validate([
            'content' => 'required|string|max:10000',
            'parentMessageId' => 'nullable|integer',
            'attachments' => 'nullable|array',
        ]);

        $userId = $request->user()->id;

        $message = DB::transaction(function () use ($channelId, $userId, $data) {
            $msg = ChannelMessage::create([
                'channelId' => $channelId,
                'userId' => $userId,
                'content' => $data['content'],
                'attachments' => $data['attachments'] ?? null,
                'parentMessageId' => $data['parentMessageId'] ?? null,
                'replyCount' => 0,
                'isPinned' => false,
                'isEdited' => false,
                'searchableText' => strtolower($data['content']),
            ]);

            // Increment parent reply count
            if (!empty($data['parentMessageId'])) {
                ChannelMessage::query()
                    ->where('id', $data['parentMessageId'])
                    ->increment('replyCount');
            }

            return $msg;
        });

        // Extract mentions & create notifications (async-like, non-blocking)
        rescue(function () use ($channelId, $userId, $data, $message) {
            $this->processMentions($channelId, $userId, $data['content'], $message->id);
        });

        return back()->with('success', 'Pesan terkirim.');
    }

    // PUT /channels/:channelId/messages/:messageId
    public function update(Request $request, int $channelId, int $messageId): RedirectResponse
    {
        $data = $request->validate(['content' => 'required|string|max:10000']);
        $msg = ChannelMessage::where('channelId', $channelId)->findOrFail($messageId);

        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);
        if (!$isAdmin && $msg->userId !== $request->user()->id) {
            abort(403, 'Hanya pengirim yang dapat mengedit pesan ini.');
        }

        $msg->update([
            'content' => $data['content'],
            'isEdited' => true,
            'editedAt' => now(),
            'editedBy' => $request->user()->id,
            'searchableText' => strtolower($data['content']),
        ]);

        return back()->with('success', 'Pesan diedit.');
    }

    // DELETE /channels/:channelId/messages/:messageId
    public function destroy(Request $request, int $channelId, int $messageId): RedirectResponse
    {
        $scope = $request->input('scope', 'self'); // 'self' | 'everyone'
        $userId = $request->user()->id;
        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);

        $msg = ChannelMessage::where('channelId', $channelId)->findOrFail($messageId);

        if ($scope === 'self') {
            // Hanya sembunyikan untuk pengirim
            ChannelMessageHidden::updateOrCreate(
                ['messageId' => $messageId, 'userId' => $userId],
                [],
            );
        } else {
            // Delete for everyone — hanya pengirim atau admin
            if (!$isAdmin && $msg->userId !== $userId) {
                abort(403, 'Hanya pengirim atau admin yang dapat menghapus pesan untuk semua.');
            }
            $msg->update([
                'deletedForEveryoneAt' => now(),
                'deletedForEveryoneBy' => $userId,
                'content' => '[Pesan dihapus]',
            ]);
        }

        return back()->with('success', 'Pesan dihapus.');
    }

    // GET /channels/:channelId/messages/:messageId/thread
    public function thread(Request $request, int $channelId, int $messageId)
    {
        $userId = $request->user()->id;
        $hiddenIds = ChannelMessageHidden::where('userId', $userId)->pluck('messageId');

        $parent = ChannelMessage::with('author:id,name,avatarUrl,roleType')
            ->where('channelId', $channelId)
            ->findOrFail($messageId);

        $replies = ChannelMessage::query()
            ->where('channelId', $channelId)
            ->where('parentMessageId', $messageId)
            ->whereNull('deletedForEveryoneAt')
            ->whereNotIn('id', $hiddenIds)
            ->with('author:id,name,avatarUrl,roleType')
            ->orderBy('createdAt')
            ->get();

        return response()->json(['data' => ['parent' => $parent, 'replies' => $replies]]);
    }

    // POST /channels/:channelId/messages/:messageId/reactions
    public function addReaction(Request $request, int $channelId, int $messageId): RedirectResponse
    {
        $data = $request->validate(['emoji' => 'required|string|max:10']);
        $this->toggleReaction($messageId, $request->user()->id, $data['emoji'], false);
        return back();
    }

    // DELETE /channels/:channelId/messages/:messageId/reactions/:emoji
    public function removeReaction(Request $request, int $channelId, int $messageId, string $emoji): RedirectResponse
    {
        $this->toggleReaction($messageId, $request->user()->id, $emoji, true);
        return back();
    }

    // PUT /channels/:channelId/messages/:messageId/pin
    public function togglePin(int $channelId, int $messageId): RedirectResponse
    {
        $msg = ChannelMessage::where('channelId', $channelId)->findOrFail($messageId);
        $msg->update(['isPinned' => !$msg->isPinned]);
        return back()->with('success', $msg->isPinned ? 'Pesan di-unpin.' : 'Pesan di-pin.');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function toggleReaction(int $messageId, int $userId, string $emoji, bool $remove): void
    {
        $msg = ChannelMessage::findOrFail($messageId);
        $reactions = $msg->reactions ?? [];
        $userIds = $reactions[$emoji] ?? [];

        if ($remove) {
            $userIds = array_values(array_filter($userIds, fn ($id) => $id !== $userId));
        } else {
            if (!in_array($userId, $userIds, true)) {
                $userIds[] = $userId;
            }
        }

        if (empty($userIds)) {
            unset($reactions[$emoji]);
        } else {
            $reactions[$emoji] = $userIds;
        }

        $msg->update(['reactions' => $reactions]);
    }

    private function processMentions(int $channelId, int $senderId, string $content, int $messageId): void
    {
        $members = ChannelMember::query()
            ->where('channelId', $channelId)
            ->join('User', 'ChannelMember.userId', '=', 'User.id')
            ->get(['ChannelMember.userId', 'User.name']);

        // Special: @channel/@here/@everyone/@all → semua anggota
        $mentionedIds = [];
        if (preg_match('/@(channel|here|everyone|all)\b/i', $content)) {
            $mentionedIds = $members->pluck('userId')->all();
        } else {
            $sorted = $members->sortByDesc(fn ($m) => strlen($m->name))->values();
            foreach ($sorted as $member) {
                $escaped = preg_quote($member->name, '/');
                if (preg_match('/@' . $escaped . '(?=$|\s|[^A-Za-z0-9])/u', $content)) {
                    $mentionedIds[] = $member->userId;
                }
            }
        }

        $mentioned = array_unique(array_filter($mentionedIds, fn ($id) => $id !== $senderId));
        if (empty($mentioned)) return;

        // Persist mentionedUserIds
        ChannelMessage::query()->where('id', $messageId)->update(['mentionedUserIds' => $mentioned]);

        // Create notifications
        $channel = Channel::find($channelId);
        $sender = User::find($senderId);
        $preview = mb_strlen($content) > 100 ? mb_substr($content, 0, 100) . '…' : $content;
        $msg = "{$sender->name} menyebut Anda di #{$channel->name}: \"{$preview}\"";
        $source = "{$sender->name}·channel:{$channelId}";

        foreach ($mentioned as $uid) {
            Notification::create([
                'userId' => $uid,
                'type' => 'MENTION',
                'message' => $msg,
                'source' => $source,
                'createdAt' => now(),
                'state' => 'UNREAD',
            ]);
        }
    }
}
