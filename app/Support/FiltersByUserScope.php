<?php

namespace App\Support;

use App\Auth\ScopeResolver;
use App\Auth\UserScope;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Trait untuk diterapkan pada model yang punya kolom owner/assignee user-id
 * (Program.ownerId, Workstream.ownerId, Task.assignedTo, dll).
 *
 * Model yang pakai trait ini harus punya property:
 *     protected string $ownerColumn = 'ownerId';
 *
 * Pemakaian di controller/service:
 *     Program::query()->withinUserScope($user)->get();
 *
 * Semantik mirror applyScope() di scope.ts: jika scope.userIds === null
 * (SUPERADMIN/ADMIN), query tidak difilter. Selain itu, hanya baris dengan
 * owner/assignee di array yang dikembalikan.
 */
trait FiltersByUserScope
{
    public function scopeWithinUserScope(Builder $query, User $user): Builder
    {
        /** @var ScopeResolver $resolver */
        $resolver = app(ScopeResolver::class);
        $scope = $resolver->resolveUserScope($user);

        return $this->applyScopeToQuery($query, $scope);
    }

    public function scopeApplyScope(Builder $query, UserScope $scope): Builder
    {
        return $this->applyScopeToQuery($query, $scope);
    }

    private function applyScopeToQuery(Builder $query, UserScope $scope): Builder
    {
        // null = tidak ada filter
        if ($scope->userIds === null) {
            return $query;
        }

        $column = $this->ownerColumn ?? 'ownerId';

        // Empty array = tidak ada user yang cocok → tidak ada hasil
        if (empty($scope->userIds)) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereIn($column, $scope->userIds);
    }
}
