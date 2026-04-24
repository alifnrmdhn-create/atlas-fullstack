<?php

namespace App\Auth;

/**
 * Nilai hasil resolveUserScope().
 *
 * - userIds = null  → tidak ada filter (SUPERADMIN/ADMIN melihat semua)
 * - userIds = array → hanya entity dengan owner/assignee di array yang dikembalikan
 * - unitIds = null  → tidak ada filter unit
 * - unitIds = array → batasi ke unit-unit ini
 */
final class UserScope
{
    /**
     * @param array<int>|null $userIds
     * @param array<int>|null $unitIds
     */
    public function __construct(
        public readonly ?array $userIds,
        public readonly ?array $unitIds,
    ) {}

    public function allowsAllUsers(): bool
    {
        return $this->userIds === null;
    }
}
