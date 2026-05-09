<?php

namespace Database\Seeders;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $directorate = Directorate::updateOrCreate(
            ['code' => 'DIR-ATLAS'],
            [
                'name' => 'Direktorat ATLAS',
                'shortName' => 'ATLAS',
                'corporateName' => 'ATLAS',
                'corporateCode' => 'ATLAS',
                'domain' => 'atlas.local',
                'isActive' => true,
            ],
        );

        $unit = OrganizationalUnit::updateOrCreate(
            ['code' => 'UNIT-ATLAS'],
            [
                'name' => 'Unit ATLAS',
                'description' => 'Default ATLAS organizational unit',
                'unitType' => 'DIVISI',
                'directorateId' => $directorate->id,
                'parentId' => null,
                'isActive' => true,
            ],
        );

        $position = Position::updateOrCreate(
            ['code' => 'POS-ATLAS-ADMIN'],
            [
                'name' => 'ATLAS Administrator',
                'levelCode' => 'L1',
                'roleType' => 'SUPERADMIN',
                'directorateId' => $directorate->id,
                'divisionId' => $unit->id,
                'isActive' => true,
            ],
        );

        User::updateOrCreate(
            ['email' => 'admin@atlas.local'],
            [
                'name' => 'ATLAS Admin',
                'userId' => 'atlas.admin',
                'nik' => '00000001',
                'passwordHash' => Hash::make('Password123!'),
                'roleType' => 'SUPERADMIN',
                'isActive' => true,
                'unitId' => $unit->id,
                'directorateId' => $directorate->id,
                'positionId' => $position->id,
                'positionTitle' => $position->name,
            ],
        );

        DB::table('role_configs')->updateOrInsert(
            ['role' => 'SUPERADMIN'],
            [
                'label' => 'Super Admin',
                'description' => 'Full system access',
                'badgeColor' => 'bg-red-100 text-red-700',
                'updatedAt' => now(),
            ],
        );

        $this->call([
            ScorecardSeeder::class,
        ]);
    }
}
