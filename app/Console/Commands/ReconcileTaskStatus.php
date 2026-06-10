<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

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
    use ConfirmsDestructiveRun;

    protected $signature = 'tasks:reconcile-status
        {--dry-run : Tampilkan perubahan tanpa menyimpan (transaksi di-rollback)}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';
    protected $description = 'Selaraskan status task dengan percentComplete (progress-driven). IN_REVIEW & BLOCKED dilewati.';

    public function handle(TaskService $service): int
    {
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        // Dry-run via transaksi rollback: logika reconcile (status log, cascade)
        // jalan utuh sehingga output identik run sungguhan, tapi tak ada yang
        // tersimpan.
        $dryRun = (bool) $this->option('dry-run');
        if ($dryRun) {
            DB::beginTransaction();
        }

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

        if ($dryRun) {
            DB::rollBack();
            $this->info('[dry-run] Transaksi di-rollback — tidak ada perubahan disimpan.');
        }

        $this->info("Selesai. {$scanned} task discan, {$changed} diselaraskan.");

        return self::SUCCESS;
    }
}
