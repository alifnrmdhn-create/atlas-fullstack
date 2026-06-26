<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci aturan "PIC task hanya boleh ditunjuk oleh Kadiv/Kasubdiv (+admin)"
 * (2026-06-26). Menunjuk penanggung jawab = keputusan plan-author, BUKAN hak
 * pelaksana — meski pelaksana (assignee) boleh memperbarui progres task-nya.
 *
 * Berbeda dengan assertCanModifyTask (punya shortcut assignee/creator), gate
 * assertCanAssignPic sengaja TANPA shortcut itu → assignee tak bisa mengoper
 * PIC ke orang lain.
 *
 * @see \App\Http\Controllers\TaskController::assertCanAssignPic
 */
class TaskPicAssignAuthTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $adminA;
    private User $kadivA;
    private User $assignee;   // OFFICER, PIC task saat ini
    private User $other;      // OFFICER lain (target reassign)

    /** @var array<string,int> */
    private array $a;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');

        $this->adminA   = $this->makeUser('admin-a', 'SUPERADMIN', $unitA->id, $dirA->id);
        $this->kadivA   = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->assignee = $this->makeUser('asg-a', 'OFFICER', $unitA->id, $dirA->id);
        $this->other    = $this->makeUser('oth-a', 'OFFICER', $unitA->id, $dirA->id);

        // Program owner = admin (seedProgramStack pakai ownerId admin).
        $this->a = $this->seedProgramStack($this->adminA, 'A');

        // Tunjuk assignee awal sebagai admin (path sah).
        $this->actingAs($this->adminA)
            ->putJson("/tasks/{$this->a['task']}/assign", ['assignedTo' => $this->assignee->id])
            ->assertOk();
    }

    public function test_assignee_cannot_reassign_pic_via_assign(): void
    {
        // Pelaksana (PIC saat ini) mencoba mengoper PIC ke orang lain → DITOLAK.
        $this->actingAs($this->assignee)
            ->putJson("/tasks/{$this->a['task']}/assign", ['assignedTo' => $this->other->id])
            ->assertForbidden();
    }

    public function test_assignee_cannot_change_pic_persons_via_patch(): void
    {
        $this->actingAs($this->assignee)
            ->patchJson("/tasks/{$this->a['task']}", ['picPersonIds' => [$this->other->id]])
            ->assertForbidden();
    }

    public function test_assignee_cannot_set_pic_units_via_patch(): void
    {
        $this->actingAs($this->assignee)
            ->patchJson("/tasks/{$this->a['task']}", ['picUnitIds' => []])
            ->assertForbidden();
    }

    public function test_kadiv_in_scope_can_assign_pic(): void
    {
        $this->actingAs($this->kadivA)
            ->putJson("/tasks/{$this->a['task']}/assign", ['assignedTo' => $this->other->id])
            ->assertOk();
    }

    public function test_admin_can_change_pic_persons(): void
    {
        $this->actingAs($this->adminA)
            ->patchJson("/tasks/{$this->a['task']}", ['picPersonIds' => [$this->other->id]])
            ->assertOk();
    }

    public function test_assignee_can_still_update_progress(): void
    {
        // Pengetatan PIC TIDAK boleh memutus jalur eksekusi: PIC tetap boleh
        // memperbarui progres task-nya.
        $this->actingAs($this->assignee)
            ->putJson("/tasks/{$this->a['task']}/progress", ['percentComplete' => 25])
            ->assertOk();
    }
}
