<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Mengunci visibility sidebar Channels untuk admin/superadmin (keluhan 2026-06-25:
 * daftar channel superadmin "kotor" oleh DM antar user lain).
 *
 * Kontrak ChannelController::listForUser untuk admin:
 *   - TIDAK menampilkan DM (type PRIVATE, nama "dm-A-B") antar user lain.
 *   - TETAP menampilkan channel PUBLIC + channel grup PRIVATE (moderasi) +
 *     DM milik admin sendiri.
 * Non-admin tak terpengaruh (hanya PUBLIC + channel yang diikuti).
 */
class ChannelAdminDmVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $userA;
    private User $userB;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-T', 'name' => 'Direktorat T', 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => 'DIV-T', 'name' => 'Divisi T', 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);

        $this->admin = $this->makeUser('super-admin', 'SUPERADMIN', $unit->id, $dir->id);
        $this->userA = $this->makeUser('user-a', 'KASUBDIV', $unit->id, $dir->id);
        $this->userB = $this->makeUser('user-b', 'KASUBDIV', $unit->id, $dir->id);
    }

    public function test_admin_does_not_see_other_users_dms(): void
    {
        // DM antar user lain — TIDAK boleh tampil di sidebar admin.
        $dmOthers = $this->makeChannel("dm-{$this->userA->id}-{$this->userB->id}", 'PRIVATE');
        $this->join($dmOthers, $this->userA->id);
        $this->join($dmOthers, $this->userB->id);

        // DM milik admin sendiri — HARUS tampil.
        $dmMine = $this->makeChannel("dm-{$this->admin->id}-{$this->userA->id}", 'PRIVATE');
        $this->join($dmMine, $this->admin->id);
        $this->join($dmMine, $this->userA->id);

        // Channel grup publik — tampil.
        $pub = $this->makeChannel('umum', 'PUBLIC');

        // Channel grup PRIVATE (bukan DM) yg admin tak ikuti — tetap tampil (moderasi).
        $priv = $this->makeChannel('rahasia-tim', 'PRIVATE');

        $names = collect(
            $this->actingAs($this->admin)->getJson('/channels')->assertOk()->json('data')
        )->pluck('name')->all();

        $this->assertNotContains("dm-{$this->userA->id}-{$this->userB->id}", $names, 'DM antar user lain tak boleh muncul di sidebar admin.');
        $this->assertContains("dm-{$this->admin->id}-{$this->userA->id}", $names, 'DM milik admin sendiri harus tampil.');
        $this->assertContains('umum', $names);
        $this->assertContains('rahasia-tim', $names, 'Channel grup privat tetap tampil utk admin (moderasi).');
    }

    public function test_non_admin_only_sees_public_and_member_channels(): void
    {
        $dmOthers = $this->makeChannel("dm-{$this->admin->id}-{$this->userB->id}", 'PRIVATE');
        $this->join($dmOthers, $this->admin->id);
        $this->join($dmOthers, $this->userB->id);

        $this->makeChannel('umum', 'PUBLIC');
        $this->makeChannel('rahasia-tim', 'PRIVATE'); // privat, userA bukan member

        $names = collect(
            $this->actingAs($this->userA)->getJson('/channels')->assertOk()->json('data')
        )->pluck('name')->all();

        $this->assertContains('umum', $names);
        $this->assertNotContains("dm-{$this->admin->id}-{$this->userB->id}", $names, 'Non-admin tak lihat DM orang lain.');
        $this->assertNotContains('rahasia-tim', $names, 'Non-admin tak lihat channel privat yg tak diikuti.');
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function makeUser(string $slug, string $role, int $unitId, int $directorateId): User
    {
        return User::create([
            'name' => $slug, 'email' => "{$slug}@ptpn.test", 'userId' => $slug,
            'passwordHash' => Hash::make('password'), 'roleType' => $role,
            'isActive' => true, 'unitId' => $unitId, 'directorateId' => $directorateId,
        ]);
    }

    private function makeChannel(string $name, string $type): int
    {
        return (int) DB::table('Channel')->insertGetId([
            'code' => strtoupper(str_replace('-', '_', $name)),
            'name' => $name, 'type' => $type, 'createdBy' => $this->userA->id,
            'isArchived' => false, 'createdAt' => now(), 'updatedAt' => now(),
        ]);
    }

    private function join(int $channelId, int $userId): void
    {
        DB::table('ChannelMember')->insert([
            'channelId' => $channelId, 'userId' => $userId,
            'joinedAt' => now(), 'lastViewedAt' => now(),
        ]);
    }
}
