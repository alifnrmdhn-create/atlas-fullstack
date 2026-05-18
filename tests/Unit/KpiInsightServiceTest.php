<?php

namespace Tests\Unit;

use App\Services\KpiInsightService;
use Tests\TestCase;

/**
 * KpiInsightService — auto-derive bullet "Insight Utama" (Gap #4).
 *
 * Covers:
 *   - maximize bucket assignment (≥+5% = positif, <-5% = perhatian, mid = ignored)
 *   - minimize polarity inversion (denda, fraud)
 *   - target=0 edge cases
 *   - Indo-formatted number parsing (titik thousand, koma decimal)
 *   - sort + limit ranking
 */
class KpiInsightServiceTest extends TestCase
{
    private KpiInsightService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new KpiInsightService();
    }

    public function test_maximize_kpi_above_5pct_lands_in_positif(): void
    {
        $items = [
            ['nama' => 'EBITDA', 'polaritas' => 'maximize', 'sasaran' => '1.000', 'realisasi' => '1.200', 'satuan' => 'Rp Miliar'],
        ];
        $result = $this->service->deriveFromKpiItems($items);

        $this->assertCount(1, $result['positif']);
        $this->assertCount(0, $result['perhatian']);
        $this->assertSame('EBITDA', $result['positif'][0]['kpi']);
        $this->assertEqualsWithDelta(1.2, $result['positif'][0]['ratio'], 0.01);
    }

    public function test_maximize_kpi_within_tolerance_skipped(): void
    {
        $items = [
            ['nama' => 'OnTime', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '98'],
        ];
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertSame([], $result['positif']);
        $this->assertSame([], $result['perhatian']);
    }

    public function test_maximize_kpi_below_5pct_lands_in_perhatian(): void
    {
        $items = [
            ['nama' => 'Akurasi', 'polaritas' => 'maximize', 'sasaran' => '90', 'realisasi' => '70'],
        ];
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertCount(0, $result['positif']);
        $this->assertCount(1, $result['perhatian']);
        $this->assertSame('Akurasi', $result['perhatian'][0]['kpi']);
    }

    public function test_minimize_kpi_inverts_polarity(): void
    {
        // Denda Pajak: target 0,7 Rp, realisasi 0,3 → lebih kecil = lebih bagus = positif
        $items = [
            ['nama' => 'Denda Pajak', 'polaritas' => 'minimize', 'sasaran' => '0,7', 'realisasi' => '0,3'],
        ];
        $result = $this->service->deriveFromKpiItems($items);

        $this->assertCount(1, $result['positif']);
        $this->assertSame('Denda Pajak', $result['positif'][0]['kpi']);
    }

    public function test_minimize_kpi_overshoot_lands_in_perhatian(): void
    {
        $items = [
            ['nama' => 'Jumlah Temuan', 'polaritas' => 'minimize', 'sasaran' => '5', 'realisasi' => '15'],
        ];
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertCount(1, $result['perhatian']);
    }

    public function test_target_zero_with_realisasi_zero_is_on_target(): void
    {
        $items = [
            ['nama' => 'Fraud', 'polaritas' => 'minimize', 'sasaran' => '0', 'realisasi' => '0'],
        ];
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertSame([], $result['positif']);
        $this->assertSame([], $result['perhatian']);
    }

    public function test_parses_indo_number_format(): void
    {
        // "3.257,8" = 3257.8 dalam Indo format
        $items = [
            ['nama' => 'EBITDA', 'polaritas' => 'maximize', 'sasaran' => '1.483', 'realisasi' => '3.257,8'],
        ];
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertCount(1, $result['positif']);
        $this->assertGreaterThan(2.0, $result['positif'][0]['ratio']);
    }

    public function test_positif_sorted_desc_by_ratio(): void
    {
        $items = [
            ['nama' => 'A', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '120'], // 1.2
            ['nama' => 'B', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '160'], // 1.6
            ['nama' => 'C', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '140'], // 1.4
        ];
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertSame(['B', 'C', 'A'], array_column($result['positif'], 'kpi'));
    }

    public function test_perhatian_sorted_asc_worst_first(): void
    {
        $items = [
            ['nama' => 'X', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '80'],  // 0.8
            ['nama' => 'Y', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '50'],  // 0.5
            ['nama' => 'Z', 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => '70'],  // 0.7
        ];
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertSame(['Y', 'Z', 'X'], array_column($result['perhatian'], 'kpi'));
    }

    public function test_limits_to_5_positif_and_3_perhatian(): void
    {
        $items = [];
        for ($i = 1; $i <= 10; $i++) {
            $items[] = ['nama' => "PositifKPI{$i}", 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => (string)(100 + $i * 10)];
            $items[] = ['nama' => "PerhatianKPI{$i}", 'polaritas' => 'maximize', 'sasaran' => '100', 'realisasi' => (string)(80 - $i * 5)];
        }
        $result = $this->service->deriveFromKpiItems($items);
        $this->assertCount(5, $result['positif']);
        $this->assertCount(3, $result['perhatian']);
    }
}
