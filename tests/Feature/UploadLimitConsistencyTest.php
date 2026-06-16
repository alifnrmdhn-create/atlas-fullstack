<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Mengunci konsistensi batas upload (audit 2026-06-17): php-conf/uploads.ini
 * (dimuat via PHP_INI_SCAN_DIR di nixpacks) menaikkan upload_max_filesize/
 * post_max_size dari default PHP 2M/8M agar SELARAS validasi app (max:10240 KB
 * = 10MB/file). Tanpa ini, foto HP 2-5MB ditolak PHP diam-diam ("files failed
 * to upload"). Regresi yang dijaga: ini dihapus/diturunkan di bawah validasi app.
 */
class UploadLimitConsistencyTest extends TestCase
{
    private const APP_VALIDATION_BYTES = 10 * 1024 * 1024; // max:10240 KB

    public function test_php_ini_overrides_cover_app_upload_validation(): void
    {
        $path = base_path('php-conf/uploads.ini');
        $this->assertFileExists($path, 'php-conf/uploads.ini wajib ada (dimuat via PHP_INI_SCAN_DIR).');

        $ini = parse_ini_file($path);

        $upload = $this->toBytes($ini['upload_max_filesize'] ?? '0');
        $post = $this->toBytes($ini['post_max_size'] ?? '0');

        $this->assertGreaterThanOrEqual(self::APP_VALIDATION_BYTES, $upload,
            'upload_max_filesize harus >= 10MB (validasi app), kalau tidak foto HP ditolak PHP diam-diam.');
        $this->assertGreaterThanOrEqual(self::APP_VALIDATION_BYTES, $post,
            'post_max_size harus >= 10MB (idealnya > upload_max utk overhead multipart/multi-file).');
        $this->assertGreaterThanOrEqual($upload, $post,
            'post_max_size harus >= upload_max_filesize, kalau tidak PHP mengabaikan upload.');
    }

    private function toBytes(string $val): int
    {
        $val = trim($val);
        $unit = strtolower($val[strlen($val) - 1]);
        $num = (int) $val;
        return match ($unit) {
            'g' => $num * 1024 * 1024 * 1024,
            'm' => $num * 1024 * 1024,
            'k' => $num * 1024,
            default => $num,
        };
    }
}
