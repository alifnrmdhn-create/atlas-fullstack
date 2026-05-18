<?php

namespace Tests\Unit;

use App\Services\Helpers\WeekToMonthMapper;
use PHPUnit\Framework\TestCase;

class WeekToMonthMapperTest extends TestCase
{
    public function test_january_2026_weeks(): void
    {
        // 2026-01-01 is a Thursday → ISO week 1 starts 2025-12-29.
        // January 2026 days span weeks 1..5.
        $weeks = WeekToMonthMapper::getWeeksInMonth(2026, 1);

        $this->assertSame([1, 2, 3, 4, 5], $weeks);
    }

    public function test_june_2026_weeks(): void
    {
        // June 2026: 1st falls in week 23 (Mon 1 Jun). Month ends Tue 30.
        $weeks = WeekToMonthMapper::getWeeksInMonth(2026, 6);

        $this->assertSame([23, 24, 25, 26, 27], $weeks);
    }

    public function test_month_is_targeted_when_planned_week_intersects(): void
    {
        // Plan: weeks 23, 24, 30 — June covers 23-27 → intersect (23, 24)
        $this->assertTrue(
            WeekToMonthMapper::isMonthTargeted([23, 24, 30], 2026, 6)
        );
    }

    public function test_month_is_not_targeted_when_no_intersection(): void
    {
        // Plan: weeks 30, 31, 32 — June covers 23-27 → no intersect
        $this->assertFalse(
            WeekToMonthMapper::isMonthTargeted([30, 31, 32], 2026, 6)
        );
    }

    public function test_empty_planned_weeks_means_not_targeted(): void
    {
        $this->assertFalse(WeekToMonthMapper::isMonthTargeted([], 2026, 6));
    }

    public function test_realized_uses_same_logic_as_targeted(): void
    {
        // Same week list shape, same intersection rule.
        $this->assertTrue(
            WeekToMonthMapper::isMonthRealized([25], 2026, 6)
        );
        $this->assertFalse(
            WeekToMonthMapper::isMonthRealized([50], 2026, 6)
        );
    }

    public function test_string_weeks_from_json_are_coerced(): void
    {
        // When plannedWeeks comes from JSON column it may be string[].
        // Mapper normalizes to int[] before intersect.
        $this->assertTrue(
            WeekToMonthMapper::isMonthTargeted(['23', '24'], 2026, 6)
        );
    }

    public function test_week_that_spans_two_months_counts_for_both(): void
    {
        // Week 22 of 2026 = May 25 to May 31 (entirely in May).
        // But week 23 = Jun 1 to Jun 7 (entirely in June).
        // Test a real boundary week: week 27 = Jun 29 to Jul 5 (spans).
        $juneWeeks = WeekToMonthMapper::getWeeksInMonth(2026, 6);
        $julyWeeks = WeekToMonthMapper::getWeeksInMonth(2026, 7);

        $this->assertContains(27, $juneWeeks, 'week 27 should belong to June (Jun 29-30)');
        $this->assertContains(27, $julyWeeks, 'week 27 should belong to July (Jul 1-5)');
    }

    public function test_iso_string_format_yyyy_wnn(): void
    {
        // Production format dari TaskService::derivePlannedWeeks: "2026-W21".
        // Bug sebelumnya: intval("2026-W21") → 2026 (year), bukan 21 (week).
        // Akibatnya tabel Charter selalu kosong. Fix harus parse week part.
        $planned = ['2026-W21', '2026-W22'];
        $this->assertTrue(
            WeekToMonthMapper::isMonthTargeted($planned, 2026, 5),
            'W21-W22 2026 should target May 2026 (May 18-31)'
        );
        $this->assertFalse(
            WeekToMonthMapper::isMonthTargeted($planned, 2026, 4),
            'W21-W22 2026 should not target April 2026'
        );
    }

    public function test_iso_string_filters_by_year(): void
    {
        // Weeks dari year berbeda jangan tercampur — kalau plannedWeeks
        // punya "2025-W21" dan kita check May 2026, harus return false.
        $planned = ['2025-W21'];
        $this->assertFalse(
            WeekToMonthMapper::isMonthTargeted($planned, 2026, 5),
            'May 2026 should not match May 2025 weeks'
        );
        $this->assertTrue(
            WeekToMonthMapper::isMonthTargeted($planned, 2025, 5),
            'May 2025 should match May 2025 weeks'
        );
    }
}
