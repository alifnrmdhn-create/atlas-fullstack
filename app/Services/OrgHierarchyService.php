<?php

namespace App\Services;

use App\Models\Position;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Menjadikan Position.reportsToPositionId sebagai SUMBER KEBENARAN struktur
 * organisasi, lalu menurunkan (derive) User.managerUserId darinya.
 *
 * Kenapa derive, bukan baca rantai jabatan live di OrgChainService:
 *   - managerUserId tetap satu-satunya yang dibaca OrgChainService /
 *     ApprovalChainService / ScopeResolver → blast radius nol, test existing aman.
 *   - Skala kecil (puluhan user/posisi) → recompute penuh sangat murah & selalu
 *     benar, tanpa update parsial yang rawan bug.
 *
 * Aturan derive (deriveManagerId):
 *   - User TANPA positionId tidak disentuh (BOD/superadmin: nilai seed dijaga).
 *   - User DENGAN positionId → naik via reportsToPositionId, ambil holder aktif
 *     posisi ancestor TERDEKAT. Posisi atasan yang kosong (vacant) dilewati naik
 *     (mirror skip-inactive di OrgChainService). Mentok → null.
 *   - Proteksi cycle: visited-set + MAX_DEPTH. Self-loop dicegah (holder != user).
 */
class OrgHierarchyService
{
    private const MAX_DEPTH = 8;

    /**
     * Reconciliation pass penuh. Kembalikan daftar perubahan managerUserId
     * (untuk preview dry-run). Bila $apply true, perubahan disimpan.
     *
     * @return array<int, array{userId:int, name:string, from:?int, to:?int, fromName:?string, toName:?string}>
     */
    public function recompute(bool $apply = true): array
    {
        // Peta posisi: id => reportsToPositionId (in-memory, satu query).
        $posParent = Position::query()
            ->get(['id', 'reportsToPositionId'])
            ->mapWithKeys(fn ($p) => [(int) $p->id => $p->reportsToPositionId !== null ? (int) $p->reportsToPositionId : null])
            ->all();

        // Holder aktif per posisi: deterministik (id terkecil) bila ada >1 holder.
        $holderByPos = User::query()
            ->where('isActive', true)
            ->whereNotNull('positionId')
            ->orderBy('id')
            ->get(['id', 'positionId'])
            ->groupBy('positionId')
            ->map(fn ($g) => (int) $g->first()->id)
            ->all();

        $nameById = User::query()->pluck('name', 'id')->all();

        $changes = [];
        $users = User::query()
            ->whereNotNull('positionId')
            ->get(['id', 'name', 'managerUserId', 'positionId']);

        foreach ($users as $user) {
            $derived = $this->deriveManagerId(
                (int) $user->positionId,
                (int) $user->id,
                $posParent,
                $holderByPos,
            );

            $current = $user->managerUserId !== null ? (int) $user->managerUserId : null;
            if ($current === $derived) {
                continue;
            }

            $changes[] = [
                'userId' => (int) $user->id,
                'name' => (string) $user->name,
                'from' => $current,
                'to' => $derived,
                'fromName' => $current !== null ? ($nameById[$current] ?? null) : null,
                'toName' => $derived !== null ? ($nameById[$derived] ?? null) : null,
            ];
        }

        if ($apply && $changes !== []) {
            DB::transaction(function () use ($changes) {
                foreach ($changes as $c) {
                    User::query()->whereKey($c['userId'])->update(['managerUserId' => $c['to']]);
                }
            });
        }

        return $changes;
    }

    /**
     * Holder atasan struktural untuk user pemegang $positionId. Naik via
     * reportsToPositionId sampai ketemu posisi ber-holder aktif (selain dirinya).
     *
     * @param array<int, ?int> $posParent     id posisi => id posisi atasan (atau null)
     * @param array<int, int>  $holderByPos    id posisi => id holder aktif
     */
    public function deriveManagerId(int $positionId, int $userId, array $posParent, array $holderByPos): ?int
    {
        $visited = [$positionId => true];
        $cursor = $posParent[$positionId] ?? null;
        $depth = 0;

        while ($cursor !== null && $depth < self::MAX_DEPTH) {
            if (isset($visited[$cursor])) {
                return null; // cycle
            }
            $visited[$cursor] = true;

            $holder = $holderByPos[$cursor] ?? null;
            if ($holder !== null && $holder !== $userId) {
                return $holder;
            }

            // Posisi atasan tak ada di peta (terhapus) → mentok.
            if (! array_key_exists($cursor, $posParent)) {
                return null;
            }
            $cursor = $posParent[$cursor];
            $depth++;
        }

        return null;
    }

    /**
     * Tolak bila $proposedParentId akan membentuk cycle untuk $positionId
     * (yaitu $positionId == calon parent, atau $positionId adalah ancestor dari
     * calon parent). Dipakai sebelum simpan reportsToPositionId.
     */
    public function assertNoCycle(int $positionId, ?int $proposedParentId): void
    {
        if ($proposedParentId === null) {
            return;
        }
        if ($proposedParentId === $positionId) {
            throw ValidationException::withMessages([
                'reportsToPositionId' => 'Jabatan tidak boleh melapor ke dirinya sendiri.',
            ]);
        }

        $posParent = Position::query()
            ->get(['id', 'reportsToPositionId'])
            ->mapWithKeys(fn ($p) => [(int) $p->id => $p->reportsToPositionId !== null ? (int) $p->reportsToPositionId : null])
            ->all();

        $cursor = $proposedParentId;
        $depth = 0;
        while ($cursor !== null && $depth < self::MAX_DEPTH) {
            if ($cursor === $positionId) {
                throw ValidationException::withMessages([
                    'reportsToPositionId' => 'Atasan yang dipilih membentuk lingkar (atasan justru di bawah jabatan ini).',
                ]);
            }
            $cursor = $posParent[$cursor] ?? null;
            $depth++;
        }
    }
}
