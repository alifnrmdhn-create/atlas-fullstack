<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Test tidak butuh asset hasil vite build — tanpa ini, test yang
        // merender halaman Inertia gagal "Vite manifest not found" di
        // lingkungan yang belum pernah `npm run build` (mis. CI).
        $this->withoutVite();

        // Pastikan schema ptpn_kmr_app ada di test DB
        $schema = config('database.connections.pgsql.search_path', 'ptpn_kmr_app');
        DB::statement("CREATE SCHEMA IF NOT EXISTS \"{$schema}\"");
        DB::statement("SET search_path TO \"{$schema}\"");
    }
}
