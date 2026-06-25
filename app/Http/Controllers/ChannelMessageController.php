<?php

namespace App\Http\Controllers;

use App\Models\Channel;
use App\Models\ChannelMember;
use App\Models\ChannelMessage;
use App\Models\ChannelMessageHidden;
use App\Models\Notification;
use App\Models\User;
use App\Services\BroadcastService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ChannelMessageController extends Controller
{
    // GET /channels/:channelId/messages
    public function index(Request $request, int $channelId)
    {
        $this->requireChannelAccess($request, $channelId, write: false);
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
    public function store(Request $request, int $channelId): JsonResponse|RedirectResponse
    {
        // content NULLABLE (bukan required): pesan boleh berisi lampiran saja
        // tanpa teks. Catatan penting — middleware global TrimStrings +
        // ConvertEmptyStringsToNull membuat content " " (spasi) atau "" menjadi
        // NULL sebelum sampai validator, jadi rule `required` lama menolak pesan
        // attachment-only dengan "The content field is required." (bug upload
        // chat 2026-06-25). Validasi "isi minimal" dilakukan manual di bawah.
        $data = $request->validate([
            'content' => 'nullable|string|max:10000',
            'parentMessageId' => 'nullable|integer',
            'attachments' => 'nullable|array|max:10',
            'attachments.*.url' => 'required_with:attachments|string|max:2048',
            'attachments.*.name' => 'required_with:attachments|string|max:512',
            'attachments.*.type' => 'required_with:attachments|string|max:255',
            'attachments.*.size' => 'nullable|integer|min:0',
        ]);

        $content = trim((string) ($data['content'] ?? ''));
        $attachments = $data['attachments'] ?? null;

        // Pesan harus punya teks ATAU lampiran — keduanya kosong = tolak.
        if ($content === '' && empty($attachments)) {
            throw ValidationException::withMessages([
                'content' => 'A message must have text or an attachment.',
            ]);
        }

        $this->requireChannelAccess($request, $channelId, write: true);
        $userId = $request->user()->id;

        $message = DB::transaction(function () use ($channelId, $userId, $content, $attachments, $data) {
            $msg = ChannelMessage::create([
                'channelId' => $channelId,
                'userId' => $userId,
                'content' => $content,
                'attachments' => $attachments,
                'parentMessageId' => $data['parentMessageId'] ?? null,
                'replyCount' => 0,
                'isPinned' => false,
                'isEdited' => false,
                'searchableText' => strtolower($content),
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
        rescue(function () use ($channelId, $userId, $content, $message) {
            $this->processMentions($channelId, $userId, $content, $message->id);
        });

        $message->load('author:id,name,avatarUrl,roleType,positionTitle');
        $memberIds = $this->memberIds($channelId);

        if (!empty($data['parentMessageId'])) {
            // Thread reply — emit specialized event so thread panels update
            $newReplyCount = ChannelMessage::where('id', $data['parentMessageId'])->value('replyCount') ?? 0;
            BroadcastService::toUsers('channel:thread:reply', [
                'channelId' => $channelId,
                'parentId' => $data['parentMessageId'],
                'reply' => $message,
                'newReplyCount' => $newReplyCount,
            ], $memberIds);
        } else {
            BroadcastService::toUsers('channel:message:created', [
                'channelId' => $channelId,
                'message' => $message,
            ], $memberIds);

            // DM notification — non-mention DMs still deserve a notification
            // (mentions handled by processMentions above)
            rescue(function () use ($channelId, $userId, $message, $memberIds) {
                $this->notifyDmRecipients($channelId, $userId, $message, $memberIds);
            });
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $message], 201);
        }

        return back()->with('success', 'Pesan terkirim.');
    }

    // PUT /channels/:channelId/messages/:messageId
    public function update(Request $request, int $channelId, int $messageId): JsonResponse|RedirectResponse
    {
        $data = $request->validate(['content' => 'required|string|max:10000']);
        $msg = ChannelMessage::where('channelId', $channelId)->findOrFail($messageId);

        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);
        if (!$isAdmin && $msg->userId !== $request->user()->id) {
            abort(403, 'Only the sender can edit this message.');
        }

        $msg->update([
            'content' => $data['content'],
            'isEdited' => true,
            'editedAt' => now(),
            'editedBy' => $request->user()->id,
            'searchableText' => strtolower($data['content']),
        ]);

        $fresh = $msg->fresh()->load('author:id,name,avatarUrl,roleType,positionTitle');
        BroadcastService::toUsers('channel:message:updated', [
            'channelId' => $channelId,
            'message' => $fresh,
        ], $this->memberIds($channelId));

        if ($request->expectsJson()) {
            return response()->json(['data' => $fresh]);
        }

        return back()->with('success', 'Message edited.');
    }

    // DELETE /channels/:channelId/messages/:messageId
    public function destroy(Request $request, int $channelId, int $messageId): JsonResponse|RedirectResponse
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
                abort(403, 'Only the sender or an admin can delete a message for everyone.');
            }
            $msg->update([
                'deletedForEveryoneAt' => now(),
                'deletedForEveryoneBy' => $userId,
                'content' => '[Message deleted]',
            ]);

            BroadcastService::toUsers('channel:message:deleted', [
                'channelId' => $channelId,
                'messageId' => $messageId,
                'parentMessageId' => $msg->parentMessageId,
            ], $this->memberIds($channelId));
        }

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Message deleted.');
    }

    // GET /channels/:channelId/messages/:messageId/thread
    public function thread(Request $request, int $channelId, int $messageId)
    {
        $this->requireChannelAccess($request, $channelId, write: false);
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
    public function addReaction(Request $request, int $channelId, int $messageId): JsonResponse|RedirectResponse
    {
        $data = $request->validate(['emoji' => 'required|string|max:10']);
        $this->requireChannelAccess($request, $channelId, write: true);
        $this->toggleReaction($channelId, $messageId, $request->user()->id, $data['emoji'], false);

        if ($request->expectsJson()) {
            return response()->json(['data' => ChannelMessage::findOrFail($messageId)]);
        }

        return back();
    }

    // DELETE /channels/:channelId/messages/:messageId/reactions/:emoji
    public function removeReaction(Request $request, int $channelId, int $messageId, string $emoji): JsonResponse|RedirectResponse
    {
        $this->requireChannelAccess($request, $channelId, write: true);
        $this->toggleReaction($channelId, $messageId, $request->user()->id, $emoji, true);

        if ($request->expectsJson()) {
            return response()->json(['data' => ChannelMessage::findOrFail($messageId)]);
        }

        return back();
    }

    // PUT /channels/:channelId/messages/:messageId/pin
    public function togglePin(Request $request, int $channelId, int $messageId): JsonResponse|RedirectResponse
    {
        $this->requireChannelAccess($request, $channelId, write: true);
        $msg = ChannelMessage::where('channelId', $channelId)->findOrFail($messageId);
        $msg->update(['isPinned' => !$msg->isPinned]);

        BroadcastService::toUsers('channel:message:pinned', [
            'channelId' => $channelId,
            'messageId' => $messageId,
            'isPinned' => $msg->isPinned,
        ], $this->memberIds($channelId));

        if ($request->expectsJson()) {
            return response()->json(['data' => $msg->fresh()]);
        }

        return back()->with('success', $msg->isPinned ? 'Pesan di-unpin.' : 'Pesan di-pin.');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Gate every channel-scoped operation. Reads allow PUBLIC channels for any
     * authenticated user (mirrors ChannelController::listForUser); writes always
     * require explicit membership (or admin) — so sending into a PUBLIC channel
     * still requires joining first.
     */
    private function requireChannelAccess(Request $request, int $channelId, bool $write): void
    {
        $channel = Channel::findOrFail($channelId);
        $user = $request->user();
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;

        $isMember = ChannelMember::where('channelId', $channelId)
            ->where('userId', $user->id)
            ->exists();

        if ($write) {
            if (!$isMember) abort(403, 'Only channel members can perform this action.');
            return;
        }
        if ($isMember) return;
        if ($channel->type === 'PUBLIC' && !$channel->isArchived) return;
        abort(403, 'You do not have access to this channel.');
    }

    private function toggleReaction(int $channelId, int $messageId, int $userId, string $emoji, bool $remove): void
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

        BroadcastService::toUsers('channel:reaction:changed', [
            'channelId' => $channelId,
            'messageId' => $messageId,
            'reactions' => $reactions,
        ], $this->memberIds($channelId));
    }

    private function memberIds(int $channelId): array
    {
        return ChannelMember::where('channelId', $channelId)->pluck('userId')->all();
    }

    private function notifyDmRecipients(int $channelId, int $senderId, ChannelMessage $message, array $memberIds): void
    {
        $channel = Channel::find($channelId);
        if (!$channel || $channel->type !== 'PRIVATE') return;
        if (!preg_match('/^dm-\d+-\d+$/', (string) $channel->name)) return;

        $recipientIds = array_values(array_filter(
            $memberIds,
            fn ($id) => (int) $id !== (int) $senderId,
        ));
        if (empty($recipientIds)) return;

        // Skip recipients already covered by a MENTION notification for this message
        // (processMentions writes mentionedUserIds directly to DB, so re-read it)
        $mentionedRaw = ChannelMessage::where('id', $message->id)->value('mentionedUserIds');
        if (!empty($mentionedRaw)) {
            $mentioned = array_map('intval', (array) $mentionedRaw);
            $recipientIds = array_values(array_filter(
                $recipientIds,
                fn ($id) => !in_array((int) $id, $mentioned, true),
            ));
            if (empty($recipientIds)) return;
        }

        $sender = User::find($senderId);
        if (!$sender) return;

        $content = trim((string) ($message->content ?? ''));
        if ($content === '') {
            // Pesan lampiran-saja (tanpa teks) — jangan tampilkan kutipan kosong.
            $count = is_array($message->attachments) ? count($message->attachments) : 0;
            $msg = "{$sender->name} sent " . ($count > 1 ? "{$count} attachments" : 'an attachment');
        } else {
            $preview = mb_strlen($content) > 100 ? mb_substr($content, 0, 100) . '…' : $content;
            $msg = "{$sender->name} sent a message: \"{$preview}\"";
        }
        $source = "{$sender->name}·channel:{$channelId}";

        foreach ($recipientIds as $uid) {
            $notif = Notification::create([
                'userId' => $uid,
                'type' => 'DM_RECEIVED',
                'message' => $msg,
                'source' => $source,
                'createdAt' => now(),
                'state' => 'UNREAD',
            ]);
            BroadcastService::toUsers('notification:created', [
                'notification' => $notif,
            ], [(int) $uid]);
        }
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
        $msg = "{$sender->name} mentioned you in #{$channel->name}: \"{$preview}\"";
        $source = "{$sender->name}·channel:{$channelId}";

        foreach ($mentioned as $uid) {
            $notif = Notification::create([
                'userId' => $uid,
                'type' => 'MENTION',
                'message' => $msg,
                'source' => $source,
                'createdAt' => now(),
                'state' => 'UNREAD',
            ]);
            BroadcastService::toUsers('notification:created', [
                'notification' => $notif,
            ], [(int) $uid]);
        }
    }
}
