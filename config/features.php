<?php

/**
 * ATLAS — Feature Flags.
 *
 * Setiap flag bernilai 'enabled' | 'disabled' | string (e.g. 'DKM' untuk
 * scope direktorat tertentu). Backend cek via FeatureFlagService;
 * frontend lewat Inertia shared `features` prop dan useFeatureFlag hook.
 */

return [
    // Sprint 4 — Clear the Path. 'DKM' = enable hanya untuk user di direktorat DKM (pilot).
    'clear-the-path' => env('FEATURE_CLEAR_THE_PATH', 'DKM'),

    // Sprint 4 — Commitment Ledger. Default enable global karena read-only & non-disruptive.
    'commitment-ledger' => env('FEATURE_COMMITMENT_LEDGER', 'enabled'),

    // Sprint 5 (forward) — placeholder
    'auto-health' => env('FEATURE_AUTO_HEALTH', 'disabled'),
    'kpi-forecast' => env('FEATURE_KPI_FORECAST', 'disabled'),

    // Sprint 6 — Form autosave / draft persistence. Default enabled (infra,
    // bukan workflow change). Set ke 'disabled' di .env untuk rollback cepat
    // tanpa code revert kalau ada masalah produksi.
    'autosave' => env('FEATURE_AUTOSAVE', 'enabled'),
];
