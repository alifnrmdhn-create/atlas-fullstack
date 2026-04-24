<?php

namespace App\Services;

use App\Auth\ScopeResolver;
use App\Models\Assignment;
use App\Models\AssignmentAttachment;
use App\Models\AssignmentReviewAction;
use App\Models\User;
use App\Support\RolePolicy;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Facades\DB;

/**
 * State machine lengkap modul Penugasan.
 *
 *   DITUGASKAN → (ACK)      DIKERJAKAN → (SUBMIT)   IN_REVIEW → (APPROVE) SELESAI
 *                                                        ↓ (RETURN)
 *                                                   DIKERJAKAN
 *                                                        ↓ (REJECT)
 *                                                    REJECTED
 *   any non-terminal → (CANCEL) DIBATALKAN
 *   terminal        → (REOPEN) DIKERJAKAN
 *
 * Self-assign: bypass chain, PIC bisa langsung SELESAI dari DIKERJAKAN.
 */
class AssignmentService
{
    public const STATUS_DITUGASKAN = 'DITUGASKAN';
    public const STATUS_DIKERJAKAN = 'DIKERJAKAN';
    public const STATUS_IN_REVIEW  = 'IN_REVIEW';
    public const STATUS_SELESAI    = 'SELESAI';
    public const STATUS_REJECTED   = 'REJECTED';
    public const STATUS_DIBATALKAN = 'DIBATALKAN';

    private const TERMINAL = [self::STATUS_SELESAI, self::STATUS_REJECTED, self::STATUS_DIBATALKAN];

    public function __construct(
        private ApprovalChainService $chainService,
        private AssignmentAuthService $authService,
        private ScopeResolver $scopeResolver,
    ) {}

    // ── LIST ────────────────────────────────────────────────────────────────

    /**
     * Get filtered list untuk user. scopePreset:
     *   mine   → assignee = user
     *   given  → assigner = user
     *   review → current reviewer = user
     *   all    → org scope (assignee OR assigner in scope)
     *   team   → default: org scope + diri sendiri
     */
    public function listForUser(User $user, array $filters = []): EloquentCollection
    {
        $preset = $filters['scope'] ?? 'team';
        $statusFilter = $filters['status'] ?? null;
        $priorityFilter = $filters['priority'] ?? null;
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);

        $orgScope = $this->scopeResolver->resolveUserScope($user);
        $allowedIds = $orgScope->userIds;

        $query = Assignment::query()
            ->with([
                'assigner:id,name,positionTitle,roleType',
                'assignee:id,name,positionTitle,roleType',
                'relatedProgram:id,code,name',
                'approvalEntries',
            ])
            ->withCount('evidenceItems')
            ->orderBy('status')
            ->orderBy('dueDate')
            ->orderBy('createdAt', 'desc');

        if ($preset === 'mine') {
            $query->where('assigneeId', $user->id);
        } elseif ($preset === 'given') {
            $query->where('assignerId', $user->id);
        } elseif ($preset === 'review') {
            // Post-filter needed — keep all for now
        } elseif ($preset === 'all') {
            if ($allowedIds !== null) {
                $query->where(fn ($q) => $q
                    ->whereIn('assigneeId', $allowedIds)
                    ->orWhereIn('assignerId', $allowedIds));
            }
        } else {
            // team (default)
            if ($allowedIds !== null) {
                $query->where(fn ($q) => $q
                    ->whereIn('assigneeId', $allowedIds)
                    ->orWhereIn('assignerId', $allowedIds)
                    ->orWhere('assigneeId', $user->id)
                    ->orWhere('assignerId', $user->id));
            }
        }

        if ($statusFilter)   $query->where('status', $statusFilter);
        if ($priorityFilter) $query->where('priority', $priorityFilter);

        $items = $query->get();

