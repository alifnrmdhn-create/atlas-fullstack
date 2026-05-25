<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Models\User;
use App\Services\TaskService;
use Illuminate\Console\Command;

/**
 * Selaraskan status task dengan percentComplete (model progress-driven, refactor
 * hapus drag 2026-05-25). Data lama dari era drag bisa punya status yang tidak
 * konsisten dengan progres (mis. READY tapi sudah 34%) — task seperti itu nyangkut
 * di lane "Belum Mulai" padahal seharusnya "Berjalan". Command ini memperbaikinya.
 *
 * BLOCKED dilewati (di-clear via Blockers). Status legacy IN_REVIEW ikut
 * dinormalisasi karena Execution tidak punya jalur review.
 */
class ReconcileTaskStatus extends Command
{
    protected $signature = 'tasks:reconcile-status';
    protected $description = 'Selaraskan status task dengan percentComplete (progress-driven). IN_REVIEW & BLOCKED dilewati.';

    public function handle(TaskService $service): int
    {
        $fallbackActor = (int) (User::query()
            ->whereIn('roleType', ['SUPERADMIN', 'ADMIN'])
            ->value('id') ?? 0);

        $changed = 0;
        $scanned = 0;

        Task::query()
            ->with('workstream.program:id,approvalStatus')
            ->chunkById(200, function ($tasks) use ($service, $fallbackActor, &$changed, &$scanned) {
                foreach ($tasks as $task) {
                    $scanned++;
                    $from = $task->status;
                    $actor = (int) ($task->assignedTo ?: $task->createdBy ?: $fallbackActor);
                    $new = $service->reconcileStatusFromProgress($task, $actor);
                    if ($new !== null) {
                        $changed++;
                        $this->line("  #{$task->id} {$task->code}: {$from} → {$new} ({$task->percentComplete}%)");
                    }
                }
            });

        $this->info("Selesai. {$scanned} task discan, {$changed} diselaraskan.");

        return self::SUCCESS;
    }
}
