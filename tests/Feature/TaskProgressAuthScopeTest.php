<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci catatan "edit status progress hanya oleh PIC" (24 Jun 2026).
 *
 * Update STATUS & PROGRESS task diperketat: hanya PIC (assignedTo), owner
 * program, atau admin yang boleh — BUKAN lagi siapa pun yang scope unit-nya
 * mencakup program (coversUnit). Edit STRUKTURAL (PATCH /tasks/{id}) tetap
 * longgar (coversUnit) supaya atasan tetap bisa menata pekerjaan.
 *
 * @see \App\Http\Controllers\TaskController::assertCanUpdateProgress
 */
class TaskProgressAuthScopeTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $adminA;
    private User $kadivA;
    private User $pic;

    /** @var array<string,int> */
    private array $a;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');

        $this->adminA = $this->makeUser('admin-a', 'SUPERADMIN', $unitA->id, $dirA->id);
        $this->kadivA = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->pic    = $this->makeUser('pic-a', 'OFFICER', $unitA->id, $dirA->id);

        // Program owner = adminA (seedProgramStack pakai ownerId admin).
        $this->a = $this->seedProgramStack($this->adminA, 'A');

        // PIC = pic-a (assign via endpoint riil sebagai admin).
        $this->actingAs($this->adminA)
            ->putJson("/tasks/{$this->a['task']}/assign", ['assignedTo' => $this->pic->id])
            ->assertOk();
    }

    public function test_directorate_manager_cannot_update_progress_or_status(): void
    {
        // KADIV se-direktorat: coversUnit TRUE, tapi bukan PIC & bukan owner
        // program → sekarang DITOLAK untuk progress & status.
        $this->actingAs($this->kadivA)
            ->putJson("/tasks/{$this->a['task']}/progress", ['percentComplete' => 20])
            ->assertForbidden();

        $this->actingAs($this->kadivA)
            ->putJson("/tasks/{$this->a['task']}/status", ['status' => 'IN_PROGRESS'])
            ->assertForbidden();
    }

    public function test_pic_can_update_progress(): void
    {
        $this->actingAs($this->pic)
            ->putJson("/tasks/{$this->a['task']}/progress", ['percentComplete' => 30])
            ->assertOk();
    }

    public function test_program_owner_can_update_progress(): void
    {
        $this->actingAs($this->adminA)
            ->putJson("/tasks/{$this->a['task']}/progress", ['percentComplete' => 40])
            ->assertOk();
    }

    public function test_structural_edit_still_allowed_for_directorate_manager(): void
    {
        // Pengetatan HANYA menyentuh status/progress. Edit struktural (mis. ubah
        // prioritas) tetap boleh oleh manajer se-direktorat via coversUnit.
        $this->actingAs($this->kadivA)
            ->patchJson("/tasks/{$this->a['task']}", ['priority' => 'HIGH'])
            ->assertOk();
    }

    public function test_directorate_manager_cannot_edit_realization_weeks(): void
    {
        // Realisasi (actualWeeks) via PATCH /tasks/{id} = pelaporan progres →
        // tunduk gate ketat yang sama. Manajer se-direktorat (bukan PIC/owner)
        // ditolak, walau edit struktural lain lolos.
        $this->actingAs($this->kadivA)
            ->patchJson("/tasks/{$this->a['task']}", ['actualWeeks' => ['2026-W10']])
            ->assertForbidden();
    }

    public function test_pic_can_edit_realization_weeks(): void
    {
        $this->actingAs($this->pic)
            ->patchJson("/tasks/{$this->a['task']}", ['actualWeeks' => ['2026-W10']])
            ->assertOk();
    }
}
