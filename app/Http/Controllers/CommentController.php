<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\Comment;
use App\Models\Notification;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use App\Services\BroadcastService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class CommentController extends Controller
{
    private const ENTITY_TYPE_MAP = [
        'programs'    => 'PROGRAM',
        'workstreams' => 'WORKSTREAM',
        'tasks'       => 'TASK',
        'blockers'    => 'BLOCKER',
    ];

    /**
     * Gate akses entity komentar (audit 2026-06-10): dulu index/store/thread/
     * reaction/pin menerima entityId mentah tanpa cek apa pun — user mana pun
     * bisa membaca thread & menulis komentar (plus fan-out notifikasi mention)
     * ke program/task/blocker unit lain by id. Semantik mengikuti
     * TaskController::assertCanSeeTask: admin lolos, selain itu OrgScope user
     * harus mencakup unit pemilik program entity. Baca & tulis disengaja sama
     * (komentar = kolaborasi tim entity; author-or-admin untuk edit/hapus
     * sudah dijaga terpisah di update/destroy).
     */
    private function assertEntityAccess(User $user, string $type, int $entityId): void
    {
        if (RolePolicy::isAdminOrAbove($user->roleType)) return;

        if (OrgScope::forUser($user)->coversUnit($this->ownerUnitForEntity($type, $entityId))) {
            return;
        }

        abort(403, 'You do not have access to this entity.');
    }

    private function assertCommentEntityAccess(User $user, Comment $comment): void
    {
        $this->assertEntityAccess($user, (string) $comment->entityType, (int) $comment->entityId);
    }

    /**
     * Resolve unit pemilik program dari entity polimorfik. GOTCHA (memory
     * proyek): Workstream.ownerUnitId selalu null → wajib resolve via
     * Program.ownerUnitId; dan jangan andalkan relasi ter-load (pola sama dgn
     * TaskController::ownerUnitForWorkstream). Entity tak ditemukan → null →
     * coversUnit false (403 untuk non-admin).
     */
    private function ownerUnitForEntity(string $type, int $entityId): ?int
    {
        $unitId = match ($type) {
            'PROGRAM' => Program::query()->find($entityId)?->ownerUnitId,
            'WORKSTREAM' => Workstream::query()
                ->with('program:id,ownerUnitId')
                ->find($entityId)?->program?->ownerUnitId,
            'TASK' => $this->ownerUnitForWorkstreamId(
                Task::query()->find($entityId)?->initiativeId),
            'BLOCKER' => $this->ownerUnitForWorkstreamId(
                Blocker::query()->find($entityId)?->task?->initiativeId),
            default => null,
        };

        return $unitId !== null ? (int) $unitId : null;
    }

    private function ownerUnitForWorkstreamId(?int $workstreamId): ?int
    {
        if ($workstreamId === null) return null;

        return Workstream::query()
            ->with('program:id,ownerUnitId')
            ->find($workstreamId)?->program?->ownerUnitId;
    }

    // GET /:entityType/:entityId/comments
    public function index(Request $request, string $entityType, int $entityId)
    {
        $type = self::ENTITY_TYPE_MAP[$entityType] ?? abort(404);
        $this->assertEntityAccess($request->user(), $type, $entityId);
        $threaded = $request->boolean('threaded', true);
        $parentOnly = $request->boolean('parentOnly', false);

        $query = Comment::query()
            ->where('entityType', $type)
            ->where('entityId', $entityId)
            ->with('author:id,name,avatarUrl,roleType,positionTitle')
            ->withCount('replies')
            ->orderBy('createdAt');

        if ($parentOnly) $query->whereNull('parentCommentId');

        $comments = $query->get();

        if ($threaded && !$parentOnly) {
            // Nest replies under parents
            $indexed = $comments->keyBy('id');
            $roots = [];
            foreach ($comments as $c) {
                if ($c->parentCommentId) {
                    $parent = $indexed->get($c->parentCommentId);
                    if ($parent) {
                        $parent->setRelation('childReplies', ($parent->childReplies ?? collect())->push($c));
                    }
                } else {
                    $roots[] = $c;
                }
            }
            return response()->json(['data' => $roots]);
        }

        return response()->json(['data' => $comments]);
    }

    // POST /:entityType/:entityId/comments
    public function store(Request $request, string $entityType, int $entityId): JsonResponse|RedirectResponse
    {
        $type = self::ENTITY_TYPE_MAP[$entityType] ?? abort(404);
        $this->assertEntityAccess($request->user(), $type, $entityId);

        $data = $request->validate([
            'commentText' => 'required|string|min:1|max:5000',
            'parentCommentId' => 'nullable|integer',
            'attachments' => 'nullable|array',
            'mentions' => 'nullable|array',
            'mentions.*' => 'integer',
        ]);

        $comment = Comment::create([
            'entityType' => $type,
            'entityId' => $entityId,
            'commentText' => $data['commentText'],
            'createdBy' => $request->user()->id,
            'parentCommentId' => $data['parentCommentId'] ?? null,
            'attachments' => $data['attachments'] ?? null,
            'mentionedUserIds' => $data['mentions'] ?? null,
            'searchableText' => strtolower($data['commentText']),
        ]);

        // Increment parent replyCount
        if (!empty($data['parentCommentId'])) {
            Comment::query()->where('id', $data['parentCommentId'])->increment('replyCount');
        }

        // Fan-out notifikasi @mention. Sebelumnya mentionedUserIds hanya tersimpan
        // di row komentar tanpa notifikasi apa pun (hanya Channels yang notify) →
        // @mention di diskusi task/program kosmetik. Sekarang dipasangkan dengan
        // Notification + BroadcastService (konvensi proyek), dengan guard scope.
        if (!empty($data['mentions'])) {
            $this->notifyMentions($request->user(), $type, $entityId, $comment, $data['mentions']);
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $comment->load('author:id,name,avatarUrl,roleType,positionTitle')], 201);
        }

        return back()->with('success', 'Comment added.');
    }

    /**
     * Kirim notifikasi MENTION ke user yang di-@ pada komentar entity. Guard
     * fan-out: hanya user yang OrgScope-nya mencakup unit pemilik entity (mirror
     * assertEntityAccess) yang menerima — supaya client tak bisa spam notifikasi
     * ke sembarang userId. Author dikecualikan; penerima di-cap sebagai backstop.
     */
    private function notifyMentions(User $sender, string $type, int $entityId, Comment $comment, array $mentionIds): void
    {
        $ids = array_values(array_unique(array_filter(
            array_map('intval', $mentionIds),
            fn ($uid) => $uid !== (int) $sender->id,
        )));
        if (empty($ids)) return;

        $ownerUnit = $this->ownerUnitForEntity($type, $entityId);
        $recipients = User::query()->whereIn('id', array_slice($ids, 0, 25))->get();
        if ($recipients->isEmpty()) return;

        $text = (string) $comment->commentText;
        $preview = mb_strlen($text) > 100 ? mb_substr($text, 0, 100) . '…' : $text;
        $msg = "{$sender->name} mentioned you in a discussion: \"{$preview}\"";
        $source = "{$sender->name}·" . $this->notifSourceToken($type, $entityId);

        foreach ($recipients as $u) {
            if (!RolePolicy::isAdminOrAbove($u->roleType)
                && !OrgScope::forUser($u)->coversUnit($ownerUnit)) {
                continue;
            }
            $notif = Notification::create([
                'userId' => $u->id,
                'type' => 'MENTION',
                'message' => $msg,
                'source' => $source,
                'createdAt' => now(),
                'state' => 'UNREAD',
            ]);
            BroadcastService::toUsers('notification:created', [
                'notification' => $notif,
            ], [(int) $u->id]);
        }
    }

    /**
     * Token entity untuk Notification.source agar bell deep-link benar (lihat
     * InboxView navigateToNotifSource). Blocker → task induknya (blocker tak
     * punya route detail sendiri).
     */
    private function notifSourceToken(string $type, int $entityId): string
    {
        return match ($type) {
            'PROGRAM' => "program:{$entityId}",
            'WORKSTREAM' => "workstream:{$entityId}",
            'BLOCKER' => 'task:' . ((int) (Blocker::query()->find($entityId)?->workItemId ?? 0)),
            default => "task:{$entityId}",
        };
    }

    // GET /comments/:commentId/thread
    public function thread(Request $request, int $commentId)
    {
        $parent = Comment::with('author:id,name,avatarUrl,roleType')->findOrFail($commentId);
        $this->assertCommentEntityAccess($request->user(), $parent);
        $replies = Comment::query()
            ->where('parentCommentId', $commentId)
            ->with('author:id,name,avatarUrl,roleType')
            ->orderBy('createdAt')
            ->get();

        return response()->json(['data' => ['parent' => $parent, 'replies' => $replies]]);
    }

    // PUT /comments/:commentId
    public function update(Request $request, int $commentId): JsonResponse|RedirectResponse
    {
        $comment = Comment::findOrFail($commentId);
        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);
        if (!$isAdmin && $comment->createdBy !== $request->user()->id) {
            abort(403, 'Only the author can edit this comment.');
        }

        $data = $request->validate(['commentText' => 'required|string|min:1|max:5000']);
        $comment->update([
            'commentText' => $data['commentText'],
            'isEdited' => true,
            'editedAt' => now(),
            'searchableText' => strtolower($data['commentText']),
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $comment->fresh('author:id,name,avatarUrl,roleType,positionTitle')]);
        }

        return back()->with('success', 'Comment updated.');
    }

    // DELETE /comments/:commentId
    public function destroy(Request $request, int $commentId): JsonResponse|RedirectResponse
    {
        $comment = Comment::findOrFail($commentId);
        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);
        if (!$isAdmin && $comment->createdBy !== $request->user()->id) {
            abort(403, 'Only the author can delete this comment.');
        }

        // Decrement parent replyCount
        if ($comment->parentCommentId) {
            Comment::query()->where('id', $comment->parentCommentId)
                ->where('replyCount', '>', 0)
                ->decrement('replyCount');
        }

        $comment->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Comment deleted.');
    }

    // POST /comments/:commentId/reactions
    public function addReaction(Request $request, int $commentId): JsonResponse|RedirectResponse
    {
        $this->assertCommentEntityAccess($request->user(), Comment::findOrFail($commentId));
        $data = $request->validate(['emoji' => 'required|string|max:32']);
        $this->toggleReaction($commentId, $request->user()->id, $data['emoji'], false);

        if ($request->expectsJson()) {
            return response()->json(['data' => Comment::findOrFail($commentId)]);
        }

        return back();
    }

    // DELETE /comments/:commentId/reactions/:emoji
    public function removeReaction(Request $request, int $commentId, string $emoji): JsonResponse|RedirectResponse
    {
        $this->assertCommentEntityAccess($request->user(), Comment::findOrFail($commentId));
        $this->toggleReaction($commentId, $request->user()->id, $emoji, true);

        if ($request->expectsJson()) {
            return response()->json(['data' => Comment::findOrFail($commentId)]);
        }

        return back();
    }

    // PUT /comments/:commentId/pin
    public function togglePin(Request $request, int $commentId): JsonResponse|RedirectResponse
    {
        $comment = Comment::findOrFail($commentId);
        // Pin = aksi tim entity (bukan author-only — smart defaults), tapi tetap
        // wajib akses entity: dulu user mana pun bisa pin/unpin komentar apa pun.
        $this->assertCommentEntityAccess($request->user(), $comment);
        $comment->update(['isPinned' => !$comment->isPinned]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $comment->fresh()]);
        }

        return back()->with('success', $comment->isPinned ? 'Komentar di-pin.' : 'Komentar di-unpin.');
    }

    private function toggleReaction(int $commentId, int $userId, string $emoji, bool $remove): void
    {
        $comment = Comment::findOrFail($commentId);
        $reactions = $comment->reactions ?? [];
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

        $comment->update(['reactions' => $reactions]);
    }
}
