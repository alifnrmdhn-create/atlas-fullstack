<?php

namespace App\Console\Commands;

use App\Models\BroadcastEvent;
use Illuminate\Console\Command;

/**
 * Hapus broadcast events lama. Retensi dinaikkan dari 2 → 15 menit: dengan
 * retensi 2 menit, tab yang offline/idle/di-suspend browser > 2 menit akan
 * KEHILANGAN event di gap itu (cursor poll maju melewatinya tanpa tahu).
 * 15 menit memberi jendela aman; FE juga punya jaring pengaman resync saat
 * reconnect / kembali dari background lama (RealtimeProvider). Tabel tetap
 * ramping karena kolom userIds kini jsonb + GIN index.
 */
class CleanupBroadcastEvents extends Command
{
    protected $signature = 'atlas:cleanup-broadcast-events';
    protected $description = 'Delete broadcast events older than 15 minutes.';

    private const RETENTION_MINUTES = 15;

    public function handle(): int
    {
        $deleted = BroadcastEvent::where('createdAt', '<', now()->subMinutes(self::RETENTION_MINUTES))->delete();
        if ($deleted > 0) $this->info("Deleted {$deleted} old broadcast events.");
        return Command::SUCCESS;
    }
}
