<?php

namespace App\Console\Commands;

use App\Models\FormDraft;
use Illuminate\Console\Command;

/**
 * Hapus form drafts yang sudah lewat expiresAt. Default TTL 7 hari
 * (atlas-thresholds.autosave.ttl_days). Cleanup harian — non-time-critical,
 * cukup jalan tengah malam supaya tidak ribut kalau ada akumulasi besar.
 */
class CleanupFormDrafts extends Command
{
    protected $signature = 'atlas:cleanup-form-drafts';
    protected $description = 'Delete expired form drafts (past expiresAt).';

    public function handle(): int
    {
        $deleted = FormDraft::where('expiresAt', '<', now())->delete();
        if ($deleted > 0) $this->info("Deleted {$deleted} expired form drafts.");
        return Command::SUCCESS;
    }
}
