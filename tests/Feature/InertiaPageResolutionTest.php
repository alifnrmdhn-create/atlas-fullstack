<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class InertiaPageResolutionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create([
            'code' => 'DIR-SMOKE',
            'name' => 'Direktorat Smoke',
            'description' => null,
        ]);

        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-SMOKE',
            'name' => 'Unit Smoke',
            'unitType' => 'DIVISI',
            'directorateId' => $dir->id,
            'parentId' => null,
        ]);

        $this->admin = User::create([
            'name' => 'Smoke Admin',
            'email' => 'smoke-admin@ptpn.test',
            'passwordHash' => Hash::make('password123'),
            'roleType' => 'SUPERADMIN',
            'isActive' => true,
            'unitId' => $unit->id,
            'directorateId' => $dir->id,
        ]);
    }

    #[DataProvider('inertiaIndexPages')]
    public function test_authenticated_inertia_index_pages_resolve(string $path, string $component): void
    {
        $this->actingAs($this->admin)
            ->get($path)
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component($component));
    }

    public static function inertiaIndexPages(): array
    {
        return [
            'home' => ['/', 'HomeView'],
            'dashboard alias' => ['/dashboard', 'DashboardView'],
            'roadmap alias' => ['/roadmap', 'RoadmapView'],
            'execution alias' => ['/execution', 'WorkboardView'],
            'focus alias' => ['/fokus', 'InboxView'],
            'goals alias' => ['/goals', 'GoalsView'],
            'activity alias' => ['/activity', 'ActivityView'],
            'reports alias' => ['/reports', 'ReportsView'],
            'schedule alias' => ['/jadwal', 'ScheduleView'],
            'monthly reports nav alias' => ['/laporan-bulanan', 'MonthlyReportView'],
            'risk reports nav alias' => ['/laporan-risiko', 'RiskReportView'],
            'search alias' => ['/search', 'SearchView'],
            'presence alias' => ['/presence', 'PresenceView'],
            'profile alias' => ['/profile', 'ProfileView'],
            'settings alias' => ['/settings', 'SettingsView'],
            'playbook alias' => ['/playbook', 'PlaybookView'],
            'admin orgs alias' => ['/admin/orgs', 'AdminOrgsView'],
            'admin users alias' => ['/admin/users', 'AdminUsersView'],
            'admin positions alias' => ['/admin/positions', 'AdminPositionsView'],
            'admin roles alias' => ['/admin/roles', 'AdminRolesView'],
            'programs' => ['/programs', 'ProgramsView'],
            'archived programs' => ['/programs/archived', 'Programs/Archived'],
            'assignments' => ['/assignments', 'AssignmentsView'],
            'channels' => ['/channels', 'ChannelsViewWrapper'],
            'meetings' => ['/meetings', 'MeetingsView'],
            'monthly reports' => ['/monthly-reports', 'MonthlyReportView'],
            'risk reports' => ['/risk-reports', 'RiskReportView'],
            'organization' => ['/organization/hierarchy', 'OrganizationView'],
        ];
    }
}
