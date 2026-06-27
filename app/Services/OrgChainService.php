<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Layanan resolusi rantai atasan untuk fitur Clear the Path (Sprint 4) dan
 * mekanisme eskalasi lain.
 *
 * Sumber data utama: kolom User.managerUserId (sudah ada di schema).
 * Pola walk-up sama dengan ApprovalChainService untuk konsistensi.
 *
 * Kasus khusus yang ditangani:
 *   - User tanpa atasan (BOD): getDirectSupervisor() return null
 *   - Manager pointer mengarah ke user inactive: skip ke level berikutnya
 *   - Loop / cycle protection: visited set + MAX_DEPTH
 *   - Eskalasi cross-direktorat: di-block by default (policy)
 */
class OrgChainService
{
    private const MAX_DEPTH = 6;

    /**
     * Atasan langsung user. Null jika tidak ada (BOD/superadmin) atau pointer
     * mengarah ke user inactive yang tidak bisa di-skip.
     */
    public function getDirectSupervisor(User $user): ?User
    {
        if (!$user->managerUserId) {
            return null;
        }

        $manager = User::query()
            ->select('id', 'name', 'roleType', 'positionTitle', 'directorateId', 'unitId', 'managerUserId', 'isActive', 'avatarUrl')
            ->find($user->managerUserId);

        if (!$manager) return null;

        // Skip inactive supervisor — climb up
        if (!$manager->isActive) {
            return $this->getDirectSupervisor($manager);
        }

        return $manager;
    }

    /**
     * Rantai eskalasi dari user ke atas, ordered: index 0 = atasan langsung,
     * index 1 = atasan dari atasan, dst. Kembali maksimal $maxLevels entry
     * atau sampai mentok (no manager).
     *
     * @return Collection<int, User>
     */
    public function getEscalationChain(User $user, int $maxLevels = 3): Collection
    {
        $chain = collect();
        $visited = [$user->id => true];
        $current = $user;
        $level = 0;

        while ($level < $maxLevels && $level < self::MAX_DEPTH) {
            $supervisor = $this->getDirectSupervisor($current);

            if (!$supervisor) break;
            if (isset($visited[$supervisor->id])) break; // cycle protection

            $visited[$supervisor->id] = true;
            $chain->push($supervisor);

            $current = $supervisor;
            $level++;
        }

        return $chain;
    }

    /**
     * Cek apakah escalation lintas direktorat di-allow.
     *
     * Default policy:
     *   - Tidak allow cross-direktorat untuk MVP (Sprint 4 pilot di DKM saja)
     *   - Exception: target adalah BOD (eskalasi ke board level diizinkan)
     *   - Exception: requester sendiri BOD/admin (mereka punya autonomy)
     */
    public function canEscalateAcrossDirectorate(User $requester, User $target): bool
    {
        $requesterRole = strtoupper($requester->roleType ?? '');
        $targetRole = strtoupper($target->roleType ?? '');

        // BOD/admin requester: full autonomy
        if (in_array($requesterRole, ['BOD', 'ADMIN', 'SUPERADMIN'], true)) {
            return true;
        }

        // Target adalah BOD: izinkan (escalation ke board)
        if ($targetRole === 'BOD') {
            return true;
        }

        // Same direktorat: allow
        if ($requester->directorateId && $target->directorateId
            && $requester->directorateId === $target->directorateId) {
            return true;
        }

        // Default: deny cross-direktorat
        return false;
    }

    /**
     * STRICT per-jenjang: $target sah jadi tujuan eskalasi/reroute untuk $from
     * HANYA bila ia atasan LANGSUNG $from (managerUserId, atasan-aktif terdekat).
     *
     * Tidak ada pengecualian — termasuk BOD. Eskalasi & permintaan dukungan naik
     * SATU tingkat; untuk mencapai Direktur, didaki bertahap lewat reroute (tiap
     * pemegang melempar ke atasan langsung-NYA). Ini menutup "lompat jenjang"
     * (mis. Kasubdiv langsung ke Direktur). Tak bisa ke diri sendiri (seseorang
     * bukan atasan langsung dirinya). Jalur auto-route create trivially sah.
     */
    public function isValidEscalationTarget(User $from, User $target): bool
    {
        $direct = $this->getDirectSupervisor($from);
        return $direct !== null && $direct->id === $target->id;
    }

    /**
     * Helper: tentukan target eskalasi default untuk user.
     * Return atasan langsung kalau valid; null kalau user di puncak atau
     * cross-direktorat di-block.
     */
    public function resolveDefaultEscalationTarget(User $user): ?User
    {
        $supervisor = $this->getDirectSupervisor($user);
        if (!$supervisor) return null;

        if (!$this->canEscalateAcrossDirectorate($user, $supervisor)) {
            return null;
        }

        return $supervisor;
    }

    /**
     * Direct reports user — siapa saja yang melapor langsung ke user ini.
     * Berguna untuk inbox "Permintaan Clear the Path" di Sprint 4.
     *
     * @return Collection<int, User>
     */
    public function getDirectReports(User $user): Collection
    {
        return User::query()
            ->where('managerUserId', $user->id)
            ->where('isActive', true)
            ->get(['id', 'name', 'roleType', 'positionTitle', 'unitId', 'directorateId', 'avatarUrl']);
    }

    /**
     * Apakah $candidate adalah supervisor (langsung atau tidak langsung) dari $user?
     * Walk-up dari $user, return true kalau ketemu $candidate dalam chain.
     */
    public function isSupervisorOf(User $candidate, User $user): bool
    {
        $chain = $this->getEscalationChain($user, self::MAX_DEPTH);
        return $chain->contains(fn (User $u) => $u->id === $candidate->id);
    }

    /**
     * Walk supervisor chain dari $user dan kembalikan semua user yang punya
     * roleType cocok (case-insensitive). Berguna untuk resolve approver/
     * reviewer di approval flow (siapa KASUBDIV/KADIV di atas PIC ini).
     *
     * @return Collection<int, User>
     */
    public function resolveSupervisorsByRole(User $user, string $targetRole): Collection
    {
        $target = strtoupper($targetRole);
        return $this->getEscalationChain($user, self::MAX_DEPTH)
            ->filter(fn (User $u) => strtoupper($u->roleType ?? '') === $target)
            ->values();
    }
}
