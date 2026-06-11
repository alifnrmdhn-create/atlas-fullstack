<?php

namespace Tests\Feature;

use App\Services\SettingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci wiring escalation_aging (audit 2026-06-10 temuan A5): dulu dead
 * config — nilainya bisa diedit admin via /admin/thresholds (SystemSetting)
 * tapi nol konsumen; warna aging di FE hardcoded di AgingIndicator. Kini
 * dishare ke FE via HandleInertiaRequests memakai setting() — test ini
 * memastikan default config mengalir DAN override admin benar-benar efektif
 * (regresi paling mungkin: seseorang mengganti setting() kembali ke config()
 * yang membuat knob admin diam-diam mati lagi).
 */
class ThresholdShareTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_escalation_aging_shared_with_defaults_and_admin_override(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-T', 'DIV-T');
        $user = $this->makeUser('threshold-user', 'OFFICER', $unit->id, $dir->id);

        $this->actingAs($user)->get('/')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('thresholds.escalationAging.yellow', 3)
                ->where('thresholds.escalationAging.orange', 7)
                ->where('thresholds.escalationAging.red', 14));

        // Override admin (jalur yang sama dengan /admin/thresholds) — set()
        // mem-bust cache setting, jadi efeknya harus langsung terlihat.
        app(SettingService::class)->set('escalation_aging.yellow_after_days', 5, 'escalation');

        $this->actingAs($user)->get('/')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('thresholds.escalationAging.yellow', 5)
                ->where('thresholds.escalationAging.red', 14));
    }
}
