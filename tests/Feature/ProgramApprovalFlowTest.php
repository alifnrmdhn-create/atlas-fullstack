<?php

namespace Tests\Feature;

use App\Models\Program;
use App\Models\ProgramApprovalLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * E2E hierarki approval Program — coverage yang sebelumnya NOL (audit
 * 2026-06-10: ApprovalChainTest ternyata menguji Assignment, bukan Program).
 *
 * Rantai reviewer di-resolve dari User.managerUserId (OrgChainService::
 * resolveSupervisorsByRole), BUKAN dari unit — test ini membangun dua
 * direktorat dengan chain ASISTEN→KASUBDIV→KADIV lengkap supaya:
 *   - tangga penuh DRAFT → PENDING_KASUB → PENDING_KADIV → ACTIVE terbukti
 *   - reviewer ber-role sama tapi BEDA chain ditolak (assertIsLegitimateReviewer)
 *   - reject → revisi (hanya owner boleh edit) → resubmit
 *   - edit terkunci saat PENDING; commitment change saat ACTIVE ter-log
 */
class ProgramApprovalFlowTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $asistenA;
    private User $kasubdivA;
    private User $kadivA;
    private User $kasubdivB;
    private User $kadivB;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        // Chain A: ASISTEN → KASUBDIV → KADIV (via managerUserId).
        $this->kadivA = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->kasubdivA = $this->makeUser('kasubdiv-a', 'KASUBDIV', $unitA->id, $dirA->id, $this->kadivA->id);
        $this->asistenA = $this->makeUser('asisten-a', 'ASISTEN', $unitA->id, $dirA->id, $this->kasubdivA->id);

        // Chain B: role sama, chain berbeda — untuk uji reviewer tidak sah.
        $this->kadivB = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);
        $this->kasubdivB = $this->makeUser('kasubdiv-b', 'KASUBDIV', $unitB->id, $dirB->id, $this->kadivB->id);
    }

    // ── Tangga penuh ──────────────────────────────────────────────────────────

    public function test_full_ladder_asisten_to_active(): void
    {
        $programId = $this->createProgramAs($this->asistenA);

        // Submit oleh ASISTEN → PENDING_KASUB + notifikasi ke KASUBDIV chain-nya.
        $this->actingAs($this->asistenA)->postJson("/programs/{$programId}/submit")->assertSuccessful();
        $this->assertSame('PENDING_KASUB', Program::find($programId)->approvalStatus);
        $this->assertDatabaseHas('Notification', [
            'userId' => $this->kasubdivA->id,
            'type' => 'PROGRAM_NEEDS_APPROVAL',
        ]);

        // KASUBDIV chain yang sah approve → PENDING_KADIV + notif lanjut ke KADIV.
        $this->actingAs($this->kasubdivA)->postJson("/programs/{$programId}/approve")->assertSuccessful();
        $this->assertSame('PENDING_KADIV', Program::find($programId)->approvalStatus);
        $this->assertDatabaseHas('Notification', [
            'userId' => $this->kadivA->id,
            'type' => 'PROGRAM_NEEDS_APPROVAL',
        ]);

        // KADIV chain yang sah approve → ACTIVE.
        $this->actingAs($this->kadivA)->postJson("/programs/{$programId}/approve")->assertSuccessful();
        $this->assertSame('ACTIVE', Program::find($programId)->approvalStatus);

        // Audit trail lengkap: SUBMITTED + APPROVED ×2.
        $actions = ProgramApprovalLog::where('programId', $programId)->pluck('action')->all();
        $this->assertContains('SUBMITTED', $actions);
        $this->assertSame(2, collect($actions)->filter(fn ($a) => $a === 'APPROVED')->count());
    }

    public function test_kasubdiv_submit_skips_to_pending_kadiv(): void
    {
        $programId = $this->createProgramAs($this->kasubdivA);

        $this->actingAs($this->kasubdivA)->postJson("/programs/{$programId}/submit")->assertSuccessful();
        $this->assertSame('PENDING_KADIV', Program::find($programId)->approvalStatus);
    }

    // ── Reviewer tidak sah (role benar, chain salah) ──────────────────────────

    public function test_same_role_outside_chain_cannot_approve(): void
    {
        $programId = $this->createProgramAs($this->asistenA);
        $this->actingAs($this->asistenA)->postJson("/programs/{$programId}/submit")->assertSuccessful();

        // KASUBDIV-B: role tepat, tapi bukan atasan submitter → 403.
        $this->actingAs($this->kasubdivB)->postJson("/programs/{$programId}/approve")->assertForbidden();
        $this->assertSame('PENDING_KASUB', Program::find($programId)->approvalStatus);

        // Naikkan ke PENDING_KADIV, lalu KADIV-B juga harus ditolak.
        $this->actingAs($this->kasubdivA)->postJson("/programs/{$programId}/approve")->assertSuccessful();
        $this->actingAs($this->kadivB)->postJson("/programs/{$programId}/approve")->assertForbidden();
        $this->assertSame('PENDING_KADIV', Program::find($programId)->approvalStatus);
    }

    // ── Reject → revisi → resubmit ────────────────────────────────────────────

    public function test_reject_revision_and_resubmit_cycle(): void
    {
        $programId = $this->createProgramAs($this->asistenA);
        $this->actingAs($this->asistenA)->postJson("/programs/{$programId}/submit")->assertSuccessful();

        // KASUBDIV sah me-reject (wajib ada note) → DRAFT + rejectionNote.
        $this->actingAs($this->kasubdivA)
            ->postJson("/programs/{$programId}/reject", ['note' => 'Target belum jelas, mohon revisi.'])
            ->assertSuccessful();
        $program = Program::find($programId);
        $this->assertSame('DRAFT', $program->approvalStatus);
        $this->assertSame('Target belum jelas, mohon revisi.', $program->rejectionNote);

        // Saat revisi: owner BOLEH edit; KADIV (bukan owner) TIDAK boleh —
        // step-back memaksa tanggung jawab kembali ke PIC.
        $this->actingAs($this->kadivA)
            ->putJson("/programs/{$programId}", ['name' => 'Diedit kadiv'])
            ->assertForbidden();
        $this->actingAs($this->asistenA)
            ->putJson("/programs/{$programId}", ['name' => 'Program A (revisi)'])
            ->assertSuccessful();

        // KADIV tidak boleh bypass lewat activate saat program baru direjeksi.
        $this->actingAs($this->kadivA)
            ->postJson("/programs/{$programId}/activate")
            ->assertStatus(422);

        // Resubmit oleh owner → kembali PENDING_KASUB, rejectionNote dibersihkan.
        $this->actingAs($this->asistenA)->postJson("/programs/{$programId}/submit")->assertSuccessful();
        $program = Program::find($programId);
        $this->assertSame('PENDING_KASUB', $program->approvalStatus);
        $this->assertNull($program->rejectionNote);
    }

    // ── Anti-deadlock: rantai reviewer putus ──────────────────────────────────

    public function test_submit_blocked_when_no_reviewer_in_chain(): void
    {
        // ASISTEN yatim: tanpa managerUserId → tak ada KASUBDIV di chain.
        // Tanpa guard, program masuk PENDING_KASUB yang tak bisa di-approve
        // siapa pun (nyangkut diam-diam) — kini ditolak di muka dengan 422.
        $orphan = $this->makeUser('asisten-yatim', 'ASISTEN', $this->asistenA->unitId, $this->asistenA->directorateId);
        $programId = $this->createProgramAs($orphan);

        $this->actingAs($orphan)->postJson("/programs/{$programId}/submit")->assertStatus(422);
        $this->assertSame('DRAFT', Program::find($programId)->approvalStatus);
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    public function test_owner_can_withdraw_pending_submission(): void
    {
        $programId = $this->createProgramAs($this->asistenA);
        $this->actingAs($this->asistenA)->postJson("/programs/{$programId}/submit")->assertSuccessful();

        // Orang lain (bahkan reviewer) tidak boleh withdraw.
        $this->actingAs($this->kasubdivA)->postJson("/programs/{$programId}/withdraw")->assertForbidden();

        $this->actingAs($this->asistenA)->postJson("/programs/{$programId}/withdraw")->assertSuccessful();
        $this->assertSame('DRAFT', Program::find($programId)->approvalStatus);
    }

    // ── Editing per-state ─────────────────────────────────────────────────────

    public function test_editing_locked_while_pending_open_when_active(): void
    {
        $programId = $this->createProgramAs($this->asistenA);

        // DRAFT: owner bebas edit.
        $this->actingAs($this->asistenA)
            ->putJson("/programs/{$programId}", ['description' => 'Deskripsi awal'])
            ->assertSuccessful();

        // PENDING: edit terkunci untuk non-admin (termasuk owner) → 422.
        $this->actingAs($this->asistenA)->postJson("/programs/{$programId}/submit")->assertSuccessful();
        $this->actingAs($this->asistenA)
            ->putJson("/programs/{$programId}", ['description' => 'Coba edit saat pending'])
            ->assertStatus(422);

        // Naikkan sampai ACTIVE.
        $this->actingAs($this->kasubdivA)->postJson("/programs/{$programId}/approve")->assertSuccessful();
        $this->actingAs($this->kadivA)->postJson("/programs/{$programId}/approve")->assertSuccessful();

        // ACTIVE: edit commitment field TIDAK diblok (governance Opsi A),
        // tapi tercatat di approval log + KADIV dinotifikasi.
        $newDate = now()->addMonths(3)->toDateString();
        $this->actingAs($this->asistenA)
            ->putJson("/programs/{$programId}", ['targetEndDate' => $newDate])
            ->assertSuccessful();

        $this->assertDatabaseHas('ProgramApprovalLog', [
            'programId' => $programId,
            'action' => 'COMMITMENT_CHANGED',
        ]);
        $this->assertDatabaseHas('Notification', [
            'userId' => $this->kadivA->id,
            'type' => 'PROGRAM_COMMITMENT_CHANGED',
        ]);
    }

    // ── helpers ───────────────────────────────────────────────────────────────
    private function createProgramAs(User $owner): int
    {
        return (int) $this->actingAs($owner)->postJson('/programs', [
            'name' => "Program {$owner->userId}",
            'description' => 'Program uji approval.',
            'priority' => 'HIGH',
            'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonths(2)->toDateString(),
            'ownerId' => $owner->id,
            'hasNoApmsKpi' => true,
        ])->assertCreated()->json('data.id');
    }
}
