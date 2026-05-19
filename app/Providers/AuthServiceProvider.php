<?php

namespace App\Providers;

use App\Auth\MembershipResolver;
use App\Auth\ScopeResolver;
use App\Models\Program;
use App\Models\User;
use App\Support\RolePolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ScopeResolver::class);
        $this->app->singleton(MembershipResolver::class);
    }

    public function boot(): void
    {
        // Gates — port dari permissions.ts.
        // Semua Gate menerima $user sebagai argumen pertama (Laravel auto-injects).

        Gate::define('manage-users', fn (User $user) =>
            RolePolicy::canManageUsers($user->roleType)
        );

        Gate::define('manage-parameters', fn (User $user) =>
            RolePolicy::canManageParameters($user->roleType)
        );

        Gate::define('view-all-entities', fn (User $user) =>
            RolePolicy::canViewAllEntities($user->roleType)
        );

        Gate::define('create-program', fn (User $user) =>
            RolePolicy::canCreateProgram($user->roleType)
        );

        Gate::define('edit-program', fn (User $user, Program $program) =>
            RolePolicy::canEditProgram(
                $user->roleType,
                $program->ownerId === $user->id,
                $program->approvalStatus === 'DRAFT' && !empty($program->rejectionNote),
            )
        );

        Gate::define('delete-program', fn (User $user, Program $program) =>
            RolePolicy::canDeleteProgram($user->roleType, $program->ownerId === $user->id)
        );

        Gate::define('archive-program', fn (User $user, Program $program) =>
            RolePolicy::canArchiveProgram($user->roleType, $program->ownerId === $user->id)
        );

        Gate::define('view-archive', fn (User $user) =>
            RolePolicy::canViewArchive($user->roleType)
        );
    }
}
