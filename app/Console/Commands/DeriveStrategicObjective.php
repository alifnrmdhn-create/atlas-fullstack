<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;

/**
 * Derive 1-kalimat "Strategic Objective" per program DKMR dari konteks riil.
 *
 * Konteks (Jun 2026): kolom Program.strategicObjective NULL untuk 97 program
 * (hero ProgramDetailView menampilkan "Not set"). Seeder tidak pernah mengisinya
 * karena PDF monitoring DKMR tidak memuat field tsb. Daripada karangan dari
 * template (pilar+kelompok), objective DISINTESIS dari scope nyata program.
 *
 * Alur 2 langkah (command ini hanya I/O; sintesis dikerjakan workflow multi-agent):
 *   1. `extract` — bundel konteks penuh tiap program (Program meta + phases/tasks/
 *      note monitoring dari programs_execution_2026.json + link KPI) ke batch file
 *      di storage/app/strategic-objective/batches/, plus manifest.json. Workflow
 *      membaca batch file ini, men-draft + verifikasi objective, lalu menulis
 *      results.json (array {code, objective}).
 *   2. `apply` — baca results.json, tulis ke Program.strategicObjective.
 *      IDEMPOTENT: lewati program yang strategicObjective-nya SUDAH terisi
 *      (anggap input owner manusia) kecuali --force. Dukung --prod.
 *
 * Gaya objective: Bahasa Indonesia, 1 kalimat ringkas, outcome-oriented.
 */
class DeriveStrategicObjective extends Command
{
    protected $signature = 'programs:strategic-objective
        {action : extract | apply}
        {--prod : jalankan ke koneksi prod (butuh env DB_URL = DATABASE_PUBLIC_URL Railway)}
        {--force : (apply) timpa strategicObjective yang sudah terisi}
        {--dry-run : (apply) tampilkan rencana tanpa menulis}
        {--batch-size=6 : (extract) jumlah program per batch file}';

    protected $description = 'Extract konteks program untuk derivasi Strategic Objective, atau apply hasil (results.json) ke DB. Idempotent.';

    private const DIR = 'strategic-objective';

    public function handle(): int
    {
        return match ($this->argument('action')) {
            'extract' => $this->extract(),
            'apply'   => $this->apply(),
            default   => $this->bail('action harus "extract" atau "apply".'),
        };
    }

    private function dir(): string
    {
        return storage_path('app/'.self::DIR);
    }

    /** Koneksi target: default local, atau prod via env DB_URL bila --prod. */
    private function conn(): ConnectionInterface
    {
        if (! $this->option('prod')) {
            return DB::connection();
        }
        $url = getenv('DB_URL') ?: '';
        if ($url === '') {
            throw new \RuntimeException('--prod butuh env DB_URL (DATABASE_PUBLIC_URL Railway).');
        }
        $p = parse_url($url);
        config(['database.connections.pgprod' => [
            'driver'      => 'pgsql',
            'host'        => $p['host'] ?? '',
            'port'        => $p['port'] ?? 5432,
            'database'    => ltrim($p['path'] ?? '', '/'),
            'username'    => rawurldecode($p['user'] ?? ''),
            'password'    => rawurldecode($p['pass'] ?? ''),
            'search_path' => 'ptpn_kmr_app',
            'sslmode'     => 'require',
            'charset'     => 'utf8',
        ]]);

        return DB::connection('pgprod');
    }

    private function bail(string $msg): int
    {
        $this->error($msg);

        return self::FAILURE;
    }

    // ---------------------------------------------------------------- extract

