<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use App\Models\Blocker;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Backfill `createdByUnitId` untuk Blocker yang nilainya NULL.
 *
 * Konteks (Jun 2026): BlockerController::store dulu tak pernah mengisi
 * `createdByUnitId`, jadi semua blocker buatan app bernilai NULL. Sinyal blocker
 * di OrgSummaryService (criticalBlockers/needsAction, blockerSignal, controls)
 * di-scope `whereIn('createdByUnitId', $unitIds)` untuk viewer non-eksekutif —
 * dengan NULL, sinyalnya TAK PERNAH match → KADIV/KASUBDIV tak menerima blocker.
 *
 * Titik mutasi runtime (store) SUDAH diperbaiki: mewarisi unit pemilik program
 * task saat create. Command ini hanya merapikan data lama yang terlewat —
 * idempotent, aman dijalankan ulang (hanya menyentuh baris yang masih NULL).
 *
 * Nilai backfill = ownerUnitId program induk task (blocker → task → workstream →
 * program), sumber kebenaran yang sama dengan store. Blocker yang tak bisa
 * di-resolve (task/program/ownerUnit hilang) dilewati, dilaporkan terpisah.
 */
class BackfillBlockerUnit extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'blockers:backfill-unit
        {--dry-run : Tampilkan jumlah tanpa menulis}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';
    protected $description = 'Isi createdByUnitId untuk Blocker yang masih NULL dari unit pemilik program task. Idempotent.';

    public function handle(): int
    {
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        $total = Blocker::query()->whereNull('createdByUnitId')->count();
        if ($total === 0) {
            $this->info('Tidak ada Blocker dengan createdByUnitId NULL. Tidak ada yang dibackfill.');
            return self::SUCCESS;
        }

        // Resolve ownerUnitId per blocker lewat relasi (table/quoting aman).
        // unitId => list blockerId, plus daftar yang tak ter-resolve.
        $byUnit = [];   // [unitId => int[]]
        $orphan = [];   // blockerId[] tanpa program/unit

        Blocker::query()
            ->whereNull('createdByUnitId')
            ->with(['task:id,initiativeId', 'task.workstream:id,programId', 'task.workstream.program:id,ownerUnitId'])
            ->select(['id', 'workItemId'])
            ->chunkById(500, function ($blockers) use (&$byUnit, &$orphan) {
                foreach ($blockers as $b) {
                    $unitId = $b->task?->workstream?->program?->ownerUnitId;
                    if ($unitId === null) {
                        $orphan[] = $b->id;
                        continue;
                    }
                    $byUnit[(int) $unitId][] = $b->id;
                }
            });

        $resolvable = array_sum(array_map('count', $byUnit));

        if ($this->option('dry-run')) {
            $this->info("[dry-run] {$resolvable}/{$total} blocker akan diisi createdByUnitId (" . count($byUnit) . ' unit berbeda).');
            if ($orphan !== []) {
                $this->warn('[dry-run] ' . count($orphan) . ' blocker dilewati — task/program/ownerUnit tak ter-resolve.');
            }
            return self::SUCCESS;
        }

        // Bulk update per unit. Pakai query builder (BUKAN model save) supaya
        // updatedAt blocker TIDAK ikut ter-bump ke now() — usia/sinyal tetap utuh.
        $filled = 0;
        $table = (new Blocker)->getTable();
        foreach ($byUnit as $unitId => $ids) {
            $filled += DB::table($table)
                ->whereIn('id', $ids)
                ->whereNull('createdByUnitId')
                ->update(['createdByUnitId' => $unitId]);
        }

        $this->info("Selesai. {$filled}/{$total} blocker diisi createdByUnitId-nya.");
        if ($orphan !== []) {
            $this->warn(count($orphan) . ' blocker dilewati (task/program/ownerUnit hilang): ' . implode(', ', array_slice($orphan, 0, 20)) . (count($orphan) > 20 ? ', …' : ''));
        }

        return self::SUCCESS;
    }
}
