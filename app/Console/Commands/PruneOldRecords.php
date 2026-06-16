<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\UserSession;
use App\Models\WorkItemStatusLog;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * Prune record append-only lewat retensi (scale-readiness S3.1).
 *
 * Tabel ini dulu tumbuh selamanya — hanya broadcast_events (15 mnt) & FormDraft
 * (TTL harian) yang di-prune. Di skala besar, Notification/UserSession/
 * WorkItemStatusLog membengkak → query lambat + storage. Retensi dari
 * config('atlas-thresholds.retention'). position_history SENGAJA dilewati
 * (catatan audit SK jabatan).
 *
 * Delete di-batch (hindari transaksi raksasa & lock panjang); --dry-run
 * menghitung tanpa menghapus.
 */
class PruneOldRecords extends Command
{
    protected $signature = 'atlas:prune-old-records {--dry-run : Hitung tanpa menghapus}';
    protected $description = 'Hapus notifikasi/sesi/status-log lewat retensi (config atlas-thresholds.retention).';

    private const BATCH = 5000;
    private const MAX_BATCHES = 200; // backstop 1 juta baris/tabel/run

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $now = now();

        $notifCutoff = $now->copy()->subDays((int) config('atlas-thresholds.retention.notifications_days', 90));
        $sessionCutoff = $now->copy()->subDays((int) config('atlas-thresholds.retention.user_sessions_days', 60));
        $statusCutoff = $now->copy()->subDays((int) config('atlas-thresholds.retention.status_logs_days', 365));

        // Notifikasi: expired (kapan pun) ATAU sudah dibaca/dismiss & lewat retensi.
        $notif = $this->prune('Notification', Notification::query()
            ->where(fn (Builder $q) => $q
                ->where('expiresAt', '<', $now)
                ->orWhere(fn (Builder $q2) => $q2
                    ->where(fn (Builder $q3) => $q3->where('state', 'READ')->orWhereNotNull('dismissedAt'))
                    ->where('createdAt', '<', $notifCutoff))), $dry);

        // Sesi yang sudah ditutup & lewat retensi.
        $sessions = $this->prune('UserSession', UserSession::query()
            ->whereNotNull('endedAt')
            ->where('endedAt', '<', $sessionCutoff), $dry);

        // Log status task lewat retensi (audit — konservatif).
        $statusLogs = $this->prune('WorkItemStatusLog', WorkItemStatusLog::query()
            ->where('createdAt', '<', $statusCutoff), $dry);

        $tag = $dry ? '[dry-run] akan menghapus' : 'Dihapus';
        $this->info("{$tag}: Notification={$notif}, UserSession={$sessions}, WorkItemStatusLog={$statusLogs}.");

        return self::SUCCESS;
    }

    /** Hitung (dry) atau hapus ber-batch; kembalikan jumlah baris terdampak. */
    private function prune(string $label, Builder $query, bool $dry): int
    {
        if ($dry) {
            return (clone $query)->count();
        }

        $model = $query->getModel();
        $key = $model->getKeyName();
        $table = $model->getTable();
        $deleted = 0;

        for ($i = 0; $i < self::MAX_BATCHES; $i++) {
            $ids = (clone $query)->limit(self::BATCH)->pluck($key);
            if ($ids->isEmpty()) {
                break;
            }
            $deleted += $model->newQuery()->whereIn($key, $ids)->delete();
        }

        if ($deleted > 0) {
            $this->line("  {$table}: {$deleted} baris dihapus.");
        }

        return $deleted;
    }
}
