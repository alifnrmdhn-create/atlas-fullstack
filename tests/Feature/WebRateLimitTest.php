<?php

namespace Tests\Feature;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Mengunci rate-limiting web (scale-readiness S2.4): throttle:web benar-benar
 * ter-pasang di grup web → runaway client/abuse di-tolak 429. Limit produksi
 * (600/mnt) sengaja generous; test memakai limit kecil untuk memverifikasi
 * WIRING-nya tanpa menembak ratusan request.
 */
class WebRateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_routes_reject_after_limit_exceeded(): void
    {
        // Override limiter 'web' dengan ambang kecil — middleware me-resolve by-name
        // saat request, jadi definisi ini yang dipakai.
        RateLimiter::for('web', fn (Request $r) => Limit::perMinute(3)->by('ratelimit-test'));

        for ($i = 0; $i < 3; $i++) {
            $this->get('/login')->assertOk();
        }

        $this->get('/login')->assertStatus(429);
    }

    public function test_normal_usage_under_limit_passes(): void
    {
        RateLimiter::for('web', fn (Request $r) => Limit::perMinute(600)->by('ratelimit-test-normal'));

        // Burst wajar (mis. route-scoped loader) jauh di bawah ambang → semua lolos.
        for ($i = 0; $i < 15; $i++) {
            $this->get('/login')->assertOk();
        }
    }
}
