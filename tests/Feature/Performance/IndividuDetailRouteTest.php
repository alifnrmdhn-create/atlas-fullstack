<?php

namespace Tests\Feature\Performance;

use App\Models\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Regression guard: individuDetail() eager-loaded `position:id,title`, but the
 * Position table column is `name` (not `title`) → 500 QueryException on every
 * /performance/individu/{id} and /performance/me visit. Keep the route green
 * for a user that actually has a position attached.
 */
class IndividuDetailRouteTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'name'         => 'Perf Admin',
            'email'        => 'perf-admin@ptpn.test',
            'userId'       => 'perf-admin',
            'passwordHash' => Hash::make('password-123'),
            'roleType'     => 'SUPERADMIN', // grants EnsurePerformanceAccess
            'isActive'     => true,
        ]);
    }

    public function test_individu_detail_loads_with_position_relation(): void
    {
        $position = Position::create([
            'code'      => 'POS-TEST',
            'name'      => 'Kepala Divisi Uji',
            'levelCode' => 'KADIV',
            'roleType'  => 'KADIV',
            'isActive'  => true,
        ]);

        $target = User::create([
            'name'         => 'Target Pegawai',
            'email'        => 'target@ptpn.test',
            'userId'       => 'target-pegawai',
            'passwordHash' => Hash::make('password-123'),
            'roleType'     => 'ASISTEN',
            'positionId'   => $position->id,
            'isActive'     => true,
        ]);

        $this->actingAs($this->admin)
            ->get("/performance/individu/{$target->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Performance/IndividuDetailView')
                ->where('karyawan.nama', 'Target Pegawai')
                ->where('karyawan.jabatan', 'Kepala Divisi Uji'));
    }

    public function test_me_redirects_to_own_detail(): void
    {
        $this->actingAs($this->admin)
            ->get('/performance/me')
            ->assertRedirect("/performance/individu/{$this->admin->id}");
    }
}
