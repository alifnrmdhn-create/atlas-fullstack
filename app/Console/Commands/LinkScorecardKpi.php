<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ConfirmsDestructiveRun;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Link program SCORECARD ke KPI divisi RIIL (kpi_divisi_*) yang sudah diimpor,
 * lalu materialize ke KpiDefinition + KpiValue yang dibaca Charter View.
 *
 * Konteks (Jun 2026): Charter blok "Primary KPI" + "Monthly KPI Progress" kosong
 * karena KpiDefinition/KpiValue per-program 0 baris. Data KPI RIIL ada di
 * kpi_divisi_items/values (DKSA/DAPN/DIMR, period Jan–Apr 2026, lihat
 * project_performance_module) — tapi TIDAK ada FK Program→KPI. Pemetaannya
 * adalah KURASI domain (program kerja = leading; KPI divisi = lagging), bukan
 * fuzzy-match otomatis: salah-link di charter Direktur = menyesatkan.
 *
 * Karena itu MAP di bawah HANYA berisi pasangan high-confidence (nama program ≈
 * nama KPI). Program ambigu (mis. pendanaan PT SGN tanpa KPI spesifik) sengaja
 * DILEWATI → Charter benar menampilkan "Non-Scorecard"/tanpa KPI, bukan angka salah.
 * Tambah/koreksi entri MAP ini setelah owner divisi verifikasi.
 *
 * Sumber angka = kpi_divisi_values (target/realisasi per bulan) → NOL karangan.
 * Idempotent: bersihkan artefak ber-marker (code KPI-AUTO-*) lalu re-build.
 */
class LinkScorecardKpi extends Command
{
    use ConfirmsDestructiveRun;

    protected $signature = 'programs:link-scorecard-kpi
        {--dry-run : Tampilkan rencana link tanpa menulis}
        {--force : Lewati konfirmasi saat target DB produksi/remote}';
    protected $description = 'Link program SCORECARD ke KPI divisi riil → KpiDefinition+KpiValue utk Charter. Kurasi high-confidence, idempotent.';

    private const CODE_PREFIX = 'KPI-AUTO-';
    private const LINK_NOTE = 'Link kurasi otomatis (high-confidence) — mohon owner verifikasi.';

    /**
     * programCode => kpi_divisi_items.kode (high-confidence saja).
     * Komentar = ringkas alasan match.
     */
    private const MAP = [
        // DKSA (u14)
        'PRG-DKMR-DKSA-015' => 'DKSA-HLD-08', // Sinking Fund IP PEN TW I  → % Penyetoran Sinking Fund sesuai Rencana
        'PRG-DKMR-DKSA-026' => 'DKSA-HLD-08', // Sinking Fund IP PEN TW II → idem
        'PRG-DKMR-DKSA-014' => 'DKSA-HLD-07', // Pembayaran Bunga IP PEN   → % On Time Pembayaran Utang IP PEN
        'PRG-DKMR-DKSA-027' => 'DKSA-HLD-06', // Debt Reprofiling PTPN I    → % On Time Pembayaran Utang Internal
        // DKSA PT SGN (2026-06-03, keputusan user "link ke KPI terbaik" — KPI proses
        // berdata, bukan outcome EBITDA/ROI yang sengaja dibiarkan tak ter-link)
        'PRG-DKMR-DKSA-032' => 'DKSA-HLD-05', // Penyelesaian Pinjaman PT SGN Jatuh Tempo → % On Time Pembayaran Utang Pihak Ketiga
        'PRG-DKMR-DKSA-034' => 'DKSA-HLD-09', // Tambahan Pendanaan Capex & Operasional   → % On Time Pendanaan Operasional
        'PRG-DKMR-DKSA-035' => 'DKSA-HLD-09', // Pembiayaan Kredit Modal Kerja PT SGN     → idem (modal kerja = pendanaan operasional)
        'PRG-DKMR-DKSA-033' => 'DKSA-HLD-09', // Pendanaan Akuisisi Saham PG RNI          → terlemah; proxy "pendanaan disediakan tepat waktu"
        // DAPN (u15)
        'PRG-DKMR-DAPN-010' => 'DAPN-HLD-09', // Efektivitas Transaksi Kas & Bank → % Akurasi Transaksi Kas dan Bank
        'PRG-DKMR-DAPN-022' => 'DAPN-HLD-14', // Efektivitas verifikasi Dokumen   → % Kelengkapan Dokumen Verifikasi
        'PRG-DKMR-DAPN-015' => 'DAPN-HLD-04', // Kualitas LK (WTP)                 → Opini Audit
        'PRG-DKMR-DAPN-016' => 'DAPN-HLD-13', // Compliance LK (min. temuan)       → Jumlah Temuan Signifikan Audit
        // DIMR (u16)
        'PRG-DKMR-DIMR-020' => 'DIMR-HLD-02', // Maturitas Risiko Korporasi   → Risk Maturity Index
        'PRG-DKMR-DIMR-011' => 'DIMR-HLD-09', // Budaya Risiko                → Indeks Survei Budaya Risiko
        'PRG-DKMR-DIMR-004' => 'DIMR-HLD-07', // BCM & Resiliensi             → Kelengkapan Dok Contingency/BCP/Stress Test
        'PRG-DKMR-DIMR-006' => 'DIMR-HLD-07', // Stress Testing               → idem
        'PRG-DKMR-DIMR-009' => 'DIMR-HLD-08', // Kualitas Penerapan MR        → Skor Aspek Kualitas Penerapan MR
        'PRG-DKMR-DIMR-010' => 'DIMR-HLD-08', // Kualitas Penerapan MR        → idem
        'PRG-DKMR-DIMR-007' => 'DIMR-HLD-14', // Implementasi Mitigasi Risiko → % Mitigasi Plan Terealisasi
        'PRG-DKMR-DIMR-008' => 'DIMR-HLD-14', // Implementasi Mitigasi Risiko → idem
        'PRG-DKMR-DIMR-001' => 'DIMR-HLD-05', // Platform Risiko Terintegrasi → % On Time Implementasi Inisiatif MR
        'PRG-DKMR-DIMR-012' => 'DIMR-HLD-10', // Optimalisasi Risk Oversight  → % On Time Risk Oversight & Evaluation
        'PRG-DKMR-DIMR-013' => 'DIMR-HLD-10', // idem
        'PRG-DKMR-DIMR-014' => 'DIMR-HLD-10', // idem
        'PRG-DKMR-DIMR-015' => 'DIMR-HLD-10', // idem
        'PRG-DKMR-DIMR-016' => 'DIMR-HLD-10', // idem
        'PRG-DKMR-DIMR-017' => 'DIMR-HLD-10', // idem
    ];

