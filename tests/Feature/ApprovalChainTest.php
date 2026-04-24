<?php

namespace Tests\Feature;

use App\Models\Assignment;
use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use App\Services\ApprovalChainService;
use App\Services\AssignmentAuthService;
use App\Services\AssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ApprovalChainTest extends TestCase
{
    use RefreshDatabase;

    private AssignmentService $svc;
    private ApprovalChainService $chainSvc;

    // Hierarki: officer → asisten → kadiv (assigner)
    private User $kadiv;
    private User $asisten;
    private User $officer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc      = app(AssignmentService::class);
        $this->chainSvc = app(ApprovalChainService::class);

        $dir  = Directorate::create(['code' => 'DIR', 'name' => 'Dir', 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => 'UNIT', 'name' => 'Unit', 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);

        $this->kadiv = $this->makeUser('kadiv@ptpn.test', 'KADIV', $unit->id);
        $this->asisten = $this->makeUser('asisten@ptpn.test', 'ASISTEN', $unit->id, managerId: $this->kadiv->id);
        $this->officer = $this->makeUser('officer@ptpn.test', 'OFFICER', $unit->id, managerId: $this->asisten->id);
    }

    // ── Chain resolve ──────────────────────────────────────────────────────

    public function test_chain_walks_hierarchy_to_assigner(): void
    {
        // kadiv menugaskan ke officer: chain = [asisten, kadiv]
        $chain = $this->chainSvc->resolve($this->officer->id, $this->kadiv->id);

        $this->assertCount(2, $chain);
        $this->assertEquals($this->asisten->id, $chain[0]['userId']);
        $this->assertEquals($this->kadiv->id, $chain[1]['userId']);
        $this->assertEquals(0, $chain[0]['order']);
        $this->assertEquals(1, $chain[1]['order']);
    }

    public function test_self_assign_chain_is_empty(): void
    {
        $chain = $this->chainSvc->resolve($this->kadiv->id, $this->kadiv->id);
        $this->assertEmpty($chain);
    }

    // ── Full state machine flow ────────────────────────────────────────────

    public function test_full_approval_flow_ditugaskan_to_selesai(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);
        $this->assertEquals('DITUGASKAN', $a->status);

        // ACK oleh officer (PIC)
        $a = $this->svc->transition($this->officer, $a->id, 'ACKNOWLEDGE');
        $this->assertEquals('DIKERJAKAN', $a->status);
        $this->assertNotNull($a->acknowledgedAt);

        // SUBMIT oleh officer
        $a = $this->svc->transition($this->officer, $a->id, 'SUBMIT');
        $this->assertEquals('IN_REVIEW', $a->status);
        $this->assertEquals(0, $a->currentReviewerIdx);

        // Reviewer pertama (asisten) APPROVE
        $a = $this->svc->transition($this->asisten, $a->id, 'APPROVE');
        $this->assertEquals('IN_REVIEW', $a->status);
        $this->assertEquals(1, $a->currentReviewerIdx);

        // Reviewer kedua (kadiv) APPROVE → SELESAI
        $a = $this->svc->transition($this->kadiv, $a->id, 'APPROVE');
        $this->assertEquals('SELESAI', $a->status);
        $this->assertNotNull($a->completedAt);
    }

    public function test_return_sends_back_to_dikerjakan(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);
        $a = $this->svc->transition($this->officer, $a->id, 'ACKNOWLEDGE');
        $a = $this->svc->transition($this->officer, $a->id, 'SUBMIT');

        // Asisten (reviewer 0) return
        $a = $this->svc->transition($this->asisten, $a->id, 'RETURN', 'Perlu perbaikan');
        $this->assertEquals('DIKERJAKAN', $a->status);
        $this->assertEquals(1, $a->revisionCount);
        $this->assertNull($a->currentReviewerIdx);
    }

    public function test_reject_marks_assignment_as_rejected(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);
        $a = $this->svc->transition($this->officer, $a->id, 'ACKNOWLEDGE');
        $a = $this->svc->transition($this->officer, $a->id, 'SUBMIT');

        $a = $this->svc->transition($this->asisten, $a->id, 'REJECT', 'Tidak sesuai standar');
        $this->assertEquals('REJECTED', $a->status);
        $this->assertEquals('Tidak sesuai standar', $a->rejectionReason);
    }

    public function test_cancel_by_assigner_works_from_any_non_terminal(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);

        $a = $this->svc->transition($this->kadiv, $a->id, 'CANCEL', 'Tidak relevan lagi');
        $this->assertEquals('DIBATALKAN', $a->status);
        $this->assertNotNull($a->cancelledAt);
    }

    public function test_cancel_by_non_assigner_is_forbidden(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->svc->transition($this->officer, $a->id, 'CANCEL');
    }

    public function test_reopen_restores_terminal_to_dikerjakan(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);
        $a = $this->svc->transition($this->kadiv, $a->id, 'CANCEL', 'Sementara');

        $a = $this->svc->transition($this->kadiv, $a->id, 'REOPEN');
        $this->assertEquals('DIKERJAKAN', $a->status);
        $this->assertNull($a->cancelledAt);
        $this->assertNull($a->cancelReason);
    }

    public function test_self_assign_submit_goes_directly_to_selesai(): void
    {
        // Kadiv menugaskan ke diri sendiri
        $a = $this->createAssignment($this->kadiv, $this->kadiv);
        $a = $this->svc->transition($this->kadiv, $a->id, 'ACKNOWLEDGE');
        $a = $this->svc->transition($this->kadiv, $a->id, 'SUBMIT');

        $this->assertEquals('SELESAI', $a->status);
        $this->assertNotNull($a->completedAt);
    }

    public function test_wrong_reviewer_cannot_approve(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);
        $a = $this->svc->transition($this->officer, $a->id, 'ACKNOWLEDGE');
        $a = $this->svc->transition($this->officer, $a->id, 'SUBMIT');

        // Reviewer saat ini adalah asisten (order 0), bukan kadiv
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->svc->transition($this->kadiv, $a->id, 'APPROVE');
    }

    public function test_admin_can_override_any_transition(): void
    {
        $admin = $this->makeUser('admin@ptpn.test', 'ADMIN', $this->asisten->unitId);
        $a = $this->createAssignment($this->kadiv, $this->officer);
        $a = $this->svc->transition($this->officer, $a->id, 'ACKNOWLEDGE');
        $a = $this->svc->transition($this->officer, $a->id, 'SUBMIT');

        // Admin bukan reviewer manapun, tapi tetap bisa APPROVE
        $a = $this->svc->transition($admin, $a->id, 'APPROVE');
        // Maju ke reviewer berikutnya, belum SELESAI
        $this->assertNotEquals('REJECTED', $a->status);
    }

    // ── HTTP endpoint smoke tests ─────────────────────────────────────────

    public function test_post_assignment_redirects_to_detail_page(): void
    {
        $response = $this->actingAs($this->kadiv)
            ->post('/assignments', [
                'title'            => 'Test Penugasan',
                'assigneeId'       => $this->officer->id,
                'priority'         => 'HIGH',
                'dueDate'          => now()->addDays(7)->toDateString(),
                'evidenceRequired' => false,
            ]);

        // Inertia controller: store() redirect ke assignments.show
        $response->assertRedirect();
        $this->assertDatabaseHas('Assignment', [
            'title'      => 'Test Penugasan',
            'assignerId' => $this->kadiv->id,
            'assigneeId' => $this->officer->id,
            'status'     => 'DITUGASKAN',
        ]);
    }

    public function test_transition_endpoint_redirects_with_success(): void
    {
        $a = $this->createAssignment($this->kadiv, $this->officer);

        $response = $this->actingAs($this->officer)
            ->post("/assignments/{$a->id}/transition", ['action' => 'ACKNOWLEDGE']);

        // back()->with('success', ...) → redirect dengan flash
        $response->assertRedirect();
        $this->assertDatabaseHas('Assignment', [
            'id'     => $a->id,
            'status' => 'DIKERJAKAN',
        ]);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private function makeUser(string $email, string $role, int $unitId, ?int $managerId = null): User
    {
        $dir = Directorate::first();
        return User::create([
            'name'          => $email,
            'email'         => $email,
            'passwordHash'  => Hash::make('password'),
            'roleType'      => $role,
            'isActive'      => true,
            'unitId'        => $unitId,
            'directorateId' => $dir->id,
            'managerUserId' => $managerId,
        ]);
    }

    private function createAssignment(User $assigner, User $assignee): Assignment
    {
        return $this->svc->create($assigner, [
            'title'           => 'Penugasan Test',
            'assigneeId'      => $assignee->id,
            'priority'        => 'MEDIUM',
            'evidenceRequired' => false,
        ]);
    }
}
