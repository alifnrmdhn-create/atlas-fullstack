<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seed scaffolding eksekusi (Initiative -> Phase -> WorkItem) untuk 97 program DKMR 2026.
 *
 * Tujuan: mengkuantifikasi progres program yang sebelumnya biner (100% / "Berjalan").
 * Breakdown di-derive dari narasi "Progres Terkini" monitoring s.d. 22 Mei 2026
 * (database/seeders/data/programs_execution_2026.json), bukan input manual snapshot —
 * sehingga Program.progressPercent = rata-rata percentComplete task (cara ATLAS).
 *
 * Idempotent: hapus Initiative lama tiap program (cascade -> Phase + WorkItem) lalu re-seed.
 * Bersifat DRAFT — owner divisi diharapkan menyesuaikan via tab Struktur.
 *
 * CATATAN SKEMA (Prisma-legacy): id = serial integer; due-date = targetCompletion;
 * Phase pakai `order` + startWeek/endWeek; code/createdBy/targetCompletion NOT NULL.
 */
class ProgramExecutionSeeder extends Seeder
{
    /** Blok minggu ISO per bulan 2026 (total 52 minggu). */
    private const MONTH_WEEKS = [
        'Jan' => [1, 2, 3, 4],        'Feb' => [5, 6, 7, 8],
        'Mar' => [9, 10, 11, 12, 13], 'Apr' => [14, 15, 16, 17],
        'Mei' => [18, 19, 20, 21, 22], 'Jun' => [23, 24, 25, 26],
        'Jul' => [27, 28, 29, 30, 31], 'Agt' => [32, 33, 34, 35],
        'Sep' => [36, 37, 38, 39],    'Okt' => [40, 41, 42, 43, 44],
        'Nov' => [45, 46, 47, 48],    'Des' => [49, 50, 51, 52],
    ];

    private const MONTH_NUM = ['Jan' => 1, 'Feb' => 2, 'Mar' => 3, 'Apr' => 4, 'Mei' => 5, 'Jun' => 6, 'Jul' => 7, 'Agt' => 8, 'Sep' => 9, 'Okt' => 10, 'Nov' => 11, 'Des' => 12];
    private const MONTH_END = [1 => 31, 2 => 28, 3 => 31, 4 => 30, 5 => 31, 6 => 30, 7 => 31, 8 => 31, 9 => 30, 10 => 31, 11 => 30, 12 => 31];

    private const DRAFT_NOTE = 'Draft otomatis dari monitoring DKMR s.d. 22 Mei 2026 — mohon owner sesuaikan rincian tahap & task.';

