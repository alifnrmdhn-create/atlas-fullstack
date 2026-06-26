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
 * Regресi untuk dua bug Admin yang dilaporkan 2026-06-24:
 *  1. Edit Position tidak tersimpan — `updatePosition` tak memvalidasi `code`,
 *     sehingga perubahan Code dibuang diam-diam.
 *  2. Tidak ada jalur edit identitas User — `updateUser` hanya menerima
 *     isActive/positionId; name/userId/nik/phone/password dibuang.
 */
class AdminEditPersistsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Position $position;
    private User $target;

    protected function setUp(): void
    {
        parent::setUp();

        $directorate = Directorate::create(['code' => 'DIR-AE', 'name' => 'Direktorat AE']);
        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-AE', 'name' => 'Unit AE', 'unitType' => 'DIVISI',
            'directorateId' => $directorate->id,
        ]);

        $this->position = Position::create([
            'code' => 'POS-AE-01', 'name' => 'AE Lead', 'levelCode' => 'L3',
            'roleType' => 'SUPERADMIN', 'directorateId' => $directorate->id,
            'divisionId' => $unit->id, 'isActive' => true,
        ]);

        $this->admin = User::create([
            'name' => 'AE Admin', 'email' => 'ae-admin@ptpn.test', 'userId' => 'ae-admin',
            'passwordHash' => Hash::make('old-pass-123'), 'roleType' => 'SUPERADMIN',
            'isActive' => true, 'directorateId' => $directorate->id, 'unitId' => $unit->id,
            'positionId' => $this->position->id, 'positionTitle' => $this->position->name,
        ]);

        $this->target = User::create([
            'name' => 'AE Target', 'email' => 'ae-target@ptpn.test', 'userId' => 'ae-target',
            'nik' => '111', 'passwordHash' => Hash::make('target-pass-123'),
            'roleType' => 'ASISTEN', 'isActive' => true,
        ]);
    }

    public function test_position_edit_persists_code_and_name(): void
    {
        $this->actingAs($this->admin);

        $this->patchJson("/organization/positions/{$this->position->id}", [
            'code' => 'POS-AE-RENAMED',
            'name' => 'AE Lead Renamed',
        ])->assertOk()->assertJsonPath('data.code', 'POS-AE-RENAMED');

        $this->position->refresh();
        $this->assertSame('POS-AE-RENAMED', $this->position->code);
        $this->assertSame('AE Lead Renamed', $this->position->name);
    }

    public function test_position_edit_rejects_duplicate_code(): void
    {
        $this->actingAs($this->admin);

        Position::create([
            'code' => 'POS-AE-02', 'name' => 'Other', 'levelCode' => 'L3',
            'roleType' => 'ASISTEN', 'isActive' => true,
        ]);

        $this->patchJson("/organization/positions/{$this->position->id}", [
            'code' => 'POS-AE-02',
        ])->assertStatus(422);
    }

    public function test_user_edit_persists_identity_and_password(): void
    {
        $this->actingAs($this->admin);

        $this->patchJson("/users/{$this->target->id}", [
            'name' => 'AE Target Renamed',
            'userId' => 'ae-target-new',
            'nik' => '999888',
            'phone' => '+628111',
            'password' => 'fresh-pass-456',
        ])->assertOk();

        $this->target->refresh();
        $this->assertSame('AE Target Renamed', $this->target->name);
        $this->assertSame('ae-target-new', $this->target->userId);
        $this->assertSame('999888', $this->target->nik);
        $this->assertSame('+628111', $this->target->phone);
        $this->assertTrue(Hash::check('fresh-pass-456', $this->target->passwordHash));
        // roleType TIDAK berubah lewat edit identitas
        $this->assertSame('ASISTEN', $this->target->roleType);
    }

    public function test_user_edit_without_password_keeps_old_password(): void
    {
        $this->actingAs($this->admin);

        $this->patchJson("/users/{$this->target->id}", [
            'name' => 'Only Name Changed',
        ])->assertOk();

        $this->target->refresh();
        $this->assertSame('Only Name Changed', $this->target->name);
        $this->assertTrue(Hash::check('target-pass-123', $this->target->passwordHash));
    }

    public function test_user_edit_rejects_duplicate_userid(): void
    {
        $this->actingAs($this->admin);

        $this->patchJson("/users/{$this->target->id}", [
            'userId' => 'ae-admin', // sudah dipakai admin
        ])->assertStatus(422);
    }

    public function test_new_user_gets_default_password(): void
    {
        $this->actingAs($this->admin);

        $this->postJson('/users', [
            'name' => 'Fresh User',
            'email' => 'fresh-user@ptpn.test',
            'roleType' => 'ASISTEN',
        ])->assertCreated();

        $created = User::where('email', 'fresh-user@ptpn.test')->firstOrFail();
        $this->assertTrue(Hash::check('DKMR2026', $created->passwordHash));
    }

    public function test_transfer_to_vacant_clears_position_and_org(): void
    {
        $this->actingAs($this->admin);

        // Target awalnya memegang sebuah jabatan + org denormalisasi terisi.
        $this->target->update([
            'positionId' => $this->position->id,
            'positionTitle' => $this->position->name,
            'unitId' => $this->position->divisionId,
            'directorateId' => $this->position->directorateId,
        ]);
        \App\Models\PositionHistory::create([
            'userId' => $this->target->id,
            'positionId' => $this->position->id,
            'startDate' => now()->subMonth(),
            'mutationType' => 'initial_assignment',
        ]);

        $this->patchJson("/users/{$this->target->id}", [
            'positionId' => null,
            'mutationType' => 'vacated',
            'mutationReason' => 'Dibebastugaskan',
        ])->assertOk();

        $this->target->refresh();
        $this->assertNull($this->target->positionId);
        $this->assertNull($this->target->positionTitle);
        $this->assertNull($this->target->unitId);
        $this->assertNull($this->target->directorateId);
        // roleType (akses sistem) dipertahankan — vacate ≠ cabut akun.
        $this->assertSame('ASISTEN', $this->target->roleType);

        // Riwayat lama ditutup; tidak ada baris baru (positionId NOT NULL).
        $open = \App\Models\PositionHistory::where('userId', $this->target->id)
            ->whereNull('endDate')->count();
        $this->assertSame(0, $open);
        $this->assertSame(1, \App\Models\PositionHistory::where('userId', $this->target->id)->count());
    }

    public function test_non_admin_cannot_edit_user(): void
    {
        $this->actingAs($this->target); // ASISTEN

        $this->patchJson("/users/{$this->admin->id}", [
            'name' => 'Hacked',
        ])->assertStatus(403);
    }
}
