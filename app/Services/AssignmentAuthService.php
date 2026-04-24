<?php

namespace App\Services;

use App\Auth\ScopeResolver;
use App\Models\User;

/**
 * Port dari backend/src/lib/assignmentAuth.ts.
 *
 * - Role yang boleh memberi tugas: BOD, KADIV, KASUBDIV, ADMIN, SUPERADMIN.
 *   (BOD read-only untuk Program/Task tapi eksplisit diizinkan memberi
 *   tugas harian — keputusan bisnis.)
 * - Penerima harus di scope org pemberi (direct report / sub-tree unit).
 *   Admin bebas menugaskan ke siapa saja.
 */
class AssignmentAuthService
{
    private const ASSIGNER_ROLES = ['BOD', 'KADIV', 'KASUBDIV', 'ADMIN', 'SUPERADMIN'];

    public function __construct(private ScopeResolver $scopeResolver) {}

    public function canCreateAssignment(?string $role): bool
    {
        return in_array(strtoupper($role ?? ''), self::ASSIGNER_ROLES, true);
    }

    public function canAssignTo(User $assigner, int $assigneeId): bool
    {
        if (!$this->canCreateAssignment($assigner->roleType)) return false;

        $scope = $this->scopeResolver->resolveUserScope($assigner);
        if ($scope->allowsAllUsers()) return true;

        return in_array($assigneeId, $scope->userIds ?? [], true);
    }

    /** Role yang boleh menandai isPrivate=true (policy V1). */
    public function canSetPrivate(?string $role): bool
    {
        return in_array(strtoupper($role ?? ''), ['BOD', 'KADIV', 'ADMIN', 'SUPERADMIN'], true);
    }
}
