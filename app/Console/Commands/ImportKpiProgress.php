<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;

/**
 * Import KPI realisasi from the "Progress" sheet of the Matrix KPI workbooks
 * (docs/Real KPI Apr) into the Performance schema.
 *
 *   DIR-KMR file      → kpi_direktur_* (directorate_code = DIR-KMR)  + DirektoratScorecard rollup
 *   DKSA/DAPN/DIMR    → kpi_divisi_*   (unit_id 14/15/16)            + DivisiScorecard rollup
 *
 * Source layout (1-indexed cols): 1 Perspektif · 2 Strategic Objective ·
 * 4 Indicator · 5 Satuan · 6 Bobot · 7 Polaritas · 8 Target FY, then monthly
 * triplets Target/Realisasi/Nilai — Jan 9/10/11 … Apr 18/19/20 … Mei 21/22/23.
 *
 * Data-quality rules (from the s.d.-April analysis):
 *  - "Nilai" is a formula with business nuances (e.g. ROI scores 110 against a
 *    NEGATIVE target) → we read the workbook's CACHED value, never recompute.
 *  - A blank realisasi means NOT MEASURED → store NULL (not 0) and exclude from
 *    the rollup. Treating blanks as 0 is what made Feb collapse to 15/55 in the
 *    raw sheet totals; the stored monthly nilai here is the measured-only mean.
 *  - Indonesian number formats ("108,33", "48,63%", "-") are normalised.
 */
