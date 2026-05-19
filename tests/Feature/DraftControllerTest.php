<?php

namespace Tests\Feature;

use App\Models\FormDraft;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Sprint 6 — Form autosave / draft persistence.
 *
 * Cakupan:
 *   - Auth: hanya owner yang bisa baca/tulis/hapus draft mereka.
 *   - CRUD: show / upsert / destroy berperilaku konsisten.
 *   - FWW conflict: clientId beda + version lebih lama → 409.
 *   - TTL: draft expired tidak surface di show, dihapus oleh cleanup command.
 *   - Feature flag: bisa di-disable lewat config tanpa code revert.
 *   - Payload size: > 256KB → 413.
 */
class DraftControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;
    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('features.autosave', 'enabled');

        $this->alice = $this->makeUser('alice@ptpn.test');
        $this->bob   = $this->makeUser('bob@ptpn.test');
    }

    // ── Auth ──────────────────────────────────────────────────────────────────

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/drafts/program:1:progressLog')->assertStatus(401);
        $this->putJson('/drafts/program:1:progressLog', ['payload' => []])->assertStatus(401);
        $this->deleteJson('/drafts/program:1:progressLog')->assertStatus(401);
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    public function test_show_returns_null_when_no_draft(): void
    {
        $this->actingAs($this->alice)
            ->getJson('/drafts/program:1:progressLog')
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_show_returns_draft_for_owner(): void
    {
        $this->actingAs($this->alice)->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'WIP'],
        ])->assertOk();

        $this->actingAs($this->alice)
            ->getJson('/drafts/program:1:progressLog')
            ->assertOk()
            ->assertJsonPath('data.payload.narrative', 'WIP')
            ->assertJsonPath('data.version', 1);
    }

    public function test_show_returns_null_when_expired(): void
    {
        $draft = FormDraft::create([
            'userId' => $this->alice->id,
            'formKey' => 'program:1:progressLog',
            'payload' => ['narrative' => 'stale'],
            'expiresAt' => now()->subDay(),
        ]);

        $this->actingAs($this->alice)
            ->getJson('/drafts/program:1:progressLog')
            ->assertOk()
            ->assertJsonPath('data', null);

        $this->assertDatabaseHas('FormDraft', ['id' => $draft->id]); // still exists, just hidden
    }

    public function test_show_does_not_leak_other_users_draft(): void
    {
        $this->actingAs($this->alice)->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'alice-secret'],
        ])->assertOk();

        $this->actingAs($this->bob)
            ->getJson('/drafts/program:1:progressLog')
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    // ── Upsert ────────────────────────────────────────────────────────────────

    public function test_upsert_creates_new_draft_with_version_1(): void
    {
        $resp = $this->actingAs($this->alice)->putJson('/drafts/program:1:progressLog', [
            'payload'    => ['narrative' => 'first save'],
            'entityType' => 'Program',
            'entityId'   => 1,
            'clientId'   => 'tab-a',
        ])->assertOk()->assertJsonPath('data.version', 1);

        $this->assertDatabaseHas('FormDraft', [
            'userId' => $this->alice->id,
            'formKey' => 'program:1:progressLog',
            'version' => 1,
            'clientId' => 'tab-a',
        ]);
    }

    public function test_upsert_increments_version_on_repeated_saves(): void
    {
        $this->actingAs($this->alice);

        for ($i = 1; $i <= 3; $i++) {
            $resp = $this->putJson('/drafts/program:1:progressLog', [
                'payload' => ['narrative' => "save {$i}"],
                'clientId' => 'tab-a',
                'version' => $i - 1,
            ]);
            $resp->assertOk()->assertJsonPath('data.version', $i);
        }
    }

    public function test_upsert_bumps_expires_at_on_each_save(): void
    {
        $this->actingAs($this->alice);
        $this->putJson('/drafts/program:1:progressLog', ['payload' => ['narrative' => 'first']])->assertOk();
        $first = FormDraft::forUser($this->alice->id)->forKey('program:1:progressLog')->first();

        // Manually back-date to verify next save bumps forward.
        $first->update(['expiresAt' => now()->addDay()]);
        $oldExpiry = $first->expiresAt;

        $this->putJson('/drafts/program:1:progressLog', ['payload' => ['narrative' => 'second']])->assertOk();
        $fresh = $first->fresh();
        $this->assertTrue($fresh->expiresAt->greaterThan($oldExpiry), 'expiresAt should be refreshed on save');
    }

    public function test_upsert_returns_409_on_clientId_conflict_with_lower_version(): void
    {
        $this->actingAs($this->alice);

        // Tab A saves twice — server reaches version 2.
        $this->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'a1'], 'clientId' => 'tab-a', 'version' => 0,
        ])->assertOk();
        $this->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'a2'], 'clientId' => 'tab-a', 'version' => 1,
        ])->assertOk();

        // Tab B tries to save while still on version 0 — conflict.
        $resp = $this->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'b1'], 'clientId' => 'tab-b', 'version' => 0,
        ]);
        $resp->assertStatus(409)
            ->assertJsonPath('error', 'version-conflict')
            ->assertJsonPath('server.version', 2)
            ->assertJsonPath('server.clientId', 'tab-a');
    }

    public function test_upsert_allows_same_client_overwrite_even_with_stale_version(): void
    {
        $this->actingAs($this->alice);

        $this->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'v1'], 'clientId' => 'tab-a', 'version' => 0,
        ])->assertOk();

        // Same clientId — assume single tab, no real conflict; allow overwrite.
        $this->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'v1-amended'], 'clientId' => 'tab-a', 'version' => 0,
        ])->assertOk()->assertJsonPath('data.version', 2);
    }

    public function test_upsert_validates_payload_required_array(): void
    {
        $this->actingAs($this->alice)
            ->putJson('/drafts/program:1:progressLog', ['payload' => 'not-an-array'])
            ->assertStatus(422);

        $this->actingAs($this->alice)
            ->putJson('/drafts/program:1:progressLog', [])
            ->assertStatus(422);
    }

    public function test_payload_too_large_returns_413(): void
    {
        // 300KB > default cap 256KB
        $bigString = str_repeat('a', 300 * 1024);

        $this->actingAs($this->alice)
            ->putJson('/drafts/program:1:progressLog', [
                'payload' => ['narrative' => $bigString],
            ])
            ->assertStatus(413)
            ->assertJsonPath('error', 'payload-too-large');
    }

    public function test_upsert_does_not_collide_across_users(): void
    {
        $this->actingAs($this->alice)
            ->putJson('/drafts/program:1:progressLog', ['payload' => ['narrative' => 'alice']])
            ->assertOk();
        $this->actingAs($this->bob)
            ->putJson('/drafts/program:1:progressLog', ['payload' => ['narrative' => 'bob']])
            ->assertOk();

        $this->assertEquals(2, FormDraft::count(), 'Unique (userId, formKey) — each user has own row');
    }

    // ── Destroy ───────────────────────────────────────────────────────────────

    public function test_destroy_removes_owner_draft(): void
    {
        $this->actingAs($this->alice)->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'WIP'],
        ])->assertOk();

        $this->actingAs($this->alice)
            ->deleteJson('/drafts/program:1:progressLog')
            ->assertStatus(204);

        $this->assertDatabaseMissing('FormDraft', [
            'userId' => $this->alice->id, 'formKey' => 'program:1:progressLog',
        ]);
    }

    public function test_destroy_is_idempotent_when_no_draft(): void
    {
        $this->actingAs($this->alice)
            ->deleteJson('/drafts/program:1:progressLog')
            ->assertStatus(204);
    }

    public function test_destroy_does_not_touch_other_users_draft(): void
    {
        $this->actingAs($this->alice)->putJson('/drafts/program:1:progressLog', [
            'payload' => ['narrative' => 'alice'],
        ])->assertOk();

        $this->actingAs($this->bob)
            ->deleteJson('/drafts/program:1:progressLog')
            ->assertStatus(204);

        $this->assertDatabaseHas('FormDraft', [
            'userId' => $this->alice->id, 'formKey' => 'program:1:progressLog',
        ]);
    }

    // ── Feature flag ──────────────────────────────────────────────────────────

    public function test_feature_flag_disabled_blocks_upsert(): void
    {
        Config::set('features.autosave', 'disabled');

        $this->actingAs($this->alice)
            ->putJson('/drafts/program:1:progressLog', ['payload' => ['narrative' => 'x']])
            ->assertStatus(503);

        $this->assertEquals(0, FormDraft::count());
    }

    public function test_feature_flag_disabled_returns_null_on_show(): void
    {
        // Bikin draft saat flag enabled
        $this->actingAs($this->alice)
            ->putJson('/drafts/program:1:progressLog', ['payload' => ['narrative' => 'x']])
            ->assertOk();

        Config::set('features.autosave', 'disabled');

        $this->actingAs($this->alice)
            ->getJson('/drafts/program:1:progressLog')
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    // ── Cleanup scheduler ─────────────────────────────────────────────────────

    public function test_cleanup_command_deletes_expired_only(): void
    {
        $fresh = FormDraft::create([
            'userId' => $this->alice->id,
            'formKey' => 'fresh',
            'payload' => [],
            'expiresAt' => now()->addDays(3),
        ]);
        $expired = FormDraft::create([
            'userId' => $this->alice->id,
            'formKey' => 'expired',
            'payload' => [],
            'expiresAt' => now()->subDay(),
        ]);

        Artisan::call('atlas:cleanup-form-drafts');

        $this->assertDatabaseHas('FormDraft', ['id' => $fresh->id]);
        $this->assertDatabaseMissing('FormDraft', ['id' => $expired->id]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeUser(string $email): User
    {
        return User::create([
            'name' => $email,
            'email' => $email,
            'passwordHash' => Hash::make('password'),
            'roleType' => 'OFFICER',
            'isActive' => true,
        ]);
    }
}
