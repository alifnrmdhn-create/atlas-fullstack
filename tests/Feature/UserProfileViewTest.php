<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci endpoint GET /users/{id}/profile — profil publik read-only orang lain
 * yang dipakai UserProfileModal (klik nama/avatar di Presence, Channels, dst).
 *
 * Invarian:
 *   - user terautentikasi boleh melihat profil siapa pun (direktori lintas-direktorat)
 *   - payload memuat identitas + atasan langsung + ringkasan beban kerja
 *   - guest ditolak; id tak dikenal → 404; route hanya menerima id numeric
 */
class UserProfileViewTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_returns_public_profile_with_supervisor_and_workload(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-P', 'DIV-P');
        $kadiv  = $this->makeUser('kadiv-p', 'KADIV', $unit->id, $dir->id);
        $viewer = $this->makeUser('viewer-p', 'OFFICER', $unit->id, $dir->id);
        $target = $this->makeUser('target-p', 'ASISTEN', $unit->id, $dir->id, $kadiv->id);
        $target->update(['positionTitle' => 'Asisten Anggaran', 'email' => 'target-p@ptpn.test']);

        $res = $this->actingAs($viewer)
            ->getJson("/users/{$target->id}/profile")
            ->assertOk();

        $res->assertJsonPath('user.id', $target->id)
            ->assertJsonPath('user.name', 'target-p')
            ->assertJsonPath('user.positionTitle', 'Asisten Anggaran')
            ->assertJsonPath('user.directorate.name', 'Direktorat DIR-P')
            // atasan langsung = kadiv (managerUserId)
            ->assertJsonPath('supervisor.id', $kadiv->id)
            ->assertJsonStructure([
                'user'     => ['id', 'name', 'email', 'roleType', 'avatarUrl', 'unit', 'directorate'],
                'presence',
                'supervisor',
                'workload' => ['activeTasks', 'activeAssignments', 'programsOwned'],
            ]);
    }

    public function test_user_without_manager_has_null_supervisor(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-Q', 'DIV-Q');
        $viewer = $this->makeUser('viewer-q', 'OFFICER', $unit->id, $dir->id);
        $top    = $this->makeUser('top-q', 'KADIV', $unit->id, $dir->id); // no managerUserId

        $this->actingAs($viewer)
            ->getJson("/users/{$top->id}/profile")
            ->assertOk()
            ->assertJsonPath('supervisor', null);
    }

    public function test_unknown_id_returns_404(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-R', 'DIV-R');
        $viewer = $this->makeUser('viewer-r', 'OFFICER', $unit->id, $dir->id);

        $this->actingAs($viewer)
            ->getJson('/users/99999/profile')
            ->assertNotFound();
    }

    public function test_guest_is_unauthenticated(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-S', 'DIV-S');
        $target = $this->makeUser('target-s', 'OFFICER', $unit->id, $dir->id);

        $this->getJson("/users/{$target->id}/profile")
            ->assertUnauthorized();
    }

    public function test_non_numeric_id_does_not_match_route(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-T', 'DIV-T');
        $viewer = $this->makeUser('viewer-t', 'OFFICER', $unit->id, $dir->id);

        // 'directory' adalah literal route lain; '/users/abc/profile' tidak match
        // route numeric → 404 (bukan nyasar ke userProfile).
        $this->actingAs($viewer)
            ->getJson('/users/abc/profile')
            ->assertNotFound();
    }
}
