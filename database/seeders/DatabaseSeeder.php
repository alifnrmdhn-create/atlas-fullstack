<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Org structure adalah single source of truth — semua user, position,
     * directorate, organizational unit di-seed dari JSON files di
     * `database/seeders/data/`. Test DB, fresh dev install, dan Railway
     * akan dapat data identik dengan local Pak.
     *
     * Order seeding (FK dependency):
     *   Directorate -> OrganizationalUnit -> Position -> User
     * OrganizationalUnit.headId tidak punya FK constraint, di-update
     * setelah UserSeeder supaya value-nya valid.
     */
    public function run(): void
    {
        $this->call([
            DirectorateSeeder::class,
            OrganizationalUnitSeeder::class,
            PositionSeeder::class,
            UserSeeder::class,
        ]);

        $this->updateOrgUnitHeadIds();

        DB::table('role_configs')->updateOrInsert(
            ['role' => 'SUPERADMIN'],
            [
                'label' => 'Super Admin',
                'description' => 'Full system access',
                'badgeColor' => 'bg-red-100 text-red-700',
                'updatedAt' => now(),
            ],
        );

        // ScorecardSeeder dinonaktifkan: nilainya hardcoded (mirror PDF 15 Mei
        // 2026), tampil sebagai KPI Achievement di Home tapi bukan data nyata.
        // Re-enable hanya saat modul KPI sudah punya data real, atau jalankan
        // manual via `php artisan db:seed --class=ScorecardSeeder` untuk demo.
    }

    private function updateOrgUnitHeadIds(): void
    {
        $path = __DIR__ . '/data/organizational_units.json';
        $rows = json_decode(file_get_contents($path), true);

        if (!is_array($rows)) {
            return;
        }

        foreach ($rows as $row) {
            if (!empty($row['headId'])) {
                DB::table('OrganizationalUnit')
                    ->where('id', $row['id'])
                    ->update(['headId' => $row['headId']]);
            }
        }
    }
}
