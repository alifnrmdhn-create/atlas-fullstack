<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\EscalationRequest;
use App\Models\Notification;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Sprint 4 Hardening — E2E test critical Clear the Path flow.
 *
 * Hierarki test (di direktorat DKM untuk pilot):
 *   bod → kadiv → asisten → officer
 *
 * Plus 1 user di direktorat lain untuk cross-direktorat policy test.
 */
class EscalationFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $bod;
    private User $kadiv;
    private User $asisten;
    private User $officer;
    private User $officerCrossDir;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('features.clear-the-path', 'enabled'); // global enable utk test

        $dirDKM = Directorate::create(['code' => 'DKM', 'name' => 'Direktorat Keuangan & MR', 'description' => null]);
        $dirDBS = Directorate::create(['code' => 'DBS', 'name' => 'Direktorat Bisnis', 'description' => null]);

        $unitDKSA = OrganizationalUnit::create([
            'code' => 'DKSA', 'name' => 'Divisi Keuangan Strategis & Anggaran',
            'unitType' => 'DIVISI', 'directorateId' => $dirDKM->id, 'parentId' => null,
        ]);
        $unitDPPN = OrganizationalUnit::create([
            'code' => 'DPPN', 'name' => 'Divisi Pemasaran',
            'unitType' => 'DIVISI', 'directorateId' => $dirDBS->id, 'parentId' => null,
        ]);

        $this->bod     = $this->makeUser('bod@ptpn.test', 'BOD',     $unitDKSA->id, $dirDKM->id);
        $this->kadiv   = $this->makeUser('kadiv@ptpn.test', 'KADIV',   $unitDKSA->id, $dirDKM->id, $this->bod->id);
        $this->asisten = $this->makeUser('asisten@ptpn.test', 'ASISTEN', $unitDKSA->id, $dirDKM->id, $this->kadiv->id);
        $this->officer = $this->makeUser('officer@ptpn.test', 'OFFICER', $unitDKSA->id, $dirDKM->id, $this->asisten->id);
        $this->officerCrossDir = $this->makeUser('officer_b@ptpn.test', 'OFFICER', $unitDPPN->id, $dirDBS->id, null);
    }

    // ── Happy path ─────────────────────────────────────────────────────────────

    public function test_full_escalation_flow_create_to_resolve(): void
    {
        // 1. Officer create escalation
        $createResp = $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Butuh dukungan untuk integrasi vendor',
            'description' => 'Vendor X tidak respons sudah 3 minggu',
        ]);
        $createResp->assertStatus(201);
        $req = EscalationRequest::first();
        $this->assertNotNull($req);
        $this->assertEquals($this->asisten->id, $req->escalatedToId, 'Auto-routed ke atasan langsung (asisten)');
        $this->assertEquals('REQUESTED', $req->status);
        $this->assertNotEmpty($req->code);

        // Verifikasi notif dikirim
        $notif = Notification::where('userId', $this->asisten->id)
            ->where('type', 'CLEAR_PATH_REQUESTED')->first();
        $this->assertNotNull($notif, 'Atasan dapat notif CLEAR_PATH_REQUESTED');

        // 2. Asisten lihat di incoming
        $this->actingAs($this->asisten)
            ->getJson('/escalations?filter=incoming')
            ->assertOk()
            ->assertJsonPath('data.0.id', $req->id);

        // 3. Asisten commit dengan due date
        $commitResp = $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/commit", [
            'commitmentDueDate' => now()->addDays(3)->toDateString(),
            'commitmentNote' => 'Saya akan kontak vendor langsung.',
        ]);
        $commitResp->assertOk();
        // Respons aksi WAJIB membawa relasi arah (from→to) dgn key camelCase — panel FE
        // menampilkan "requester → escalatedTo". Tanpa eager-load nama jatuh ke "—";
        // tanpa $snakeAttributes=false key jadi `escalated_to` → FE undefined.
        $commitResp->assertJsonPath('data.requester.name', $this->officer->name);
        $commitResp->assertJsonPath('data.escalatedTo.name', $this->asisten->name);
        $req->refresh();
        $this->assertEquals('COMMITTED', $req->status);
        $this->assertNotNull($req->committedAt);
        $this->assertNotNull($req->commitmentDueDate);

        // Requester dapat notif COMMITTED
        $commitNotif = Notification::where('userId', $this->officer->id)
            ->where('type', 'CLEAR_PATH_COMMITTED')->first();
        $this->assertNotNull($commitNotif);

        // 4. Asisten resolve
        $resolveResp = $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/resolve", [
            'resolutionNote' => 'Vendor sudah respons dan onboarding scheduled.',
        ]);
        $resolveResp->assertOk();
        $req->refresh();
        $this->assertEquals('CLEARED', $req->status);
        $this->assertNotNull($req->resolvedAt);
        $this->assertEquals('Vendor sudah respons dan onboarding scheduled.', $req->resolutionNote);
    }

    // ── Decline flow ───────────────────────────────────────────────────────────

    public function test_decline_requires_reason(): void
    {
        $req = $this->createEscalation($this->officer, $this->asisten);
        // Decline tanpa alasan → 422
        $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/decline", [])
            ->assertStatus(422);
        // Decline dengan alasan → OK
        $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/decline", [
            'declinedReason' => 'Tidak relevan untuk diskusi level ini.',
        ])->assertOk();
        $req->refresh();
        $this->assertEquals('DECLINED', $req->status);
    }

    // ── Reroute flow + cross-direktorat policy (Bug #2 fix verification) ──────

    public function test_reroute_within_directorate_allowed(): void
    {
        $req = $this->createEscalation($this->officer, $this->asisten);
        // Asisten reroute ke kadiv (still DKM)
        $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/reroute", [
            'reroutedToId' => $this->kadiv->id,
        ])->assertOk();
        $req->refresh();
        $this->assertEquals('REROUTED', $req->status);
        $this->assertEquals($this->kadiv->id, $req->reroutedToId);

        // Verifikasi escalation baru dibuat ke kadiv
        $newReq = EscalationRequest::where('escalatedToId', $this->kadiv->id)->first();
        $this->assertNotNull($newReq);
        $this->assertEquals('REQUESTED', $newReq->status);
    }

    public function test_reroute_cross_directorate_blocked(): void
    {
        $req = $this->createEscalation($this->officer, $this->asisten);
        // Asisten reroute ke officer di DBS — blocked karena requester (officer DKM)
        // tidak bisa cross-direktorat ke DBS user
        $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/reroute", [
            'reroutedToId' => $this->officerCrossDir->id,
        ])->assertStatus(422);
    }

    // ── Per-jenjang: tak boleh lompat / menyamping ────────────────────────────

    public function test_explicit_target_cannot_skip_levels(): void
    {
        // Sibling asisten (peer atasan langsung officer) — se-direktorat tapi BUKAN
        // di rantai ke atas officer. Override target ke sini = lompat jenjang → 422.
        $sibling = $this->makeUser('sibling@ptpn.test', 'ASISTEN',
            $this->asisten->unitId, $this->asisten->directorateId, $this->kadiv->id);

        $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType'    => 'AD_HOC',
            'title'         => 'Coba lompat jenjang',
            'escalatedToId' => $sibling->id,
        ])->assertStatus(422);

        $this->assertDatabaseMissing('EscalationRequest', ['escalatedToId' => $sibling->id]);
    }

    public function test_reroute_cannot_go_sideways(): void
    {
        // Reroute ke peer (bukan naik rantai requester) → blocked.
        $sibling = $this->makeUser('sibling2@ptpn.test', 'ASISTEN',
            $this->asisten->unitId, $this->asisten->directorateId, $this->kadiv->id);
        $req = $this->createEscalation($this->officer, $this->asisten);

        $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/reroute", [
            'reroutedToId' => $sibling->id,
        ])->assertStatus(422);

        $req->refresh();
        $this->assertNotEquals('REROUTED', $req->status);
    }

    // ── Cross-direktorat policy ───────────────────────────────────────────────

    public function test_cross_directorate_create_blocked(): void
    {
        // Officer DKM coba escalate explicit ke kadiv DBS — blocked
        $kadivDBS = $this->makeUser('kadiv_dbs@ptpn.test', 'KADIV',
            $this->officerCrossDir->unitId, $this->officerCrossDir->directorateId);
        $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Test cross direktorat',
            'escalatedToId' => $kadivDBS->id,
        ])->assertStatus(422);
    }

    public function test_escalate_to_bod_always_allowed(): void
    {
        // Officer DKM escalate explicit ke BOD (different direktorat scenario tetap OK)
        $resp = $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Eskalasi ke board',
            'escalatedToId' => $this->bod->id,
        ]);
        $resp->assertStatus(201);
    }

    // ── Permission gates ─────────────────────────────────────────────────────

    public function test_only_target_can_disposition(): void
    {
        $req = $this->createEscalation($this->officer, $this->asisten);
        // Kadiv (bukan target) coba commit → 403
        $this->actingAs($this->kadiv)->postJson("/escalations/{$req->id}/commit", [])
            ->assertStatus(403);
    }

    public function test_cannot_escalate_to_self(): void
    {
        $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Self escalation',
            'escalatedToId' => $this->officer->id,
        ])->assertStatus(422);
    }

    public function test_bod_cannot_escalate_no_supervisor(): void
    {
        // BOD tidak punya managerUserId — auto-resolve gagal
        $this->actingAs($this->bod)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Test escalation BOD',
        ])->assertStatus(422);
    }

    // ── Feature flag gate ────────────────────────────────────────────────────

    public function test_feature_flag_disabled_blocks_endpoint(): void
    {
        Config::set('features.clear-the-path', 'disabled');
        $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Test disabled',
        ])->assertStatus(403);
    }

    public function test_feature_flag_dkm_scopes_correctly(): void
    {
        Config::set('features.clear-the-path', 'DKM');
        // Officer DKM bisa
        $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Test escalation pilot scope',
        ])->assertStatus(201);
        // Officer DBS tidak bisa (feature flag DKM scope)
        $this->actingAs($this->officerCrossDir)->postJson('/escalations', [
            'sourceType' => 'AD_HOC',
            'title' => 'Test escalation di luar pilot',
        ])->assertStatus(403);
    }

    // ── Validation ───────────────────────────────────────────────────────────

    public function test_non_adhoc_requires_sourceId(): void
    {
        $this->actingAs($this->officer)->postJson('/escalations', [
            'sourceType' => 'BLOCKER',
            'title' => 'Missing sourceId',
        ])->assertStatus(422);
    }

    public function test_terminal_status_blocks_disposition(): void
    {
        $req = $this->createEscalation($this->officer, $this->asisten);
        $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/decline", [
            'declinedReason' => 'Sudah selesai',
        ])->assertOk();
        // Decline lagi → blocked
        $this->actingAs($this->asisten)->postJson("/escalations/{$req->id}/decline", [
            'declinedReason' => 'Sudah dibahas tadi',
        ])->assertStatus(422);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function makeUser(string $email, string $role, int $unitId, int $directorateId, ?int $managerId = null): User
    {
        return User::create([
            'name' => $email, 'email' => $email,
            'passwordHash' => Hash::make('password'),
            'roleType' => $role, 'isActive' => true,
            'unitId' => $unitId, 'directorateId' => $directorateId,
            'managerUserId' => $managerId,
        ]);
    }

    private function createEscalation(User $requester, User $target): EscalationRequest
    {
        return EscalationRequest::create([
            'code' => EscalationRequest::generateCode(),
            'sourceType' => 'AD_HOC',
            'requestedById' => $requester->id,
            'escalatedToId' => $target->id,
            'title' => 'Test escalation',
            'status' => 'REQUESTED',
        ]);
    }
}
