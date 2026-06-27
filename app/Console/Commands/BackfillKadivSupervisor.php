<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Backfill `managerUserId` untuk KADIV yang nilainya NULL → Direktur (BOD)
 * direktoratnya.
 *
 * Konteks (Jun 2026): rantai jabatan di data org putus di atas Kadiv — Kadiv
 * ber-managerUserId NULL, padahal eskalasi (Clear the Path) auto-route lewat
 * `OrgChainService::getDirectSupervisor` yang mengikuti managerUserId. Akibatnya
 * eskalasi mentok di Kadiv & TAK PERNAH mencapai Direktur (Kadiv yang eskalasi
 * malah dapat "No direct supervisor available"). Lihat panel "Escalation path".
 *
 * Sumber kebenaran: Kadiv melapor ke Direktur (BOD) direktoratnya. Command ini
 * mengisi managerUserId Kadiv NULL = BOD aktif di direktorat yang sama bila
 * jumlahnya TEPAT satu. 0 atau >1 BOD → dilewati & dilaporkan (ambiguitas tak
 * ditebak). Idempotent: hanya menyentuh baris yang masih NULL, aman diulang.
 */
class BackfillKadivSupervisor extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'org:backfill-kadiv-supervisor
        {--dry-run : Tampilkan rencana tanpa menulis}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';
    protected $description = 'Isi managerUserId KADIV yang NULL = Direktur (BOD) direktoratnya. Idempotent.';

    public function handle(): int
    {
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        $kadivs = User::query()
            ->where('isActive', true)
            ->where('roleType', 'KADIV')
            ->whereNull('managerUserId')
            ->get(['id', 'name', 'directorateId']);

        if ($kadivs->isEmpty()) {
            $this->info('Tidak ada KADIV aktif dengan managerUserId NULL. Tidak ada yang dibackfill.');
            return self::SUCCESS;
        }

        // BOD aktif per direktorat — sumber target manager.
        $bodByDir = User::query()
            ->where('isActive', true)
            ->where('roleType', 'BOD')
            ->whereNotNull('directorateId')
            ->get(['id', 'name', 'directorateId'])
            ->groupBy('directorateId');

        $planned = [];   // [kadivId => bodId]
        $skipped = [];   // [kadivName => reason]

        foreach ($kadivs as $k) {
            $bods = $bodByDir->get($k->directorateId);
            if (!$bods || $bods->isEmpty()) {
                $skipped[$k->name] = "tidak ada BOD aktif di direktorat {$k->directorateId}";
                continue;
            }
            if ($bods->count() > 1) {
                $skipped[$k->name] = "ada {$bods->count()} BOD di direktorat {$k->directorateId} (ambigu)";
                continue;
            }
            $planned[$k->id] = $bods->first()->id;
        }

        foreach ($planned as $kadivId => $bodId) {
            $k = $kadivs->firstWhere('id', $kadivId);
            $bodName = $bodByDir->get($k->directorateId)->first()->name;
            $this->line("  {$k->name} → {$bodName} (id={$bodId})");
        }
        foreach ($skipped as $name => $reason) {
            $this->warn("  SKIP {$name}: {$reason}");
        }

        if ($this->option('dry-run')) {
            $this->info(sprintf('[dry-run] %d akan di-set, %d dilewati. Tidak ada yang ditulis.', count($planned), count($skipped)));
            return self::SUCCESS;
        }

        $written = 0;
        foreach ($planned as $kadivId => $bodId) {
            // Guard idempoten: hanya tulis bila MASIH null (anti race / re-run).
            $written += User::query()
                ->whereKey($kadivId)
                ->whereNull('managerUserId')
                ->update(['managerUserId' => $bodId]);
        }

        $this->info(sprintf('Selesai: %d KADIV di-set ke Direktur direktoratnya, %d dilewati.', $written, count($skipped)));
        return self::SUCCESS;
    }
}
