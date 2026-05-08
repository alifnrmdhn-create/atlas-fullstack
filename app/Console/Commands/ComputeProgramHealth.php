<?php

namespace App\Console\Commands;

use App\Models\Program;
use App\Services\ProgramHealthService;
use Illuminate\Console\Command;

/**
 * Sprint 5 — Batch refresh autoHealth untuk semua program aktif.
 *
 * Re-compute jadi penting karena beberapa signal (task overdue ratio,
 * blocker count) berubah karena waktu, bukan event. Tanpa scheduled job,
 * task yang baru lewat tenggat tidak tercermin di health sampai ada
 * mutation lain yang trigger ProgramHealthService::recompute().
 *
 * Schedule: tiap 30 menit di routes/console.php.
 */
class ComputeProgramHealth extends Command
{
    protected $signature = 'atlas:compute-health {--program= : Program ID spesifik (opsional, default semua)}';
    protected $description = 'Re-compute autoHealthStatus untuk program aktif.';

    public function handle(ProgramHealthService $svc): int
    {
        $start = microtime(true);
        $count = 0;

        $query = Program::query()
            ->whereNull('archivedAt')
            ->whereIn('approvalStatus', ['ACTIVE'])
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED']);

        $specific = $this->option('program');
        if ($specific) {
            $query->where('id', (int) $specific);
        }

        $query->chunk(50, function ($programs) use ($svc, &$count) {
            foreach ($programs as $program) {
                rescue(function () use ($svc, $program, &$count) {
                    $svc->recompute($program->id);
                    $count++;
                });
            }
        });

        $elapsed = round(microtime(true) - $start, 2);
        $this->info("Computed health untuk {$count} program ({$elapsed}s).");
        return Command::SUCCESS;
    }
}
