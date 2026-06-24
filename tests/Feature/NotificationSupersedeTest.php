<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Mengunci perilaku supersede notifikasi (audit notif 2026-06-24).
 *
 * Notifikasi "state entitas" (assign/cancel/reopen, approval, dll.) yang baru
 * menandai UNREAD lama dengan (userId+type+source) yang sama jadi READ — supaya
 * lonceng menampilkan keadaan terkini, bukan tumpukan transisi basi. Chat &
 * komentar (MENTION/DM_RECEIVED/COMMENT) dikecualikan: tiap kejadian unik.
 */
class NotificationSupersedeTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(): User
    {
        return User::create([
            'name' => 'u', 'email' => 'u@ptpn.test', 'userId' => 'u',
            'passwordHash' => bcrypt('x'), 'roleType' => 'KASUBDIV', 'isActive' => true,
        ]);
    }

    private function notif(User $u, string $type, string $source, string $msg): Notification
    {
        return Notification::create([
            'userId' => $u->id, 'type' => $type, 'message' => $msg,
            'source' => $source, 'state' => 'UNREAD', 'createdAt' => now(),
        ]);
    }

    public function test_new_stateful_notification_supersedes_prior_unread_same_entity(): void
    {
        $u = $this->makeUser();
        $this->notif($u, 'TASK_ASSIGNED', 'assignment:1', 'assigned');
        $this->notif($u, 'TASK_ASSIGNED', 'assignment:1', 'cancelled');
        $latest = $this->notif($u, 'TASK_ASSIGNED', 'assignment:1', 'reopened');

        $unread = Notification::where('source', 'assignment:1')->where('state', 'UNREAD')->get();
        $this->assertCount(1, $unread, 'Hanya notifikasi terkini yang tetap UNREAD.');
        $this->assertSame($latest->id, $unread->first()->id);
    }

    public function test_different_source_is_not_superseded(): void
    {
        $u = $this->makeUser();
        $this->notif($u, 'TASK_ASSIGNED', 'assignment:1', 'a');
        $this->notif($u, 'TASK_ASSIGNED', 'assignment:2', 'b');

        $this->assertSame(2, Notification::where('state', 'UNREAD')->count());
    }

    public function test_chat_types_are_exempt_from_supersede(): void
    {
        $u = $this->makeUser();
        $this->notif($u, 'MENTION', 'channel:5', 'm1');
        $this->notif($u, 'MENTION', 'channel:5', 'm2');
        $this->notif($u, 'DM_RECEIVED', 'channel:6', 'd1');
        $this->notif($u, 'DM_RECEIVED', 'channel:6', 'd2');

        $this->assertSame(2, Notification::where('type', 'MENTION')->where('state', 'UNREAD')->count());
        $this->assertSame(2, Notification::where('type', 'DM_RECEIVED')->where('state', 'UNREAD')->count());
    }

    public function test_other_users_notifications_untouched(): void
    {
        $a = $this->makeUser();
        $b = User::create(['name' => 'b', 'email' => 'b@ptpn.test', 'userId' => 'b', 'passwordHash' => bcrypt('x'), 'roleType' => 'KASUBDIV', 'isActive' => true]);
        $this->notif($a, 'TASK_ASSIGNED', 'assignment:1', 'a');
        $this->notif($b, 'TASK_ASSIGNED', 'assignment:1', 'b');

        // Tiap user tetap punya 1 UNREAD — supersede tidak lintas user.
        $this->assertSame(1, Notification::where('userId', $a->id)->where('state', 'UNREAD')->count());
        $this->assertSame(1, Notification::where('userId', $b->id)->where('state', 'UNREAD')->count());
    }
}
