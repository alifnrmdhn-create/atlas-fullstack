<?php

namespace App\Console\Commands;

use App\Models\BroadcastEvent;
use Illuminate\Console\Command;

/**
 * Hapus broadcast events > 2 menit. Setelah sampai di semua tab yang konek,
 * event tidak perlu dipertahankan — hanya bloat tabel.
 */
class CleanupBroadcastEvents extends Command
{
    protected $signature = 'atlas:cleanup-broadcast-events';
    protected $description = 'Delete broadcast events older than 2 minutes.';

    public function handle(): int
    {
        $deleted = BroadcastEvent::where('createdAt', '<', now()->subMinutes(2))->delete();
        if ($deleted > 0) $this->info("Deleted {$deleted} old broadcast events.");
        return Command::SUCCESS;
    }
}
