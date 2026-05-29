<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate for the Performance (KPI) module. Superseded EnsureSuperAdmin on
 * /performance/* (2026-05-29): the module opened role-scoped once real KPI
 * data landed. Access = SUPERADMIN (all directorates) OR any member of a
 * directorate that actually has scorecard data (today: DIR-KMR). As more
 * directorates are imported they unlock automatically — no code change.
 *
 * NOTE: this gate only controls ENTRY. Per-directorate / per-divisi data
 * scoping is enforced in PerformanceController (OrgScope) so a unit-level
 * user can't read a sibling division's detail.
 */
class EnsurePerformanceAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! self::allows($request->user())) {
            abort(403, 'Akses Performance dibatasi untuk direktorat dengan data KPI.');
        }

        return $next($request);
    }

    /** Shared by the Inertia share (sidebar visibility) so the rule lives once. */
    public static function allows(?User $user): bool
    {
        if (! $user) {
            return false;
        }
        if (strtoupper($user->roleType ?? '') === 'SUPERADMIN') {
            return true;
        }

        return $user->directorateId
            && DB::table('DirektoratScorecard')->where('directorateId', $user->directorateId)->exists();
    }
}
