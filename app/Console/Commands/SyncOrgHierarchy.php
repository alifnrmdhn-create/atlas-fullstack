<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use App\Services\OrgHierarchyService;
use Illuminate\Console\Command;

/**
 * Selaraskan User.managerUserId dengan rantai jabatan (Position.reportsToPositionId).
 *
 * managerUserId adalah cache turunan: dahulu hanya di-seed, tak pernah dijaga
 * lewat UI sehingga melenceng dari struktur jabatan. Command ini menurunkannya
 * ulang dari rantai jabatan (lihat OrgHierarchyService) — idempotent, aman
 * dijalankan berulang.
 *
 * Pakai --dry-run untuk preview perubahan sebelum apply.
 */
class SyncOrgHierarchy extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'atlas:sync-hierarchy
        {--dry-run : Tampilkan perubahan tanpa menyimpan}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';
    protected $description = 'Turunkan ulang User.managerUserId dari rantai jabatan (Position.reportsToPositionId).';

    public function handle(OrgHierarchyService $hierarchy): int
    {
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');

        $changes = $hierarchy->recompute(apply: ! $dryRun);

        if ($changes === []) {
            $this->info('Sudah selaras — tidak ada perubahan managerUserId.');
            return self::SUCCESS;
        }

        $this->table(
            ['User', 'Atasan lama', 'Atasan baru'],
            array_map(fn ($c) => [
                "[{$c['userId']}] {$c['name']}",
                $c['from'] !== null ? "{$c['fromName']} ({$c['from']})" : '—',
                $c['to'] !== null ? "{$c['toName']} ({$c['to']})" : '—',
            ], $changes),
        );

        $this->info(($dryRun ? '[dry-run] ' : '') . count($changes) . ' perubahan' . ($dryRun ? ' (tidak disimpan).' : ' disimpan.'));

        return self::SUCCESS;
    }
}