    private function extract(): int
    {
        $execPath = database_path('seeders/data/programs_execution_2026.json');
        $exec = file_exists($execPath)
            ? collect(json_decode(file_get_contents($execPath), true) ?: [])->keyBy('code')
            : collect();

        $kpiByProgram = DB::table('ProgramKpiLink')
            ->get()
            ->groupBy('programId');

        $programs = DB::table('Program')->orderBy('code')->get();

        $contexts = [];
        foreach ($programs as $p) {
            $execEntry = $exec->get($p->code);
            $phases = [];
            foreach (($execEntry['phases'] ?? []) as $ph) {
                $tasks = [];
                foreach (($ph['tasks'] ?? []) as $t) {
                    $tasks[] = array_filter([
                        'title'  => $t['title'] ?? null,
                        'status' => $t['status'] ?? null,
                        'note'   => $t['note'] ?? null,
                    ], fn ($v) => $v !== null && $v !== '');
                }
                $phases[] = ['name' => $ph['name'] ?? '', 'tasks' => $tasks];
            }

            $kpis = ($kpiByProgram->get($p->id) ?? collect())
                ->map(fn ($k) => trim(($k->apmsKpiCode ?? '').' '.($k->apmsKpiName ?? '')))
                ->filter()
                ->values()
                ->all();

            // divisi dari code: PRG-DKMR-{DIV}-NNN
            $parts = explode('-', (string) $p->code);
            $divisionCode = $parts[2] ?? '';

            $contexts[] = array_filter([
                'code'               => $p->code,
                'name'               => $p->name,
                'description'        => $p->description,
                'divisionCode'       => $divisionCode,
                'kelompok'           => $p->kelompok,
                'pilarStrategis'     => $p->pilarStrategis,
                'priority'           => $p->priority,
                'progresTerkini'     => $p->progresTerkini,
                'dukunganDibutuhkan' => $p->dukunganDibutuhkan,
                'phases'             => $phases ?: null,
                'kpiLinks'           => $kpis ?: null,
            ], fn ($v) => $v !== null && $v !== '' && $v !== []);
        }

        $batchSize = max(1, (int) $this->option('batch-size'));
        $batchesDir = $this->dir().'/batches';
        if (! is_dir($batchesDir)) {
            @mkdir($batchesDir, 0775, true);
        }
        // bersihkan batch lama
        foreach (glob($batchesDir.'/batch-*.json') ?: [] as $old) {
            @unlink($old);
        }

        $chunks = array_chunk($contexts, $batchSize);
        $manifest = [];
        foreach ($chunks as $i => $chunk) {
            $file = sprintf('%s/batch-%02d.json', $batchesDir, $i);
            file_put_contents($file, json_encode($chunk, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $manifest[] = [
                'index' => $i,
                'file'  => $file,
                'codes' => array_column($chunk, 'code'),
                'count' => count($chunk),
            ];
        }

        $manifestPath = $this->dir().'/manifest.json';
        file_put_contents($manifestPath, json_encode([
            'batchSize' => $batchSize,
            'total'     => count($contexts),
            'batches'   => $manifest,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        $this->info(sprintf('Extract selesai: %d program → %d batch (size %d).', count($contexts), count($chunks), $batchSize));
        $this->line('Manifest : '.$manifestPath);
        $this->line('Batches  : '.$batchesDir);

        return self::SUCCESS;
    }

    // ------------------------------------------------------------------ apply

    private function apply(): int
    {
        $resultsPath = $this->dir().'/results.json';
        if (! file_exists($resultsPath)) {
            return $this->bail("results.json tidak ditemukan: {$resultsPath}");
        }
        $results = json_decode(file_get_contents($resultsPath), true);
        if (! is_array($results)) {
            return $this->bail('results.json bukan array JSON valid.');
        }

        // Normalisasi: terima {code, objective} (abaikan field lain spt confidence/flags).
        $byCode = [];
        foreach ($results as $r) {
            $code = $r['code'] ?? null;
            $obj = isset($r['objective']) ? trim((string) $r['objective']) : '';
            if ($code && $obj !== '') {
                $byCode[$code] = $obj;
            }
        }
        if (empty($byCode)) {
            return $this->bail('Tidak ada {code, objective} valid di results.json.');
        }

        $conn = $this->conn();
        $target = $this->option('prod') ? 'PROD' : 'LOCAL';
        $force = (bool) $this->option('force');
        $dry = (bool) $this->option('dry-run');

        $existing = $conn->table('Program')
            ->whereIn('code', array_keys($byCode))
            ->get(['code', 'strategicObjective'])
            ->keyBy('code');

        $toWrite = [];
        $skippedSet = [];
        $missing = [];
        foreach ($byCode as $code => $obj) {
            $row = $existing->get($code);
            if (! $row) {
                $missing[] = $code;
                continue;
            }
            $current = trim((string) ($row->strategicObjective ?? ''));
            if ($current !== '' && ! $force) {
                $skippedSet[] = $code;
                continue;
            }
            $toWrite[$code] = $obj;
        }

        $this->info("[$target] {$this->plural(count($toWrite), 'program')} akan ditulis · ".
            count($skippedSet).' dilewati (sudah terisi) · '.count($missing).' tak ditemukan.');

        if (! empty($toWrite)) {
            $sampleCode = array_key_first($toWrite);
            $this->line('');
            $this->line("Contoh ($sampleCode):");
            $this->line('  '.$toWrite[$sampleCode]);
        }
        if (! empty($missing)) {
            $this->warn('Tak ditemukan: '.implode(', ', $missing));
        }

        if ($dry) {
            $this->comment('[dry-run] tidak ada perubahan ditulis.');

            return self::SUCCESS;
        }

        if (empty($toWrite)) {
            $this->comment('Tidak ada yang perlu ditulis.');

            return self::SUCCESS;
        }

        $conn->transaction(function () use ($conn, $toWrite) {
            foreach ($toWrite as $code => $obj) {
                $conn->table('Program')->where('code', $code)->update([
                    'strategicObjective' => $obj,
                    'updatedAt'          => now(),
                ]);
            }
        });

        $this->info("[$target] Selesai. ".count($toWrite).' strategicObjective ter-update.');

        return self::SUCCESS;
    }

    private function plural(int $n, string $word): string
    {
        return $n.' '.$word;
    }
}
