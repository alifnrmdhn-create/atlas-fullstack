<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Endpoint Position Management — sisi hierarki (reportsToPositionId) dan efek
 * turunannya ke User.managerUserId.
 */
class PositionHierarchyEndpointTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private int $dirId;
    private int $unitId;

    protected function setUp(): void
    {
        parent::setUp();
        $dir = Directorate::create(['code' => 'DKM', 'name' => 'Direktorat KM', 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => 'DKSA', 'name' => 'Divisi A', 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);
        $this->dirId = $dir->id;
        $this->unitId = $unit->id;
        $this->admin = $this->makeUser('admin', 'SUPERADMIN');
    }

    public function test_update_position_rejects_cycle(): void
    {
        $parent = $this->makePosition('PAR', null);
        $child = $this->makePosition('CHD', $parent->id);

        // Parent dibuat melapor ke child → lingkar, harus 422.
        $this->actingAs($this->admin)
            ->patchJson("/organization/positions/{$parent->id}", ['reportsToPositionId' => $child->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reportsToPositionId');

        $this->assertNull($parent->fresh()->reportsToPositionId);
    }

    public function test_update_position_rejects_nonexistent_parent(): void
    {
        $pos = $this->makePosition('SOLO', null);

        $this->actingAs($this->admin)
            ->patchJson("/organization/positions/{$pos->id}", ['reportsToPositionId' => 999999])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reportsToPositionId');
    }

    public function test_update_reports_to_recomputes_subordinate_manager(): void
    {
        $boss = $this->makePosition('BOSS', null);
        $sub = $this->makePosition('SUB', null);

        $bossUser = $this->makeUser('boss', 'KADIV', $boss->id);
        $subUser = $this->makeUser('sub', 'ASISTEN', $sub->id);

        $this->assertNull($subUser->fresh()->managerUserId);

        // Sambungkan SUB → BOSS; managerUserId subUser harus jadi bossUser.
        $this->actingAs($this->admin)
            ->patchJson("/organization/positions/{$sub->id}", ['reportsToPositionId' => $boss->id])
            ->assertOk();

        $this->assertSame($bossUser->id, $subUser->fresh()->managerUserId);
    }

    public function test_assign_position_recomputes_manager(): void
    {
        $boss = $this->makePosition('BOSS', null);
        $sub = $this->makePosition('SUB', $boss->id);

        $bossUser = $this->makeUser('boss', 'KADIV', $boss->id);
        $subUser = $this->makeUser('sub', 'ASISTEN', null); // belum punya jabatan

        // Assign subUser ke posisi SUB (anak dari BOSS) → managerUserId = bossUser.
        $this->actingAs($this->admin)
            ->patchJson("/organization/positions/{$sub->id}/assign", ['userId' => $subUser->id])
            ->assertOk();

        $this->assertSame($bossUser->id, $subUser->fresh()->managerUserId);
    }

    public function test_destroy_parent_position_reparents_children_and_recomputes(): void
    {
        $grand = $this->makePosition('GRAND', null);
        $mid = $this->makePosition('MID', $grand->id);
        $leaf = $this->makePosition('LEAF', $mid->id);

        $grandUser = $this->makeUser('grand', 'KADIV', $grand->id);
        $leafUser = $this->makeUser('leaf', 'ASISTEN', $leaf->id);
        // MID sengaja kosong (vacant) → leaf awalnya melapor ke grand.

        // Hapus MID → leaf di-reparent ke kakek (GRAND), rantai tetap utuh.
        $this->actingAs($this->admin)
            ->deleteJson("/organization/positions/{$mid->id}")
            ->assertOk();

        $this->assertSame($grand->id, $leaf->fresh()->reportsToPositionId);
        $this->assertSame($grandUser->id, $leafUser->fresh()->managerUserId);
    }

    private function makePosition(string $code, ?int $reportsTo): Position
    {
        return Position::create([
            'code' => $code,
            'name' => "Jabatan {$code}",
            'levelCode' => 'M1',
            'roleType' => 'ASISTEN',
            'directorateId' => $this->dirId,
            'divisionId' => $this->unitId,
            'reportsToPositionId' => $reportsTo,
            'isActive' => true,
        ]);
    }

    private function makeUser(string $slug, string $role, ?int $positionId = null): User
    {
        return User::create([
            'name' => $slug,
            'email' => "{$slug}@ptpn.test",
            'userId' => $slug,
            'passwordHash' => Hash::make('password'),
            'roleType' => $role,
            'isActive' => true,
            'positionId' => $positionId,
            'unitId' => $this->unitId,
            'directorateId' => $this->dirId,
        ]);
    }
}
