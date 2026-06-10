<?php

namespace Tests\Feature;

use App\Models\MonthlyReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci celah otorisasi MonthlyReport (audit 2026-06-10):
 *   - update/upload/submit dulu hanya cek status DRAFT, TANPA cek unit —
 *     user terotentikasi mana pun bisa mengedit draft divisi lain, menimpa
 *     seluruh metrics-nya via upload Excel, dan men-submit laporan unit lain.
 *   - approve dulu hanya cek roleType+status, TANPA scope — KASUBDIV/KADIV
 *     mana pun bisa approve/reject laporan lintas unit & direktorat
 *     (inkonsisten dgn RiskReportController::approve yang sudah ber-OrgScope).
 *
 * Pola positive-control (mirror CrossDirectorateAuthzTest): aksi lintas unit
 * diblok, aksi di unit sendiri tetap jalan — test tidak bisa pass vacuously.
 * Untuk submit/upload positive-control dipakai 422 validasi bisnis (belum ada
 * metrics / file) sebagai bukti request sudah melewati gate 403.
 */
class MonthlyReportAuthzTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $officerA;
    private User $officerB;
    private User $kasubdivA;
    private User $kasubdivB;
    private User $kadivA;
    private User $kadivB;
    private int $draftA;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $this->officerA  = $this->makeUser('officer-a', 'OFFICER', $unitA->id, $dirA->id);
        $this->kasubdivA = $this->makeUser('kasubdiv-a', 'KASUBDIV', $unitA->id, $dirA->id);
        $this->kadivA    = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->officerB  = $this->makeUser('officer-b', 'OFFICER', $unitB->id, $dirB->id);
        $this->kasubdivB = $this->makeUser('kasubdiv-b', 'KASUBDIV', $unitB->id, $dirB->id);
        $this->kadivB    = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);

        // Draft milik unit A — dibuat via HTTP supaya unitId di-force dari user
        // (store memaksa unitId = $user->unitId, jalur yang sudah benar).
        $this->draftA = $this->actingAs($this->officerA)
            ->postJson('/monthly-reports', [
                'month' => 5,
                'year' => 2030,
                'narrativeSummary' => 'Narasi awal unit A.',
            ])
            ->assertCreated()
            ->json('data.id');
    }

    // ── update ────────────────────────────────────────────────────────────────

    public function test_update_blocks_cross_unit(): void
    {
        $this->actingAs($this->officerB)
            ->putJson("/monthly-reports/{$this->draftA}", ['narrativeSummary' => 'Hijacked'])
            ->assertForbidden();

        $this->assertSame(
            'Narasi awal unit A.',
            MonthlyReport::findOrFail($this->draftA)->narrativeSummary,
        );

        $this->actingAs($this->officerA)
            ->putJson("/monthly-reports/{$this->draftA}", ['narrativeSummary' => 'Revisi sah'])
            ->assertOk()
            ->assertJsonPath('data.narrativeSummary', 'Revisi sah');
    }

    // ── upload ────────────────────────────────────────────────────────────────

    public function test_upload_blocks_cross_unit_before_validation(): void
    {
        // Tanpa file: lintas unit harus mentok di gate 403 (bukan 422 validasi).
        $this->actingAs($this->officerB)
            ->postJson("/monthly-reports/{$this->draftA}/upload")
            ->assertForbidden();

        // Unit sendiri tanpa file → lolos gate, mentok validasi file = 422.
        $this->actingAs($this->officerA)
            ->postJson("/monthly-reports/{$this->draftA}/upload")
            ->assertUnprocessable();
    }

    // ── submit ────────────────────────────────────────────────────────────────

    public function test_submit_blocks_cross_unit(): void
    {
        $this->actingAs($this->officerB)
            ->postJson("/monthly-reports/{$this->draftA}/submit")
            ->assertForbidden();

        $this->assertSame('DRAFT', MonthlyReport::findOrFail($this->draftA)->status);

        // Unit sendiri (belum ada metrics) → lolos gate, mentok aturan bisnis 422.
        $this->actingAs($this->officerA)
            ->postJson("/monthly-reports/{$this->draftA}/submit")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Upload the Excel data before submitting.');
    }

    // ── approve: tahap KASUBDIV (SUBMITTED → REVIEWED) ───────────────────────

    public function test_kasubdiv_approve_blocks_cross_unit(): void
    {
        MonthlyReport::whereKey($this->draftA)->update(['status' => 'SUBMITTED']);

        $this->actingAs($this->kasubdivB)
            ->postJson("/monthly-reports/{$this->draftA}/approve", ['action' => 'APPROVED'])
            ->assertUnprocessable();

        $this->assertSame('SUBMITTED', MonthlyReport::findOrFail($this->draftA)->status);

        $this->actingAs($this->kasubdivA)
            ->postJson("/monthly-reports/{$this->draftA}/approve", ['action' => 'APPROVED'])
            ->assertOk()
            ->assertJsonPath('data.status', 'REVIEWED');
    }

    // ── approve: tahap KADIV (REVIEWED → APPROVED) ───────────────────────────

    public function test_kadiv_approve_blocks_cross_directorate(): void
    {
        MonthlyReport::whereKey($this->draftA)->update(['status' => 'REVIEWED']);

        $this->actingAs($this->kadivB)
            ->postJson("/monthly-reports/{$this->draftA}/approve", ['action' => 'REJECTED'])
            ->assertUnprocessable();

        $this->assertSame('REVIEWED', MonthlyReport::findOrFail($this->draftA)->status);

        $this->actingAs($this->kadivA)
            ->postJson("/monthly-reports/{$this->draftA}/approve", ['action' => 'APPROVED'])
            ->assertOk()
            ->assertJsonPath('data.status', 'APPROVED');
    }

}
