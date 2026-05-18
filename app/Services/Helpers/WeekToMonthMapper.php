<?php

namespace App\Services\Helpers;

/**
 * Map ISO week numbers (1–53) to calendar months for the Charter View
 * activity timeline table.
 *
 * Each `Task` stores `plannedWeeks` and `actualWeeks` as int arrays of
 * ISO week numbers within a single year. A month is "targeted" if any
 * of its ISO weeks appears in `plannedWeeks` (per plan section 5.6:
 * "Bulan ter-target jika minimal 1 minggu di bulan itu ada di
 * plannedWeeks"). A week that spans two months counts for both.
 */
class WeekToMonthMapper
{
    /**
     * ISO week numbers that touch a given calendar month.
     *
     * Example: June 2026 → [22, 23, 24, 25, 26, 27] (the trailing week
     * spills into July but is still counted because it intersects June).
     *
     * @return int[] sorted ascending, unique
     */
    public static function getWeeksInMonth(int $year, int $month): array
    {
        $weeks = [];
        $cursor = (new \DateTimeImmutable("$year-$month-01"))->setTime(0, 0);
        $monthEnd = $cursor->modify('last day of this month');

        while ($cursor <= $monthEnd) {
            $weeks[(int) $cursor->format('W')] = true;
            $cursor = $cursor->modify('+1 day');
        }

        $result = array_keys($weeks);
        sort($result);
        return $result;
    }

    /** True if any week in the month appears in $plannedWeeks. */
    public static function isMonthTargeted(array $plannedWeeks, int $year, int $month): bool
    {
        if (empty($plannedWeeks)) return false;
        $monthWeeks = self::getWeeksInMonth($year, $month);
        return !empty(array_intersect(self::normalize($plannedWeeks), $monthWeeks));
    }

    /** True if any week in the month appears in $actualWeeks. */
    public static function isMonthRealized(array $actualWeeks, int $year, int $month): bool
    {
        if (empty($actualWeeks)) return false;
        $monthWeeks = self::getWeeksInMonth($year, $month);
        return !empty(array_intersect(self::normalize($actualWeeks), $monthWeeks));
    }

    /** Coerce mixed input (strings from JSON, ints, nulls) to int[]. */
    private static function normalize(array $weeks): array
    {
        return array_map('intval', array_filter($weeks, fn ($v) => $v !== null && $v !== ''));
    }
}