        // Post-filter: privacy + review scope
        return $items->filter(function (Assignment $a) use ($user, $isAdmin, $preset) {
            if (!$this->canSeeAssignment($a, $user->id, $isAdmin)) return false;
            if ($preset === 'review') {
                $currentUserId = $this->chainService->getCurrentReviewerUserId($a->id, $a->currentReviewerIdx);
                return $currentUserId === $user->id;
            }
            return true;
        })->values();
    }

    public function findOrFailForUser(User $user, int $id): Assignment
    {
        $a = Assignment::query()
            ->with([
                'assigner:id,name,positionTitle,roleType',
                'assignee:id,name,positionTitle,roleType',
                'relatedProgram:id,code,name',
                'approvalEntries.user:id,name,positionTitle,roleType',
                'evidenceItems.uploader:id,name,positionTitle',
                'reviewActions.reviewer:id,name,positionTitle',
            ])
            ->findOrFail($id);

        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);
        if (!$this->canSeeAssignment($a, $user->id, $isAdmin)) {
            abort(403, 'Anda tidak memiliki akses ke penugasan ini.');
        }
        return $a;
    }

    /** Cek visibility (hormat isPrivate). */
    public function canSeeAssignment(Assignment $a, int $userId, bool $isAdmin): bool
    {
        if (!$a->isPrivate) return true;
        if ($isAdmin) return true;
        if ($a->assigneeId === $userId || $a->assignerId === $userId) return true;

        $watchers = $a->watcherIds ?? [];
        if (is_array($watchers) && in_array($userId, $watchers, true)) return true;

        $inChain = $a->approvalEntries()->where('userId', $userId)->exists();
        return $inChain;
    }

    // ── CREATE ──────────────────────────────────────────────────────────────

    public function create(User $user, array $payload): Assignment
    {
        if (!$this->authService->canCreateAssignment($user->roleType)) {
            abort(403, 'Role Anda tidak diizinkan memberikan tugas.');
        }
        if (!$this->authService->canAssignTo($user, $payload['assigneeId'])) {
            abort(403, 'Anda hanya dapat menugaskan ke bawahan langsung atau tim dalam unit Anda.');
        }
        if (!empty($payload['isPrivate']) && !$this->authService->canSetPrivate($user->roleType)) {
            abort(403, 'Hanya BOD atau Kepala Divisi yang dapat menandai tugas sebagai private.');
        }

        $chain = $this->chainService->resolve($payload['assigneeId'], $user->id);
        $code = $this->nextCode();

        return DB::transaction(function () use ($user, $payload, $code, $chain) {
            $assignment = Assignment::create([
                'code'              => $code,
                'title'             => $payload['title'],
                'description'       => $payload['description'] ?? null,
                'priority'          => $payload['priority'] ?? 'MEDIUM',
                'dueDate'           => $payload['dueDate'] ?? null,
                'assignerId'        => $user->id,
                'assigneeId'        => $payload['assigneeId'],
                'watcherIds'        => $payload['watcherIds'] ?? null,
                'relatedProgramId'  => $payload['relatedProgramId'] ?? null,
                'tags'              => $payload['tags'] ?? null,
                'status'            => self::STATUS_DITUGASKAN,
                'evidenceRequired'  => $payload['evidenceRequired'] ?? true,
                'isPrivate'         => $payload['isPrivate'] ?? false,
                'currentReviewerIdx' => null,
                'revisionCount'     => 0,
            ]);

            if (!empty($chain)) {
                $this->chainService->persist($assignment->id, $chain);
            }

            return $assignment->fresh(['assigner', 'assignee', 'relatedProgram', 'approvalEntries']);
        });
    }

    // ── UPDATE (metadata) ──────────────────────────────────────────────────

    public function update(User $user, int $id, array $payload): Assignment
    {
        $existing = Assignment::findOrFail($id);

        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);
        if (!$isAdmin && $existing->assignerId !== $user->id) {
            abort(403, 'Hanya pemberi tugas yang dapat mengubah metadata penugasan.');
        }
        if ($existing->isTerminal()) {
            abort(400, 'Penugasan terminal tidak dapat diedit. Gunakan REOPEN dulu.');
        }

        return DB::transaction(function () use ($existing, $payload, $user, $id) {
            $data = [];
            foreach (['title', 'description', 'priority', 'watcherIds', 'relatedProgramId', 'tags'] as $key) {
                if (array_key_exists($key, $payload)) $data[$key] = $payload[$key];
            }
            if (array_key_exists('dueDate', $payload)) {
                $data['dueDate'] = $payload['dueDate'];
            }

            // Jika assignee berubah → re-resolve chain + reset review state
            $chainChanged = false;
            if (
                array_key_exists('assigneeId', $payload)
                && $payload['assigneeId'] !== null
                && $payload['assigneeId'] !== $existing->assigneeId
            ) {
                if (!$this->authService->canAssignTo($user, $payload['assigneeId'])) {
                    abort(403, 'Assignee baru di luar kewenangan Anda.');
                }
                $data['assigneeId'] = $payload['assigneeId'];
                $data['currentReviewerIdx'] = null;
                $data['revisionCount'] = 0;
                $chainChanged = true;
            }

            $existing->update($data);

            if ($chainChanged) {
                $newChain = $this->chainService->resolve($payload['assigneeId'], $existing->assignerId);
                $this->chainService->persist($id, $newChain);
            }

            return $existing->fresh(['assigner', 'assignee', 'relatedProgram', 'approvalEntries']);
        });
    }

    // ── TRANSITION (state machine) ──────────────────────────────────────────

    /** @param 'ACKNOWLEDGE'|'CLARIFY'|'SUBMIT'|'APPROVE'|'RETURN'|'REJECT'|'CANCEL'|'REOPEN' $action */
    public function transition(User $user, int $id, string $action, ?string $note = null): Assignment
    {
        $action = $this->normalizeAction($action);
        $existing = Assignment::findOrFail($id);

        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);
        $isAssigner = $existing->assignerId === $user->id;
        $isAssignee = $existing->assigneeId === $user->id;
        $isSelfAssign = $existing->isSelfAssign();
        $chainSize = $this->chainService->chainSize($id);
        $currentIdx = $existing->currentReviewerIdx;
        $isCurrentReviewer = $this->chainService->isCurrentReviewer($id, $currentIdx, $user->id);
        $now = now();

        return DB::transaction(function () use (
            $action, $note, $user, $existing, $id, $isAdmin, $isAssigner, $isAssignee,
            $isSelfAssign, $chainSize, $currentIdx, $isCurrentReviewer, $now
        ) {
            $nextStatus = $existing->status;
            $data = [];
            $reviewAction = null;  // ['action' => ..., 'note' => ..., 'revisionAt' => ...]

            switch ($action) {
                case 'ACKNOWLEDGE':
                    if (!$isAssignee && !$isAdmin) abort(403, 'Hanya PIC yang dapat menerima tugas.');
                    if ($existing->status !== self::STATUS_DITUGASKAN) {
                        abort(400, 'Tugas tidak berada di status DITUGASKAN.');
                    }
                    $nextStatus = self::STATUS_DIKERJAKAN;
                    $data['acknowledgedAt'] = $now;
                    $data['startedAt'] = $now;
                    $data['needsClarification'] = false;
                    $data['clarificationNote'] = null;
                    break;

                case 'CLARIFY':
                    if (!$isAssignee && !$isAdmin) abort(403, 'Hanya PIC yang dapat meminta klarifikasi.');
                    if ($existing->status !== self::STATUS_DITUGASKAN) {
                        abort(400, 'Klarifikasi hanya bisa diajukan saat DITUGASKAN.');
                    }
                    $data['needsClarification'] = true;
                    $data['clarificationNote'] = $note;
                    break;

                case 'SUBMIT':
                    if (!$isAssignee && !$isAdmin) abort(403, 'Hanya PIC yang dapat submit.');
                    if ($existing->status !== self::STATUS_DIKERJAKAN) {
                        abort(400, 'Hanya tugas DIKERJAKAN yang bisa di-submit.');
                    }
                    $this->assertEvidenceIfRequired($existing);

                    if ($isSelfAssign || $chainSize === 0) {
                        // Self-assign: langsung SELESAI
                        $nextStatus = self::STATUS_SELESAI;
                        $data['completedAt'] = $now;
                        $data['currentReviewerIdx'] = null;
                    } else {
                        // Masuk review cycle — reset chain ke PENDING
                        $nextStatus = self::STATUS_IN_REVIEW;
                        $this->chainService->resetForResubmit($id);
                        $data['currentReviewerIdx'] = 0;
                    }
                    break;

                case 'APPROVE':
                    // Legacy path: self-assign COMPLETE langsung dari DIKERJAKAN
                    if ($existing->status === self::STATUS_DIKERJAKAN
                        && ($isSelfAssign || $chainSize === 0)
                        && ($isAssignee || $isAdmin)
                    ) {
                        $this->assertEvidenceIfRequired($existing);
                        $nextStatus = self::STATUS_SELESAI;
                        $data['completedAt'] = $now;
                        $data['currentReviewerIdx'] = null;
                        break;
                    }

                    if ($existing->status !== self::STATUS_IN_REVIEW) {
                        abort(400, 'Tugas tidak dalam status review.');
                    }
                    if (!$isCurrentReviewer && !$isAdmin) {
                        abort(403, 'Hanya reviewer giliran saat ini yang dapat approve.');
                    }
                    if ($currentIdx === null) abort(500, 'State approval chain tidak valid.');

                    // Mark entry APPROVED
                    $this->chainService->markEntry(
                        $id, $currentIdx,
                        ApprovalChainService::STATUS_APPROVED,
                        $note, $now
                    );
                    $reviewAction = ['action' => 'APPROVED', 'note' => $note, 'revisionAt' => $existing->revisionCount];

                    if ($currentIdx + 1 < $chainSize) {
                        $data['currentReviewerIdx'] = $currentIdx + 1;
                    } else {
                        // Final approver — SELESAI
                        $nextStatus = self::STATUS_SELESAI;
                        $data['completedAt'] = $now;
                        $data['currentReviewerIdx'] = null;
                    }
                    break;

                case 'RETURN':
                    if ($existing->status !== self::STATUS_IN_REVIEW) {
                        abort(400, 'Return hanya untuk tugas IN_REVIEW.');
                    }
                    if (!$isCurrentReviewer && !$isAdmin) {
                        abort(403, 'Hanya reviewer giliran saat ini yang dapat return.');
                    }
                    if ($currentIdx === null) abort(500, 'State approval chain tidak valid.');

                    $this->chainService->markEntry(
                        $id, $currentIdx,
                        ApprovalChainService::STATUS_RETURNED,
                        $note, $now
                    );
                    $reviewAction = ['action' => 'RETURNED', 'note' => $note, 'revisionAt' => $existing->revisionCount];
                    $nextStatus = self::STATUS_DIKERJAKAN;
                    $data['currentReviewerIdx'] = null;
                    $data['revisionCount'] = $existing->revisionCount + 1;
                    break;

                case 'REJECT':
                    if ($existing->status !== self::STATUS_IN_REVIEW) {
                        abort(400, 'Reject hanya untuk tugas IN_REVIEW.');
                    }
                    if (!$isCurrentReviewer && !$isAdmin) {
                        abort(403, 'Hanya reviewer giliran saat ini yang dapat reject.');
                    }
                    if ($currentIdx === null) abort(500, 'State approval chain tidak valid.');

                    $this->chainService->markEntry(
                        $id, $currentIdx,
                        ApprovalChainService::STATUS_REJECTED,
                        $note, $now
                    );
                    $reviewAction = ['action' => 'REJECTED', 'note' => $note, 'revisionAt' => $existing->revisionCount];
                    $nextStatus = self::STATUS_REJECTED;
                    $data['currentReviewerIdx'] = null;
                    $data['rejectedAt'] = $now;
                    $data['rejectionReason'] = $note;
                    break;

                case 'CANCEL':
                    if (!$isAssigner && !$isAdmin) abort(403, 'Hanya pemberi tugas yang dapat membatalkan.');
                    if ($existing->isTerminal()) abort(400, 'Tugas sudah dalam status terminal.');
                    $nextStatus = self::STATUS_DIBATALKAN;
                    $data['cancelledAt'] = $now;
                    $data['cancelReason'] = $note;
                    $data['currentReviewerIdx'] = null;
                    break;

                case 'REOPEN':
                    if (!$isAssigner && !$isAdmin) abort(403, 'Hanya pemberi tugas yang dapat membuka kembali.');
                    if (!$existing->isTerminal()) abort(400, 'Hanya tugas terminal yang dapat dibuka kembali.');
                    $nextStatus = self::STATUS_DIKERJAKAN;
                    $data['completedAt']     = null;
                    $data['cancelledAt']     = null;
                    $data['cancelReason']    = null;
                    $data['rejectedAt']      = null;
                    $data['rejectionReason'] = null;
                    $data['currentReviewerIdx'] = null;
                    // Reset chain statuses biar cycle dari awal
                    if ($chainSize > 0) {
                        $this->chainService->resetForResubmit($id);
                    }
                    break;

                default:
                    abort(400, "Action tidak dikenali: {$action}");
            }

            $data['status'] = $nextStatus;
            $existing->update($data);

            // Log audit
            if ($reviewAction) {
                AssignmentReviewAction::create([
                    'assignmentId' => $id,
                    'reviewerId'   => $user->id,
                    'action'       => $reviewAction['action'],
                    'note'         => $reviewAction['note'],
                    'revisionAt'   => $reviewAction['revisionAt'],
                ]);
            }

            return $existing->fresh([
                'assigner', 'assignee', 'relatedProgram', 'approvalEntries',
                'reviewActions.reviewer:id,name',
            ]);
        });
    }

    // ── EVIDENCE ────────────────────────────────────────────────────────────

    /** Rule: PIC selalu boleh (DIKERJAKAN/IN_REVIEW/DITUGASKAN); admin override. */
    public function canUploadEvidence(Assignment $a, int $userId, bool $isAdmin): bool
    {
        if ($isAdmin) return true;
        if ($a->assigneeId !== $userId) return false;
        return in_array($a->status, [self::STATUS_DIKERJAKAN, self::STATUS_IN_REVIEW, self::STATUS_DITUGASKAN], true);
    }

    // ── DELETE ──────────────────────────────────────────────────────────────

    public function delete(User $user, int $id): void
    {
        $existing = Assignment::findOrFail($id);
        $isAdmin = RolePolicy::isAdminOrAbove($user->roleType);
        if (!$isAdmin && $existing->assignerId !== $user->id) {
            abort(403, 'Hanya pemberi tugas yang dapat menghapus.');
        }
        $existing->delete();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private function assertEvidenceIfRequired(Assignment $a): void
    {
        if (!$a->evidenceRequired) return;
        $count = AssignmentAttachment::query()->where('assignmentId', $a->id)->count();
        if ($count === 0) {
            abort(400, 'Tugas ini mewajibkan lampiran evidence. Unggah minimal 1 file / link / catatan dulu.');
        }
    }

    private function normalizeAction(string $raw): string
    {
        return match ($raw) {
            'SUBMIT_REVIEW' => 'SUBMIT',
            'COMPLETE'      => 'APPROVE',
            default         => $raw,
        };
    }

    private function nextCode(): string
    {
        $last = Assignment::query()->orderBy('id', 'desc')->value('code');
        $num = 1;
        if ($last && preg_match('/^ASG-(\d+)$/', $last, $m)) {
            $num = (int) $m[1] + 1;
        }
        return 'ASG-' . str_pad((string) $num, 4, '0', STR_PAD_LEFT);
    }

    public function previewChain(User $user, int $assigneeId): array
    {
        if (!$this->authService->canAssignTo($user, $assigneeId)) {
            return ['chain' => [], 'allowed' => false];
        }
        return [
            'chain' => $this->chainService->resolve($assigneeId, $user->id),
            'allowed' => true,
        ];
    }
}
