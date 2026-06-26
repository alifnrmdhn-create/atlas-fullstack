<?php

namespace App\Providers;

use App\Auth\MembershipResolver;
use App\Auth\OrgScope;
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

        Gate::define('edit-program', function (User $user, Program $program) {
            // FE memperlakukan owner + submittedById + picPersons sebagai stakeholder
            // (lihat ProgramDetailView.tsx isOwner). Gate ini harus mirror — kalau
            // tidak, edit button muncul tapi Simpan → "This action is unauthorized".
            // picPersonIds accessor return [] kalau coPics belum di-eager-load,
            // jadi load relation di sini untuk memastikan check akurat.
            $program->loadMissing('coPics');
            $isStakeholder = $program->ownerId === $user->id
                || $program->submittedById === $user->id
                || in_array($user->id, $program->picPersonIds ?? [], true);
            $allowed = RolePolicy::canEditProgram(
                $user->roleType,
                $isStakeholder,
                $program->approvalStatus === 'DRAFT' && !empty($program->rejectionNote),
            );
            if (!$allowed) {
                return false;
            }

            // Hak edit KADIV/KASUBDIV tanpa-kepemilikan dibatasi scope-nya sendiri
            // (KADIV = se-direktorat, KASUBDIV = unit sendiri, lihat OrgScope).
            // Tanpa ini, sejak ASISTEN/owner-syarat dilepas (2026-06-26) seorang
            // KASUBDIV/KADIV direktorat/unit lain bisa PUT detail program manapun
            // lewat API langsung (halaman detailnya sendiri tertutup oleh
            // assertAccess di jalur baca, tapi Gate ini tidak ber-scope).
            if (!$isStakeholder && in_array(RolePolicy::norm($user->roleType), ['kadiv', 'kasubdiv'], true)) {
                return OrgScope::forUser($user)->coversUnit(
                    $program->ownerUnitId !== null ? (int) $program->ownerUnitId : null,
                );
            }

            return true;
        });

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
