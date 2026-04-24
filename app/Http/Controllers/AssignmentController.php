<?php

namespace App\Http\Controllers;

use App\Models\Assignment;
use App\Models\AssignmentAttachment;
use App\Services\AssignmentService;
use App\Services\BroadcastService;
use App\Support\RolePolicy;
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

    public function __construct(private AssignmentService $service) {}

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $items = $this->service->listForUser($request->user(), $request->only(['scope', 'status', 'priority']));
        return Inertia::render('AssignmentsView', [
            'assignments' => $items,
            'filters' => $request->only(['scope', 'status', 'priority']),
        ]);
    }

    public function show(Request $request, int $id): Response
    {
        $assignment = $this->service->findOrFailForUser($request->user(), $id);
        return Inertia::render('AssignmentDetailView', ['assignment' => $assignment]);
    }

    // ── JSON endpoints ───────────────────────────────────────────────────────

    public function previewChain(Request $request)
    {
        $data = $request->validate(['assigneeId' => 'required|integer']);
        return response()->json($this->service->previewChain($request->user(), $data['assigneeId']));
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'title' => 'required|string|min:2|max:200',
            'description' => 'nullable|string|max:2000',
            'priority' => 'in:LOW,MEDIUM,HIGH,CRITICAL',
            'dueDate' => 'nullable|date',
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
        BroadcastService::toUsers('notification:created', [
            'notification' => [
                'type' => 'TASK_ASSIGNED',
                'message' => "Tugas baru: {$assignment->title}",
                'source' => "assignment:{$assignment->id}",
                'state' => 'UNREAD',
                'createdAt' => now()->toIso8601String(),
            ],
        ], [$assignment->assigneeId]);
        return redirect()->route('assignments.show', $assignment->id)
            ->with('success', 'Penugasan berhasil dibuat.');
    }

    public function update(Request $request, int $id): RedirectResponse
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

        $this->service->update($request->user(), $id, $data);
        BroadcastService::assignment($id, 'updated');
        return back()->with('success', 'Penugasan diperbarui.');
    }

    public function transition(Request $request, int $id): RedirectResponse
    {
        $data = $request->validate([
            'action' => 'required|in:ACKNOWLEDGE,CLARIFY,SUBMIT,SUBMIT_REVIEW,APPROVE,COMPLETE,RETURN,REJECT,CANCEL,REOPEN',
            'note' => 'nullable|string|max:1000',
        ]);

        $a = $this->service->transition($request->user(), $id, $data['action'], $data['note'] ?? null);
        BroadcastService::assignment($id, 'status-changed', [
            'status' => $a->status, 'action' => $data['action'],
        ]);
        return back()->with('success', "Aksi {$data['action']} berhasil.");
    }

    public function destroy(Request $request, int $id): RedirectResponse
    {
        $this->service->delete($request->user(), $id);
        BroadcastService::assignment($id, 'deleted');
        return redirect()->route('assignments.index')->with('success', 'Penugasan dihapus.');
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

    public function uploadFile(Request $request, int $id): RedirectResponse
    {
        $a = Assignment::findOrFail($id);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        if (!$this->service->canUploadEvidence($a, $user->id, $isAdmin)) {
            abort(403, 'Hanya PIC yang boleh mengunggah evidence, dan hanya sebelum tugas selesai.');
        }

        $request->validate([
            'file' => [
                'required', 'file',
                'max:' . self::MAX_FILE_SIZE_KB,
                function ($attribute, $value, $fail) {
                    if (!$this->isMimeAllowed($value->getMimeType())) {
                        $fail("Tipe file tidak diizinkan: {$value->getMimeType()}");
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
        Storage::disk('local')->putFileAs("assignments/{$id}", $file, $storedName);

        AssignmentAttachment::create([
            'assignmentId' => $id,
            'uploadedBy'   => $user->id,
            'type'         => 'FILE',
            'filename'     => $storedName,
            'originalName' => $file->getClientOriginalName(),
            'filepath'     => $relativePath,
            'filesize'     => $file->getSize(),
            'description'  => $request->input('description'),
        ]);

        return back()->with('success', 'File evidence diunggah.');
    }

    public function addLinkOrNote(Request $request, int $id): RedirectResponse
    {
        $a = Assignment::findOrFail($id);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        if (!$this->service->canUploadEvidence($a, $user->id, $isAdmin)) {
            abort(403, 'Hanya PIC yang boleh menambah evidence, sebelum tugas selesai.');
        }

        $data = $request->validate([
            'type' => 'required|in:LINK,NOTE',
            'url' => 'required_if:type,LINK|nullable|url|max:2000',
            'description' => 'required|string|min:1|max:2000',
        ]);

        AssignmentAttachment::create([
            'assignmentId' => $id,
            'uploadedBy'   => $user->id,
            'type'         => $data['type'],
            'url'          => $data['url'] ?? null,
            'description'  => $data['description'],
        ]);

        return back()->with('success', 'Evidence ditambahkan.');
    }

    public function downloadAttachment(Request $request, int $id, int $attId)
    {
        $a = $this->service->findOrFailForUser($request->user(), $id);
        $att = AssignmentAttachment::where('assignmentId', $a->id)->findOrFail($attId);

        if ($att->type !== 'FILE' || !$att->filepath) {
            abort(400, 'Lampiran ini bukan file.');
        }

        return Storage::disk('local')->download($att->filepath, $att->originalName ?? $att->filename);
    }

    public function destroyAttachment(Request $request, int $id, int $attId): RedirectResponse
    {
        $att = AssignmentAttachment::where('assignmentId', $id)->findOrFail($attId);
        $user = $request->user();
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        if (!$isAdmin && $att->uploadedBy !== $user->id) {
            abort(403, 'Hanya pengunggah yang dapat menghapus lampiran ini.');
        }

        // Best effort: hapus file fisik
        if ($att->type === 'FILE' && $att->filepath) {
            rescue(fn () => Storage::disk('local')->delete($att->filepath));
        }

        $att->delete();
        return back()->with('success', 'Lampiran dihapus.');
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
