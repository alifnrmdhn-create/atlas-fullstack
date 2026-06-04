<?php

/**
 * ATLAS — Feature Flags.
 *
 * Setiap flag bernilai 'enabled' | 'disabled' | string (kode direktorat, e.g.
 * 'DIR-KMR' untuk scope direktorat tertentu). Nilai scope dibandingkan dengan
 * KODE direktorat user (Directorate.code), jadi harus pakai kode yang benar-
 * benar ada di seed: DIRUT, DBS, DAS, DIR-KMR, DPP, DSU. Backend cek via
 * FeatureFlagService; frontend lewat Inertia shared `features` prop + useFeatureFlag.
 */

return [
    // Sprint 4 — Clear the Path. 'DIR-KMR' = enable hanya untuk user di direktorat
    // DKMR (pilot). CATATAN: harus 'DIR-KMR' (kode direktorat sesungguhnya), BUKAN
    // 'DKM' — perbandingan eksak ke Directorate.code, 'DKM' tak pernah match → fitur
    // mati total untuk semua user.
    'clear-the-path' => env('FEATURE_CLEAR_THE_PATH', 'DIR-KMR'),

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
