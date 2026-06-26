<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Drop the onboarding guide channel ("panduan-channels") entirely.
 *
 * Why: the channel was seeded with ALL users as members (2026_05_10 seed +
 * UserObserver auto-add), and relinked to the BCMS program (2026_06_02) so its
 * context banner would render as a demo. Side effect: because membership of a
 * program-linked channel grants program visibility (MembershipResolver rule #5),
 * EVERY user saw the BCMS Tabletop program in their Programs list. Product
 * decision (2026-06-26): the onboarding channel is removed, so unwind it cleanly
 * here. The seed + relink migrations and UserObserver are deleted in the same
 * change, so a fresh DB never recreates it and this becomes a pure no-op there.
 *
 * Idempotent + prod-safe: keyed by channel code, deletes children first, no-ops
 * when the channel is absent.
 */
return new class extends Migration
{
    private const CHANNEL_CODE = 'panduan-channels';

    public function up(): void
    {
        $channelId = DB::table('Channel')->where('code', self::CHANNEL_CODE)->value('id');
        if ($channelId === null) {
            return; // already gone (e.g. fresh DB without the old seed)
        }

        $messageIds = DB::table('ChannelMessage')->where('channelId', $channelId)->pluck('id')->all();

        if (!empty($messageIds)) {
            // Defensive: clear per-message child rows if those tables exist.
            foreach ([['ChannelMessageHidden', 'messageId'], ['SavedMessage', 'messageId'], ['MessageReminder', 'messageId']] as [$table, $col]) {
                if (Schema::hasTable($table) && Schema::hasColumn($table, $col)) {
                    DB::table($table)->whereIn($col, $messageIds)->delete();
                }
            }
        }

        if (Schema::hasTable('MessageReminder') && Schema::hasColumn('MessageReminder', 'channelId')) {
            DB::table('MessageReminder')->where('channelId', $channelId)->delete();
        }

        DB::table('ChannelMessage')->where('channelId', $channelId)->delete();
        DB::table('ChannelMember')->where('channelId', $channelId)->delete();
        DB::table('Channel')->where('id', $channelId)->delete();
    }

    public function down(): void
    {
        // Irreversible by design: the onboarding channel + its demo content were
        // removed deliberately. Rollback leaves it absent (the old seed migration
        // no longer exists to recreate it).
    }
};
