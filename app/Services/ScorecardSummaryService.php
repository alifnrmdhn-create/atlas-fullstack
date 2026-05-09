<?php

namespace App\Services;

use App\Auth\OrgScope;
use App\Models\Directorate;
use App\Models\DirektoratScorecard;
use App\Models\DivisiScorecard;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Carbon\Carbon;

/**
 * Phase 2 — DB-backed scorecard reads, scoped to viewer's org level.
 *
 * Single source of truth shared by:
 *  - Home dashboard (KPI Achievement column)
 *  - Performance / Scorecard page
 *
 * Scope rules (via OrgScope::forUser):
 *   - BOD / ADMIN / SUPERADMIN  → all 6 direktorat (portfolio-wide)
 *   - KADIV                     → only viewer's parent direktorat (1 row)
 *   - KASUBDIV                  → only viewer's parent direktorat (1 row,
 *                                   resolved from unitId → directorateId)
 *   - default                   → same as KASUBDIV via fallback
 *
 * Periode: defaults to current month (YYYY-MM). Past periods accessible
 * by passing `$periode` arg explicitly.
 */
class ScorecardSummaryService
{
    /**
     * @return array<int, array{
     *   kode: string, nama: string, nilai: float,
     *   divisi: array<int, array{kode: string, nama: string, nilai: float}>
     * }>
     */
    public function direktoratGrid(?User $user = null, ?string $periode = null): array
    {
        $periode = $periode ?? now()->format('Y-m');
        $directorateIds = $this->resolveScopedDirectorateIds($user);

        // Only include direktorat that HAVE a scorecard entry for this periode.
        // (Excludes legacy/orphan directorates without scorecard data.)
        $valuesQuery = DirektoratScorecard::query()
            ->where('periode', $periode);
        if ($directorateIds !== null) {
            $valuesQuery->whereIn('directorateId', $directorateIds);
        }
        $direktoratValues = $valuesQuery->pluck('nilai', 'directorateId');

        if ($direktoratValues->isEmpty()) return [];

        $directorates = Directorate::query()
            ->whereIn('id', $direktoratValues->keys())
            ->orderBy('code')
            ->get(['id', 'code', 'name']);

        $divisiValues = DivisiScorecard::query()
            ->whereIn('directorateId', $direktoratValues->keys())
            ->where('periode', $periode)
            ->with('unit:id,code,name')
            ->get(['id', 'unitId', 'directorateId', 'nilai']);

        return $directorates->map(function ($dir) use ($direktoratValues, $divisiValues) {
            $divisiForDir = $divisiValues
                ->where('directorateId', $dir->id)
                ->filter(fn ($d) => $d->unit !== null)
                ->map(fn ($d) => [
                    'kode'  => $d->unit->code,
                    'nama'  => $d->unit->name,
                    'nilai' => (float) $d->nilai,
                ])
                ->values()
                ->all();

            return [
                'kode'   => $dir->code,
                'nama'   => $dir->name,
                'nilai'  => (float) $direktoratValues[$dir->id],
                'divisi' => $divisiForDir,
            ];
        })->values()->all();
    }

    /** @return array<int, array{rank: int, nama: string, kode: string, nilai: float}> */
    public function topDirektorat(?User $user = null, int $limit = 3, ?string $periode = null): array
    {
        $grid = $this->direktoratGrid($user, $periode);
        usort($grid, fn ($a, $b) => $b['nilai'] <=> $a['nilai']);
        return array_map(fn ($d, $i) => [
            'rank'  => $i + 1,
            'nama'  => $d['nama'],
            'kode'  => $d['kode'],
            'nilai' => $d['nilai'],
        ], array_slice($grid, 0, $limit), array_keys(array_slice($grid, 0, $limit)));
    }

    /** @return array<int, array{nama: string, kode: string, nilai: float}> */
    public function belowTarget(?User $user = null, float $threshold = 80.0, ?string $periode = null): array
    {
        $grid = $this->direktoratGrid($user, $periode);
        return array_values(array_map(
            fn ($d) => ['nama' => $d['nama'], 'kode' => $d['kode'], 'nilai' => $d['nilai']],
            array_filter($grid, fn ($d) => $d['nilai'] < $threshold)
        ));
    }

    /**
     * Compact summary for Home dashboard KPI column.
     *
     * @return array{
     *   avgDirektorat: float,
     *   totalDirektorat: int,
     *   topDirektorat: array<int, array{rank: int, nama: string, kode: string, nilai: float}>,
     *   belowTarget: array<int, array{nama: string, kode: string, nilai: float}>,
     *   periode: string,
     * }
     */
    public function homeSnapshot(?User $user = null, ?string $periode = null): array
    {
        $periode = $periode ?? now()->format('Y-m');
        $grid = $this->direktoratGrid($user, $periode);
        $avg = count($grid) > 0
            ? round(array_sum(array_column($grid, 'nilai')) / count($grid), 2)
            : 0.0;

        return [
            'avgDirektorat'   => $avg,
            'totalDirektorat' => count($grid),
            'topDirektorat'   => $this->topDirektorat($user, 3, $periode),
            'belowTarget'     => $this->belowTarget($user, 80.0, $periode),
            'periode'         => $periode,
        ];
    }

    /**
     * Resolve directorate IDs visible to viewer.
     *
     * Returns:
     *   - null  → portfolio-wide (executive role; no filter)
     *   - array → filter to these IDs (scoped role)
     *   - empty array → user has no resolvable scope (returns no data)
     *
     * Anonymous calls (no $user) default to portfolio-wide for backward
     * compatibility with internal seeding/CLI tools.
     */
    private function resolveScopedDirectorateIds(?User $user): ?array
    {
        if ($user === null) return null;

        $scope = OrgScope::forUser($user);
        if ($scope->isExecutive) return null;

        if (empty($scope->unitIds)) return [];

        // KADIV/KASUBDIV/etc. — derive parent directorate(s) from their units
        return OrganizationalUnit::query()
            ->whereIn('id', $scope->unitIds)
            ->whereNotNull('directorateId')
            ->pluck('directorateId')
            ->unique()
            ->values()
            ->all();
    }
}
