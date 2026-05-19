<?php

namespace App\Services;

use Carbon\Carbon;

/**
 * WeeklyDeadlineService — single source of truth untuk cadence Refleksi Mingguan.
 *
 * Rule:
 *   - Cutoff data: Jumat end-of-day (posisi s.d. Jumat dipakai sebagai bahan refleksi)
 *   - Submit deadline: Sabtu 12:00 WIB
 *   - Setelah deadline: submit tetap diizinkan tapi di-flag isLate
 *   - Holiday-aware: kalau Jumat libur, cutoff geser ke hari kerja sebelumnya.
 *     Kalau Sabtu libur, deadline geser ke hari kerja berikutnya jam 12:00.
 *   - Program yang aktif tengah-minggu exempt dari refleksi minggu itu (mulai minggu depan).
 *
 * State machine (per program × minggu):
 *   OPEN      Senin–Kamis: window terbuka, no urgency
 *   DUE_SOON  Jumat 00:00 – (deadline - 1h): prompt soft
 *   URGENT    (deadline - 1h) – deadline: countdown prominent
 *   LATE      now > deadline tapi week belum berakhir: bisa submit dengan flag
 *   MISSED    week sudah berakhir tanpa submit: counted as compliance miss
 */
class WeeklyDeadlineService
{
    public const STATE_OPEN     = 'OPEN';
    public const STATE_DUE_SOON = 'DUE_SOON';
    public const STATE_URGENT   = 'URGENT';
    public const STATE_LATE     = 'LATE';
    public const STATE_MISSED   = 'MISSED';

    private string $timezone;
    private int $cutoffDow;
    private int $deadlineDow;
    private int $deadlineHour;
    private int $urgentHoursBefore;
    /** @var string[] */
    private array $holidays;

    public function __construct()
    {
        $cfg = config('atlas-thresholds.reflection', []);
        $this->timezone          = $cfg['timezone'] ?? 'Asia/Jakarta';
        $this->cutoffDow         = (int) ($cfg['cutoff_dow'] ?? 5);
        $this->deadlineDow       = (int) ($cfg['deadline_dow'] ?? 6);
        $this->deadlineHour      = (int) ($cfg['deadline_hour'] ?? 12);
        $this->urgentHoursBefore = (int) ($cfg['urgent_hours_before'] ?? 1);
        $this->holidays          = (array) ($cfg['holidays'] ?? []);
    }

    /** ISO week string "YYYY-Www" untuk now di WIB. */
    public function currentWeekIso(): string
    {
        return Carbon::now($this->timezone)->isoFormat('GGGG-[W]WW');
    }

    public function previousWeekIso(): string
    {
        return Carbon::now($this->timezone)->subWeek()->isoFormat('GGGG-[W]WW');
    }

    /** Parse "2026-W21" → ['year' => 2026, 'week' => 21]. Null kalau invalid. */
    public function parseWeek(string $weekIso): ?array
    {
        if (! preg_match('/^(\d{4})-W(\d{1,2})$/', $weekIso, $m)) return null;
        $week = (int) $m[2];
        if ($week < 1 || $week > 53) return null;
        return ['year' => (int) $m[1], 'week' => $week];
    }

    public function weekMonday(string $weekIso): ?Carbon
    {
        $parsed = $this->parseWeek($weekIso);
        if (! $parsed) return null;
        return Carbon::now($this->timezone)
            ->setISODate($parsed['year'], $parsed['week'])
            ->startOfDay();
    }

    /**
     * Cutoff data: Jumat end-of-day. Kalau Jumat libur, geser MUNDUR ke
     * hari kerja sebelumnya. Loop terbatas 7 hari supaya tidak infinite.
     */
    public function cutoffFor(string $weekIso): ?Carbon
    {
        $monday = $this->weekMonday($weekIso);
        if (! $monday) return null;
        $date = $monday->copy()->addDays($this->cutoffDow - 1);
        for ($i = 0; $i < 7 && $this->isNonWorkingDay($date); $i++) {
            $date->subDay();
        }
        return $date->endOfDay();
    }

