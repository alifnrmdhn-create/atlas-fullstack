<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->createActiveUser('asisten@ptpn.test', 'password123');
    }

    public function test_login_page_renders(): void
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
        $response->assertInertia(fn ($page) => $page->component('Auth/Login'));
    }

    public function test_user_can_login_with_valid_credentials(): void
    {
        $response = $this->post('/login', [
            'email' => 'asisten@ptpn.test',
            'password' => 'password123',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticatedAs($this->user);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        $response = $this->post('/login', [
            'email' => 'asisten@ptpn.test',
            'password' => 'wrongpassword',
        ]);

        $response->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_login_fails_for_inactive_user(): void
    {
        $inactive = $this->createActiveUser('inactive@ptpn.test', 'password123', isActive: false);

        $response = $this->post('/login', [
            'email' => 'inactive@ptpn.test',
            'password' => 'password123',
        ]);

        $response->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_login_requires_email_and_password(): void
    {
        $response = $this->post('/login', []);

        $response->assertSessionHasErrors(['email', 'password']);
    }

    public function test_authenticated_user_is_redirected_from_login(): void
    {
        $response = $this->actingAs($this->user)->get('/login');

        $response->assertRedirect('/');
    }

    public function test_logout_clears_session(): void
    {
        $this->actingAs($this->user);

        $response = $this->post('/logout');

        $response->assertRedirect('/login');
        $this->assertGuest();
    }

    public function test_inertia_shared_auth_prop_contains_user(): void
    {
        $response = $this->actingAs($this->user)->get('/');

        $response->assertInertia(fn ($page) =>
            $page->has('auth.user')
                ->where('auth.user.email', 'asisten@ptpn.test')
                ->where('auth.user.roleType', 'ASISTEN')
        );
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private function createActiveUser(string $email, string $password, bool $isActive = true): User
    {
        $dir = Directorate::firstOrCreate(
            ['code' => 'DIR-TEST'],
            ['name' => 'Direktorat Test', 'description' => null]
        );

        $unit = OrganizationalUnit::firstOrCreate(
            ['code' => 'UNIT-TEST'],
            ['name' => 'Unit Test', 'unitType' => 'DIVISI', 'directorateId' => $dir->id, 'parentId' => null]
        );

        return User::create([
            'name'          => 'Test User',
            'email'         => $email,
            'passwordHash'  => Hash::make($password),
            'roleType'      => 'ASISTEN',
            'isActive'      => $isActive,
            'unitId'        => $unit->id,
            'directorateId' => $dir->id,
        ]);
    }
}
