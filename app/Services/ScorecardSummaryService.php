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
     * Compact summary for Home dashboard KPI column — adaptive per scope level.
     *
     * Level decides which "items" to surface:
     *   - portfolio (DIRUT/SUPERADMIN/ADMIN) → 6 direktorat
     *   - directorate (Direktur fungsional/KADIV) → divisi within their direktorat
     *   - unit (KASUBDIV/below) → no KPI section data (returns empty)
     *
     * Plus `ownItem` when applicable: user's parent direktorat info, surfaced
     * as a contextual header in directorate-level renderings.
     *
     * `grid` carries the full direktorat × divisi structure when level=portfolio
     * — used by HomeView's cross-direktorat matrix (Isu #9). At
     * directorate/unit level the matrix is hidden so the field is omitted to
     * keep payload lean.
     *
     * @return array{
     *   level: string,
     *   periode: string,
     *   periodeLabel: string,
     *   itemLabel: string,
     *   avgItem: float,
     *   avgDelta: ?float,
     *   totalItem: int,
     *   topItems: array<int, array{rank: int, nama: string, kode: string, nilai: float}>,
     *   belowTarget: array<int, array{nama: string, kode: string, nilai: float}>,
     *   ownItem: ?array{kode: string, nama: string, nilai: float},
     *   kpiTrend: array<int, array{label: string, avg: ?float}>,
     *   grid?: array<int, array{kode: string, nama: string, nilai: float, divisi: array<int, array{kode: string, nama: string, nilai: float}>}>,
     * }
     */
    public function homeSnapshot(?User $user = null, ?string $periode = null): array
    {
        // Scorecard data lands monthly and lags the calendar, so the current
        // month is usually still empty. Resolve to the latest period that
        // actually HAS data in the viewer's scope — otherwise Home shows a blank
        // KPI panel even when recent data exists (Home is make-or-break: a blank
        // panel reads as broken, not "no data yet").
        $periode = $periode ?? $this->latestPeriodeWithData($user) ?? now()->format('Y-m');
        $level = $this->resolveLevel($user);

        // Resolve "ownItem" — user's own direktorat, when applicable
        $ownItem = $this->resolveOwnItem($user, $periode);

        $grid = null;
        if ($level === 'portfolio') {
            $items = $this->direktoratGrid($user, $periode);
            $grid  = $items; // full structure for cross-direktorat matrix
            $itemLabel = 'direktorat';
        } elseif ($level === 'directorate' && $user?->directorateId) {
            $items = $this->divisiGrid($user->directorateId, $periode);
            $itemLabel = 'divisi';
        } else {
            $items = [];
            $itemLabel = 'item';
        }

        $avgItem = count($items) > 0
            ? round(array_sum(array_column($items, 'nilai')) / count($items), 2)
            : 0.0;

        // Sort items desc for top 3
        usort($items, fn ($a, $b) => $b['nilai'] <=> $a['nilai']);
        $topItems = array_map(fn ($d, $i) => [
            'rank'  => $i + 1,
            'nama'  => $d['nama'],
            'kode'  => $d['kode'],
            'nilai' => $d['nilai'],
        ], array_slice($items, 0, 3), array_keys(array_slice($items, 0, 3)));

        $belowTarget = array_values(array_map(
            fn ($d) => ['nama' => $d['nama'], 'kode' => $d['kode'], 'nilai' => $d['nilai']],
            array_filter($items, fn ($d) => $d['nilai'] < 80.0)
        ));

        // KPI trend (last 6 months, averaged across the scoped items) + the
        // delta vs the previous period that has data. Powers the lagging-side
        // sparkline and the Delta indicator on Home. Reuses the same table+scope
        // as `items` so the last point matches `avgItem`.
        $series   = $this->kpiAvgSeries($user, $periode, 6);
        $kpiTrend = array_map(fn ($s) => ['label' => $s['label'], 'avg' => $s['avg']], $series);
        $nonNull  = array_values(array_filter($series, fn ($s) => $s['avg'] !== null));
        $avgDelta = count($nonNull) >= 2
            ? round($nonNull[count($nonNull) - 1]['avg'] - $nonNull[count($nonNull) - 2]['avg'], 2)
            : null;

        $payload = [
            'level'        => $level,
            'periode'      => $periode,
            'periodeLabel' => Carbon::createFromFormat('Y-m', $periode)->isoFormat('MMMM YYYY'),
            'itemLabel'    => $itemLabel,
            'avgItem'      => $avgItem,
            'avgDelta'     => $avgDelta,
            'totalItem'    => count($items),
            'topItems'     => $topItems,
            'belowTarget'  => $belowTarget,
            'ownItem'      => $ownItem,
            'kpiTrend'     => $kpiTrend,
        ];
        if ($grid !== null) {
            $payload['grid'] = $grid;
        }
        return $payload;
    }

    /**
     * Latest periode (YYYY-MM, ≤ current month) that has scorecard data in the
     * viewer's scope. Mirrors the table `homeSnapshot` reads `items` from:
     * DivisiScorecard at directorate level, DirektoratScorecard otherwise.
     * Returns null when the scope has no data at all (caller falls back to now).
     */
    private function latestPeriodeWithData(?User $user): ?string
    {
        $now = now()->format('Y-m');
        $query = DirektoratScorecard::query();

        if ($this->resolveLevel($user) !== 'portfolio' && $user?->directorateId) {
            // directorate/unit: anchor on the viewer's own directorate (its score
            // is the KPI headline) so the resolved period always has the hero number.
            $query->where('directorateId', $user->directorateId);
        } else {
            $ids = $this->resolveScopedDirectorateIds($user);
            if ($ids !== null) {
                $query->whereIn('directorateId', $ids);
            }
        }

        // 'YYYY-MM' sorts lexicographically == chronologically.
        return $query->where('periode', '<=', $now)->max('periode');
    }

    /**
     * Average KPI nilai per month for the last $months periods, using the same
     * table + scope as `homeSnapshot` items. Missing months yield avg=null so
     * the frontend can gap-skip. Anchored at $endPeriode (the resolved period).
     *
     * @return array<int, array{key: string, label: string, avg: ?float}>
     */
    private function kpiAvgSeries(?User $user, string $endPeriode, int $months = 6): array
    {
        $months = max(2, min(12, $months));
        $end = Carbon::createFromFormat('Y-m', $endPeriode)->startOfMonth();

        $labels = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $p = $end->copy()->subMonthsNoOverflow($i);
            $labels[$p->format('Y-m')] = $p->isoFormat('MMM');
        }
        $keys = array_keys($labels);

        if ($this->resolveLevel($user) !== 'portfolio' && $user?->directorateId) {
            // directorate/unit: trend the viewer's OWN directorate series so the
            // sparkline + delta match the ownItem headline (not the divisi average).
            $rows = DirektoratScorecard::query()
                ->where('directorateId', $user->directorateId)
                ->whereIn('periode', $keys)
                ->get(['periode', 'nilai']);
        } else {
            $query = DirektoratScorecard::query()->whereIn('periode', $keys);
            $ids = $this->resolveScopedDirectorateIds($user);
            if ($ids !== null) {
                $query->whereIn('directorateId', $ids);
            }
            $rows = $query->get(['periode', 'nilai']);
        }

        $byPeriode = $rows->groupBy('periode');

        $out = [];
        foreach ($labels as $key => $label) {
            $grp = $byPeriode->get($key);
            $out[] = [
                'key'   => $key,
                'label' => $label,
                'avg'   => ($grp && $grp->count() > 0) ? round((float) $grp->avg('nilai'), 2) : null,
            ];
        }
        return $out;
    }

    /**
     * Trend skor KPI direktorat untuk N bulan terakhir.
     *
     * Mirror chart "Tren Skor KPI - JANUARI s.d. MARET 2026" di slide 8 PDF
     * DKMR. Bar chart clustered: x-axis bulan, y-axis nilai (0-110), satu
     * series per direktorat dalam scope viewer.
     *
     * Periode terakhir = $endPeriode atau bulan berjalan. Mundur $months
     * bulan ke belakang. Direktorat yang tidak punya data di salah satu
     * bulan tetap muncul dengan nilai null (chart akan gap-skip).
     *
     * @return array{
     *   periodes: array<int, array{key: string, label: string}>,
     *   series: array<int, array{kode: string, nama: string, values: array<int, ?float>}>
     * }
     */
    public function trendDirektorat(
        ?User $user = null,
        int $months = 6,
        ?string $endPeriode = null,
    ): array {
        $endPeriode = $endPeriode ?? now()->format('Y-m');
        $months = max(2, min(12, $months));

        // Build periode list mundur dari endPeriode
        $end = Carbon::createFromFormat('Y-m', $endPeriode)->startOfMonth();
        $periodes = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $p = $end->copy()->subMonthsNoOverflow($i);
            $periodes[] = [
                'key'   => $p->format('Y-m'),
                'label' => $p->isoFormat('MMM'),
            ];
        }
        $periodeKeys = array_column($periodes, 'key');

        // Scope direktorat IDs (sama logic dengan direktoratGrid)
        $directorateIds = $this->resolveScopedDirectorateIds($user);

        // Pull all DirektoratScorecard values dalam range periode + scope
        $rowsQuery = DirektoratScorecard::query()
            ->whereIn('periode', $periodeKeys);
        if ($directorateIds !== null) {
            $rowsQuery->whereIn('directorateId', $directorateIds);
        }
        $rows = $rowsQuery->get(['directorateId', 'periode', 'nilai']);

        if ($rows->isEmpty()) {
            return ['periodes' => $periodes, 'series' => []];
        }

        // Unique direktorat dalam result
        $directorateIdList = $rows->pluck('directorateId')->unique()->values();
        $directorates = Directorate::query()
            ->whereIn('id', $directorateIdList)
            ->orderBy('code')
            ->get(['id', 'code', 'name']);

        // Build series: per direktorat, values aligned with periodeKeys order
        $series = $directorates->map(function (Directorate $dir) use ($rows, $periodeKeys) {
            $values = array_map(function ($key) use ($rows, $dir) {
                $match = $rows->first(fn ($r) => $r->directorateId === $dir->id && $r->periode === $key);
                return $match ? (float) $match->nilai : null;
            }, $periodeKeys);
            return [
                'kode'   => $dir->code,
                'nama'   => $dir->name,
                'values' => $values,
            ];
        })->values()->all();

        return ['periodes' => $periodes, 'series' => $series];
    }

    /**
     * Resolve display level from user's OrgScope.
     */
    private function resolveLevel(?User $user): string
    {
        if ($user === null) return 'portfolio';
        $scope = OrgScope::forUser($user);
        if ($scope->isExecutive) return 'portfolio';
        return $scope->level; // 'directorate' | 'unit'
    }

    /**
     * Return divisi (units) breakdown within a single direktorat, with KPI nilai
     * pulled from DivisiScorecard for the period.
     *
     * @return array<int, array{kode: string, nama: string, nilai: float}>
     */
    public function divisiGrid(int $directorateId, ?string $periode = null): array
    {
        $periode = $periode ?? now()->format('Y-m');

        $values = DivisiScorecard::query()
            ->where('directorateId', $directorateId)
            ->where('periode', $periode)
            ->with('unit:id,code,name')
            ->get(['id', 'unitId', 'directorateId', 'nilai']);

        return $values
            ->filter(fn ($d) => $d->unit !== null)
            ->map(fn ($d) => [
                'kode'  => $d->unit->code,
                'nama'  => $d->unit->name,
                'nilai' => (float) $d->nilai,
            ])
            ->values()
            ->all();
    }

    /**
     * User's own direktorat snapshot, returned for header context in
     * directorate-level renderings. Null for portfolio level (DIRUT
     * sees all direktorat, no singular "own").
     *
     * @return ?array{kode: string, nama: string, nilai: float}
     */
    private function resolveOwnItem(?User $user, string $periode): ?array
    {
        if ($user === null || !$user->directorateId) return null;

        $level = $this->resolveLevel($user);
        if ($level === 'portfolio') return null;

        $directorate = Directorate::find($user->directorateId);
        if (!$directorate) return null;

        $nilai = DirektoratScorecard::query()
            ->where('directorateId', $directorate->id)
            ->where('periode', $periode)
            ->value('nilai');

        if ($nilai === null) return null;

        return [
            'kode'  => $directorate->code,
            'nama'  => $directorate->name,
            'nilai' => (float) $nilai,
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
