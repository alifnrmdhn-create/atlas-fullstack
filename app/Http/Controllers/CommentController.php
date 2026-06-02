<?php

namespace App\Http\Controllers;

use App\Models\Comment;
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

    // GET /:entityType/:entityId/comments
    public function index(Request $request, string $entityType, int $entityId)
    {
        $type = self::ENTITY_TYPE_MAP[$entityType] ?? abort(404);
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

        if ($request->expectsJson()) {
            return response()->json(['data' => $comment->load('author:id,name,avatarUrl,roleType,positionTitle')], 201);
        }

        return back()->with('success', 'Comment added.');
    }

    // GET /comments/:commentId/thread
    public function thread(int $commentId)
    {
        $parent = Comment::with('author:id,name,avatarUrl,roleType')->findOrFail($commentId);
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
        $data = $request->validate(['emoji' => 'required|string|max:10']);
        $this->toggleReaction($commentId, $request->user()->id, $data['emoji'], false);

        if ($request->expectsJson()) {
            return response()->json(['data' => Comment::findOrFail($commentId)]);
        }

        return back();
    }

    // DELETE /comments/:commentId/reactions/:emoji
    public function removeReaction(Request $request, int $commentId, string $emoji): JsonResponse|RedirectResponse
    {
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
