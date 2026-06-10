<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use App\Services\ProgramHealthService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Simulasikan kemajuan eksekusi 97 program DKMR dari snapshot monitoring
 * 22 Mei 2026 ke checkpoint mingguan berikutnya (default Jumat 5 Jun = ISO 2026-W23).
 *
 * MODEL "catch-up jadwal" (keputusan user 2026-06-08): asumsikan tim mengejar
 * rencana s.d. minggu as-of. Aturan deterministik per task — fungsi murni dari
 * (baseline JSON 22-Mei + as-of week), BUKAN inkremen-dari-DB, supaya:
 *   - idempotent: re-run = hasil identik (baca baseline JSON yang stabil, overwrite by code);
 *   - lokal == prod: jalankan command yang sama di kedua DB (env DATABASE_PUBLIC_URL utk prod).
 *
 * Aturan (asOf = nomor minggu ISO dari --as-of):
 *   - COMPLETED di baseline           → tetap selesai (actualCompletion lama dipertahankan).
 *   - window selesai (lastWeek≤asOf):
 *       · note blocker eksternal (payung hukum/audiensi/penugasan/…) & masih TODO
 *                                       → HOLD: IN_PROGRESS, pct=max(base,65). Jujur: tak dipaksa 100%.
 *       · selain itu                   → COMPLETED 100%, actualCompletion = Jumat minggu min(lastWeek,asOf).
 *   - straddle (firstWeek≤asOf<lastWeek) → IN_PROGRESS, pct = max(base, proporsi minggu ≤ asOf).
 *   - future (firstWeek>asOf)          → tak disentuh (tetap baseline).
 *   - tak pernah mundur (pct/status hanya maju).
 *
 * Setelah task: rollup Phase.status + Initiative(progress/status/health) + Program.progressPercent,
 * lalu ProgramHealthService::recompute(), lalu tulis 1 ProgramProgressLog draft period as-of
 * (narasi di-derive dari STATE DB BARU, bukan JSON statis). Log period lain (mis. W22)
 * dipertahankan — append, bukan wipe.
 *
 * Match task by `code` (WI-…) hasil ProgramExecutionSeeder; task di luar pola itu tidak disentuh.
 */
