<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const CHANNEL_CODE = 'panduan-channels';
    private const CHANNEL_NAME = 'panduan-channels';
    private const LINKED_PROGRAM_ID = 23; // DIMR-HLD-BCMS-001
    private const AUTHOR_USER_ID = 153; // Dimas Aryo Wibisono (KASUBDIV)

    public function up(): void
    {
        DB::transaction(function () {
            $authorId = $this->resolveAuthorId();
            // No users yet (fresh/test DB) — skip seeding; channel can be re-seeded later.
            if ($authorId === null) return;
            $channelId = $this->ensureChannel($authorId);
            $this->ensureMessages($channelId, $authorId);
            $this->ensureMembersForAllUsers($channelId);
        });
    }

    public function down(): void
    {
        $channel = DB::table('Channel')->where('code', self::CHANNEL_CODE)->first();
        if ($channel) {
            DB::table('ChannelMessage')->where('channelId', $channel->id)->delete();
            DB::table('ChannelMember')->where('channelId', $channel->id)->delete();
            DB::table('Channel')->where('id', $channel->id)->delete();
        }
    }

    private function resolveAuthorId(): ?int
    {
        $exists = DB::table('User')->where('id', self::AUTHOR_USER_ID)->exists();
        if ($exists) return self::AUTHOR_USER_ID;

        // Fallback chain: SUPERADMIN > any user > null (skip seeding)
        return DB::table('User')->where('roleType', 'SUPERADMIN')->orderBy('id')->value('id')
            ?? DB::table('User')->orderBy('id')->value('id');
    }

    private function ensureChannel(int $authorId): int
    {
        $existing = DB::table('Channel')->where('code', self::CHANNEL_CODE)->first();
        if ($existing) return $existing->id;

        return DB::table('Channel')->insertGetId([
            'code' => self::CHANNEL_CODE,
            'name' => self::CHANNEL_NAME,
            'description' => 'Panduan singkat fitur Channels. Untuk pertanyaan, mention @everyone.',
            'type' => 'PUBLIC',
            'topicType' => 'ONBOARDING',
            'createdBy' => $authorId,
            'linkedProgramId' => self::LINKED_PROGRAM_ID,
            'isArchived' => false,
            'allowThreads' => true,
            'allowReactions' => true,
            'createdAt' => now(),
            'updatedAt' => now(),
        ]);
    }

    private function ensureMessages(int $channelId, int $authorId): void
    {
        $hasMessages = DB::table('ChannelMessage')->where('channelId', $channelId)->exists();
        if ($hasMessages) return;

        $base = now()->subDay()->setTime(9, 0, 0);
        $tick = 0;

        $msg = function (string $content, bool $pinned = false) use ($channelId, $authorId, $base, &$tick) {
            $ts = $base->copy()->addMinutes($tick++);
            return DB::table('ChannelMessage')->insertGetId([
                'channelId' => $channelId,
                'userId' => $authorId,
                'content' => $content,
                'replyCount' => 0,
                'isPinned' => $pinned,
                'isEdited' => false,
                'searchableText' => mb_strtolower($content),
                'createdAt' => $ts,
                'updatedAt' => $ts,
            ]);
        };

        // 1. Welcome (pinned)
        $msg(
            "Selamat datang di channel ini. Pesan-pesan berikut berfungsi sebagai panduan singkat fitur Channels.\n\n"
                . "Pesan yang dipin tampil di bagian atas. Selebihnya silakan dibaca berurutan sambil mencoba fitur yang dijelaskan.",
            true
        );

        // 2. Banner program demo
        $msg(
            "Di atas channel ini terdapat banner program. Setiap channel dapat dihubungkan ke satu program agar progress, risk, dan priority langsung terlihat tanpa berpindah halaman.\n\n"
                . "Sebagai contoh, channel ini dihubungkan ke program BCMS. Klik banner untuk membuka halaman detail program."
        );

        // 3. Channel vs DM
        $msg(
            "Channel digunakan untuk diskusi tim yang melibatkan banyak peserta dan perlu jejak terdokumentasi. Direct Message digunakan untuk komunikasi personal antara dua orang.\n\n"
                . "Apabila ragu, mulai dari channel. Pesan masih dapat dihapus jika ternyata salah konteks."
        );

        // 4. Threads (parent + replies)
        $threadParentId = $msg(
            "Coba balas pesan ini. Balasan akan masuk ke thread terpisah, tidak menumpuk di feed utama channel.\n\n"
                . "Thread berguna untuk diskusi panjang yang tidak ingin mengaburkan pesan-pesan lain dalam channel."
        );
        $this->seedThreadReplies($channelId, $authorId, $threadParentId, $base, $tick - 1);

        // 5. Reactions
        $msg(
            "Untuk respons singkat seperti \"oke\" atau \"noted\", gunakan reaksi emoji. Hover pada pesan, lalu klik ikon emoji yang muncul.\n\n"
                . "Cara ini lebih ringkas dan membantu menjaga feed tetap rapi."
        );

        // 6. Pin (pinned)
        $msg(
            "Pin pesan penting agar mudah diakses kembali. Cara: hover pesan, klik ikon titik tiga, lalu pilih Pin pesan. Pesan yang dipin akan masuk ke tab Pinned di toolbar dan dapat dilihat seluruh anggota channel.\n\n"
                . "Pesan ini sendiri telah dipin sebagai contoh.",
            true
        );

        // 7. Save (vs Pin)
        $msg(
            "Save berbeda dengan Pin. Save bersifat personal: hanya Anda yang melihat, dan pesan akan masuk ke tab Saved.\n\n"
                . "Cocok untuk menandai pesan yang ingin direferensi kembali atau dibalas pada waktu lain."
        );

        // 8. Filter tabs
        $msg(
            "Toolbar di atas feed memiliki empat tab filter: All untuk seluruh pesan, Threads untuk pesan yang memiliki balasan, Pinned untuk pesan yang dipin, dan Saved untuk pesan yang Anda simpan.\n\n"
                . "Klik salah satu tab untuk menyaring tampilan feed sesuai kebutuhan."
        );

        // 9. Mute & Star
        $msg(
            "Jika notifikasi terlalu sering, mute channel. Pesan tetap masuk, namun tidak memunculkan notifikasi.\n\n"
                . "Sebaliknya, channel yang sering digunakan dapat di-star agar tampil di urutan teratas sidebar."
        );

        // 10. Search shortcut + mentions
        $msg(
            "Untuk pencarian cepat, tekan ⌘K (Mac) atau Ctrl+K (Windows). Ketik nama channel atau anggota tim, lalu Enter untuk berpindah.\n\n"
                . "Mention anggota dengan @nama agar mereka menerima notifikasi. Untuk memanggil seluruh anggota channel, gunakan @everyone secukupnya agar tidak mengganggu anggota yang sedang fokus."
        );

        // 11. Browse, Create, closing
        $msg(
            "Untuk bergabung ke channel lain, klik Browse all channels di sidebar kiri. Untuk membuat channel baru, klik tombol + di header.\n\n"
                . "Apabila ada pertanyaan, silakan mention @everyone di channel ini. Tim akan memantau dan membantu sesuai kebutuhan."
        );
    }

    private function seedThreadReplies(int $channelId, int $authorId, int $parentId, $base, int $parentTick): void
    {
        $replies = [
            "Balasan ini hanya tampil di panel thread, tidak muncul di feed utama channel.",
            "Pesan parent kini menampilkan label \"2 balasan\" agar anggota lain tahu terdapat diskusi aktif di sini.",
        ];
        $offsetSeconds = 20;
        foreach ($replies as $content) {
            $ts = $base->copy()->addMinutes($parentTick)->addSeconds($offsetSeconds);
            $offsetSeconds += 20;
            DB::table('ChannelMessage')->insert([
                'channelId' => $channelId,
                'userId' => $authorId,
                'content' => $content,
                'parentMessageId' => $parentId,
                'replyCount' => 0,
                'isPinned' => false,
                'isEdited' => false,
                'searchableText' => mb_strtolower($content),
                'createdAt' => $ts,
                'updatedAt' => $ts,
            ]);
        }
        DB::table('ChannelMessage')->where('id', $parentId)->update(['replyCount' => count($replies)]);
    }

    private function ensureMembersForAllUsers(int $channelId): void
    {
        $userIds = DB::table('User')->pluck('id');
        $rows = $userIds->map(fn ($uid) => [
            'channelId' => $channelId,
            'userId' => $uid,
            'joinedAt' => now(),
            'lastViewedAt' => null,
            'isMuted' => false,
            'isStarred' => false,
        ])->all();
        if (empty($rows)) return;
        DB::table('ChannelMember')->insertOrIgnore($rows);
    }
};
