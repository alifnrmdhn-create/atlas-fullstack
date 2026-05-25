<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restrict route access to SUPERADMIN role only. Dipakai oleh modul yang
 * sementara di-restrict ke SUPERADMIN (mis. /performance/* per 2026-05-25).
 */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $role = strtoupper($request->user()?->roleType ?? '');

        if ($role !== 'SUPERADMIN') {
            abort(403, 'Akses dibatasi untuk SUPERADMIN.');
        }

        return $next($request);
    }
}
