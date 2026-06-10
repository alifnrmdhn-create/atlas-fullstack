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
 * Mengunci perilaku GET /channels (ChannelController::listForUser) setelah
 * refactor anti-N+1 (2026-06-10: lastMessage + unreadCount per-channel → 2 query
 * agregat DISTINCT ON + JOIN-groupBy). Skenario sengaja kaya supaya jalur yang
 * dulu tak teruji golden-diff (data dev tipis) terbukti ekuivalen:
 *   - unreadCount pakai cutoff per-membership (lastViewedAt ?? joinedAt)
 *   - pesan sendiri / thread reply / deleted-for-everyone TIDAK dihitung
 *   - lastMessage = root message non-deleted terbaru per channel
 *   - membership tanpa cutoff → unread 0; non-member channel publik → unread 0
 */
class ChannelListUnreadTest extends TestCase
{
    use RefreshDatabase;

    private User $me;
    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-T', 'name' => 'Direktorat T', 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => 'DIV-T', 'name' => 'Divisi T', 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);

        $this->me = $this->makeUser('me-user', $unit->id, $dir->id);
        $this->other = $this->makeUser('other-user', $unit->id, $dir->id);
    }

    public function test_unread_and_last_message_are_computed_per_channel(): void
    {
        $cutoff = now()->subHours(2);

        // C1: member dengan lastViewedAt = cutoff. Pesan: 1 sebelum cutoff,
        // 3 dari orang lain sesudah cutoff, 1 milik sendiri sesudah cutoff,
        // 1 thread reply, 1 deleted-for-everyone → unread harus 3.
        $c1 = $this->makeChannel('ch-satu');
        $this->join($c1, $this->me->id, joinedAt: $cutoff->copy()->subDay(), lastViewedAt: $cutoff);
        $this->join($c1, $this->other->id, joinedAt: $cutoff->copy()->subDay());

        $this->msg($c1, $this->other->id, 'lama — sudah dibaca', $cutoff->copy()->subHour());
        $rootId = $this->msg($c1, $this->other->id, 'baru #1', $cutoff->copy()->addMinutes(10));
        $this->msg($c1, $this->other->id, 'baru #2', $cutoff->copy()->addMinutes(20));
        $this->msg($c1, $this->me->id, 'balasan saya sendiri', $cutoff->copy()->addMinutes(30));
        $this->msg($c1, $this->other->id, 'reply di thread', $cutoff->copy()->addMinutes(40), parentId: $rootId);
        $this->msg($c1, $this->other->id, 'dihapus', $cutoff->copy()->addMinutes(50), deleted: true);
        $this->msg($c1, $this->other->id, 'baru #3 — terakhir', $cutoff->copy()->addMinutes(60));

        // C2: member TANPA lastViewedAt → cutoff jatuh ke joinedAt.
        // 1 pesan sebelum join, 1 sesudah join → unread harus 1.
        $c2 = $this->makeChannel('ch-dua');
        $joined = now()->subHour();
        $this->join($c2, $this->me->id, joinedAt: $joined);
        $this->msg($c2, $this->other->id, 'sebelum saya join', $joined->copy()->subMinutes(30));
        $this->msg($c2, $this->other->id, 'sesudah saya join', $joined->copy()->addMinutes(5));

        // C3: channel publik, BUKAN member → tampil di list, unread 0,
        // lastMessage tetap terisi.
        $c3 = $this->makeChannel('ch-tiga');
        $this->msg($c3, $this->other->id, 'pesan publik', now()->subMinutes(5));

        $rows = collect(
            $this->actingAs($this->me)->getJson('/channels')->assertOk()->json('data')
        )->keyBy('name');

        $this->assertSame(3, $rows['ch-satu']['unreadCount'], 'C1: 3 pesan baru dari orang lain (sendiri/thread/deleted tak dihitung).');
        $this->assertSame('baru #3 — terakhir', $rows['ch-satu']['lastMessage']['content'], 'C1: lastMessage = root non-deleted terbaru.');
        $this->assertTrue($rows['ch-satu']['isMember']);

        $this->assertSame(1, $rows['ch-dua']['unreadCount'], 'C2: cutoff fallback ke joinedAt.');
        $this->assertSame('sesudah saya join', $rows['ch-dua']['lastMessage']['content']);

        $this->assertSame(0, $rows['ch-tiga']['unreadCount'], 'C3: non-member selalu 0.');
        $this->assertSame('pesan publik', $rows['ch-tiga']['lastMessage']['content'], 'C3: lastMessage tetap terisi utk non-member.');
        $this->assertFalse($rows['ch-tiga']['isMember']);
    }

    public function test_channel_without_messages_has_null_last_message(): void
    {
        $c = $this->makeChannel('ch-kosong');
        $this->join($c, $this->me->id, joinedAt: now()->subDay());

        $rows = collect(
            $this->actingAs($this->me)->getJson('/channels')->assertOk()->json('data')
        )->keyBy('name');

        $this->assertNull($rows['ch-kosong']['lastMessage']);
        $this->assertSame(0, $rows['ch-kosong']['unreadCount']);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function makeUser(string $slug, int $unitId, int $directorateId): User
    {
        return User::create([
            'name' => $slug,
            'email' => "{$slug}@ptpn.test",
            'userId' => $slug,
            'passwordHash' => Hash::make('password'),
            'roleType' => 'KASUBDIV',
            'isActive' => true,
            'unitId' => $unitId,
            'directorateId' => $directorateId,
        ]);
    }

    private function makeChannel(string $name): int
    {
        return (int) DB::table('Channel')->insertGetId([
            'code' => strtoupper($name),
            'name' => $name,
            'type' => 'PUBLIC',
            'createdBy' => $this->other->id,
            'isArchived' => false,
            'createdAt' => now()->subDays(2),
            'updatedAt' => now()->subDays(2),
        ]);
    }

    private function join(int $channelId, int $userId, $joinedAt = null, $lastViewedAt = null): void
    {
        DB::table('ChannelMember')->insert([
            'channelId' => $channelId,
            'userId' => $userId,
            'joinedAt' => $joinedAt,
            'lastViewedAt' => $lastViewedAt,
        ]);
    }

    private function msg(int $channelId, int $userId, string $content, $createdAt, ?int $parentId = null, bool $deleted = false): int
    {
        return (int) DB::table('ChannelMessage')->insertGetId([
            'channelId' => $channelId,
            'userId' => $userId,
            'content' => $content,
            'parentMessageId' => $parentId,
            'deletedForEveryoneAt' => $deleted ? $createdAt : null,
            'deletedForEveryoneBy' => $deleted ? $userId : null,
            'createdAt' => $createdAt,
            'updatedAt' => $createdAt,
        ]);
    }
}
