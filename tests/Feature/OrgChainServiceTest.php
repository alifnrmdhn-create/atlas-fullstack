<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use App\Services\OrgChainService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Test untuk OrgChainService — fondasi Sprint 0 Track A.
 *
 * Menguji resolusi rantai atasan untuk Clear the Path (Sprint 4).
 * Hierarki test: officer → asisten → kadiv → bod (di direktorat A)
 *                officer_b di direktorat B (untuk cross-direktorat)
 */
class OrgChainServiceTest extends TestCase
{
    use RefreshDatabase;

    private OrgChainService $svc;

    private User $bod;
    private User $kadiv;
    private User $asisten;
    private User $officer;
    private User $officerCrossDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = app(OrgChainService::class);

        $dirA = Directorate::create(['code' => 'DKM', 'name' => 'Direktorat Keuangan & MR', 'description' => null]);
        $dirB = Directorate::create(['code' => 'DBS', 'name' => 'Direktorat Bisnis', 'description' => null]);

        $unitA = OrganizationalUnit::create([
            'code' => 'DKSA', 'name' => 'Divisi Keuangan Strategis & Anggaran', 'unitType' => 'DIVISI',
            'directorateId' => $dirA->id, 'parentId' => null,
        ]);
        $unitB = OrganizationalUnit::create([
            'code' => 'DPPN', 'name' => 'Divisi Pemasaran', 'unitType' => 'DIVISI',
            'directorateId' => $dirB->id, 'parentId' => null,
        ]);

        // Direktorat A chain
        $this->bod     = $this->makeUser('bod@ptpn.test',     'BOD',     $unitA->id, $dirA->id, null);
        $this->kadiv   = $this->makeUser('kadiv@ptpn.test',   'KADIV',   $unitA->id, $dirA->id, $this->bod->id);
        $this->asisten = $this->makeUser('asisten@ptpn.test', 'ASISTEN', $unitA->id, $dirA->id, $this->kadiv->id);
        $this->officer = $this->makeUser('officer@ptpn.test', 'OFFICER', $unitA->id, $dirA->id, $this->asisten->id);

