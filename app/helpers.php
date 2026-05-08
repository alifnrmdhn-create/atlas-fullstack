<?php

use App\Services\SettingService;

if (!function_exists('setting')) {
    /**
     * Resolve dynamic setting dengan fallback ke config default.
     *
     * Pemakaian:
     *   setting('escalation_aging.yellow_after_days', config('atlas-thresholds.escalation_aging.yellow_after_days', 3))
     *
     * Atau dengan helper sederhana — caller cukup pass config path:
     *   $value = setting('escalation_aging.yellow_after_days');
     *
     * Cache 60 detik (lihat SettingService::CACHE_TTL).
     *
     * @template T
     * @param T $default
     * @return T|mixed
     */
    function setting(string $key, mixed $default = null): mixed
    {
        // Default fallback: kalau caller tidak supply $default, coba ambil dari
        // config('atlas-thresholds.{key}') untuk backward-compat dengan static config.
        if ($default === null) {
            $default = config('atlas-thresholds.' . $key);
        }
        return app(SettingService::class)->get($key, $default);
    }
}
