<?php

namespace Tests\Unit;

use App\Support\RolePolicy;
use PHPUnit\Framework\TestCase;

class RolePolicyTest extends TestCase
{
    // ── isAdminOrAbove ─────────────────────────────────────────────────────

    public function test_superadmin_is_admin_or_above(): void
    {
        $this->assertTrue(RolePolicy::isAdminOrAbove('SUPERADMIN'));
        $this->assertTrue(RolePolicy::isAdminOrAbove('superadmin'));
    }

    public function test_admin_is_admin_or_above(): void
    {
        $this->assertTrue(RolePolicy::isAdminOrAbove('ADMIN'));
    }

    public function test_bod_is_not_admin_or_above(): void
    {
        $this->assertFalse(RolePolicy::isAdminOrAbove('BOD'));
    }

    public function test_kadiv_is_not_admin_or_above(): void
    {
        $this->assertFalse(RolePolicy::isAdminOrAbove('KADIV'));
    }

    public function test_null_role_is_not_admin_or_above(): void
    {
        $this->assertFalse(RolePolicy::isAdminOrAbove(null));
    }

    // ── canCreateProgram ───────────────────────────────────────────────────

    public function test_asisten_can_create_program(): void
    {
        $this->assertTrue(RolePolicy::canCreateProgram('ASISTEN'));
    }

    public function test_kadiv_can_create_program(): void
    {
        $this->assertTrue(RolePolicy::canCreateProgram('KADIV'));
    }

    public function test_officer_cannot_create_program(): void
    {
        $this->assertFalse(RolePolicy::canCreateProgram('OFFICER'));
    }

    public function test_bod_cannot_create_program(): void
    {
        $this->assertFalse(RolePolicy::canCreateProgram('BOD'));
    }

    // ── isReadOnly ─────────────────────────────────────────────────────────

    public function test_bod_is_read_only(): void
    {
        $this->assertTrue(RolePolicy::isReadOnly('BOD'));
    }

    public function test_officer_is_read_only(): void
    {
        $this->assertTrue(RolePolicy::isReadOnly('OFFICER'));
    }

    public function test_kadiv_is_not_read_only(): void
    {
        $this->assertFalse(RolePolicy::isReadOnly('KADIV'));
    }

    // ── canEditProgram ─────────────────────────────────────────────────────

    public function test_admin_can_edit_any_program(): void
    {
        $this->assertTrue(RolePolicy::canEditProgram('ADMIN', false));
    }

    public function test_kadiv_can_edit_any_program(): void
    {
        $this->assertTrue(RolePolicy::canEditProgram('KADIV', false));
    }

    public function test_asisten_can_edit_own_program(): void
    {
        $this->assertTrue(RolePolicy::canEditProgram('ASISTEN', true));
    }

    public function test_asisten_cannot_edit_others_program(): void
    {
        $this->assertFalse(RolePolicy::canEditProgram('ASISTEN', false));
    }

    public function test_officer_cannot_edit_any_program(): void
    {
        $this->assertFalse(RolePolicy::canEditProgram('OFFICER', true));
    }

    // ── canEditProgram — in-revision (post-rejection) ──────────────────────

    public function test_in_revision_kadiv_cannot_edit_others_program(): void
    {
        // Setelah KADIV menolak program PIC, dia "step back" — tidak boleh
        // edit sendiri program yang menunggu PIC perbaiki.
        $this->assertFalse(RolePolicy::canEditProgram('KADIV', false, true));
    }

    public function test_in_revision_owner_can_still_edit(): void
    {
        $this->assertTrue(RolePolicy::canEditProgram('ASISTEN', true, true));
        $this->assertTrue(RolePolicy::canEditProgram('KASUBDIV', true, true));
    }

    public function test_in_revision_admin_retains_override(): void
    {
        $this->assertTrue(RolePolicy::canEditProgram('ADMIN', false, true));
        $this->assertTrue(RolePolicy::canEditProgram('SUPERADMIN', false, true));
    }

    public function test_in_revision_non_owner_blocked(): void
    {
        $this->assertFalse(RolePolicy::canEditProgram('KASUBDIV', false, true));
        $this->assertFalse(RolePolicy::canEditProgram('ASISTEN', false, true));
    }

    // ── canViewAllEntities ─────────────────────────────────────────────────

    public function test_superadmin_can_view_all(): void
    {
        $this->assertTrue(RolePolicy::canViewAllEntities('SUPERADMIN'));
    }

    public function test_bod_can_view_all(): void
    {
        $this->assertTrue(RolePolicy::canViewAllEntities('BOD'));
    }

    public function test_asisten_cannot_view_all(): void
    {
        $this->assertFalse(RolePolicy::canViewAllEntities('ASISTEN'));
    }
}
