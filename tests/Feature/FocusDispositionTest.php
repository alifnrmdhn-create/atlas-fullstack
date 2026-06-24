<?php

namespace Tests\Feature;

use App\Models\FocusDisposition;
use App\Models\Notification;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci endpoint disposition Focus (POST /focus/dispositions) — penutup loop
 * tindak lanjut item "Needs Action" di Focus.
 *
 *   - SUPPORTED butuh note (dikirim sebagai notifikasi ke PIC/owner program)
 *   - HANDLED merekam dismissal tanpa note
 *   - Hanya pemegang scope unit program (atau eksekutif) yang boleh men-disposition
 *   - Disposition aktif menyembunyikan item dari needsAction (per program+tag)
 */
class FocusDispositionTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private User $kadivA;
    private User $kadivB;
    private int $programA;

    protected function setUp(): void
    {
        parent::setUp();

        [$dirA, $unitA] = $this->makeDirectorate('DIR-A', 'DIV-A');
        [$dirB, $unitB] = $this->makeDirectorate('DIR-B', 'DIV-B');

        $adminA = $this->makeUser('admin-a', 'SUPERADMIN', $unitA->id, $dirA->id);
        $this->kadivA = $this->makeUser('kadiv-a', 'KADIV', $unitA->id, $dirA->id);
        $this->kadivB = $this->makeUser('kadiv-b', 'KADIV', $unitB->id, $dirB->id);

        $stack = $this->seedProgramStack($adminA, 'A');
        $this->programA = $stack['program'];

        // Program harus ber-ownerUnitId agar scope unit (coversUnit) resolvable
        // untuk KADIV-A; admin seed tak selalu mengisinya.
        Program::whereKey($this->programA)->update(['ownerUnitId' => $unitA->id]);
    }

    public function test_support_requires_a_note(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'blocker',
                'action' => 'SUPPORTED',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('note');

        $this->assertDatabaseCount('FocusDisposition', 0);
    }

    public function test_support_records_disposition_and_notifies_owner(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'blocker',
                'action' => 'SUPPORTED',
                'note' => 'Koordinasikan dengan tim teknis minggu ini.',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('FocusDisposition', [
            'userId' => $this->kadivA->id,
            'programId' => $this->programA,
            'tag' => 'blocker',
            'action' => 'SUPPORTED',
        ]);

        // Owner program (admin seed) menerima notifikasi arahan.
        $this->assertDatabaseHas('Notification', [
            'type' => 'FOCUS_SUPPORT',
            'source' => "program:{$this->programA}",
        ]);
    }

    public function test_handled_records_dismissal_without_note(): void
    {
        $this->actingAs($this->kadivA)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'support',
                'action' => 'HANDLED',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('FocusDisposition', [
            'programId' => $this->programA,
            'tag' => 'support',
            'action' => 'HANDLED',
        ]);
        $this->assertSame(0, Notification::where('type', 'FOCUS_SUPPORT')->count());
    }

    public function test_repeated_disposition_upserts_not_duplicates(): void
    {
        $payload = ['programId' => $this->programA, 'tag' => 'blocker', 'action' => 'HANDLED'];

        $this->actingAs($this->kadivA)->postJson('/focus/dispositions', $payload)->assertCreated();
        $this->actingAs($this->kadivA)->postJson('/focus/dispositions', [...$payload, 'note' => 'updated'])->assertCreated();

        $this->assertSame(1, FocusDisposition::where('userId', $this->kadivA->id)
            ->where('programId', $this->programA)->where('tag', 'blocker')->count());
    }

    public function test_out_of_scope_program_is_forbidden(): void
    {
        $this->actingAs($this->kadivB)
            ->postJson('/focus/dispositions', [
                'programId' => $this->programA,
                'tag' => 'blocker',
                'action' => 'HANDLED',
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('FocusDisposition', 0);
    }
}
