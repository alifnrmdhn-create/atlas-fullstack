<?php

namespace App\Enums;

enum PilarStrategis: string
{
    case CollectingMore      = 'COLLECTING_MORE';
    case SpendingBetter      = 'SPENDING_BETTER';
    case InnovativeFinancing = 'INNOVATIVE_FINANCING';
    case Enabler             = 'ENABLER';

    /**
     * Apakah pilar strategis berlaku untuk direktorat dengan kode ini?
     * Pilar spesifik transformasi keuangan PTPN III — hanya direktorat yang
     * terdaftar di config('atlas-thresholds.pillar_directorates') (default
     * DIR-KMR) yang memakainya. Direktorat lain → false, dropdown disembunyikan.
     */
    public static function appliesToDirectorate(?string $directorateCode): bool
    {
        if (! $directorateCode) {
            return false;
        }

        $scoped = config('atlas-thresholds.pillar_directorates', []);

        return in_array(strtoupper(trim($directorateCode)), $scoped, true);
    }

    /**
     * Opsi pilar (value => label) yang berlaku untuk direktorat ini, atau array
     * kosong jika direktorat tidak memakai pilar. Single source of truth untuk
     * dropdown di FE (di-share via Inertia) — jangan hardcode opsi di view.
     *
     * @return array<string, string>
     */
    public static function optionsForDirectorate(?string $directorateCode): array
    {
        return self::appliesToDirectorate($directorateCode)
            ? config('atlas-thresholds.pillars', [])
            : [];
    }
}
