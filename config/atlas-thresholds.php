<?php

/**
 * ATLAS — Threshold Configuration untuk fitur PDCA.
 *
 * Semua angka yang mempengaruhi perilaku Andon, Clear the Path, Commitment Ledger,
 * dan auto-derive health TINGGAL DI SINI. Hindari hardcoded di controller/component.
 *
 * Default values ditentukan saat Sprint 0; akan dikonfirmasi via workshop dengan
 * stakeholder (Pak M. Iswahyudi DKM). Override per-environment via .env bila perlu.
 *
 * Lihat dokumen workshop: docs/sprint0-threshold-workshop.md
 */

return [
    // ── Escalation aging (Sprint 4 — Clear the Path) ──────────────────────────
    // Berapa hari sejak request untuk berubah warna indicator. Bukan deadline
    // disposition; itu commit-based.
    'escalation_aging' => [
        'yellow_after_days' => env('ATLAS_ESC_YELLOW_DAYS', 3),
        'orange_after_days' => env('ATLAS_ESC_ORANGE_DAYS', 7),
        'red_after_days'    => env('ATLAS_ESC_RED_DAYS',    14),
    ],

    // ── Action item carryover (Sprint 4) ──────────────────────────────────────
    // Berapa kali action item boleh "carry over" ke rapat berikutnya sebelum
    // sistem nudge / auto-suggest escalation / lock force disposition.
    'carryover' => [
        'nudge_threshold'           => env('ATLAS_CARRY_NUDGE',  2), // soft prompt: "apa yang stuck?"
        'auto_clearpath_threshold'  => env('ATLAS_CARRY_AUTO',   3), // muncul di Clear the Path queue
        'force_disposition_threshold' => env('ATLAS_CARRY_LOCK', 4), // atasan harus disposition
    ],

    // ── ProgressLog freshness (Sprint 5) ──────────────────────────────────────
    // Berapa hari tanpa update progress log sebelum dianggap stale dan
    // healthStatus auto-yellow.
    'progress_log' => [
        'stale_after_days' => env('ATLAS_PROGRESS_STALE_DAYS', 7),
    ],

    // ── Auto-health discrepancy (Sprint 5) ────────────────────────────────────
    // Berapa "level beda" antara self-reported vs auto-derived sebelum
    // discrepancy badge ditampilkan ke reviewer.
    // Level: GREEN=0, YELLOW=1, RED=2, OVERDUE=3 — diff >= threshold = badge.
    'auto_health' => [
        'discrepancy_level_threshold' => env('ATLAS_HEALTH_DISCREPANCY', 1),
        // Threshold untuk derive RED:
        'red_overdue_ratio'    => env('ATLAS_HEALTH_RED_OVERDUE',   0.30), // 30% tasks overdue
        'red_blocker_count'    => env('ATLAS_HEALTH_RED_BLOCKERS',  3),
        'red_kpi_deviation'    => env('ATLAS_HEALTH_RED_KPI',       25),   // % di bawah target
        // Threshold untuk derive YELLOW:
        'yellow_overdue_ratio' => env('ATLAS_HEALTH_YELLOW_OVERDUE', 0.10),
        'yellow_blocker_count' => env('ATLAS_HEALTH_YELLOW_BLOCKERS', 1),
        'yellow_kpi_deviation' => env('ATLAS_HEALTH_YELLOW_KPI',     10),
    ],

    // ── MonthlyReport "suspiciously clean" warning (Sprint 5) ────────────────
    // Reviewer signal kalau laporan tampak terlalu bersih dibanding history.
    'monthly_report' => [
        // Kalau current report punya <X kendala vs avg historis, tampilkan signal
        'suspicious_clean_min_kendala' => env('ATLAS_REPORT_SUSPICIOUS_MIN', 2),
        'suspicious_lookback_periods'  => env('ATLAS_REPORT_SUSPICIOUS_LOOKBACK', 3),
    ],

    // ── Pilot DKM success criteria (Sprint 4 evaluation) ──────────────────────
    'pilot_dkm_success_criteria' => [
        'avg_time_to_disposition_days' => env('ATLAS_PILOT_DISPOSITION_TARGET', 5),
        'min_hit_rate_aggregate_pct'   => env('ATLAS_PILOT_HIT_RATE_TARGET',    60),
        'min_user_satisfaction_score'  => env('ATLAS_PILOT_NPS_TARGET',         7), // 1–10
        'min_active_users_pct'         => env('ATLAS_PILOT_ACTIVE_PCT',         70), // % users di pilot unit
        'evaluation_period_weeks'      => env('ATLAS_PILOT_PERIOD_WEEKS',       6),
    ],

    // ── Commitment Ledger (Sprint 4) ──────────────────────────────────────────
    'commitment_ledger' => [
        'lookback_weeks'              => env('ATLAS_LEDGER_LOOKBACK',       12),
        'streak_min_hit_rate_pct'     => env('ATLAS_LEDGER_STREAK_MIN',     80),
        'low_consistency_alert_pct'   => env('ATLAS_LEDGER_ALERT_PCT',      60),
        'low_consistency_alert_weeks' => env('ATLAS_LEDGER_ALERT_WEEKS',    4),
    ],

    // ── Today section caching (Sprint 2) ──────────────────────────────────────
    'inbox_today' => [
        'cache_ttl_seconds' => env('ATLAS_INBOX_TODAY_CACHE', 60),
    ],

    // ── Daily PIC Workspace: WIP limit per user (Execution Board) ─────────────
    // Maksimal task yang sedang IN_PROGRESS untuk satu user. Backend block
    // transisi ke IN_PROGRESS kalau user sudah mencapai batas — paksa
    // selesaikan task aktif sebelum buka yang baru. Cegah multi-tasking
    // berlebihan.
    'wip' => [
        'in_progress_per_user' => env('ATLAS_WIP_IN_PROGRESS', 5),
    ],

    // ── Strategic pillars (Charter View — Mei 2026) ───────────────────────────
    // Empat pilar strategis PTPN III. Source of truth untuk dropdown label di
    // frontend (di-share via Inertia) dan validasi `pilarStrategis` di
    // ProgramController. Tambah/ubah key di sini saja — jangan hardcode di
    // controller atau view. Sinkron dengan enum app/Enums/PilarStrategis.php.
    // Catatan: NON_SCORECARD adalah nilai Kelompok, bukan Pilar — jangan dimasukkan.
    'pillars' => [
        'COLLECTING_MORE'      => 'Collecting More',
        'SPENDING_BETTER'      => 'Spending Better',
        'INNOVATIVE_FINANCING' => 'Innovative Financing',
        'ENABLER'              => 'Program Enabler',
    ],
];