    public function handle(): int
    {
        if (! $this->confirmDestructiveRun()) {
            return self::FAILURE;
        }

        $now = now();
        $dryRun = (bool) $this->option('dry-run');

        $programs = DB::table('Program')->whereIn('code', array_keys(self::MAP))->get()->keyBy('code');
        $items = DB::table('kpi_divisi_items')->whereIn('kode', array_values(self::MAP))->get()->keyBy('kode');
        $periods = DB::table('performance_periods')->get()->keyBy('id');

        $plan = [];
        $skipped = [];

        foreach (self::MAP as $progCode => $kpiKode) {
            $program = $programs->get($progCode);
            $item = $items->get($kpiKode);
            if (! $program) {
                $skipped[] = "$progCode (program tak ada)";
                continue;
            }
            if (! $item) {
                $skipped[] = "$progCode → $kpiKode (KPI item tak ada)";
                continue;
            }

            $values = DB::table('kpi_divisi_values')
                ->where('kpi_divisi_item_id', $item->id)
                ->orderBy('period_id')
                ->get();

            $monthly = [];
            foreach ($values as $v) {
                $period = $periods->get($v->period_id);
                if (! $period) {
                    continue;
                }
                $monthly[] = [
                    'month' => (int) $period->bulan,
                    'year' => (int) $period->tahun,
                    'target' => $v->target,
                    'real' => $v->realisasi,
                ];
            }

            // Safety-net: KPI tanpa nilai bermakna (semua target & real = 0, mis.
            // KPI tahunan yang belum diukur) di-skip — me-link-nya bikin charter
            // tampil "target 0" yang terlihat rusak. Re-run akan otomatis
            // menyertakannya begitu owner mengisi nilai bulanan.
            $hasData = collect($monthly)->contains(fn ($m) => (float) ($m['target'] ?? 0) != 0.0 || (float) ($m['real'] ?? 0) != 0.0);
            if (! $hasData) {
                $skipped[] = "$progCode → $kpiKode (KPI belum ada nilai bulanan)";
                continue;
            }

            $plan[] = [
                'program' => $program,
                'item' => $item,
                'kpiKode' => $kpiKode,
                'monthly' => $monthly,
            ];
        }

        if ($dryRun) {
            $this->info('[dry-run] '.count($plan).' program akan di-link (dari '.count(self::MAP).' entri MAP).');
            foreach ($plan as $p) {
                $this->line('  '.$p['program']->code.' → ['.$p['kpiKode'].'] '.mb_substr($p['item']->nama, 0, 50).' · '.count($p['monthly']).' bln nilai');
            }
            if ($skipped) {
                $this->warn('Dilewati: '.implode('; ', $skipped));
            }
            return self::SUCCESS;
        }

        $linked = 0;
        $valuesWritten = 0;

        // Cleanup mencakup SEMUA program ber-MAP (termasuk yang kini di-skip),
        // supaya artefak link lama tak jadi orphan saat data berubah jadi nol.
        $cleanupIds = $programs->pluck('id')->all();

        DB::transaction(function () use ($plan, $cleanupIds, $now, &$linked, &$valuesWritten) {
            $programIds = $cleanupIds;

            // Idempotent cleanup (artefak ber-marker saja).
            $autoDefIds = DB::table('KpiDefinition')
                ->whereIn('programId', $programIds)
                ->where('code', 'like', self::CODE_PREFIX.'%')
                ->pluck('id');
            DB::table('KpiValue')->whereIn('kpiDefinitionId', $autoDefIds)->delete();
            DB::table('KpiDefinition')->whereIn('id', $autoDefIds)->delete();
            DB::table('ProgramKpiLink')
                ->whereIn('programId', $programIds)
                ->where('note', self::LINK_NOTE)
                ->delete();

            foreach ($plan as $p) {
                $program = $p['program'];
                $item = $p['item'];

                $headlineTarget = $this->headlineTarget($p['monthly']);

                $defId = DB::table('KpiDefinition')->insertGetId([
                    'code' => self::CODE_PREFIX.$program->code,
                    'programId' => $program->id,
                    'name' => $item->nama,
                    'description' => $item->strategic_objective ?: $item->formula,
                    'metricType' => $this->metricType($item->satuan),
                    'dataType' => 'DECIMAL',
                    'targetValue' => $headlineTarget,
                    'unitOfMeasure' => $item->satuan,
                    'reviewFrequency' => 'MONTHLY',
                    'isLeadingIndicator' => false, // KPI divisi = lagging
                    'ownerId' => $program->ownerId,
                    'ownerUnitId' => $program->ownerUnitId,
                    'isActive' => true,
                    'createdAt' => $now,
                    'updatedAt' => $now,
                ], 'id');

                foreach ($p['monthly'] as $m) {
                    DB::table('KpiValue')->insert([
                        'kpiDefinitionId' => $defId,
                        'measurementDate' => Carbon::create($m['year'], $m['month'], 1)->endOfMonth()->startOfDay(),
                        'targetValue' => $m['target'],
                        'actualValue' => $m['real'] ?? 0,
                        'createdAt' => $now,
                        'updatedAt' => $now,
                    ]);
                    $valuesWritten++;
                }

                DB::table('ProgramKpiLink')->insert([
                    'programId' => $program->id,
                    'apmsKpiCode' => $p['kpiKode'],
                    'apmsKpiName' => $item->nama,
                    'apmsKpiBobot' => $item->bobot,
                    'note' => self::LINK_NOTE,
                    'createdAt' => $now,
                ]);

                $linked++;
            }
        });

        $this->info("Selesai. {$linked} program di-link ke KPI divisi riil ({$valuesWritten} KpiValue bulanan).");
        if ($skipped) {
            $this->warn('Dilewati: '.implode('; ', $skipped));
        }
        $this->line('Catatan: program SCORECARD lain (mis. pendanaan PT SGN) sengaja TIDAK di-link — tak ada KPI spesifik. Perluas MAP setelah verifikasi owner.');

        return self::SUCCESS;
    }

    /** Headline target = target periode terbaru yang non-null; fallback max. */
    private function headlineTarget(array $monthly): float
    {
        $withTarget = array_filter($monthly, fn ($m) => $m['target'] !== null);
        if (empty($withTarget)) {
            return 0.0;
        }
        $latest = end($withTarget);
        $val = (float) $latest['target'];
        if ($val != 0.0) {
            return $val;
        }
        // Periode terbaru 0 (mis. KPI triwulanan bulan non-lapor) → ambil max non-nol.
        $max = max(array_map(fn ($m) => (float) ($m['target'] ?? 0), $monthly));
        return $max;
    }

    private function metricType(?string $satuan): string
    {
        $s = mb_strtolower($satuan ?? '');
        return match (true) {
            str_contains($s, '%') => 'PERCENTAGE',
            str_contains($s, 'rp') => 'CURRENCY',
            str_contains($s, 'skor') => 'INDEX',
            str_contains($s, 'jumlah') => 'COUNT',
            default => 'NUMBER',
        };
    }
}
