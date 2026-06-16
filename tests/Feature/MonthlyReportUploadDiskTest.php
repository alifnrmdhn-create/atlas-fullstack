<?php

namespace Tests\Feature;

use App\Models\MonthlyReport;
use App\Models\MonthlyReportMetric;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci refactor upload S3-ready (scale-readiness S1.4): jalur upload Excel
 * laporan bulanan dulu parse via Storage::disk('local')->path() — TAK ADA di S3.
 * Kini parse dari temp upload (getRealPath, selalu lokal) lalu simpan ke disk
 * config-driven (config('uploads.private_disk')). Test ini membuktikan:
 *   1. parse-from-temp benar (metrics ter-ekstrak dari Excel asli)
 *   2. file mendarat di disk yang dikonfigurasi (Storage::fake) — bukan hardcode
 *
 * Sekaligus menutup gap: jalur happy upload Excel sebelumnya nol coverage.
 */
class MonthlyReportUploadDiskTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_upload_parses_from_temp_and_stores_to_configured_disk(): void
    {
        Storage::fake('local'); // = config('uploads.private_disk') default

        [$dir, $unit] = $this->makeDirectorate('DIR-U', 'DIV-U');
        $officer = $this->makeUser('officer-u', 'OFFICER', $unit->id, $dir->id);

        $reportId = $this->actingAs($officer)
            ->postJson('/monthly-reports', ['month' => 7, 'year' => 2030])
            ->assertCreated()
            ->json('data.id');

        $xlsx = $this->makeReportXlsx();

        $this->actingAs($officer)
            ->post("/monthly-reports/{$reportId}/upload", ['file' => $xlsx], ['Accept' => 'application/json'])
            ->assertOk();

        // Metrics ter-parse & tersimpan
        $this->assertDatabaseHas('MonthlyReportMetric', [
            'reportId' => $reportId,
            'label' => 'Penjualan Bersih',
        ]);
        $this->assertSame(1, MonthlyReportMetric::where('reportId', $reportId)->count());

        // File mendarat di disk terkonfigurasi (bukan hardcode 'local' path)
        $stored = MonthlyReport::with('files')->find($reportId)->files->first();
        $this->assertNotNull($stored, 'Baris file laporan harus tercatat.');
        Storage::disk('local')->assertExists($stored->filepath);
    }

    public function test_invalid_excel_is_rejected_without_storing(): void
    {
        Storage::fake('local');

        [$dir, $unit] = $this->makeDirectorate('DIR-V', 'DIV-V');
        $officer = $this->makeUser('officer-v', 'OFFICER', $unit->id, $dir->id);

        $reportId = $this->actingAs($officer)
            ->postJson('/monthly-reports', ['month' => 8, 'year' => 2030])
            ->assertCreated()->json('data.id');

        // File "xlsx" yang isinya sampah → parse gagal → 422, dan TIDAK tersimpan
        // (parse-dulu-baru-simpan: nol artefak saat gagal).
        $bad = UploadedFile::fake()->createWithContent('rusak.xlsx', 'bukan excel sungguhan');

        $this->actingAs($officer)
            ->post("/monthly-reports/{$reportId}/upload", ['file' => $bad], ['Accept' => 'application/json'])
            ->assertStatus(422);

        $this->assertSame(0, MonthlyReportMetric::where('reportId', $reportId)->count());
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    /** Bangun xlsx valid sesuai layout parseExcel (sheet 'Laporan', A-G, baris ≥2). */
    private function makeReportXlsx(): UploadedFile
    {
        $ss = new Spreadsheet();
        $sheet = $ss->getActiveSheet();
        $sheet->setTitle('Laporan');
        // Row 1 header (di-skip), row 2 data: A=Section B=Kategori C=Label D=Satuan E=RKAP F=Realisasi G=TahunLalu
        $sheet->fromArray(['Section', 'Kategori', 'Label', 'Satuan', 'RKAP', 'Realisasi', 'TahunLalu'], null, 'A1');
        $sheet->fromArray(['KEUANGAN', 'Pendapatan', 'Penjualan Bersih', 'Rp Juta', 1000, 950, 900], null, 'A2');

        $path = tempnam(sys_get_temp_dir(), 'atlas-xlsx-') . '.xlsx';
        (new Xlsx($ss))->save($path);

        return new UploadedFile($path, 'laporan.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
    }
}
