<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
        }

        $this->configureRateLimiting();
    }

    /**
     * Rate limiter 'web' (scale-readiness S2.4) — proteksi runaway client/abuse.
     *
     * SENGAJA generous: tak boleh trip pemakaian normal (poll tiap 2s = 30/mnt
     * per tab; power-user 8 tab + reads ≈ 350/mnt). Default 600/mnt per-user =
     * 10/s sustained — runaway loop (ratusan/s) tertangkap, user nyata tidak.
     * Guest by-IP lebih ketat (pra-login). Limit configurable via env supaya
     * bisa di-tune/longgarkan cepat tanpa deploy kode (sistem live pilot).
     */
    private function configureRateLimiting(): void
    {
        $perUser = (int) env('ATLAS_WEB_RATE_LIMIT', 600);
        $perGuest = (int) env('ATLAS_GUEST_RATE_LIMIT', 120);

        RateLimiter::for('web', function (Request $request) use ($perUser, $perGuest) {
            $user = $request->user();

            return $user
                ? Limit::perMinute($perUser)->by('u:' . $user->id)
                : Limit::perMinute($perGuest)->by('ip:' . $request->ip());
        });
    }
}
