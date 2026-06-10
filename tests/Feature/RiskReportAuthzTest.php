<?php

namespace Tests\Feature;

use App\Models\RiskMonthlyReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci celah authz jalur BACA + sisa jalur tulis RiskReport (audit
 * 2026-06-10). Fix Juni sebelumnya hanya menutup update/destroy/approve:
 *   - show/ytd: read IDOR — strategi/governance/loss events/KRI unit mana pun
 *     bisa dibaca via id, tanpa assertion apa pun.
 *   - index: list semua unit tanpa scoping.
 *   - store: unitId dipercaya dari body request — user mana pun bisa membuat
 *     laporan risiko atas nama unit lain.
 *   - submit: hanya cek status DRAFT — user mana pun bisa men-submit laporan
 *     unit lain (set submittedById dirinya).
 *
 * Semantik baca mirror MonthlyReportController::assertReportAccess (admin ke
 * atas / KADIV / unit sendiri) karena kedua modul dikonsumsi bersama oleh
 * halaman Monthly Report DIMR. Pola positive-control: blok lintas unit + tetap
 * jalan di unit sendiri.
 */
class RiskReportAuthzTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $officerA;
    private User $officerB;
    private User $kadivB;
    private int $reportA;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $this->officerA = $this->makeUser('officer-a', 'OFFICER', $unitA->id, $dirA->id);
        $this->officerB = $this->makeUser('officer-b', 'OFFICER', $unitB->id, $dirB->id);
        $this->kadivB   = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);

        // Laporan milik unit A — dibuat via HTTP oleh anggota unit A (jalur sah).
        $this->reportA = $this->actingAs($this->officerA)
            ->postJson('/risk-reports', ['month' => 5, 'year' => 2030, 'unitId' => $unitA->id])
            ->assertCreated()
            ->json('data.id');
    }

    // ── store: unitId dari body wajib dalam scope tulis ──────────────────────

    public function test_store_blocks_cross_unit_unit_id(): void
    {
        $unitA = User::findOrFail($this->officerA->id)->unitId;

        // Officer B mencoba membuat laporan atas nama unit A → 403.
        $this->actingAs($this->officerB)
            ->postJson('/risk-reports', ['month' => 6, 'year' => 2030, 'unitId' => $unitA])
            ->assertForbidden();

        // KADIV direktorat B pun tidak boleh lintas direktorat.
        $this->actingAs($this->kadivB)
            ->postJson('/risk-reports', ['month' => 6, 'year' => 2030, 'unitId' => $unitA])
            ->assertForbidden();

        // Unit sendiri tetap jalan (positive control).
        $this->actingAs($this->officerB)
            ->postJson('/risk-reports', ['month' => 6, 'year' => 2030, 'unitId' => $this->officerB->unitId])
            ->assertCreated();
    }

    // ── show / ytd: read IDOR ────────────────────────────────────────────────

    public function test_show_blocks_cross_unit_read(): void
    {
        $this->actingAs($this->officerB)
            ->getJson("/risk-reports/{$this->reportA}")
            ->assertForbidden();

        $this->actingAs($this->officerA)
            ->getJson("/risk-reports/{$this->reportA}")
            ->assertOk()
            ->assertJsonPath('data.id', $this->reportA);
    }

    public function test_ytd_blocks_cross_unit_read(): void
    {
        $this->actingAs($this->officerB)
            ->getJson("/risk-reports/{$this->reportA}/ytd")
            ->assertForbidden();

        $this->actingAs($this->officerA)
            ->getJson("/risk-reports/{$this->reportA}/ytd")
            ->assertOk();
    }

    // ── index: scoping list ──────────────────────────────────────────────────

    public function test_index_scopes_to_own_unit_for_non_kadiv(): void
    {
        $ids = $this->actingAs($this->officerB)
            ->getJson('/risk-reports')
            ->assertOk()
            ->json('data.*.id');

        $this->assertNotContains($this->reportA, $ids);

        $idsOwn = $this->actingAs($this->officerA)
            ->getJson('/risk-reports')
            ->assertOk()
            ->json('data.*.id');

        $this->assertContains($this->reportA, $idsOwn);
    }

    // ── submit ───────────────────────────────────────────────────────────────

    public function test_submit_blocks_cross_unit(): void
    {
        $this->actingAs($this->officerB)
            ->postJson("/risk-reports/{$this->reportA}/submit")
            ->assertForbidden();

        $this->assertSame('DRAFT', RiskMonthlyReport::findOrFail($this->reportA)->status);

        $this->actingAs($this->officerA)
            ->postJson("/risk-reports/{$this->reportA}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'PENDING_KASUB');
    }

}
