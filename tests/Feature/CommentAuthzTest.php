<?php

namespace Tests\Feature;

use App\Models\Comment;
use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Mengunci celah authz CommentController (audit 2026-06-10): index/store/
 * thread/reaction/pin dulu menerima entityId mentah tanpa kontrol akses —
 * user mana pun bisa membaca thread komentar program/task/blocker unit lain,
 * menulis komentar (plus fan-out notifikasi mention) ke entity tanpa akses,
 * dan pin/unpin komentar apa pun.
 *
 * Semantik gate = TaskController::assertCanSeeTask: admin lolos; selain itu
 * OrgScope user harus mencakup unit pemilik program entity. GOTCHA fixture:
 * Workstream.ownerUnitId selalu null — resolusi via Program.ownerUnitId.
 * Pola positive-control: blok lintas direktorat + tetap jalan di milik sendiri.
 */
class CommentAuthzTest extends TestCase
{
    use RefreshDatabase;

    private User $adminA;
    private User $kadivA;
    private User $kadivB;

    /** @var array<string,int> */
    private array $a;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $this->adminA = $this->makeUser('admin-a', 'SUPERADMIN', $unitA->id, $dirA->id);
        $this->kadivA = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->kadivB = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);

        $this->a = $this->seedProgramStack($this->adminA, 'A');
    }

    // ── index (baca thread) ──────────────────────────────────────────────────

    public function test_index_blocks_cross_directorate_for_all_entity_types(): void
    {
        foreach (['programs' => 'program', 'workstreams' => 'workstream', 'tasks' => 'task', 'blockers' => 'blocker'] as $path => $key) {
            $this->actingAs($this->kadivB)
                ->getJson("/{$path}/{$this->a[$key]}/comments")
                ->assertForbidden();

            $this->actingAs($this->kadivA)
                ->getJson("/{$path}/{$this->a[$key]}/comments")
                ->assertOk();
        }
    }

    // ── store (tulis komentar) ───────────────────────────────────────────────

    public function test_store_blocks_cross_directorate(): void
    {
        $this->actingAs($this->kadivB)
            ->postJson("/programs/{$this->a['program']}/comments", ['commentText' => 'Injected'])
            ->assertForbidden();

        $this->assertSame(0, Comment::where('entityType', 'PROGRAM')
            ->where('entityId', $this->a['program'])->count());

        $this->actingAs($this->kadivA)
            ->postJson("/programs/{$this->a['program']}/comments", ['commentText' => 'Komentar sah'])
            ->assertCreated();
    }

    // ── thread / reaction / pin (akses via komentar) ─────────────────────────

    public function test_thread_reaction_and_pin_block_cross_directorate(): void
    {
        $commentId = $this->actingAs($this->kadivA)
            ->postJson("/tasks/{$this->a['task']}/comments", ['commentText' => 'Diskusi internal'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->kadivB)->getJson("/comments/{$commentId}/thread")->assertForbidden();
        $this->actingAs($this->kadivB)->postJson("/comments/{$commentId}/reactions", ['emoji' => '👍'])->assertForbidden();
        $this->actingAs($this->kadivB)->putJson("/comments/{$commentId}/pin")->assertForbidden();

        $this->assertFalse((bool) Comment::findOrFail($commentId)->isPinned);

        // Positive control: anggota direktorat pemilik tetap bisa semuanya.
        $this->actingAs($this->kadivA)->getJson("/comments/{$commentId}/thread")->assertOk();
        $this->actingAs($this->kadivA)->postJson("/comments/{$commentId}/reactions", ['emoji' => '👍'])->assertOk();
        $this->actingAs($this->kadivA)->putJson("/comments/{$commentId}/pin")->assertOk();
        $this->assertTrue((bool) Comment::findOrFail($commentId)->isPinned);
    }

    // ── Fixture helpers (mirror CrossDirectorateAuthzTest) ──────────────────

    /** @return array{0: Directorate, 1: OrganizationalUnit} */
    private function makeDirectorate(string $dirCode, string $unitCode): array
    {
        $dir = Directorate::create(['code' => $dirCode, 'name' => "Direktorat {$dirCode}", 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => $unitCode, 'name' => "Divisi {$unitCode}", 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);

        return [$dir, $unit];
    }

    private function makeUser(string $slug, string $role, int $unitId, int $directorateId): User
    {
        return User::create([
            'name'          => $slug,
            'email'         => "{$slug}@ptpn.test",
            'userId'        => $slug,
            'passwordHash'  => Hash::make('password'),
            'roleType'      => $role,
            'isActive'      => true,
            'unitId'        => $unitId,
            'directorateId' => $directorateId,
        ]);
    }

    /** @return array<string,int> Buat Program→Workstream→Task→Blocker via HTTP sebagai admin. */
    private function seedProgramStack(User $admin, string $tag): array
    {
        $this->actingAs($admin);

        $programId = $this->postJson('/programs', [
            'code' => "PRG-{$tag}",
            'name' => "Program {$tag}",
            'description' => "Seed program {$tag}.",
            'status' => 'IN_PROGRESS',
            'priority' => 'HIGH',
            'startDate' => now()->toDateString(),
            'targetEndDate' => now()->addMonth()->toDateString(),
            'ownerId' => $admin->id,
            'hasNoApmsKpi' => true,
        ])->assertCreated()->json('data.id');

        $workstreamId = $this->postJson('/workstreams', [
            'programId' => $programId,
            'name' => "Workstream {$tag}",
            'priority' => 'HIGH',
            'targetCompletion' => now()->addWeeks(2)->toDateString(),
            'ownerId' => $admin->id,
        ])->assertCreated()->json('data.id');

        $taskId = $this->postJson('/tasks', [
            'title' => "Task {$tag}",
            'workstreamId' => $workstreamId,
            'targetCompletion' => now()->addWeek()->toDateString(),
            'priority' => 'MEDIUM',
        ])->assertCreated()->json('data.id');

        $blockerId = $this->postJson('/blockers', [
            'taskId' => $taskId,
            'title' => "Blocker {$tag}",
            'severity' => 'HIGH',
        ])->assertCreated()->json('data.id');

        return [
            'program' => $programId,
            'workstream' => $workstreamId,
            'task' => $taskId,
            'blocker' => $blockerId,
        ];
    }
}
