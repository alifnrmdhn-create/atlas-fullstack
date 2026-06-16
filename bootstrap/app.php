<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            // Correlation id + konteks request di semua log (scale-readiness S0).
            // Sebelum Inertia supaya rendering Inertia ikut ber-konteks.
            \App\Http\Middleware\LogRequestContext::class,
            \App\Http\Middleware\HandleInertiaRequests::class,
        ]);
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Error tracking (scale-readiness S0.1) — jalur lokal-first: setiap
        // exception ter-report ke channel log (stderr JSON di prod) lengkap
        // dengan konteks request dari LogRequestContext, jadi error 500 di
        // Railway log bisa di-grep per-request/per-user.
        //
        // Upgrade Sentry (saat siap, opsional, free-tier $0): `composer require
        // sentry/sentry-laravel` + set SENTRY_LARAVEL_DSN — paket auto-hook
        // reportable. Tanpa DSN = no-op, jadi aman di-defer. Lihat
        // docs/scale-readiness-plan-2026-06.md S0.1.
    })->create();
