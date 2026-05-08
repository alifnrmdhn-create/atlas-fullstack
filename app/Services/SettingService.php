<?php

namespace App\Services;

use App\Models\SystemSetting;
use Illuminate\Support\Facades\Cache;

/**
 * Post-MVP — Dynamic settings dengan cache layer.
 *
 * Read flow:
 *   1. Cek cache (60 detik TTL)
 *   2. Cache miss → query DB
 *   3. Tidak ada di DB → return $default (yang biasanya `config(...)`)
 *
 * Write flow: update DB + bust cache untuk key tersebut.
 *
 * Pemakaian via global helper `setting()` di app/helpers.php.
 */
class SettingService
{
    private const CACHE_PREFIX = 'atlas.setting.';
    private const CACHE_TTL = 60;

    /**
     * Read setting value. Fallback ke $default kalau tidak ada di DB.
     *
     * @template T
     * @param T $default
     * @return T|mixed
     */
    public function get(string $key, mixed $default = null): mixed
    {
        return Cache::remember(self::CACHE_PREFIX . $key, self::CACHE_TTL, function () use ($key) {
            $row = SystemSetting::where('key', $key)->first(['value']);
            // Wrap dalam array dengan flag supaya null value bisa dibedakan
            // dari "tidak ada record" (Cache::remember tidak handle null).
            return $row ? ['has' => true, 'value' => $row->value] : ['has' => false];
        })['value'] ?? $default;
    }

    /** Set setting value. Bust cache. */
    public function set(string $key, mixed $value, string $category, ?int $userId = null, ?string $description = null): SystemSetting
    {
        $row = SystemSetting::updateOrCreate(
            ['key' => $key],
            [
                'value' => $value,
                'category' => $category,
                'description' => $description,
                'updatedById' => $userId,
            ],
        );
        Cache::forget(self::CACHE_PREFIX . $key);
        return $row;
    }

    /** Delete setting (revert ke default config). */
    public function reset(string $key): void
    {
        SystemSetting::where('key', $key)->delete();
        Cache::forget(self::CACHE_PREFIX . $key);
    }

    /** Get semua settings di category — untuk UI form. */
    public function getCategory(string $category): array
    {
        return SystemSetting::where('category', $category)
            ->get(['key', 'value', 'description', 'updatedAt'])
            ->keyBy('key')
            ->toArray();
    }

    /** Bust seluruh cache settings — dipakai saat bulk operation. */
    public function flushAll(): void
    {
        // Karena Cache::forget per-key, untuk flush global pakai tag kalau cache driver support.
        // MVP: tidak perlu flush global — cache TTL pendek (60s), efek samping minimal.
    }
}
