<?php

namespace Tests\Feature;

use App\Auth\ScopeResolver;
use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PermissionScopeTest extends TestCase
{
    use RefreshDatabase;

    private ScopeResolver $resolver;
    private Directorate $dir;
    private OrganizationalUnit $divisi;
    private OrganizationalUnit $subdiv;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = app(ScopeResolver::class);

        $this->dir = Directorate::create(['code' => 'DIR-A', 'name' => 'Direktorat A', 'description' => null]);

        $this->divisi = OrganizationalUnit::create([
            'code' => 'DIV-A', 'name' => 'Divisi A', 'unitType' => 'DIVISI',
            'directorateId' => $this->dir->id, 'parentId' => null,
        ]);

        $this->subdiv = OrganizationalUnit::create([
            'code' => 'SUB-A1', 'name' => 'Subdiv A1', 'unitType' => 'SUBDIVISI',
            'directorateId' => $this->dir->id, 'parentId' => $this->divisi->id,
        ]);
    }

    // ── SUPERADMIN / ADMIN ─────────────────────────────────────────────────

    public function test_superadmin_scope_is_unrestricted(): void
    {
        $user = $this->makeUser('superadmin@ptpn.test', 'SUPERADMIN', $this->divisi->id);
        $scope = $this->resolver->resolveUserScope($user);

        $this->assertTrue($scope->allowsAllUsers());
        $this->assertNull($scope->userIds);
        $this->assertNull($scope->unitIds);
    }

    public function test_admin_scope_is_unrestricted(): void
    {
        $user = $this->makeUser('admin@ptpn.test', 'ADMIN', $this->divisi->id);
        $scope = $this->resolver->resolveUserScope($user);

        $this->assertTrue($scope->allowsAllUsers());
    }

    // ── KADIV ──────────────────────────────────────────────────────────────

    public function test_kadiv_scope_includes_own_unit_and_children(): void
    {
        $kadiv = $this->makeUser('kadiv@ptpn.test', 'KADIV', $this->divisi->id);
        $asisten = $this->makeUser('asisten@ptpn.test', 'ASISTEN', $this->subdiv->id);

        $scope = $this->resolver->resolveUserScope($kadiv);

        $this->assertFalse($scope->allowsAllUsers());
        $this->assertContains($this->divisi->id, $scope->unitIds);
        $this->assertContains($this->subdiv->id, $scope->unitIds);
        $this->assertContains($asisten->id, $scope->userIds);
        $this->assertContains($kadiv->id, $scope->userIds);
    }

    public function test_kadiv_scope_excludes_other_directorate_units(): void
    {
        $otherDir = Directorate::create(['code' => 'DIR-B', 'name' => 'Direktorat B', 'description' => null]);
        $otherUnit = OrganizationalUnit::create([
            'code' => 'DIV-B', 'name' => 'Divisi B', 'unitType' => 'DIVISI',
            'directorateId' => $otherDir->id, 'parentId' => null,
        ]);
        $outsider = $this->makeUser('outsider@ptpn.test', 'ASISTEN', $otherUnit->id);

        $kadiv = $this->makeUser('kadiv@ptpn.test', 'KADIV', $this->divisi->id);
        $scope = $this->resolver->resolveUserScope($kadiv);

        $this->assertNotContains($outsider->id, $scope->userIds);
    }

    // ── ASISTEN ────────────────────────────────────────────────────────────

    public function test_asisten_scope_includes_self_and_direct_reports(): void
    {
        $asisten = $this->makeUser('asisten@ptpn.test', 'ASISTEN', $this->subdiv->id);
        $officer1 = $this->makeUser('officer1@ptpn.test', 'OFFICER', $this->subdiv->id, managerId: $asisten->id);
        $officer2 = $this->makeUser('officer2@ptpn.test', 'OFFICER', $this->subdiv->id, managerId: $asisten->id);

        $scope = $this->resolver->resolveUserScope($asisten);

        $this->assertContains($asisten->id, $scope->userIds);
        $this->assertContains($officer1->id, $scope->userIds);
        $this->assertContains($officer2->id, $scope->userIds);
        $this->assertCount(3, $scope->userIds);
    }

    public function test_asisten_scope_excludes_peers_without_report_relation(): void
    {
        $asisten = $this->makeUser('asisten@ptpn.test', 'ASISTEN', $this->subdiv->id);
        $peer = $this->makeUser('peer@ptpn.test', 'ASISTEN', $this->subdiv->id);

        $scope = $this->resolver->resolveUserScope($asisten);

        $this->assertNotContains($peer->id, $scope->userIds);
    }

    // ── BOD ────────────────────────────────────────────────────────────────

    public function test_bod_scope_covers_own_directorate(): void
    {
        $bod = $this->makeUser('bod@ptpn.test', 'BOD', $this->divisi->id);
        $bod->directorateId = $this->dir->id;
        $bod->save();

        $worker = $this->makeUser('worker@ptpn.test', 'ASISTEN', $this->subdiv->id);

        $scope = $this->resolver->resolveUserScope($bod);

        $this->assertContains($worker->id, $scope->userIds);
    }

    // ── BFS depth ─────────────────────────────────────────────────────────

    public function test_kadiv_bfs_resolves_up_to_4_levels(): void
    {
        // Buat 4 level nested units
        $level2 = OrganizationalUnit::create([
            'code' => 'LVL2', 'name' => 'Level 2', 'unitType' => 'SUBDIVISI',
            'directorateId' => $this->dir->id, 'parentId' => $this->divisi->id,
        ]);
        $level3 = OrganizationalUnit::create([
            'code' => 'LVL3', 'name' => 'Level 3', 'unitType' => 'SEKSI',
            'directorateId' => $this->dir->id, 'parentId' => $level2->id,
        ]);
        $level4 = OrganizationalUnit::create([
            'code' => 'LVL4', 'name' => 'Level 4', 'unitType' => 'TIM',
            'directorateId' => $this->dir->id, 'parentId' => $level3->id,
        ]);

        $deepWorker = $this->makeUser('deep@ptpn.test', 'OFFICER', $level4->id);
        $kadiv = $this->makeUser('kadiv@ptpn.test', 'KADIV', $this->divisi->id);

        $scope = $this->resolver->resolveUserScope($kadiv);

        $this->assertContains($level4->id, $scope->unitIds);
        $this->assertContains($deepWorker->id, $scope->userIds);
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private function makeUser(string $email, string $role, int $unitId, ?int $managerId = null): User
    {
        return User::create([
            'name'          => $email,
            'email'         => $email,
            'passwordHash'  => Hash::make('password'),
            'roleType'      => $role,
            'isActive'      => true,
            'unitId'        => $unitId,
            'directorateId' => $this->dir->id,
            'managerUserId' => $managerId,
        ]);
    }
}
