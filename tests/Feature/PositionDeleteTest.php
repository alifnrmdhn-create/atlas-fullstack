<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Hapus Posisi: posisi yang PERNAH dipegang punya baris position_history.
 * Dulu FK position_history merestrict + tak ada transaksi → delete 500 dan
 * side-effect ter-commit separuh. Kini cascadeOnDelete + transaksi.
 */
class PositionDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Directorate $dir;
    private OrganizationalUnit $unit;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dir = Directorate::create(['code' => 'DIR-PD', 'name' => 'Direktorat PD']);
        $this->unit = OrganizationalUnit::create([
            'code' => 'UNIT-PD', 'name' => 'Unit PD',
            'unitType' => 'DIVISI', 'directorateId' => $this->dir->id,
        ]);
        $this->admin = User::create([
            'name' => 'Admin PD', 'email' => 'admin-pd@ptpn.test', 'userId' => 'admin-pd',
            'passwordHash' => Hash::make('password-123'), 'roleType' => 'SUPERADMIN', 'isActive' => true,
            'unitId' => $this->unit->id, 'directorateId' => $this->dir->id,
        ]);
    }

    private function makePosition(string $code, ?int $reportsTo = null): Position
    {
        return Position::create([
            'code' => $code, 'name' => "Position {$code}", 'levelCode' => 'BOD-4',
            'roleType' => 'KADIV', 'directorateId' => $this->dir->id, 'divisionId' => $this->unit->id,
            'reportsToPositionId' => $reportsTo, 'isActive' => true,
        ]);
    }

    public function test_can_delete_position_that_has_assignment_history(): void
    {
        $pos = $this->makePosition('POS-PD1');
        $holder = User::create([
            'name' => 'Holder PD', 'email' => 'holder-pd@ptpn.test', 'userId' => 'holder-pd',
            'passwordHash' => Hash::make('password-123'), 'roleType' => 'KADIV', 'isActive' => true,
            'unitId' => $this->unit->id, 'directorateId' => $this->dir->id, 'positionId' => $pos->id,
        ]);
        // Baris history = kondisi yang dulu memblokir delete (FK restrict).
        DB::table('position_history')->insert([
            'userId' => $holder->id, 'positionId' => $pos->id,
            'startDate' => now(), 'mutationType' => 'initial_assignment', 'createdAt' => now(),
        ]);

        $this->actingAs($this->admin)
            ->deleteJson("/organization/positions/{$pos->id}")
            ->assertOk();

        $this->assertDatabaseMissing('Position', ['id' => $pos->id]);
        $this->assertDatabaseMissing('position_history', ['positionId' => $pos->id]); // cascade
        $this->assertNull($holder->fresh()->positionId); // holder di-unassign
    }

    public function test_deleting_a_position_reparents_its_children(): void
    {
        $grandparent = $this->makePosition('POS-GP');
        $parent = $this->makePosition('POS-P', $grandparent->id);
        $child = $this->makePosition('POS-C', $parent->id);

        $this->actingAs($this->admin)
            ->deleteJson("/organization/positions/{$parent->id}")
            ->assertOk();

        // Anak naik ke kakek, bukan menggantung null.
        $this->assertSame($grandparent->id, $child->fresh()->reportsToPositionId);
    }
}
