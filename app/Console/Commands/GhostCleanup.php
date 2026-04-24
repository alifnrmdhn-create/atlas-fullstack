<?php

namespace App\Console\Commands;

use App\Models\UserSession;
use App\Models\UserStatus;
use App\Services\BroadcastService;
use Illuminate\Console\Command;

/**
 * Port dari backend/src/routes/realtime.ts → startGhostCleanup().
 *
 * Catatan: di Node.js, "ghost" ditentukan dari daftar koneksi SSE in-memory.
 * Di Laravel (stateless), kita tidak punya registry koneksi lintas worker.
 * Sebagai proxy, user dianggap ghost kalau:
 *   - status != OFFLINE
 *   - lastActivityAt > 10 menit lalu
 * Karena frontend ping tiap 60 detik, 10 menit idle = pasti bukan tab aktif.
 */
class GhostCleanup extends Command
{
    protected $signature = 'atlas:ghost-cleanup';
    protected $description = 'Mark stale UserStatus (non-OFFLINE + idle 10min) as OFFLINE.';

    private const IDLE_THRESHOLD_MS = 90_000;

    public function handle(): int
    {
        $staleThreshold = now()->subMinutes(10);

        $ghosts = UserStatus::query()
            ->where('status', '!=', 'OFFLINE')
            ->where('lastActivityAt', '<', $staleThreshold)
            ->get(['userId']);

        foreach ($ghosts as $ghost) {
            try {
                UserStatus::where('userId', $ghost->userId)->update(['status' => 'OFFLINE']);

                BroadcastService::presence(
                    $ghost->userId,
                    'OFFLINE',
                    $staleThreshold->toIso8601String(),
                );

                // Close lingering open sessions
                $openSessions = UserSession::query()
                    ->where('userId', $ghost->userId)
                    ->whereNull('endedAt')
                    ->get(['id', 'lastPingAt', 'durationMs']);

                foreach ($openSessions as $s) {
                    $gap = $s->lastPingAt ? ($staleThreshold->getTimestampMs() - $s->lastPingAt->getTimestampMs()) : 0;
                    $s->update([
                        'endedAt' => $staleThreshold,
                        'endReason' => 'idle',
                        ...($gap <= self::IDLE_THRESHOLD_MS
                            ? ['durationMs' => ($s->durationMs ?? 0) + $gap]
                            : []),
                    ]);
                }

                $this->info("Ghost cleaned: user {$ghost->userId}");
            } catch (\Throwable $e) {
                $this->error("Ghost cleanup failed for user {$ghost->userId}: {$e->getMessage()}");
            }
        }

        return Command::SUCCESS;
    }
}
