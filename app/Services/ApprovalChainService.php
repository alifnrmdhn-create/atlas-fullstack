<?php

namespace App\Services;

use App\Models\AssignmentApprovalEntry;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Port dari backend/src/lib/approvalChain.ts.
 *
 * Aturan: approval WAJIB mengikuti rantai atasan langsung PIC naik sampai
 * ketemu pemberi (assigner). Kalau pemberi skip hierarki (mis. BOD → Kasub),
 * atasan di antara (Kadiv) TETAP harus review — baru ke pemberi.
 *
 * Source of truth di Laravel: tabel assignment_approval_entries.
 *
 * Kasus khusus:
 *   - Self-assign (assignee === assigner): chain = [] (bypass approval)
 *   - Assigner bukan atasan PIC (cross-divisi): chain sampai atasan tertinggi
 *     PIC, lalu assigner di-append sebagai final approver
 */
class ApprovalChainService
{
    private const MAX_DEPTH = 10;

    public const STATUS_PENDING  = 'PENDING';
    public const STATUS_APPROVED = 'APPROVED';
    public const STATUS_RETURNED = 'RETURNED';
    public const STATUS_REJECTED = 'REJECTED';

    /**
     * Bangun approval chain TANPA persist. Return array of ChainEntry arrays.
     *
     * @return array<int, array{userId:int, role:string, name:string, positionTitle:?string, order:int, status:string}>
     */
    public function resolve(int $assigneeId, int $assignerId): array
    {
        // Self-assign: bypass
        if ($assigneeId === $assignerId) return [];

        $assignee = User::query()
            ->select('id', 'name', 'roleType', 'positionTitle', 'managerUserId')
            ->find($assigneeId);
        $assigner = User::query()
            ->select('id', 'name', 'roleType', 'positionTitle')
            ->find($assignerId);

        if (!$assignee || !$assigner) {
            // Fallback: hanya assigner sebagai approver
            if ($assigner) {
                return [$this->buildEntry($assigner, 0)];
            }
            return [];
        }

        $chain = [];
        $visited = [$assignee->id => true];
        $currentManagerId = $assignee->managerUserId;
        $order = 0;

        // Walk ke atas sampai ketemu assigner atau mentok
        while (
            $currentManagerId
            && !isset($visited[$currentManagerId])
            && $order < self::MAX_DEPTH
        ) {
            $manager = User::query()
                ->select('id', 'name', 'roleType', 'positionTitle', 'managerUserId')
                ->find($currentManagerId);
            if (!$manager) break;

            $visited[$manager->id] = true;
            $chain[] = $this->buildEntry($manager, $order++);

            // Ketemu assigner — berhenti
            if ($manager->id === $assigner->id) break;

            $currentManagerId = $manager->managerUserId;
        }

        // Kalau assigner belum ter-include, append sebagai final approver
        $hasAssigner = false;
        foreach ($chain as $entry) {
            if ($entry['userId'] === $assigner->id) {
                $hasAssigner = true;
                break;
            }
        }
        if (!$hasAssigner) {
            $chain[] = $this->buildEntry($assigner, $order);
        }

        return $chain;
    }

    /** Persist chain ke tabel normalisasi (replace). */
    public function persist(int $assignmentId, array $entries): void
    {
        AssignmentApprovalEntry::query()->where('assignmentId', $assignmentId)->delete();
        foreach ($entries as $entry) {
            AssignmentApprovalEntry::create([
                'assignmentId'  => $assignmentId,
                'userId'        => $entry['userId'],
                'role'          => $entry['role'],
                'name'          => $entry['name'],
                'positionTitle' => $entry['positionTitle'],
                'order'         => $entry['order'],
                'status'        => $entry['status'] ?? self::STATUS_PENDING,
            ]);
        }
    }

    /** Ambil chain dari tabel normalisasi. */
    public function getEntries(int $assignmentId): Collection
    {
        return AssignmentApprovalEntry::query()
            ->where('assignmentId', $assignmentId)
            ->orderBy('order')
            ->get();
    }

    /** Reset semua entry ke PENDING (dipakai saat SUBMIT setelah RETURN). */
    public function resetForResubmit(int $assignmentId): void
    {
        AssignmentApprovalEntry::query()
            ->where('assignmentId', $assignmentId)
            ->update([
                'status' => self::STATUS_PENDING,
                'actedAt' => null,
                'note' => null,
            ]);
    }

    /** Mark entry milik reviewer idx tertentu. */
    public function markEntry(int $assignmentId, int $order, string $status, ?string $note, \DateTime $actedAt): void
    {
        AssignmentApprovalEntry::query()
            ->where('assignmentId', $assignmentId)
            ->where('order', $order)
            ->update([
                'status' => $status,
                'note' => $note,
                'actedAt' => $actedAt,
            ]);
    }

    public function getCurrentReviewerUserId(int $assignmentId, ?int $currentIdx): ?int
    {
        if ($currentIdx === null) return null;
        return AssignmentApprovalEntry::query()
            ->where('assignmentId', $assignmentId)
            ->where('order', $currentIdx)
            ->value('userId');
    }

    public function isCurrentReviewer(int $assignmentId, ?int $currentIdx, int $userId): bool
    {
        $rid = $this->getCurrentReviewerUserId($assignmentId, $currentIdx);
        return $rid !== null && $rid === $userId;
    }

    public function chainSize(int $assignmentId): int
    {
        return AssignmentApprovalEntry::query()->where('assignmentId', $assignmentId)->count();
    }

    private function buildEntry(User $user, int $order): array
    {
        return [
            'userId'        => $user->id,
            'role'          => $user->roleType,
            'name'          => $user->name,
            'positionTitle' => $user->positionTitle,
            'order'         => $order,
            'status'        => self::STATUS_PENDING,
        ];
    }
}