class ImportKpiProgress extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'kpi:import-progress
        {--dry-run : Parse + verify only, write nothing}
        {--path= : Folder containing the .xlsx files}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';

    protected $description = 'Import KPI realisasi (sheet "Progress") for DIR-KMR + DKSA/DAPN/DIMR into the Performance schema';

    /** Months we have data for, → column triplet [target, realisasi, nilai] + period number. */
    private const MONTHS = [
        'Jan' => [9, 10, 11, 1],
        'Feb' => [12, 13, 14, 2],
        'Mar' => [15, 16, 17, 3],
        'Apr' => [18, 19, 20, 4],
        'Mei' => [21, 22, 23, 5],
    ];

    private const DIRECTORATE_ID = 5;   // DIR-KMR
    private const TAHUN = 2026;

    /** A monthly rollup is only persisted when this share of weight has been
     *  measured — below it the scorecard is dominated by not-yet-due quarterly/
     *  annual KPIs and the headline would mislead (the Feb=15/55 artifact). */
    private const COVERAGE_MIN = 0.80;

    public function handle(): int
    {
        // Mass updateOrInsert ke 3 tabel scorecard — pernah hang 12 jam saat
        // jalan ke prod via proxy (memory project). Rem standar data-ops.
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        @ini_set('memory_limit', '512M');
        $dry = (bool) $this->option('dry-run');
        $dir = $this->option('path') ?: base_path('docs/Real KPI Apr');

        if (! is_dir($dir)) {
            $this->error("Folder not found: {$dir}");
            return self::FAILURE;
        }

        // filename pattern → scope
        $scopes = [
            'Direktorat'  => ['type' => 'direktorat', 'code' => 'DIR-KMR', 'unit_id' => null, 'label' => 'DIR-KMR'],
            '10. Matrix'  => ['type' => 'divisi', 'code' => 'DKSA', 'unit_id' => 14, 'label' => 'DKSA'],
            '11. Matrix'  => ['type' => 'divisi', 'code' => 'DAPN', 'unit_id' => 15, 'label' => 'DAPN'],
            '12. Matrix'  => ['type' => 'divisi', 'code' => 'DIMR', 'unit_id' => 16, 'label' => 'DIMR'],
        ];

        $files = glob($dir . '/*.xlsx') ?: [];
        if (! $files) {
            $this->error("No .xlsx files in {$dir}");
            return self::FAILURE;
        }

        $this->info(($dry ? '[DRY-RUN] ' : '') . 'Importing KPI Progress from ' . $dir);
        $periods = $dry ? [] : $this->ensurePeriods();

        $report = [];

        $run = function () use ($files, $scopes, $dry, $periods, &$report) {
            foreach ($files as $file) {
                $base = basename($file);
                $scope = null;
                foreach ($scopes as $needle => $s) {
                    if (str_contains($base, $needle)) { $scope = $s; break; }
                }
                if (! $scope) {
                    $this->warn("  skip (unmapped): {$base}");
                    continue;
                }

                $parsed = $this->parseProgress($file);
                $kpis = $parsed['kpis'];
                $sheetTotals = $parsed['sheetTotals'];

                if (! $dry) {
                    if ($scope['type'] === 'direktorat') {
                        $this->writeDirektorat($kpis, $periods);
                    } else {
                        $this->writeDivisi($scope['unit_id'], $kpis, $periods);
                    }
                    $this->writeRollup($scope, $kpis, $sheetTotals);
                }

                $report[$scope['label']] = $this->summarise($kpis, $sheetTotals);
            }
        };

        if ($dry) {
            $run();
        } else {
            DB::transaction($run);
        }

        $this->renderReport($report);
        $this->newLine();
        $this->info($dry
            ? '[DRY-RUN] No data written. Re-run without --dry-run to persist.'
            : 'Import complete.');

        return self::SUCCESS;
    }

    // ── Parsing ──────────────────────────────────────────────────────────────

    private function parseProgress(string $file): array
    {
        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(false);            // keep formulas so cached values are readable
        $reader->setLoadSheetsOnly('Progress');     // skip the heavy Glossary/Matrix sheets
        // Only load the data region (≤80 rows, ≤46 cols); the sheets carry ~1000
        // formatted rows that otherwise exhaust memory.
        $reader->setReadFilter(new class implements IReadFilter {
            public function readCell($columnAddress, $row, $worksheetName = ''): bool
            {
                return $row <= 80 && Coordinate::columnIndexFromString($columnAddress) <= 46;
            }
        });
        $ws = $reader->load($file)->getSheetByName('Progress');

        $cell = function (int $col, int $row) use ($ws) {
            $c = $ws->getCell([$col, $row]);
            return $c->isFormula() ? $c->getOldCalculatedValue() : $c->getValue();
        };

        $kpis = [];
        $sheetTotals = array_fill_keys(array_keys(self::MONTHS), null);
        $persp = null;
        $sobj = null;
        $urut = 0;

        for ($row = 4; $row <= 80; $row++) {
            $p = $cell(1, $row);
            $so = $cell(2, $row);
            if (is_string($p) && trim($p) !== '') $persp = trim(explode("\n", $p)[0]);
            if (is_string($so) && trim($so) !== '') $sobj = trim(explode("\n", $so)[0]);

            $indicator = $cell(4, $row);
            $bobot = $this->num($cell(6, $row));

            // Total row: bobot ≈ 1.0 with no indicator → capture sheet's own monthly totals
            if ($bobot !== null && $bobot >= 0.9 && $bobot <= 1.1 && (! is_string($indicator) || trim($indicator) === '')) {
                foreach (self::MONTHS as $m => [, , $nc]) {
                    $sheetTotals[$m] = $this->num($cell($nc, $row));
                }
                continue;
            }

            // KPI row: an indicator + a fractional weight
            if (! is_string($indicator) || trim($indicator) === '' || $bobot === null || $bobot <= 0 || $bobot > 1) {
                continue;
            }

            $months = [];
            foreach (self::MONTHS as $m => [$tc, $rc, $nc, $pnum]) {
                $real = $this->num($cell($rc, $row));
                $months[$m] = [
                    'period' => $pnum,
                    'target' => $this->num($cell($tc, $row)),
                    // not measured ⇒ NULL realisasi AND NULL skor (never 0)
                    'realisasi' => $real,
                    'skor' => $real === null ? null : $this->num($cell($nc, $row)),
                ];
            }

            $kpis[] = [
                'urutan' => ++$urut,
                'persp' => $persp,
                'sobj' => $sobj,
                'nama' => trim(explode("\n", $indicator)[0]),
                'satuan' => $this->str($cell(5, $row)),
                'polaritas' => $this->str($cell(7, $row)) ?: 'maximize',
                'bobot' => $bobot,
                'formula' => $this->str($cell(45, $row)),
                'sumber_data' => $this->str($cell(46, $row)),
                'months' => $months,
            ];
        }

        return ['kpis' => $kpis, 'sheetTotals' => $sheetTotals];
    }

    // ── Writers ──────────────────────────────────────────────────────────────

    private function writeDirektorat(array $kpis, array $periods): void
    {
        DB::table('kpi_direktur_values')->whereIn('kpi_direktur_item_id',
            DB::table('kpi_direktur_items')->where('directorate_code', 'DIR-KMR')->pluck('id')
        )->delete();
        DB::table('kpi_direktur_items')->where('directorate_code', 'DIR-KMR')->delete();

        foreach ($kpis as $k) {
            $itemId = DB::table('kpi_direktur_items')->insertGetId([
                'kode' => 'DIR-KMR-' . str_pad((string) $k['urutan'], 2, '0', STR_PAD_LEFT),
                'nama' => $k['nama'],
                'directorate_code' => 'DIR-KMR',
                'perspektif' => $k['persp'] ?? '',
                'satuan' => $k['satuan'] ?? '',
                'polaritas' => $k['polaritas'],
                'bobot' => $k['bobot'],
                'definisi' => $k['sobj'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->insertValues('kpi_direktur_values', 'kpi_direktur_item_id', $itemId, $k['months'], $periods);
        }
    }

    private function writeDivisi(int $unitId, array $kpis, array $periods): void
    {
        DB::table('kpi_divisi_items')->where('unit_id', $unitId)->where('tahun', self::TAHUN)->delete(); // cascades values

        foreach ($kpis as $k) {
            $itemId = DB::table('kpi_divisi_items')->insertGetId([
                'unit_id' => $unitId,
                'directorate_id' => self::DIRECTORATE_ID,
                'kode' => DB::table('OrganizationalUnit')->where('id', $unitId)->value('code')
                    . '-' . str_pad((string) $k['urutan'], 2, '0', STR_PAD_LEFT),
                'nama' => $k['nama'],
                'strategic_objective' => $k['sobj'],
                'perspektif' => $k['persp'] ?? '',
                'satuan' => $k['satuan'] ?? '',
                'polaritas' => $k['polaritas'],
                'bobot' => $k['bobot'],
                'formula' => $k['formula'],
                'sumber_data' => $k['sumber_data'],
                'tahun' => self::TAHUN,
                'urutan' => $k['urutan'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->insertValues('kpi_divisi_values', 'kpi_divisi_item_id', $itemId, $k['months'], $periods);
        }
    }

    private function insertValues(string $table, string $fk, int $itemId, array $months, array $periods): void
    {
        foreach ($months as $m => $v) {
            // store a row only when there is something to record (target or realisasi)
            if ($v['target'] === null && $v['realisasi'] === null) continue;
            DB::table($table)->insert([
                $fk => $itemId,
                'period_id' => $periods[$v['period']],
                'target' => $v['target'],
                'realisasi' => $v['realisasi'],
                'skor' => $v['skor'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function writeRollup(array $scope, array $kpis, array $sheetTotals): void
    {
        $skipped = [];
        foreach (self::MONTHS as $m => [, , , $pnum]) {
            // The scorecard headline = the workbook's OWN bottom total row (the
            // green "Nilai" cell), which is the directorate/divisi source of
            // truth (e.g. DIR-KMR Mei = 103.75). Fall back to our weighted mean
            // only if the sheet has no total for that month.
            $nilai = $sheetTotals[$m] ?? $this->rollup($kpis, $m);
            if ($nilai === null) continue;

            $coverage = 0.0;
            foreach ($kpis as $k) {
                if ($k['months'][$m]['skor'] !== null) $coverage += $k['bobot'];
            }
            if ($coverage < self::COVERAGE_MIN) {
                $skipped[] = $m . ' (' . round($coverage * 100) . '%)';
                continue;
            }

            $periode = sprintf('%04d-%02d', self::TAHUN, $pnum);

            if ($scope['type'] === 'direktorat') {
                DB::table('DirektoratScorecard')->updateOrInsert(
                    ['directorateId' => self::DIRECTORATE_ID, 'periode' => $periode],
                    ['nilai' => round($nilai, 2), 'updatedAt' => now()],
                );
            } else {
                DB::table('DivisiScorecard')->updateOrInsert(
                    ['unitId' => $scope['unit_id'], 'periode' => $periode],
                    ['directorateId' => self::DIRECTORATE_ID, 'nilai' => round($nilai, 2), 'updatedAt' => now()],
                );
            }
        }

        if ($skipped) {
            $this->warn("  {$scope['label']}: rollup skipped for low-coverage months — " . implode(', ', $skipped)
                . ' (per-KPI values still stored)');
        }
    }

    // ── Rollup + report ────────────────────────────────────────────────────────

    /** Weighted mean of cached Nilai over MEASURED KPIs only (skor not null). */
    private function rollup(array $kpis, string $month): ?float
    {
        $num = 0.0; $den = 0.0;
        foreach ($kpis as $k) {
            $s = $k['months'][$month]['skor'];
            if ($s === null) continue;
            $num += $k['bobot'] * $s;
            $den += $k['bobot'];
        }
        return $den > 0 ? $num / $den : null;
    }

    private function summarise(array $kpis, array $sheetTotals): array
    {
        $rows = [];
        foreach (array_keys(self::MONTHS) as $m) {
            $measured = 0; $cov = 0.0;
            foreach ($kpis as $k) {
                if ($k['months'][$m]['skor'] !== null) { $measured++; $cov += $k['bobot']; }
            }
            $rows[$m] = [
                'measured' => $measured,
                'coverage' => $cov,
                'mine' => $this->rollup($kpis, $m),
                'sheet' => $sheetTotals[$m],
            ];
        }
        return ['count' => count($kpis), 'months' => $rows];
    }

    private function renderReport(array $report): void
    {
        $this->newLine();
        $this->line('<options=bold>Verification — weighted Nilai (measured-only mean) vs sheet total</>');
        foreach ($report as $label => $data) {
            $this->newLine();
            $this->line("  <fg=cyan>{$label}</> ({$data['count']} KPI)");
            $tbl = [];
            foreach ($data['months'] as $m => $r) {
                $mine = $r['mine'] !== null ? number_format($r['mine'], 1) : '–';
                $sheet = $r['sheet'] !== null ? number_format($r['sheet'], 1) : '–';
                $flag = ($r['coverage'] < 0.8) ? '⚠ partial' : '';
                $tbl[] = [$m, $r['measured'], number_format($r['coverage'] * 100, 0) . '%', $mine, $sheet, $flag];
            }
            $this->table(['Bln', 'Measured', 'Coverage', 'Nilai (kami)', 'Total sheet', ''], $tbl);
        }
    }

    // ── Period helpers ───────────────────────────────────────────────────────

    /** @return array<int,int> period number (1-4) → performance_periods.id */
    private function ensurePeriods(): array
    {
        $labels = [1 => 'Jan 2026', 2 => 'Feb 2026', 3 => 'Mar 2026', 4 => 'Apr 2026', 5 => 'Mei 2026'];
        $latest = max(array_keys($labels));
        $ids = [];
        foreach ($labels as $bulan => $label) {
            DB::table('performance_periods')->updateOrInsert(
                ['tahun' => self::TAHUN, 'bulan' => $bulan],
                ['label' => $label, 'is_active' => $bulan === $latest, 'updated_at' => now(), 'created_at' => now()],
            );
            $ids[$bulan] = DB::table('performance_periods')
                ->where('tahun', self::TAHUN)->where('bulan', $bulan)->value('id');
        }
        return $ids;
    }

    // ── Normalisers ──────────────────────────────────────────────────────────

    private function num($v): ?float
    {
        if ($v === null) return null;
        if (is_int($v) || is_float($v)) return (float) $v;
        $s = trim((string) $v);
        if ($s === '' || in_array($s, ['-', '–', '—', '#DIV/0!', '#REF!', '#VALUE!', 'N/A', 'n/a', 'TBD'], true)) {
            return null;
        }
        $s = trim(str_replace('%', '', $s));
        if (str_contains($s, '.') && str_contains($s, ',')) {        // 1.234,56 → 1234.56
            $s = str_replace(['.', ','], ['', '.'], $s);
        } elseif (str_contains($s, ',')) {                           // 108,33 → 108.33
            $s = str_replace(',', '.', $s);
        }
        return is_numeric($s) ? (float) $s : null;
    }

    private function str($v): ?string
    {
        if ($v === null) return null;
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }
}
