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

    /**
     * Public accessor: week numbers (1–53) untuk $year dari array
     * planned/actual (format "YYYY-WNN" atau bare int). Dipakai
     * ProgramCharterService::computeAchievementPct yang butuh angka
     * minggu, bukan string — `(int) "2026-W09"` salah parse jadi 2026.
     *
     * @return int[]
     */
    public static function weekNumbersForYear(array $weeks, int $year): array
    {
        return self::extractWeekNumbersForYear($weeks, $year);
    }

    /** True if any week in the month appears in $plannedWeeks. */
    public static function isMonthTargeted(array $plannedWeeks, int $year, int $month): bool
    {
        if (empty($plannedWeeks)) return false;
        $monthWeeks = self::getWeeksInMonth($year, $month);
        return !empty(array_intersect(self::extractWeekNumbersForYear($plannedWeeks, $year), $monthWeeks));
    }

    /** True if any week in the month appears in $actualWeeks. */
    public static function isMonthRealized(array $actualWeeks, int $year, int $month): bool
    {
        if (empty($actualWeeks)) return false;
        $monthWeeks = self::getWeeksInMonth($year, $month);
        return !empty(array_intersect(self::extractWeekNumbersForYear($actualWeeks, $year), $monthWeeks));
    }

    /**
     * Extract week numbers (1–53) yang relevan untuk $year tertentu dari array
     * input. Mendukung dua format:
     *   - "YYYY-WNN" (canonical ISO, dipakai TaskService::derivePlannedWeeks
     *     dan ExecutionGrid). Year prefix di-filter — hanya weeks dengan year
     *     match yang dimasukkan.
     *   - Integer/digit-string bare (legacy). Diasumsikan punya $year sama.
     *
     * Bug sebelumnya: normalize() pakai intval() yang convert "2026-W21" → 2026
     * (year part), bukan 21 (week number). Akibatnya tabel timeline charter
     * selalu kosong meski plannedWeeks ada.
     *
     * @return int[]
     */
    private static function extractWeekNumbersForYear(array $weeks, int $year): array
    {
        $result = [];
        foreach ($weeks as $v) {
            if ($v === null || $v === '') continue;
            if (is_string($v) && preg_match('/^(\d{4})-W(\d{1,2})$/i', $v, $m)) {
                if ((int) $m[1] === $year) {
                    $result[] = (int) $m[2];
                }
                continue;
            }
            if (is_int($v) || (is_string($v) && ctype_digit($v))) {
                // Legacy bare int format — assume same year as parameter.
                $result[] = (int) $v;
            }
        }
        return $result;
    }
}
