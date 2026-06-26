<?php

namespace Tests\Feature;

use App\Models\Position;
use App\Models\User;
use App\Services\OrgHierarchyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * OrgHierarchyService: menurunkan User.managerUserId dari rantai jabatan
 * (Position.reportsToPositionId).
 *
 * Struktur uji: direktur ← kadiv ← kasubdiv ← asisten (rantai posisi),
 * masing-masing punya holder.
 */
class OrgHierarchyServiceTest extends TestCase
{
    use RefreshDatabase;

    private OrgHierarchyService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = app(OrgHierarchyService::class);
    }

    public function test_derives_manager_from_position_chain(): void
    {
        [$pos, $user] = $this->buildChain();

        $changes = $this->svc->recompute(apply: true);
        $this->assertNotEmpty($changes);

        $this->assertSame($user['direktur']->id, $user['kadiv']->fresh()->managerUserId);
        $this->assertSame($user['kadiv']->id, $user['kasubdiv']->fresh()->managerUserId);
        $this->assertSame($user['kasubdiv']->id, $user['asisten']->fresh()->managerUserId);
        $this->assertNull($user['direktur']->fresh()->managerUserId); // puncak
    }

    public function test_skips_vacant_parent_position(): void
    {
        [$pos, $user] = $this->buildChain();

        // Kosongkan seat KASUBDIV → asisten harus naik ke KADIV.
        $user['kasubdiv']->update(['positionId' => null]);

        $this->svc->recompute(apply: true);

        $this->assertSame($user['kadiv']->id, $user['asisten']->fresh()->managerUserId);
    }

    public function test_inactive_holder_is_not_chosen_as_manager(): void
    {
        [$pos, $user] = $this->buildChain();

        // Holder KASUBDIV nonaktif → tidak dianggap holder, asisten naik ke KADIV.
        $user['kasubdiv']->update(['isActive' => false]);

        $this->svc->recompute(apply: true);

        $this->assertSame($user['kadiv']->id, $user['asisten']->fresh()->managerUserId);
    }

    public function test_user_without_position_is_untouched(): void
    {
        [$pos, $user] = $this->buildChain();

        $loner = $this->makeUser('loner', managerId: $user['kadiv']->id);
        // Tanpa positionId → derive tak menyentuhnya (escape hatch BOD/admin).

        $this->svc->recompute(apply: true);

        $this->assertSame($user['kadiv']->id, $loner->fresh()->managerUserId);
    }

    public function test_recompute_is_idempotent(): void
    {
        $this->buildChain();

        $first = $this->svc->recompute(apply: true);
        $this->assertNotEmpty($first);

        $second = $this->svc->recompute(apply: true);
        $this->assertSame([], $second, 'Run kedua harus nol perubahan (idempotent).');
    }

    public function test_dry_run_does_not_persist(): void
    {
        [$pos, $user] = $this->buildChain();

        $changes = $this->svc->recompute(apply: false);
        $this->assertNotEmpty($changes);

        // Tidak ada yang tersimpan.
        $this->assertNull($user['asisten']->fresh()->managerUserId);
    }

    public function test_assert_no_cycle_rejects_self(): void
    {
        [$pos] = $this->buildChain();

        $this->expectException(ValidationException::class);
        $this->svc->assertNoCycle($pos['kadiv']->id, $pos['kadiv']->id);
    }

    public function test_assert_no_cycle_rejects_descendant_as_parent(): void
    {
        [$pos] = $this->buildChain();

        // KADIV melapor ke ASISTEN (yang ada di bawahnya) → lingkar.
        $this->expectException(ValidationException::class);
        $this->svc->assertNoCycle($pos['kadiv']->id, $pos['asisten']->id);
    }

    public function test_assert_no_cycle_allows_valid_parent(): void
    {
        [$pos] = $this->buildChain();

        // ASISTEN melapor ke DIREKTUR (ancestor) → valid, tak melempar.
        $this->svc->assertNoCycle($pos['asisten']->id, $pos['direktur']->id);
        $this->assertTrue(true);
    }

    /**
     * @return array{0: array<string,Position>, 1: array<string,User>}
     */
    private function buildChain(): array
    {
        $direktur = $this->makePosition('DIR', null);
        $kadiv = $this->makePosition('KAD', $direktur->id);
        $kasubdiv = $this->makePosition('KSB', $kadiv->id);
        $asisten = $this->makePosition('ASN', $kasubdiv->id);

        $pos = compact('direktur', 'kadiv', 'kasubdiv', 'asisten');

        $user = [
            'direktur' => $this->makeUser('direktur', positionId: $direktur->id),
            'kadiv' => $this->makeUser('kadiv', positionId: $kadiv->id),
            'kasubdiv' => $this->makeUser('kasubdiv', positionId: $kasubdiv->id),
            'asisten' => $this->makeUser('asisten', positionId: $asisten->id),
        ];

        return [$pos, $user];
    }

    private function makePosition(string $code, ?int $reportsTo): Position
    {
        return Position::create([
            'code' => $code,
            'name' => "Jabatan {$code}",
            'levelCode' => 'M1',
            'roleType' => 'ASISTEN',
            'reportsToPositionId' => $reportsTo,
            'isActive' => true,
        ]);
    }

    private function makeUser(string $slug, ?int $positionId = null, ?int $managerId = null): User
    {
        return User::create([
            'name' => $slug,
            'email' => "{$slug}@ptpn.test",
            'passwordHash' => Hash::make('password'),
            'roleType' => 'ASISTEN',
            'isActive' => true,
            'positionId' => $positionId,
            'managerUserId' => $managerId,
        ]);
    }
}
