<?php

namespace App\Services;

/**
 * Auto-derive "Insight Utama" bullets dari KPI items.
 *
 * Mirror panel "Insight Utama" di slide 9-12 PDF DKMR — dua kolom narasi
 * per divisi/direktorat:
 *   ✓ Capaian Positif: 3-5 KPI yang melampaui target signifikan (≥+5%)
 *   ⚠ Perlu Perhatian: 1-3 KPI yang di bawah target (<-5%) atau Moderate
 *
 * Logic mempertimbangkan polaritas (maximize vs minimize). Untuk KPI dengan
 * target = 0 (e.g., "Jumlah Fraud = 0"), realisasi = 0 dianggap on-target
 * (tidak masuk highlight, karena memang ekspektasi default).
 */
class KpiInsightService
{
    private const POSITIVE_THRESHOLD = 1.05;  // realisasi >= 105% target
    private const ATTENTION_THRESHOLD = 0.95; // realisasi < 95% target
    private const POSITIVE_LIMIT = 5;
    private const ATTENTION_LIMIT = 3;

    /**
     * @param array<int, array{kode?: string, nama: string, bobot?: int, satuan?: string,
     *   polaritas?: string, sasaran: string|float|null, realisasi: string|float|null, skor?: float}> $kpiItems
     * @return array{
     *   positif: array<int, array{kpi: string, realisasi: string, sasaran: string, ratio: float, satuan: ?string}>,
     *   perhatian: array<int, array{kpi: string, realisasi: string, sasaran: string, ratio: float, satuan: ?string}>,
     * }
     */
    public function deriveFromKpiItems(array $kpiItems): array
    {
        $positif = [];
        $perhatian = [];

        foreach ($kpiItems as $item) {
            $analysis = $this->analyzeItem($item);
            if ($analysis === null) continue;

            if ($analysis['bucket'] === 'positif') {
                $positif[] = $analysis['bullet'];
            } elseif ($analysis['bucket'] === 'perhatian') {
                $perhatian[] = $analysis['bullet'];
            }
        }

        usort($positif, fn ($a, $b) => $b['ratio'] <=> $a['ratio']);
        usort($perhatian, fn ($a, $b) => $a['ratio'] <=> $b['ratio']);

        return [
            'positif'   => array_slice($positif, 0, self::POSITIVE_LIMIT),
            'perhatian' => array_slice($perhatian, 0, self::ATTENTION_LIMIT),
        ];
    }

    /**
     * @return ?array{bucket: string, bullet: array{kpi: string, realisasi: string, sasaran: string, ratio: float, satuan: ?string}}
     */
    private function analyzeItem(array $item): ?array
    {
        $sasaran = $this->parseNumber($item['sasaran'] ?? null);
        $realisasi = $this->parseNumber($item['realisasi'] ?? null);

        if ($sasaran === null || $realisasi === null) return null;

        $polaritas = strtolower($item['polaritas'] ?? 'maximize');
        $ratio = $this->achievementRatio($sasaran, $realisasi, $polaritas);

        if ($ratio === null) return null;

        $bucket = null;
        if ($ratio >= self::POSITIVE_THRESHOLD) {
            $bucket = 'positif';
        } elseif ($ratio < self::ATTENTION_THRESHOLD) {
            $bucket = 'perhatian';
        }

        if ($bucket === null) return null;

        return [
            'bucket' => $bucket,
            'bullet' => [
                'kpi'       => $item['nama'],
                'realisasi' => (string) ($item['realisasi'] ?? '—'),
                'sasaran'   => (string) ($item['sasaran'] ?? '—'),
                'ratio'     => $ratio,
                'satuan'    => $item['satuan'] ?? null,
            ],
        ];
    }

    /**
     * Achievement ratio dengan polaritas-awareness.
     * - maximize: realisasi/sasaran (higher = better)
     * - minimize: sasaran/realisasi (lower realisasi = better)
     *
     * Edge case target=0:
     * - minimize: realisasi=0 ideal → ratio 1.0; realisasi>0 → ratio < 1
     * - maximize: realisasi=0 = on-target; realisasi>0 = above
     *
     * Return null kalau ratio tidak terdefinisi.
     */
    private function achievementRatio(float $sasaran, float $realisasi, string $polaritas): ?float
    {
        if ($polaritas === 'minimize') {
            if ($sasaran == 0.0) {
                return $realisasi == 0.0 ? 1.0 : 0.5;
            }
            if ($realisasi == 0.0) return 1.5; // way better than target
            return $sasaran / $realisasi;
        }
        // maximize default
        if ($sasaran == 0.0) {
            return $realisasi == 0.0 ? 1.0 : 1.5;
        }
        return $realisasi / $sasaran;
    }

    /** Parse "3.257,8" / "1.483" / "100" / 95.0 → float. */
    private function parseNumber($value): ?float
    {
        if ($value === null) return null;
        if (is_numeric($value)) return (float) $value;
        if (!is_string($value)) return null;

        // Indo format: titik = thousand sep, koma = decimal
        $clean = str_replace('.', '', trim($value));
        $clean = str_replace(',', '.', $clean);
        return is_numeric($clean) ? (float) $clean : null;
    }
}
