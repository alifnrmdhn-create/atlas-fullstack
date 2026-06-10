<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use App\Models\Task;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Backfill `actualCompletion` untuk task COMPLETED yang nilainya NULL.
 *
 * Konteks (Jun 2026): seeder eksekusi (ProgramExecutionSeeder) menulis status
 * COMPLETED langsung ke DB tanpa lewat TaskService, jadi `actualCompletion` tak
 * pernah terisi. Akibatnya metrik Home "Tasks done · this week" (filter
 * actualCompletion >= now-7d) tak pernah match → 99 task selesai jadi tak terlihat.
 *
 * Titik mutasi runtime (TaskService::updateStatus / updateProgress) SUDAH benar:
 * mereka set actualCompletion = now() saat ke COMPLETED. Command ini hanya
 * merapikan data seed yang terlewat — idempotent, aman dijalankan ulang
 * (hanya menyentuh baris yang masih NULL).
 *
 * Nilai backfill = LEAST(targetCompletion, updatedAt): tanggal selesai yang
 * paling defensibel untuk data derived — tak melampaui kapan baris terakhir
 * berubah, dan jatuh ke tanggal target bila itu lebih awal. Fallback ke
 * updatedAt bila targetCompletion null.
 */
class BackfillTaskCompletion extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'tasks:backfill-completion
        {--dry-run : Tampilkan jumlah tanpa menulis}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';
    protected $description = 'Isi actualCompletion untuk task COMPLETED yang masih NULL (data seed). Idempotent.';

    public function handle(): int
    {
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        $query = Task::query()
            ->where('status', 'COMPLETED')
            ->whereNull('actualCompletion');

        $total = (clone $query)->count();
        if ($total === 0) {
            $this->info('Tidak ada task COMPLETED dengan actualCompletion NULL. Tidak ada yang dibackfill.');
            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->info("[dry-run] {$total} task akan dibackfill (LEAST(targetCompletion, updatedAt)).");
            return self::SUCCESS;
        }

        // Satu UPDATE atomik. LEAST(COALESCE(target, updated), updated):
        //  - target ada → LEAST(target, updated) (tak melampaui terakhir berubah)
        //  - target null → updated.
        // Tulis via query builder (BUKAN model save) supaya updatedAt TIDAK ikut
        // ter-bump ke now() — anchor & sinyal stagnant tetap utuh.
        $filled = DB::table((new Task)->getTable())
            ->where('status', 'COMPLETED')
            ->whereNull('actualCompletion')
            ->update([
                'actualCompletion' => DB::raw('LEAST(COALESCE("targetCompletion", "updatedAt"), "updatedAt")'),
            ]);

        $this->info("Selesai. {$filled}/{$total} task dibackfill actualCompletion-nya.");

        return self::SUCCESS;
    }
}