        // Direktorat B
        $this->officerCrossDir = $this->makeUser('officer_b@ptpn.test', 'OFFICER', $unitB->id, $dirB->id, null);
    }

    // ── getDirectSupervisor ────────────────────────────────────────────────────

    public function test_direct_supervisor_returns_manager(): void
    {
        $supervisor = $this->svc->getDirectSupervisor($this->officer);
        $this->assertNotNull($supervisor);
        $this->assertEquals($this->asisten->id, $supervisor->id);
    }

    public function test_bod_has_no_supervisor(): void
    {
        $supervisor = $this->svc->getDirectSupervisor($this->bod);
        $this->assertNull($supervisor);
    }

    public function test_inactive_supervisor_climbs_up(): void
    {
        // Asisten dinonaktifkan — officer harusnya naik ke kadiv
        $this->asisten->update(['isActive' => false]);

        $supervisor = $this->svc->getDirectSupervisor($this->officer->fresh());
        $this->assertNotNull($supervisor);
        $this->assertEquals($this->kadiv->id, $supervisor->id);
    }

    // ── getEscalationChain ─────────────────────────────────────────────────────

    public function test_escalation_chain_default_3_levels(): void
    {
        $chain = $this->svc->getEscalationChain($this->officer);

        $this->assertCount(3, $chain);
        $this->assertEquals($this->asisten->id, $chain[0]->id);
        $this->assertEquals($this->kadiv->id, $chain[1]->id);
        $this->assertEquals($this->bod->id, $chain[2]->id);
    }

    public function test_escalation_chain_respects_max_levels(): void
    {
        $chain = $this->svc->getEscalationChain($this->officer, maxLevels: 1);
        $this->assertCount(1, $chain);
        $this->assertEquals($this->asisten->id, $chain[0]->id);
    }

    public function test_escalation_chain_stops_at_top(): void
    {
        $chain = $this->svc->getEscalationChain($this->kadiv, maxLevels: 5);
        // kadiv → bod (mentok)
        $this->assertCount(1, $chain);
        $this->assertEquals($this->bod->id, $chain[0]->id);
    }

    public function test_bod_has_empty_chain(): void
    {
        $chain = $this->svc->getEscalationChain($this->bod);
        $this->assertCount(0, $chain);
    }

    // ── canEscalateAcrossDirectorate ───────────────────────────────────────────

    public function test_same_directorate_allowed(): void
    {
        $this->assertTrue(
            $this->svc->canEscalateAcrossDirectorate($this->officer, $this->kadiv)
        );
    }

    public function test_cross_directorate_blocked_by_default(): void
    {
        // officer (dirA) escalate ke kadiv yang ada di dirB — harus block
        $kadivB = $this->makeUser('kadiv_b@ptpn.test', 'KADIV',
            $this->officerCrossDir->unitId, $this->officerCrossDir->directorateId);

        $this->assertFalse(
            $this->svc->canEscalateAcrossDirectorate($this->officer, $kadivB)
        );
    }

    public function test_cross_directorate_to_bod_allowed(): void
    {
        // Officer (dirA) escalate ke BOD — diizinkan walau dianggap "cross"
        $this->assertTrue(
            $this->svc->canEscalateAcrossDirectorate($this->officerCrossDir, $this->bod)
        );
    }

    public function test_bod_can_escalate_anywhere(): void
    {
        $this->assertTrue(
            $this->svc->canEscalateAcrossDirectorate($this->bod, $this->kadiv)
        );
    }

    // ── resolveDefaultEscalationTarget ─────────────────────────────────────────

    public function test_resolve_default_target_returns_supervisor(): void
    {
        $target = $this->svc->resolveDefaultEscalationTarget($this->officer);
        $this->assertNotNull($target);
        $this->assertEquals($this->asisten->id, $target->id);
    }

    public function test_resolve_default_target_null_for_bod(): void
    {
        $target = $this->svc->resolveDefaultEscalationTarget($this->bod);
        $this->assertNull($target);
    }

    // ── getDirectReports ───────────────────────────────────────────────────────

    public function test_direct_reports_returns_subordinates(): void
    {
        $reports = $this->svc->getDirectReports($this->kadiv);
        $this->assertCount(1, $reports);
        $this->assertEquals($this->asisten->id, $reports[0]->id);
    }

    public function test_direct_reports_excludes_inactive(): void
    {
        $this->asisten->update(['isActive' => false]);
        $reports = $this->svc->getDirectReports($this->kadiv);
        $this->assertCount(0, $reports);
    }

    // ── isSupervisorOf ─────────────────────────────────────────────────────────

    public function test_is_supervisor_direct(): void
    {
        $this->assertTrue($this->svc->isSupervisorOf($this->asisten, $this->officer));
    }

    public function test_is_supervisor_indirect(): void
    {
        $this->assertTrue($this->svc->isSupervisorOf($this->bod, $this->officer));
    }

    public function test_is_not_supervisor_when_unrelated(): void
    {
        $this->assertFalse($this->svc->isSupervisorOf($this->officerCrossDir, $this->officer));
    }

    public function test_is_not_supervisor_of_self(): void
    {
        $this->assertFalse($this->svc->isSupervisorOf($this->officer, $this->officer));
    }

    // ── helpers ─────────────────────────────────────────────────────────────────

    private function makeUser(
        string $email,
        string $role,
        int $unitId,
        int $directorateId,
        ?int $managerId = null,
    ): User {
        return User::create([
            'name'          => $email,
            'email'         => $email,
            'passwordHash'  => Hash::make('password'),
            'roleType'      => $role,
            'isActive'      => true,
            'unitId'        => $unitId,
            'directorateId' => $directorateId,
            'managerUserId' => $managerId,
        ]);
    }
}
