<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci allowlist MIME upload publik (audit 2026-06-16): POST /uploads
 * menyimpan ke disk publik & mengembalikan URL same-origin /storage/* — tanpa
 * allowlist, user terautentikasi bisa upload .html/.svg/.js → stored-XSS dari
 * domain app. Allowlist EKSPLISIT (config/uploads.php) tanpa svg/html/js.
 */
class UploadMimeAllowlistTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_rejects_dangerous_types_and_accepts_safe_ones(): void
    {
        Storage::fake('public');
        [$dir, $unit] = $this->makeDirectorate('DIR-U', 'DIV-U');
        $user = $this->makeUser('upload-user', 'OFFICER', $unit->id, $dir->id);

        // HTML → ditolak (vektor stored-XSS)
        $this->actingAs($user)
            ->postJson('/uploads', ['files' => [UploadedFile::fake()->create('evil.html', 5, 'text/html')]])
            ->assertStatus(422);

        // SVG → ditolak (bisa memuat script; image/ prefix akan lolos, eksplisit tidak)
        $this->actingAs($user)
            ->postJson('/uploads', ['files' => [UploadedFile::fake()->create('evil.svg', 5, 'image/svg+xml')]])
            ->assertStatus(422);

        // PNG → diterima
        $this->actingAs($user)
            ->postJson('/uploads', ['files' => [UploadedFile::fake()->create('ok.png', 5, 'image/png')]])
            ->assertOk()
            ->assertJsonPath('data.0.type', 'image/png');

        // PDF → diterima
        $this->actingAs($user)
            ->postJson('/uploads', ['files' => [UploadedFile::fake()->create('ok.pdf', 5, 'application/pdf')]])
            ->assertOk();
    }
}