    public function run(): void
    {
        $path = database_path('seeders/data/programs_execution_2026.json');
        if (! file_exists($path)) {
            $this->command->error("File tidak ditemukan: {$path}");
            return;
        }

        $data = json_decode(file_get_contents($path), true);
        if (! is_array($data)) {
            $this->command->error('JSON execution tidak valid.');
            return;
        }

        $programs = DB::table('Program')->get()->keyBy('code');
        $now = now();
        $year = 2026;

        $this->command->info('Seeding scaffolding eksekusi untuk '.count($data).' program...');

        $seeded = 0;
        $missing = [];
        foreach ($data as $entry) {
            $code = $entry['code'] ?? null;
            if (! $code) {
                continue;
            }
            $program = $programs->get($code);
            if (! $program) {
                $missing[] = $code;
                continue;
            }

            // Idempotent: hapus initiative lama (cascade -> Phase + WorkItem)
            DB::table('Initiative')->where('programId', $program->id)->delete();

            $suffix = preg_replace('/^PRG-/', '', $program->code); // DKMR-DKSA-001
            $fallbackTarget = $program->targetEndDate ?? "{$year}-12-31";

            // Kumpulkan semua percentComplete utk rollup program
            $allPcts = [];
            foreach (($entry['phases'] ?? []) as $ph) {
                foreach (($ph['tasks'] ?? []) as $t) {
                    $allPcts[] = (int) ($t['percentComplete'] ?? 0);
                }
            }
            $progress = ! empty($allPcts) ? (int) round(array_sum($allPcts) / count($allPcts)) : 0;
            $allDone = ! empty($allPcts) && min($allPcts) === 100;

            $initiativeId = DB::table('Initiative')->insertGetId([
                'code' => "WS-{$suffix}",
                'programId' => $program->id,
                'name' => 'Rencana & Eksekusi 2026',
                'description' => self::DRAFT_NOTE,
                'ownerId' => $program->ownerId,
                'ownerUnitId' => $program->ownerUnitId,
                'status' => $allDone ? 'COMPLETED' : 'IN_PROGRESS',
                'priority' => 'MEDIUM',
                'progressPercent' => $progress,
                'healthStatus' => $program->healthStatus,
                'startDate' => $program->startDate,
                'targetCompletion' => $fallbackTarget,
                'createdAt' => $now,
                'updatedAt' => $now,
            ], 'id');

            foreach (($entry['phases'] ?? []) as $pi => $ph) {
                $phaseStatuses = [];
                $phaseWeeks = [];
                $taskRows = [];

                foreach (($ph['tasks'] ?? []) as $ti => $t) {
                    $months = $t['plannedMonths'] ?? [];
                    $weekNums = $this->monthsToWeekNums($months);
                    $phaseWeeks = array_merge($phaseWeeks, $weekNums);
                    [$startDate, $dueDate] = $this->monthsToDates($months, $year);
                    $st = $t['status'] ?? 'TODO';
                    $phaseStatuses[] = $st;

                    $taskRows[] = [
                        'code' => "WI-{$suffix}-{$pi}-{$ti}",
                        'initiativeId' => $initiativeId,
                        'phaseId' => null, // diisi setelah phase insert
                        'title' => $t['title'] ?? 'Task',
                        'description' => $t['note'] ?? null,
                        'assignedTo' => $program->ownerId,
                        'createdBy' => $program->ownerId,
                        'createdByUnitId' => $program->ownerUnitId,
                        'status' => $st,
                        'priority' => 'MEDIUM',
                        'percentComplete' => (int) ($t['percentComplete'] ?? 0),
                        'startDate' => $startDate,
                        'targetCompletion' => $dueDate ?? $fallbackTarget,
                        'plannedWeeks' => json_encode($this->isoWeeks($weekNums, $year)),
                        'actualWeeks' => null, // auto-derive dari percentComplete di ProgramController
                        'createdAt' => $now,
                        'updatedAt' => $now,
                    ];
                }

                $phaseId = DB::table('Phase')->insertGetId([
                    'code' => "PH-{$suffix}-{$pi}",
                    'initiativeId' => $initiativeId,
                    'name' => $ph['name'] ?? ('Tahap '.($pi + 1)),
                    'order' => $pi,
                    'status' => $this->derivePhaseStatus($phaseStatuses),
                    'startWeek' => ! empty($phaseWeeks) ? min($phaseWeeks) : null,
                    'endWeek' => ! empty($phaseWeeks) ? max($phaseWeeks) : null,
                    'healthStatus' => $program->healthStatus,
                    'createdAt' => $now,
                    'updatedAt' => $now,
                ], 'id');

                foreach ($taskRows as &$row) {
                    $row['phaseId'] = $phaseId;
                }
                unset($row);

                DB::table('WorkItem')->insert($taskRows);
            }

            DB::table('Program')->where('id', $program->id)->update([
                'progressPercent' => $progress,
                'updatedAt' => $now,
            ]);

            $seeded++;
        }

        $this->command->info("Selesai. {$seeded} program ter-seed eksekusinya (Initiative/Phase/WorkItem).");
        if (! empty($missing)) {
            $this->command->warn('Program tak ditemukan (dilewati): '.implode(', ', $missing));
        }
        $this->command->info('Catatan: jalankan `php artisan atlas:compute-health` agar health re-derive dari task baru.');
    }

    /** Union nomor minggu (int) dari daftar bulan, terurut — utk Phase.startWeek/endWeek. */
    private function monthsToWeekNums(array $months): array
    {
        $weeks = [];
        foreach ($months as $m) {
            foreach (self::MONTH_WEEKS[$m] ?? [] as $w) {
                $weeks[$w] = true;
            }
        }
        $out = array_keys($weeks);
        sort($out);
        return array_values($out);
    }

    /**
     * Konversi nomor minggu -> string ISO `YYYY-Www` (zero-pad 2 digit).
     * WAJIB cocok dengan format yang dibaca ExecutionGrid (lib/execution-grid.ts:
     * `${year}-W${String(weekNo).padStart(2,'0')}`); kalau integer, grid tak match
     * -> Plan kosong. @return list<string>
     */
    private function isoWeeks(array $weekNums, int $year): array
    {
        return array_map(fn ($w) => sprintf('%04d-W%02d', $year, $w), $weekNums);
    }

    /** [startDate, dueDate] dari rentang bulan: awal bulan paling awal -> akhir bulan paling akhir. */
    private function monthsToDates(array $months, int $year): array
    {
        $nums = [];
        foreach ($months as $m) {
            if (isset(self::MONTH_NUM[$m])) {
                $nums[] = self::MONTH_NUM[$m];
            }
        }
        if (empty($nums)) {
            return [null, null];
        }
        $min = min($nums);
        $max = max($nums);
        $start = sprintf('%04d-%02d-01', $year, $min);
        $due = sprintf('%04d-%02d-%02d', $year, $max, self::MONTH_END[$max]);
        return [$start, $due];
    }

    /** Status fase: semua COMPLETED -> COMPLETED, semua TODO -> PLANNING, selain itu IN_PROGRESS. */
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
}