    /**
     * Submit deadline: Sabtu 12:00. Kalau Sabtu libur, geser MAJU ke hari
     * kerja berikutnya jam 12:00. Loop terbatas supaya tidak infinite.
     * Minggu juga dianggap non-working — kalau Sabtu libur + Senin libur
     * (rare), bisa loncat ke Selasa.
     */
    public function deadlineFor(string $weekIso): ?Carbon
    {
        $monday = $this->weekMonday($weekIso);
        if (! $monday) return null;
        $date = $monday->copy()->addDays($this->deadlineDow - 1);
        for ($i = 0; $i < 14 && $this->isNonWorkingDay($date); $i++) {
            $date->addDay();
        }
        return $date->setTime($this->deadlineHour, 0, 0);
    }

    public function isHoliday(Carbon $date): bool
    {
        return in_array($date->format('Y-m-d'), $this->holidays, true);
    }

    /**
     * Non-working day = hari libur nasional atau Minggu. Sabtu tetap workday
     * di konteks PTPN (deadline submit jatuh di Sabtu 12:00).
     */
    private function isNonWorkingDay(Carbon $date): bool
    {
        return $this->isHoliday($date) || $date->isSunday();
    }

    /**
     * State refleksi untuk (program × minggu). Lihat doc kelas.
     */
    public function stateFor(string $weekIso, bool $hasSubmitted, ?Carbon $now = null): string
    {
        $now      = $now ?? Carbon::now($this->timezone);
        $deadline = $this->deadlineFor($weekIso);
        $monday   = $this->weekMonday($weekIso);
        if (! $deadline || ! $monday) return self::STATE_OPEN;

        $weekEnd = $monday->copy()->addDays(6)->endOfDay();

        // Sudah lewat akhir minggu tanpa submit → MISSED (untuk compliance Fase 2)
        if ($now->greaterThan($weekEnd) && ! $hasSubmitted) {
            return self::STATE_MISSED;
        }

        // Lewat deadline. Kalau belum submit, masih bisa submit dengan flag → LATE.
        // Kalau sudah submit, juga LATE (entry sudah ditandai isLate=true saat store).
        if ($now->greaterThan($deadline)) {
            return self::STATE_LATE;
        }

        // Belum lewat deadline. Cek URGENT window dulu (paling dekat ke deadline).
        $urgentStart = $deadline->copy()->subHours($this->urgentHoursBefore);
        if ($now->greaterThanOrEqualTo($urgentStart)) {
            return self::STATE_URGENT;
        }

        // DUE_SOON mulai dari awal hari cutoff (Jumat 00:00).
        $dueSoonStart = $monday->copy()->addDays($this->cutoffDow - 1)->startOfDay();
        if ($now->greaterThanOrEqualTo($dueSoonStart)) {
            return self::STATE_DUE_SOON;
        }

        return self::STATE_OPEN;
    }

    /**
     * Program yang aktif tengah-minggu N exempt dari refleksi minggu N.
     * Refleksi pertama jatuh tempo minggu N+1.
     */
    public function isExemptForActivatedAt(?Carbon $activatedAt, string $weekIso): bool
    {
        if (! $activatedAt) return false;
        $activatedWeek = $activatedAt->copy()->setTimezone($this->timezone)->isoFormat('GGGG-[W]WW');
        return $activatedWeek === $weekIso;
    }

    /** Helper untuk controller saat store: tentukan flag isLate. */
    public function isLateSubmission(string $weekIso, ?Carbon $submittedAt = null): bool
    {
        $deadline = $this->deadlineFor($weekIso);
        if (! $deadline) return false;
        $submittedAt = $submittedAt ?? Carbon::now($this->timezone);
        return $submittedAt->greaterThan($deadline);
    }

    /**
     * Summary lengkap untuk dikirim ke FE — payload "deadline awareness" yang
     * di-render badge & countdown.
     */
    public function summary(string $weekIso, bool $hasSubmitted, ?Carbon $activatedAt = null): array
    {
        $now      = Carbon::now($this->timezone);
        $deadline = $this->deadlineFor($weekIso);
        $cutoff   = $this->cutoffFor($weekIso);
        $exempt   = $this->isExemptForActivatedAt($activatedAt, $weekIso);
        $state    = $exempt ? self::STATE_OPEN : $this->stateFor($weekIso, $hasSubmitted, $now);

        return [
            'weekIso'      => $weekIso,
            'cutoff'       => $cutoff?->toIso8601String(),
            'deadline'     => $deadline?->toIso8601String(),
            'state'        => $state,
            'exempt'       => $exempt,
            'hasSubmitted' => $hasSubmitted,
            'now'          => $now->toIso8601String(),
            'timezone'     => $this->timezone,
        ];
    }
}
