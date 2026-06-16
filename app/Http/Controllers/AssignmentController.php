<?php

namespace App\Http\Controllers;

use App\Models\Assignment;
use App\Models\AssignmentAttachment;
use App\Models\Notification;
use App\Services\ApprovalChainService;
use App\Services\AssignmentService;
use App\Services\BroadcastService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class AssignmentController extends Controller
{
    private const MAX_FILE_SIZE_KB = 20 * 1024; // 20MB
    private const ALLOWED_MIME_PREFIXES = [
        'image/', 'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument',
        'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
        'text/', 'application/zip', 'application/x-zip-compressed',
    ];

    public function __construct(
        private AssignmentService $service,
        private ApprovalChainService $chainService,
    ) {}

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $items = $this->service->listForUser($request->user(), $request->only(['scope', 'status', 'priority']));
        if ($request->expectsJson()) {
            return response()->json(['data' => $items, 'total' => $items->count()]);
        }

        return Inertia::render('AssignmentsView', [
            'assignments' => $items,
            'filters' => $request->only(['scope', 'status', 'priority']),
        ]);
    }

    public function show(Request $request, int $id)
    {
        $assignment = $this->service->findOrFailForUser($request->user(), $id);
        if ($request->expectsJson()) {
            return response()->json(['data' => $assignment]);
        }

        return Inertia::render('AssignmentDetailView', ['assignment' => $assignment]);
    }

    // ── JSON endpoints ───────────────────────────────────────────────────────

    public function previewChain(Request $request)
    {
        $data = $request->validate(['assigneeId' => 'required|integer']);
        return response()->json($this->service->previewChain($request->user(), $data['assigneeId']));
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'title' => 'required|string|min:2|max:200',
            'description' => 'nullable|string|max:2000',
            'priority' => 'in:LOW,MEDIUM,HIGH,CRITICAL',
            'dueDate' => 'required|date|after:today',
            'assigneeId' => 'required|integer',
            'watcherIds' => 'nullable|array',
            'watcherIds.*' => 'integer',
            'relatedProgramId' => 'nullable|integer',
            'tags' => 'nullable|array',
            'evidenceRequired' => 'boolean',
            'isPrivate' => 'boolean',
        ]);

        $assignment = $this->service->create($request->user(), $data);
        BroadcastService::assignment($assignment->id, 'created');

        $notif = Notification::create([
            'userId' => $assignment->assigneeId,
            'type' => 'TASK_ASSIGNED',
            'message' => "New assignment: {$assignment->title}",
            'source' => "assignment:{$assignment->id}",
            'state' => 'UNREAD',
            'createdAt' => now(),
        ]);
        BroadcastService::toUsers('notification:created', [
            'notification' => $notif,
        ], [$assignment->assigneeId]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $assignment], 201);
        }

        return redirect()->route('assignments.show', $assignment->id)
            ->with('success', 'Assignment created.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'title' => 'sometimes|string|min:2|max:200',
            'description' => 'nullable|string|max:2000',
            'priority' => 'sometimes|in:LOW,MEDIUM,HIGH,CRITICAL',
            'dueDate' => 'nullable|date',
            'assigneeId' => 'sometimes|integer',
            'watcherIds' => 'nullable|array',
            'relatedProgramId' => 'nullable|integer',
            'tags' => 'nullable|array',
        ]);

        $assignment = $this->service->update($request->user(), $id, $data);
        BroadcastService::assignment($id, 'updated');

        if ($request->expectsJson()) {
            return response()->json(['data' => $assignment]);
        }

        return back()->with('success', 'Assignment updated.');
    }

    public function transition(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'action' => 'required|in:ACKNOWLEDGE,CLARIFY,SUBMIT,SUBMIT_REVIEW,APPROVE,COMPLETE,RETURN,REJECT,CANCEL,REOPEN',
            'note' => 'nullable|string|max:1000',
        ]);

        $a = $this->service->transition($request->user(), $id, $data['action'], $data['note'] ?? null);
        BroadcastService::assignment($id, 'status-changed', [
            'status' => $a->status, 'action' => $data['action'],
        ]);

        // Notifikasi inbox (Notification + broadcast, selalu berpasangan). Sebelumnya
        // transisi hanya emit event realtime ephemeral (dihapus cleanup 2 menit), jadi
        // reviewer giliran berikutnya & PIC tak pernah tahu harus bertindak.
        $this->notifyAfterTransition($a, $data['action'], $request->user()->id);

        if ($request->expectsJson()) {
            return response()->json(['data' => $a]);
        }

        return back()->with('success', "Action {$data['action']} completed.");
    }

    /**
     * Kirim notifikasi ke pihak yang harus bertindak setelah transisi:
     *  - masuk/maju review (IN_REVIEW) → reviewer giliran sekarang
     *  - RETURN (kembali DIKERJAKAN)   → PIC (assignee), perlu revisi
     *  - REJECT (REJECTED)            → PIC, ditolak
     *  - approve final (SELESAI)      → PIC, disetujui & selesai
     * Lewati bila penerima = aktor (mis. self-assign yang submit→selesai sendiri).
     */
    private function notifyAfterTransition(Assignment $a, string $action, int $actorId): void
    {
        $recipientId = null;
        $type = null;
        $message = null;

        if ($a->status === AssignmentService::STATUS_IN_REVIEW && $a->currentReviewerIdx !== null) {
            $recipientId = $this->chainService->getCurrentReviewerUserId($a->id, $a->currentReviewerIdx);
            $type = 'ASSIGNMENT_REVIEW';
            $message = "Assignment awaiting your review: {$a->title}";
        } elseif ($a->status === AssignmentService::STATUS_DIKERJAKAN && $action === 'RETURN') {
            $recipientId = $a->assigneeId;
            $type = 'ASSIGNMENT_RETURNED';
            $message = "Assignment returned for revision: {$a->title}";
        } elseif ($a->status === AssignmentService::STATUS_REJECTED) {
            $recipientId = $a->assigneeId;
            $type = 'ASSIGNMENT_REJECTED';
            $message = "Assignment rejected: {$a->title}";
        } elseif ($a->status === AssignmentService::STATUS_SELESAI) {
            $recipientId = $a->assigneeId;
            $type = 'ASSIGNMENT_APPROVED';
            $message = "Assignment approved & completed: {$a->title}";
        }

        if (!$recipientId || $recipientId === $actorId) return;

        $notif = Notification::create([
            'userId' => $recipientId,
            'type' => $type,
            'message' => $message,
            'source' => "assignment:{$a->id}",
            'state' => 'UNREAD',
            'createdAt' => now(),
        ]);
        BroadcastService::toUsers('notification:created', ['notification' => $notif], [$recipientId]);
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $this->service->delete($request->user(), $id);
        BroadcastService::assignment($id, 'deleted');

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return redirect()->route('assignments.index')->with('success', 'Assignment deleted.');
    }

    // ── Evidence (attachments) ───────────────────────────────────────────────

    public function listAttachments(Request $request, int $id)
    {
        $a = $this->service->findOrFailForUser($request->user(), $id);
        $items = AssignmentAttachment::query()
            ->with('uploader:id,name,positionTitle')
            ->where('assignmentId', $a->id)
            ->orderBy('createdAt')
            ->get();

        return response()->json(['data' => $items, 'total' => $items->count()]);
    }

    public function uploadFile(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $a = Assignment::findOrFail($id);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        if (!$this->service->canUploadEvidence($a, $user->id, $isAdmin)) {
            abort(403, 'Only the PIC may upload evidence, and only before the assignment is completed.');
        }

        $request->validate([
            'file' => [
                'required', 'file',
                'max:' . self::MAX_FILE_SIZE_KB,
                function ($attribute, $value, $fail) {
                    if (!$this->isMimeAllowed($value->getMimeType())) {
                        $fail("File type is not allowed: {$value->getMimeType()}");
                    }
                },
            ],
            'description' => 'nullable|string|max:2000',
        ]);

        $file = $request->file('file');
        $safeName = preg_replace('/[^A-Za-z0-9_-]/', '_', pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME));
        $safeName = substr($safeName, 0, 60);
        $ext = $file->getClientOriginalExtension();
        $storedName = time() . '-' . bin2hex(random_bytes(8)) . "-{$safeName}" . ($ext ? ".{$ext}" : '');

        $relativePath = "assignments/{$id}/{$storedName}";
        // Disk config-driven (scale-readiness S1.4) — default 'local', flip ke s3
        // saat multi-replica (volume lokal tak share-able antar-replica).
        Storage::disk(config('uploads.private_disk'))->putFileAs("assignments/{$id}", $file, $storedName);

        $attachment = AssignmentAttachment::create([
            'assignmentId' => $id,
            'uploadedBy'   => $user->id,
            'type'         => 'FILE',
            'filename'     => $storedName,
            'originalName' => $file->getClientOriginalName(),
            'filepath'     => $relativePath,
            'filesize'     => $file->getSize(),
            'description'  => $request->input('description'),
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $attachment], 201);
        }

        return back()->with('success', 'Evidence file uploaded.');
    }

    public function addLinkOrNote(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $a = Assignment::findOrFail($id);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        if (!$this->service->canUploadEvidence($a, $user->id, $isAdmin)) {
            abort(403, 'Only the PIC may add evidence, before the assignment is completed.');
        }

        $data = $request->validate([
            'type' => 'required|in:LINK,NOTE',
            'url' => 'required_if:type,LINK|nullable|url|max:2000',
            'description' => 'required|string|min:1|max:2000',
        ]);

        $attachment = AssignmentAttachment::create([
            'assignmentId' => $id,
            'uploadedBy'   => $user->id,
            'type'         => $data['type'],
            'url'          => $data['url'] ?? null,
            'description'  => $data['description'],
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $attachment], 201);
        }

        return back()->with('success', 'Evidence added.');
    }

    public function downloadAttachment(Request $request, int $id, int $attId)
    {
        $a = $this->service->findOrFailForUser($request->user(), $id);
        $att = AssignmentAttachment::where('assignmentId', $a->id)->findOrFail($attId);

        if ($att->type !== 'FILE' || !$att->filepath) {
            abort(400, 'This attachment is not a file.');
        }

        return Storage::disk(config('uploads.private_disk'))->download($att->filepath, $att->originalName ?? $att->filename);
    }

    public function destroyAttachment(Request $request, int $id, int $attId): JsonResponse|RedirectResponse
    {
        $att = AssignmentAttachment::where('assignmentId', $id)->findOrFail($attId);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        if (!$isAdmin && $att->uploadedBy !== $user->id) {
            abort(403, 'Only the uploader can delete this attachment.');
        }

        // Best effort: hapus file fisik
        if ($att->type === 'FILE' && $att->filepath) {
            rescue(fn () => Storage::disk(config('uploads.private_disk'))->delete($att->filepath));
        }

        $att->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Attachment deleted.');
    }

    private function isMimeAllowed(?string $mime): bool
    {
        if (!$mime) return false;
        foreach (self::ALLOWED_MIME_PREFIXES as $prefix) {
            if (str_starts_with($mime, $prefix)) return true;
        }
        return false;
    }
}
