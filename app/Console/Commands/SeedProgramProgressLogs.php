<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Seed satu ProgramProgressLog "draft otomatis" per program DKMR 2026.
 *
 * Konteks (Jun 2026): Charter View blok "Current Update" + "PICA & Next Steps"
 * kosong untuk 97 program karena tabel ProgramProgressLog 0 baris — bukan bug,
 * memang belum ada data narasi. Command ini mengisi dari bahan baku riil: field
 * `note` per-task di database/seeders/data/programs_execution_2026.json (narasi
 * "Progres Terkini" monitoring DKMR s.d. 22 Mei 2026).
 *
 * Yang DI-DERIVE dari note riil (grounded):
 *   - narrative   : sintesis dari note task COMPLETED/IN_PROGRESS + ringkasan progres
 *   - kendala     : note task TODO (umumnya sudah eksplisit "menunggu X / belum Y")
 *   - nextStep    : judul task IN_PROGRESS/TODO terdekat yang tertunda
 *   - supportNeeded: note ber-kata-kunci eskalasi (audiensi/payung hukum/penugasan/...)
 * Yang SEMI-ASUMSI (template, ditandai draft):
 *   - correctiveAction: rencana percepatan item yang ter-block (hanya bila ada kendala)
 *
 * Konvensi tanggal: update progres ATLAS = mingguan tiap Jumat. "As of" = Jumat
 * terakhir 29 Mei 2026 = ISO week 2026-W22 (formatPeriodLabel → "Minggu ke-22 · Mei 2026").
 *
 * Idempotent: hapus draft lama (createdByName = MARKER) per program lalu re-insert.
 * Log buatan owner manusia (createdByName lain) TIDAK disentuh — dan karena Charter
 * baca log createdAt TERBARU, update manual owner akan menggeser draft ini.
 */
