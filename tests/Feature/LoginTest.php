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
        $this->user = $this->createActiveUser(
            email: 'asisten@ptpn.test',
            password: 'password123',
            nik: '8005835',
            userId: 'alif.nrmdhn',
        );
    }

    public function test_login_page_renders(): void
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
        $response->assertInertia(fn ($page) => $page->component('Auth/Login'));
    }

    public function test_user_can_login_with_nik(): void
    {
        $response = $this->post('/login', [
            'identifier' => '8005835',
            'password' => 'password123',
        ]);

        $response->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($this->user);
    }

    public function test_user_can_login_with_user_id(): void
    {
        $response = $this->post('/login', [
            'identifier' => 'alif.nrmdhn',
            'password' => 'password123',
        ]);

        $response->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($this->user);
    }

    public function test_user_cannot_login_with_email(): void
    {
        $response = $this->post('/login', [
            'identifier' => 'asisten@ptpn.test',
            'password' => 'password123',
        ]);

        $response->assertSessionHasErrors('identifier');
        $this->assertGuest();
    }

    public function test_login_fails_with_wrong_password(): void
    {
        $response = $this->post('/login', [
            'identifier' => '8005835',
            'password' => 'wrongpassword',
        ]);

        $response->assertSessionHasErrors('identifier');
        $this->assertGuest();
    }

    public function test_login_fails_for_inactive_user(): void
    {
        $this->createActiveUser(
            email: 'inactive@ptpn.test',
            password: 'password123',
            nik: '9999999',
            isActive: false,
        );

        $response = $this->post('/login', [
            'identifier' => '9999999',
            'password' => 'password123',
        ]);

        $response->assertSessionHasErrors('identifier');
        $this->assertGuest();
    }

    public function test_login_requires_identifier_and_password(): void
    {
        $response = $this->post('/login', []);

        $response->assertSessionHasErrors(['identifier', 'password']);
    }

    public function test_authenticated_user_is_redirected_from_login(): void
    {
        $response = $this->actingAs($this->user)->get('/login');

        $response->assertRedirect('/dashboard');
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

    private function createActiveUser(
        string $email,
        string $password,
        ?string $nik = null,
        ?string $userId = null,
        bool $isActive = true,
    ): User {
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
            'nik'           => $nik,
            'userId'        => $userId,
            'passwordHash'  => Hash::make($password),
            'roleType'      => 'ASISTEN',
            'isActive'      => $isActive,
            'unitId'        => $unit->id,
            'directorateId' => $dir->id,
        ]);
    }
}