class SimulateProgress extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'programs:simulate-progress
        {--as-of=2026-06-05 : Tanggal checkpoint (Jumat). Periode ISO diturunkan otomatis.}
        {--dry-run : Hitung & tampilkan ringkasan tanpa menulis apa pun}
        {--no-logs : Lewati penulisan ProgramProgressLog}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';

    protected $description = 'Simulasikan kemajuan eksekusi (catch-up jadwal) s.d. checkpoint mingguan. Idempotent.';

    private const MARKER = 'Sistem — draft otomatis';

    private const MONTH_WEEKS = [
        'Jan' => [1, 2, 3, 4], 'Feb' => [5, 6, 7, 8], 'Mar' => [9, 10, 11, 12, 13], 'Apr' => [14, 15, 16, 17],
        'Mei' => [18, 19, 20, 21, 22], 'Jun' => [23, 24, 25, 26], 'Jul' => [27, 28, 29, 30, 31], 'Agt' => [32, 33, 34, 35],
        'Sep' => [36, 37, 38, 39], 'Okt' => [40, 41, 42, 43, 44], 'Nov' => [45, 46, 47, 48], 'Des' => [49, 50, 51, 52],
    ];

    private const MONTH_NUM = ['Jan' => 1, 'Feb' => 2, 'Mar' => 3, 'Apr' => 4, 'Mei' => 5, 'Jun' => 6, 'Jul' => 7, 'Agt' => 8, 'Sep' => 9, 'Okt' => 10, 'Nov' => 11, 'Des' => 12];
    private const MONTH_ID = [1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April', 5 => 'Mei', 6 => 'Juni', 7 => 'Juli', 8 => 'Agustus', 9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember'];

    // Sinyal blocker eksternal: item begini TIDAK dipaksa selesai (jaga kejujuran narasi).
    private const ESCALATION_KW = ['payung hukum', 'audiensi', 'penugasan', 'belum terbit', 'menunggu kejelasan', 'eskalasi', 'belum diberikan'];

    public function handle(ProgramHealthService $health): int
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

        $asOf = Carbon::parse($this->option('as-of'))->setTime(17, 0);
        $asOfWeek = (int) $asOf->format('W');
        $period = $asOf->format('o-\WW'); // ISO year + week, e.g. 2026-W23
        $year = (int) $asOf->format('Y');
        $dryRun = (bool) $this->option('dry-run');
        $writeLogs = ! (bool) $this->option('no-logs');

        $programs = DB::table('Program')->get()->keyBy('code');

        $this->info("Simulasi catch-up s.d. {$asOf->toDateString()} (period {$period}, week {$asOfWeek}).".($dryRun ? '  [DRY-RUN]' : ''));

        // Tally agregat untuk ringkasan.
        $tStat = ['from' => ['TODO' => 0, 'IN_PROGRESS' => 0, 'COMPLETED' => 0], 'to' => ['TODO' => 0, 'IN_PROGRESS' => 0, 'COMPLETED' => 0]];
        $newlyCompleted = 0;
        $residualBlocked = 0;
        $touchedPrograms = [];
        $logRows = [];

        DB::beginTransaction();
        try {
            foreach ($data as $entry) {
                $code = $entry['code'] ?? null;
                $program = $code ? $programs->get($code) : null;
                if (! $program) {
                    continue;
                }

                $tasksByCode = DB::table('WorkItem')
                    ->where('initiativeId', function ($q) use ($program) {
                        $q->select('id')->from('Initiative')->where('programId', $program->id)->limit(1);
                    })
                    ->get()
                    ->keyBy('code');

                // Kalau eksekusi belum di-seed, lewati program ini.
                if ($tasksByCode->isEmpty()) {
                    continue;
                }

                $suffix = preg_replace('/^PRG-/', '', $program->code);
                $programHasResidual = false;
                $programNewPcts = [];
                $phaseAgg = [];       // phaseId => list status baru
                $initiativeId = null;
                $narrativeTasks = [];  // utk derive log dari state baru

                foreach (($entry['phases'] ?? []) as $pi => $ph) {
                    foreach (($ph['tasks'] ?? []) as $ti => $t) {
                        $tcode = "WI-{$suffix}-{$pi}-{$ti}";
                        $row = $tasksByCode->get($tcode);
                        if (! $row) {
                            continue; // task di-edit/dihapus manual — jangan sentuh.
                        }
                        $initiativeId = $row->initiativeId;

                        $baseStatus = $t['status'] ?? 'TODO';
                        $basePct = (int) ($t['percentComplete'] ?? 0);
                        $months = $t['plannedMonths'] ?? [];
                        $note = trim($t['note'] ?? '');
                        $weeks = $this->weeksOf($months);
                        $first = $weeks ? min($weeks) : 99;
                        $last = $weeks ? max($weeks) : 0;

                        [$newStatus, $newPct, $isResidual] = $this->project($baseStatus, $basePct, $first, $last, $asOfWeek, $note);
                        if ($isResidual) {
                            $residualBlocked++;
                            $programHasResidual = true;
                        }

                        $tStat['from'][$baseStatus] = ($tStat['from'][$baseStatus] ?? 0) + 1;
                        $tStat['to'][$newStatus] = ($tStat['to'][$newStatus] ?? 0) + 1;
                        $programNewPcts[] = $newPct;
                        $phaseAgg[$row->phaseId][] = $newStatus;

                        $narrativeTasks[] = [
                            'title' => trim($t['title'] ?? ($row->title ?? '')),
                            'note' => $note,
                            'months' => $months,
                            'status' => $newStatus,
                            'blocked' => $isResidual,
                        ];

                        // actualCompletion: hanya saat baru selesai. Yang sudah COMPLETED di baseline
                        // pertahankan tanggal lama (backfill riil). Deterministik = idempotent.
                        $update = [
                            'status' => $newStatus,
                            'percentComplete' => $newPct,
                            'updatedAt' => $asOf,
                        ];
                        if ($newStatus === 'COMPLETED' && $baseStatus !== 'COMPLETED') {
                            $newlyCompleted++;
                            $doneWeek = min($last, $asOfWeek);
                            $update['actualCompletion'] = $this->fridayOfWeek($year, $doneWeek)->setTime(17, 0);
                        }

                        if (! $dryRun) {
                            DB::table('WorkItem')->where('id', $row->id)->update($update);
                        }
                    }
                }

                if ($initiativeId === null) {
                    continue;
                }
                $touchedPrograms[] = $program->id;

                // Rollup Phase.status
                if (! $dryRun) {
                    foreach ($phaseAgg as $phaseId => $statuses) {
                        DB::table('Phase')->where('id', $phaseId)->update([
                            'status' => $this->derivePhaseStatus($statuses),
                            'updatedAt' => $asOf,
                        ]);
                    }
                }

                $progress = $programNewPcts ? (int) round(array_sum($programNewPcts) / count($programNewPcts)) : 0;
                $allDone = $programNewPcts && min($programNewPcts) === 100;
                $initiativeHealth = $programHasResidual ? 'YELLOW' : 'GREEN';

                if (! $dryRun) {
                    // Initiative.healthStatus WAJIB di-refresh: ProgramHealthService membaca
                    // workstream healthStatus sbg sinyal — kalau dibiarkan RED (warisan seed),
                    // program tak pernah bisa hijau meski task sudah catch-up.
                    DB::table('Initiative')->where('id', $initiativeId)->update([
                        'progressPercent' => $progress,
                        'status' => $allDone ? 'COMPLETED' : 'IN_PROGRESS',
                        'healthStatus' => $allDone ? 'GREEN' : $initiativeHealth,
                        'updatedAt' => $asOf,
                    ]);
                    DB::table('Program')->where('id', $program->id)->update([
                        'progressPercent' => $progress,
                        'updatedAt' => $asOf,
                    ]);
                }

                // Siapkan baris log (di-derive dari state baru). healthAtTime diisi setelah recompute.
                if ($writeLogs) {
                    $logRows[] = [
                        'programId' => $program->id,
                        'ownerId' => $program->ownerId,
                        'period' => $period,
                        'asOf' => $asOf,
                        'tasks' => $narrativeTasks,
                    ];
                }
            }

            // Recompute health (authoritative) untuk semua program tersentuh.
            if (! $dryRun) {
                foreach (array_unique($touchedPrograms) as $pid) {
                    rescue(fn () => $health->recompute($pid));
                }
            }

            // Tulis log W23 (append; buang hanya marker period yang sama).
            $logsWritten = 0;
            if ($writeLogs && ! empty($logRows)) {
                $freshHealth = $dryRun
                    ? collect()
                    : DB::table('Program')->whereIn('id', array_column($logRows, 'programId'))->pluck('healthStatus', 'id');

                if (! $dryRun) {
                    DB::table('ProgramProgressLog')
                        ->whereIn('programId', array_column($logRows, 'programId'))
                        ->where('period', $period)
                        ->where('createdByName', self::MARKER)
                        ->delete();
                }

                $insert = [];
                foreach ($logRows as $lr) {
                    $built = $this->buildNarrative($lr['tasks'], $lr['asOf']);
                    $insert[] = [
                        'programId' => $lr['programId'],
                        'period' => $lr['period'],
                        'healthAtTime' => $freshHealth[$lr['programId']] ?? 'GREEN',
                        'narrative' => $built['narrative'],
                        'kendala' => $built['kendala'],
                        'correctiveAction' => $built['correctiveAction'],
                        'nextStep' => $built['nextStep'],
                        'dukunganDibutuhkan' => $built['support'],
                        'createdById' => $lr['ownerId'],
                        'createdByName' => self::MARKER,
                        'isLate' => false,
                        'createdAt' => $lr['asOf'],
                        'updatedAt' => $lr['asOf'],
                    ];
                }
                if (! $dryRun) {
                    foreach (array_chunk($insert, 100) as $chunk) {
                        DB::table('ProgramProgressLog')->insert($chunk);
                    }
                }
                $logsWritten = count($insert);
            }

            if ($dryRun) {
                DB::rollBack();
            } else {
                DB::commit();
            }

            // Ringkasan
            $this->line('');
            $this->line('  WorkItem status   from -> to');
            foreach (['TODO', 'IN_PROGRESS', 'COMPLETED'] as $s) {
                $this->line(sprintf('    %-12s %5d -> %5d', $s, $tStat['from'][$s] ?? 0, $tStat['to'][$s] ?? 0));
            }
            $this->line('  Baru COMPLETED        : '.$newlyCompleted);
            $this->line('  Residual blocked (HOLD): '.$residualBlocked);
            $this->line('  Program tersentuh     : '.count(array_unique($touchedPrograms)));
            $this->line('  Progress log ditulis  : '.($writeLogs ? $logsWritten.' (period '.$period.')' : 'dilewati (--no-logs)'));
            $this->info($dryRun ? 'DRY-RUN selesai — tidak ada perubahan ditulis.' : 'Selesai — perubahan di-commit.');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Gagal: '.$e->getMessage());
            $this->line($e->getFile().':'.$e->getLine());
            return self::FAILURE;
        }
    }

    /** @return array{0:string,1:int,2:bool} [newStatus, newPct, isResidualBlocked] */
    private function project(string $baseStatus, int $basePct, int $first, int $last, int $asOf, string $note): array
    {
        if ($baseStatus === 'COMPLETED') {
            return ['COMPLETED', 100, false];
        }

        // Window selesai s.d. as-of.
        if ($last > 0 && $last <= $asOf) {
            if ($baseStatus === 'TODO' && $this->isBlocked($note)) {
                return ['IN_PROGRESS', max($basePct, 65), true];
            }
            return ['COMPLETED', 100, false];
        }

        // Straddle: proporsi minggu ≤ as-of.
        if ($first <= $asOf && $last > $asOf) {
            $weeks = range($first, $last); // hanya untuk estimasi proporsi rentang
            $done = count(array_filter($weeks, fn ($w) => $w <= $asOf));
            $sched = (int) round($done / max(1, count($weeks)) * 100);
            $pct = max($basePct, min(95, $sched));
            return [$pct >= 100 ? 'COMPLETED' : 'IN_PROGRESS', $pct, false];
        }

        // Future — biarkan baseline.
        return [$baseStatus, $basePct, false];
    }

    private function isBlocked(string $note): bool
    {
        $n = mb_strtolower($note);
        foreach (self::ESCALATION_KW as $kw) {
            if ($n !== '' && str_contains($n, $kw)) {
                return true;
            }
        }
        return false;
    }

    /** Union nomor minggu dari daftar bulan. */
    private function weeksOf(array $months): array
    {
        $w = [];
        foreach ($months as $m) {
            foreach (self::MONTH_WEEKS[$m] ?? [] as $x) {
                $w[$x] = true;
            }
        }
        $out = array_keys($w);
        sort($out);
        return $out;
    }

    private function fridayOfWeek(int $year, int $week): Carbon
    {
        return Carbon::create($year, 1, 1)->setISODate($year, max(1, $week), 5);
    }

    private function derivePhaseStatus(array $statuses): string
    {
        if (empty($statuses)) {
            return 'PLANNING';
        }
        $total = count($statuses);
        if (count(array_filter($statuses, fn ($s) => $s === 'COMPLETED')) === $total) {
            return 'COMPLETED';
        }
        if (count(array_filter($statuses, fn ($s) => $s === 'TODO')) === $total) {
            return 'PLANNING';
        }
        return 'IN_PROGRESS';
    }

    /**
     * Derive narasi log dari STATE BARU.
     *   done   = COMPLETED                → dihitung di lead, tak perlu note.
     *   inprog = IN_PROGRESS & tak blocked → note akurat (memang sedang berjalan).
     *   stuck  = IN_PROGRESS-blocked | TODO → kendala + dukungan.
     *
     * @return array{narrative:string,kendala:?string,correctiveAction:?string,nextStep:?string,support:?string}
     */
    private function buildNarrative(array $tasks, Carbon $asOf): array
    {
        $done = $inprog = $stuck = [];
        foreach ($tasks as $t) {
            if ($t['status'] === 'COMPLETED') {
                $done[] = $t;
            } elseif ($t['status'] === 'IN_PROGRESS' && empty($t['blocked'])) {
                $inprog[] = $t;
            } else {
                $stuck[] = $t;
            }
        }
        $count = count($tasks);
        $nDone = count($done);
        $week = (int) $asOf->format('W');
        $monthLabel = self::MONTH_ID[(int) $asOf->format('n')] ?? $asOf->format('F');

        $lead = "Per {$asOf->format('d')} {$monthLabel} {$asOf->format('Y')} (Minggu ke-{$week}): {$nDone} dari {$count} aktivitas selesai.";
        $noteText = $this->joinNotes(! empty($inprog) ? $inprog : $done, 3);
        $narrative = trim($lead.($noteText !== '' ? ' '.$noteText : ''));

        $kendala = $this->joinNotes($stuck, 3) ?: null;

        $correctiveAction = null;
        if ($kendala !== null) {
            $titles = $this->titles($this->sortByEarliestMonth($stuck), 2);
            if ($titles !== '') {
                $correctiveAction = "Mempercepat penyelesaian {$titles} serta mengintensifkan koordinasi dengan pihak terkait untuk membuka hambatan tersebut.";
            }
        }

        $pending = array_merge($inprog, $this->sortByEarliestMonth($stuck));
        $pendingTitles = $this->titles($pending, 3);
        if ($pendingTitles !== '') {
            $nextStep = "Melanjutkan & menyelesaikan: {$pendingTitles}.";
        } elseif ($nDone === $count) {
            $nextStep = 'Seluruh aktivitas selesai; lanjut ke monitoring & pelaporan penutup.';
        } else {
            $nextStep = null;
        }

        $support = $this->joinNotes($this->filterEscalation($stuck), 2) ?: null;

        return compact('narrative', 'kendala', 'correctiveAction', 'nextStep', 'support');
    }

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

    private function sortByEarliestMonth(array $tasks): array
    {
        usort($tasks, fn ($a, $b) => $this->earliestMonth($a['months'] ?? []) <=> $this->earliestMonth($b['months'] ?? []));
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

    private function filterEscalation(array $tasks): array
    {
        return array_values(array_filter($tasks, fn ($t) => $this->isBlocked($t['note'] ?? '')));
    }
}