class SeedProgramProgressLogs extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'programs:seed-progress-logs
        {--dry-run : Tampilkan ringkasan tanpa menulis}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';
    protected $description = 'Isi 1 ProgramProgressLog draft per program dari note monitoring (Charter: Current Update + PICA). Idempotent.';

    private const MARKER = 'Sistem — draft otomatis';
    private const PERIOD = '2026-W22';
    private const AS_OF = '2026-05-29 17:00:00';

    private const MONTH_NUM = ['Jan' => 1, 'Feb' => 2, 'Mar' => 3, 'Apr' => 4, 'Mei' => 5, 'Jun' => 6, 'Jul' => 7, 'Agt' => 8, 'Sep' => 9, 'Okt' => 10, 'Nov' => 11, 'Des' => 12];

    private const ESCALATION_KW = ['audiensi', 'payung hukum', 'penugasan', 'eskalasi', 'arahan', 'persetujuan', 'keputusan'];

    public function handle(): int
    {
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        $path = database_path('seeders/data/programs_execution_2026.json');
        if (! file_exists($path)) {
            $this->error("File tidak ditemukan: {$path}");
            return self::FAILURE;
        }
        $data = json_decode(file_get_contents($path), true);
        if (! is_array($data)) {
            $this->error('JSON execution tidak valid.');
            return self::FAILURE;
        }

        $programs = DB::table('Program')->get()->keyBy('code');
        $asOf = Carbon::parse(self::AS_OF);
        $dryRun = (bool) $this->option('dry-run');

        $built = 0;
        $skipped = [];
        $withKendala = 0;
        $rows = [];

        foreach ($data as $entry) {
            $code = $entry['code'] ?? null;
            $program = $code ? $programs->get($code) : null;
            if (! $program) {
                if ($code) {
                    $skipped[] = $code;
                }
                continue;
            }

            $log = $this->buildLog($program, $entry, $asOf);
            if ($log === null) {
                continue;
            }
            if ($log['kendala'] !== null) {
                $withKendala++;
            }
            $rows[] = $log;
            $built++;
        }

        if ($dryRun) {
            $this->info("[dry-run] {$built} progress log akan ditulis ({$withKendala} ber-kendala).");
            if (! empty($rows)) {
                $s = $rows[0];
                $this->line('');
                $this->line('Contoh ('.($s['_code'] ?? '').'):');
                $this->line('  narrative : '.$s['narrative']);
                $this->line('  kendala   : '.($s['kendala'] ?? '—'));
                $this->line('  corrective: '.($s['correctiveAction'] ?? '—'));
                $this->line('  nextStep  : '.($s['nextStep'] ?? '—'));
                $this->line('  support   : '.($s['dukunganDibutuhkan'] ?? '—'));
            }
            if (! empty($skipped)) {
                $this->warn('Program tak ditemukan (dilewati): '.implode(', ', $skipped));
            }
            return self::SUCCESS;
        }

        DB::transaction(function () use ($rows) {
            $programIds = array_column($rows, 'programId');
            // Idempotent: buang draft lama (marker) saja — log manual owner aman.
            DB::table('ProgramProgressLog')
                ->whereIn('programId', $programIds)
                ->where('createdByName', self::MARKER)
                ->delete();

            foreach (array_chunk($rows, 100) as $chunk) {
                $insert = array_map(function ($r) {
                    unset($r['_code']);
                    return $r;
                }, $chunk);
                DB::table('ProgramProgressLog')->insert($insert);
            }
        });

        $this->info("Selesai. {$built} progress log draft ter-seed ({$withKendala} ber-kendala). Period {$asOf->format('Y-m-d')} (".self::PERIOD.').');
        if (! empty($skipped)) {
            $this->warn('Program tak ditemukan (dilewati): '.implode(', ', $skipped));
        }

        return self::SUCCESS;
    }

    private function buildLog(object $program, array $entry, Carbon $asOf): ?array
    {
        $completed = [];
        $inProgress = [];
        $todo = [];
        $pctSum = 0;
        $count = 0;

        foreach (($entry['phases'] ?? []) as $ph) {
            foreach (($ph['tasks'] ?? []) as $t) {
                $count++;
                $pctSum += (int) ($t['percentComplete'] ?? 0);
                $row = [
                    'title' => trim($t['title'] ?? ''),
                    'note' => trim($t['note'] ?? ''),
                    'months' => $t['plannedMonths'] ?? [],
                ];
                match ($t['status'] ?? 'TODO') {
                    'COMPLETED' => $completed[] = $row,
                    'IN_PROGRESS' => $inProgress[] = $row,
                    default => $todo[] = $row,
                };
            }
        }

        if ($count === 0) {
            return null;
        }

        $nDone = count($completed);
        $pct = (int) round($pctSum / $count);

        // narrative — selalu non-null. Ringkasan + note kerja terkini.
        $lead = "Per {$asOf->format('d')} Mei 2026: {$nDone} dari {$count} aktivitas selesai ({$pct}%).";
        $sourceNotes = ! empty($inProgress) ? $inProgress : $completed;
        $noteText = $this->joinNotes($sourceNotes, 3);
        $narrative = trim($lead.($noteText !== '' ? ' '.$noteText : ''));

        // kendala — note task TODO (blocker eksplisit). null bila tak ada TODO.
        $kendala = $this->joinNotes($todo, 3) ?: null;

        // correctiveAction — semi-asumsi, hanya bila ada kendala.
        $correctiveAction = null;
        if ($kendala !== null) {
            $nextTitles = $this->titles($this->sortByEarliestMonth($todo), 2);
            if ($nextTitles !== '') {
                $correctiveAction = "Mempercepat penyelesaian {$nextTitles} serta mengintensifkan koordinasi dengan pihak terkait untuk membuka hambatan tersebut.";
            }
        }

        // nextStep — pekerjaan tertunda.
        $pending = array_merge($inProgress, $this->sortByEarliestMonth($todo));
        $pendingTitles = $this->titles($pending, 3);
        if ($pendingTitles !== '') {
            $nextStep = "Melanjutkan & menyelesaikan: {$pendingTitles}.";
        } elseif ($nDone === $count) {
            $nextStep = 'Seluruh aktivitas selesai; lanjut ke monitoring & pelaporan penutup.';
        } else {
            $nextStep = null;
        }

        // dukunganDibutuhkan — note ber-kata-kunci eskalasi.
        $supportNeeded = $this->joinNotes($this->filterEscalation(array_merge($inProgress, $todo)), 2) ?: null;

        return [
            '_code' => $program->code,
            'programId' => $program->id,
            'period' => self::PERIOD,
            'healthAtTime' => $program->healthStatus ?? 'GREEN',
            'narrative' => $narrative,
            'kendala' => $kendala,
            'correctiveAction' => $correctiveAction,
            'nextStep' => $nextStep,
            'dukunganDibutuhkan' => $supportNeeded,
            'createdById' => $program->ownerId,
            'createdByName' => self::MARKER,
            'isLate' => false,
            'createdAt' => $asOf,
            'updatedAt' => $asOf,
        ];
    }

    /** Gabung note unik (non-kosong) jadi paragraf, tiap note diakhiri titik. */
    private function joinNotes(array $tasks, int $limit): string
    {
        $seen = [];
        $out = [];
        foreach ($tasks as $t) {
            $note = $t['note'] ?? '';
            if ($note === '') {
                continue;
            }
            $key = mb_strtolower($note);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = rtrim($note, " \t.;").'.';
            if (count($out) >= $limit) {
                break;
            }
        }
        return implode(' ', $out);
    }

    /** Daftar judul unik jadi frasa "a, b, c". */
    private function titles(array $tasks, int $limit): string
    {
        $seen = [];
        $out = [];
        foreach ($tasks as $t) {
            $title = $t['title'] ?? '';
            if ($title === '') {
                continue;
            }
            $key = mb_strtolower($title);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $title;
            if (count($out) >= $limit) {
                break;
            }
        }
        return implode(', ', $out);
    }

    /** Urutkan task by bulan rencana paling awal (untuk "berikutnya"). */
    private function sortByEarliestMonth(array $tasks): array
    {
        usort($tasks, function ($a, $b) {
            return $this->earliestMonth($a['months'] ?? []) <=> $this->earliestMonth($b['months'] ?? []);
        });
        return $tasks;
    }

    private function earliestMonth(array $months): int
    {
        $nums = [];
        foreach ($months as $m) {
            if (isset(self::MONTH_NUM[$m])) {
                $nums[] = self::MONTH_NUM[$m];
            }
        }
        return empty($nums) ? 99 : min($nums);
    }

    /** Task yang note-nya memuat sinyal eskalasi. */
    private function filterEscalation(array $tasks): array
    {
        return array_values(array_filter($tasks, function ($t) {
            $note = mb_strtolower($t['note'] ?? '');
            foreach (self::ESCALATION_KW as $kw) {
                if ($note !== '' && str_contains($note, $kw)) {
                    return true;
                }
            }
            return false;
        }));
    }
}
