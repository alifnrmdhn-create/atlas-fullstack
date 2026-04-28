<?php

namespace App\Services;

use App\Models\ProgramHealthSnapshot;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class ProgramSnapshotService
{
    /**
     * Returns time-series for the last $days, oldest first.
     * Each point: { date, total, onTrack, atRisk, terlambat, pctOnTrack }.
     * Used to draw a sparkline trend in the hero.
     */
    public function trendSeries(int $days = 14): array
    {
        $from = Carbon::today()->subDays($days - 1)->toDateString();
        return ProgramHealthSnapshot::query()
            ->where('snapshotDate', '>=', $from)
            ->orderBy('snapshotDate')
            ->get(['snapshotDate', 'total', 'onTrack', 'atRisk', 'terlambat', 'overdue'])
            ->map(function ($s) {
                $tlm = (int) $s->terlambat + (int) $s->overdue;
                $total = max(1, (int) $s->total);
                return [
                    'date'       => $s->snapshotDate->toDateString(),
                    'total'      => (int) $s->total,
                    'onTrack'    => (int) $s->onTrack,
                    'atRisk'     => (int) $s->atRisk,
                    'terlambat'  => $tlm,
                    'pctOnTrack' => (int) round(((int) $s->onTrack) / $total * 100),
                ];
            })->values()->all();
    }

    /**
     * Save today's snapshot if not already saved.
     * Called on each dashboard load — idempotent.
     */
    public function saveToday(array $counts, array $byDivisi): ProgramHealthSnapshot
    {
        return ProgramHealthSnapshot::firstOrCreate(
            ['snapshotDate' => Carbon::today()->toDateString()],
            [
                'total'     => $counts['total'],
                'onTrack'   => $counts['onTrack'],
                'atRisk'    => $counts['atRisk'],
                'terlambat' => $counts['terlambat'],
                'overdue'   => $counts['overdue'],
                'selesai'   => $counts['selesai'],
                'byDivisi'  => $byDivisi,
            ]
        );
    }

    /**
     * Returns velocity: delta between current counts and the most recent
     * snapshot that is at least 7 days old.
     *
     * Returns null if there is no older snapshot to compare against.
     */
    public function velocity(array $current, array $currentByDivisi): ?array
    {
        $previous = ProgramHealthSnapshot::query()
            ->where('snapshotDate', '<=', Carbon::today()->subDays(6)->toDateString())
            ->orderByDesc('snapshotDate')
            ->first();

        if (!$previous) return null;

        $delta = fn (string $key) => ($current[$key] ?? 0) - ($previous->$key ?? 0);

        // Per-division delta
        $prevDivisi = collect($previous->byDivisi ?? []);
        $divDelta   = collect($currentByDivisi)->map(function ($div) use ($prevDivisi) {
            $prev = $prevDivisi->firstWhere('unit.code', $div['unit']['code']);
            return [
                'code'    => $div['unit']['code'],
                'onTrack' => ($div['onTrack'] ?? 0) - ($prev['onTrack'] ?? 0),
                'atRisk'  => ($div['atRisk']  ?? 0) - ($prev['atRisk']  ?? 0),
            ];
        })->values();

        return [
            'comparedTo'    => $previous->snapshotDate->toDateString(),
            'daysAgo'       => (int) Carbon::today()->diffInDays($previous->snapshotDate),
            'total'         => $delta('total'),
            'onTrack'       => $delta('onTrack'),
            'atRisk'        => $delta('atRisk'),
            'terlambat'     => $delta('terlambat') + $delta('overdue'),
            'selesai'       => $delta('selesai'),
            'byDivisi'      => $divDelta,
        ];
    }
}
